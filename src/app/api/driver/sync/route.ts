import { z } from "zod";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { handle, requireUser } from "@/lib/api";
import { driverRidesFor, ingestEvents } from "@/lib/domain";

const body = z.object({
  deviceId: z.string(),
  events: z.array(z.object({ id: z.string(), rideId: z.string(), type: z.string(), payload: z.string(), signature: z.string() })).max(200),
});

/**
 * One endpoint for everything the phone does when it has signal: upload its signed event log, get fresh rides.
 * Events are append-only and idempotent (IDs come from the device), so retrying after a dropped connection is safe.
 */
export const POST = handle(async (req) => {
  const s = await requireUser(["driver"]);
  const { deviceId, events } = body.parse(await req.json());
  const serverTime = new Date().toISOString();
  const [device] = await db.select().from(schema.devices).where(eq(schema.devices.id, deviceId));
  if (!device || device.userId !== s.uid) return { deviceStatus: "unknown", serverTime, acked: [], rides: [] };

  // Evidence is never discarded, even from a revoked device: it is stored and flagged for review.
  const acked = await ingestEvents(device, events);
  await db.update(schema.devices).set({ lastSyncAt: new Date() }).where(eq(schema.devices.id, deviceId));
  if (device.status === "revoked") return { deviceStatus: "revoked", serverTime, acked, rides: [] };
  return { deviceStatus: "active", serverTime, acked, rides: await driverRidesFor(s.uid) };
});
