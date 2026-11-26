import type { Role } from "./types";
export const HOME: Record<Role, string> = { doctor: "/doctor", insurer: "/insurer", dispatcher: "/dispatch", driver: "/driver" };
export const demoMode = () => process.env.DEMO_MODE === "1";
