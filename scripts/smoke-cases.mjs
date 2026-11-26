// The side cases of the demo: node scripts/smoke-cases.mjs [baseUrl]  (after: node scripts/smoke.mjs works, server running)
import { webcrypto as crypto } from "node:crypto";
const BASE = process.argv[2] ?? "http://localhost:3100";
let failures = 0;
const ok = (c, m) => { console.log(`${c ? "  ✓" : "  ✗"} ${m}`); if (!c) failures++; };
class Client {
  jar = {};
  async call(method, path, body) {
    const res = await fetch(BASE + path, { method, headers: { "content-type": "application/json", cookie: Object.entries(this.jar).map(([k, v]) => `${k}=${v}`).join("; ") }, body: body === undefined ? undefined : JSON.stringify(body) });
    for (const c of res.headers.getSetCookie?.() ?? []) { const [kv] = c.split(";"); const i = kv.indexOf("="); this.jar[kv.slice(0, i)] = kv.slice(i + 1); }
    return { status: res.status, ...(await res.json().catch(() => ({}))) };
  }
  get = (p) => this.call("GET", p); post = (p, b = {}) => this.call("POST", p, b);
  login = (e) => this.post("/api/auth/login", { email: e, password: "demo" });
}
const step = (t) => console.log(`\n${t}`);
await new Client().post("/api/demo/reset");
const keys = (await new Client().get("/api/demo/keys")).keys;
const key = (n) => keys.find((k) => k.patientId === n);

async function phone(email) {
  const c = new Client(); await c.login(email);
  const kp = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  const deviceId = "dev_" + Math.random().toString(16).slice(2);
  await c.post("/api/driver/register-device", { deviceId, label: "Case phone", publicJwk: await crypto.subtle.exportKey("jwk", kp.publicKey) });
  const sign = async (o) => { const payload = JSON.stringify(o); return { id: o.id, rideId: o.rideId, type: o.type, payload, signature: Buffer.from(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, kp.privateKey, new TextEncoder().encode(payload))).toString("base64") }; };
  const ev = (ride, type, extra = {}) => ({ id: "evt_" + Math.random().toString(16).slice(2), rideId: ride.id, type, deviceTime: new Date().toISOString(), anchoredTime: new Date().toISOString(), gps: { lat: 52, lon: 13, acc: 10, t: Date.now() }, ...extra });
  return { c, deviceId, sign, ev, sync: (events = []) => c.post("/api/driver/sync", { deviceId, events }) };
}

step("#13 work accident: co-payment wrongly charged (rule conflict in the mock data)");
{
  const k = key(13), d = new Client(); await d.login("dispatch.elbe@demo.med");
  ok((await d.post("/api/dispatch/accept", { code: k.code, dob: k.dob })).card, "Elbe accepts #13");
  const jobs = (await d.get("/api/dispatch/jobs")).rides.filter((r) => r.prescriptionId === k.prescriptionId);
  const f = (await d.get("/api/dispatch/fleet"));
  for (const r of jobs) await d.post(`/api/dispatch/rides/${r.id}/assign`, { vehicleId: "v_elbe_ktw1", driverId: f.drivers[0].id });
  const ph = await phone("driver.elbe@demo.med");
  const rides = (await ph.sync()).rides.filter((r) => r.prescriptionId === k.prescriptionId);
  const hin = rides.find((r) => r.leg === "hin");
  await ph.sync([await ph.sign(ev(hin, "pickup")), await ph.sign(ev(hin, "tap", { method: "card_tap", challenge: hin.nonce })), await ph.sign(ev(hin, "dropoff"))]);
  function ev(r, t, x) { return ph.ev(r, t, x); }
  let b = await d.get("/api/dispatch/billing");
  let item = b.items.find((i) => i.rideId === hin.id);
  ok(!item.eligible && item.flags.some((x) => x.code === "copay_mismatch"), "billing blocked: co-payment 10 € billed, 0 € expected (accident case)");
  ok((await d.post("/api/dispatch/billing/submit", {})).status === 409, "submit refused (nothing ready to bill)");
  const fix = await d.post(`/api/dispatch/prescriptions/${k.prescriptionId}/correct-copay`);
  ok(fix.before === 10 && fix.after === 0, "explicit, audited correction 10 € -> 0 €");
  b = await d.get("/api/dispatch/billing"); item = b.items.find((i) => i.rideId === hin.id);
  ok(item.eligible, "ride is now billable");
  const ins = new Client(); await ins.login("insurer@demo.med");
  ok((await ins.get("/api/insurer/audit")).entries.some((e) => e.action === "copay.correct"), "correction is in the audit log");
}

