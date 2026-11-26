export type Equip = "keine" | "Rollstuhl" | "Tragestuhl" | "liegend";
export type VType = "Taxi" | "KTW";
export type LegSpec = { befoerderungsart: VType; ausstattung: Equip };
export type Unfall = "kein Unfallbezug" | "Arbeitsunfall" | "Berufskrankheit" | "Versorgungsleiden (BVG)";
export type Role = "doctor" | "insurer" | "dispatcher" | "driver";

/** Mirrors `transportdaten` of the organisers' mock JSON (the stand-in for the digital Muster 4). */
export type TransportData = {
  szenario: string;
  fahrtart: string;
  unfallbezug: Unfall;
  grund_der_befoerderung: { kategorie: string; grund: string };
  behandlung: {
    bezeichnung: string;
    von: string;
    haeufigkeit: string | null;
    bis_voraussichtlich: string | null;
    termin_uhrzeit: string;
    abholzeit_geplant: string;
    termin_datum?: string;
    zieladresse: { einrichtung: string; strasse: string; plz: string; ort: string };
  };
  hinfahrt: LegSpec;
  rueckfahrt: LegSpec;
  sonstiges: { gemeinschaftsfahrt?: boolean; gewicht_kg?: number; wartezeit_min?: number };
};

export type Flag = {
  code: string;
  severity: "error" | "warn" | "info";
  leg?: "hin" | "rueck";
  params?: Record<string, string | number>;
};

export type Session = { uid: string; role: Role; companyId: string | null; name: string };
