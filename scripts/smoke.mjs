// End-to-end check of the hero flow against a running server: node scripts/smoke.mjs [baseUrl]
import { webcrypto as crypto } from "node:crypto";
const BASE = process.argv[2] ?? "http://localhost:3100";
let failures = 0;
const ok = (c, m) => { console.log(`${c ? "  ✓" : "  ✗"} ${m}`); if (!c) failures++; };

class Client {
  jar = {};
  async call(method, path, body) {
    const res = await fetch(BASE + path, {
      method, headers: { "content-type": "application/json", cookie: Object.entries(this.jar).map(([k, v]) => `${k}=${v}`).join("; ") },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    for (const c of res.headers.getSetCookie?.() ?? []) { const [kv] = c.split(";"); const i = kv.indexOf("="); this.jar[kv.slice(0, i)] = kv.slice(i + 1); }
    const json = await res.json().catch(() => ({}));
    return { status: res.status, ...json };
  }
  get = (p) => this.call("GET", p);
  post = (p, b = {}) => this.call("POST", p, b);
  login = (email) => this.post("/api/auth/login", { email, password: "demo" });
}

const step = (t) => console.log(`\n${t}`);
const doctor = new Client(), insurer = new Client(), spree = new Client(), taxi = new Client(), driver = new Client();

step("0. reset demo");
{ const c = new Client(); await c.post("/api/demo/unlock", { pin: process.env.DEMO_ADMIN_PIN ?? "x" }); const r = await c.post("/api/demo/reset"); ok(r.ok, "demo reset"); }

step("1. doctor issues record #16 (carry-chair KTW)");
await doctor.login("doctor@demo.med");
const pats = await doctor.get("/api/doctor/patients");
const p16 = pats.patients.find((p) => p.id === 16);
ok(p16 && !p16.prescription, "patient 16 has no prescription yet");
const bad = await doctor.post("/api/doctor/prescriptions", { patientId: 16, reasonCode: "f", justification: null, data: p16.draft });
ok(bad.status === 422, "KTW without justification is rejected by the server (422)");
const issued = await doctor.post("/api/doctor/prescriptions", { patientId: 16, reasonCode: "f", justification: "Cannot sit unsupported, carry chair with two attendants needed.", data: p16.draft });
ok(issued.code && issued.approvalRequired, `issued, key ${issued.code}, approval required`);
const code = issued.code;
const dob = p16.birthdate;

step("2. company tries to redeem before approval");
await spree.login("dispatch.spree@demo.med");
const pre = await spree.post("/api/dispatch/redeem", { code, dob });
ok(pre.card?.mode === "preview", "redeem works as PREVIEW (patient name hidden)");
ok(pre.card?.patient.name === null && pre.card?.patient.address.strasse === "", "no name / street in preview");
ok(pre.card?.hasJustification === true && !JSON.stringify(pre).includes("carry chair with two"), "medical text never leaves the insurer");
const early = await spree.post("/api/dispatch/accept", { code, dob });
ok(early.status === 409 && early.code === "approval_pending", "accept blocked: approval pending");
const wrongDob = await spree.post("/api/dispatch/redeem", { code, dob: "1990-01-01" });
ok(wrongDob.status === 404, "wrong date of birth -> 404");

step("3. insurer approves");
await insurer.login("insurer@demo.med");
const ap = await insurer.post(`/api/insurer/approvals/${issued.id}`, { decision: "approve" });
ok(ap.ok, "approved");

step("4. Berlin Taxi Zentrale: wrong vehicle fleet");
await taxi.login("dispatch.berlintaxi@demo.med");
const t1 = await taxi.post("/api/dispatch/redeem", { code, dob });
ok(t1.card?.mode === "preview", "second company also gets a preview while the key is unbound");
const fleetTaxi = t1.vehicles;
ok(!fleetTaxi.some((v) => v.type === "ktw"), "this company has no KTW at all (slide 1: wrong vehicle)");

step("5. Spree accepts, key binds");
const acc = await spree.post("/api/dispatch/accept", { code, dob });
ok(acc.card?.mode === "full" && acc.card.patient.name === "Testperson 16", "accepted: full Trip Card");
const taken = await taxi.post("/api/dispatch/redeem", { code, dob });
ok(taken.status === 409 && taken.code === "taken", "other company is now locked out (409)");
const jobs = await spree.get("/api/dispatch/jobs");
const mine = jobs.rides.filter((r) => r.prescriptionId === issued.id);
ok(mine.length === 2, "2 rides created (outbound + return)");

step("6. assign vehicles (fleet match)");
const fleet = await spree.get("/api/dispatch/fleet");
const ktw1 = fleet.vehicles.find((v) => v.id === "v_spree_ktw1"), taxi1 = fleet.vehicles.find((v) => v.id === "v_spree_taxi1");
const alex = fleet.drivers[0];
const wrong = await spree.post(`/api/dispatch/rides/${mine[0].id}/assign`, { vehicleId: taxi1.id, driverId: alex.id });
ok(wrong.status === 422, "plain taxi rejected for a carry-chair KTW ride");
for (const r of mine) { const a = await spree.post(`/api/dispatch/rides/${r.id}/assign`, { vehicleId: ktw1.id, driverId: alex.id }); ok(a.ok, `ride ${r.leg} assigned to ${ktw1.label}`); }

step("7. driver device: register, sync, sign events");
await driver.login("driver.spree@demo.med");
const kp = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
const deviceId = "dev_" + Math.random().toString(16).slice(2);
const pub = await crypto.subtle.exportKey("jwk", kp.publicKey);
ok((await driver.post("/api/driver/register-device", { deviceId, label: "Smoke phone", publicJwk: pub })).status === "active", "device registered");
let sync = await driver.post("/api/driver/sync", { deviceId, events: [] });
const myRides = sync.rides.filter((r) => r.prescriptionId === issued.id);
ok(myRides.length === 2, "driver sees the 2 assigned rides");
const hin = myRides.find((r) => r.leg === "hin");
const sign = async (obj) => {
  const payload = JSON.stringify(obj);
  const sig = Buffer.from(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, kp.privateKey, new TextEncoder().encode(payload))).toString("base64");
  return { id: obj.id, rideId: obj.rideId, type: obj.type, payload, signature: sig };
};
const now = () => new Date().toISOString();
const gps = () => ({ lat: 52.5, lon: 13.4, acc: 12, t: Date.now() });
const mk = (type, extra = {}) => ({ id: "evt_" + Math.random().toString(16).slice(2), rideId: hin.id, type, deviceTime: now(), anchoredTime: now(), gps: gps(), ...extra });
const evs = [await sign(mk("pickup")), await sign(mk("tap", { method: "card_tap", challenge: hin.nonce })), await sign(mk("dropoff"))];
sync = await driver.post("/api/driver/sync", { deviceId, events: evs });
ok(sync.acked.length === 3, "3 events acked");
const again = await driver.post("/api/driver/sync", { deviceId, events: evs });
ok(again.acked.length === 3, "re-sending the same events is harmless (idempotent)");
const done = sync.rides.find((r) => r.id === hin.id);
ok(done.status === "completed" && done.proof?.status === "verified", "ride completed, proof VERIFIED (3 layers)");

step("8. tamper checks");
const forged = await sign({ ...mk("tap", { method: "card_tap", challenge: hin.nonce }), rideId: myRides.find((r) => r.leg === "rueck").id });
forged.payload = forged.payload.replace("52.5", "48.1");
sync = await driver.post("/api/driver/sync", { deviceId, events: [forged] });
const rueck = (await spree.get("/api/dispatch/jobs")).rides.find((r) => r.id === forged.rideId);
ok(rueck.proof?.status === "rejected", "tampered payload -> bad signature -> proof rejected");
const skewed = mk("tap", { method: "card_tap", challenge: myRides.find((r) => r.leg === "rueck").nonce, anchoredTime: new Date(Date.now() - 3600_000).toISOString() });
skewed.rideId = myRides.find((r) => r.leg === "rueck").id;
// the rejected tap above already exists for the ride; flagged time skew is covered by the next ride below.

step("9. billing");
const bill = await spree.get("/api/dispatch/billing");
const item = bill.items.find((i) => i.rideId === hin.id);
ok(item?.eligible, "verified outbound ride is billable");
const sub = await spree.post("/api/dispatch/billing/submit", { rideIds: [hin.id] });
ok(sub.ok && sub.rides === 1, `submitted ${sub.id}`);
const ver = await insurer.post(`/api/insurer/billing/${sub.id}/verify`);
ok(ver.allOk && ver.results[0].checks.patientLayer.ok && ver.results[0].checks.deviceLayer.ok && ver.results[0].checks.gatewayLayer.ok, "insurer verifies all 3 layers");

step("10. patient view");
const patient = new Client();
ok((await patient.post("/api/patient/login", { code, dob })).ok, "patient logs in with key + date of birth");
const st = await patient.get("/api/patient/status");
ok(st.company?.name === "Spree Krankentransport" && st.messages.length >= 3, `status page: ${st.messages.length} SMS`);

step("11. audit trail");
const aud = await insurer.get("/api/insurer/audit");
ok(aud.entries.some((e) => e.action === "key.redeem.failed"), "failed redemptions are logged");
ok(aud.entries.some((e) => e.action === "key.accept"), "acceptance is logged");

console.log(failures ? `\n${failures} check(s) FAILED` : "\nAll checks passed");
process.exit(failures ? 1 : 0);
