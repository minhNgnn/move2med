import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { handle, HttpError } from "@/lib/api";
import { demoMode } from "@/lib/home";
import { demoUnlocked } from "@/lib/session";
import { keyCodeFor, pinFor } from "@/lib/server-crypto";
import { approvalStatus } from "@/lib/domain";

/** Demo helper: the letters of all seeded prescriptions (code + date of birth + PIN). */
export const GET = handle(async () => {
  if (!demoMode()) throw new HttpError(404, "Not found");
  if (!(await demoUnlocked())) throw new HttpError(401, "Demo controls are locked. Enter the demo PIN.", "locked");
  const rows = await db.select({ rx: schema.prescriptions, p: schema.patients }).from(schema.prescriptions).innerJoin(schema.patients, eq(schema.prescriptions.patientId, schema.patients.id));
  const out = [];
  for (const { rx, p } of rows) {
    out.push({
      prescriptionId: rx.id, patientId: p.id, name: p.name, city: p.address.ort, scenario: rx.data.szenario,
      dob: p.birthdate, code: await keyCodeFor(rx.id, rx.keyVersion), pin: await pinFor(rx.id, rx.keyVersion),
      status: rx.status, approval: approvalStatus(rx), keyStatus: rx.keyStatus, bound: rx.boundCompanyId,
    });
  }
  return { keys: out.sort((a, b) => a.patientId - b.patientId) };
});
