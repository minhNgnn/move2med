// Real-browser test of the offline driver app. Needs a PRODUCTION server (pnpm build && pnpm start -p 3100)
// and: pnpm add -D playwright && pnpm exec playwright install chromium
import { chromium } from "playwright";
const BASE = "http://localhost:3100";
let fails = 0;
const ok = (c, m) => { console.log(`${c ? "  ✓" : "  ✗"} ${m}`); if (!c) fails++; };
const J = { "content-type": "application/json" };

await fetch(BASE + "/api/demo/reset", { method: "POST", headers: J, body: "{}" });
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, geolocation: { latitude: 52.52, longitude: 13.4, accuracy: 15 }, permissions: ["geolocation"] });
const page = await ctx.newPage();
page.on("pageerror", (e) => console.log("  PAGEERROR", e.message));
page.on("console", (m) => { if (m.type() === "error") console.log("  console.error:", m.text().slice(0, 200)); });
const badge = async () => (await page.locator("header button").filter({ hasText: /Sync|sync|Offline|waiting/ }).first().innerText()).replace(/\s+/g, " ");

console.log("1. first launch + login");
await page.goto(BASE + "/driver");
await page.fill("input[type=email]", "driver.spree@demo.med");
await page.fill("input[type=password]", "demo");
await page.getByRole("button", { name: /^Sign in$/ }).click();
await page.waitForSelector("article", { timeout: 20000 });
const n = await page.locator("article").count();
ok(n >= 4, `${n} rides loaded from the server (next 48 h)`);
ok((await badge()).includes("Synced"), `badge: "${await badge()}"`);
const swReady = await page.evaluate(async () => !!(await navigator.serviceWorker.ready).active);
ok(swReady, "service worker active");
await page.waitForTimeout(3500); // let the shell finish caching

console.log("2. go offline, do a whole ride");
await ctx.setOffline(true);
await page.waitForTimeout(500);
ok(/offline/i.test(await badge()), `badge: "${await badge()}"`);
await page.locator("article").first().locator("button").first().click();
await page.getByRole("button", { name: /Patient picked up/ }).click();
await page.waitForSelector("text=Patient confirms");
await page.getByRole("button", { name: /Patient confirms/ }).click();
await page.getByRole("button", { name: /Simulate card tap/ }).click();
await page.waitForSelector("text=Confirmed. Saved and signed", { timeout: 8000 });
await page.waitForTimeout(2000); // overlay closes itself
await page.getByRole("button", { name: /Patient dropped off/ }).click();
await page.waitForSelector("text=done");
await page.waitForTimeout(500);
let b = await badge();
ok(/3 waiting/.test(b), `3 signed events queued offline: "${b}"`);
ok(await page.locator("text=Captured · unverified until sync").count() > 0, "proof shown as captured, unverified");

console.log("3. reload the app with no signal");
await page.reload();
await page.waitForSelector("article", { timeout: 15000 });
ok(true, "app shell + encrypted rides load offline");
b = await badge();
ok(/3 waiting/.test(b), `queue survived the reload: "${b}"`);

console.log("4. data at rest is encrypted");
const dump = await page.evaluate(async () => {
  const req = indexedDB.open("m2m-driver");
  const db = await new Promise((r) => (req.onsuccess = () => r(req.result)));
  const rows = await new Promise((r) => { const q = db.transaction("rides").objectStore("rides").getAll(); q.onsuccess = () => r(q.result); });
  return JSON.stringify(rows.map((x) => ({ keys: Object.keys(x), hasName: JSON.stringify(Array.from(new Uint8Array(x.ct))).length > 0 })));
});
const plain = await page.evaluate(async () => {
  const req = indexedDB.open("m2m-driver");
  const db = await new Promise((r) => (req.onsuccess = () => r(req.result)));
  const rows = await new Promise((r) => { const q = db.transaction("rides").objectStore("rides").getAll(); q.onsuccess = () => r(q.result); });
  return rows.some((x) => new TextDecoder().decode(x.ct).includes("Testperson"));
});
ok(!plain && JSON.parse(dump)[0].keys.includes("iv"), "IndexedDB ride rows hold ciphertext (no patient name in clear)");

console.log("5. connection returns");
await ctx.setOffline(false);
await page.waitForFunction(() => /Synced/.test(document.querySelector("header")?.innerText ?? ""), null, { timeout: 30000 });
b = await badge();
ok(/Synced/.test(b), `auto-sync after reconnect: "${b}"`);
await page.waitForSelector("text=Proof verified", { timeout: 10000 });
ok(true, "proof turned VERIFIED on the phone");

console.log("6. server side agrees");
const login = await fetch(BASE + "/api/auth/login", { method: "POST", headers: J, body: JSON.stringify({ email: "dispatch.spree@demo.med", password: "demo" }) });
const cookie = login.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
const jobs = await (await fetch(BASE + "/api/dispatch/jobs", { headers: { cookie } })).json();
const done = jobs.rides.filter((r) => r.status === "completed");
ok(done.length === 1 && done[0].proof?.status === "verified", `ride completed with verified proof on the server`);

console.log("7. simulated offline switch + remote revoke wipes the phone");
await page.locator("header button[aria-label=Menu]").click();
await page.locator("label:has-text('Simulate offline') input").click();
await page.waitForTimeout(600);
ok(/Offline/i.test(await badge()), `sim offline: "${await badge()}"`);
await page.locator("label:has-text('Simulate offline') input").click();
const fleet = await (await fetch(BASE + "/api/dispatch/fleet", { headers: { cookie } })).json();
await fetch(BASE + `/api/dispatch/devices/${fleet.devices[0].id}/revoke`, { method: "POST", headers: { ...J, cookie }, body: "{}" });
await page.locator("header button").filter({ hasText: /Synced|Sync/ }).first().click().catch(() => {});
await page.waitForSelector("text=This phone was revoked", { timeout: 15000 });
const left = await page.evaluate(async () => {
  const req = indexedDB.open("m2m-driver");
  const db = await new Promise((r) => (req.onsuccess = () => r(req.result)));
  const c = (s) => new Promise((r) => { const q = db.transaction(s).objectStore(s).count(); q.onsuccess = () => r(q.result); });
  return { rides: await c("rides"), events: await c("events"), kv: await c("kv") };
});
ok(left.rides === 0 && left.events === 0 && left.kv === 0, `phone wiped itself: ${JSON.stringify(left)}`);

await browser.close();
console.log(fails ? `\n${fails} check(s) FAILED` : "\nAll driver checks passed");
process.exit(fails ? 1 : 0);
