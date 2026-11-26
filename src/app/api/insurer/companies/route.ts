import { z } from "zod";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { handle, HttpError, requireUser, audit } from "@/lib/api";
import { hashPassword, uid } from "@/lib/server-crypto";

export const GET = handle(async () => {
  await requireUser(["insurer"]);
  const companies = await db.select().from(schema.companies);
  const vehicles = await db.select().from(schema.vehicles);
  return { companies: companies.map((c) => ({ ...c, vehicles: vehicles.filter((v) => v.companyId === c.id).length })) };
});

/** Registering a company also creates its first dispatcher account. Only registered companies can redeem ride keys. */
export const POST = handle(async (req) => {
  const s = await requireUser(["insurer"]);
  const b = z
    .object({
      name: z.string().min(2).max(80), ik: z.string().regex(/^\d{9}$/, "IK must have 9 digits"), city: z.string().min(2).max(60),
      dispatcherName: z.string().min(2).max(60), dispatcherEmail: z.string().email(), password: z.string().min(4).max(60),
    })
    .parse(await req.json());
  const email = b.dispatcherEmail.trim().toLowerCase();
  const [dupe] = await db.select().from(schema.companies).where(eq(schema.companies.ik, b.ik));
  if (dupe) throw new HttpError(409, "A company with this IK is already registered", "ik_taken");
  const [mail] = await db.select().from(schema.users).where(eq(schema.users.email, email));
  if (mail) throw new HttpError(409, "This email is already in use", "email_taken");
  const id = uid("c");
  await db.insert(schema.companies).values({ id, name: b.name, ik: b.ik, city: b.city });
  await db.insert(schema.users).values({ id: uid("u"), email, name: b.dispatcherName, role: "dispatcher", companyId: id, passwordHash: hashPassword(b.password) });
  await audit({ actorType: "user", actorId: s.uid, actorName: s.name, companyId: id, action: "company.register", detail: { name: b.name, ik: b.ik } });
  return { ok: true, id };
});
