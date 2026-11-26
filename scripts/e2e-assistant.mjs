// Patient voice panel + dispatcher badge in real Chromium. Needs a PRODUCTION server started with ASSISTANT_MODEL=fake
// (default :3102) and playwright (see e2e-driver.mjs). Usage: node scripts/e2e-assistant.mjs [dir-for-screenshots]
import { chromium } from "playwright";
const BASE = process.env.BASE ?? "http://localhost:3102", J = { "content-type": "application/json" }, OUT = process.argv[2];
let fails = 0; const ok = (c, m) => { console.log(`${c ? "  ✓" : "  ✗"} ${m}`); if (!c) fails++; };
const unlock = await fetch(BASE + "/api/demo/unlock", { method: "POST", headers: J, body: JSON.stringify({ pin: process.env.DEMO_ADMIN_PIN ?? "x" }) });
const adm = unlock.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
await fetch(BASE + "/api/demo/reset", { method: "POST", headers: { ...J, cookie: adm }, body: "{}" });
const k = (await (await fetch(BASE + "/api/demo/keys", { headers: { cookie: adm } })).json()).keys.find((x) => x.patientId === 20);
const login = await fetch(BASE + "/api/auth/login", { method: "POST", headers: J, body: JSON.stringify({ email: "dispatch.spree@demo.med", password: "demo" }) });
const dCookies = login.headers.getSetCookie().map((c) => { const [kv] = c.split(";"); const i = kv.indexOf("="); return { name: kv.slice(0, i), value: kv.slice(i + 1), domain: "localhost", path: "/" }; });
const jobs = await (await fetch(BASE + "/api/dispatch/jobs", { headers: { cookie: dCookies.map((c) => `${c.name}=${c.value}`).join("; ") } })).json();
const first = jobs.rides.filter((r) => r.prescriptionId === "rx_p20").map((r) => r.scheduledDate).sort()[0];
const target = new Date(Date.parse(first + "T12:00:00Z") + 2 * 86400000).toISOString().slice(0, 10);

const b = await chromium.launch();
const pctx = await b.newContext({ viewport: { width: 420, height: 1000 } });
const p = await pctx.newPage(); p.on("pageerror", (e) => console.log("  PAGEERROR", e.message));
await p.goto(`${BASE}/status?k=${k.code}`); await p.locator("input").nth(1).fill(k.dob); await p.getByRole("button", { name: /Show my ride/ }).click();
await p.waitForSelector("[data-testid=voice-panel]");
const lastReply = async () => (await p.locator("[data-testid=assistant-reply]").last().innerText()).trim();
const waitReply = async (n) => p.waitForFunction((c) => document.querySelectorAll("[data-testid=assistant-reply]").length >= c, n, { timeout: 8000 });

console.log("1. quick buttons need no model");
await p.getByRole("button", { name: "When is my next ride?" }).click(); await waitReply(1);
ok(/Your next ride is/.test(await lastReply()), `answer: "${(await lastReply()).slice(0, 70)}…"`);
await p.getByRole("button", { name: "Where is my driver?" }).click(); await waitReply(2);
ok(/not tracked live/.test(await lastReply()), "driver button is honest: drivers are not tracked live");

console.log("2. typed cancellation with a read-back");
await p.getByPlaceholder("Or type here…").fill(`I cannot make my ride back on ${target}`); await p.keyboard.press("Enter"); await waitReply(3);
ok(/Do you want to cancel/.test(await lastReply()), "the assistant repeats what it understood");
ok(await p.locator("[data-testid=readback-buttons]").count() === 1, "big Yes / No buttons appear");
await p.screenshot({ path: OUT + "/50-voice-readback.png", fullPage: true });
await p.getByRole("button", { name: "Yes, cancel it" }).click(); await waitReply(4);
ok(/not cancelled until the transport company confirms/.test(await lastReply()), "only a request is sent, with an honest message");
await p.waitForSelector("text=cancellation requested", { timeout: 6000 }).catch(() => {});
ok(await p.locator("text=cancellation requested").count() >= 1, "the ride card shows 'cancellation requested'");

console.log("3. the dispatcher sees and confirms it");
const dctx = await b.newContext({ viewport: { width: 1360, height: 900 } }); await dctx.addCookies(dCookies);
const d = await dctx.newPage(); d.on("pageerror", (e) => console.log("  PAGEERROR", e.message));
await d.goto(BASE + "/dispatch"); await d.getByRole("button", { name: /^Rides/ }).click(); await d.waitForSelector("[data-testid=cancel-request]");
ok(await d.getByRole("button", { name: /cancellation request/ }).count() === 1, "the Rides tab carries a count of requests");
await d.screenshot({ path: OUT + "/51-dispatch-request.png", fullPage: true });
await d.getByRole("button", { name: "Confirm", exact: true }).click(); await d.waitForTimeout(1500);
ok(await d.locator("[data-testid=cancel-request]").count() === 0, "after Confirm the request is gone and the ride is cancelled");

console.log("4. German");
await p.getByLabel("Switch language").first().click(); await p.waitForTimeout(400);
await p.getByRole("button", { name: "Wann ist meine nächste Fahrt?" }).click(); await waitReply(5);
ok(/Ihre nächste Fahrt/.test(await lastReply()), `German answer: "${(await lastReply()).slice(0, 60)}…"`);
await p.screenshot({ path: OUT + "/52-voice-de.png", fullPage: true });
await b.close();
console.log(fails ? `${fails} FAILED` : "all assistant UI checks passed");
process.exit(fails ? 1 : 0);
