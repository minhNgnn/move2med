import { z } from "zod";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { handle, HttpError, rateLimit, clientIp, audit } from "@/lib/api";
import { verifyPassword } from "@/lib/server-crypto";
import { setSession } from "@/lib/session";
import { HOME } from "@/lib/home";
import type { Role } from "@/lib/types";

export const POST = handle(async (req) => {
  const body = z.object({ email: z.string().min(3), password: z.string().min(1) }).parse(await req.json());
  rateLimit(`login-ip:${clientIp(req)}`, 150, 60_000);
  rateLimit(`login:${body.email.trim().toLowerCase()}`, 12, 60_000); // per account: the real brute-force guard
  const [u] = await db.select().from(schema.users).where(eq(schema.users.email, body.email.trim().toLowerCase()));
  if (!u || !verifyPassword(body.password, u.passwordHash)) throw new HttpError(401, "Wrong email or password", "bad_credentials");
  await setSession({ uid: u.id, role: u.role as Role, companyId: u.companyId, name: u.name });
  await audit({ actorType: "user", actorId: u.id, actorName: u.name, companyId: u.companyId, action: "login", ip: clientIp(req) });
  return { ok: true, role: u.role, home: HOME[u.role as Role] };
});
