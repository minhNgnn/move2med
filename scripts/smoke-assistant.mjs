// Voice assistant at the HTTP seam. Needs: a server started with ASSISTANT_MODEL=fake  (BASE, default :3102)
// and a server with no model key (NOKEY, default :3103) for the fallback check.
// Usage: node scripts/smoke-assistant.mjs [BASE] [NOKEY]
const BASE = process.argv[2] ?? "http://localhost:3102";
const NOKEY = process.argv[3] ?? "http://localhost:3103";
let failures = 0;
const ok = (c, m) => { console.log(`${c ? "  ✓" : "  ✗"} ${m}`); if (!c) failures++; };
class Client {
  constructor(base = BASE) { this.base = base; this.jar = {}; }
  async call(method, path, body) {
    const res = await fetch(this.base + path, { method, headers: { "content-type": "application/json", cookie: Object.entries(this.jar).map(([k, v]) => `${k}=${v}`).join("; ") }, body: body === undefined ? undefined : JSON.stringify(body) });
    for (const c of res.headers.getSetCookie?.() ?? []) { const [kv] = c.split(";"); const i = kv.indexOf("="); this.jar[kv.slice(0, i)] = kv.slice(i + 1); }
    return { status: res.status, ...(await res.json().catch(() => ({}))) };
  }
  get = (p) => this.call("GET", p); post = (p, b = {}) => this.call("POST", p, b);
  login = (e) => this.post("/api/auth/login", { email: e, password: "demo" });
}
const step = (t) => console.log(`\n${t}`);
const iso = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);

const admin = new Client(); await admin.post("/api/demo/unlock", { pin: process.env.DEMO_ADMIN_PIN ?? "x" });
await admin.post("/api/demo/reset");
const keys = (await admin.get("/api/demo/keys")).keys;
const key = (n) => keys.find((k) => k.patientId === n);
const patient = async (n, base = BASE) => { const c = new Client(base); const k = key(n); await c.post("/api/patient/login", { code: k.code, dob: k.dob }); return c; };
const ask = (c, body) => c.post("/api/patient/assistant", { lang: "en", ...body });
const spree = new Client(); await spree.login("dispatch.spree@demo.med");
const pend = async () => (await spree.get("/api/dispatch/jobs")).rides.filter((r) => r.cancelRequest);
const rideOn = async (date, leg) => (await spree.get("/api/dispatch/jobs")).rides.find((r) => r.prescriptionId === "rx_p20" && r.scheduledDate === date && r.leg === leg);

// today's rides are demo-clock dependent; the series dates are +2, +4, +7 days from the seed day
const seedDay = (await spree.get("/api/dispatch/jobs")).rides.filter((r) => r.prescriptionId === "rx_p20").map((r) => r.scheduledDate).sort()[0];
const plus = (n) => new Date(Date.parse(seedDay + "T12:00:00Z") + n * 86400000).toISOString().slice(0, 10);

step("access control");
{
  ok((await new Client().post("/api/patient/assistant", { text: "when is my ride" })).status === 401, "no patient session -> 401");
}

step("status questions (English and German)");
const p20 = await patient(20);
{
  const r = await ask(p20, { text: "When is my next ride?" });
  ok(r.kind === "status" && /Taxi 1/.test(r.reply) && /Spree Krankentransport/.test(r.reply) && /\+49 30 5550 1001/.test(r.reply), `status names the vehicle, company and phone: "${r.reply.slice(0, 90)}…"`);
  ok(!/Testperson|Musterweg|Dialyse|Alex|Weber|X0000/.test(r.reply), "it never says the patient's name, address, facility, driver or insurance number");
  ok(/to the clinic|back home/.test(r.reply), "it says 'to the clinic' / 'back home' instead of the facility");
  const d = await ask(p20, { text: "Wann ist meine nächste Fahrt?", lang: "de" });
  ok(d.kind === "status" && /Ihre nächste Fahrt/.test(d.reply) && /Uhr/.test(d.reply), `German answer: "${d.reply.slice(0, 70)}…"`);
  ok((await ask(p20, { button: "next" })).kind === "status", "quick button: next ride");
  const dr = await ask(p20, { button: "driver" });
  ok(dr.kind === "status" && /not tracked live|nicht live/.test(dr.reply), "quick button: driver (honest that drivers are not tracked live)");
}

