import { z } from "zod";
import { eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import { handle, HttpError, requireUser, audit } from "@/lib/api";
import { uid } from "@/lib/server-crypto";
import { billingCandidates } from "@/lib/billing";

/** Only rides with a verified three-layer proof and no blocking rule error can be billed. */
export const POST = handle(async (req) => {
  const s = await requireUser(["dispatcher"]);
  const { rideIds } = z.object({ rideIds: z.array(z.string()).optional() }).parse(await req.json().catch(() => ({})));
  const cid = s.companyId ?? "none";
  const [company] = await db.select().from(schema.companies).where(eq(schema.companies.id, cid));
  const eligible = (await billingCandidates(cid)).filter((c) => c.eligible && (!rideIds || rideIds.includes(c.ride.id)));
  if (!eligible.length) throw new HttpError(409, "No ride is ready to bill yet.", "nothing_to_bill");
  const vehicles = await db.select().from(schema.vehicles).where(eq(schema.vehicles.companyId, cid));

  const items = eligible.map(({ ride, rx, p, proof }) => ({
    rideId: ride.id, prescriptionId: rx.id, date: ride.scheduledDate, leg: ride.leg,
    from: `${ride.fromAddr.strasse}, ${ride.fromAddr.plz} ${ride.fromAddr.ort}`, to: `${ride.toAddr.strasse}, ${ride.toAddr.plz} ${ride.toAddr.ort}`,
    vehicle: { type: ride.vehicleType, equipment: ride.equipment, plate: vehicles.find((v) => v.id === ride.vehicleId)?.plate ?? null },
    insured: { kvnr: p.kvnr, insurerIk: p.insurerIk },
    positionsnummer: p.billing.positionsnummer, anzahl: 1,
    km: p.billing.km / 2, brutto: p.billing.gesamt_brutto / 2, zuzahlung: (rx.copayOverride ?? p.billing.zuzahlung) / 2,
    belegnummer: `${p.billing.belegnummer}-${ride.leg}`, rechnungsnummer: p.billing.rechnungsnummer,
    proof: { method: proof!.method, tapTime: proof!.tapTime, popToken: proof!.tokenJws, deviceSignature: proof!.deviceSig, gatewayCountersignature: proof!.gatewaySig, eventId: proof!.eventId },
  }));
  const totals = {
    brutto: items.reduce((a, i) => a + i.brutto, 0),
    copay: items.reduce((a, i) => a + i.zuzahlung, 0),
    km: items.reduce((a, i) => a + i.km, 0),
  };
  const id = uid("bill");
  await db.insert(schema.billingSubmissions).values({
    id, companyId: cid, rideIds: items.map((i) => i.rideId),
    payload: { format: "move2med-billing/1 (stand-in for §302 SGB V / TP5)", company: { name: company.name, ik: company.ik }, items, totals },
  });
  await db.update(schema.rides).set({ billingId: id }).where(inArray(schema.rides.id, items.map((i) => i.rideId)));
  await audit({ actorType: "user", actorId: s.uid, actorName: s.name, companyId: cid, action: "billing.submit", detail: { submission: id, rides: items.length } });
  return { ok: true, id, rides: items.length, totals };
});
