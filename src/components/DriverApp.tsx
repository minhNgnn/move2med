"use client";
import clsx from "clsx";
import { Check, CheckCircle2, ChevronDown, CreditCard, KeyRound, Loader2, LogOut, MapPin, Phone, RefreshCw, ShieldCheck, Users, Wifi, WifiOff, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/hooks";
import { useLang } from "@/lib/lang";
import { anchoredNow, db, getKV, isSimOffline, lastSyncAt, loadRides, pendingCount, pendingRideIds, recordEvent, registerDevice, setKV, setSimOffline, sha256hex, syncNow, wipeAll } from "@/lib/driver/store";
import type { DriverRide, Phase } from "@/lib/driver/types";
import { LangToggle } from "./Shell";
import { Badge, Button, ErrorBox, Field, Input, Logo } from "./ui";

/** Android Chrome only: ask the browser to wake the app when the connection returns (Background Sync). */
async function bgSync() {
  try {
    const reg = (await navigator.serviceWorker?.ready) as (ServiceWorkerRegistration & { sync?: { register: (t: string) => Promise<void> } }) | undefined;
    await reg?.sync?.register("m2m-sync");
  } catch { /* not supported (iOS, Firefox): the online event and 20 s timer cover it */ }
}

const eur = (n: number) => n.toLocaleString("de-DE", { style: "currency", currency: "EUR" });
const addr = (a: { strasse: string; plz: string; ort: string }) => `${a.strasse}, ${a.plz} ${a.ort}`;
const EQ: Record<string, [string, string]> = { keine: ["standard", "Standard"], Rollstuhl: ["wheelchair", "Rollstuhl"], Tragestuhl: ["carry chair", "Tragestuhl"], liegend: ["lying down", "liegend"] };

function useNow(ms: number) {
  const [n, setN] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setN(Date.now()), ms); return () => clearInterval(t); }, [ms]);
  return n;
}

