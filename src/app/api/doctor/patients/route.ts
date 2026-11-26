import { desc } from "drizzle-orm";
import { db, schema } from "@/db";
import { handle, requireUser } from "@/lib/api";
import { approvalStatus } from "@/lib/domain";

export const GET = handle(async () => {
  await requireUser(["doctor"]);
  const patients = await db.select().from(schema.patients).orderBy(schema.patients.id);
  const rxs = await db.select().from(schema.prescriptions).orderBy(desc(schema.prescriptions.issuedAt));
  return {
    patients: patients.map((p) => {
      const rx = rxs.find((r) => r.patientId === p.id && r.status !== "cancelled");
      return {
        id: p.id, name: p.name, birthdate: p.birthdate, kvnr: p.kvnr, address: p.address, insurerName: p.insurerName,
        exemption: p.exemption, draft: p.draft,
        prescription: rx
          ? { id: rx.id, status: rx.status, approval: approvalStatus(rx), reasonCode: rx.reasonCode, scenario: rx.data.szenario, bound: rx.boundCompanyId }
          : null,
      };
    }),
  };
});
