import { z } from "zod";
import { timingSafeEqual } from "node:crypto";
import { handle, HttpError, rateLimit, clientIp } from "@/lib/api";
import { demoMode } from "@/lib/home";
import { setDemoUnlocked } from "@/lib/session";

export const POST = handle(async (req) => {
  if (!demoMode()) throw new HttpError(404, "Not found");
  rateLimit(`demo-unlock:${clientIp(req)}`, 8, 60_000);
  const { pin } = z.object({ pin: z.string().min(1) }).parse(await req.json());
  const want = process.env.DEMO_ADMIN_PIN;
  if (want) {
    const a = Buffer.from(pin), b = Buffer.from(want);
    if (a.length !== b.length || !timingSafeEqual(a, b)) throw new HttpError(401, "Wrong PIN", "bad_pin");
  }
  await setDemoUnlocked();
  return { ok: true };
});
