import { handle } from "@/lib/api";
import { getSession } from "@/lib/session";
import { demoMode } from "@/lib/home";
export const GET = handle(async () => ({ session: await getSession(), demo: demoMode() }));
