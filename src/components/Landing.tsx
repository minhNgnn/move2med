"use client";
import { ArrowRight, Car, Stethoscope, Building2, Smartphone, HeartHandshake, QrCode, ShieldCheck, WifiOff } from "lucide-react";
import Link from "next/link";
import { useL } from "@/lib/lang";
import { LangToggle } from "./Shell";
import { Logo } from "./ui";

export function Landing({ demo }: { demo: boolean }) {
  const L = useL();
  const roles = [
    { href: "/dispatch", icon: Car, t: L("Transport company", "Transportunternehmen"), d: L("Redeem a ride key, see the Trip Card, match the right vehicle, bill with proof.", "Fahrtschlüssel einlösen, Trip Card sehen, passendes Fahrzeug wählen, mit Nachweis abrechnen."), main: true },
    { href: "/driver", icon: Smartphone, t: L("Driver app", "Fahrer-App"), d: L("Works offline. The patient taps their health card; the proof syncs later.", "Funktioniert offline. Patient hält die Gesundheitskarte an, der Nachweis wird später synchronisiert."), main: true },
    { href: "/status", icon: HeartHandshake, t: L("Patient or relative", "Patient oder Angehörige"), d: L("No account. Key + date of birth show where your ride is.", "Kein Konto. Schlüssel + Geburtsdatum zeigen, wo Ihre Fahrt ist."), main: true },
    { href: "/insurer", icon: Building2, t: L("Insurer", "Krankenkasse"), d: L("Approve trips, register companies, audit every access, verify proofs.", "Fahrten genehmigen, Unternehmen registrieren, jeden Zugriff prüfen, Nachweise verifizieren.") },
    { href: "/doctor", icon: Stethoscope, t: L("Doctor", "Arzt"), d: L("Issue the e-prescription with built-in checks instead of paper crosses.", "E-Verordnung mit eingebauten Prüfungen statt Kreuzen auf Papier.") },
  ];
  return (
    <div className="min-h-screen">
      <div className="bg-ink text-white">
        <div className="mx-auto max-w-6xl px-4 pb-16 pt-5">
          <div className="flex items-center justify-between">
            <Logo light size={32} />
            <LangToggle light />
          </div>
          <div className="mt-14 max-w-3xl">
            <p className="mb-4 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-sm text-cyan-mid">
              <QrCode className="h-4 w-4" /> {L("Healthcare Hackathon Bayern · Challenge #1", "Healthcare Hackathon Bayern · Challenge #1")}
            </p>
            <h1 className="text-4xl font-semibold leading-tight tracking-tight md:text-6xl">
              {L("The right vehicle, the first time.", "Das richtige Fahrzeug, beim ersten Mal.")}
            </h1>
            <p className="mt-5 text-lg text-white/80 md:text-xl">
              {L(
                "Transport companies are not on the Telematics Infrastructure. move2med gives them one thing: a ride key. The patient hands it over, the company sees only what it needs, and a health-card tap proves the ride happened, even offline.",
                "Transportunternehmen sind nicht an die Telematikinfrastruktur angebunden. move2med gibt ihnen eines: einen Fahrtschlüssel. Der Patient übergibt ihn, das Unternehmen sieht nur das Nötigste, und ein Tipp mit der Gesundheitskarte belegt die Fahrt, auch offline.",
              )}
            </p>
            <div className="mt-8 flex flex-wrap gap-6 text-sm text-white/80">
              <span className="inline-flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-cyan" /> {L("Data minimisation", "Datensparsamkeit")}</span>
              <span className="inline-flex items-center gap-2"><QrCode className="h-4 w-4 text-cyan" /> {L("Key + date of birth", "Schlüssel + Geburtsdatum")}</span>
              <span className="inline-flex items-center gap-2"><WifiOff className="h-4 w-4 text-cyan" /> {L("Offline-first driver app", "Offline-first Fahrer-App")}</span>
            </div>
          </div>
        </div>
      </div>
      <div className="mx-auto -mt-8 max-w-6xl px-4 pb-16">
        <div className="grid gap-4 md:grid-cols-3">
          {roles.map((r) => (
            <Link key={r.href} href={r.href} className={`group rounded-2xl border bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${r.main ? "border-cyan/50" : "border-line"}`}>
              <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-cyan-soft text-ink"><r.icon className="h-5 w-5" /></div>
              <h2 className="flex items-center justify-between text-lg font-semibold text-ink">{r.t}<ArrowRight className="h-4 w-4 opacity-0 transition group-hover:opacity-100" /></h2>
              <p className="mt-1 text-sm text-muted">{r.d}</p>
            </Link>
          ))}
          {demo && (
            <Link href="/demo" className="group rounded-2xl border border-dashed border-cyan bg-cyan-soft/60 p-5 transition hover:bg-cyan-soft">
              <h2 className="text-lg font-semibold text-ink">{L("Demo control", "Demo-Steuerung")}</h2>
              <p className="mt-1 text-sm text-muted">{L("Demo accounts, all ride keys and a reset button.", "Demo-Konten, alle Fahrtschlüssel und ein Reset-Knopf.")}</p>
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