export function DriverApp() {
  const { L, lang } = useLang();
  const [phase, setPhase] = useState<Phase>("boot");
  const [profile, setProfile] = useState<{ name: string; uid: string } | null>(null);
  const [rides, setRides] = useState<DriverRide[]>([]);
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());
  const [pending, setPending] = useState(0);
  const [online, setOnline] = useState(true);
  const [sim, setSim] = useState(false);
  const [last, setLast] = useState<number | undefined>();
  const [syncing, setSyncing] = useState(false);
  const [needLogin, setNeedLogin] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [tapFor, setTapFor] = useState<DriverRide | null>(null);
  const [menu, setMenu] = useState(false);
  const [time, setTime] = useState<{ iso: string | null; confidence: string }>({ iso: null, confidence: "none" });
  const now = useNow(4000);

  const refresh = useCallback(async () => {
    setRides(await loadRides());
    setPending(await pendingCount());
    setPendingIds(await pendingRideIds());
    setLast(await lastSyncAt());
    setSim(await isSimOffline());
    setTime(await anchoredNow());
  }, []);

  const sync = useCallback(async () => {
    setSyncing(true);
    const r = await syncNow();
    setSyncing(false);
    await refresh();
    if (r.reason === "revoked") setPhase("revoked");
    setNeedLogin(r.reason === "unauthenticated");
    return r;
  }, [refresh]);

  // ---- boot
  useEffect(() => {
    (async () => {
      setOnline(navigator.onLine);
      const offlineNow = !navigator.onLine || (await isSimOffline());
      let session: { uid: string; role: string; name: string } | null = null;
      if (!offlineNow) {
        try { session = (await api("/api/auth/me")).session; } catch { /* offline */ }
      }
      let prof = await getKV<{ name: string; uid: string }>("profile");
      if (session) {
        if (session.role !== "driver") { setPhase("login"); return; }
        if (prof && prof.uid !== session.uid) { await wipeAll(); prof = undefined; }
        prof = { name: session.name, uid: session.uid };
        await setKV("profile", prof);
      }
      if (!prof) { setPhase(offlineNow ? "needs-online" : "login"); return; }
      setProfile(prof);
      if (!(await getKV("deviceId"))) {
        if (!(await registerDevice())) { setPhase("needs-online"); return; }
      }
      await refresh();
      setPhase("ready");
      sync();
    })();
  }, [refresh, sync]);

  // ---- triggers: connection returns, app comes to front, every 20 s, service worker (Background Sync)
  useEffect(() => {
    if (phase !== "ready") return;
    const on = () => { setOnline(true); sync(); };
    const off = () => { setOnline(false); refresh(); };
    const vis = () => { if (!document.hidden) sync(); };
    window.addEventListener("online", on); window.addEventListener("offline", off); document.addEventListener("visibilitychange", vis);
    const t = setInterval(() => { if (!document.hidden) sync(); }, 20_000);
    const swMsg = (e: MessageEvent) => { if (e.data?.type === "sync") sync(); };
    navigator.serviceWorker?.addEventListener("message", swMsg);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); document.removeEventListener("visibilitychange", vis); clearInterval(t); navigator.serviceWorker?.removeEventListener("message", swMsg); };
  }, [phase, sync, refresh]);

  // ---- service worker: app shell for offline launch
  useEffect(() => {
    if (!("serviceWorker" in navigator) || process.env.NODE_ENV !== "production") return;
    navigator.serviceWorker.register("/sw.js").then(async () => {
      const reg = await navigator.serviceWorker.ready;
      const urls = performance.getEntriesByType("resource").map((e) => e.name).filter((u) => u.startsWith(location.origin) && !u.includes("/api/"));
      reg.active?.postMessage({ type: "cache", urls: [location.origin + "/driver", ...urls] });
    }).catch(() => {});
  }, []);

  const offline = sim || !online;

  async function act(ride: DriverRide, type: "pickup" | "dropoff" | "wait", extra: Record<string, unknown> = {}) {
    await recordEvent(ride, type, extra);
    await refresh();
    await bgSync();
    if (!offline) sync();
  }
  async function tap(ride: DriverRide, method: "card_tap" | "pin" | "proxy", pin?: string) {
    await recordEvent(ride, "tap", method === "pin" ? async (id) => ({ method, pinCheck: await sha256hex(`${pin}${id}`) }) : { method });
    navigator.vibrate?.(80);
    await refresh();
    await bgSync();
    if (!offline) sync();
  }

  if (phase === "boot") return <Centered><Loader2 className="h-8 w-8 animate-spin text-cyan" /></Centered>;
  if (phase === "needs-online") return <Centered><Logo size={34} /><p className="mt-6 max-w-sm text-center text-muted">{L("Connect to the internet once to set up this phone. After that it works offline.", "Einmal mit dem Internet verbinden, um dieses Handy einzurichten. Danach funktioniert es offline.")}</p></Centered>;
  if (phase === "revoked") return (
    <Centered>
      <Logo size={34} />
      <div className="mt-6 max-w-sm rounded-2xl bg-bad-soft p-5 text-center text-bad"><b>{L("This phone was revoked.", "Dieses Handy wurde gesperrt.")}</b><p className="mt-1 text-sm">{L("All ride data was deleted from it. Ask your dispatcher.", "Alle Fahrtdaten wurden gelöscht. Fragen Sie Ihren Disponenten.")}</p></div>
      <Button className="mt-4" onClick={() => location.reload()}>{L("Start over", "Neu beginnen")}</Button>
    </Centered>
  );
  if (phase === "login") return <LoginPanel onDone={() => location.reload()} />;

  const grouped = [...new Set(rides.map((r) => r.date))];
  const ago = last ? Math.max(0, Math.round((now - last) / 1000)) : null;
  const badge = syncing ? { tone: "info", text: L("Syncing…", "Synchronisiere…") }
    : offline ? { tone: pending ? "warn" : "neutral", text: pending ? L(`${pending} waiting · offline`, `${pending} wartend · offline`) : L("Offline", "Offline") }
    : pending ? { tone: "warn", text: L(`${pending} waiting to sync`, `${pending} warten auf Sync`) }
    : { tone: "good", text: ago === null ? L("Synced", "Synchronisiert") : L(`Synced ${ago < 60 ? `${ago}s` : `${Math.round(ago / 60)}min`} ago`, `Sync vor ${ago < 60 ? `${ago}s` : `${Math.round(ago / 60)}min`}`) };

  return (
    <div className="mx-auto min-h-screen max-w-xl bg-paper pb-24">
      <header className="sticky top-0 z-30 bg-ink px-4 pb-3 pt-4 text-white">
        <div className="flex items-center justify-between">
          <Logo light size={26} />
          <div className="flex items-center gap-1">
            <LangToggle light />
            <button onClick={() => setMenu(!menu)} className="rounded-lg p-2 hover:bg-white/10" aria-label="Menu"><ChevronDown className={clsx("h-5 w-5 transition", menu && "rotate-180")} /></button>
          </div>
        </div>
        <div className="mt-3 flex items-center justify-between gap-2">
          <span className="text-sm text-white/80">{profile?.name}</span>
          <button onClick={() => sync()} className={clsx("inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-medium",
            badge.tone === "good" && "bg-good text-white", badge.tone === "warn" && "bg-warn text-white", badge.tone === "info" && "bg-cyan text-white", badge.tone === "neutral" && "bg-white/15 text-white")}>
            {syncing ? <RefreshCw className="h-4 w-4 animate-spin" /> : offline ? <WifiOff className="h-4 w-4" /> : <Wifi className="h-4 w-4" />}
            {badge.text}
          </button>
        </div>
        {menu && (
          <div className="mt-3 space-y-1 rounded-xl bg-white/10 p-2 text-sm">
            <label className="flex items-center justify-between gap-3 rounded-lg px-3 py-2.5 hover:bg-white/10">
              <span className="flex items-center gap-2"><WifiOff className="h-4 w-4" /> {L("Simulate offline (demo)", "Offline simulieren (Demo)")}</span>
              <input type="checkbox" className="h-5 w-5" checked={sim} onChange={async (e) => { await setSimOffline(e.target.checked); await refresh(); if (!e.target.checked) sync(); }} />
            </label>
            <p className="px-3 pb-1 text-xs text-white/60">{time.iso ? L(`Trusted time: server-anchored (${time.confidence} confidence)`, `Vertrauenswürdige Zeit: serverbasiert (${time.confidence === "high" ? "hoch" : "niedrig"})`) : L("No server time yet: connect once.", "Noch keine Serverzeit: einmal verbinden.")}</p>
            <button onClick={async () => { if (confirm(L("Sign out and delete all data from this phone? Unsynced events will be lost.", "Abmelden und alle Daten von diesem Handy löschen? Nicht synchronisierte Ereignisse gehen verloren."))) { await api("/api/auth/logout", { body: {} }).catch(() => {}); await wipeAll(); location.reload(); } }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left hover:bg-white/10"><LogOut className="h-4 w-4" /> {L("Sign out and wipe this phone", "Abmelden und Handy löschen")}</button>
          </div>
        )}
      </header>

      {offline && (
        <div className="mx-4 mt-4 rounded-xl border border-warn/30 bg-warn-soft px-4 py-3 text-sm text-warn">
          <b>{L("No signal? No problem.", "Kein Netz? Kein Problem.")}</b> {L("Everything you do is signed and saved encrypted on this phone, and syncs by itself when you are back online.", "Alles, was Sie tun, wird signiert und verschlüsselt auf diesem Handy gespeichert und automatisch synchronisiert, sobald Sie wieder online sind.")}
        </div>
      )}
      {needLogin && <div className="mx-4 mt-4"><LoginInline onDone={() => { setNeedLogin(false); sync(); }} /></div>}
      <IosHint />

      <div className="space-y-6 px-4 pt-4">
        {!rides.length && (
          <div className="rounded-2xl border border-dashed border-line bg-white px-6 py-12 text-center text-muted">
            <Users className="mx-auto mb-3 h-8 w-8 text-cyan" />
            <p className="font-medium text-ink">{L("No rides assigned to you yet.", "Ihnen sind noch keine Fahrten zugewiesen.")}</p>
            <p className="mt-1 text-sm">{L("Your dispatcher assigns rides; they appear here for the next 48 hours.", "Ihr Disponent weist Fahrten zu; sie erscheinen hier für die nächsten 48 Stunden.")}</p>
          </div>
        )}
        {grouped.map((d) => (
          <section key={d}>
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">{new Date(d + "T12:00:00").toLocaleDateString(lang === "de" ? "de-DE" : "en-GB", { weekday: "long", day: "2-digit", month: "long" })}</h2>
            <div className="space-y-3">
              {rides.filter((r) => r.date === d).map((r) => (
                <RideCard key={r.id} ride={r} open={open === r.id} unsynced={pendingIds.has(r.id)} offline={offline}
                  onToggle={() => setOpen(open === r.id ? null : r.id)} onAct={act} onTap={() => setTapFor(r)} />
              ))}
            </div>
          </section>
        ))}
      </div>

      {tapFor && <TapOverlay ride={tapFor} onClose={() => setTapFor(null)} onDone={async (m, pin) => { await tap(tapFor, m, pin); }} />}
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="flex min-h-screen flex-col items-center justify-center bg-paper px-6">{children}</div>;
}

function IosHint() {
  const { L } = useLang();
  const [show, setShow] = useState(false);
  useEffect(() => {
    const standalone = (navigator as unknown as { standalone?: boolean }).standalone || matchMedia("(display-mode: standalone)").matches;
    setShow(/iPhone|iPad/.test(navigator.userAgent) && !standalone);
  }, []);
  if (!show) return null;
  return (
    <div className="mx-4 mt-4 flex items-start justify-between gap-3 rounded-xl border border-cyan/40 bg-cyan-soft px-4 py-3 text-sm text-ink">
      <span><b>{L("Install it:", "Installieren:")}</b> {L("Share → “Add to Home Screen”. Installed apps keep their data and open offline.", "Teilen → „Zum Home-Bildschirm“. Installierte Apps behalten ihre Daten und öffnen offline.")}</span>
      <button onClick={() => setShow(false)} aria-label="Close"><X className="h-4 w-4" /></button>
    </div>
  );
}

function ProofChip({ ride, unsynced }: { ride: DriverRide; unsynced: boolean }) {
  const { L } = useLang();
  const p = ride.proof;
  if (p) {
    const map: Record<string, [string, string, "good" | "warn" | "bad" | "info"]> = {
      verified: ["Proof verified", "Nachweis verifiziert", "good"], needs_review: ["Needs review", "Wird geprüft", "warn"],
      rejected: ["Proof rejected", "Nachweis abgelehnt", "bad"], awaiting: ["Waiting for relative", "Warte auf Angehörige", "info"],
    };
    const m = map[p.status] ?? [p.status, p.status, "info"];
    return <Badge tone={m[2]}>{m[2] === "good" ? <ShieldCheck className="h-3 w-3" /> : null}{L(m[0], m[1])}</Badge>;
  }
  if (ride.localProof) return <Badge tone="warn">{unsynced ? L("Captured · unverified until sync", "Erfasst · unverifiziert bis Sync") : L("Captured", "Erfasst")}</Badge>;
  return null;
}

function RideCard({ ride, open, unsynced, offline, onToggle, onAct, onTap }: { ride: DriverRide; open: boolean; unsynced: boolean; offline: boolean; onToggle: () => void; onAct: (r: DriverRide, t: "pickup" | "dropoff" | "wait", extra?: Record<string, unknown>) => Promise<void>; onTap: () => void }) {
  const { L } = useLang();
  const [busy, setBusy] = useState(false);
  const run = async (fn: () => Promise<void>) => { setBusy(true); try { await fn(); } finally { setBusy(false); } };
  const done = ride.status === "completed";
  const started = ride.status === "picked_up";
  const hasProof = !!(ride.localProof || ride.proof) && ride.proof?.status !== "rejected";
  return (
    <article className={clsx("overflow-hidden rounded-2xl border bg-white shadow-sm", started ? "border-warn/50" : done ? "border-good/40" : "border-line")}>
      <button onClick={onToggle} className="flex w-full items-start justify-between gap-3 p-4 text-left">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-mono text-2xl font-semibold text-ink">{ride.pickupTime}</span>
            <Badge tone={ride.leg === "hin" ? "info" : "neutral"}>{ride.leg === "hin" ? L("Outbound", "Hinfahrt") : L("Return", "Rückfahrt")}</Badge>
          </div>
          <p className="mt-1 text-lg font-medium text-ink">{ride.patient.name}</p>
          <p className="text-sm text-muted">{ride.leg === "hin" ? (ride.to.name ?? addr(ride.to)) : addr(ride.to)}</p>
        </div>
        <div className="flex flex-col items-end gap-1.5">
          {done ? <Badge tone="good"><Check className="h-3 w-3" /> {L("done", "fertig")}</Badge> : started ? <Badge tone="warn">{L("on the way", "unterwegs")}</Badge> : <Badge>{L("ready", "bereit")}</Badge>}
          <ProofChip ride={ride} unsynced={unsynced} />
          {unsynced && <span className="text-xs text-warn">{L("not synced yet", "noch nicht synchronisiert")}</span>}
        </div>
      </button>
      {open && (
        <div className="space-y-4 border-t border-line/70 bg-paper/60 p-4">
          <div className="grid gap-2 text-sm">
            <a className="flex items-start gap-2 text-ink" href={`https://maps.google.com/?q=${encodeURIComponent(addr(ride.from))}`} target="_blank" rel="noreferrer"><MapPin className="mt-0.5 h-4 w-4 shrink-0 text-cyan" /><span><b>{L("From", "Von")}</b> {ride.from.name ? `${ride.from.name}, ` : ""}{addr(ride.from)}</span></a>
            <a className="flex items-start gap-2 text-ink" href={`https://maps.google.com/?q=${encodeURIComponent(addr(ride.to))}`} target="_blank" rel="noreferrer"><MapPin className="mt-0.5 h-4 w-4 shrink-0 text-good" /><span><b>{L("To", "Nach")}</b> {ride.to.name ? `${ride.to.name}, ` : ""}{addr(ride.to)}</span></a>
            {ride.patient.phone && <a className="flex items-center gap-2 text-ink" href={`tel:${ride.patient.phone.replace(/\s/g, "")}`}><Phone className="h-4 w-4 text-cyan" /> {ride.patient.phone}</a>}
          </div>
          <div className="flex flex-wrap gap-1.5">
            <Badge tone="ink">{ride.vehicleType}</Badge>
            {ride.equipment !== "keine" && <Badge tone="info">{L(...EQ[ride.equipment])}</Badge>}
            {ride.weightKg && <Badge tone="warn">{ride.weightKg} kg</Badge>}
            {ride.vehicleLabel && <Badge>{ride.vehicleLabel}</Badge>}
            {ride.copay.exempt || ride.copay.amount === 0 ? <Badge tone="good">{L("co-pay exempt", "zuzahlungsfrei")}</Badge> : <Badge tone="warn">{L("collect", "einziehen")} {eur(ride.copay.amount / 2)}</Badge>}
            {ride.waitMin ? <Badge tone="info">{L("wait", "Warten")} {ride.waitMin} min</Badge> : null}
          </div>

          {!done && !started && (
            <Button size="lg" className="w-full" loading={busy} onClick={() => run(() => onAct(ride, "pickup"))}>{L("Patient picked up", "Patient abgeholt")}</Button>
          )}
          {started && (
            <div className="space-y-3">
              {!hasProof ? (
                <Button size="lg" variant="primary" className="w-full" onClick={onTap}><CreditCard className="h-5 w-5" /> {ride.proof?.status === "rejected" ? L("Confirm again", "Erneut bestätigen") : L("Patient confirms (health card)", "Patient bestätigt (Gesundheitskarte)")}</Button>
              ) : (
                <div className="flex items-center gap-2 rounded-xl bg-good-soft px-4 py-3 text-good"><CheckCircle2 className="h-5 w-5" /> <b>{L("Patient confirmation captured", "Bestätigung des Patienten erfasst")}</b></div>
              )}
              {ride.leg === "rueck" || ride.waitMin ? null : null}
              <Button size="lg" variant={hasProof ? "good" : "secondary"} className="w-full" loading={busy} onClick={() => run(() => onAct(ride, "dropoff"))}>{L("Patient dropped off", "Patient abgesetzt")}</Button>
              {!hasProof && <p className="text-xs text-warn">{L("Without the patient's confirmation this ride cannot be billed.", "Ohne die Bestätigung des Patienten kann diese Fahrt nicht abgerechnet werden.")}</p>}
            </div>
          )}
          {done && !hasProof && <Button variant="secondary" className="w-full" onClick={onTap}><CreditCard className="h-4 w-4" /> {L("Add patient confirmation", "Bestätigung nachtragen")}</Button>}
          {(started || done) && <WaitControl ride={ride} onSave={(m) => onAct(ride, "wait", { waitMin: m })} />}
          {offline && (started || done) && <p className="text-xs text-muted">{L("Saved on this phone. It will sync when you are online.", "Auf diesem Handy gespeichert. Wird synchronisiert, sobald Sie online sind.")}</p>}
        </div>
      )}
    </article>
  );
}

function WaitControl({ ride, onSave }: { ride: DriverRide; onSave: (m: number) => Promise<void> }) {
  const { L } = useLang();
  const [min, setMin] = useState(ride.waitMin ?? 0);
  const [saved, setSaved] = useState(false);
  useEffect(() => { setMin(ride.waitMin ?? 0); }, [ride.waitMin]);
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl bg-white p-3 ring-1 ring-line">
      <div>
        <p className="text-sm font-medium text-ink">{L("Waiting time", "Wartezeit")}</p>
        <p className="text-xs text-muted">{L("Minutes you waited for the patient or the treatment", "Minuten, die Sie auf Patient oder Behandlung gewartet haben")}</p>
      </div>
      <div className="flex items-center gap-2">
        <button className="h-9 w-9 rounded-lg border border-line text-lg" onClick={() => { setMin(Math.max(0, min - 15)); setSaved(false); }} aria-label="-15">−</button>
        <span className="w-14 text-center font-mono text-lg">{min}′</span>
        <button className="h-9 w-9 rounded-lg border border-line text-lg" onClick={() => { setMin(min + 15); setSaved(false); }} aria-label="+15">+</button>
        <Button size="sm" variant={saved ? "good" : "secondary"} onClick={async () => { await onSave(min); setSaved(true); }}>{saved ? <Check className="h-4 w-4" /> : L("Save", "Speichern")}</Button>
      </div>
    </div>
  );
}

