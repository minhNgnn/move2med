import { handle, HttpError } from "@/lib/api";
import { demoMode } from "@/lib/home";
import { demoUnlocked } from "@/lib/session";
import { seedAll } from "@/db/seed";

export const POST = handle(async () => {
  if (!demoMode()) throw new HttpError(404, "Not found");
  if (!(await demoUnlocked())) throw new HttpError(401, "Demo controls are locked. Enter the demo PIN.", "locked");
  return { ok: true, ...(await seedAll()) };
});
