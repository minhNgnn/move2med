import { handle } from "@/lib/api";
import { clearPatientSession } from "@/lib/session";
export const POST = handle(async () => {
  await clearPatientSession();
  return { ok: true };
});
