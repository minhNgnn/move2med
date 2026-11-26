import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { handle, HttpError, requireUser, audit, sendSms } from "@/lib/api";
import { sms } from "@/lib/assistant/templates";

/** The dispatcher decides a patient's cancellation request. Confirm = the existing "cancel ride"; decline leaves the ride as it is. */
export const POST = handle(async (req, ctx) => {
  const s = await requireUser(["dispatcher"]);
  const { id } = await ctx.params;
  const { decision } = z.object({ decision: z.enum(["confirm", "decline"]) }).parse(await req.json());
  const [row] = await db
    .select({ q: schema.cancellationRequests, ride: schema.rides })
    .from(schema.cancellationRequests)
    .innerJoin(schema.rides, eq(schema.cancellationRequests.rideId, schema.rides.id))
    .where(and(eq(schema.cancellationRequests.id, id), eq(schema.rides.companyId, s.companyId ?? "none")));
  if (!row) throw new HttpError(404, "Request not found");
  if (row.q.state !== "pending") throw new HttpError(409, "This request is already closed", "closed");
  const [company] = await db.select().from(schema.companies).where(eq(schema.companies.id, row.ride.companyId));
  const [vehicle] = row.ride.vehicleId ? await db.select().from(schema.vehicles).where(eq(schema.vehicles.id, row.ride.vehicleId)) : [];
  const lite = { date: row.ride.scheduledDate, pickupTime: row.ride.pickupTime, leg: row.ride.leg, status: row.ride.status, vehicle: vehicle?.label ?? null };

  if (decision === "confirm") {
    if (!["planned", "assigned"].includes(row.ride.status)) throw new HttpError(409, "The ride has already started", "started");
    await db.update(schema.rides).set({ status: "cancelled" }).where(eq(schema.rides.id, row.ride.id));
    await db.update(schema.cancellationRequests).set({ state: "confirmed", decidedAt: new Date(), decidedBy: s.uid }).where(eq(schema.cancellationRequests.id, id));
    const m = sms.confirmed(lite);
    await sendSms(row.q.prescriptionId, m.en, m.de);
  } else {
    await db.update(schema.cancellationRequests).set({ state: "declined", decidedAt: new Date(), decidedBy: s.uid }).where(eq(schema.cancellationRequests.id, id));
    const m = sms.declined(lite, { name: company.name, phone: company.phone });
    await sendSms(row.q.prescriptionId, m.en, m.de);
  }
  await audit({ actorType: "user", actorId: s.uid, actorName: s.name, companyId: s.companyId, action: `cancel_request.${decision}`, prescriptionId: row.q.prescriptionId, rideId: row.ride.id });
  return { ok: true };
});
