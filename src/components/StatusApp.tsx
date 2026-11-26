"use client";
import clsx from "clsx";
import { CheckCircle2, Circle, Clock, KeyRound, MessageSquare, ShieldOff, Truck, UserCheck } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { api, ApiError, fmtDate, fmtTime, usePoll } from "@/lib/hooks";
import { useLang } from "@/lib/lang";
import { LangToggle } from "./Shell";
import { Badge, Button, Card, CodeChip, ErrorBox, Field, Input, Logo } from "./ui";

type Status = {
  patient: { name: string; insurer: string }; status: string; workflow?: string; approval: string; keyStatus: string; company: { name: string } | null;
  trip: { scenario: string; facility: { einrichtung: string; strasse: string; plz: string; ort: string }; appointment: string; frequency: string | null };
  rides: { id: string; leg: string; date: string; pickupTime: string; status: string; pickedUpAt: string | null; completedAt: string | null; vehicle: string | null; proof: string | null; proofMethod: string | null; confirmedByRelative: boolean }[];
  messages: { id: number; at: string; en: string; de: string }[];
};

export function StatusApp() {
  const { L } = useLang();
  const k = useSearchParams().get("k") ?? "";
  const { data, error, reload } = usePoll<Status>("/api/patient/status", 2500);
  const authed = !!data && !error;

  return (
    <div className="mx-auto min-h-screen max-w-2xl space-y-5 px-4 py-6 text-[17px]">
      <div className="flex items-center justify-between"><Logo size={30} /><LangToggle /></div>
      {error && error.status === 401 && <PatientLogin initialCode={k} onDone={reload} />}
      {error && error.status !== 401 && <ErrorBox>{error.message}</ErrorBox>}
      {authed && <Dashboard d={data!} reload={reload} />}
    </div>
  );
}

function PatientLogin({ initialCode, onDone }: { initialCode: string; onDone: () => void }) {
  const { L } = useLang();
  const [code, setCode] = useState(initialCode.toUpperCase());
  const [dob, setDob] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  async function go(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setErr("");
    try { await api("/api/patient/login", { body: { code, dob } }); onDone(); }
    catch (e) { setErr((e as ApiError).message); } finally { setBusy(false); }
  }
  return (
    <Card>
      <h1 className="text-2xl font-semibold text-ink">{L("Where is my ride?", "Wo ist meine Fahrt?")}</h1>
      <p className="mt-2 text-muted">{L("No account needed. Enter the ride key from your letter and your date of birth.", "Kein Konto nötig. Geben Sie den Fahrtschlüssel aus Ihrem Brief und Ihr Geburtsdatum ein.")}</p>
      <form onSubmit={go} className="mt-5 space-y-4">
        <Field label={L("Ride key", "Fahrtschlüssel")}><Input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="XXXX-XXXX" className="!py-4 !text-2xl font-mono tracking-widest" autoComplete="off" /></Field>
        <Field label={L("Date of birth", "Geburtsdatum")} hint={L("e.g. 1986-05-17 or 17.05.1986", "z. B. 1986-05-17 oder 17.05.1986")}><Input value={dob} onChange={(e) => setDob(e.target.value)} className="!py-4 !text-xl" autoComplete="off" /></Field>
        {err && <ErrorBox>{err}</ErrorBox>}
        <Button type="submit" size="lg" loading={busy} className="w-full" disabled={code.length < 8 || dob.length < 8}>{L("Show my ride", "Meine Fahrt anzeigen")}</Button>
      </form>
    </Card>
  );
}

function Step({ state, title, children }: { state: "done" | "now" | "todo" | "bad"; title: string; children?: React.ReactNode }) {
  return (
    <li className="flex gap-4">
      <div className="flex flex-col items-center">
        {state === "done" ? <CheckCircle2 className="h-8 w-8 text-good" /> : state === "now" ? <Clock className="h-8 w-8 text-warn" /> : state === "bad" ? <ShieldOff className="h-8 w-8 text-bad" /> : <Circle className="h-8 w-8 text-line" />}
        <div className="mt-1 w-0.5 flex-1 bg-line" />
      </div>
      <div className="pb-6">
        <p className={clsx("text-xl font-semibold", state === "todo" ? "text-muted" : "text-ink")}>{title}</p>
        {children && <div className="mt-1 text-base text-muted">{children}</div>}
      </div>
    </li>
  );
}

