import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { handle, requireUser } from "@/lib/api";
import { approvalStatus } from "@/lib/domain";
import { checkPrescription, REASONS, type ReasonCode } from "@/lib/rules";

export const GET = handle(async () => {
  await requireUser(["insurer"]);
  const rows = await db
    .select({ rx: schema.prescriptions, p: schema.patients })
    .from(schema.prescriptions)
    .innerJoin(schema.patients, eq(schema.prescriptions.patientId, schema.patients.id))
    .orderBy(desc(schema.prescriptions.issuedAt));
  const companies = await db.select().from(schema.companies);
  return {
    informed: rows
      .filter((r) => !r.rx.approvalRequired && r.rx.status !== "cancelled")
      .map(({ rx, p }) => ({
        id: rx.id, patient: p.name, scenario: rx.data.szenario, issuedAt: rx.issuedAt, hin: rx.data.hinfahrt, rueck: rx.data.rueckfahrt,
        keyStatus: rx.keyStatus, company: companies.find((c) => c.id === rx.boundCompanyId)?.name ?? null,
      })),
    approvals: rows
      .filter((r) => r.rx.approvalRequired && r.rx.status !== "cancelled")
      .map(({ rx, p }) => ({
        id: rx.id, patient: p.name, insurer: p.insurerName, scenario: rx.data.szenario, status: approvalStatus(rx),
        reason: REASONS[rx.reasonCode as ReasonCode], reasonCode: rx.reasonCode, justification: rx.justification,
        hin: rx.data.hinfahrt, rueck: rx.data.rueckfahrt, frequency: rx.data.behandlung.haeufigkeit, issuedAt: rx.issuedAt,
        flags: checkPrescription({ reasonCode: rx.reasonCode as ReasonCode, data: rx.data, justification: rx.justification, exemption: p.exemption }),
        note: rx.approvalNote,
      })),
  };
});
