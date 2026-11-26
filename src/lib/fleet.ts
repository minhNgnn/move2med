import { HEAVY_KG } from "./rules";
import type { Equip, VType } from "./types";

export type VehicleLite = { id: string; label: string; plate: string; type: string; equipment: string[] };
export type Need = { vehicleType: VType; equipment: Equip; weightKg?: number };

const EQUIP_KEY: Record<Equip, string | null> = {
  keine: null,
  Rollstuhl: "rollstuhl",
  Tragestuhl: "tragestuhl",
  liegend: "liegend",
};

/** Can this vehicle serve this leg? Lists what is missing instead of a bare yes/no. */
export function matchVehicle(v: VehicleLite, need: Need) {
  const missing: string[] = [];
  if (need.vehicleType === "KTW" && v.type !== "ktw") missing.push("KTW");
  const eq = EQUIP_KEY[need.equipment];
  if (eq && !v.equipment.includes(eq)) {
    missing.push(need.equipment === "liegend" ? "stretcher" : need.equipment === "Tragestuhl" ? "carry chair" : "wheelchair space");
  }
  if (need.weightKg && need.weightKg >= HEAVY_KG && !v.equipment.includes("schwerlast")) missing.push("heavy-duty (≥150 kg)");
  return {
    ok: missing.length === 0,
    missing,
    oversized: need.vehicleType === "Taxi" && v.type === "ktw" && missing.length === 0,
  };
}

const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));

/** True if the vehicle already has another ride within 90 minutes that day. */
export function isBusy(
  vehicleId: string,
  date: string,
  pickupTime: string,
  rides: { id: string; vehicleId: string | null; scheduledDate: string; pickupTime: string; status: string }[],
  ignoreRideId?: string,
) {
  return rides.some(
    (r) =>
      r.id !== ignoreRideId &&
      r.vehicleId === vehicleId &&
      r.scheduledDate === date &&
      r.status !== "cancelled" &&
      Math.abs(toMin(r.pickupTime) - toMin(pickupTime)) < 90,
  );
}
