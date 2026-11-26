import { db, schema } from "@/db";
import { handle, HttpError } from "@/lib/api";
import { demoMode } from "@/lib/home";

export const GET = handle(async () => {
  if (!demoMode()) throw new HttpError(404, "Not found");
  const users = await db.select().from(schema.users);
  const companies = await db.select().from(schema.companies);
  return {
    password: "demo",
    accounts: users.map((u) => ({ id: u.id, email: u.email, name: u.name, role: u.role, company: companies.find((c) => c.id === u.companyId)?.name ?? null })),
  };
});
