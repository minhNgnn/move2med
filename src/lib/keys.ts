import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { HttpError } from "./api";
import { keyHash, normalizeDob } from "./server-crypto";

/** Look up a prescription by ride key AND date of birth (second factor). Same `null` for both failure cases. */
export async function findByKey(code: string, dob: string) {
  const hash = await keyHash(code);
  const [row] = await db
    .select({ rx: schema.prescriptions, p: schema.patients })
    .from(schema.prescriptions)
    .innerJoin(schema.patients, eq(schema.prescriptions.patientId, schema.patients.id))
    .where(eq(schema.prescriptions.keyHash, hash));
  if (!row || row.p.birthdate !== normalizeDob(dob)) return null;
  return row;
}

export const bodySchema = z.object({ code: z.string().min(4), dob: z.string().min(6) });

export async function companyOrThrow(companyId: string | null) {
  const [c] = companyId ? await db.select().from(schema.companies).where(eq(schema.companies.id, companyId)) : [];
  if (!c) throw new HttpError(403, "No company on this account");
  if (c.status !== "registered") throw new HttpError(403, "Your company is suspended. Contact the insurer.", "suspended");
  return c;
}
