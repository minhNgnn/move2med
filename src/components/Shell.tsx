"use client";
import { LogOut, Languages, Shuffle } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { api } from "@/lib/hooks";
import { useLang } from "@/lib/lang";
import type { Role } from "@/lib/types";
import { Badge, Logo } from "./ui";

const ROLE_LABEL: Record<Role, [string, string]> = {
  doctor: ["Doctor", "Arzt"],
  insurer: ["Insurer", "Krankenkasse"],
  dispatcher: ["Transport company", "Transportunternehmen"],
  driver: ["Driver", "Fahrer"],
};

export function LangToggle({ light }: { light?: boolean }) {
  const { lang, setLang } = useLang();
  return (
    <button
      onClick={() => setLang(lang === "en" ? "de" : "en")}
      className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold ${light ? "text-white/90 hover:bg-white/10" : "text-ink hover:bg-cyan-soft"}`}
      aria-label="Switch language"
    >
      <Languages className="h-4 w-4" />
      <span className={lang === "en" ? "" : "opacity-50"}>EN</span>/<span className={lang === "de" ? "" : "opacity-50"}>DE</span>
    </button>
  );
}

type Account = { id: string; name: string; role: Role; company: string | null };

function DemoSwitcher() {
  const router = useRouter();
  const [accounts, setAccounts] = useState<Account[] | null>(null);
  const [open, setOpen] = useState(false);
  const { L } = useLang();
  useEffect(() => {
    api("/api/demo/accounts").then((r) => setAccounts(r.accounts)).catch(() => setAccounts(null));
  }, []);
  if (!accounts) return null;
  return (
    <div className="relative">
      <button onClick={() => setOpen(!open)} className="inline-flex items-center gap-1.5 rounded-lg bg-white/10 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-white/20">
        <Shuffle className="h-4 w-4" /> {L("Switch role", "Rolle wechseln")}
      </button>
      {open && (
        <div className="absolute right-0 z-50 mt-2 max-h-96 w-72 overflow-auto rounded-xl border border-line bg-white p-1 text-sm shadow-xl">
          {accounts.map((a) => (
            <button
              key={a.id}
              onClick={async () => {
                const r = await api("/api/demo/switch", { body: { userId: a.id } });
                setOpen(false);
                router.push(r.home);
                router.refresh();
              }}
              className="flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-text hover:bg-cyan-soft"
            >
              <span>
                <span className="block font-medium">{a.name}</span>
                <span className="block text-xs text-muted">{a.company ?? "–"}</span>
              </span>
              <Badge tone="info">{ROLE_LABEL[a.role][0]}</Badge>
            </button>
          ))}
          <Link href="/demo" className="block rounded-lg px-3 py-2 text-xs font-semibold text-cyan hover:bg-cyan-soft" onClick={() => setOpen(false)}>
            {L("Demo keys & reset →", "Demo-Schlüssel & Reset →")}
          </Link>
        </div>
      )}
    </div>
  );
}

export function Shell({ session, subtitle, children, wide }: { session: { name: string; role: Role }; subtitle?: string; children: ReactNode; wide?: boolean }) {
  const router = useRouter();
  const { lang, L } = useLang();
  return (
    <div className="min-h-screen">
      <header className="no-print sticky top-0 z-40 border-b border-white/10 bg-ink">
        <div className={`mx-auto flex items-center justify-between gap-3 px-4 py-3 ${wide ? "max-w-[1400px]" : "max-w-6xl"}`}>
          <div className="flex items-center gap-4">
            <Link href="/"><Logo light /></Link>
            <Badge tone="info" className="hidden sm:inline-flex">{ROLE_LABEL[session.role][lang === "de" ? 1 : 0]}</Badge>
            {subtitle && <span className="hidden text-sm text-white/70 md:inline">{subtitle}</span>}
          </div>
          <div className="flex items-center gap-1.5">
            <span className="hidden text-sm text-white/80 lg:inline">{session.name}</span>
            <DemoSwitcher />
            <LangToggle light />
            <button
              onClick={async () => { await api("/api/auth/logout", { method: "POST", body: {} }); router.push("/"); router.refresh(); }}
              className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-white/90 hover:bg-white/10"
              aria-label={L("Sign out", "Abmelden")}
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </header>
      <main className={`mx-auto px-4 py-6 ${wide ? "max-w-[1400px]" : "max-w-6xl"}`}>{children}</main>
    </div>
  );
}
