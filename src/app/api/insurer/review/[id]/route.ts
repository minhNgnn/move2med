import { z } from "zod";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { handle, HttpError, requireUser, audit } from "@/lib/api";

export const POST = handle(async (req, ctx) => {
  const s = await requireUser(["insurer"]);
  const { id } = await ctx.params;
  const { decision, note } = z.object({ decision: z.enum(["accept", "reject"]), note: z.string().optional() }).parse(await req.json());
  const [proof] = await db.select().from(schema.proofs).where(eq(schema.proofs.id, id));
  if (!proof) throw new HttpError(404, "Not found");
  if (decision === "accept" && !proof.tokenJws) throw new HttpError(409, "No patient proof to accept");
  await db.update(schema.proofs).set({ status: decision === "accept" ? "verified" : "rejected", reviewNote: note ?? (decision === "accept" ? "Accepted by insurer review" : "Rejected by insurer review") }).where(eq(schema.proofs.id, id));
  await audit({ actorType: "user", actorId: s.uid, actorName: s.name, action: `review.${decision}`, rideId: proof.rideId, detail: { flags: proof.flags, note } });
  return { ok: true };
});
