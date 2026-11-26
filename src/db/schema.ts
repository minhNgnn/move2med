import {
  pgTable,
  text,
  integer,
  boolean,
  timestamp,
  jsonb,
  serial,
  index,
} from "drizzle-orm/pg-core";
import type { TransportData } from "@/lib/types";

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });

/** Server-held secrets (signing keys etc.), generated lazily on first use. */
export const secrets = pgTable("secrets", {
  name: text("name").primaryKey(),
  value: text("value").notNull(),
});

export const companies = pgTable("companies", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  ik: text("ik").notNull(),
  city: text("city").notNull(),
  status: text("status").notNull().default("registered"), // registered | suspended
  phone: text("phone"),
  createdAt: ts("created_at").notNull().defaultNow(),
});

export const vehicles = pgTable("vehicles", {
  id: text("id").primaryKey(),
  companyId: text("company_id").notNull(),
  label: text("label").notNull(),
  plate: text("plate").notNull(),
  type: text("type").notNull(), // taxi | ktw
  equipment: jsonb("equipment").$type<string[]>().notNull().default([]), // rollstuhl | tragestuhl | liegend | schwerlast
});

export const users = pgTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  role: text("role").notNull(), // doctor | insurer | dispatcher | driver
  companyId: text("company_id"),
  passwordHash: text("password_hash").notNull(),
});

/** A driver's phone. The private key never leaves the device; we hold the public half. */
export const devices = pgTable("devices", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  companyId: text("company_id").notNull(),
  label: text("label").notNull(),
  publicJwk: jsonb("public_jwk").$type<JsonWebKey>().notNull(),
  status: text("status").notNull().default("active"), // active | revoked
  createdAt: ts("created_at").notNull().defaultNow(),
  lastSyncAt: ts("last_sync_at"),
  revokedAt: ts("revoked_at"),
});

export const patients = pgTable("patients", {
  id: integer("id").primaryKey(),
  name: text("name").notNull(),
  birthdate: text("birthdate").notNull(), // YYYY-MM-DD
  kvnr: text("kvnr").notNull(),
  address: jsonb("address").$type<{ strasse: string; plz: string; ort: string }>().notNull(),
  insurerName: text("insurer_name").notNull(),
  insurerIk: text("insurer_ik").notNull(),
  exemption: jsonb("exemption").$type<{ status: boolean; gueltig_bis: string | null }>().notNull(),
  phone: text("phone"),
  /** Pre-filled suggestion for the doctor form (the organisers' mock scenario for this patient). */
  draft: jsonb("draft").$type<TransportData>().notNull(),
  /** Billing figures from the mock data (`abrechnung_transporteur`): the tariff stand-in. */
  billing: jsonb("billing").$type<Billed>().notNull(),
});

export const prescriptions = pgTable(
  "prescriptions",
  {
    id: text("id").primaryKey(),
    patientId: integer("patient_id").notNull(),
    status: text("status").notNull(), // pending_approval | ready | rejected | cancelled
    approvalRequired: boolean("approval_required").notNull(),
    approvalDecidedAt: ts("approval_decided_at"),
    approvalNote: text("approval_note"),
    data: jsonb("data").$type<TransportData>().notNull(),
    reasonCode: text("reason_code").notNull(), // a..f (Muster 4 section 1)
    justification: text("justification"),
    issuedBy: text("issued_by"),
    issuedAt: ts("issued_at").notNull().defaultNow(),
    keyVersion: integer("key_version").notNull().default(1),
    keyHash: text("key_hash").notNull(),
    keyStatus: text("key_status").notNull().default("active"), // active | revoked
    boundCompanyId: text("bound_company_id"),
    boundAt: ts("bound_at"),
    /** Set only by an explicit "correct co-payment" action of a dispatcher. */
    copayOverride: integer("copay_override"),
  },
  (t) => [index("prescriptions_key_hash_idx").on(t.keyHash)],
);

export type Billed = {
  gesamt_brutto: number;
  zuzahlung: number;
  km: number;
  positionsnummer: string;
  anzahl: number;
  belegnummer: string;
  rechnungsnummer: string;
};

