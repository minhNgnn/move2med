import { z } from "zod";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { handle, HttpError } from "@/lib/api";
import { demoMode, HOME } from "@/lib/home";
import { setSession } from "@/lib/session";
import type { Role } from "@/lib/types";

/** Demo role switcher: jump between accounts in one click (only when DEMO_MODE=1). */
export const POST = handle(async (req) => {
  if (!demoMode()) throw new HttpError(404, "Not found");
  const { userId } = z.object({ userId: z.string() }).parse(await req.json());
  const [u] = await db.select().from(schema.users).where(eq(schema.users.id, userId));
  if (!u) throw new HttpError(404, "No such account");
  await setSession({ uid: u.id, role: u.role as Role, companyId: u.companyId, name: u.name });
  return { ok: true, home: HOME[u.role as Role] };
});
