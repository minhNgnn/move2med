import { z } from "zod";

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "HH:MM");
const leg = z.object({
  befoerderungsart: z.enum(["Taxi", "KTW"]),
  ausstattung: z.enum(["keine", "Rollstuhl", "Tragestuhl", "liegend"]),
});

export const transportDataSchema = z.object({
  szenario: z.string().min(1),
  fahrtart: z.string().min(1),
  unfallbezug: z.enum(["kein Unfallbezug", "Arbeitsunfall", "Berufskrankheit", "Versorgungsleiden (BVG)"]),
  grund_der_befoerderung: z.object({ kategorie: z.string(), grund: z.string().min(1) }),
  behandlung: z.object({
    bezeichnung: z.string().min(1),
    von: z.string().min(8),
    haeufigkeit: z.string().nullable(),
    bis_voraussichtlich: z.string().nullable(),
    termin_uhrzeit: hhmm,
    abholzeit_geplant: hhmm,
    termin_datum: z.string().optional(),
    zieladresse: z.object({ einrichtung: z.string().min(1), strasse: z.string().min(1), plz: z.string().min(4), ort: z.string().min(1) }),
  }),
  hinfahrt: leg,
  rueckfahrt: leg,
  sonstiges: z.object({
    gemeinschaftsfahrt: z.boolean().optional(),
    gewicht_kg: z.number().int().min(20).max(500).optional(),
    wartezeit_min: z.number().int().min(0).max(600).optional(),
  }),
});
