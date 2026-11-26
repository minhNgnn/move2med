import { eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import { handle, requireUser } from "@/lib/api";

/** Proofs that need a human decision: flagged (clock, revoked device, changed ride...) rather than silently dropped. */
export const GET = handle(async () => {
  await requireUser(["insurer"]);
  const rows = await db
    .select({ proof: schema.proofs, ride: schema.rides })
    .from(schema.proofs)
    .innerJoin(schema.rides, eq(schema.proofs.rideId, schema.rides.id))
    .where(inArray(schema.proofs.status, ["needs_review", "rejected"]));
  const companies = await db.select().from(schema.companies);
  return {
    items: rows.map(({ proof, ride }) => ({
      id: proof.id, rideId: ride.id, leg: ride.leg, date: ride.scheduledDate, company: companies.find((c) => c.id === ride.companyId)?.name,
      method: proof.method, status: proof.status, flags: proof.flags, tapTime: proof.tapTime, note: proof.reviewNote,
    })),
  };
});
