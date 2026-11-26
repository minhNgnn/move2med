import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { handle, requireUser } from "@/lib/api";

export const GET = handle(async () => {
  const s = await requireUser(["dispatcher"]);
  const cid = s.companyId ?? "none";
  const vehicles = await db.select().from(schema.vehicles).where(eq(schema.vehicles.companyId, cid));
  const users = (await db.select().from(schema.users).where(eq(schema.users.companyId, cid))).filter((u) => u.role === "driver");
  const devices = await db.select().from(schema.devices).where(eq(schema.devices.companyId, cid));
  const [company] = await db.select().from(schema.companies).where(eq(schema.companies.id, cid));
  return {
    company,
    vehicles,
    drivers: users.map((u) => ({ id: u.id, name: u.name })),
    devices: devices.map((d) => ({ id: d.id, label: d.label, userId: d.userId, userName: users.find((u) => u.id === d.userId)?.name, status: d.status, lastSyncAt: d.lastSyncAt, createdAt: d.createdAt })),
  };
});
