"use client";
import { CheckCircle2, ShieldCheck, XCircle } from "lucide-react";
import { useState } from "react";
import { api, eur, fmtDateTime, usePoll } from "@/lib/hooks";
import { useLang } from "@/lib/lang";
import { REASONS, type ReasonCode } from "@/lib/rules";
import type { Flag } from "@/lib/types";
import { Badge, Button, Card, Empty, ErrorBox, FlagList, Input, Table, Tabs, Td } from "./ui";

type Tab = "approvals" | "companies" | "audit" | "billing" | "review";

export function InsurerApp() {
  const { L } = useLang();
  const [tab, setTab] = useState<Tab>("approvals");
  const ap = usePoll<{ approvals: any[] }>("/api/insurer/approvals", 3000);
  const rv = usePoll<{ items: any[] }>("/api/insurer/review", 3000);
  const pending = ap.data?.approvals.filter((a) => a.status === "pending").length ?? 0;
  return (
    <div className="space-y-5">
      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { id: "approvals", label: L("Approvals", "Genehmigungen"), badge: pending || null },
          { id: "companies", label: L("Transport companies", "Transportunternehmen") },
          { id: "audit", label: L("Audit log", "Zugriffsprotokoll") },
          { id: "billing", label: L("Billing inbox", "Abrechnungseingang") },
          { id: "review", label: L("Review queue", "Prüfliste"), badge: rv.data?.items.length || null },
        ]}
      />
      {tab === "approvals" && <Approvals items={ap.data?.approvals ?? []} reload={ap.reload} />}
      {tab === "companies" && <Companies />}
      {tab === "audit" && <Audit />}
      {tab === "billing" && <Billing />}
      {tab === "review" && <Review items={rv.data?.items ?? []} reload={rv.reload} />}
    </div>
  );
}

function Approvals({ items, reload }: { items: any[]; reload: () => void }) {
  const { L } = useLang();
  const [note, setNote] = useState<Record<string, string>>({});
  const pending = items.filter((i) => i.status === "pending");
  const done = items.filter((i) => i.status !== "pending");
  const decide = async (id: string, decision: "approve" | "reject") => {
    await api(`/api/insurer/approvals/${id}`, { body: { decision, note: note[id] } });
    reload();
  };
  return (
    <div className="space-y-5">
      <Card title={L("Waiting for your decision", "Warten auf Ihre Entscheidung")}>
        {pending.length === 0 && <Empty>{L("Nothing to approve right now.", "Aktuell nichts zu genehmigen.")}</Empty>}
        <div className="space-y-4">
          {pending.map((a) => (
            <div key={a.id} className="rounded-xl border border-line p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-ink">{a.patient} · {a.scenario}</p>
                  <p className="text-sm text-muted">{L(REASONS[a.reasonCode as ReasonCode].en, REASONS[a.reasonCode as ReasonCode].de)}</p>
                  <p className="mt-1 text-sm">{L("Outbound", "Hinfahrt")}: <b>{a.hin.befoerderungsart} {a.hin.ausstattung !== "keine" ? `· ${a.hin.ausstattung}` : ""}</b> · {L("Return", "Rückfahrt")}: <b>{a.rueck.befoerderungsart} {a.rueck.ausstattung !== "keine" ? `· ${a.rueck.ausstattung}` : ""}</b>{a.frequency && <> · {a.frequency}</>}</p>
                </div>
                <Badge tone="warn">{L("pending", "offen")}</Badge>
              </div>
              <div className="mt-3 rounded-lg bg-paper p-3 text-sm">
                <span className="text-xs font-medium uppercase tracking-wide text-muted">{L("Medical justification (only visible to you)", "Medizinische Begründung (nur für Sie sichtbar)")}</span>
                <p className="mt-1">{a.justification ?? <span className="text-bad">{L("none given", "keine angegeben")}</span>}</p>
              </div>
              <div className="mt-3"><FlagList flags={a.flags as Flag[]} hideInfo /></div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Input className="max-w-xs" placeholder={L("Note to the patient (optional)", "Hinweis an Patient (optional)")} value={note[a.id] ?? ""} onChange={(e) => setNote({ ...note, [a.id]: e.target.value })} />
                <Button variant="good" onClick={() => decide(a.id, "approve")}><CheckCircle2 className="h-4 w-4" /> {L("Approve", "Genehmigen")}</Button>
                <Button variant="danger" onClick={() => decide(a.id, "reject")}><XCircle className="h-4 w-4" /> {L("Reject", "Ablehnen")}</Button>
              </div>
            </div>
          ))}
        </div>
      </Card>
      {done.length > 0 && (
        <Card title={L("Decided", "Entschieden")}>
          <Table head={[L("Patient", "Patient"), L("Scenario", "Szenario"), L("Decision", "Entscheidung")]}>
            {done.map((a) => (
              <tr key={a.id}><Td>{a.patient}</Td><Td>{a.scenario}</Td><Td>{a.status === "approved" ? <Badge tone="good">{L("approved", "genehmigt")}</Badge> : <Badge tone="bad">{L("rejected", "abgelehnt")}</Badge>}</Td></tr>
            ))}
          </Table>
        </Card>
      )}
    </div>
  );
}

