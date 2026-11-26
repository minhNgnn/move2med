import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { handle, HttpError, requireUser, audit } from "@/lib/api";

/** Remote wipe: the phone deletes its encrypted data at its next connection. */
export const POST = handle(async (_req, ctx) => {
  const s = await requireUser(["dispatcher"]);
  const { id } = await ctx.params;
  const res = await db
    .update(schema.devices)
    .set({ status: "revoked", revokedAt: new Date() })
    .where(and(eq(schema.devices.id, id), eq(schema.devices.companyId, s.companyId ?? "none")))
    .returning();
  if (!res.length) throw new HttpError(404, "Not found");
  await audit({ actorType: "user", actorId: s.uid, actorName: s.name, companyId: s.companyId, action: "device.revoke", detail: { device: res[0].label } });
  return { ok: true };
});
