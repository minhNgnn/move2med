"use client";
import { AlertTriangle, Check, CheckCircle2, ClipboardList, Download, KeyRound, ScanLine, Truck, X } from "lucide-react";
import clsx from "clsx";
import { useEffect, useMemo, useRef, useState } from "react";
import { api, eur, fmtDate, fmtDateTime, usePoll } from "@/lib/hooks";
import { useLang } from "@/lib/lang";
import { isBusy, matchVehicle, type VehicleLite } from "@/lib/fleet";
import type { Equip, Flag, VType } from "@/lib/types";
import { QrScanner } from "./QrScanner";
import { Badge, Button, Card, Empty, ErrorBox, Field, FlagList, Input, KV, Select, Table, Tabs, Td } from "./ui";

type Tab = "redeem" | "jobs" | "fleet" | "billing";
type Vehicle = VehicleLite & { companyId: string };
type Driver = { id: string; name: string };
type BusyRide = { id: string; vehicleId: string | null; scheduledDate: string; pickupTime: string; status: string };
type Card_ = {
  prescriptionId: string; mode: "preview" | "full"; approval: { required: boolean; status: string };
  patient: { name: string | null; birthdate: string | null; phone: string | null; address: { strasse: string; plz: string; ort: string } };
  treatment: { name: string; appointment: string; pickup: string; facility: { einrichtung: string; strasse: string; plz: string; ort: string }; frequency: string | null; until: string | null };
  hin: { befoerderungsart: VType; ausstattung: Equip }; rueck: { befoerderungsart: VType; ausstattung: Equip };
  sonstiges: { gemeinschaftsfahrt?: boolean; gewicht_kg?: number; wartezeit_min?: number };
  hasJustification: boolean; copay: { exempt: boolean; expected: number }; unfallbezug: string; flags: Flag[]; boundCompanyId: string | null; reasonCode: string;
};
type Redeemed = { card: Card_; company: { id: string; name: string }; vehicles: Vehicle[]; drivers: Driver[]; busy: BusyRide[]; rides: any[] };

const STATUS_TONE: Record<string, "neutral" | "info" | "warn" | "good" | "bad"> = { planned: "neutral", assigned: "info", picked_up: "warn", completed: "good", cancelled: "bad" };

export function DispatchApp() {
  const { L } = useLang();
  const [tab, setTab] = useState<Tab>("redeem");
  const jobs = usePoll<{ rides: any[] }>("/api/dispatch/jobs", 2500);
  const toAssign = jobs.data?.rides.filter((r) => r.status === "planned").length ?? 0;
  const live = jobs.data?.rides.filter((r) => r.status === "picked_up").length ?? 0;
  return (
    <div className="space-y-5">
      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { id: "redeem", label: L("Redeem ride key", "Fahrtschlüssel einlösen") },
          { id: "jobs", label: L("Rides", "Fahrten"), badge: toAssign ? `${toAssign} ${L("to assign", "zuzuweisen")}` : live ? `${live} ${L("live", "läuft")}` : null },
          { id: "fleet", label: L("Fleet & devices", "Flotte & Geräte") },
          { id: "billing", label: L("Billing", "Abrechnung") },
        ]}
      />
      {tab === "redeem" && <RedeemTab onDone={() => jobs.reload()} />}
      {tab === "jobs" && <JobsTab rides={jobs.data?.rides ?? []} reload={jobs.reload} />}
      {tab === "fleet" && <FleetTab />}
      {tab === "billing" && <BillingTab />}
    </div>
  );
}

// ------------------------------------------------------------------ redeem
function extractCode(raw: string) {
  const m = raw.match(/[?&]k=([A-Z0-9-]{8,9})/i) ?? raw.match(/M2M:([A-Z0-9-]{8,9})/i);
  return (m ? m[1] : raw).toUpperCase();
}

