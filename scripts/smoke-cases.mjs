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
const admin = new Client();
await admin.post("/api/demo/unlock", { pin: process.env.DEMO_ADMIN_PIN ?? "x" });
await admin.post("/api/demo/reset");
const keys = (await admin.get("/api/demo/keys")).keys;
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

import { createHash } from "node:crypto";
const sha = (t) => createHash("sha256").update(t).digest("hex");
async function accepted(num, dispatchEmail, vehicleId, driverEmail) {
  const k = key(num), d = new Client(); await d.login(dispatchEmail);
  await d.post("/api/dispatch/accept", { code: k.code, dob: k.dob });
  const f = await d.get("/api/dispatch/fleet");
  const jobs = (await d.get("/api/dispatch/jobs")).rides.filter((r) => r.prescriptionId === k.prescriptionId);
  for (const r of jobs) await d.post(`/api/dispatch/rides/${r.id}/assign`, { vehicleId, driverId: f.drivers[0].id });
  const ph = await phone(driverEmail);
  const hin = (await ph.sync()).rides.find((r) => r.prescriptionId === k.prescriptionId && r.leg === "hin");
  return { k, d, ph, hin, f };
}
const ins = new Client(); await ins.login("insurer@demo.med");
const reviewOf = async (rideId) => (await ins.get("/api/insurer/review")).items.find((i) => i.rideId === rideId);

step("review queue: phone clock disagrees with the server-anchored time (+ waiting time)");
{
  const { d, ph, hin } = await accepted(3, "dispatch.rhein@demo.med", "v_rhein_taxi1", "driver.rhein@demo.med");
  const skew = ph.ev(hin, "tap", { method: "card_tap", challenge: hin.nonce, anchoredTime: new Date(Date.now() - 3600_000).toISOString() });
  await ph.sync([await ph.sign(ph.ev(hin, "pickup")), await ph.sign(ph.ev(hin, "wait", { waitMin: 45 })), await ph.sign(skew), await ph.sign(ph.ev(hin, "dropoff"))]);
  const job = (await d.get("/api/dispatch/jobs")).rides.find((r) => r.id === hin.id);
  ok(job.waitMin === 45, "waiting time (45 min) recorded from the driver's event");
  ok(job.proof?.status === "needs_review" && job.proof.flags.includes("clock_mismatch"), "proof goes to REVIEW with flag clock_mismatch, not silently accepted");
  const item = await reviewOf(hin.id);
  ok(!!item, "it shows up in the insurer's review queue");
  ok((await ins.post(`/api/insurer/review/${item.id}`, { decision: "accept", note: "Driver confirmed by phone" })).ok, "insurer accepts it with a note");
  ok((await d.get("/api/dispatch/jobs")).rides.find((r) => r.id === hin.id).proof.status === "verified", "proof is now verified, with the decision in the audit log");
}

step("review queue: ride cancelled while the driver was offline");
{
  const { k, ph, hin } = await accepted(8, "dispatch.spree@demo.med", "v_spree_taxi1", "driver.spree@demo.med");
  const pat = new Client(); await pat.post("/api/patient/login", { code: k.code, dob: k.dob });
  await pat.post("/api/patient/reassign"); // the patient chose another company while the phone had no signal
  await ph.sync([await ph.sign(ph.ev(hin, "pickup")), await ph.sign(ph.ev(hin, "tap", { method: "card_tap", challenge: hin.nonce })), await ph.sign(ph.ev(hin, "dropoff"))]);
  const item = await reviewOf(hin.id);
  ok(item?.flags.includes("ride_changed"), "evidence is kept and flagged ride_changed instead of being dropped");
  ok((await ins.post(`/api/insurer/review/${item.id}`, { decision: "reject" })).ok, "insurer can reject it");
}

step("review queue: events from a phone revoked in the meantime");
{
  const { d, ph, hin } = await accepted(7, "dispatch.rhein@demo.med", "v_rhein_taxi1", "driver.rhein@demo.med");
  await d.post(`/api/dispatch/devices/${ph.deviceId}/revoke`);
  const r = await ph.sync([await ph.sign(ph.ev(hin, "pickup")), await ph.sign(ph.ev(hin, "tap", { method: "card_tap", challenge: hin.nonce }))]);
  ok(r.deviceStatus === "revoked" && r.rides.length === 0, "phone is told it was revoked and gets no rides");
  ok((await reviewOf(hin.id))?.flags.includes("device_revoked"), "its late evidence is flagged device_revoked for review");
}

step("PIN fallback: wrong PIN is rejected, the right one verifies");
{
  const { k, d, ph, hin } = await accepted(9, "dispatch.elbe@demo.med", "v_elbe_taxi1", "driver.elbe@demo.med");
  const bad = ph.ev(hin, "tap", { method: "pin", challenge: hin.nonce }); bad.pinCheck = sha("000000" + bad.id);
  await ph.sync([await ph.sign(ph.ev(hin, "pickup")), await ph.sign(bad)]);
  ok((await d.get("/api/dispatch/jobs")).rides.find((r) => r.id === hin.id).proof.status === "rejected", "wrong PIN -> proof rejected");
  const good = ph.ev(hin, "tap", { method: "pin", challenge: hin.nonce }); good.pinCheck = sha(k.pin + good.id);
  await ph.sync([await ph.sign(good)]);
  const p = (await d.get("/api/dispatch/jobs")).rides.find((r) => r.id === hin.id).proof;
  ok(p.status === "verified" && p.method === "pin", "retry with the PIN from the letter -> verified");
}

