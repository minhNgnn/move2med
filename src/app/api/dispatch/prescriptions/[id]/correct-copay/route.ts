import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { handle, HttpError, requireUser, audit } from "@/lib/api";
import { expectedCopay } from "@/lib/rules";

/** An explicit, audited correction chosen by a person. The rules engine itself never changes data. */
export const POST = handle(async (_req, ctx) => {
  const s = await requireUser(["dispatcher"]);
  const { id } = await ctx.params;
  const [row] = await db
    .select({ rx: schema.prescriptions, p: schema.patients })
    .from(schema.prescriptions)
    .innerJoin(schema.patients, eq(schema.prescriptions.patientId, schema.patients.id))
    .where(and(eq(schema.prescriptions.id, id), eq(schema.prescriptions.boundCompanyId, s.companyId ?? "none")));
  if (!row) throw new HttpError(404, "Not found");
  const exp = expectedCopay({ brutto: row.p.billing.gesamt_brutto, exempt: row.p.exemption.status, unfall: row.rx.data.unfallbezug });
  const before = row.rx.copayOverride ?? row.p.billing.zuzahlung;
  await db.update(schema.prescriptions).set({ copayOverride: exp.amount }).where(eq(schema.prescriptions.id, id));
  await audit({ actorType: "user", actorId: s.uid, actorName: s.name, companyId: s.companyId, action: "copay.correct", prescriptionId: id, detail: { before, after: exp.amount, why: exp.why } });
  return { ok: true, before, after: exp.amount };
});
