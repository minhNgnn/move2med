import Dexie, { type Table } from "dexie";
import type { DriverRide, SyncResult } from "./types";

/**
 * Everything the driver phone keeps. Design rules:
 *  - ride data (health data) is AES-GCM encrypted with a key that cannot be exported from the browser,
 *  - every action is an append-only, individually signed event with a device-generated ID (safe to retry),
 *  - synced events are deleted as soon as the server acknowledges them,
 *  - logout or a remote revoke wipes the lot.
 */
type Enc = { id: string; date: string; iv: Uint8Array; ct: ArrayBuffer };
type EventRow = { id: string; rideId: string; type: string; payload: string; signature: string; createdAt: number };
type KV = { key: string; value: any };

class DriverDB extends Dexie {
  kv!: Table<KV, string>;
  rides!: Table<Enc, string>;
  events!: Table<EventRow, string>;
  constructor() {
    super("m2m-driver");
    this.version(1).stores({ kv: "key", rides: "id,date", events: "id,rideId,createdAt" });
  }
}
export const db = new DriverDB();

const getKV = async <T = any>(key: string) => (await db.kv.get(key))?.value as T | undefined;
const setKV = (key: string, value: unknown) => db.kv.put({ key, value });
export { getKV, setKV };

// ---------------------------------------------------------------- keys
type Keys = { sign: CryptoKeyPair; aes: CryptoKey; publicJwk: JsonWebKey };
let keyCache: Keys | null = null;

export async function ensureKeys(): Promise<Keys> {
  if (keyCache) return keyCache;
  let k = await getKV<Keys>("keys");
  if (!k) {
    // extractable:false => the private key can sign but can never be read out, not even by our own code.
    const sign = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, false, ["sign", "verify"]);
    const aes = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
    const publicJwk = await crypto.subtle.exportKey("jwk", sign.publicKey);
    k = { sign, aes, publicJwk };
    await setKV("keys", k);
  }
  keyCache = k;
  return k;
}

const b64 = (buf: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(buf)));

async function encrypt(aes: CryptoKey, obj: unknown) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, aes, new TextEncoder().encode(JSON.stringify(obj)));
  return { iv, ct };
}
async function decrypt<T>(aes: CryptoKey, row: Enc): Promise<T> {
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: row.iv as BufferSource }, aes, row.ct);
  return JSON.parse(new TextDecoder().decode(pt));
}

// ---------------------------------------------------------------- rides
export async function loadRides(): Promise<DriverRide[]> {
  if (!keyCache && !(await getKV("keys"))) return []; // wiped or never set up: do not create keys just to read nothing
  const { aes } = await ensureKeys();
  const rows = await db.rides.toArray();
  const out: DriverRide[] = [];
  for (const r of rows) {
    try { out.push(await decrypt<DriverRide>(aes, r)); } catch { /* unreadable row: skip */ }
  }
  return out.sort((a, b) => (a.date + a.pickupTime).localeCompare(b.date + b.pickupTime));
}

async function putRide(ride: DriverRide) {
  const { aes } = await ensureKeys();
  const { iv, ct } = await encrypt(aes, ride);
  await db.rides.put({ id: ride.id, date: ride.date, iv, ct });
}

export const pendingCount = () => db.events.count();
/** When the oldest unsent event was created (ms), or null. Used to warn when evidence waits too long for a connection. */
export const oldestPendingAt = async () => (await db.events.orderBy("createdAt").first())?.createdAt ?? null;
export const pendingRideIds = async () => new Set((await db.events.toArray()).map((e) => e.rideId));

// ---------------------------------------------------------------- trusted time
/**
 * The phone clock can be changed. After each sync we remember (server time, monotonic clock). Offline, time is
 * server time + elapsed monotonic time. The server compares that with the raw device clock and flags big gaps.
 */
export async function anchoredNow(): Promise<{ iso: string | null; confidence: "high" | "low" | "none" }> {
  const a = await getKV<{ serverTime: number; mono: number; wall: number; origin: number }>("anchor");
  if (!a) return { iso: null, confidence: "none" };
  if (a.origin === performance.timeOrigin) return { iso: new Date(a.serverTime + (performance.now() - a.mono)).toISOString(), confidence: "high" };
  // The app was restarted since the anchor: the monotonic clock restarted too, fall back to wall-clock difference.
  return { iso: new Date(a.serverTime + (Date.now() - a.wall)).toISOString(), confidence: "low" };
}

export type Gps = { lat: number; lon: number; acc: number; t: number };
export function getGps(timeoutMs = 4000): Promise<Gps | null> {
  return new Promise((resolve) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) return resolve(null);
    const guard = setTimeout(() => resolve(null), timeoutMs + 800);
    navigator.geolocation.getCurrentPosition(
      (p) => { clearTimeout(guard); resolve({ lat: +p.coords.latitude.toFixed(5), lon: +p.coords.longitude.toFixed(5), acc: Math.round(p.coords.accuracy), t: p.timestamp }); },
      () => { clearTimeout(guard); resolve(null); },
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 60_000 },
    );
  });
}

// ---------------------------------------------------------------- events
export type EventType = "pickup" | "tap" | "dropoff" | "wait";

