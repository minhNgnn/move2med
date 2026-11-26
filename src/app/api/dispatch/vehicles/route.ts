import { z } from "zod";
import { db, schema } from "@/db";
import { handle, requireUser, audit } from "@/lib/api";
import { uid } from "@/lib/server-crypto";

export const POST = handle(async (req) => {
  const s = await requireUser(["dispatcher"]);
  const b = z
    .object({
      label: z.string().min(1).max(40), plate: z.string().min(3).max(14), type: z.enum(["taxi", "ktw"]),
      equipment: z.array(z.enum(["rollstuhl", "tragestuhl", "liegend", "schwerlast"])),
    })
    .parse(await req.json());
  const id = uid("v");
  await db.insert(schema.vehicles).values({ id, companyId: s.companyId ?? "none", ...b });
  await audit({ actorType: "user", actorId: s.uid, actorName: s.name, companyId: s.companyId, action: "vehicle.add", detail: { label: b.label, type: b.type, equipment: b.equipment } });
  return { ok: true, id };
});
