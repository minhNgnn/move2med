import { desc } from "drizzle-orm";
import { db, schema } from "@/db";
import { handle, requireUser } from "@/lib/api";

export const GET = handle(async () => {
  await requireUser(["insurer"]);
  const rows = await db.select().from(schema.billingSubmissions).orderBy(desc(schema.billingSubmissions.createdAt));
  const companies = await db.select().from(schema.companies);
  return {
    submissions: rows.map((r) => {
      const p = r.payload as { totals: { brutto: number; copay: number; km: number }; items: unknown[] };
      return { id: r.id, company: companies.find((c) => c.id === r.companyId)?.name, createdAt: r.createdAt, rides: r.rideIds.length, totals: p.totals, status: r.status, verifiedAt: r.verifiedAt };
    }),
  };
});