function RegisterCompany({ onDone }: { onDone: () => void }) {
  const { L } = useLang();
  const empty = { name: "", ik: "", city: "", dispatcherName: "", dispatcherEmail: "", password: "" };
  const [f, setF] = useState(empty);
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");
  const set = (k: keyof typeof empty) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });
  return (
    <Card title={L("Register a new transport company", "Neues Transportunternehmen registrieren")}>
      <form onSubmit={async (e) => { e.preventDefault(); setErr(""); setOk(""); try { await api("/api/insurer/companies", { body: f }); setOk(L(`${f.name} is registered. Its dispatcher can sign in now.`, `${f.name} ist registriert. Der Disponent kann sich jetzt anmelden.`)); setF(empty); onDone(); } catch (x) { setErr((x as Error).message); } }} className="grid gap-3 md:grid-cols-3">
        <Input placeholder={L("Company name", "Firmenname")} value={f.name} onChange={set("name")} required />
        <Input placeholder={L("IK (9 digits)", "IK (9 Ziffern)")} value={f.ik} onChange={set("ik")} inputMode="numeric" maxLength={9} required />
        <Input placeholder={L("City", "Ort")} value={f.city} onChange={set("city")} required />
        <Input placeholder={L("Dispatcher name", "Name Disponent")} value={f.dispatcherName} onChange={set("dispatcherName")} required />
        <Input type="email" placeholder={L("Dispatcher email", "E-Mail Disponent")} value={f.dispatcherEmail} onChange={set("dispatcherEmail")} required />
        <Input type="password" placeholder={L("Initial password", "Startpasswort")} value={f.password} onChange={set("password")} required />
        <div className="md:col-span-3 flex items-center gap-3"><Button type="submit">{L("Register company", "Unternehmen registrieren")}</Button>{err && <span className="text-sm text-bad">{err}</span>}{ok && <span className="text-sm text-good">{ok}</span>}</div>
      </form>
    </Card>
  );
}

function Companies() {
  const { L } = useLang();
  const { data, reload } = usePoll<{ companies: any[] }>("/api/insurer/companies", 4000);
  return (
    <div className="space-y-5">
    <RegisterCompany onDone={reload} />
    <Card title={L("Registered transport companies", "Registrierte Transportunternehmen")}>
      <p className="mb-3 text-sm text-muted">{L("Only registered companies (by IK number) can redeem ride keys. Suspend one and its key redemptions stop at once.", "Nur registrierte Unternehmen (per IK-Nummer) können Fahrtschlüssel einlösen. Eine Sperre wirkt sofort.")}</p>
      <Table head={[L("Company", "Unternehmen"), "IK", L("City", "Ort"), L("Vehicles", "Fahrzeuge"), "Status", ""]}>
        {data?.companies.map((c) => (
          <tr key={c.id}>
            <Td className="font-medium">{c.name}</Td><Td className="font-mono text-xs">{c.ik}</Td><Td>{c.city}</Td><Td>{c.vehicles}</Td>
            <Td>{c.status === "registered" ? <Badge tone="good">{L("registered", "registriert")}</Badge> : <Badge tone="bad">{L("suspended", "gesperrt")}</Badge>}</Td>
            <Td>
              <Button size="sm" variant="secondary" onClick={async () => { await api(`/api/insurer/companies/${c.id}`, { method: "PATCH", body: { status: c.status === "registered" ? "suspended" : "registered" } }); reload(); }}>
                {c.status === "registered" ? L("Suspend", "Sperren") : L("Re-register", "Wieder freigeben")}
              </Button>
            </Td>
          </tr>
        ))}
      </Table>
    </Card>
    </div>
  );
}

