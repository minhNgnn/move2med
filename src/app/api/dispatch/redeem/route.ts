import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { handle, HttpError, requireUser, rateLimit, audit, clientIp } from "@/lib/api";
import { findByKey, bodySchema, companyOrThrow } from "@/lib/keys";
import { buildTripCard } from "@/lib/domain";

export const POST = handle(async (req) => {
  const s = await requireUser(["dispatcher"]);
  rateLimit(`redeem:${s.uid}`, 12, 60_000);
  rateLimit(`redeem-ip:${clientIp(req)}`, 40, 60_000);
  const { code, dob } = bodySchema.parse(await req.json());
  const company = await companyOrThrow(s.companyId);
  const base = { actorType: "user" as const, actorId: s.uid, actorName: s.name, companyId: company.id, ip: clientIp(req) };

  const hit = await findByKey(code, dob);
  if (!hit) {
    await audit({ ...base, action: "key.redeem.failed", detail: { reason: "unknown key or wrong date of birth" } });
    throw new HttpError(404, "Key or date of birth not valid", "invalid_key");
  }
  const { rx, p } = hit;
  if (rx.keyStatus !== "active" || rx.status === "cancelled") {
    await audit({ ...base, action: "key.redeem.failed", prescriptionId: rx.id, detail: { reason: "revoked" } });
    throw new HttpError(410, "This key is no longer valid. Ask the patient for a new one.", "revoked");
  }
  if (rx.boundCompanyId && rx.boundCompanyId !== company.id) {
    await audit({ ...base, action: "key.redeem.failed", prescriptionId: rx.id, detail: { reason: "assigned to another company" } });
    throw new HttpError(409, "This trip is already assigned to another company.", "taken");
  }
  const mode = rx.boundCompanyId === company.id ? "full" : "preview";
  await audit({ ...base, action: "key.redeem", prescriptionId: rx.id, detail: { mode } });
  const vehicles = await db.select().from(schema.vehicles).where(eq(schema.vehicles.companyId, company.id));
  const drivers = (await db.select().from(schema.users).where(eq(schema.users.companyId, company.id))).filter((u) => u.role === "driver");
  const rides = await db.select().from(schema.rides).where(eq(schema.rides.companyId, company.id));
  return {
    card: await buildTripCard(rx, p, mode),
    company: { id: company.id, name: company.name },
    vehicles,
    drivers: drivers.map((d) => ({ id: d.id, name: d.name })),
    busy: rides.map((r) => ({ id: r.id, vehicleId: r.vehicleId, scheduledDate: r.scheduledDate, pickupTime: r.pickupTime, status: r.status })),
    rides: rides.filter((r) => r.prescriptionId === rx.id),
  };
});
