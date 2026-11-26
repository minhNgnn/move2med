import { z } from "zod";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { handle, HttpError, requireUser, audit } from "@/lib/api";

/** The device generates its key pair locally (private key non-extractable) and registers only the public half. */
export const POST = handle(async (req) => {
  const s = await requireUser(["driver"]);
  const { deviceId, label, publicJwk } = z
    .object({ deviceId: z.string().min(8), label: z.string().min(1).max(60), publicJwk: z.object({ kty: z.string(), crv: z.string(), x: z.string(), y: z.string() }).passthrough() })
    .parse(await req.json());
  const [existing] = await db.select().from(schema.devices).where(eq(schema.devices.id, deviceId));
  if (existing && existing.userId !== s.uid) throw new HttpError(409, "Device belongs to another account", "device_taken");
  if (!existing) {
    await db.insert(schema.devices).values({ id: deviceId, userId: s.uid, companyId: s.companyId ?? "", label, publicJwk: publicJwk as JsonWebKey });
    await audit({ actorType: "user", actorId: s.uid, actorName: s.name, companyId: s.companyId, action: "device.register", detail: { label } });
  }
  return { deviceId, status: existing?.status ?? "active" };
});
