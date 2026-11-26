import { z } from "zod";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { handle, HttpError, requireUser, audit, sendSms } from "@/lib/api";

export const POST = handle(async (req, ctx) => {
  const s = await requireUser(["insurer"]);
  const { id } = await ctx.params;
  const { decision, note } = z.object({ decision: z.enum(["approve", "reject"]), note: z.string().optional() }).parse(await req.json());
  const [rx] = await db.select().from(schema.prescriptions).where(eq(schema.prescriptions.id, id));
  if (!rx || !rx.approvalRequired) throw new HttpError(404, "Nothing to approve");
  if (rx.status === "cancelled") throw new HttpError(409, "Prescription was cancelled");
  await db
    .update(schema.prescriptions)
    .set({ status: decision === "approve" ? "ready" : "rejected", approvalDecidedAt: new Date(), approvalNote: note ?? null })
    .where(eq(schema.prescriptions.id, id));
  await sendSms(
    id,
    decision === "approve"
      ? "move2med: Your insurer approved the transport. Your ride key is on the approval letter. Give it to a transport company."
      : `move2med: Your insurer could not approve the transport.${note ? ` Reason: ${note}` : ""}`,
    decision === "approve"
      ? "move2med: Ihre Krankenkasse hat die Fahrt genehmigt. Ihr Fahrtschlüssel steht im Brief. Geben Sie ihn an ein Transportunternehmen."
      : `move2med: Ihre Krankenkasse konnte die Fahrt nicht genehmigen.${note ? ` Grund: ${note}` : ""}`,
  );
  await audit({ actorType: "user", actorId: s.uid, actorName: s.name, action: `approval.${decision}`, prescriptionId: id, detail: { note } });
  return { ok: true };
});
