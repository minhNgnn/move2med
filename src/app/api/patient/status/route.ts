import { desc, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import { handle, requirePatient } from "@/lib/api";
import { loadForPatient } from "@/lib/patient";
import { approvalStatus } from "@/lib/domain";

export const GET = handle(async () => {
  const ps = await requirePatient();
  const { rx, p } = await loadForPatient(ps.rx);
  const rides = await db.select().from(schema.rides).where(eq(schema.rides.prescriptionId, rx.id));
  const proofs = rides.length ? await db.select().from(schema.proofs).where(inArray(schema.proofs.rideId, rides.map((r) => r.id))) : [];
  const confirms = rides.length ? await db.select().from(schema.patientConfirmations).where(inArray(schema.patientConfirmations.rideId, rides.map((r) => r.id))) : [];
  const [company] = rx.boundCompanyId ? await db.select().from(schema.companies).where(eq(schema.companies.id, rx.boundCompanyId)) : [];
  const vehicles = await db.select().from(schema.vehicles);
  const messages = await db.select().from(schema.sms).where(eq(schema.sms.prescriptionId, rx.id)).orderBy(desc(schema.sms.id)).limit(30);
  return {
    patient: { name: p.name, insurer: p.insurerName },
    status: rx.status,
    approval: approvalStatus(rx),
    keyStatus: rx.keyStatus,
    company: company ? { name: company.name } : null,
    trip: { scenario: rx.data.szenario, facility: rx.data.behandlung.zieladresse, appointment: rx.data.behandlung.termin_uhrzeit, frequency: rx.data.behandlung.haeufigkeit, hin: rx.data.hinfahrt, rueck: rx.data.rueckfahrt },
    rides: rides
      .map((r) => ({
        id: r.id, leg: r.leg, date: r.scheduledDate, pickupTime: r.pickupTime, status: r.status, pickedUpAt: r.pickedUpAt, completedAt: r.completedAt,
        vehicle: vehicles.find((v) => v.id === r.vehicleId)?.label ?? null,
        proof: proofs.find((x) => x.rideId === r.id)?.status ?? null,
        proofMethod: proofs.find((x) => x.rideId === r.id)?.method ?? null,
        confirmedByRelative: confirms.some((c) => c.rideId === r.id),
      }))
      .sort((a, b) => (a.date + a.pickupTime).localeCompare(b.date + b.pickupTime)),
    messages: messages.map((m) => {
      let t: { en: string; de: string };
      try { t = JSON.parse(m.body); } catch { t = { en: m.body, de: m.body }; }
      return { id: m.id, at: m.at, en: t.en, de: t.de };
    }),
  };
});
