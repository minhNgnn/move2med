import { z } from "zod";
import { and, eq, ne } from "drizzle-orm";
import { db, schema } from "@/db";
import { handle, HttpError, requireUser, audit } from "@/lib/api";
import { createPrescription } from "@/lib/domain";
import { approvalFor, checkPrescription } from "@/lib/rules";
import { transportDataSchema } from "@/lib/schemas";
import type { TransportData } from "@/lib/types";

export const POST = handle(async (req) => {
  const s = await requireUser(["doctor"]);
  const body = z
    .object({ patientId: z.number().int(), reasonCode: z.enum(["a", "b", "c", "d", "e", "f"]), justification: z.string().nullable(), data: transportDataSchema })
    .parse(await req.json());
  const [patient] = await db.select().from(schema.patients).where(eq(schema.patients.id, body.patientId));
  if (!patient) throw new HttpError(404, "Unknown patient");
  const [open] = await db.select().from(schema.prescriptions).where(and(eq(schema.prescriptions.patientId, patient.id), ne(schema.prescriptions.status, "cancelled")));
  if (open) throw new HttpError(409, "This patient already has an active prescription. Cancel it first (a correction means cancel and reissue).", "exists");

  const ap = approvalFor(body.reasonCode, body.data);
  const data = {
    ...body.data,
    grund_der_befoerderung: { ...body.data.grund_der_befoerderung, kategorie: ap.required ? "Genehmigungspflichtige Fahrt" : "Genehmigungsfreie Fahrt" },
  } as TransportData;
  // Server-side enforcement of the same rules the form shows live.
  const errors = checkPrescription({ reasonCode: body.reasonCode, data, justification: body.justification, exemption: patient.exemption }).filter((f) => f.severity === "error");
  if (errors.length) throw new HttpError(422, errors.map((e) => e.code).join(", "), "rules");

  const res = await createPrescription({ patientId: patient.id, data, reasonCode: body.reasonCode, justification: body.justification?.trim() || null, issuedBy: s.uid });
  await audit({ actorType: "user", actorId: s.uid, actorName: s.name, action: "prescription.issue", prescriptionId: res.id, detail: { approvalRequired: ap.required } });
  return { ...res, approvalRequired: ap.required };
});
