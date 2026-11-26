import { z } from "zod";
import { handle, HttpError, rateLimit, clientIp, audit } from "@/lib/api";
import { findByKey } from "@/lib/keys";
import { setPatientSession } from "@/lib/session";

/** Patients and relatives never register: key + date of birth is the whole login. */
export const POST = handle(async (req) => {
  rateLimit(`patient-login:${clientIp(req)}`, 10, 60_000);
  const { code, dob } = z.object({ code: z.string().min(4), dob: z.string().min(6) }).parse(await req.json());
  const hit = await findByKey(code, dob);
  if (!hit || hit.rx.keyStatus !== "active") {
    await audit({ actorType: "patient", action: "patient.login.failed", prescriptionId: hit?.rx.id, ip: clientIp(req) });
    throw new HttpError(404, "Key or date of birth not valid", "invalid_key");
  }
  await setPatientSession(hit.rx.id);
  await audit({ actorType: "patient", actorName: hit.p.name, action: "patient.login", prescriptionId: hit.rx.id, ip: clientIp(req) });
  return { ok: true };
});