function RedeemTab({ onDone }: { onDone: () => void }) {
  const { L } = useLang();
  const [code, setCode] = useState("");
  const [dob, setDob] = useState("");
  const [res, setRes] = useState<Redeemed | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [scanning, setScanning] = useState(false);

  async function lookup(c = code, d = dob) {
    setBusy(true); setErr("");
    try { setRes(await api("/api/dispatch/redeem", { body: { code: c, dob: d } })); }
    catch (e) { setRes(null); setErr((e as Error).message); }
    finally { setBusy(false); }
  }
  async function scan(file: File) {
    setErr("");
    try {
      const jsQR = (await import("jsqr")).default;
      const bmp = await createImageBitmap(file);
      const cv = document.createElement("canvas"); cv.width = bmp.width; cv.height = bmp.height;
      const ctx = cv.getContext("2d")!; ctx.drawImage(bmp, 0, 0);
      const q = jsQR(ctx.getImageData(0, 0, cv.width, cv.height).data, cv.width, cv.height);
      if (!q) throw new Error(L("No QR code found in the photo.", "Kein QR-Code im Foto gefunden."));
      setCode(extractCode(q.data));
    } catch (e) { setErr((e as Error).message); }
  }

  return (
    <div className="space-y-5">
      <Card title={<span className="flex items-center gap-2"><KeyRound className="h-4 w-4 text-cyan" /> {L("The patient gives you a ride key", "Der Patient nennt Ihnen einen Fahrtschlüssel")}</span>}>
        <form onSubmit={(e) => { e.preventDefault(); lookup(); }} className="grid items-end gap-4 md:grid-cols-[1fr_1fr_auto_auto]">
          <Field label={L("Ride key (letter or QR)", "Fahrtschlüssel (Brief oder QR)")}>
            <Input value={code} onChange={(e) => setCode(extractCode(e.target.value))} placeholder="XXXX-XXXX" className="font-mono text-lg tracking-widest" autoCapitalize="characters" autoComplete="off" />
          </Field>
          <Field label={L("Patient's date of birth", "Geburtsdatum des Patienten")} hint={L("YYYY-MM-DD or DD.MM.YYYY", "JJJJ-MM-TT oder TT.MM.JJJJ")}>
            <Input value={dob} onChange={(e) => setDob(e.target.value)} placeholder="1986-05-17" autoComplete="off" />
          </Field>
          <Button type="submit" size="lg" loading={busy} disabled={code.length < 8 || dob.length < 8}>{L("Look up", "Abrufen")}</Button>
          <div>
            <input ref={fileRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => e.target.files?.[0] && scan(e.target.files[0])} />
            <Button type="button" variant="secondary" size="lg" onClick={() => setScanning(true)}><ScanLine className="h-5 w-5" /> {L("Scan QR", "QR scannen")}</Button>
            <button type="button" className="mt-1 block w-full text-center text-xs text-muted underline" onClick={() => fileRef.current?.click()}>{L("or use a photo", "oder Foto nutzen")}</button>
          </div>
        </form>
        {err && <div className="mt-4"><ErrorBox>{err}</ErrorBox></div>}
      </Card>
      {scanning && <QrScanner onClose={() => setScanning(false)} onCode={(t) => { setScanning(false); setCode(extractCode(t)); }} />}
      {res && <TripCard key={res.card.prescriptionId + res.card.mode} res={res} code={code} dob={dob} refresh={async () => { await lookup(); onDone(); }} clear={() => { setRes(null); onDone(); }} />}
    </div>
  );
}

function legNeed(c: Card_, leg: "hin" | "rueck") {
  const l = leg === "hin" ? c.hin : c.rueck;
  return { vehicleType: l.befoerderungsart, equipment: l.ausstattung, weightKg: c.sonstiges.gewicht_kg };
}
const EQ_LABEL: Record<string, [string, string]> = { keine: ["no special equipment", "keine Ausstattung"], Rollstuhl: ["wheelchair", "Rollstuhl"], Tragestuhl: ["carry chair", "Tragestuhl"], liegend: ["lying down", "liegend"] };

