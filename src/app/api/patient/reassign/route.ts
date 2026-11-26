import { and, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import { handle, requirePatient, audit, sendSms } from "@/lib/api";
import { loadForPatient } from "@/lib/patient";
import { rotateKey } from "@/lib/domain";

/** Hand the trip to a different company: unbind, cancel unstarted rides, and issue a NEW key so the old company's key stops working. */
export const POST = handle(async () => {
  const ps = await requirePatient();
  const { rx } = await loadForPatient(ps.rx);
  await db
    .update(schema.rides)
    .set({ status: "cancelled" })
    .where(and(eq(schema.rides.prescriptionId, rx.id), inArray(schema.rides.status, ["planned", "assigned"])));
  await db.update(schema.prescriptions).set({ boundCompanyId: null, boundAt: null }).where(eq(schema.prescriptions.id, rx.id));
  const fresh = await rotateKey(rx);
  await sendSms(rx.id, "move2med: Your trip is free again. A new ride key was issued; the old one no longer works.");
  await audit({ actorType: "patient", action: "key.reassign", prescriptionId: rx.id, detail: { previousCompany: rx.boundCompanyId } });
  return { ok: true, code: fresh.code, pin: fresh.pin };
});