const ACTION_TONE = (a: string): "bad" | "good" | "info" | "warn" | "neutral" =>
  a.includes("failed") || a.includes("reject") || a.includes("revoke") || a.includes("suspend") ? "bad" : a.includes("approve") || a.includes("accept") || a.includes("verified") ? "good" : a.startsWith("key.") || a.startsWith("ride.") ? "info" : a.includes("correct") ? "warn" : "neutral";

function Audit() {
  const { L, lang } = useLang();
  const { data } = usePoll<{ entries: any[] }>("/api/insurer/audit", 2500);
  return (
    <Card title={L("Who accessed what, and when", "Wer hat wann worauf zugegriffen")}>
      <Table head={[L("Time", "Zeit"), L("Action", "Aktion"), L("Actor", "Akteur"), L("Company", "Unternehmen"), L("Prescription", "Verordnung"), L("Detail", "Detail")]}>
        {data?.entries.map((e) => (
          <tr key={e.id}>
            <Td className="whitespace-nowrap text-xs text-muted">{fmtDateTime(e.at, lang)}</Td>
            <Td><Badge tone={ACTION_TONE(e.action)}>{e.action}</Badge></Td>
            <Td className="text-xs">{e.actorName ?? e.actorType}</Td>
            <Td className="text-xs">{e.company ?? "–"}</Td>
            <Td className="font-mono text-xs">{e.prescriptionId ?? "–"}</Td>
            <Td className="max-w-xs truncate font-mono text-[11px] text-muted">{e.detail ? JSON.stringify(e.detail) : ""}</Td>
          </tr>
        ))}
      </Table>
    </Card>
  );
}

function Check({ ok, label, detail }: { ok: boolean; label: string; detail?: string }) {
  return (
    <div className="flex items-start gap-2 text-sm">
      {ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-good" /> : <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-bad" />}
      <div><b>{label}</b>{detail && <span className="block text-xs text-muted">{detail}</span>}</div>
    </div>
  );
}

