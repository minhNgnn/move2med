import { and, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db";

/** Close pending cancellation requests when the ride starts or is cancelled, or the key is revoked or reassigned. */
export async function closePendingRequests(by: { rideIds?: string[]; prescriptionId?: string }, reason: string) {
  const cond = by.rideIds?.length
    ? inArray(schema.cancellationRequests.rideId, by.rideIds)
    : by.prescriptionId
      ? eq(schema.cancellationRequests.prescriptionId, by.prescriptionId)
      : null;
  if (!cond) return;
  await db.update(schema.cancellationRequests).set({ state: "closed", closedReason: reason, decidedAt: new Date() }).where(and(cond, eq(schema.cancellationRequests.state, "pending")));
}