function TripCard({ res, code, dob, refresh, clear }: { res: Redeemed; code: string; dob: string; refresh: () => Promise<void>; clear: () => void }) {
  const { L } = useLang();
  const c = res.card;
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const preview = c.mode === "preview";
  const blocked = c.approval.status === "pending" || c.approval.status === "rejected";

  const fits = (leg: "hin" | "rueck") => res.vehicles.filter((v) => matchVehicle(v, legNeed(c, leg)).ok);
  const anyFit = fits("hin").length > 0 && fits("rueck").length > 0;

  async function accept() {
    setBusy(true); setErr("");
    try { await api("/api/dispatch/accept", { body: { code, dob } }); await refresh(); } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }
  async function decline() {
    await api("/api/dispatch/decline", { body: { code, dob } });
    clear();
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[1.1fr_1fr]">
      <div className="space-y-5">
        <Card
          title={<span className="flex items-center gap-2"><ClipboardList className="h-4 w-4 text-cyan" /> Trip Card</span>}
          actions={<span className="flex items-center gap-2">{(c as Card_ & { workflow?: string }).workflow && <Badge title="FHIR Task status">{(c as Card_ & { workflow?: string }).workflow}</Badge>}{preview ? <Badge tone="info">{L("Preview", "Vorschau")}</Badge> : <Badge tone="good">{L("Assigned to you", "Ihnen zugewiesen")}</Badge>}</span>}
        >
          {preview && (
            <p className="mb-4 rounded-xl bg-cyan-soft px-3.5 py-2.5 text-sm text-ink">
              {L("Preview: you see what you need to decide. The patient's name, phone and exact addresses stay hidden until you accept.", "Vorschau: Sie sehen, was Sie für die Entscheidung brauchen. Name, Telefon und genaue Adressen bleiben bis zur Annahme verborgen.")}
            </p>
          )}
          <div className="grid gap-x-8 md:grid-cols-2">
            <dl>
              <KV k={L("Patient", "Patient")}>{c.patient.name ?? <span className="text-muted">{L("hidden until accepted", "verborgen bis zur Annahme")}</span>}</KV>
              <KV k={L("Pickup area", "Abholbereich")}>{c.patient.address.strasse ? `${c.patient.address.strasse}, ` : ""}{c.patient.address.plz} {c.patient.address.ort}</KV>
              {c.patient.phone && <KV k={L("Phone", "Telefon")}>{c.patient.phone}</KV>}
              <KV k={L("Treatment", "Behandlung")}>{c.treatment.name}</KV>
              <KV k={L("Destination", "Ziel")}>{c.treatment.facility.einrichtung}{c.treatment.facility.strasse ? `, ${c.treatment.facility.strasse}` : ""}, {c.treatment.facility.plz} {c.treatment.facility.ort}</KV>
            </dl>
            <dl>
              <KV k={L("Pickup / appointment", "Abholung / Termin")}>{c.treatment.pickup} / {c.treatment.appointment}</KV>
              <KV k={L("Series", "Serie")}>{c.treatment.frequency ?? L("single trip", "Einzelfahrt")}{c.treatment.until ? ` ${L("until", "bis")} ${c.treatment.until}` : ""}</KV>
              <KV k={L("Approval", "Genehmigung")}>{c.approval.status === "none" ? <Badge tone="good">{L("not needed", "nicht nötig")}</Badge> : c.approval.status === "approved" ? <Badge tone="good">{L("approved", "genehmigt")}</Badge> : c.approval.status === "pending" ? <Badge tone="warn">{L("pending", "ausstehend")}</Badge> : <Badge tone="bad">{L("rejected", "abgelehnt")}</Badge>}</KV>
              <KV k={L("Co-payment", "Zuzahlung")}>{c.copay.exempt ? <Badge tone="good">{L("exempt", "befreit")}</Badge> : c.unfallbezug !== "kein Unfallbezug" ? <Badge tone="good">{L("none (accident case)", "keine (Unfallfall)")}</Badge> : `${eur(c.copay.expected)} ${L("to collect", "einzuziehen")}`}</KV>
              <KV k={L("Medical justification", "Medizinische Begründung")}>{c.hasJustification ? L("on file (not shown to you)", "liegt vor (Ihnen nicht angezeigt)") : "–"}</KV>
            </dl>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {(["hin", "rueck"] as const).map((leg) => {
              const l = leg === "hin" ? c.hin : c.rueck;
              return (
                <div key={leg} className="rounded-xl border-2 border-ink/10 bg-paper p-3.5">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted">{leg === "hin" ? L("Outbound", "Hinfahrt") : L("Return", "Rückfahrt")}</p>
                  <p className="mt-1 text-lg font-semibold text-ink">{l.befoerderungsart === "KTW" ? "KTW" : "Taxi / Mietwagen"}</p>
                  <p className="text-sm font-medium text-ink">{L(...EQ_LABEL[l.ausstattung])}</p>
                </div>
              );
            })}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {c.sonstiges.gewicht_kg && <Badge tone="warn">{c.sonstiges.gewicht_kg} kg</Badge>}
            {c.sonstiges.wartezeit_min ? <Badge tone="info">{L("waiting", "Wartezeit")} {c.sonstiges.wartezeit_min} min</Badge> : null}
            {c.sonstiges.gemeinschaftsfahrt && <Badge tone="info">{L("shared ride ok", "Gemeinschaftsfahrt ok")}</Badge>}
          </div>
          <div className="mt-4"><FlagList flags={c.flags} /></div>
        </Card>
      </div>

      <div className="space-y-5">
        <Card title={<span className="flex items-center gap-2"><Truck className="h-4 w-4 text-cyan" /> {L("Does your fleet fit?", "Passt Ihre Flotte?")}</span>}>
          <FleetMatch res={res} legs={["hin", "rueck"]} c={c} />
          {!anyFit && !blocked && (
            <div className="mt-4 rounded-xl border-2 border-bad/40 bg-bad-soft p-4 text-sm text-bad">
              <b className="flex items-center gap-2"><AlertTriangle className="h-4 w-4" /> {L("No vehicle of yours fits this trip.", "Kein Fahrzeug von Ihnen passt zu dieser Fahrt.")}</b>
              <p className="mt-1">{L("Sending a taxi here would be the wrong vehicle: an empty trip and a delayed treatment. Decline and the patient can pick another company.", "Ein Taxi zu schicken wäre das falsche Fahrzeug: Leerfahrt und verspätete Behandlung. Lehnen Sie ab, der Patient kann ein anderes Unternehmen wählen.")}</p>
            </div>
          )}
          {err && <div className="mt-4"><ErrorBox>{err}</ErrorBox></div>}
          {preview ? (
            <div className="mt-4 flex gap-2">
              <Button variant="good" size="lg" className="flex-1" disabled={!anyFit || blocked} loading={busy} onClick={accept}><Check className="h-5 w-5" /> {L("Accept trip", "Fahrt annehmen")}</Button>
              <Button variant="secondary" size="lg" onClick={decline}><X className="h-5 w-5" /> {L("Decline", "Ablehnen")}</Button>
            </div>
          ) : null}
          {preview && blocked && <p className="mt-2 text-sm text-warn">{L("You can look at the trip, but only accept it after the insurer's approval.", "Sie können die Fahrt ansehen, aber erst nach der Genehmigung annehmen.")}</p>}
        </Card>
        {!preview && <AssignPanel res={res} c={c} refresh={refresh} />}
      </div>
    </div>
  );
}

