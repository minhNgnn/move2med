"use client";
import { CheckCircle2, FileText, Printer, ShieldAlert, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import { api, usePoll } from "@/lib/hooks";
import { useL } from "@/lib/lang";
import { approvalFor, checkPrescription, guessReason, REASONS, type ReasonCode } from "@/lib/rules";
import type { Equip, TransportData, VType } from "@/lib/types";
import { Qr } from "./Qr";
import { Badge, Button, Card, CodeChip, Empty, ErrorBox, Field, FlagList, Input, KV, Select, Textarea } from "./ui";

type Pat = {
  id: number; name: string; birthdate: string; kvnr: string; address: { strasse: string; plz: string; ort: string }; insurerName: string;
  exemption: { status: boolean; gueltig_bis: string | null }; draft: TransportData;
  prescription: { id: string; status: string; approval: string; reasonCode: string; scenario: string; bound: string | null } | null;
};
type Issued = { id: string; code: string; pin: string; approvalRequired: boolean; patient: string };

const FREQS = [["", "Single trip", "Einzelfahrt"], ["1x pro Woche", "1× per week", "1× pro Woche"], ["2x pro Woche", "2× per week", "2× pro Woche"], ["3x pro Woche", "3× per week", "3× pro Woche"], ["5x pro Woche", "5× per week", "5× pro Woche"]] as const;
const EQUIPS: Equip[] = ["keine", "Rollstuhl", "Tragestuhl", "liegend"];

export function DoctorApp() {
  const L = useL();
  const { data, reload } = usePoll<{ patients: Pat[] }>("/api/doctor/patients", 4000);
  const [selId, setSelId] = useState<number | null>(null);
  const [issued, setIssued] = useState<Issued | null>(null);
  const patients = data?.patients ?? [];
  const sel = patients.find((p) => p.id === selId) ?? null;

  return (
    <div className="grid gap-5 lg:grid-cols-[340px_1fr]">
      <Card title={L("Patients", "Patienten")} className="lg:sticky lg:top-20 lg:max-h-[calc(100vh-7rem)] lg:overflow-auto">
        <ul className="-m-2 space-y-1">
          {patients.map((p) => (
            <li key={p.id}>
              <button
                onClick={() => { setSelId(p.id); setIssued(null); }}
                className={clsx("flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2.5 text-left transition", selId === p.id ? "bg-ink text-white" : "hover:bg-cyan-soft")}
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{p.id}. {p.name} <span className="opacity-60">· {p.address.ort}</span></span>
                  <span className={clsx("block truncate text-xs", selId === p.id ? "text-white/70" : "text-muted")}>{p.draft.szenario}</span>
                </span>
                {p.prescription ? (
                  p.prescription.status === "pending_approval" ? <Badge tone="warn">{L("pending", "offen")}</Badge> : p.prescription.status === "rejected" ? <Badge tone="bad">{L("rejected", "abgelehnt")}</Badge> : p.prescription.bound ? <Badge tone="good">{L("assigned", "vergeben")}</Badge> : <Badge tone="info">{L("issued", "ausgestellt")}</Badge>
                ) : (
                  <Badge tone="neutral">{L("to do", "offen")}</Badge>
                )}
              </button>
            </li>
          ))}
        </ul>
      </Card>

      <div>
        {!sel && (
          <Card>
            <Empty>{L("Pick a patient. The form is pre-filled from the patient file, so you only decide what is medically needed.", "Patient wählen. Das Formular wird aus der Patientenakte vorausgefüllt, Sie entscheiden nur, was medizinisch nötig ist.")}</Empty>
          </Card>
        )}
        {sel && issued && issued.patient === sel.name && <IssuedCard issued={issued} onClose={() => { setIssued(null); }} />}
        {sel && !(issued && issued.patient === sel.name) && (sel.prescription ? <Existing p={sel} onChanged={reload} /> : <IssueForm key={sel.id} p={sel} onIssued={(r) => { setIssued({ ...r, patient: sel.name }); reload(); }} />)}
      </div>
    </div>
  );
}

function Existing({ p, onChanged }: { p: Pat; onChanged: () => void }) {
  const L = useL();
  const rx = p.prescription!;
  const [busy, setBusy] = useState(false);
  return (
    <Card title={`${p.name}: ${rx.scenario}`} actions={<Badge tone={rx.status === "ready" ? "good" : rx.status === "pending_approval" ? "warn" : "bad"}>{rx.status.replace("_", " ")}</Badge>}>
      <p className="mb-4 text-sm text-muted">{L("This patient already has an active prescription. A correction means cancel and reissue, so nothing is silently edited.", "Dieser Patient hat bereits eine aktive Verordnung. Eine Korrektur bedeutet stornieren und neu ausstellen, nichts wird stillschweigend geändert.")}</p>
      <div className="flex flex-wrap gap-2">
        <Link href={`/letter/${rx.id}`} target="_blank"><Button variant="secondary"><Printer className="h-4 w-4" /> {L("Print approval letter", "Brief drucken")}</Button></Link>
        <Button variant="danger" loading={busy} onClick={async () => { setBusy(true); await api(`/api/doctor/prescriptions/${rx.id}/cancel`, { body: {} }); setBusy(false); onChanged(); }}>
          {L("Cancel and reissue", "Stornieren und neu ausstellen")}
        </Button>
      </div>
    </Card>
  );
}

function IssuedCard({ issued, onClose }: { issued: Issued; onClose: () => void }) {
  const L = useL();
  const [origin, setOrigin] = useState("");
  useEffect(() => setOrigin(window.location.origin), []);
  return (
    <Card title={L("Prescription issued", "Verordnung ausgestellt")} tone="good" actions={<Button variant="ghost" size="sm" onClick={onClose}>{L("Close", "Schließen")}</Button>}>
      <div className="grid gap-6 md:grid-cols-[200px_1fr]">
        <div className="rounded-2xl bg-white p-3 ring-1 ring-line"><Qr value={`${origin}/status?k=${issued.code}`} size={176} /></div>
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-good"><CheckCircle2 className="h-5 w-5" /><b>{L("Ride key created", "Fahrtschlüssel erzeugt")}</b></div>
          <div><CodeChip>{issued.code}</CodeChip> <span className="ml-2 text-sm text-muted">PIN {issued.pin}</span></div>
          {issued.approvalRequired ? (
            <p className="text-sm text-warn"><ShieldAlert className="mr-1 inline h-4 w-4" />{L("This trip needs the insurer's approval. The key works for transport companies once it is approved. The patient is informed by SMS.", "Diese Fahrt braucht die Genehmigung der Krankenkasse. Der Schlüssel funktioniert für Transportunternehmen nach der Genehmigung. Der Patient wird per SMS informiert.")}</p>
          ) : (
            <p className="text-sm text-good"><ShieldCheck className="mr-1 inline h-4 w-4" />{L("No approval needed. The patient can hand the key to a transport company right now.", "Keine Genehmigung nötig. Der Patient kann den Schlüssel sofort an ein Transportunternehmen geben.")}</p>
          )}
          <Link href={`/letter/${issued.id}`} target="_blank"><Button><Printer className="h-4 w-4" /> {L("Print letter for the patient", "Brief für den Patienten drucken")}</Button></Link>
        </div>
      </div>
    </Card>
  );
}

function LegEditor({ title, v, onChange }: { title: string; v: { befoerderungsart: VType; ausstattung: Equip }; onChange: (v: { befoerderungsart: VType; ausstattung: Equip }) => void }) {
  const L = useL();
  const eqLabel: Record<Equip, [string, string]> = { keine: ["none", "keine"], Rollstuhl: ["wheelchair", "Rollstuhl"], Tragestuhl: ["carry chair", "Tragestuhl"], liegend: ["lying down", "liegend"] };
  return (
    <div className="rounded-xl border border-line p-3">
      <p className="mb-2 text-sm font-semibold text-ink">{title}</p>
      <div className="grid grid-cols-2 gap-3">
        <Field label={L("Vehicle", "Fahrzeug")}>
          <Select value={v.befoerderungsart} onChange={(e) => onChange({ ...v, befoerderungsart: e.target.value as VType })}>
            <option value="Taxi">{L("Taxi / rental car", "Taxi / Mietwagen")}</option>
            <option value="KTW">KTW ({L("patient transport ambulance", "Krankentransportwagen")})</option>
          </Select>
        </Field>
        <Field label={L("Equipment", "Ausstattung")}>
          <Select value={v.ausstattung} onChange={(e) => onChange({ ...v, ausstattung: e.target.value as Equip })}>
            {EQUIPS.map((q) => <option key={q} value={q}>{L(...eqLabel[q])}</option>)}
          </Select>
        </Field>
      </div>
    </div>
  );
}

function IssueForm({ p, onIssued }: { p: Pat; onIssued: (r: Omit<Issued, "patient">) => void }) {
  const L = useL();
  const [d, setD] = useState<TransportData>(() => structuredClone(p.draft));
  const [reason, setReason] = useState<ReasonCode>(() => guessReason(p.draft));
  const [just, setJust] = useState("");
  const [sameBack, setSameBack] = useState(p.draft.hinfahrt.befoerderungsart === p.draft.rueckfahrt.befoerderungsart && p.draft.hinfahrt.ausstattung === p.draft.rueckfahrt.ausstattung);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const data: TransportData = useMemo(() => ({ ...d, rueckfahrt: sameBack ? d.hinfahrt : d.rueckfahrt }), [d, sameBack]);
  const ap = approvalFor(reason, data);
  const flags = useMemo(() => checkPrescription({ reasonCode: reason, data, justification: just || null, exemption: p.exemption }), [reason, data, just, p.exemption]);
  const blocking = flags.some((f) => f.severity === "error");
  const set = (patch: Partial<TransportData>) => setD((x) => ({ ...x, ...patch }));
  const setB = (patch: Partial<TransportData["behandlung"]>) => setD((x) => ({ ...x, behandlung: { ...x.behandlung, ...patch } }));
  const setZ = (patch: Partial<TransportData["behandlung"]["zieladresse"]>) => setB({ zieladresse: { ...d.behandlung.zieladresse, ...patch } });

  async function submit() {
    setBusy(true); setErr("");
    try {
      const r = await api("/api/doctor/prescriptions", { body: { patientId: p.id, reasonCode: reason, justification: just.trim() || null, data } });
      onIssued(r);
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }

  return (
    <div className="space-y-5">
      <Card title={`${p.name} · ${p.birthdate}`} actions={<Badge tone="info"><FileText className="h-3 w-3" /> {L("pre-filled from patient file", "aus Patientenakte vorausgefüllt")}</Badge>}>
        <dl className="grid gap-x-8 sm:grid-cols-2">
          <KV k={L("Insurance no.", "Versichertennr.")}>{p.kvnr}</KV>
          <KV k={L("Insurer", "Krankenkasse")}>{p.insurerName}</KV>
          <KV k={L("Home address", "Wohnanschrift")}>{p.address.strasse}, {p.address.plz} {p.address.ort}</KV>
          <KV k={L("Co-payment exemption", "Zuzahlungsbefreiung")}>{p.exemption.status ? <Badge tone="good">{L("yes, until", "ja, bis")} {p.exemption.gueltig_bis}</Badge> : <Badge>{L("no", "nein")}</Badge>}</KV>
        </dl>
      </Card>

      <Card title={L("1. Reason for the transport", "1. Grund der Beförderung")}>
        <Select value={reason} onChange={(e) => setReason(e.target.value as ReasonCode)}>
          {(Object.keys(REASONS) as ReasonCode[]).map((k) => <option key={k} value={k}>{L(REASONS[k].en, REASONS[k].de)}</option>)}
        </Select>
        <div className={clsx("mt-3 flex items-center gap-2 rounded-xl px-3.5 py-2.5 text-sm font-medium", ap.required ? "bg-warn-soft text-warn" : "bg-good-soft text-good")}>
          {ap.required ? <ShieldAlert className="h-4 w-4" /> : <ShieldCheck className="h-4 w-4" />}
          {ap.required ? L("Needs the insurer's approval before the trip (worked out for you).", "Braucht die Genehmigung der Krankenkasse vor der Fahrt (automatisch ermittelt).") : L("No approval needed. The patient can book right away.", "Keine Genehmigung nötig. Der Patient kann sofort buchen.")}
        </div>
      </Card>

      <Card title={L("2. Treatment and destination", "2. Behandlung und Ziel")}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={L("Treatment", "Behandlung")}><Input value={d.behandlung.bezeichnung} onChange={(e) => { setB({ bezeichnung: e.target.value }); set({ szenario: e.target.value }); }} /></Field>
          <Field label={L("Frequency", "Häufigkeit")}>
            <Select value={d.behandlung.haeufigkeit ?? ""} onChange={(e) => setB({ haeufigkeit: e.target.value || null })}>
              {FREQS.map(([v, en, de]) => <option key={v} value={v}>{L(en, de)}</option>)}
            </Select>
          </Field>
          <Field label={L("Appointment", "Termin")}><Input type="time" value={d.behandlung.termin_uhrzeit} onChange={(e) => setB({ termin_uhrzeit: e.target.value })} /></Field>
          <Field label={L("Pickup at home", "Abholung zuhause")}><Input type="time" value={d.behandlung.abholzeit_geplant} onChange={(e) => setB({ abholzeit_geplant: e.target.value })} /></Field>
          <Field label={L("Facility", "Einrichtung")} className="sm:col-span-2"><Input value={d.behandlung.zieladresse.einrichtung} onChange={(e) => setZ({ einrichtung: e.target.value })} /></Field>
          <Field label={L("Street", "Straße")}><Input value={d.behandlung.zieladresse.strasse} onChange={(e) => setZ({ strasse: e.target.value })} /></Field>
          <div className="grid grid-cols-[110px_1fr] gap-3">
            <Field label={L("ZIP", "PLZ")}><Input value={d.behandlung.zieladresse.plz} onChange={(e) => setZ({ plz: e.target.value })} /></Field>
            <Field label={L("City", "Ort")}><Input value={d.behandlung.zieladresse.ort} onChange={(e) => setZ({ ort: e.target.value })} /></Field>
          </div>
        </div>
      </Card>

      <Card title={L("3. Type and equipment of the transport", "3. Art und Ausstattung der Beförderung")}>
        <div className="grid gap-3 md:grid-cols-2">
          <LegEditor title={L("Outbound", "Hinfahrt")} v={d.hinfahrt} onChange={(v) => set({ hinfahrt: v })} />
          {sameBack ? (
            <div className="flex items-center rounded-xl border border-dashed border-line p-3 text-sm text-muted">{L("Return trip: same as outbound", "Rückfahrt: wie Hinfahrt")}</div>
          ) : (
            <LegEditor title={L("Return", "Rückfahrt")} v={d.rueckfahrt} onChange={(v) => set({ rueckfahrt: v })} />
          )}
        </div>
        <label className="mt-3 flex items-center gap-2 text-sm"><input type="checkbox" checked={sameBack} onChange={(e) => { setSameBack(e.target.checked); if (!e.target.checked) set({ rueckfahrt: { ...d.hinfahrt } }); }} /> {L("Return trip uses the same vehicle and equipment", "Rückfahrt mit gleichem Fahrzeug und gleicher Ausstattung")}</label>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <Field label={L("Accident / occupational / BVG", "Unfall / Berufskrankheit / BVG")}>
            <Select value={d.unfallbezug} onChange={(e) => set({ unfallbezug: e.target.value as TransportData["unfallbezug"] })}>
              <option value="kein Unfallbezug">{L("none", "kein Unfallbezug")}</option>
              <option value="Arbeitsunfall">{L("work accident", "Arbeitsunfall")}</option>
              <option value="Berufskrankheit">{L("occupational disease", "Berufskrankheit")}</option>
              <option value="Versorgungsleiden (BVG)">{L("war-victims law (BVG)", "Versorgungsleiden (BVG)")}</option>
            </Select>
          </Field>
          <Field label={L("Patient weight (kg), if heavy", "Gewicht (kg), falls schwer")}>
            <Input type="number" min={20} max={500} value={d.sonstiges.gewicht_kg ?? ""} onChange={(e) => set({ sonstiges: { ...d.sonstiges, gewicht_kg: e.target.value ? Number(e.target.value) : undefined } })} />
          </Field>
          <Field label={L("Driver waiting time (min)", "Wartezeit Fahrer (Min.)")}>
            <Input type="number" min={0} max={600} value={d.sonstiges.wartezeit_min ?? ""} onChange={(e) => set({ sonstiges: { ...d.sonstiges, wartezeit_min: e.target.value ? Number(e.target.value) : undefined } })} />
          </Field>
        </div>
        <label className="mt-3 flex items-center gap-2 text-sm"><input type="checkbox" checked={!!d.sonstiges.gemeinschaftsfahrt} onChange={(e) => set({ sonstiges: { ...d.sonstiges, gemeinschaftsfahrt: e.target.checked || undefined } })} /> {L("Shared ride is possible", "Gemeinschaftsfahrt möglich")}</label>
      </Card>

      <Card title={L("4. Medical justification", "4. Medizinische Begründung")}>
        <Textarea value={just} onChange={(e) => setJust(e.target.value)} placeholder={L("Why is this vehicle medically necessary? (mandatory for a KTW)", "Warum ist dieses Fahrzeug medizinisch notwendig? (Pflicht bei KTW)")} />
        <p className="mt-1 text-xs text-muted">{L("Only the insurer sees this text. Transport companies learn that a justification exists, not what it says.", "Nur die Krankenkasse sieht diesen Text. Transportunternehmen erfahren nur, dass eine Begründung existiert, nicht den Inhalt.")}</p>
      </Card>

      <Card title={L("Checks before you sign", "Prüfungen vor der Unterschrift")} tone={blocking ? "bad" : undefined}>
        {flags.length ? <FlagList flags={flags} /> : <p className="text-sm text-good">{L("All checks passed.", "Alle Prüfungen bestanden.")}</p>}
        {err && <div className="mt-3"><ErrorBox>{err}</ErrorBox></div>}
        <div className="mt-4 flex justify-end">
          <Button size="lg" disabled={blocking} loading={busy} onClick={submit}>{L("Sign and issue e-prescription", "E-Verordnung signieren und ausstellen")}</Button>
        </div>
      </Card>
    </div>
  );
}
