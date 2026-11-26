import { createHash, createHmac, randomBytes, scryptSync, timingSafeEqual, webcrypto } from "node:crypto";
import { SignJWT, jwtVerify, compactVerify, CompactSign, generateKeyPair, exportJWK, importJWK } from "jose";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";

const cache = new Map<string, string>();

/** Lazily generate and persist a server secret (works the same locally and on Vercel + Neon). */
export async function getSecret(name: string, gen: () => string | Promise<string>): Promise<string> {
  const hit = cache.get(name);
  if (hit) return hit;
  const [row] = await db.select().from(schema.secrets).where(eq(schema.secrets.name, name));
  if (row) {
    cache.set(name, row.value);
    return row.value;
  }
  await db.insert(schema.secrets).values({ name, value: await gen() }).onConflictDoNothing();
  const [r2] = await db.select().from(schema.secrets).where(eq(schema.secrets.name, name));
  cache.set(name, r2.value);
  return r2.value;
}

export const rand = (bytes = 16) => randomBytes(bytes).toString("hex");
export const uid = (prefix: string) => `${prefix}_${randomBytes(8).toString("hex")}`;

async function hmacKey(name: string) {
  return getSecret(`hmac:${name}`, () => rand(32));
}

// ---------- ride keys ----------
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // 32 symbols, no I/O/0/1

/** Deterministic from (prescription, version): never stored in clear, can be reprinted by authorised staff. */
export async function keyCodeFor(prescriptionId: string, version: number) {
  const h = createHmac("sha256", await hmacKey("ride-key")).update(`${prescriptionId}:${version}`).digest();
  let s = "";
  for (let i = 0; i < 8; i++) s += ALPHABET[h[i] & 31];
  return `${s.slice(0, 4)}-${s.slice(4)}`;
}

export function normalizeCode(input: string) {
  const s = input.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return s.length === 8 ? `${s.slice(0, 4)}-${s.slice(4)}` : s;
}

export async function keyHash(code: string) {
  return createHmac("sha256", await hmacKey("key-lookup")).update(normalizeCode(code)).digest("hex");
}

/** 6-digit PIN printed on the letter: the fallback if the card tap is not possible. */
export async function pinFor(prescriptionId: string, version: number) {
  const h = createHmac("sha256", await hmacKey("ride-pin")).update(`${prescriptionId}:${version}`).digest();
  return String(h.readUInt32BE(0) % 1_000_000).padStart(6, "0");
}

export function normalizeDob(input: string) {
  const s = input.trim();
  const m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  return s;
}

// ---------- sessions ----------
async function sessionSecret() {
  return new TextEncoder().encode(await getSecret("session", () => rand(32)));
}
export async function signSession(payload: Record<string, unknown>, ttl: string) {
  return new SignJWT(payload).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime(ttl).sign(await sessionSecret());
}
export async function readSession<T>(token: string): Promise<T | null> {
  try {
    const { payload } = await jwtVerify(token, await sessionSecret());
    return payload as T;
  } catch {
    return null;
  }
}

// ---------- passwords ----------
export function hashPassword(pw: string) {
  const salt = randomBytes(8).toString("hex");
  return `${salt}:${scryptSync(pw, salt, 32).toString("hex")}`;
}
export function verifyPassword(pw: string, stored: string) {
  const [salt, hash] = stored.split(":");
  const a = Buffer.from(hash, "hex");
  const b = scryptSync(pw, salt, 32);
  return a.length === b.length && timingSafeEqual(a, b);
}

// ---------- ES256 service keys (gateway countersignature + mock PoPP service) ----------
type KeyPairJwk = { privateJwk: JsonWebKey; publicJwk: JsonWebKey };

async function servicePair(name: "gateway" | "popp"): Promise<KeyPairJwk> {
  const raw = await getSecret(`es256:${name}`, async () => {
    const { privateKey, publicKey } = await generateKeyPair("ES256", { extractable: true });
    return JSON.stringify({ privateJwk: await exportJWK(privateKey), publicJwk: await exportJWK(publicKey) });
  });
  return JSON.parse(raw);
}

export async function signCompact(name: "gateway" | "popp", payload: object) {
  const { privateJwk } = await servicePair(name);
  const key = await importJWK(privateJwk, "ES256");
  return new CompactSign(new TextEncoder().encode(JSON.stringify(payload)))
    .setProtectedHeader({ alg: "ES256", kid: `m2m-${name}` })
    .sign(key);
}

export async function verifyCompact<T = Record<string, unknown>>(name: "gateway" | "popp", jws: string): Promise<T | null> {
  try {
    const { publicJwk } = await servicePair(name);
    const { payload } = await compactVerify(jws, await importJWK(publicJwk, "ES256"));
    return JSON.parse(new TextDecoder().decode(payload)) as T;
  } catch {
    return null;
  }
}

export const sha256hex = (s: string) => createHash("sha256").update(s).digest("hex");

/** Verify an ECDSA P-256 signature produced by WebCrypto in the driver's browser. */
export async function verifyDeviceSig(publicJwk: JsonWebKey, payload: string, sigB64: string) {
  try {
    const key = await webcrypto.subtle.importKey("jwk", publicJwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
    return await webcrypto.subtle.verify(
      { name: "ECDSA", hash: "SHA-256" },
      key,
      Buffer.from(sigB64, "base64"),
      new TextEncoder().encode(payload),
    );
  } catch {
    return false;
  }
}
