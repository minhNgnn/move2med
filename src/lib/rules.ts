import type { Flag, TransportData } from "./types";

/** Muster 4, section 1: reason for transport. */
export const REASONS = {
  a: { approval: false, en: "a) Inpatient / pre- or post-inpatient treatment", de: "a) Voll-/teilstationär, vor-/nachstationär" },
  b: { approval: false, en: "b) Outpatient, marker aG/Bl/H or care level 3-5 (taxi / rental car only)", de: "b) Ambulant, Merkzeichen aG/Bl/H oder Pflegegrad 3-5 (nur Taxi/Mietwagen)" },
  c: { approval: false, en: "c) Other reason, e.g. hospice", de: "c) Anderer Grund, z.B. Hospiz" },
  d: { approval: true, en: "d) High-frequency treatment (dialysis, chemo, radiotherapy)", de: "d) Hochfrequente Behandlung (Dialyse, Chemo, Strahlen)" },
  e: { approval: true, en: "e) Permanent mobility impairment, treatment 6+ months", de: "e) Dauerhafte Mobilitätsbeeinträchtigung, ≥ 6 Monate" },
  f: { approval: true, en: "f) Other reason for a KTW (positioning, carrying, lifting)", de: "f) Anderer Grund für KTW (Lagern, Tragen, Heben)" },
} as const;
export type ReasonCode = keyof typeof REASONS;

export const HEAVY_KG = 150;

/** Suggest the Muster 4 reason from the scenario text (the doctor can always change it). */
export function guessReason(d: TransportData): ReasonCode {
  const n = `${d.behandlung.bezeichnung} ${d.szenario}`.toLowerCase();
  if (/dialyse|chemo|strahlen/.test(n)) return "d";
  if (/stationär|aufnahme|entlassung/.test(n)) return "a";
  if (/hospiz/.test(n)) return "c";
  if (/mobilität/.test(n)) return "e";
  return d.hinfahrt.befoerderungsart === "KTW" || d.rueckfahrt.befoerderungsart === "KTW" ? "f" : "b";
}

export function hasKtw(d: Pick<TransportData, "hinfahrt" | "rueckfahrt">) {
  return d.hinfahrt.befoerderungsart === "KTW" || d.rueckfahrt.befoerderungsart === "KTW";
}

/** Does this trip need the insurer's approval before it can be driven? */
export function approvalFor(reason: ReasonCode, d: Pick<TransportData, "hinfahrt" | "rueckfahrt">) {
  if (reason === "b" && hasKtw(d)) return { required: true, forced: true };
  return { required: REASONS[reason].approval, forced: false };
}

/** Statutory co-payment: 10% of the cost, at least 5 and at most 10 euro. Free in accident / BVG cases or with an exemption. */
export function expectedCopay(opts: { brutto: number; exempt: boolean; unfall: string }) {
  if (opts.unfall !== "kein Unfallbezug") return { amount: 0, why: "accident" as const };
  if (opts.exempt) return { amount: 0, why: "exempt" as const };
  return { amount: Math.min(10, Math.max(5, Math.round(opts.brutto * 0.1))), why: "statutory" as const };
}

export type CheckInput = {
  reasonCode: ReasonCode;
  data: TransportData;
  justification: string | null;
  exemption: { status: boolean };
  billed?: { zuzahlung: number; gesamt_brutto: number } | null;
  approval?: { required: boolean; status: "pending" | "approved" | "rejected" | "none" };
};