function TapOverlay({ ride, onClose, onDone }: { ride: DriverRide; onClose: () => void; onDone: (m: "card_tap" | "pin" | "proxy", pin?: string) => Promise<void> }) {
  const { L } = useLang();
  const [mode, setMode] = useState<"tap" | "pin" | "done">("tap");
  const [doneMsg, setDoneMsg] = useState("");
  const [pin, setPin] = useState("");
  const [nfc, setNfc] = useState<"idle" | "listening" | "unavailable">("idle");
  const fired = useRef(false);

  const finish = useCallback(async (m: "card_tap" | "pin" | "proxy", p?: string) => {
    if (fired.current) return;
    fired.current = true;
    await onDone(m, p);
    setDoneMsg(m === "proxy" ? L("Waiting for the relative to confirm on the status page.", "Warte, bis die Angehörige auf der Statusseite bestätigt.") : L("Confirmed. Saved and signed on this phone.", "Bestätigt. Auf diesem Handy gespeichert und signiert."));
    setMode("done");
    setTimeout(onClose, 1600);
  }, [onDone, onClose, L]);

  // Android Chrome: really detect a card being held to the phone. A health card is not an NDEF tag, so Chrome reports
  // "readingerror": we treat both events as "a card was tapped". The card data itself is NOT read (needs gematik's native PoPP client).
  useEffect(() => {
    const NDEF = (window as unknown as { NDEFReader?: new () => { scan: (o?: object) => Promise<void>; onreading: unknown; onreadingerror: unknown } }).NDEFReader;
    if (!NDEF) { setNfc("unavailable"); return; }
    const ac = new AbortController();
    try {
      const r = new NDEF();
      r.scan({ signal: ac.signal }).then(() => setNfc("listening")).catch(() => setNfc("unavailable"));
      r.onreading = () => finish("card_tap");
      r.onreadingerror = () => finish("card_tap");
    } catch { setNfc("unavailable"); }
    return () => ac.abort();
  }, [finish]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-ink text-white">
      <div className="flex items-center justify-between p-4">
        <span className="text-sm text-white/70">{ride.patient.name} · {ride.pickupTime}</span>
        <button onClick={onClose} className="rounded-full p-2 hover:bg-white/10" aria-label="Close"><X className="h-6 w-6" /></button>
      </div>
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center px-6 text-center">
        {mode === "tap" && (
          <>
            <div className="pulse-ring flex h-44 w-44 items-center justify-center rounded-full bg-cyan"><CreditCard className="h-20 w-20" /></div>
            <h2 className="mt-8 text-2xl font-semibold">{L("Hold the patient's health card to the back of the phone", "Gesundheitskarte des Patienten an die Rückseite des Handys halten")}</h2>
            <p className="mt-2 text-white/70">{nfc === "listening" ? L("Listening for the card…", "Warte auf die Karte…") : L("This browser cannot detect cards: use the demo button below.", "Dieser Browser erkennt keine Karten: nutzen Sie den Demo-Knopf unten.")}</p>
            <Button size="lg" className="mt-8 w-full !bg-white !text-ink" onClick={() => finish("card_tap")}>{L("Simulate card tap (demo)", "Kartentipp simulieren (Demo)")}</Button>
            <div className="mt-3 grid w-full grid-cols-2 gap-3">
              <Button variant="secondary" size="md" className="!border-white/30 !bg-transparent !text-white" onClick={() => setMode("pin")}><KeyRound className="h-4 w-4" /> {L("Use PIN", "PIN nutzen")}</Button>
              <Button variant="secondary" size="md" className="!border-white/30 !bg-transparent !text-white" onClick={() => finish("proxy")}><Users className="h-4 w-4" /> {L("Relative confirms", "Angehörige bestätigt")}</Button>
            </div>
          </>
        )}
        {mode === "pin" && (
          <div className="w-full">
            <h2 className="text-2xl font-semibold">{L("Enter the PIN from the patient's letter", "PIN aus dem Brief des Patienten eingeben")}</h2>
            <input autoFocus inputMode="numeric" maxLength={6} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} className="mt-6 w-full rounded-2xl bg-white/10 py-5 text-center font-mono text-4xl tracking-[0.5em] outline-none ring-2 ring-white/20 focus:ring-cyan" />
            <Button size="lg" className="mt-6 w-full !bg-white !text-ink" disabled={pin.length !== 6} onClick={() => finish("pin", pin)}>{L("Confirm", "Bestätigen")}</Button>
            <button className="mt-4 text-sm text-white/70 underline" onClick={() => setMode("tap")}>{L("Back", "Zurück")}</button>
          </div>
        )}
        {mode === "done" && (
          <>
            <div className="flex h-40 w-40 items-center justify-center rounded-full bg-good"><Check className="h-20 w-20" /></div>
            <h2 className="mt-8 text-2xl font-semibold">{doneMsg}</h2>
          </>
        )}
      </div>
      <p className="px-6 pb-6 text-center text-xs text-white/50">{L("The card tap is detected, not read: reading the card needs gematik's native PoPP client. The proof is a signed mock token.", "Der Kartentipp wird erkannt, nicht gelesen: das Lesen der Karte braucht gematiks native PoPP-Komponente. Der Nachweis ist ein signiertes Mock-Token.")}</p>
    </div>
  );
}

