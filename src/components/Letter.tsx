"use client";
import { Printer } from "lucide-react";
import { useL } from "@/lib/lang";
import { LangToggle } from "./Shell";
import { Qr } from "./Qr";
import { Button, Logo } from "./ui";

type Props = {
  origin: string; code: string; pin: string; approval: string;
  patient: { name: string; birthdate: string; address: { strasse: string; plz: string; ort: string }; insurer: string };
  trip: { scenario: string; facility: { einrichtung: string; strasse: string; plz: string; ort: string }; pickup: string; frequency: string | null; hin: { befoerderungsart: string; ausstattung: string }; rueck: { befoerderungsart: string; ausstattung: string } };
};

/** The paper path: a letter for patients without a smartphone. Bilingual on purpose. */
export function Letter({ origin, code, pin, approval, patient, trip }: Props) {
  const L = useL();
  const veh = (v: { befoerderungsart: string; ausstattung: string }) => `${v.befoerderungsart}${v.ausstattung !== "keine" ? ` · ${v.ausstattung}` : ""}`;
  return (
    <div className="min-h-screen bg-paper py-6 print:bg-white print:py-0">
      <div className="no-print mx-auto mb-4 flex max-w-[800px] items-center justify-between px-4">
        <LangToggle />
        <Button onClick={() => window.print()}><Printer className="h-4 w-4" /> {L("Print", "Drucken")}</Button>
      </div>
      <article className="mx-auto max-w-[800px] bg-white p-10 shadow-sm print:shadow-none">
        <header className="flex items-start justify-between border-b border-line pb-5">
          <Logo size={34} />
          <p className="text-right text-xs text-muted">{patient.insurer}<br />{L("Transport approval", "Fahrt-Genehmigung")}</p>
        </header>
        <div className="mt-6 text-sm">
          <p className="font-medium">{patient.name}</p>
          <p>{patient.address.strasse}</p>
          <p>{patient.address.plz} {patient.address.ort}</p>
        </div>
        <h1 className="mt-8 text-2xl font-semibold text-ink">{L("Your ride key for patient transport", "Ihr Fahrtschlüssel für die Krankenbeförderung")}</h1>
        <p className="mt-2 text-sm text-muted">
          {approval === "pending"
            ? L("The insurer is still checking this trip. The key starts to work when it is approved; we will send you an SMS.", "Die Krankenkasse prüft diese Fahrt noch. Der Schlüssel funktioniert nach der Genehmigung, Sie erhalten eine SMS.")
            : L("Your trip is approved. Give this key to a transport company of your choice.", "Ihre Fahrt ist genehmigt. Geben Sie diesen Schlüssel an ein Transportunternehmen Ihrer Wahl.")}
        </p>
        <div className="mt-6 grid grid-cols-[220px_1fr] items-center gap-8 rounded-2xl border-2 border-ink p-6">
          <Qr value={`${origin}/status?k=${code}`} size={200} />
          <div>
            <p className="text-xs uppercase tracking-widest text-muted">{L("Ride key", "Fahrtschlüssel")}</p>
            <p className="font-mono text-4xl font-bold tracking-[0.2em] text-ink">{code}</p>
            <p className="mt-4 text-xs uppercase tracking-widest text-muted">{L("Your PIN (if the card does not work)", "Ihre PIN (falls die Karte nicht funktioniert)")}</p>
            <p className="font-mono text-2xl font-semibold tracking-[0.3em] text-ink">{pin}</p>
          </div>
        </div>
        <ol className="mt-6 space-y-2 text-[15px]">
          <li><b>1.</b> {L("Call a transport company, or show them this letter, and read out the key.", "Rufen Sie ein Transportunternehmen an oder zeigen Sie den Brief und lesen Sie den Schlüssel vor.")}</li>
          <li><b>2.</b> {L(`They will ask for your date of birth (${patient.birthdate}). Nobody can use the key without it.`, `Es wird nach Ihrem Geburtsdatum (${patient.birthdate}) gefragt. Ohne dieses kann niemand den Schlüssel nutzen.`)}</li>
          <li><b>3.</b> {L("On the day, hold your health card against the driver's phone. That is your signature. No writing needed.", "Am Tag der Fahrt halten Sie Ihre Gesundheitskarte an das Handy des Fahrers. Das ist Ihre Unterschrift. Kein Schreiben nötig.")}</li>
          <li><b>4.</b> {L(`Follow your ride at ${origin.replace(/^https?:\/\//, "")}/status with key and date of birth.`, `Ihre Fahrt sehen Sie unter ${origin.replace(/^https?:\/\//, "")}/status mit Schlüssel und Geburtsdatum.`)}</li>
        </ol>
        <section className="mt-6 rounded-xl bg-paper p-4 text-sm">
          <p className="font-semibold text-ink">{L("Your trip", "Ihre Fahrt")}</p>
          <p>{trip.scenario} · {trip.facility.einrichtung}, {trip.facility.strasse}, {trip.facility.plz} {trip.facility.ort}</p>
          <p>{L("Pickup", "Abholung")} {trip.pickup} · {trip.frequency ?? L("single trip", "Einzelfahrt")}</p>
          <p>{L("Outbound", "Hinfahrt")}: {veh(trip.hin)} · {L("Return", "Rückfahrt")}: {veh(trip.rueck)}</p>
        </section>
        <p className="mt-6 text-xs text-muted">{L("Never post the key publicly. You can revoke it at any time on the status page.", "Veröffentlichen Sie den Schlüssel nie. Sie können ihn jederzeit auf der Statusseite widerrufen.")}</p>
      </article>
    </div>
  );
}
