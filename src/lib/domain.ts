import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Addr } from "@/db/schema";
import { sendSms } from "./api";
import { approvalFor, checkPrescription, expectedCopay, type ReasonCode } from "./rules";
import { keyCodeFor, keyHash, pinFor, sha256hex, signCompact, uid, verifyCompact, verifyDeviceSig } from "./server-crypto";
import { createHmac } from "node:crypto";
import { getSecret, rand } from "./server-crypto";
import type { Flag, TransportData } from "./types";

type Rx = typeof schema.prescriptions.$inferSelect;
type Patient = typeof schema.patients.$inferSelect;
type Ride = typeof schema.rides.$inferSelect;

export const todayStr = () => new Date().toISOString().slice(0, 10);
export const addDays = (d: string, n: number) => new Date(Date.parse(d) + n * 86400000).toISOString().slice(0, 10);
const hm = (min: number) => `${String(Math.floor(min / 60) % 24).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));

export const approvalStatus = (rx: Pick<Rx, "approvalRequired" | "status">) =>
  !rx.approvalRequired ? "none" : rx.status === "pending_approval" ? "pending" : rx.status === "rejected" ? "rejected" : "approved";

// ---------- prescriptions ----------
export async function createPrescription(i: {
  id?: string;
  patientId: number;
  data: TransportData;
  reasonCode: ReasonCode;
  justification: string | null;
  issuedBy: string | null;
}) {
  const id = i.id ?? uid("rx");
  const ap = approvalFor(i.reasonCode, i.data);
  const code = await keyCodeFor(id, 1);
  await db.insert(schema.prescriptions).values({
    id,
    patientId: i.patientId,
    status: ap.required ? "pending_approval" : "ready",
    approvalRequired: ap.required,
    data: i.data,
    reasonCode: i.reasonCode,
    justification: i.justification,
    issuedBy: i.issuedBy,
    keyVersion: 1,
    keyHash: await keyHash(code),
  });
  await sendSms(
    id,
    ap.required
      ? "move2med: Your transport prescription was issued. The insurer is checking it. You will get your ride key with the decision."
      : "move2med: Your transport prescription is ready. Your ride key is on the letter. Give it to a transport company of your choice.",
    ap.required
      ? "move2med: Ihre Krankenfahrt wurde verordnet. Die Krankenkasse prüft sie. Ihren Fahrtschlüssel erhalten Sie mit der Entscheidung."
      : "move2med: Ihre Krankenfahrt ist verordnet. Ihr Fahrtschlüssel steht im Brief. Geben Sie ihn an ein Transportunternehmen Ihrer Wahl.",
  );
  return { id, code, pin: await pinFor(id, 1) };
}

export async function rotateKey(rx: Rx) {
  const version = rx.keyVersion + 1;
  const code = await keyCodeFor(rx.id, version);
  await db
    .update(schema.prescriptions)
    .set({ keyVersion: version, keyHash: await keyHash(code), keyStatus: "active" })
    .where(eq(schema.prescriptions.id, rx.id));
  return { code, pin: await pinFor(rx.id, version) };
}

// ---------- rides ----------
const SERIES_OFFSETS = [0, 2, 4, 7];

function appointmentMinutes(d: TransportData) {
  const n = d.behandlung.bezeichnung.toLowerCase();
  if (n.includes("dialyse")) return 240;
  if (n.includes("chemo")) return 180;
  if (n.includes("strahlen")) return 60;
  return 90;
}

export async function generateRides(rx: Rx, patient: Patient, companyId: string) {
  const d = rx.data;
  const start = todayStr();
  const offsets = d.behandlung.haeufigkeit ? SERIES_OFFSETS : [0];
  const home: Addr = { name: patient.name, ...patient.address };
  const dest: Addr = { name: d.behandlung.zieladresse.einrichtung, ...d.behandlung.zieladresse };
  const back = hm(toMin(d.behandlung.termin_uhrzeit) + appointmentMinutes(d) + (d.sonstiges.wartezeit_min ?? 0));
  const rows: (typeof schema.rides.$inferInsert)[] = [];
  offsets.forEach((off, idx) => {
    const date = addDays(start, off);
    rows.push({
      id: uid("ride"), prescriptionId: rx.id, occurrence: idx + 1, leg: "hin", scheduledDate: date,
      pickupTime: d.behandlung.abholzeit_geplant, fromAddr: home, toAddr: dest,
      vehicleType: d.hinfahrt.befoerderungsart, equipment: d.hinfahrt.ausstattung, companyId, status: "planned",
    });
    rows.push({
      id: uid("ride"), prescriptionId: rx.id, occurrence: idx + 1, leg: "rueck", scheduledDate: date,
      pickupTime: back, fromAddr: dest, toAddr: home,
      vehicleType: d.rueckfahrt.befoerderungsart, equipment: d.rueckfahrt.ausstattung, companyId, status: "planned",
    });
  });
  await db.insert(schema.rides).values(rows);
}

// ---------- trip card ----------
export async function buildTripCard(rx: Rx, patient: Patient, mode: "preview" | "full") {
  const d = rx.data;
  const flags = checkPrescription({
    reasonCode: rx.reasonCode as ReasonCode,
    data: d,
    justification: rx.justification,
    exemption: patient.exemption,
    billed: { zuzahlung: rx.copayOverride ?? patient.billing.zuzahlung, gesamt_brutto: patient.billing.gesamt_brutto },
    approval: { required: rx.approvalRequired, status: approvalStatus(rx) },
  });
  const full = mode === "full";
  return {
    prescriptionId: rx.id,
    mode,
    keyStatus: rx.keyStatus,
    approval: { required: rx.approvalRequired, status: approvalStatus(rx) },
    patient: full
      ? { name: patient.name, birthdate: patient.birthdate, phone: patient.phone, address: patient.address }
      : { name: null, birthdate: null, phone: null, address: { strasse: "", plz: patient.address.plz, ort: patient.address.ort } },
    treatment: {
      name: d.behandlung.bezeichnung,
      appointment: d.behandlung.termin_uhrzeit,
      pickup: d.behandlung.abholzeit_geplant,
      facility: full ? d.behandlung.zieladresse : { einrichtung: d.behandlung.zieladresse.einrichtung, strasse: "", plz: d.behandlung.zieladresse.plz, ort: d.behandlung.zieladresse.ort },
      frequency: d.behandlung.haeufigkeit,
      until: d.behandlung.bis_voraussichtlich,
    },
    hin: d.hinfahrt,
    rueck: d.rueckfahrt,
    sonstiges: d.sonstiges,
    reasonCode: rx.reasonCode,
    // The company learns THAT a justification exists, never the medical text itself.
    hasJustification: !!rx.justification,
    copay: {
      exempt: patient.exemption.status,
      expected: expectedCopay({ brutto: patient.billing.gesamt_brutto, exempt: patient.exemption.status, unfall: d.unfallbezug }).amount,
    },
    unfallbezug: d.unfallbezug,
    flags,
    boundCompanyId: rx.boundCompanyId,
  };
}

// ---------- driver payload ----------
export async function rideNonce(rideId: string) {
  const secret = await getSecret("hmac:ride-nonce", () => rand(32));
  return createHmac("sha256", secret).update(rideId).digest("hex").slice(0, 16);
}

export async function driverRidesFor(userId: string) {
  const from = todayStr();
  const to = addDays(from, 2);
  const rows = await db
    .select({ ride: schema.rides, rx: schema.prescriptions, patient: schema.patients, vehicle: schema.vehicles })
    .from(schema.rides)
    .innerJoin(schema.prescriptions, eq(schema.rides.prescriptionId, schema.prescriptions.id))
    .innerJoin(schema.patients, eq(schema.prescriptions.patientId, schema.patients.id))
    .leftJoin(schema.vehicles, eq(schema.rides.vehicleId, schema.vehicles.id))
    .where(and(eq(schema.rides.driverId, userId), sql`${schema.rides.scheduledDate} between ${from} and ${to}`, sql`${schema.rides.status} <> 'cancelled'`));
  const proofRows = rows.length
    ? await db.select().from(schema.proofs).where(inArray(schema.proofs.rideId, rows.map((r) => r.ride.id)))
    : [];
  const out = [];
  for (const r of rows) {
    const proof = proofRows.find((p) => p.rideId === r.ride.id);
    out.push({
      id: r.ride.id,
      prescriptionId: r.ride.prescriptionId,
      leg: r.ride.leg,
      date: r.ride.scheduledDate,
      pickupTime: r.ride.pickupTime,
      status: r.ride.status,
      from: r.ride.fromAddr,
      to: r.ride.toAddr,
      patient: { name: r.patient.name, phone: r.patient.phone },
      vehicleType: r.ride.vehicleType,
      equipment: r.ride.equipment,
      vehicleLabel: r.vehicle?.label ?? null,
      weightKg: r.rx.data.sonstiges.gewicht_kg ?? null,
      waitMin: r.ride.waitMin ?? r.rx.data.sonstiges.wartezeit_min ?? null,
      shared: !!r.rx.data.sonstiges.gemeinschaftsfahrt,
      copay: {
        exempt: r.patient.exemption.status,
        amount: expectedCopay({ brutto: r.patient.billing.gesamt_brutto, exempt: r.patient.exemption.status, unfall: r.rx.data.unfallbezug }).amount,
      },
      nonce: await rideNonce(r.ride.id),
      proof: proof ? { status: proof.status, method: proof.method } : null,
    });
  }
  return out.sort((a, b) => (a.date + a.pickupTime).localeCompare(b.date + b.pickupTime));
}

// ---------- events and proofs ----------
export type IncomingEvent = { id: string; rideId: string; type: string; payload: string; signature: string };

const BLOCKING = new Set(["late_sync", "clock_mismatch", "gps_time_mismatch", "ride_changed", "device_revoked", "bad_signature", "pin_wrong", "wrong_challenge"]);
const SKEW_MS = 5 * 60 * 1000;
const LATE_SYNC_MS = 24 * 3600 * 1000;

async function mintPoppToken(rx: Rx, patient: Patient, companyIk: string, tapTime: Date, method: string) {
  return signCompact("popp", {
    proofMethod: method === "card_tap" ? "ehc-nfc-mock" : method === "pin" ? "letter-pin-mock" : "proxy-link-mock",
    patientProofTime: String(Math.floor(tapTime.getTime() / 1000)),
    iat: String(Math.floor(Date.now() / 1000)),
    patientId: patient.kvnr,
    insurerId: patient.insurerIk,
    actorId: companyIk,
    actorProfessionOid: "1.2.276.0.76.4.mock-transport",
  });
}

export async function gatewayCountersign(payload: string, deviceSig: string, token: string) {
  return signCompact("gateway", { h: sha256hex(`${payload}|${deviceSig}|${token}`), at: new Date().toISOString() });
}

/** Evaluate (or re-evaluate) the proof of one ride from its stored tap event. */
export async function evaluateProof(rideId: string) {
  const [ride] = await db.select().from(schema.rides).where(eq(schema.rides.id, rideId));
  if (!ride) return;
  const [ev] = await db.select().from(schema.rideEvents).where(and(eq(schema.rideEvents.rideId, rideId), eq(schema.rideEvents.type, "tap"))).orderBy(desc(schema.rideEvents.receivedAt)).limit(1);
  if (!ev) return;
  const [rx] = await db.select().from(schema.prescriptions).where(eq(schema.prescriptions.id, ride.prescriptionId));
  const [patient] = await db.select().from(schema.patients).where(eq(schema.patients.id, rx.patientId));
  const [company] = await db.select().from(schema.companies).where(eq(schema.companies.id, ride.companyId));
  const p = JSON.parse(ev.payload) as { method: string; challenge?: string; pinCheck?: string };
  const flags = [...ev.flags];
  const tapTime = ev.anchoredTime ?? ev.deviceTime;
  let status: "verified" | "needs_review" | "rejected" = "verified";
  let token: string | null = null;

  if (!ev.sigValid) flags.push("bad_signature");
  if (p.challenge !== (await rideNonce(rideId))) flags.push("wrong_challenge");
  if (p.method === "pin") {
    const expected = await pinFor(rx.id, rx.keyVersion);
    if (p.pinCheck !== sha256hex(expected + ev.id)) flags.push("pin_wrong");
  }
  const existing = await db.select().from(schema.proofs).where(eq(schema.proofs.rideId, rideId));
  let awaiting = false;
  if (p.method === "proxy") {
    const [c] = await db.select().from(schema.patientConfirmations).where(eq(schema.patientConfirmations.rideId, rideId)).limit(1);
    if (!c) awaiting = true;
  }
  const uniqueFlags = [...new Set(flags)];
  if (uniqueFlags.includes("bad_signature") || uniqueFlags.includes("pin_wrong") || uniqueFlags.includes("wrong_challenge")) status = "rejected";
  else if (uniqueFlags.some((f) => BLOCKING.has(f))) status = "needs_review";

  if (!awaiting && status !== "rejected") token = await mintPoppToken(rx, patient, company.ik, tapTime, p.method);
  const gatewaySig = token ? await gatewayCountersign(ev.payload, ev.signature, token) : null;
  const finalStatus = awaiting ? "awaiting" : status;

  const row = {
    rideId, eventId: ev.id, method: p.method, tokenJws: token, deviceSig: ev.signature, gatewaySig,
    status: finalStatus, flags: uniqueFlags, tapTime,
  };
  if (existing.length) {
    // Never downgrade an approved review by re-evaluating.
    if (existing[0].status === "verified" && finalStatus !== "verified" && existing[0].reviewNote) return;
    await db.update(schema.proofs).set(row).where(eq(schema.proofs.rideId, rideId));
  } else {
    await db.insert(schema.proofs).values({ id: uid("proof"), ...row });
  }
}

export async function ingestEvents(device: typeof schema.devices.$inferSelect, events: IncomingEvent[]) {
  const acked: string[] = [];
  for (const e of events) {
    const [dup] = await db.select({ id: schema.rideEvents.id }).from(schema.rideEvents).where(eq(schema.rideEvents.id, e.id));
    if (dup) { acked.push(e.id); continue; }
    let parsed: { id?: string; rideId?: string; type?: string; deviceTime?: string; anchoredTime?: string | null; gps?: { lat: number; lon: number; acc?: number; t?: number } | null; waitMin?: number };
    try { parsed = JSON.parse(e.payload); } catch { acked.push(e.id); continue; }
    const flags: string[] = [];
    const sigValid = (await verifyDeviceSig(device.publicJwk, e.payload, e.signature)) && parsed.id === e.id && parsed.rideId === e.rideId;
    const [ride] = await db.select().from(schema.rides).where(eq(schema.rides.id, e.rideId));
    if (!ride || ride.companyId !== device.companyId) { acked.push(e.id); continue; }

    const deviceTime = new Date(parsed.deviceTime ?? Date.now());
    const anchored = parsed.anchoredTime ? new Date(parsed.anchoredTime) : null;
    if (!sigValid) flags.push("bad_signature");
    if (device.status === "revoked" && (!device.revokedAt || deviceTime > device.revokedAt)) flags.push("device_revoked");
    if (anchored && Math.abs(anchored.getTime() - deviceTime.getTime()) > SKEW_MS) flags.push("clock_mismatch");
    if (parsed.gps?.t && Math.abs(parsed.gps.t - (anchored ?? deviceTime).getTime()) > SKEW_MS) flags.push("gps_time_mismatch");
    if (!parsed.gps) flags.push("no_gps");
    // Evidence that reaches us more than 24 h after it happened is not rejected, but a human looks at it.
    if (Date.now() - (anchored ?? deviceTime).getTime() > LATE_SYNC_MS) flags.push("late_sync");
    if (ride.status === "cancelled" || (ride.driverId && ride.driverId !== device.userId)) flags.push("ride_changed");

    await db.insert(schema.rideEvents).values({
      id: e.id, rideId: e.rideId, deviceId: device.id, type: e.type, payload: e.payload, signature: e.signature,
      deviceTime, anchoredTime: anchored, sigValid, flags, gps: parsed.gps ?? null,
    });
    acked.push(e.id);

    const at = anchored ?? deviceTime;
    const blocked = flags.some((f) => BLOCKING.has(f));
    if (!blocked) {
      if (e.type === "pickup" && ["planned", "assigned"].includes(ride.status)) {
        await db.update(schema.rides).set({ status: "picked_up", pickedUpAt: at }).where(eq(schema.rides.id, ride.id));
        await notifyRide(ride, "pickup");
      } else if (e.type === "dropoff" && ride.status !== "completed") {
        await db.update(schema.rides).set({ status: "completed", completedAt: at }).where(eq(schema.rides.id, ride.id));
        await notifyRide(ride, "dropoff");
      } else if (e.type === "wait" && typeof parsed.waitMin === "number") {
        await db.update(schema.rides).set({ waitMin: parsed.waitMin }).where(eq(schema.rides.id, ride.id));
      }
    }
    if (e.type === "tap") await evaluateProof(ride.id);
    await db.insert(schema.auditLog).values({
      actorType: "device", actorId: device.id, actorName: device.label, companyId: device.companyId, action: `ride.${e.type}`,
      prescriptionId: ride.prescriptionId, rideId: ride.id, detail: { flags, sigValid },
    });
  }
  return acked;
}

async function notifyRide(ride: Ride, kind: "pickup" | "dropoff") {
  const hh = new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Berlin" });
  const leg = ride.leg === "hin" ? "outbound" : "return";
  const legDe = ride.leg === "hin" ? "Hinfahrt" : "Rückfahrt";
  await sendSms(
    ride.prescriptionId,
    kind === "pickup" ? `move2med: Picked up at ${hh} (${leg} ride).` : `move2med: Arrived at ${hh}. Your ${leg} ride is complete.`,
    kind === "pickup" ? `move2med: Um ${hh} abgeholt (${legDe}).` : `move2med: Um ${hh} angekommen. Ihre ${legDe} ist abgeschlossen.`,
  );
}

// ---------- billing ----------
export async function proofChecks(rideId: string) {
  const [proof] = await db.select().from(schema.proofs).where(eq(schema.proofs.rideId, rideId));
  const [ride] = await db.select().from(schema.rides).where(eq(schema.rides.id, rideId));
  if (!proof || !ride) return null;
  const [ev] = await db.select().from(schema.rideEvents).where(eq(schema.rideEvents.id, proof.eventId));
  const [device] = await db.select().from(schema.devices).where(eq(schema.devices.id, ev.deviceId));
  const [rx] = await db.select().from(schema.prescriptions).where(eq(schema.prescriptions.id, ride.prescriptionId));
  const [patient] = await db.select().from(schema.patients).where(eq(schema.patients.id, rx.patientId));
  const [company] = await db.select().from(schema.companies).where(eq(schema.companies.id, ride.companyId));
  const claims = proof.tokenJws ? await verifyCompact<Record<string, string>>("popp", proof.tokenJws) : null;
  const tapSec = String(Math.floor(proof.tapTime.getTime() / 1000));
  const gw = proof.gatewaySig ? await verifyCompact<{ h: string }>("gateway", proof.gatewaySig) : null;
  const deviceOk = await verifyDeviceSig(device.publicJwk, ev.payload, proof.deviceSig);
  return {
    patientLayer: {
      ok: !!claims && claims.patientId === patient.kvnr && claims.insurerId === patient.insurerIk && claims.actorId === company.ik && claims.patientProofTime === tapSec,
      detail: claims ? { method: claims.proofMethod, patientId: claims.patientId, insurerId: claims.insurerId, actorId: claims.actorId, time: claims.patientProofTime } : null,
    },
    deviceLayer: { ok: deviceOk && !(device.status === "revoked" && device.revokedAt && ev.deviceTime > device.revokedAt), detail: { device: device.label, status: device.status } },
    gatewayLayer: { ok: !!gw && !!proof.tokenJws && gw.h === sha256hex(`${ev.payload}|${proof.deviceSig}|${proof.tokenJws}`), detail: null },
    status: proof.status,
    flags: proof.flags,
  };
}

/**
 * A status lifecycle aligned to FHIR Task (the same resource the eRezept workflow uses), derived from our own states,
 * so a later move onto the TIFlow Fachdienst does not change what the interface says.
 */
export function workflowStatus(rx: Pick<Rx, "status" | "boundCompanyId">, rides: { status: string }[]) {
  if (rx.status === "cancelled") return "cancelled";
  if (rx.status === "rejected") return "rejected";
  if (rx.status === "pending_approval") return "requested";
  const live = rides.filter((r) => r.status !== "cancelled");
  if (!rx.boundCompanyId) return "ready";
  if (live.length && live.every((r) => r.status === "completed")) return "completed";
  if (live.some((r) => r.status === "picked_up" || r.status === "completed")) return "in-progress";
  return "accepted";
}
