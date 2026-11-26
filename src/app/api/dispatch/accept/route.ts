import { and, eq, isNull } from "drizzle-orm";
import { db, schema } from "@/db";
import { handle, HttpError, requireUser, audit, sendSms, clientIp } from "@/lib/api";
import { findByKey, bodySchema, companyOrThrow } from "@/lib/keys";
import { approvalStatus, buildTripCard, generateRides } from "@/lib/domain";

/** Accepting binds the key to this company and creates the rides. Needs code + DOB again, so a bare prescription ID is useless. */
export const POST = handle(async (req) => {
  const s = await requireUser(["dispatcher"]);
  const { code, dob } = bodySchema.parse(await req.json());
  const company = await companyOrThrow(s.companyId);
  const hit = await findByKey(code, dob);
  if (!hit) throw new HttpError(404, "Key or date of birth not valid", "invalid_key");
  const { rx, p } = hit;
  if (rx.keyStatus !== "active" || rx.status === "cancelled") throw new HttpError(410, "This key is no longer valid.", "revoked");
  const ap = approvalStatus(rx);
  if (ap === "pending") throw new HttpError(409, "The insurer has not approved this trip yet.", "approval_pending");
  if (ap === "rejected") throw new HttpError(409, "The insurer rejected this trip.", "approval_rejected");

  const upd = await db
    .update(schema.prescriptions)
    .set({ boundCompanyId: company.id, boundAt: new Date() })
    .where(and(eq(schema.prescriptions.id, rx.id), isNull(schema.prescriptions.boundCompanyId)))
    .returning();
  if (!upd.length && rx.boundCompanyId !== company.id) throw new HttpError(409, "This trip was just accepted by another company.", "taken");
  if (upd.length) {
    await generateRides(upd[0], p, company.id);
    await sendSms(rx.id, `move2med: ${company.name} accepted your trip. Pickup today at ${rx.data.behandlung.abholzeit_geplant}. You can follow it here with your key.`, `move2med: ${company.name} hat Ihre Fahrt angenommen. Abholung heute um ${rx.data.behandlung.abholzeit_geplant} Uhr. Mit Ihrem Schlüssel können Sie sie hier verfolgen.`);
    await audit({ actorType: "user", actorId: s.uid, actorName: s.name, companyId: company.id, action: "key.accept", prescriptionId: rx.id, ip: clientIp(req) });
  }
  const [fresh] = await db.select().from(schema.prescriptions).where(eq(schema.prescriptions.id, rx.id));
  return { card: await buildTripCard(fresh, p, "full") };
});
