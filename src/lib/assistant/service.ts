import { and, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import { audit, HttpError, rateLimit, sendSms } from "../api";
import { approvalStatus } from "../domain";
import { readSession, signSession, uid } from "../server-crypto";
import { berlinInstant, berlinToday } from "../time";
import { getModel, ModelUnavailable, type Intent, type Lang } from "./model";
import { R, sms, type CompanyLite, type RideLite } from "./templates";

export const MAX_TEXT = 300;
const CUTOFF_MS = 2 * 3600 * 1000;
const MAX_PENDING = 3;

export type AssistantInput = {
  rxId: string;
  lang: Lang;
  text?: string;
  button?: "next" | "driver" | "cancel_next";
  answer?: "yes" | "no";
  token?: string;
  pick?: string;
};
export type AssistantReply = {
  reply: string;
  kind: "status" | "readback" | "clarify" | "requested" | "refused" | "pointer" | "unknown" | "unavailable" | "info";
  token?: string;
  options?: { label: string; token: string }[];
};

type RideRow = typeof schema.rides.$inferSelect;

async function mintToken(rxId: string, rideId: string) {
  return signSession({ purpose: "assistant-cancel", rx: rxId, rideId }, "3m");
}
async function readToken(token: string | undefined, rxId: string) {
  if (!token) return null;
  const p = await readSession<{ purpose?: string; rx?: string; rideId?: string }>(token);
  return p && p.purpose === "assistant-cancel" && p.rx === rxId && p.rideId ? p.rideId : null;
}

const lite = (r: RideRow, vehicle: string | null): RideLite => ({ date: r.scheduledDate, pickupTime: r.pickupTime, leg: r.leg, status: r.status, vehicle });

export async function handleAssistant(i: AssistantInput): Promise<AssistantReply> {
  rateLimit(`assistant:${i.rxId}`, 20, 10 * 60_000);
  const lang = i.lang;
  const [rx] = await db.select().from(schema.prescriptions).where(eq(schema.prescriptions.id, i.rxId));
  if (!rx) throw new HttpError(404, "Not found");
  const company: CompanyLite = rx.boundCompanyId
    ? await db.select().from(schema.companies).where(eq(schema.companies.id, rx.boundCompanyId)).then(([c]) => (c ? { name: c.name, phone: c.phone } : null))
    : null;
  const allRides = await db.select().from(schema.rides).where(eq(schema.rides.prescriptionId, rx.id));
  const vehicles = await db.select().from(schema.vehicles);
  const veh = (r: RideRow) => vehicles.find((v) => v.id === r.vehicleId)?.label ?? null;
  const today = berlinToday();
  const upcoming = allRides
    .filter((r) => ["planned", "assigned", "picked_up"].includes(r.status) && r.scheduledDate >= today)
    .sort((a, b) => (a.scheduledDate + a.pickupTime).localeCompare(b.scheduledDate + b.pickupTime));
  const approvalPending = approvalStatus(rx) === "pending";
  const log = (action: string, detail?: Record<string, unknown>) =>
    audit({ actorType: "patient", action, prescriptionId: rx.id, detail }); // outcomes only: never the sentence

  // --- helpers that need the rides above
  const pendingRows = allRides.length
    ? await db.select().from(schema.cancellationRequests).where(and(inArray(schema.cancellationRequests.rideId, allRides.map((r) => r.id)), eq(schema.cancellationRequests.state, "pending")))
    : [];
  const hasPending = (rideId: string) => pendingRows.some((p) => p.rideId === rideId);

  async function readbackFor(ride: RideRow): Promise<AssistantReply> {
    if (ride.status === "picked_up") { await log("assistant.refused", { reason: "started" }); return { kind: "refused", reply: R.started(company, lang) }; }
    if (berlinInstant(ride.scheduledDate, ride.pickupTime).getTime() - Date.now() < CUTOFF_MS) {
      await log("assistant.refused", { reason: "too_close" });
      return { kind: "refused", reply: R.tooClose(company, lang) };
    }
    if (hasPending(ride.id)) { await log("assistant.refused", { reason: "already_pending" }); return { kind: "refused", reply: R.alreadyPending(lang) }; }
    if (pendingRows.length >= MAX_PENDING) { await log("assistant.refused", { reason: "too_many" }); return { kind: "refused", reply: R.tooMany(lang) }; }
    return { kind: "readback", reply: R.readback(lite(ride, veh(ride)), lang), token: await mintToken(rx.id, ride.id) };
  }

  async function createRequest(rideId: string): Promise<AssistantReply> {
    const ride = allRides.find((r) => r.id === rideId);
    if (!ride || !["planned", "assigned"].includes(ride.status)) return { kind: "refused", reply: R.started(company, lang) };
    if (berlinInstant(ride.scheduledDate, ride.pickupTime).getTime() - Date.now() < CUTOFF_MS) return { kind: "refused", reply: R.tooClose(company, lang) };
    if (hasPending(rideId)) return { kind: "refused", reply: R.alreadyPending(lang) };
    if (pendingRows.length >= MAX_PENDING) return { kind: "refused", reply: R.tooMany(lang) };
    await db.insert(schema.cancellationRequests).values({ id: uid("creq"), rideId, prescriptionId: rx.id });
    const m = sms.requested(lite(ride, veh(ride)));
    await sendSms(rx.id, m.en, m.de);
    await log("assistant.cancel_request", { rideId });
    return { kind: "requested", reply: R.requested(lite(ride, veh(ride)), lang) };
  }

  const statusReply = async (driver: boolean): Promise<AssistantReply> => {
    await log("assistant.status");
    const next = upcoming[0];
    if (!next) return { kind: "status", reply: R.noUpcoming(!!rx.boundCompanyId, approvalPending, lang) };
    const l = lite(next, veh(next));
    return { kind: "status", reply: driver ? R.driver(l, company, lang) : R.status(l, company, approvalPending, lang) };
  };

  async function cancelFlow(intent: Intent, firstIfMany: boolean): Promise<AssistantReply> {
    let cand = upcoming.filter((r) => (!intent.day || r.scheduledDate === intent.day) && (!intent.leg || r.leg === intent.leg));
    if (!cand.length) { await log("assistant.refused", { reason: "not_found" }); return { kind: "refused", reply: R.notFound(lang) }; }
    if (cand.length > 1 && !firstIfMany) {
      const options = [];
      for (const r of cand.slice(0, 4)) options.push({ label: R.optionLabel(lite(r, null), lang), token: await mintToken(rx.id, r.id) });
      return { kind: "clarify", reply: R.clarify(cand.length, lang), options };
    }
    return readbackFor(cand[0]);
  }

  // --- 1. the Patient answers a read-back (button or token)
  if (i.pick) {
    const rideId = await readToken(i.pick, rx.id);
    const ride = allRides.find((r) => r.id === rideId);
    return ride ? readbackFor(ride) : { kind: "unknown", reply: R.tokenInvalid(lang) };
  }
  if (i.answer) {
    const rideId = await readToken(i.token, rx.id);
    if (!rideId) return { kind: "unknown", reply: R.tokenInvalid(lang) };
    if (i.answer === "no") { await log("assistant.declined_readback"); return { kind: "info", reply: R.declinedByPatient(lang) }; }
    return createRequest(rideId);
  }

  // --- 2. quick buttons skip the model entirely
  if (i.button === "next") return statusReply(false);
  if (i.button === "driver") return statusReply(true);
  if (i.button === "cancel_next") return cancelFlow({ intent: "cancel", day: null, leg: null }, true);

  // --- 3. a sentence: the model only labels it
  const text = (i.text ?? "").trim();
  if (!text) return { kind: "unknown", reply: R.unknown(lang) };
  if (text.length > MAX_TEXT) return { kind: "refused", reply: R.tooLong(lang) };
  const model = getModel();
  if (!model) { await log("assistant.unavailable", { reason: "no_model" }); return { kind: "unavailable", reply: R.unavailable(lang) }; }
  let intent: Intent;
  try {
    intent = await model.classify(text, { lang, today });
  } catch (e) {
    // Reason only (an HTTP status or an error class): never the sentence, never the key.
    console.warn("assistant model unavailable:", e instanceof Error ? `${e.name}: ${e.message}` : "unknown");
    await log("assistant.unavailable", { reason: "model_error" });
    return { kind: "unavailable", reply: R.unavailable(lang) };
  }
  switch (intent.intent) {
    case "status": return statusReply(false);
    case "cancel": return cancelFlow(intent, false);
    case "revoke_key":
    case "reassign":
    case "cancel_all":
      await log("assistant.pointer", { intent: intent.intent });
      return { kind: "pointer", reply: R.button(intent.intent, lang) };
    case "yes":
    case "no": {
      const rideId = await readToken(i.token, rx.id);
      if (!rideId) return { kind: "info", reply: R.noQuestion(lang) };
      if (intent.intent === "no") { await log("assistant.declined_readback"); return { kind: "info", reply: R.declinedByPatient(lang) }; }
      return createRequest(rideId);
    }
    default:
      await log("assistant.unknown");
      return { kind: "unknown", reply: R.unknown(lang) };
  }
}