step("#10 hospice: relative confirms as proxy");
{
  const k = key(10), d = new Client(); await d.login("dispatch.isar@demo.med");
  await d.post("/api/dispatch/accept", { code: k.code, dob: k.dob });
  const f = await d.get("/api/dispatch/fleet");
  const jobs = (await d.get("/api/dispatch/jobs")).rides.filter((r) => r.prescriptionId === k.prescriptionId);
  for (const r of jobs) await d.post(`/api/dispatch/rides/${r.id}/assign`, { vehicleId: "v_isar_taxi1", driverId: f.drivers[0].id });
  const ph = await phone("driver.isar@demo.med");
  const hin = (await ph.sync()).rides.find((r) => r.prescriptionId === k.prescriptionId && r.leg === "hin");
  await ph.sync([await ph.sign(ph.ev(hin, "pickup")), await ph.sign(ph.ev(hin, "tap", { method: "proxy", challenge: hin.nonce })), await ph.sign(ph.ev(hin, "dropoff"))]);
  const before = (await d.get("/api/dispatch/jobs")).rides.find((r) => r.id === hin.id);
  ok(before.proof?.status === "awaiting", "proof waits for the relative (status: awaiting)");
  const rel = new Client(); await rel.post("/api/patient/login", { code: k.code, dob: k.dob });
  ok((await rel.post("/api/patient/confirm", { rideId: hin.id })).ok, "relative confirms on the status page");
  const after = (await d.get("/api/dispatch/jobs")).rides.find((r) => r.id === hin.id);
  ok(after.proof?.status === "verified" && after.proof.method === "proxy", "proof upgraded to VERIFIED (method: proxy)");
}

step("#18 bariatric 210 kg: heavy-duty vehicle required");
{
  const k = key(18), d = new Client(); await d.login("dispatch.isar@demo.med");
  const red = await d.post("/api/dispatch/redeem", { code: k.code, dob: k.dob });
  ok(red.card.sonstiges.gewicht_kg === 210, "Trip Card shows 210 kg");
  await d.post("/api/dispatch/accept", { code: k.code, dob: k.dob });
  const f = await d.get("/api/dispatch/fleet");
  const jobs = (await d.get("/api/dispatch/jobs")).rides.filter((r) => r.prescriptionId === k.prescriptionId);
  const bad = await d.post(`/api/dispatch/rides/${jobs[0].id}/assign`, { vehicleId: "v_isar_taxi1", driverId: f.drivers[0].id });
  ok(bad.status === 422, "plain taxi rejected");
  const good = await d.post(`/api/dispatch/rides/${jobs[0].id}/assign`, { vehicleId: "v_isar_ktw1", driverId: f.drivers[0].id });
  ok(good.ok, "KTW with stretcher + heavy-duty accepted");
}

step("key handling: revoke and reassign");
{
  const k = key(5), p = new Client(), d = new Client(); await d.login("dispatch.elbe@demo.med");
  await p.post("/api/patient/login", { code: k.code, dob: k.dob });
  await d.post("/api/dispatch/accept", { code: k.code, dob: k.dob });
  const re = await p.post("/api/patient/reassign");
  ok(re.code && re.code !== k.code, `reassign issues a NEW key (${re.code})`);
  ok((await d.post("/api/dispatch/redeem", { code: k.code, dob: k.dob })).status === 404, "the old key is dead");
  ok((await d.post("/api/dispatch/redeem", { code: re.code, dob: k.dob })).card?.mode === "preview", "new key works, trip is free again");
  await p.post("/api/patient/revoke");
  ok((await d.post("/api/dispatch/redeem", { code: re.code, dob: k.dob })).status === 410, "revoked key -> 410");
}

step("insurer can suspend a company");
{
  const i = new Client(), d = new Client(); await i.login("insurer@demo.med"); await d.login("dispatch.rhein@demo.med");
  await i.call("PATCH", "/api/insurer/companies/c_rhein", { status: "suspended" });
  const k = key(3);
  ok((await d.post("/api/dispatch/redeem", { code: k.code, dob: k.dob })).status === 403, "suspended company cannot redeem");
  await i.call("PATCH", "/api/insurer/companies/c_rhein", { status: "registered" });
}
console.log(failures ? `\n${failures} check(s) FAILED` : "\nAll case checks passed");
process.exit(failures ? 1 : 0);
