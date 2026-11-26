import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { handle, HttpError, requireUser, audit } from "@/lib/api";
import { proofChecks } from "@/lib/domain";

/** Re-check every layer of every proof in a submission. Nothing is taken on trust from the transport company. */
export const POST = handle(async (_req, ctx) => {
  const s = await requireUser(["insurer"]);
  const { id } = await ctx.params;
  const [sub] = await db.select().from(schema.billingSubmissions).where(eq(schema.billingSubmissions.id, id));
  if (!sub) throw new HttpError(404, "Not found");
  const results = [];
  let allOk = true;
  for (const rideId of sub.rideIds) {
    const [ride] = await db.select().from(schema.rides).where(eq(schema.rides.id, rideId));
    const checks = await proofChecks(rideId);
    const ok = !!checks && checks.patientLayer.ok && checks.deviceLayer.ok && checks.gatewayLayer.ok && checks.status === "verified";
    if (!ok) allOk = false;
    results.push({ rideId, leg: ride?.leg, date: ride?.scheduledDate, ok, checks });
  }
  await db.update(schema.billingSubmissions).set({ status: allOk ? "verified" : "rejected", verifiedAt: new Date() }).where(eq(schema.billingSubmissions.id, id));
  await audit({ actorType: "user", actorId: s.uid, actorName: s.name, companyId: sub.companyId, action: allOk ? "billing.verified" : "billing.rejected", detail: { submission: id, rides: sub.rideIds.length } });
  return { allOk, results };
});
