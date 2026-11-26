import { z } from "zod";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { handle, HttpError, requirePatient, audit, sendSms } from "@/lib/api";
import { evaluateProof } from "@/lib/domain";
import { uid } from "@/lib/server-crypto";

/** A relative confirms a ride from the status page (proxy). The driver's own signed event is still required. */
export const POST = handle(async (req) => {
  const ps = await requirePatient();
  const { rideId } = z.object({ rideId: z.string() }).parse(await req.json());
  const [ride] = await db.select().from(schema.rides).where(eq(schema.rides.id, rideId));
  if (!ride || ride.prescriptionId !== ps.rx) throw new HttpError(404, "Ride not found");
  if (!["picked_up", "completed"].includes(ride.status)) throw new HttpError(409, "The ride has not started yet.", "not_started");
  await db.insert(schema.patientConfirmations).values({ id: uid("conf"), rideId, method: "proxy" });
  await evaluateProof(rideId);
  await sendSms(ps.rx, "move2med: Ride confirmed by a relative.");
  await audit({ actorType: "patient", action: "ride.confirm.proxy", prescriptionId: ps.rx, rideId });
  return { ok: true };
});