/** Sign an action on the device, queue it, and apply it to the local ride immediately. Works with no signal at all. */
export async function sha256hex(text: string) {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

type Extra = Record<string, unknown> | ((eventId: string) => Promise<Record<string, unknown>> | Record<string, unknown>);

export async function recordEvent(ride: DriverRide, type: EventType, extraIn: Extra = {}): Promise<DriverRide> {
  const { sign } = await ensureKeys();
  const [{ iso, confidence }, gps] = await Promise.all([anchoredNow(), getGps()]);
  const id = `evt_${crypto.randomUUID().replace(/-/g, "")}`;
  const extra = typeof extraIn === "function" ? await extraIn(id) : extraIn;
  const payload = JSON.stringify({
    id, rideId: ride.id, type, deviceTime: new Date().toISOString(), anchoredTime: iso, timeConfidence: confidence, gps,
    ...(type === "tap" ? { challenge: ride.nonce } : {}), ...extra,
  });
  const sig = b64(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, sign.privateKey, new TextEncoder().encode(payload)));
  await db.events.put({ id, rideId: ride.id, type, payload, signature: sig, createdAt: Date.now() });

  const next: DriverRide = { ...ride };
  if (type === "pickup") next.status = "picked_up";
  if (type === "dropoff") next.status = "completed";
  if (type === "wait") next.waitMin = Number(extra.waitMin ?? 0);
  if (type === "tap") next.localProof = { method: String(extra.method), at: new Date().toISOString() };
  await putRide(next);
  return next;
}

// ---------------------------------------------------------------- device + sync
export function deviceLabel() {
  const ua = navigator.userAgent;
  const os = /iPhone|iPad/.test(ua) ? "iPhone" : /Android/.test(ua) ? "Android" : /Mac/.test(ua) ? "Mac" : "Phone";
  const br = /CriOS|Chrome/.test(ua) ? "Chrome" : /Safari/.test(ua) ? "Safari" : "Browser";
  return `${os} · ${br}`;
}

export async function registerDevice(): Promise<boolean> {
  const k = await ensureKeys();
  let deviceId = await getKV<string>("deviceId");
  if (!deviceId) { deviceId = `dev_${crypto.randomUUID().replace(/-/g, "")}`; await setKV("deviceId", deviceId); }
  try {
    const res = await fetch("/api/driver/register-device", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ deviceId, label: deviceLabel(), publicJwk: k.publicJwk }),
    });
    return res.ok;
  } catch { return false; }
}

export async function wipeAll() {
  keyCache = null;
  await Promise.all([db.kv.clear(), db.rides.clear(), db.events.clear()]);
}

export async function isSimOffline() { return !!(await getKV<boolean>("simOffline")); }
export const setSimOffline = (v: boolean) => setKV("simOffline", v);
export const lastSyncAt = () => getKV<number>("lastSync");

let syncing: Promise<SyncResult> | null = null;
export function syncNow(): Promise<SyncResult> {
  if (!syncing) syncing = doSync(false).finally(() => { syncing = null; });
  return syncing;
}

async function doSync(retried: boolean): Promise<SyncResult> {
  if ((await isSimOffline()) || !navigator.onLine) return { ok: false, reason: "offline" };
  const deviceId = await getKV<string>("deviceId");
  if (!deviceId) return { ok: false, reason: "error" };
  const queued = (await db.events.orderBy("createdAt").toArray()).slice(0, 100);

  let res: Response;
  try {
    res = await fetch("/api/driver/sync", {
      method: "POST", headers: { "content-type": "application/json" }, cache: "no-store",
      body: JSON.stringify({ deviceId, events: queued.map(({ id, rideId, type, payload, signature }) => ({ id, rideId, type, payload, signature })) }),
    });
  } catch { return { ok: false, reason: "offline" }; }
  if (res.status === 401) return { ok: false, reason: "unauthenticated" };
  if (!res.ok) return { ok: false, reason: "error" };
  const j = await res.json();

  if (j.deviceStatus === "unknown") {
    if (retried || !(await registerDevice())) return { ok: false, reason: "error" };
    return doSync(true);
  }
  if (j.acked?.length) await db.events.bulkDelete(j.acked);
  await setKV("anchor", { serverTime: Date.parse(j.serverTime), mono: performance.now(), wall: Date.now(), origin: performance.timeOrigin });
  await setKV("lastSync", Date.now());
  if (j.deviceStatus === "revoked") { await wipeAll(); return { ok: false, reason: "revoked" }; }

  // Merge: the server wins on assignment/cancellation; rides with unsent local events keep their local state.
  const pending = await pendingRideIds();
  const local = new Map((await loadRides()).map((r) => [r.id, r]));
  const serverIds = new Set<string>();
  for (const s of j.rides as DriverRide[]) {
    serverIds.add(s.id);
    const l = local.get(s.id);
    if (l && pending.has(s.id)) {
      await putRide({ ...s, status: l.status, localProof: l.localProof, waitMin: l.waitMin ?? s.waitMin });
    } else {
      await putRide({ ...s, localProof: null });
    }
  }
  for (const [id, l] of local) if (!serverIds.has(id) && !pending.has(id)) await db.rides.delete(id);
  return { ok: true, acked: j.acked?.length ?? 0 };
}
