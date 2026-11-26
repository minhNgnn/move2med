import { desc } from "drizzle-orm";
import { db, schema } from "@/db";
import { handle, requireUser } from "@/lib/api";

export const GET = handle(async () => {
  await requireUser(["insurer"]);
  const rows = await db.select().from(schema.auditLog).orderBy(desc(schema.auditLog.id)).limit(150);
  const companies = await db.select().from(schema.companies);
  return { entries: rows.map((r) => ({ ...r, company: companies.find((c) => c.id === r.companyId)?.name ?? null })) };
});
