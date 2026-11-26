"use client";
import { RotateCcw } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { api, usePoll } from "@/lib/hooks";
import { useL } from "@/lib/lang";
import { LangToggle } from "./Shell";
import { Badge, Button, Card, CodeChip, ErrorBox, Field, Input, Logo, Table, Td } from "./ui";

type K = { prescriptionId: string; patientId: number; name: string; city: string; scenario: string; dob: string; code: string; pin: string; status: string; approval: string; keyStatus: string; bound: string | null };

export function DemoControl() {
  const L = useL();
  const { data, error, reload } = usePoll<{ keys: K[] }>("/api/demo/keys", 4000);
  const [busy, setBusy] = useState(false);
  const [accounts, setAccounts] = useState<{ id: string; name: string; role: string; company: string | null }[]>([]);
  const [open, setOpen] = useState(false);

  if (error?.code === "locked") return <PinGate onDone={reload} />;
  return (
    <div className="mx-auto max-w-6xl space-y-5 px-4 py-6">
      <div className="flex items-center justify-between">
        <Link href="/"><Logo size={30} /></Link>
        <LangToggle />
      </div>
      <Card
        title={L("Demo control", "Demo-Steuerung")}
        actions={
          <Button variant="danger" size="sm" loading={busy} onClick={async () => { setBusy(true); await api("/api/demo/reset", { body: {} }); await reload(); setBusy(false); }}>
            <RotateCcw className="h-4 w-4" /> {L("Reset demo data", "Demodaten zurücksetzen")}
          </Button>
        }
      >
        <p className="text-sm text-muted">
          {L(
            "Reset restores the 20 mock records. Patient 16 (carry chair, Berlin) has no prescription yet: the doctor issues it live. All accounts use the password “demo”.",
            "Reset stellt die 20 Mock-Datensätze wieder her. Patient 16 (Tragestuhl, Berlin) hat noch keine Verordnung: der Arzt stellt sie live aus. Alle Konten nutzen das Passwort „demo“.",
          )}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {[["/doctor", "doctor@demo.med"], ["/insurer", "insurer@demo.med"], ["/dispatch", "dispatch.spree@demo.med"], ["/driver", "driver.spree@demo.med"], ["/status", ""]].map(([href, email]) => (
            <Link key={href} href={email ? `/login?next=${href}` : href} className="rounded-lg border border-line bg-white px-3 py-1.5 text-sm font-medium text-ink hover:bg-cyan-soft">{href}{email && <span className="ml-2 text-xs text-muted">{email}</span>}</Link>
          ))}
        </div>
        <div className="mt-3">
          <button className="text-sm font-medium text-cyan" onClick={async () => { if (!open) setAccounts((await api("/api/demo/accounts")).accounts); setOpen(!open); }}>
            {open ? L("Hide accounts", "Konten ausblenden") : L("Show all accounts", "Alle Konten zeigen")}
          </button>
          {open && (
            <div className="mt-2 grid gap-1 text-sm sm:grid-cols-2">
              {accounts.map((a) => (<div key={a.id} className="rounded-lg bg-paper px-3 py-1.5"><b>{a.name}</b> · {a.role} · <span className="text-muted">{a.id.replace("u_", "")}</span></div>))}
            </div>
          )}
        </div>
      </Card>
      <Card title={L("Ride keys of all prescriptions (the printed letters)", "Fahrtschlüssel aller Verordnungen (die gedruckten Briefe)")}>
        <Table head={["#", L("Patient", "Patient"), L("Scenario", "Szenario"), L("Ride key", "Fahrtschlüssel"), L("Birth date", "Geburtsdatum"), "PIN", L("State", "Status")]}>
          {data?.keys.map((k) => (
            <tr key={k.prescriptionId}>
              <Td>{k.patientId}</Td>
              <Td>{k.name}<span className="block text-xs text-muted">{k.city}</span></Td>
              <Td>{k.scenario}</Td>
              <Td><CodeChip>{k.code}</CodeChip></Td>
              <Td className="font-mono text-xs">{k.dob}</Td>
              <Td className="font-mono text-xs">{k.pin}</Td>
              <Td>
                {k.keyStatus === "revoked" ? <Badge tone="bad">revoked</Badge> : k.status === "pending_approval" ? <Badge tone="warn">approval pending</Badge> : k.status === "rejected" ? <Badge tone="bad">rejected</Badge> : k.status === "cancelled" ? <Badge tone="neutral">cancelled</Badge> : k.bound ? <Badge tone="good">assigned</Badge> : <Badge tone="info">ready</Badge>}
              </Td>
            </tr>
          ))}
        </Table>
      </Card>
    </div>
  );
}

function PinGate({ onDone }: { onDone: () => void }) {
  const L = useL();
  const [pin, setPin] = useState("");
  const [err, setErr] = useState("");
  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 px-4">
      <Logo size={32} />
      <Card title={L("Demo controls are locked", "Demo-Steuerung ist gesperrt")}>
        <form onSubmit={async (e) => { e.preventDefault(); setErr(""); try { await api("/api/demo/unlock", { body: { pin } }); onDone(); } catch (x) { setErr((x as Error).message); } }} className="space-y-4">
          <Field label={L("Demo PIN", "Demo-PIN")}><Input type="password" value={pin} onChange={(e) => setPin(e.target.value)} autoFocus /></Field>
          {err && <ErrorBox>{err}</ErrorBox>}
          <Button type="submit" className="w-full">{L("Unlock", "Entsperren")}</Button>
        </form>
      </Card>
    </div>
  );
}
