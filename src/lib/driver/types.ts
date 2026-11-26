export type DriverRide = {
  id: string; prescriptionId: string; leg: "hin" | "rueck"; date: string; pickupTime: string; status: string;
  from: { name?: string; strasse: string; plz: string; ort: string }; to: { name?: string; strasse: string; plz: string; ort: string };
  patient: { name: string; phone: string | null };
  vehicleType: string; equipment: string; vehicleLabel: string | null;
  weightKg: number | null; waitMin: number | null; shared: boolean;
  copay: { exempt: boolean; amount: number };
  nonce: string;
  proof: { status: string; method: string } | null;
  /** Set on the phone the moment the card is tapped; replaced by the server's verdict after sync. */
  localProof?: { method: string; at: string } | null;
};

export type Phase = "boot" | "login" | "needs-online" | "ready" | "revoked";
export type SyncReason = "offline" | "unauthenticated" | "revoked" | "error";
export type SyncResult = { ok: boolean; reason?: SyncReason; acked?: number };