/** The rules engine. It only ever *flags*; it never silently fixes data. */
export function checkPrescription(i: CheckInput): Flag[] {
  const f: Flag[] = [];
  const d = i.data;

  if (hasKtw(d) && !(i.justification && i.justification.trim().length >= 5)) {
    f.push({ code: "ktw_no_justification", severity: "error" });
  }
  if (i.reasonCode === "b" && hasKtw(d)) {
    f.push({ code: "b_with_ktw", severity: "warn" });
  }
  if (d.hinfahrt.befoerderungsart !== d.rueckfahrt.befoerderungsart || d.hinfahrt.ausstattung !== d.rueckfahrt.ausstattung) {
    f.push({ code: "diff_vehicle_legs", severity: "warn" });
  }
  if (d.unfallbezug === "Arbeitsunfall" || d.unfallbezug === "Berufskrankheit") {
    f.push({ code: "payer_accident", severity: "info", params: { kind: d.unfallbezug } });
  }
  const kg = d.sonstiges.gewicht_kg;
  if (kg && kg >= HEAVY_KG) {
    f.push({ code: "heavy_patient", severity: "info", params: { kg } });
  }
  if (d.sonstiges.wartezeit_min) {
    f.push({ code: "waiting_time", severity: "info", params: { min: d.sonstiges.wartezeit_min } });
  }
  if (d.sonstiges.gemeinschaftsfahrt) {
    f.push({ code: "shared_ride", severity: "info" });
  }
  if (i.billed) {
    const exp = expectedCopay({ brutto: i.billed.gesamt_brutto, exempt: i.exemption.status, unfall: d.unfallbezug });
    if (exp.amount !== i.billed.zuzahlung) {
      f.push({
        code: "copay_mismatch",
        severity: "error",
        params: { billed: i.billed.zuzahlung, expected: exp.amount, why: exp.why },
      });
    }
  }
  if (i.approval?.required) {
    if (i.approval.status === "pending") f.push({ code: "approval_pending", severity: "error" });
    if (i.approval.status === "rejected") f.push({ code: "approval_rejected", severity: "error" });
  }
  return f;
}

/** Human-readable text for a flag. `L(en, de)` picks the UI language. */
export function flagText(fl: Flag, L: (en: string, de: string) => string): string {
  const p = fl.params ?? {};
  switch (fl.code) {
    case "ktw_no_justification":
      return L("KTW chosen but no medical justification given (mandatory).", "KTW gewählt, aber keine medizinische Begründung angegeben (Pflichtfeld).");
    case "b_with_ktw":
      return L("Reason (b) covers taxi / rental car only. A KTW must be prescribed under (f) and needs approval.", "Grund (b) gilt nur für Taxi/Mietwagen. Ein KTW muss unter (f) verordnet werden und ist genehmigungspflichtig.");
    case "diff_vehicle_legs":
      return L("Outbound and return use different vehicles. Guidance: prescribe each trip separately.", "Hin- und Rückfahrt mit unterschiedlichen Fahrzeugen. Empfehlung: jede Fahrt separat verordnen.");
    case "payer_accident":
      return L(`${p.kind}: cost belongs to the accident insurer, not the health insurer.`, `${p.kind}: Kostenträger ist die Unfallversicherung, nicht die Krankenkasse.`);
    case "heavy_patient":
      return L(`Patient weight ${p.kg} kg: needs a heavy-duty vehicle.`, `Patientengewicht ${p.kg} kg: Schwerlastfahrzeug erforderlich.`);
    case "waiting_time":
      return L(`Driver waits ${p.min} min between outbound and return.`, `Fahrer wartet ${p.min} Min. zwischen Hin- und Rückfahrt.`);
    case "shared_ride":
      return L("Shared ride allowed.", "Gemeinschaftsfahrt möglich.");
    case "copay_mismatch": {
      const why =
        p.why === "accident"
          ? L("accident / occupational cases are co-payment free", "Unfall-/Berufskrankheitsfälle sind zuzahlungsfrei")
          : p.why === "exempt"
            ? L("patient has a valid exemption", "Patient hat eine gültige Befreiung")
            : L("statutory 10% (5-10 €)", "gesetzlich 10 % (5-10 €)");
      return L(`Co-payment billed ${p.billed} € but expected ${p.expected} €: ${why}.`, `Zuzahlung ${p.billed} € berechnet, erwartet ${p.expected} €: ${why}.`);
    }
    case "approval_pending":
      return L("Waiting for the insurer's approval.", "Genehmigung der Krankenkasse steht aus.");
    case "approval_rejected":
      return L("The insurer rejected this trip.", "Die Krankenkasse hat die Fahrt abgelehnt.");
    case "fleet_mismatch": {
      const miss = String(p.missing ?? "");
      return L(`Vehicle does not fit: missing ${miss}.`, `Fahrzeug passt nicht: es fehlt ${miss}.`);
    }
    case "series_unconfirmed":
      return L(`Series date ${p.date ?? ""} has no confirmation from the patient yet.`, `Serientermin ${p.date ?? ""} hat noch keine Bestätigung des Patienten.`);
    case "no_proof":
      return L("A completed ride has no verified proof.", "Eine abgeschlossene Fahrt hat keinen verifizierten Nachweis.");
    case "unverified_proof":
      return L("Proof is captured but not yet verified.", "Nachweis erfasst, aber noch nicht verifiziert.");
    default:
      return fl.code;
  }
}
