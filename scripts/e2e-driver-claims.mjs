// Phone-side claims in a real browser: a tampered clock is caught, and stale unsynced evidence is warned about.
// Needs a PRODUCTION server on :3100 and playwright (see e2e-driver.mjs). Usage: node scripts/e2e-driver-claims.mjs <screenshot-dir>
import { chromium } from "playwright";
const BASE = "http://localhost:3100", J = { "content-type": "application/json" };
let fails = 0; const ok = (c, m) => { console.log(`${c ? "  ✓" : "  ✗"} ${m}`); if (!c) fails++; };
await fetch(BASE + "/api/demo/reset", { method: "POST", headers: J, body: "{}" });
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, geolocation: { latitude: 52.5, longitude: 13.4 }, permissions: ["geolocation"] });
// A controllable clock: the phone's wall clock can be pushed forward (= someone changing the system time).
await ctx.addInitScript(() => {
  const R = Date; window.__skew = 0;
  class D extends R { constructor(...a) { if (a.length === 0) super(R.now() + window.__skew); else super(...a); } static now() { return R.now() + window.__skew; } }
  window.Date = D;
});
const p = await ctx.newPage(); p.on("pageerror", (e) => console.log("  PAGEERROR", e.message));
await p.goto(BASE + "/driver");
await p.fill("input[type=email]", "driver.spree@demo.med"); await p.fill("input[type=password]", "demo"); await p.getByRole("button", { name: /^Sign in$/ }).click();
await p.waitForSelector("article", { timeout: 20000 });

console.log("1. someone sets the phone clock 2 hours ahead, then the driver does a ride");
await p.evaluate(() => { window.__skew = 2 * 3600_000; });
await p.locator("article").first().locator("button").first().click();
await p.getByRole("button", { name: /Patient picked up/ }).click({ force: true }); await p.waitForSelector("text=Patient confirms");
await p.getByRole("button", { name: /Patient confirms/ }).click({ force: true }); await p.getByRole("button", { name: /Simulate card tap/ }).click({ force: true });
await p.waitForSelector("text=Confirmed. Saved and signed"); await p.waitForTimeout(2200);
await p.evaluate(() => { window.__skew = 0; });
await p.waitForFunction(() => /Synced/.test(document.querySelector("header")?.innerText ?? ""), null, { timeout: 30000 });
await p.waitForTimeout(1500);
const dl = await fetch(BASE + "/api/auth/login", { method: "POST", headers: J, body: JSON.stringify({ email: "insurer@demo.med", password: "demo" }) });
const ck = dl.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
const rev = await (await fetch(BASE + "/api/insurer/review", { headers: { cookie: ck } })).json();
ok(rev.items.some((i) => i.flags.includes("clock_mismatch")), "the tampered clock was caught: proof in the insurer's review queue with clock_mismatch");
await p.screenshot({ path: process.argv[2] + "/30-driver-after-skew.png" });

console.log("2. events waiting for more than 4 hours show a warning");
await p.evaluate(async () => {
  const db = await new Promise((r) => { const q = indexedDB.open("m2m-driver"); q.onsuccess = () => r(q.result); });
  // go offline-ish: write an old unsent event row directly
  await new Promise((r) => { const tx = db.transaction("events", "readwrite"); tx.objectStore("events").put({ id: "evt_old", rideId: "x", type: "wait", payload: "{}", signature: "x", createdAt: Date.now() - 5 * 3600_000 }); tx.oncomplete = r; });
});
await p.waitForTimeout(3500); // let the service worker cache the shell
await p.context().setOffline(true);
await p.reload(); await p.waitForSelector("article"); await p.waitForTimeout(800);
ok(await p.locator("text=Unsynced for more than 4 hours").count() === 1, "red 'unsynced for more than 4 hours' banner appears");
await p.screenshot({ path: process.argv[2] + "/31-driver-stale-warning.png" });
await b.close();
console.log(fails ? `${fails} FAILED` : "phone claims verified");