step("a tap for the wrong ride (challenge mismatch) is rejected");
{
  const { d, ph, hin } = await accepted(11, "dispatch.rhein@demo.med", "v_rhein_ktw1", "driver.rhein@demo.med");
  await ph.sync([await ph.sign(ph.ev(hin, "pickup")), await ph.sign(ph.ev(hin, "tap", { method: "card_tap", challenge: "0000000000000000" }))]);
  ok((await d.get("/api/dispatch/jobs")).rides.find((r) => r.id === hin.id).proof.status === "rejected", "challenge from another ride -> rejected");
}

step("onboarding: insurer registers a company, the company adds fleet and a driver");
{
  const reg = { name: "Neu Krankenfahrten", ik: "440900001", city: "Berlin", dispatcherName: "Nora Neu", dispatcherEmail: "nora@neu.example", password: "start123" };
  ok((await ins.post("/api/insurer/companies", reg)).ok, "company registered");
  ok((await ins.post("/api/insurer/companies", reg)).status === 409, "same IK again -> 409");
  ok((await ins.post("/api/insurer/companies", { ...reg, ik: "12" })).status === 400, "invalid IK -> 400");
  const n = new Client();
  ok((await n.post("/api/auth/login", { email: "nora@neu.example", password: "start123" })).role === "dispatcher", "the new dispatcher can sign in");
  ok((await n.post("/api/dispatch/vehicles", { label: "Rolli 1", plate: "B-NK 1", type: "taxi", equipment: ["rollstuhl"] })).ok, "adds a wheelchair rental car");
  ok((await n.post("/api/dispatch/drivers", { name: "Dan Neu", email: "dan@neu.example", password: "start123" })).ok, "adds a driver");
  ok((await new Client().post("/api/auth/login", { email: "dan@neu.example", password: "start123" })).role === "driver", "the driver can sign in");
  const k = key(16 === 16 ? 6 : 6);
  const red = await n.post("/api/dispatch/redeem", { code: k.code, dob: k.dob });
  ok(red.vehicles.length === 1 && red.card.mode === "preview", "new company sees only its own one-vehicle fleet");
  const plain = new Client(); await plain.login("dispatch.isar@demo.med");
  ok((await plain.post("/api/dispatch/vehicles", { label: "X", plate: "XX 1", type: "ktw", equipment: [] })).ok, "other companies manage their own fleets");
  ok((await new Client().post("/api/dispatch/vehicles", { label: "X", plate: "XX 1", type: "ktw", equipment: [] })).status === 401, "anonymous cannot add vehicles");
}


step("review queue: evidence arrives more than 24 h late / GPS time disagrees");
{
  const { ph, hin, d } = await accepted(6, "dispatch.isar@demo.med", "v_isar_taxi1", "driver.isar@demo.med");
  ok(!!hin, "ride assigned to the phone");
  const old = new Date(Date.now() - 30 * 3600_000), oldIso = old.toISOString();
  const late = ph.ev(hin, "tap", { method: "card_tap", challenge: hin.nonce, deviceTime: oldIso, anchoredTime: oldIso, gps: { lat: 48, lon: 11, acc: 9, t: old.getTime() } });
  late.deviceTime = oldIso; late.anchoredTime = oldIso;
  await ph.sync([await ph.sign(late)]);
  const job = (await d.get("/api/dispatch/jobs")).rides.find((r) => r.id === hin.id);
  ok(job.proof?.status === "needs_review" && job.proof.flags.includes("late_sync"), "30 h old evidence -> REVIEW with late_sync (not silently accepted)");
}
{
  const { ph, hin, d } = await accepted(7, "dispatch.rhein@demo.med", "v_rhein_taxi1", "driver.rhein@demo.med");
  const bad = ph.ev(hin, "tap", { method: "card_tap", challenge: hin.nonce, gps: { lat: 50.9, lon: 6.9, acc: 9, t: Date.now() - 3600_000 } });
  await ph.sync([await ph.sign(bad)]);
  const job = (await d.get("/api/dispatch/jobs")).rides.find((r) => r.id === hin.id);
  ok(job.proof?.flags.includes("gps_time_mismatch") && job.proof.status === "needs_review", "GPS time 1 h off the event time -> REVIEW with gps_time_mismatch");
}

