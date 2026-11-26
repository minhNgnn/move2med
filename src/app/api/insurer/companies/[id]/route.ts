import { z } from "zod";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { handle, HttpError, requireUser, audit } from "@/lib/api";

export const PATCH = handle(async (req, ctx) => {
  const s = await requireUser(["insurer"]);
  const { id } = await ctx.params;
  const { status } = z.object({ status: z.enum(["registered", "suspended"]) }).parse(await req.json());
  const res = await db.update(schema.companies).set({ status }).where(eq(schema.companies.id, id)).returning();
  if (!res.length) throw new HttpError(404, "Not found");
  await audit({ actorType: "user", actorId: s.uid, actorName: s.name, companyId: id, action: `company.${status}` });
  return { ok: true };
});
