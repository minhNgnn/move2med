import { z } from "zod";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { handle, HttpError, requireUser, audit } from "@/lib/api";
import { hashPassword, uid } from "@/lib/server-crypto";

export const POST = handle(async (req) => {
  const s = await requireUser(["dispatcher"]);
  const b = z.object({ name: z.string().min(2).max(60), email: z.string().email(), password: z.string().min(4).max(60) }).parse(await req.json());
  const email = b.email.trim().toLowerCase();
  const [mail] = await db.select().from(schema.users).where(eq(schema.users.email, email));
  if (mail) throw new HttpError(409, "This email is already in use", "email_taken");
  await db.insert(schema.users).values({ id: uid("u"), email, name: b.name, role: "driver", companyId: s.companyId, passwordHash: hashPassword(b.password) });
  await audit({ actorType: "user", actorId: s.uid, actorName: s.name, companyId: s.companyId, action: "driver.add", detail: { name: b.name } });
  return { ok: true };
});
