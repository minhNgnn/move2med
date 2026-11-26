"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "@/lib/hooks";
import { useL } from "@/lib/lang";
import { LangToggle } from "./Shell";
import { Button, Card, ErrorBox, Field, Input, Logo } from "./ui";

export function LoginForm({ demo }: { demo: boolean }) {
  const L = useL();
  const router = useRouter();
  const next = useSearchParams().get("next");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [accounts, setAccounts] = useState<{ email: string; name: string; role: string; company: string | null }[]>([]);
  useEffect(() => {
    if (demo) api("/api/demo/accounts").then((r) => setAccounts(r.accounts)).catch(() => {});
  }, [demo]);

  async function submit(e: React.FormEvent | null, creds = { email, password }) {
    e?.preventDefault();
    setBusy(true);
    setErr("");
    try {
      const r = await api("/api/auth/login", { body: creds });
      router.push(next && next.startsWith("/") ? next : r.home);
      router.refresh();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center gap-6 px-4 py-10">
      <div className="flex items-center justify-between"><Logo size={32} /><LangToggle /></div>
      <Card title={L("Sign in", "Anmelden")}>
        <form onSubmit={(e) => submit(e)} className="space-y-4">
          <Field label={L("Email", "E-Mail")}><Input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@company.de" /></Field>
          <Field label={L("Password", "Passwort")}><Input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
          {err && <ErrorBox>{err}</ErrorBox>}
          <Button type="submit" loading={busy} className="w-full">{L("Sign in", "Anmelden")}</Button>
        </form>
      </Card>
      {demo && accounts.length > 0 && (
        <Card title={L("Demo accounts: click one to sign in", "Demo-Konten: anklicken zum Anmelden")} tone="cyan">
          <div className="grid gap-2 sm:grid-cols-2">
            {accounts.map((a) => (
              <button key={a.email} onClick={() => submit(null, { email: a.email, password: "demo" })} className="rounded-xl border border-line bg-white px-3 py-2 text-left text-sm hover:border-cyan">
                <span className="block font-medium text-ink">{a.name}</span>
                <span className="block text-xs text-muted">{a.email}</span>
              </button>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
