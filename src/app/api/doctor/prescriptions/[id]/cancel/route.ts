import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { handle, HttpError, requireUser, audit } from "@/lib/api";
import { closePendingRequests } from "@/lib/requests";

export const POST = handle(async (_req, ctx) => {
  const s = await requireUser(["doctor"]);
  const { id } = await ctx.params;
  const [rx] = await db.select().from(schema.prescriptions).where(eq(schema.prescriptions.id, id));
  if (!rx) throw new HttpError(404, "Not found");
  await db.update(schema.prescriptions).set({ status: "cancelled", keyStatus: "revoked" }).where(eq(schema.prescriptions.id, id));
  await closePendingRequests({ prescriptionId: id }, "prescription_cancelled");
  await db.update(schema.rides).set({ status: "cancelled" }).where(eq(schema.rides.prescriptionId, id));
  await audit({ actorType: "user", actorId: s.uid, actorName: s.name, action: "prescription.cancel", prescriptionId: id });
  return { ok: true };
});