function Dashboard({ d, reload }: { d: Status; reload: () => void }) {
  const { L, lang } = useLang();
  const [newKey, setNewKey] = useState<{ code: string; pin: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState("");
  const dates = [...new Set(d.rides.map((r) => r.date))];
  const doneCount = d.rides.filter((r) => r.status === "completed").length;
  const revoked = d.keyStatus === "revoked";

  const call = async (name: string, path: string, body: object = {}) => {
    setBusy(name); setErr("");
    try { const r = await api(path, { body }); if (name === "reassign") setNewKey({ code: r.code, pin: r.pin }); reload(); }
    catch (e) { setErr((e as Error).message); } finally { setBusy(null); }
  };

  return (
    <>
      <Card>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-ink">{L("Hello", "Guten Tag")}, {d.patient.name}</h1>
            <p className="mt-1 text-muted">{d.trip.scenario} · {d.trip.facility.einrichtung}, {d.trip.facility.ort}</p>
          </div>
          {d.workflow && <Badge title="FHIR Task status">{d.workflow}</Badge>}
          <button className="text-sm text-muted underline" onClick={async () => { await api("/api/patient/logout", { body: {} }); reload(); }}>{L("Leave", "Verlassen")}</button>
        </div>
        {revoked && <div className="mt-4"><ErrorBox>{L("You revoked your ride key. No company can use it any more.", "Sie haben Ihren Fahrtschlüssel widerrufen. Kein Unternehmen kann ihn mehr nutzen.")}</ErrorBox></div>}
        {newKey && (
          <div className="mt-4 rounded-2xl border-2 border-cyan bg-cyan-soft p-4">
            <p className="font-semibold text-ink">{L("Your new ride key (the old one stopped working):", "Ihr neuer Fahrtschlüssel (der alte funktioniert nicht mehr):")}</p>
            <div className="mt-2 flex items-center gap-3"><CodeChip>{newKey.code}</CodeChip><span className="text-sm text-muted">PIN {newKey.pin}</span></div>
          </div>
        )}
      </Card>

      <Card title={L("Your trip, step by step", "Ihre Fahrt, Schritt für Schritt")}>
        <ol>
          <Step state="done" title={L("Prescription issued", "Verordnung ausgestellt")}>{L("by your doctor", "durch Ihren Arzt")}</Step>
          {d.approval !== "none" && (
            <Step state={d.approval === "approved" ? "done" : d.approval === "rejected" ? "bad" : "now"} title={d.approval === "approved" ? L("Insurer approved", "Krankenkasse hat genehmigt") : d.approval === "rejected" ? L("Insurer could not approve", "Krankenkasse konnte nicht genehmigen") : L("Insurer is checking", "Krankenkasse prüft")}>
              {d.approval === "pending" && L("You will get an SMS. Your ride key starts working after approval.", "Sie erhalten eine SMS. Ihr Fahrtschlüssel funktioniert nach der Genehmigung.")}
            </Step>
          )}
          <Step state={d.company ? "done" : revoked || d.approval === "rejected" || d.approval === "pending" ? "todo" : "now"} title={d.company ? `${d.company.name}` : L("Give your ride key to a transport company", "Geben Sie Ihren Fahrtschlüssel an ein Transportunternehmen")}>
            {d.company ? L("accepted your trip", "hat Ihre Fahrt angenommen") : L("Call a company and read out your key, or show your letter.", "Rufen Sie ein Unternehmen an und lesen Sie den Schlüssel vor, oder zeigen Sie den Brief.")}
          </Step>
          <Step state={d.rides.length && doneCount === d.rides.length ? "done" : doneCount > 0 || d.rides.some((r) => r.status === "picked_up") ? "now" : "todo"} title={d.rides.length ? L(`Rides (${doneCount} of ${d.rides.length} done)`, `Fahrten (${doneCount} von ${d.rides.length} erledigt)`) : L("Rides", "Fahrten")}>
            {!d.rides.length && L("They appear here once a company accepts.", "Sie erscheinen hier, sobald ein Unternehmen annimmt.")}
          </Step>
        </ol>
        {dates.map((date) => (
          <div key={date} className="mt-2">
            <p className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">{fmtDate(date, lang)}</p>
            <div className="space-y-2">
              {d.rides.filter((r) => r.date === date).map((r) => (
                <div key={r.id} className={clsx("flex flex-wrap items-center justify-between gap-3 rounded-2xl border-2 p-4", r.status === "picked_up" ? "border-warn bg-warn-soft" : r.status === "completed" ? "border-good/40 bg-good-soft" : "border-line bg-white")}>
                  <div>
                    <p className="text-xl font-semibold text-ink"><Truck className="mr-2 inline h-5 w-5 text-cyan" />{r.leg === "hin" ? L("To the clinic", "Zur Klinik") : L("Back home", "Zurück nach Hause")} · {r.pickupTime}</p>
                    <p className="text-sm text-muted">{r.vehicle ?? L("vehicle not assigned yet", "Fahrzeug noch nicht zugewiesen")} · {r.status === "completed" ? <>{L("arrived", "angekommen")} {fmtTime(r.completedAt, lang)}</> : r.status === "picked_up" ? <>{L("picked up", "abgeholt")} {fmtTime(r.pickedUpAt, lang)}</> : L("planned", "geplant")}</p>
                    {r.proof === "verified" && <Badge tone="good" className="mt-1"><CheckCircle2 className="h-3 w-3" /> {L("confirmed", "bestätigt")}</Badge>}
                    {r.proof === "awaiting" && <Badge tone="info" className="mt-1">{L("waiting for your confirmation", "wartet auf Ihre Bestätigung")}</Badge>}
                  </div>
                  {["picked_up", "completed"].includes(r.status) && !r.confirmedByRelative && (r.proofMethod === null || r.proofMethod === "proxy") && (
                    <Button size="lg" variant="good" loading={busy === r.id} onClick={() => call(r.id, "/api/patient/confirm", { rideId: r.id })}><UserCheck className="h-5 w-5" /> {L("Confirm this ride (relative)", "Fahrt bestätigen (Angehörige)")}</Button>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </Card>

      <Card title={<span className="flex items-center gap-2"><MessageSquare className="h-4 w-4 text-cyan" /> {L("Your messages (simulated SMS)", "Ihre Nachrichten (simulierte SMS)")}</span>}>
        <div className="space-y-2">
          {d.messages.map((m) => (
            <div key={m.id} className="max-w-[92%] rounded-2xl rounded-tl-md bg-paper px-4 py-2.5 text-base">
              <p>{L(m.en, m.de)}</p>
              <p className="mt-0.5 text-xs text-muted">{fmtTime(m.at, lang)}</p>
            </div>
          ))}
        </div>
      </Card>

      {!revoked && (
        <Card title={<span className="flex items-center gap-2"><KeyRound className="h-4 w-4 text-cyan" /> {L("You stay in control of your key", "Sie behalten die Kontrolle über Ihren Schlüssel")}</span>}>
          {err && <div className="mb-3"><ErrorBox>{err}</ErrorBox></div>}
          <div className="flex flex-wrap gap-3">
            {d.company && <Button variant="secondary" size="lg" loading={busy === "reassign"} onClick={() => call("reassign", "/api/patient/reassign")}>{L("Choose another company", "Anderes Unternehmen wählen")}</Button>}
            <Button variant="danger" size="lg" loading={busy === "revoke"} onClick={() => call("revoke", "/api/patient/revoke")}>{L("Revoke my key", "Meinen Schlüssel widerrufen")}</Button>
          </div>
          <p className="mt-3 text-sm text-muted">{L("Choosing another company issues a new key; the old one stops working at once.", "Ein anderes Unternehmen zu wählen erzeugt einen neuen Schlüssel; der alte funktioniert sofort nicht mehr.")}</p>
        </Card>
      )}
    </>
  );
}
