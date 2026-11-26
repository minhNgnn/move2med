import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { handle, requirePatient, audit, sendSms } from "@/lib/api";

export const POST = handle(async () => {
  const ps = await requirePatient();
  await db.update(schema.prescriptions).set({ keyStatus: "revoked" }).where(eq(schema.prescriptions.id, ps.rx));
  await sendSms(ps.rx, "move2med: You revoked your ride key. No company can use it any more.");
  await audit({ actorType: "patient", action: "key.revoke", prescriptionId: ps.rx });
  return { ok: true };
});