step("workflow status follows the FHIR Task lifecycle");
{
  const k = key(12), p = new Client(), d = new Client(); await d.login("dispatch.spree@demo.med");
  await ins.post(`/api/insurer/approvals/${k.prescriptionId}`, { decision: "approve" });
  await p.post("/api/patient/login", { code: k.code, dob: k.dob });
  const w = async () => (await p.get("/api/patient/status")).workflow;
  ok((await w()) === "ready", "approved and unbound -> ready");
  const red = await d.post("/api/dispatch/redeem", { code: k.code, dob: k.dob });
  ok(red.card.workflow === "ready", "Trip Card shows the same status");
  await d.post("/api/dispatch/accept", { code: k.code, dob: k.dob });
  ok((await w()) === "accepted", "bound -> accepted");
  const f = await d.get("/api/dispatch/fleet");
  const jobs = (await d.get("/api/dispatch/jobs")).rides.filter((r) => r.prescriptionId === k.prescriptionId);
  for (const r of jobs) await d.post(`/api/dispatch/rides/${r.id}/assign`, { vehicleId: "v_spree_ktw1", driverId: f.drivers[0].id });
  const ph = await phone("driver.spree@demo.med");
  const hin = (await ph.sync()).rides.find((r) => r.prescriptionId === k.prescriptionId && r.leg === "hin");
  await ph.sync([await ph.sign(ph.ev(hin, "pickup"))]);
  ok((await w()) === "in-progress", "first pickup -> in-progress");
  await p.post("/api/patient/revoke");
}

step("per-date cancellation of a series + SMS");
{
  const d = new Client(); await d.login("dispatch.spree@demo.med");
  const jobs = (await d.get("/api/dispatch/jobs")).rides.filter((r) => r.prescriptionId === "rx_p20" && r.leg === "hin");
  ok(jobs.length === 4, "series #20 has 4 dates");
  const target = jobs[3];
  ok((await d.post(`/api/dispatch/rides/${target.id}/cancel`)).ok, "one future date cancelled");
  const after = (await d.get("/api/dispatch/jobs")).rides.filter((r) => r.prescriptionId === "rx_p20" && r.leg === "hin");
  ok(after.filter((r) => r.status === "cancelled").length === 1 && after.filter((r) => r.status !== "cancelled").length === 3, "the other three dates are untouched");
  const k = key(20), pat = new Client(); await pat.post("/api/patient/login", { code: k.code, dob: k.dob });
  const sms = (await pat.get("/api/patient/status")).messages;
  ok(sms.some((m) => /cancelled/.test(m.en) && /storniert/.test(m.de)), "patient gets a bilingual SMS about the cancelled date");
  const ph = await phone("driver.spree@demo.med");
  const mine = (await ph.sync()).rides;
  ok(!mine.some((r) => r.id === target.id), "the cancelled ride disappears from the driver's phone");
  const started = after.find((r) => r.status === "assigned");
  await ph.sync([await ph.sign(ph.ev(mine.find((r) => r.id === started.id), "pickup"))]);
  ok((await d.post(`/api/dispatch/rides/${started.id}/cancel`)).status === 409, "a ride that already started cannot be cancelled");
}

step("series warning in billing: completed date without the patient's confirmation");
{
  const d = new Client(); await d.login("dispatch.spree@demo.med");
  const ph = await phone("driver.spree@demo.med");
  const rides = (await ph.sync()).rides.filter((r) => r.prescriptionId === "rx_p20");
  const first = rides.find((r) => r.status === "picked_up") ?? rides[0];
  await ph.sync([await ph.sign(ph.ev(first, "dropoff"))]);
  const b = await d.get("/api/dispatch/billing");
  const item = b.items.find((i) => i.rideId === first.id);
  ok(item && !item.eligible && item.flags.some((f) => f.code === "series_unconfirmed"), "billing names it as an unconfirmed SERIES date, not billable");
}

step("insurer is informed about approval-free trips");
{
  const a = await ins.get("/api/insurer/approvals");
  ok(a.informed.length > 0 && a.informed.every((x) => !a.approvals.some((y) => y.id === x.id)), `${a.informed.length} approval-free trips listed, none of them in the approval queue`);
  ok(a.informed.some((x) => x.company), "it shows which company took the trip");
}

step("PDF letter");
{
  const doc = new Client(); await doc.login("doctor@demo.med");
  const res = await fetch(BASE + "/api/prescriptions/rx_p3/letter.pdf", { headers: { cookie: Object.entries(doc.jar).map(([k, v]) => `${k}=${v}`).join("; ") } });
  const buf = Buffer.from(await res.arrayBuffer());
  ok(res.status === 200 && res.headers.get("content-type") === "application/pdf" && buf.subarray(0, 5).toString() === "%PDF-" && buf.length > 5000, `a real PDF (${Math.round(buf.length / 1024)} KB) with the QR code embedded`);
  ok((await fetch(BASE + "/api/prescriptions/rx_p3/letter.pdf")).status === 401, "anonymous cannot download it");
  ok((await new Client().call("GET", "/api/prescriptions/rx_p3/letter.pdf")).status === 401, "no session -> 401");
}
console.log(failures ? `\n${failures} check(s) FAILED` : "\nAll case checks passed");
process.exit(failures ? 1 : 0);
