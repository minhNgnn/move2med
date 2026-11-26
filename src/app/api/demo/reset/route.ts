import { handle, HttpError } from "@/lib/api";
import { demoMode } from "@/lib/home";
import { seedAll } from "@/db/seed";

export const POST = handle(async () => {
  if (!demoMode()) throw new HttpError(404, "Not found");
  return { ok: true, ...(await seedAll()) };
});
