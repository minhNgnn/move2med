import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { handle, HttpError, requireUser, audit, sendSms } from "@/lib/api";
import { matchVehicle, isBusy } from "@/lib/fleet";
import type { Equip, VType } from "@/lib/types";

export const POST = handle(async (req, ctx) => {
  const s = await requireUser(["dispatcher"]);
  const { id } = await ctx.params;
  const { vehicleId, driverId, applyToSeries } = z
    .object({ vehicleId: z.string(), driverId: z.string(), applyToSeries: z.boolean().optional() })
    .parse(await req.json());
  const cid = s.companyId ?? "none";
  const [ride] = await db.select().from(schema.rides).where(and(eq(schema.rides.id, id), eq(schema.rides.companyId, cid)));
  if (!ride) throw new HttpError(404, "Ride not found");
  const [vehicle] = await db.select().from(schema.vehicles).where(and(eq(schema.vehicles.id, vehicleId), eq(schema.vehicles.companyId, cid)));
  const [driver] = await db.select().from(schema.users).where(and(eq(schema.users.id, driverId), eq(schema.users.companyId, cid)));
  if (!vehicle || !driver || driver.role !== "driver") throw new HttpError(400, "Vehicle or driver not in your company");
  const [rx] = await db.select().from(schema.prescriptions).where(eq(schema.prescriptions.id, ride.prescriptionId));
  const companyRides = await db.select().from(schema.rides).where(eq(schema.rides.companyId, cid));

  const targets = applyToSeries ? companyRides.filter((r) => r.prescriptionId === ride.prescriptionId && r.leg === ride.leg && ["planned", "assigned"].includes(r.status)) : [ride];
  const done: string[] = [];
  const skipped: { id: string; reason: string }[] = [];
  for (const t of targets) {
    const m = matchVehicle(vehicle, { vehicleType: t.vehicleType as VType, equipment: t.equipment as Equip, weightKg: rx.data.sonstiges.gewicht_kg });
    if (!m.ok) {
      if (t.id === ride.id) throw new HttpError(422, `Vehicle does not fit: missing ${m.missing.join(", ")}`, "fleet_mismatch");
      skipped.push({ id: t.id, reason: "fleet_mismatch" });
      continue;
    }
    if (isBusy(vehicle.id, t.scheduledDate, t.pickupTime, companyRides, t.id)) {
      if (t.id === ride.id) throw new HttpError(409, `${vehicle.label} already has a ride around ${t.pickupTime}`, "busy");
      skipped.push({ id: t.id, reason: "busy" });
      continue;
    }
    await db.update(schema.rides).set({ vehicleId, driverId, status: "assigned" }).where(eq(schema.rides.id, t.id));
    const idx = companyRides.findIndex((r) => r.id === t.id);
    if (idx >= 0) companyRides[idx] = { ...companyRides[idx], vehicleId, driverId };
    done.push(t.id);
  }
  await audit({ actorType: "user", actorId: s.uid, actorName: s.name, companyId: cid, action: "ride.assign", prescriptionId: ride.prescriptionId, rideId: id, detail: { vehicle: vehicle.label, driver: driver.name, applied: done.length, skipped } });
  if (ride.status === "planned") {
    await sendSms(ride.prescriptionId, `move2med: Your ${ride.leg === "hin" ? "outbound" : "return"} ride is planned for ${ride.scheduledDate} at ${ride.pickupTime} with ${vehicle.label} (${vehicle.plate}), driver ${driver.name}.`);
  }
  return { ok: true, applied: done.length, skipped };
});
