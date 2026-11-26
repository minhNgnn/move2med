import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { handle, HttpError, requireUser, audit } from "@/lib/api";
import { keyCodeFor, pinFor } from "@/lib/server-crypto";
import { approvalStatus } from "@/lib/domain";

/** Data for the printable approval letter (ride key + QR + PIN). Doctor or insurer only. */
export const GET = handle(async (_req, ctx) => {
  const s = await requireUser(["doctor", "insurer"]);
  const { id } = await ctx.params;
  const [row] = await db.select({ rx: schema.prescriptions, p: schema.patients }).from(schema.prescriptions).innerJoin(schema.patients, eq(schema.prescriptions.patientId, schema.patients.id)).where(eq(schema.prescriptions.id, id));
  if (!row) throw new HttpError(404, "Not found");
  await audit({ actorType: "user", actorId: s.uid, actorName: s.name, action: "letter.print", prescriptionId: id });
  return {
    code: await keyCodeFor(id, row.rx.keyVersion),
    pin: await pinFor(id, row.rx.keyVersion),
    approval: approvalStatus(row.rx),
    patient: { name: row.p.name, birthdate: row.p.birthdate, address: row.p.address, insurer: row.p.insurerName },
    trip: { scenario: row.rx.data.szenario, facility: row.rx.data.behandlung.zieladresse, pickup: row.rx.data.behandlung.abholzeit_geplant, hin: row.rx.data.hinfahrt, rueck: row.rx.data.rueckfahrt, frequency: row.rx.data.behandlung.haeufigkeit },
  };
});