function Billing() {
  const { L, lang } = useLang();
  const { data, reload } = usePoll<{ submissions: any[] }>("/api/insurer/billing", 3000);
  const [res, setRes] = useState<Record<string, any>>({});
  const [busy, setBusy] = useState<string | null>(null);
  return (
    <Card title={L("Billing submissions from transport companies", "Abrechnungen der Transportunternehmen")}>
      {!data?.submissions.length && <Empty>{L("No submissions yet.", "Noch keine Einreichungen.")}</Empty>}
      <div className="space-y-4">
        {data?.submissions.map((s) => {
          const r = res[s.id];
          return (
            <div key={s.id} className="rounded-xl border border-line p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-semibold text-ink">{s.company} <span className="font-mono text-xs font-normal text-muted">{s.id}</span></p>
                  <p className="text-sm text-muted">{fmtDateTime(s.createdAt, lang)} · {s.rides} {L("rides", "Fahrten")} · {eur(s.totals.brutto)} · {L("co-payment", "Zuzahlung")} {eur(s.totals.copay)} · {s.totals.km} km</p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge tone={s.status === "verified" ? "good" : s.status === "rejected" ? "bad" : "warn"}>{s.status}</Badge>
                  <Button loading={busy === s.id} onClick={async () => { setBusy(s.id); const r2 = await api(`/api/insurer/billing/${s.id}/verify`, { body: {} }); setRes({ ...res, [s.id]: r2 }); setBusy(null); reload(); }}>
                    <ShieldCheck className="h-4 w-4" /> {L("Verify proofs", "Nachweise prüfen")}
                  </Button>
                </div>
              </div>
              {r && (
                <div className="mt-4 space-y-3">
                  {r.results.map((x: any) => (
                    <div key={x.rideId} className="rounded-lg bg-paper p-3">
                      <p className="mb-2 text-sm font-medium">{x.date} · {x.leg === "hin" ? L("outbound", "Hinfahrt") : L("return", "Rückfahrt")} {x.ok ? <Badge tone="good">{L("all layers valid", "alle Ebenen gültig")}</Badge> : <Badge tone="bad">{L("not valid", "nicht gültig")}</Badge>}</p>
                      {x.checks ? (
                        <div className="grid gap-3 md:grid-cols-3">
                          <Check ok={x.checks.patientLayer.ok} label={L("1. Patient was present", "1. Patient war anwesend")} detail={x.checks.patientLayer.detail ? `${x.checks.patientLayer.detail.method} · ${x.checks.patientLayer.detail.patientId}` : undefined} />
                          <Check ok={x.checks.deviceLayer.ok} label={L("2. Driver's device signed it", "2. Gerät des Fahrers hat signiert")} detail={x.checks.deviceLayer.detail?.device} />
                          <Check ok={x.checks.gatewayLayer.ok} label={L("3. Gateway countersignature", "3. Gegenzeichnung des Gateways")} detail={L("record untouched since receipt", "Datensatz seit Eingang unverändert")} />
                        </div>
                      ) : <p className="text-sm text-bad">{L("No proof found", "Kein Nachweis gefunden")}</p>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
}

const FLAG_TEXT: Record<string, [string, string]> = {
  clock_mismatch: ["Phone clock disagrees with the server-anchored time by more than 5 minutes", "Handy-Uhr weicht mehr als 5 Minuten von der Serverzeit ab"],
  gps_time_mismatch: ["GPS time disagrees with the device time", "GPS-Zeit weicht von der Gerätezeit ab"],
  ride_changed: ["Ride was cancelled or reassigned while the driver was offline", "Fahrt wurde storniert oder neu vergeben, während der Fahrer offline war"],
  device_revoked: ["Event arrived from a device revoked before it was recorded", "Ereignis von einem gesperrten Gerät"],
  bad_signature: ["Device signature does not match the data", "Gerätesignatur passt nicht zu den Daten"],
  pin_wrong: ["Wrong PIN", "Falsche PIN"],
  wrong_challenge: ["Tap was not made for this ride", "Tipp gehörte nicht zu dieser Fahrt"],
  no_gps: ["No GPS position captured", "Keine GPS-Position erfasst"],
};

function Review({ items, reload }: { items: any[]; reload: () => void }) {
  const { L, lang } = useLang();
  const [err, setErr] = useState("");
  return (
    <Card title={L("Proofs that need a human decision", "Nachweise, die eine Entscheidung brauchen")}>
      <p className="mb-3 text-sm text-muted">{L("Nothing is thrown away. Anything odd lands here with the reason, instead of being silently dropped or silently accepted.", "Nichts wird verworfen. Auffälliges landet hier mit Begründung, statt stillschweigend verworfen oder akzeptiert zu werden.")}</p>
      {err && <ErrorBox>{err}</ErrorBox>}
      {!items.length && <Empty>{L("Queue is empty.", "Die Liste ist leer.")}</Empty>}
      <div className="space-y-3">
        {items.map((i) => (
          <div key={i.id} className="rounded-xl border border-line p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-medium">{i.company} · {i.date} · {i.leg === "hin" ? L("outbound", "Hinfahrt") : L("return", "Rückfahrt")} <span className="text-xs text-muted">({i.method}, {fmtDateTime(i.tapTime, lang)})</span></p>
              <Badge tone={i.status === "rejected" ? "bad" : "warn"}>{i.status}</Badge>
            </div>
            <ul className="mt-2 list-inside list-disc text-sm text-bad">{i.flags.filter((f: string) => f !== "no_gps").map((f: string) => <li key={f}>{FLAG_TEXT[f] ? L(...FLAG_TEXT[f]) : f}</li>)}</ul>
            {i.note && <p className="mt-1 text-xs text-muted">{i.note}</p>}
            <div className="mt-3 flex gap-2">
              <Button size="sm" variant="good" onClick={async () => { try { await api(`/api/insurer/review/${i.id}`, { body: { decision: "accept" } }); reload(); } catch (e) { setErr((e as Error).message); } }}>{L("Accept proof", "Nachweis akzeptieren")}</Button>
              <Button size="sm" variant="danger" onClick={async () => { await api(`/api/insurer/review/${i.id}`, { body: { decision: "reject" } }); reload(); }}>{L("Reject", "Ablehnen")}</Button>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
