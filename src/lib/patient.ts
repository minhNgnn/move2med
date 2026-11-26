import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { HttpError } from "./api";

export async function loadForPatient(rxId: string) {
  const [row] = await db
    .select({ rx: schema.prescriptions, p: schema.patients })
    .from(schema.prescriptions)
    .innerJoin(schema.patients, eq(schema.prescriptions.patientId, schema.patients.id))
    .where(eq(schema.prescriptions.id, rxId));
  if (!row) throw new HttpError(404, "Not found");
  return row;
}
