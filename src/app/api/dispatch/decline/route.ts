import { handle, HttpError, requireUser, audit } from "@/lib/api";
import { findByKey, bodySchema } from "@/lib/keys";

export const POST = handle(async (req) => {
  const s = await requireUser(["dispatcher"]);
  const { code, dob } = bodySchema.parse(await req.json());
  const hit = await findByKey(code, dob);
  if (!hit) throw new HttpError(404, "Key or date of birth not valid", "invalid_key");
  await audit({ actorType: "user", actorId: s.uid, actorName: s.name, companyId: s.companyId, action: "key.decline", prescriptionId: hit.rx.id });
  return { ok: true };
});
