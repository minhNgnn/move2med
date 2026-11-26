import { db, schema } from "@/db";
import { handle, requireUser } from "@/lib/api";

export const GET = handle(async () => {
  await requireUser(["insurer"]);
  const companies = await db.select().from(schema.companies);
  const vehicles = await db.select().from(schema.vehicles);
  return { companies: companies.map((c) => ({ ...c, vehicles: vehicles.filter((v) => v.companyId === c.id).length })) };
});