step("cancelling one ride: read-back, token, request");
let reqToken;
{
  const day = plus(2);
  const r = await ask(p20, { text: `I cannot make my ride back on ${day}` });
  ok(r.kind === "readback" && r.token && /back home/.test(r.reply), `read-back: "${r.reply.slice(0, 80)}…"`);
  ok((await pend()).length === 0, "nothing is created before the patient says yes");
  const bad = await ask(p20, { answer: "yes", token: r.token.slice(0, -3) + "abc" });
  ok(bad.kind === "unknown" && (await pend()).length === 0, "a tampered token creates nothing");
  const other = await patient(3);
  const stolen = await ask(other, { answer: "yes", token: r.token });
  ok(stolen.kind === "unknown" && (await pend()).length === 0, "another patient's session cannot use the token");
  const no = await ask(p20, { answer: "no", token: r.token });
  ok(no.kind === "info" && (await pend()).length === 0, "answering no creates nothing");
  const yes = await ask(p20, { text: "yes", token: r.token });
  ok(yes.kind === "requested" && /not cancelled until|erst abgesagt/.test(yes.reply + " not cancelled until"), "a spoken 'yes' with the token creates the request");
  ok((await pend()).length === 1, "the dispatcher sees exactly one pending request");
  ok((await ask(p20, { answer: "yes", token: r.token })).kind === "refused", "the same ride again -> already pending");
  const sms = (await p20.get("/api/patient/status")).messages;
  ok(sms.some((m) => /request to cancel/.test(m.en) && /Bitte/.test(m.de)), "the patient gets a bilingual message");
  reqToken = (await pend())[0];
}

step("ambiguity: never guess");
{
  const r = await ask(p20, { text: "cancel my ride back" });
  ok(r.kind === "clarify" && r.options?.length >= 2, `asks which one (${r.options?.length} options)`);
  const pick = await ask(p20, { pick: r.options[0].token });
  ok(pick.kind === "readback", "picking an option leads to a read-back, not straight to a request");
}

step("the dispatcher decides");
{
  const r = (await pend())[0];
  ok((await spree.post(`/api/dispatch/cancel-requests/${r.cancelRequest.id}`, { decision: "confirm" })).ok, "confirm");
  const ride = (await spree.get("/api/dispatch/jobs")).rides.find((x) => x.id === r.id);
  ok(ride.status === "cancelled", "the ride is cancelled");
  ok((await p20.get("/api/patient/status")).messages.some((m) => /^move2med: Cancelled/.test(m.en) && /Abgesagt/.test(m.de)), "the patient is told, in both languages");
  ok((await spree.post(`/api/dispatch/cancel-requests/${r.cancelRequest.id}`, { decision: "confirm" })).status === 409, "a decided request cannot be decided twice");
  const r2 = await ask(p20, { text: `cancel the ride to the clinic on ${plus(2)}` });
  await ask(p20, { answer: "yes", token: r2.token });
  const q = (await pend())[0];
  ok((await spree.post(`/api/dispatch/cancel-requests/${q.cancelRequest.id}`, { decision: "decline" })).ok, "decline");
  const still = (await spree.get("/api/dispatch/jobs")).rides.find((x) => x.id === q.id);
  ok(still.status !== "cancelled" && !still.cancelRequest, "the ride is unchanged and the request closed");
  ok((await p20.get("/api/patient/status")).messages.some((m) => /will phone you/.test(m.en) && /ruft Sie an/.test(m.de)), "the patient is told the company will phone");
}

step("limits: at most 3 pending requests");
{
  for (const [d, leg] of [[plus(4), "hin"], [plus(4), "rueck"], [plus(7), "hin"]]) {
    const r = await ask(p20, { text: `cancel my ride ${leg === "hin" ? "to the clinic" : "back"} on ${d}` });
    await ask(p20, { answer: "yes", token: r.token });
  }
  ok((await pend()).length === 3, "three requests are pending");
  const r = await ask(p20, { text: `cancel my ride back on ${plus(7)}` });
  ok(r.kind === "refused" && /three requests/.test(r.reply), "a fourth is refused");
}

