import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { handle, HttpError, requireUser, audit, sendSms } from "@/lib/api";
import { closePendingRequests } from "@/lib/requests";

/** Cancel one date of a series (or a single ride) that has not started. */
export const POST = handle(async (_req, ctx) => {
  const s = await requireUser(["dispatcher"]);
  const { id } = await ctx.params;
  const [ride] = await db.select().from(schema.rides).where(and(eq(schema.rides.id, id), eq(schema.rides.companyId, s.companyId ?? "none")));
  if (!ride) throw new HttpError(404, "Ride not found");
  if (!["planned", "assigned"].includes(ride.status)) throw new HttpError(409, "Only rides that have not started can be cancelled", "started");
  await db.update(schema.rides).set({ status: "cancelled" }).where(eq(schema.rides.id, id));
  await closePendingRequests({ rideIds: [id] }, "ride_cancelled");
  await sendSms(
    ride.prescriptionId,
    `move2med: Your ${ride.leg === "hin" ? "outbound" : "return"} ride on ${ride.scheduledDate} at ${ride.pickupTime} was cancelled by the transport company.`,
    `move2med: Ihre ${ride.leg === "hin" ? "Hinfahrt" : "Rückfahrt"} am ${ride.scheduledDate} um ${ride.pickupTime} Uhr wurde vom Transportunternehmen storniert.`,
  );
  await audit({ actorType: "user", actorId: s.uid, actorName: s.name, companyId: s.companyId, action: "ride.cancel", prescriptionId: ride.prescriptionId, rideId: id });
  return { ok: true };
});
