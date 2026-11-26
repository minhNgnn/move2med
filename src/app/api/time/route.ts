import { handle } from "@/lib/api";
export const GET = handle(async () => ({ serverTime: new Date().toISOString() }));