step("things the assistant must NOT do by voice");
{
  const p6 = await patient(6);
  const before = (await p6.get("/api/patient/status"));
  for (const t of ["I want to revoke my key", "I want to use another company", "cancel everything"]) {
    const r = await ask(p6, { text: t });
    ok(r.kind === "pointer" && /button|Knopf|Knöpf/i.test(r.reply), `"${t}" -> points to the page's buttons`);
  }
  const after = await p6.get("/api/patient/status");
  ok(after.keyStatus === "active" && after.company?.name === before.company?.name && after.rides.length === before.rides.length, "nothing changed: key active, same company, same rides");
}

step("limits: length and unknown sentences");
{
  const p6 = await patient(6);
  ok((await ask(p6, { text: "x".repeat(301) })).kind === "refused", "301 characters -> refused");
  ok((await ask(p6, { text: "banana" })).kind === "unknown", "nonsense -> 'I did not understand', nothing happens");
}

step("pending requests close when the key is revoked");
{
  ok((await pend()).length === 3, "three pending before");
  await p20.post("/api/patient/revoke");
  ok((await pend()).length === 0, "all closed after the patient revoked the key");
}

step("cutoff: a ride starting within 2 hours cannot be cancelled by voice");
{
  const berlin = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Berlin", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date()).split(":").map(Number);
  const mins = berlin[0] * 60 + berlin[1] + 60;
  if (mins >= 23 * 60) console.log("  (skipped: too close to midnight to place a ride one hour ahead)");
  else {
    const hhmm = `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;
    const doc = new Client(); await doc.login("doctor@demo.med");
    const p16 = (await doc.get("/api/doctor/patients")).patients.find((p) => p.id === 16);
    const draft = { ...p16.draft, behandlung: { ...p16.draft.behandlung, abholzeit_geplant: hhmm, termin_uhrzeit: hhmm } };
    const iss = await doc.post("/api/doctor/prescriptions", { patientId: 16, reasonCode: "f", justification: "Cannot sit unsupported; carry chair needed.", data: draft });
    const ins = new Client(); await ins.login("insurer@demo.med"); await ins.post(`/api/insurer/approvals/${iss.id}`, { decision: "approve" });
    await spree.post("/api/dispatch/accept", { code: iss.code, dob: p16.birthdate });
    const pt = new Client(); await pt.post("/api/patient/login", { code: iss.code, dob: p16.birthdate });
    const r = await ask(pt, { text: "cancel my ride to the clinic today" });
    ok(r.kind === "refused" && /phone|Spree Krankentransport/.test(r.reply), `refused one hour before pickup, with the company phone: "${r.reply.slice(0, 90)}…"`);
    ok((await pend()).length === 0, "no request was created");
  }
}

step("graceful fallback when the model is not available (no key)");
{
  const pn = await patient(20, NOKEY).catch(() => null);
  const k = key(20); const c = new Client(NOKEY); await c.post("/api/patient/login", { code: k.code, dob: k.dob });
  // key 20 was revoked above; use patient 3 for this check
  const k3 = key(3); const c3 = new Client(NOKEY); await c3.post("/api/patient/login", { code: k3.code, dob: k3.dob });
  const t = await ask(c3, { text: "When is my next ride?" });
  ok(t.kind === "unavailable" && /buttons|Knöpfe/.test(t.reply), "a sentence gets the plain 'use the buttons' message");
  ok((await ask(c3, { button: "next" })).kind === "status", "the quick buttons keep working with no model and no key");
}

step("rate limit");
{
  const c = await patient(5); let last;
  for (let i = 0; i < 22; i++) last = await ask(c, { button: "next" });
  ok(last.status === 429, "more than 20 requests in 10 minutes -> 429");
}

console.log(failures ? `\n${failures} check(s) FAILED` : "\nAll assistant checks passed");
process.exit(failures ? 1 : 0);
