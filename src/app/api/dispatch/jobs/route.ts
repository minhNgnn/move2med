import { eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import { handle, requireUser } from "@/lib/api";
import { checkPrescription, type ReasonCode } from "@/lib/rules";
import { approvalStatus } from "@/lib/domain";

export const GET = handle(async () => {
  const s = await requireUser(["dispatcher"]);
  const rows = await db
    .select({ ride: schema.rides, rx: schema.prescriptions, p: schema.patients })
    .from(schema.rides)
    .innerJoin(schema.prescriptions, eq(schema.rides.prescriptionId, schema.prescriptions.id))
    .innerJoin(schema.patients, eq(schema.prescriptions.patientId, schema.patients.id))
    .where(eq(schema.rides.companyId, s.companyId ?? "none"));
  const vehicles = await db.select().from(schema.vehicles).where(eq(schema.vehicles.companyId, s.companyId ?? "none"));
  const users = await db.select().from(schema.users).where(eq(schema.users.companyId, s.companyId ?? "none"));
  const proofs = rows.length ? await db.select().from(schema.proofs).where(inArray(schema.proofs.rideId, rows.map((r) => r.ride.id))) : [];
  const rxFlags = new Map<string, ReturnType<typeof checkPrescription>>();
  for (const { rx, p } of rows) {
    if (!rxFlags.has(rx.id))
      rxFlags.set(rx.id, checkPrescription({
        reasonCode: rx.reasonCode as ReasonCode, data: rx.data, justification: rx.justification, exemption: p.exemption,
        billed: { zuzahlung: rx.copayOverride ?? p.billing.zuzahlung, gesamt_brutto: p.billing.gesamt_brutto },
        approval: { required: rx.approvalRequired, status: approvalStatus(rx) },
      }));
  }
  return {
    rides: rows
      .map(({ ride, rx, p }) => {
        const proof = proofs.find((x) => x.rideId === ride.id);
        return {
          ...ride,
          scenario: rx.data.szenario, patient: p.name, weightKg: rx.data.sonstiges.gewicht_kg ?? null, series: !!rx.data.behandlung.haeufigkeit,
          vehicleLabel: vehicles.find((v) => v.id === ride.vehicleId)?.label ?? null,
          driverName: users.find((u) => u.id === ride.driverId)?.name ?? null,
          proof: proof ? { status: proof.status, method: proof.method, flags: proof.flags, tapTime: proof.tapTime } : null,
          flags: rxFlags.get(rx.id) ?? [],
        };
      })
      .sort((a, b) => (a.scheduledDate + a.pickupTime).localeCompare(b.scheduledDate + b.pickupTime)),
  };
});
