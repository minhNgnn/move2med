import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { handle, requirePatient, audit, sendSms } from "@/lib/api";
import { closePendingRequests } from "@/lib/requests";

export const POST = handle(async () => {
  const ps = await requirePatient();
  await closePendingRequests({ prescriptionId: ps.rx }, "key_revoked");
  await db.update(schema.prescriptions).set({ keyStatus: "revoked" }).where(eq(schema.prescriptions.id, ps.rx));
  await sendSms(ps.rx, "move2med: You revoked your ride key. No company can use it any more.", "move2med: Sie haben Ihren Fahrtschlüssel widerrufen. Kein Unternehmen kann ihn mehr nutzen.");
  await audit({ actorType: "patient", action: "key.revoke", prescriptionId: ps.rx });
  return { ok: true };
});