export const rides = pgTable(
  "rides",
  {
    id: text("id").primaryKey(),
    prescriptionId: text("prescription_id").notNull(),
    occurrence: integer("occurrence").notNull(),
    leg: text("leg").notNull(), // hin | rueck
    scheduledDate: text("scheduled_date").notNull(), // YYYY-MM-DD
    pickupTime: text("pickup_time").notNull(), // HH:MM
    fromAddr: jsonb("from_addr").$type<Addr>().notNull(),
    toAddr: jsonb("to_addr").$type<Addr>().notNull(),
    vehicleType: text("vehicle_type").notNull(), // Taxi | KTW
    equipment: text("equipment").notNull(), // keine | Rollstuhl | Tragestuhl | liegend
    companyId: text("company_id").notNull(),
    vehicleId: text("vehicle_id"),
    driverId: text("driver_id"),
    status: text("status").notNull().default("planned"), // planned | assigned | picked_up | completed | cancelled
    pickedUpAt: ts("picked_up_at"),
    completedAt: ts("completed_at"),
    waitMin: integer("wait_min"),
    billingId: text("billing_id"),
  },
  (t) => [index("rides_company_idx").on(t.companyId), index("rides_rx_idx").on(t.prescriptionId)],
);

export type Addr = { name?: string; strasse: string; plz: string; ort: string };

/** Append-only log of everything a driver device did. IDs are generated on the device. */
export const rideEvents = pgTable(
  "ride_events",
  {
    id: text("id").primaryKey(),
    rideId: text("ride_id").notNull(),
    deviceId: text("device_id").notNull(),
    type: text("type").notNull(), // pickup | tap | dropoff | wait
    payload: text("payload").notNull(), // exact string the device signed
    signature: text("signature").notNull(), // base64 ECDSA P-256 over payload
    deviceTime: ts("device_time").notNull(),
    anchoredTime: ts("anchored_time"),
    receivedAt: ts("received_at").notNull().defaultNow(),
    sigValid: boolean("sig_valid").notNull(),
    flags: jsonb("flags").$type<string[]>().notNull().default([]),
    gps: jsonb("gps").$type<{ lat: number; lon: number; acc?: number; t?: number } | null>(),
  },
  (t) => [index("ride_events_ride_idx").on(t.rideId)],
);

/** One proof per ride leg: patient layer + device layer + gateway countersignature. */
export const proofs = pgTable("proofs", {
  id: text("id").primaryKey(),
  rideId: text("ride_id").notNull().unique(),
  eventId: text("event_id").notNull(),
  method: text("method").notNull(), // card_tap | pin | proxy
  tokenJws: text("token_jws"), // mock PoPP token (patient layer)
  deviceSig: text("device_sig").notNull(),
  gatewaySig: text("gateway_sig"),
  status: text("status").notNull(), // verified | needs_review | rejected
  flags: jsonb("flags").$type<string[]>().notNull().default([]),
  tapTime: ts("tap_time").notNull(),
  createdAt: ts("created_at").notNull().defaultNow(),
  reviewNote: text("review_note"),
});

export const patientConfirmations = pgTable("patient_confirmations", {
  id: text("id").primaryKey(),
  rideId: text("ride_id").notNull(),
  method: text("method").notNull(), // proxy
  at: ts("at").notNull().defaultNow(),
});

export const auditLog = pgTable("audit_log", {
  id: serial("id").primaryKey(),
  at: ts("at").notNull().defaultNow(),
  actorType: text("actor_type").notNull(), // user | patient | system | device
  actorId: text("actor_id"),
  actorName: text("actor_name"),
  companyId: text("company_id"),
  action: text("action").notNull(),
  prescriptionId: text("prescription_id"),
  rideId: text("ride_id"),
  detail: jsonb("detail").$type<Record<string, unknown>>(),
  ip: text("ip"),
});

export const sms = pgTable("sms", {
  id: serial("id").primaryKey(),
  prescriptionId: text("prescription_id").notNull(),
  at: ts("at").notNull().defaultNow(),
  body: text("body").notNull(),
});

export const billingSubmissions = pgTable("billing_submissions", {
  id: text("id").primaryKey(),
  companyId: text("company_id").notNull(),
  createdAt: ts("created_at").notNull().defaultNow(),
  rideIds: jsonb("ride_ids").$type<string[]>().notNull(),
  payload: jsonb("payload").$type<unknown>().notNull(),
  status: text("status").notNull().default("submitted"), // submitted | verified | rejected
  verifiedAt: ts("verified_at"),
});

/** A patient's ask (e.g. by voice) to cancel one ride, pending until a dispatcher decides. */
export const cancellationRequests = pgTable(
  "cancellation_requests",
  {
    id: text("id").primaryKey(),
    rideId: text("ride_id").notNull(),
    prescriptionId: text("prescription_id").notNull(),
    state: text("state").notNull().default("pending"), // pending | confirmed | declined | closed
    createdAt: ts("created_at").notNull().defaultNow(),
    decidedAt: ts("decided_at"),
    decidedBy: text("decided_by"),
    closedReason: text("closed_reason"),
  },
  (t) => [index("cancel_req_ride_idx").on(t.rideId)],
);