function LoginInline({ onDone }: { onDone: () => void }) {
  const { L } = useLang();
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [demo, setDemo] = useState<string[]>([]);
  useEffect(() => { api("/api/demo/accounts").then((r) => setDemo(r.accounts.filter((a: { role: string }) => a.role === "driver").map((a: { email: string }) => a.email))).catch(() => {}); }, []);
  async function go(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setErr("");
    try {
      const r = await api("/api/auth/login", { body: { email, password: pw } });
      if (r.role !== "driver") { await api("/api/auth/logout", { body: {} }); throw new Error(L("This account is not a driver account.", "Dies ist kein Fahrer-Konto.")); }
      onDone();
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }
  return (
    <form onSubmit={go} className="space-y-3 rounded-2xl border border-line bg-white p-5">
      <p className="font-semibold text-ink">{L("Sign in to sync", "Zum Synchronisieren anmelden")}</p>
      <Field label={L("Email", "E-Mail")}><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" /></Field>
      <Field label={L("Password", "Passwort")}><Input type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="current-password" /></Field>
      {err && <ErrorBox>{err}</ErrorBox>}
      <Button type="submit" size="lg" loading={busy} className="w-full">{L("Sign in", "Anmelden")}</Button>
      {demo.length > 0 && <div className="flex flex-wrap gap-1.5">{demo.map((d) => <button type="button" key={d} onClick={() => { setEmail(d); setPw("demo"); }} className="rounded-full bg-cyan-soft px-3 py-1 text-xs text-ink">{d}</button>)}</div>}
    </form>
  );
}

function LoginPanel({ onDone }: { onDone: () => void }) {
  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 px-4 py-10">
      <div className="flex items-center justify-between"><Logo size={32} /><LangToggle /></div>
      <LoginInline onDone={onDone} />
    </div>
  );
}
