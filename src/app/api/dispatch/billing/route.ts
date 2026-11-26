import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { handle, requireUser } from "@/lib/api";
import { billingCandidates } from "@/lib/billing";

export const GET = handle(async () => {
  const s = await requireUser(["dispatcher"]);
  const items = await billingCandidates(s.companyId ?? "none");
  const past = await db.select().from(schema.billingSubmissions).where(eq(schema.billingSubmissions.companyId, s.companyId ?? "none"));
  return {
    items: items.map((i) => ({
      rideId: i.ride.id, prescriptionId: i.rx.id, date: i.ride.scheduledDate, leg: i.ride.leg, patient: i.p.name, scenario: i.rx.data.szenario,
      proof: i.proof ? { status: i.proof.status, method: i.proof.method } : null, flags: i.flags, eligible: i.eligible,
      brutto: i.p.billing.gesamt_brutto / 2, copay: (i.rx.copayOverride ?? i.p.billing.zuzahlung) / 2, km: i.p.billing.km / 2,
    })),
    submissions: past.map((b) => ({ id: b.id, createdAt: b.createdAt, rides: b.rideIds.length, status: b.status, payload: b.payload })),
  };
});
