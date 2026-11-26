import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { readSession, signSession } from "./server-crypto";
import type { Role, Session } from "./types";

export const SESSION_COOKIE = "m2m_session";
export const PATIENT_COOKIE = "m2m_patient";

export async function getSession(): Promise<Session | null> {
  const c = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!c) return null;
  const p = await readSession<Session>(c);
  return p ? { uid: p.uid, role: p.role, companyId: p.companyId ?? null, name: p.name } : null;
}

export async function setSession(s: Session) {
  const token = await signSession({ ...s }, "7d");
  (await cookies()).set(SESSION_COOKIE, token, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 7 * 24 * 3600 });
}

export async function clearSession() {
  (await cookies()).delete(SESSION_COOKIE);
}

/** For pages: redirect to the login page when the role does not match. */
export async function requirePage(roles: Role[]): Promise<Session> {
  const s = await getSession();
  if (!s || !roles.includes(s.role)) redirect(`/login?next=${roles[0] === "doctor" ? "/doctor" : roles[0] === "insurer" ? "/insurer" : "/dispatch"}`);
  return s;
}

export type PatientSession = { rx: string };
export async function getPatientSession(): Promise<PatientSession | null> {
  const c = (await cookies()).get(PATIENT_COOKIE)?.value;
  if (!c) return null;
  const p = await readSession<PatientSession>(c);
  return p ? { rx: p.rx } : null;
}
export async function setPatientSession(rx: string) {
  const token = await signSession({ rx }, "12h");
  (await cookies()).set(PATIENT_COOKIE, token, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 12 * 3600 });
}
export async function clearPatientSession() {
  (await cookies()).delete(PATIENT_COOKIE);
}

export const DEMO_COOKIE = "m2m_demo";
/** Demo controls (reset, full key list) need a PIN when DEMO_ADMIN_PIN is set (always set it on the public deployment). */
export async function demoUnlocked() {
  if (!process.env.DEMO_ADMIN_PIN) return true;
  const c = (await cookies()).get(DEMO_COOKIE)?.value;
  const p = c ? await readSession<{ demo?: boolean }>(c) : null;
  return !!p?.demo;
}
export async function setDemoUnlocked() {
  const token = await signSession({ demo: true }, "12h");
  (await cookies()).set(DEMO_COOKIE, token, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 12 * 3600 });
}