function FleetMatch({ res, c, legs }: { res: Redeemed; c: Card_; legs: ("hin" | "rueck")[] }) {
  const { L } = useLang();
  return (
    <Table head={[L("Vehicle", "Fahrzeug"), ...legs.map((l) => (l === "hin" ? L("Outbound", "Hinfahrt") : L("Return", "Rückfahrt")))]}>
      {res.vehicles.map((v) => (
        <tr key={v.id}>
          <Td><span className="font-medium">{v.label}</span><span className="block text-xs text-muted">{v.type === "ktw" ? "KTW" : "Taxi"} · {v.equipment.length ? v.equipment.join(", ") : L("standard", "Standard")}</span></Td>
          {legs.map((leg) => {
            const m = matchVehicle(v, legNeed(c, leg));
            return (
              <Td key={leg}>
                {m.ok ? <Badge tone="good"><Check className="h-3 w-3" /> {m.oversized ? L("fits (oversized)", "passt (überdimensioniert)") : L("fits", "passt")}</Badge> : <Badge tone="bad"><X className="h-3 w-3" /> {L("missing", "es fehlt")}: {m.missing.join(", ")}</Badge>}
              </Td>
            );
          })}
        </tr>
      ))}
    </Table>
  );
}

function AssignPanel({ res, c, refresh }: { res: Redeemed; c: Card_; refresh: () => Promise<void> }) {
  const { L } = useLang();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const rides = res.rides.filter((r) => r.status !== "cancelled");
  const series = !!c.treatment.frequency;
  const firstOf = (leg: string) => rides.find((r) => r.leg === leg);
  const best = (leg: "hin" | "rueck") => {
    const r = firstOf(leg);
    const ok = res.vehicles.filter((v) => matchVehicle(v, legNeed(c, leg)).ok && (!r || !isBusy(v.id, r.scheduledDate, r.pickupTime, res.busy, r.id)));
    return ok.sort((a, b) => Number(matchVehicle(a, legNeed(c, leg)).oversized) - Number(matchVehicle(b, legNeed(c, leg)).oversized))[0]?.id ?? "";
  };
  const [veh, setVeh] = useState<Record<string, string>>({ hin: best("hin"), rueck: best("rueck") });
  const [drv, setDrv] = useState(res.drivers[0]?.id ?? "");
  const [whole, setWhole] = useState(true);

  async function assign(leg: "hin" | "rueck") {
    const r = firstOf(leg);
    if (!r) return;
    setBusy(true); setErr("");
    try { await api(`/api/dispatch/rides/${r.id}/assign`, { body: { vehicleId: veh[leg], driverId: drv, applyToSeries: series && whole } }); await refresh(); }
    catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }
  return (
    <Card title={L("Plan the rides", "Fahrten planen")} tone="cyan">
      <div className="space-y-4">
        <Field label={L("Driver", "Fahrer")}><Select value={drv} onChange={(e) => setDrv(e.target.value)}>{res.drivers.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</Select></Field>
        {(["hin", "rueck"] as const).map((leg) => {
          const r = firstOf(leg);
          return (
            <div key={leg} className="rounded-xl bg-white p-3 ring-1 ring-line">
              <p className="mb-2 text-sm font-semibold text-ink">{leg === "hin" ? L("Outbound", "Hinfahrt") : L("Return", "Rückfahrt")} {r && <span className="font-normal text-muted">· {fmtDate(r.scheduledDate)} {r.pickupTime}</span>}</p>
              <div className="flex gap-2">
                <Select value={veh[leg]} onChange={(e) => setVeh({ ...veh, [leg]: e.target.value })}>
                  <option value="">{L("Choose vehicle", "Fahrzeug wählen")}</option>
                  {res.vehicles.map((v) => { const m = matchVehicle(v, legNeed(c, leg)); return <option key={v.id} value={v.id} disabled={!m.ok}>{v.label} ({v.plate}){m.ok ? "" : ` · ${L("does not fit", "passt nicht")}`}</option>; })}
                </Select>
                <Button disabled={!veh[leg] || !drv} loading={busy} onClick={() => assign(leg)}>{L("Assign", "Zuweisen")}</Button>
              </div>
              {r && <p className="mt-1.5 text-xs text-muted">{r.status === "assigned" ? <><CheckCircle2 className="mr-1 inline h-3.5 w-3.5 text-good" />{L("assigned", "zugewiesen")}</> : L("not assigned yet", "noch nicht zugewiesen")}</p>}
            </div>
          );
        })}
        {series && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={whole} onChange={(e) => setWhole(e.target.checked)} /> {L(`Apply to the whole series (${rides.length / 2} dates)`, `Für die ganze Serie übernehmen (${rides.length / 2} Termine)`)}</label>}
        {err && <ErrorBox>{err}</ErrorBox>}
      </div>
    </Card>
  );
}

// ------------------------------------------------------------------ jobs
const DOT: Record<string, string> = { planned: "bg-line", assigned: "bg-cyan", picked_up: "bg-warn", completed: "bg-good", cancelled: "bg-bad/30" };

/** One row per series patient, one column per date: two dots (outbound, return) coloured by state. */
function SeriesCalendar({ rides }: { rides: any[] }) {
  const { L, lang } = useLang();
  const series = rides.filter((r) => r.series);
  if (!series.length) return null;
  const dates = [...new Set(series.map((r) => r.scheduledDate))].sort();
  const people = [...new Set(series.map((r) => r.prescriptionId))];
  return (
    <Card title={L("Series calendar", "Serienkalender")}>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr><th className="pb-2 pr-4 text-left text-xs font-medium text-muted">{L("Patient", "Patient")}</th>{dates.map((d) => <th key={d} className="px-3 pb-2 text-center text-xs font-medium text-muted">{fmtDate(d, lang)}</th>)}</tr></thead>
          <tbody>
            {people.map((pid) => {
              const mine = series.filter((r) => r.prescriptionId === pid);
              return (
                <tr key={pid} className="border-t border-line/60">
                  <td className="py-2.5 pr-4"><span className="font-medium">{mine[0].patient}</span><span className="block text-xs text-muted">{mine[0].scenario}</span></td>
                  {dates.map((d) => {
                    const cell = mine.filter((r) => r.scheduledDate === d);
                    return <td key={d} className="px-3 py-2.5 text-center">{cell.length ? <span className="inline-flex gap-1">{["hin", "rueck"].map((leg) => { const r = cell.find((x) => x.leg === leg); return <span key={leg} title={`${leg === "hin" ? L("outbound", "Hinfahrt") : L("return", "Rückfahrt")}: ${r?.status ?? "–"}`} className={clsx("inline-block h-3.5 w-3.5 rounded-full", r ? DOT[r.status] : "bg-transparent")} />; })}</span> : <span className="text-muted">–</span>}</td>;
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-3 flex flex-wrap gap-3 text-xs text-muted">{Object.entries(DOT).map(([k, c]) => <span key={k} className="inline-flex items-center gap-1.5"><span className={clsx("h-3 w-3 rounded-full", c)} />{k.replace("_", " ")}</span>)} · {L("left dot outbound, right dot return", "linker Punkt Hinfahrt, rechter Punkt Rückfahrt")}</p>
    </Card>
  );
}

function JobsTab({ rides, reload }: { rides: any[]; reload: () => void }) {
  const { L, lang } = useLang();
  const fleet = usePoll<{ vehicles: Vehicle[]; drivers: Driver[] }>("/api/dispatch/fleet", 8000);
  const [pick, setPick] = useState<Record<string, { v: string; d: string }>>({});
  const [err, setErr] = useState("");
  const busyList: BusyRide[] = rides;
  const dates = [...new Set(rides.map((r) => r.scheduledDate))];
  if (!rides.length) return <Card><Empty>{L("No rides yet. Redeem a ride key and accept the trip.", "Noch keine Fahrten. Lösen Sie einen Fahrtschlüssel ein und nehmen Sie die Fahrt an.")}</Empty></Card>;
  return (
    <div className="space-y-5">
      {err && <ErrorBox>{err}</ErrorBox>}
      <SeriesCalendar rides={rides} />
      {dates.map((d) => (
        <Card key={d} title={fmtDate(d, lang)}>
          <Table head={[L("Time", "Zeit"), L("Leg", "Fahrt"), L("Patient", "Patient"), L("Needs", "Bedarf"), L("Vehicle / driver", "Fahrzeug / Fahrer"), "Status", L("Proof", "Nachweis")]}>
            {rides.filter((r) => r.scheduledDate === d).map((r) => (
              <tr key={r.id}>
                <Td className="font-mono">{r.pickupTime}</Td>
                <Td>{r.leg === "hin" ? L("out", "hin") : L("back", "rück")}</Td>
                <Td><span className="font-medium">{r.patient}</span><span className="block text-xs text-muted">{r.scenario}</span></Td>
                <Td className="text-xs">{r.vehicleType} · {r.equipment}{r.weightKg ? ` · ${r.weightKg} kg` : ""}</Td>
                <Td>
                  {r.status === "planned" && fleet.data ? (
                    <div className="flex gap-1.5">
                      <Select className="!py-1.5 text-xs" value={pick[r.id]?.v ?? ""} onChange={(e) => setPick({ ...pick, [r.id]: { v: e.target.value, d: pick[r.id]?.d ?? fleet.data!.drivers[0]?.id } })}>
                        <option value="">{L("vehicle", "Fahrzeug")}</option>
                        {fleet.data.vehicles.map((v) => { const m = matchVehicle(v, { vehicleType: r.vehicleType as VType, equipment: r.equipment as Equip, weightKg: r.weightKg ?? undefined }); const busy = isBusy(v.id, r.scheduledDate, r.pickupTime, busyList, r.id); return <option key={v.id} value={v.id} disabled={!m.ok || busy}>{v.label}{!m.ok ? " ✗" : busy ? ` (${L("busy", "belegt")})` : ""}</option>; })}
                      </Select>
                      <Button size="sm" disabled={!pick[r.id]?.v} onClick={async () => { try { await api(`/api/dispatch/rides/${r.id}/assign`, { body: { vehicleId: pick[r.id].v, driverId: pick[r.id].d ?? fleet.data!.drivers[0].id } }); reload(); } catch (e) { setErr((e as Error).message); } }}>OK</Button>
                    </div>
                  ) : (
                    <span className="text-sm">{r.vehicleLabel ?? "–"}<span className="block text-xs text-muted">{r.driverName ?? ""}</span></span>
                  )}
                </Td>
                <Td>
                  <Badge tone={STATUS_TONE[r.status]}>{r.status.replace("_", " ")}</Badge>
                  {r.flags.filter((f: Flag) => f.code === "series_unconfirmed").map((f: Flag, i: number) => <span key={i} className="mt-1 block text-xs text-warn">⚠ {L("not confirmed", "nicht bestätigt")}</span>)}
                  {["planned", "assigned"].includes(r.status) && (
                    <button className="mt-1 block text-xs text-bad underline" onClick={async () => { if (confirm(L("Cancel this ride? The patient is told by SMS.", "Diese Fahrt stornieren? Der Patient wird per SMS informiert."))) { try { await api(`/api/dispatch/rides/${r.id}/cancel`, { body: {} }); reload(); } catch (e) { setErr((e as Error).message); } } }}>{L("Cancel this date", "Diesen Termin stornieren")}</button>
                  )}
                </Td>
                <Td>{r.proof ? <Badge tone={r.proof.status === "verified" ? "good" : r.proof.status === "awaiting" ? "info" : "warn"}>{r.proof.status.replace("_", " ")}</Badge> : <span className="text-xs text-muted">–</span>}</Td>
              </tr>
            ))}
          </Table>
        </Card>
      ))}
    </div>
  );
}

// ------------------------------------------------------------------ fleet
function AddVehicle({ onDone }: { onDone: () => void }) {
  const { L } = useLang();
  const [label, setLabel] = useState("");
  const [plate, setPlate] = useState("");
  const [type, setType] = useState<"taxi" | "ktw">("taxi");
  const [eq, setEq] = useState<string[]>([]);
  const [err, setErr] = useState("");
  const names: Record<string, [string, string]> = { rollstuhl: ["wheelchair", "Rollstuhl"], tragestuhl: ["carry chair", "Tragestuhl"], liegend: ["stretcher", "Trage"], schwerlast: ["heavy-duty", "Schwerlast"] };
  return (
    <Card title={L("Add a vehicle", "Fahrzeug hinzufügen")}>
      <form onSubmit={async (e) => { e.preventDefault(); setErr(""); try { await api("/api/dispatch/vehicles", { body: { label, plate, type, equipment: eq } }); setLabel(""); setPlate(""); setEq([]); onDone(); } catch (x) { setErr((x as Error).message); } }} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Input placeholder={L("Name, e.g. KTW 3", "Name, z. B. KTW 3")} value={label} onChange={(e) => setLabel(e.target.value)} required />
          <Input placeholder={L("Plate", "Kennzeichen")} value={plate} onChange={(e) => setPlate(e.target.value)} required />
        </div>
        <Select value={type} onChange={(e) => setType(e.target.value as "taxi" | "ktw")}><option value="taxi">Taxi / Mietwagen</option><option value="ktw">KTW</option></Select>
        <div className="flex flex-wrap gap-3 text-sm">
          {Object.keys(names).map((k) => <label key={k} className="flex items-center gap-1.5"><input type="checkbox" checked={eq.includes(k)} onChange={(e) => setEq(e.target.checked ? [...eq, k] : eq.filter((x) => x !== k))} /> {L(...names[k])}</label>)}
        </div>
        {err && <ErrorBox>{err}</ErrorBox>}
        <Button type="submit">{L("Add vehicle", "Fahrzeug hinzufügen")}</Button>
      </form>
    </Card>
  );
}

function AddDriver({ onDone }: { onDone: () => void }) {
  const { L } = useLang();
  const [f, setF] = useState({ name: "", email: "", password: "" });
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");
  return (
    <Card title={L("Add a driver", "Fahrer hinzufügen")}>
      <form onSubmit={async (e) => { e.preventDefault(); setErr(""); setOk(""); try { await api("/api/dispatch/drivers", { body: f }); setOk(L(`${f.name} can sign in to the driver app now.`, `${f.name} kann sich jetzt in der Fahrer-App anmelden.`)); setF({ name: "", email: "", password: "" }); onDone(); } catch (x) { setErr((x as Error).message); } }} className="space-y-3">
        <Input placeholder={L("Name", "Name")} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required />
        <Input type="email" placeholder={L("Email", "E-Mail")} value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} required />
        <Input type="password" placeholder={L("Initial password", "Startpasswort")} value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} required />
        {err && <ErrorBox>{err}</ErrorBox>}{ok && <p className="text-sm text-good">{ok}</p>}
        <Button type="submit">{L("Add driver", "Fahrer hinzufügen")}</Button>
      </form>
    </Card>
  );
}

function FleetTab() {
  const { L, lang } = useLang();
  const { data, reload } = usePoll<{ company: any; vehicles: Vehicle[]; devices: any[] }>("/api/dispatch/fleet", 3000);
  if (!data) return null;
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <AddVehicle onDone={reload} />
      <AddDriver onDone={reload} />
      <Card title={`${data.company?.name} · IK ${data.company?.ik}`}>
        <Table head={[L("Vehicle", "Fahrzeug"), L("Plate", "Kennzeichen"), L("Equipment", "Ausstattung")]}>
          {data.vehicles.map((v) => (
            <tr key={v.id}><Td className="font-medium">{v.label}</Td><Td className="font-mono text-xs">{v.plate}</Td><Td><div className="flex flex-wrap gap-1"><Badge tone={v.type === "ktw" ? "ink" : "neutral"}>{v.type === "ktw" ? "KTW" : "Taxi"}</Badge>{v.equipment.map((e) => <Badge key={e} tone="info">{e}</Badge>)}</div></Td></tr>
          ))}
        </Table>
      </Card>
      <Card title={L("Driver phones", "Fahrer-Handys")}>
        <p className="mb-3 text-sm text-muted">{L("Each phone holds a key pair that never leaves it. Revoke a lost phone: it wipes its encrypted data at its next connection and its signatures stop counting.", "Jedes Handy hält ein Schlüsselpaar, das es nie verlässt. Ein verlorenes Handy lässt sich sperren: es löscht seine verschlüsselten Daten bei der nächsten Verbindung, seine Signaturen zählen nicht mehr.")}</p>
        {!data.devices.length && <Empty>{L("No phone registered yet. Open /driver on a phone.", "Noch kein Handy registriert. Öffnen Sie /driver auf einem Handy.")}</Empty>}
        <div className="space-y-2">
          {data.devices.map((d) => (
            <div key={d.id} className="flex items-center justify-between gap-3 rounded-xl border border-line p-3">
              <div>
                <p className="text-sm font-medium">{d.label} <span className="text-muted">· {d.userName}</span></p>
                <p className="text-xs text-muted">{L("last sync", "letzte Synchronisation")} {fmtDateTime(d.lastSyncAt, lang)}</p>
              </div>
              {d.status === "active" ? <Button size="sm" variant="danger" onClick={async () => { await api(`/api/dispatch/devices/${d.id}/revoke`, { body: {} }); reload(); }}>{L("Revoke", "Sperren")}</Button> : <Badge tone="bad">{L("revoked", "gesperrt")}</Badge>}
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

// ------------------------------------------------------------------ billing
function BillingTab() {
  const { L, lang } = useLang();
  const { data, reload } = usePoll<{ items: any[]; submissions: any[] }>("/api/dispatch/billing", 2500);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const eligible = data?.items.filter((i) => i.eligible) ?? [];
  const download = (payload: unknown, id: string) => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }));
    a.download = `${id}.json`; a.click();
  };
  return (
    <div className="space-y-5">
      <Card
        title={L("Completed rides, ready to bill", "Abgeschlossene Fahrten, bereit zur Abrechnung")}
        actions={<Button disabled={!eligible.length} onClick={async () => { setErr(""); try { const r = await api("/api/dispatch/billing/submit", { body: {} }); setMsg(L(`Submitted ${r.rides} ride(s) to the insurer.`, `${r.rides} Fahrt(en) an die Krankenkasse übermittelt.`)); reload(); } catch (e) { setErr((e as Error).message); } }}>{L(`Submit ${eligible.length} verified ride(s)`, `${eligible.length} verifizierte Fahrt(en) einreichen`)}</Button>}
      >
        <p className="mb-3 text-sm text-muted">{L("Only rides with a verified proof and no rule error can be billed. Problems are shown, never silently fixed.", "Nur Fahrten mit verifiziertem Nachweis und ohne Regelfehler können abgerechnet werden. Probleme werden angezeigt, nie stillschweigend korrigiert.")}</p>
        {err && <ErrorBox>{err}</ErrorBox>}
        {msg && <p className="mb-3 rounded-xl bg-good-soft px-3.5 py-2.5 text-sm text-good">{msg}</p>}
        {!data?.items.length ? <Empty>{L("Nothing completed yet.", "Noch nichts abgeschlossen.")}</Empty> : (
          <Table head={[L("Date", "Datum"), L("Patient", "Patient"), L("Leg", "Fahrt"), L("Proof", "Nachweis"), L("Amount", "Betrag"), L("Check", "Prüfung")]}>
            {data.items.map((i) => (
              <tr key={i.rideId}>
                <Td>{i.date}</Td>
                <Td><span className="font-medium">{i.patient}</span><span className="block text-xs text-muted">{i.scenario}</span></Td>
                <Td>{i.leg === "hin" ? L("out", "hin") : L("back", "rück")}</Td>
                <Td>{i.proof ? <Badge tone={i.proof.status === "verified" ? "good" : "warn"}>{i.proof.method} · {i.proof.status.replace("_", " ")}</Badge> : <Badge tone="bad">{L("none", "keiner")}</Badge>}</Td>
                <Td className="whitespace-nowrap text-xs">{eur(i.brutto)} · {L("co-pay", "Zuzahl.")} {eur(i.copay)}</Td>
                <Td className="min-w-64">
                  {i.eligible ? <Badge tone="good"><Check className="h-3 w-3" /> {L("ready", "bereit")}</Badge> : (
                    <div className="space-y-1.5">
                      <FlagList flags={i.flags} />
                      {i.flags.some((f: Flag) => f.code === "copay_mismatch") && (
                        <Button size="sm" variant="secondary" onClick={async () => { await api(`/api/dispatch/prescriptions/${i.prescriptionId}/correct-copay`, { body: {} }); reload(); }}>{L("Correct the co-payment (audited)", "Zuzahlung korrigieren (protokolliert)")}</Button>
                      )}
                    </div>
                  )}
                </Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
      {!!data?.submissions.length && (
        <Card title={L("Submitted to the insurer", "An die Krankenkasse übermittelt")}>
          <Table head={["ID", L("Submitted", "Eingereicht"), L("Rides", "Fahrten"), "Status", ""]}>
            {data.submissions.map((s) => (
              <tr key={s.id}>
                <Td className="font-mono text-xs">{s.id}</Td><Td>{fmtDateTime(s.createdAt, lang)}</Td><Td>{s.rides}</Td>
                <Td><Badge tone={s.status === "verified" ? "good" : s.status === "rejected" ? "bad" : "warn"}>{s.status}</Badge></Td>
                <Td><Button size="sm" variant="ghost" onClick={() => download(s.payload, s.id)}><Download className="h-4 w-4" /> JSON</Button></Td>
              </tr>
            ))}
          </Table>
        </Card>
      )}
    </div>
  );
}
