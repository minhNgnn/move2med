import { NextResponse, type NextRequest } from "next/server";
import { db, schema } from "@/db";
import { getSession, getPatientSession } from "./session";
import type { Role, Session } from "./types";

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
  ) {
    super(message);
  }
}

type Ctx = { params: Promise<Record<string, string>> };

export function handle<T>(fn: (req: NextRequest, ctx: Ctx) => Promise<T>) {
  return async (req: NextRequest, ctx: Ctx) => {
    try {
      const out = await fn(req, ctx);
      return out instanceof Response ? out : NextResponse.json(out ?? { ok: true });
    } catch (e) {
      if (e instanceof HttpError) return NextResponse.json({ error: e.message, code: e.code }, { status: e.status });
      console.error(e);
      return NextResponse.json({ error: "Internal error" }, { status: 500 });
    }
  };
}

export async function requireUser(roles?: Role[]): Promise<Session> {
  const s = await getSession();
  if (!s) throw new HttpError(401, "Not signed in", "unauthenticated");
  if (roles && !roles.includes(s.role)) throw new HttpError(403, "Not allowed for your role", "forbidden");
  return s;
}

export async function requirePatient() {
  const s = await getPatientSession();
  if (!s) throw new HttpError(401, "Enter your key and date of birth", "unauthenticated");
  return s;
}

export const clientIp = (req: NextRequest) => req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";

const hits = new Map<string, number[]>();
/** Small in-memory rate limit (per server instance), enough to show the idea; production would use a shared store. */
export function rateLimit(key: string, max: number, windowMs: number) {
  const now = Date.now();
  const arr = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (arr.length >= max) throw new HttpError(429, "Too many attempts. Please wait a minute.", "rate_limited");
  arr.push(now);
  hits.set(key, arr);
}

export async function audit(e: {
  actorType: "user" | "patient" | "system" | "device";
  actorId?: string | null;
  actorName?: string | null;
  companyId?: string | null;
  action: string;
  prescriptionId?: string | null;
  rideId?: string | null;
  detail?: Record<string, unknown>;
  ip?: string;
}) {
  await db.insert(schema.auditLog).values({
    actorType: e.actorType,
    actorId: e.actorId ?? null,
    actorName: e.actorName ?? null,
    companyId: e.companyId ?? null,
    action: e.action,
    prescriptionId: e.prescriptionId ?? null,
    rideId: e.rideId ?? null,
    detail: e.detail ?? null,
    ip: e.ip ?? null,
  });
}

export async function sendSms(prescriptionId: string, body: string) {
  await db.insert(schema.sms).values({ prescriptionId, body });
}
