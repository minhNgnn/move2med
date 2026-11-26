# Mock data: data dictionary

**Files**
- `raw/update_vollständig_testdatensatz_20.json` is the file from the organisers, **unchanged**. It is **not valid JSON**: each record is missing a closing `}`.
- `clean/testdatensatz_20.json` is the repaired copy. **Use this one.** Regenerate it with `python3 scripts/repair_json.py`.

*"Vollständig synthetischer Hackathon-Testdatensatz"* = "Completely synthetic hackathon test dataset". 20 fake
patients (`Testperson 1…20`). Each record is **one Muster 4 (front + back) flattened into JSON**, with one scenario per patient.

## What was broken in the raw file

```jsonc
"behandlung": {
  ...
  "zieladresse": {
    "ort": "Hamburg"
},                 // ← closes zieladresse, but "behandlung" is never closed
"hinfahrt": {...}  // so hinfahrt, rueckfahrt, … would end up inside behandlung, and the file ends one brace short
```
The indentation shows the intent: `hinfahrt`, `rueckfahrt`, `sonstiges`, `bestaetigung_*` and `abrechnung_transporteur` are
**siblings of `behandlung` under `transportdaten`**. The repair inserts the missing `}` (20×, once per record). No values were changed.

## Shape

```
{ _disclaimer, testdaten: [ record × 20 ] }

record
├─ patient_id, display_name, birthdate, versichertennummer
├─ anschrift { strasse, plz, ort }
├─ krankenkasse { name, ikNummer }
├─ versichertenstatus
├─ zuzahlungsbefreiung { status, gueltig_bis }
└─ transportdaten
   ├─ szenario, fahrtart, unfallbezug
   ├─ grund_der_befoerderung { kategorie, grund }
   ├─ behandlung { bezeichnung, von, haeufigkeit, bis_voraussichtlich, termin_uhrzeit,
   │               abholzeit_geplant, termin_datum?, zieladresse { einrichtung, strasse, plz, ort } }
   ├─ hinfahrt   { befoerderungsart, ausstattung }
   ├─ rueckfahrt { befoerderungsart, ausstattung }
   ├─ sonstiges  { gemeinschaftsfahrt? | gewicht_kg? | wartezeit_min? }      // often {}
   ├─ bestaetigung_versicherter { datum, hinfahrt_bestaetigt, rueckfahrt_bestaetigt, unterschrieben,
   │                              vertretung_durch_dritte_person, hinfahrt{von,nach}, rueckfahrt{von,nach} }
   ├─ bestaetigung_transporteur { datum }
   └─ abrechnung_transporteur { ik_transporteur, belegnummer, rechnungsnummer, gesamt_brutto,
                                zuzahlung, positionsnummer, anzahl, km }
```

## Field by field

Form references: ❶–⓱ = front-side fields (see [form guide](../docs/translations/muster4_form_guide_EN.md)), **B1/B2/B3** = back-side blocks 1–3.

| JSON path | English | Form | Values in the data |
|---|---|---|---|
| `patient_id` | Record ID | (none) | 1–20 |
| `display_name` | Patient name | Header | "Testperson N" |
| `birthdate` | Date of birth | Header "geb. am" | ISO date |
| `versichertennummer` | Health insurance number | Header "Versicherten-Nr." | `X000000001`… (real format: 1 letter + 9 digits) |
| `anschrift.strasse/plz/ort` | Home address: street / postcode / city | Header | Hamburg, München, Köln, Berlin |
| `krankenkasse.name` | Health insurer | Header "Krankenkasse bzw. Kostenträger" | TK, Barmer, DAK, AOK ("… Test") |
| `krankenkasse.ikNummer` | Insurer's institution ID (IK) | Header "Kostenträgerkennung" | 9 digits |
| `versichertenstatus` | Insurance status | Header "Status" | always `Mitglied` (member) |
| `zuzahlungsbefreiung.status` | Exempt from co-payment? | ❶ and B2 | true / false |
| `zuzahlungsbefreiung.gueltig_bis` | Exemption valid until | (none) | `2027-12-31` or null |
| `transportdaten.szenario` | **Test-scenario label** (not a form field) | (none) | 20 unique, see table below |
| `fahrtart` | Trip type | ❸ | always `Hin- und Rückfahrt` (outbound and return) |
| `unfallbezug` | Accident relation | ❷ | `kein Unfallbezug` (none), `Arbeitsunfall` (work accident), `Berufskrankheit` (occupational disease), `Versorgungsleiden (BVG)` (state-compensated condition) |
| `grund_der_befoerderung.kategorie` | Approval category | Section 1 | `Genehmigungsfreie Fahrt` (no approval) / `Genehmigungspflichtige Fahrt` (needs insurer approval) |
| `grund_der_befoerderung.grund` | Reason (text) | ❹–❾ (a–f) | same as scenario label. **There is no explicit a–f code.** |
| `behandlung.bezeichnung` | Treatment name | (none) | same as scenario label |
| `behandlung.von` | Treatment from (date) | ❿ "vom/am" | always `2026-11-01` |
| `behandlung.haeufigkeit` | Frequency | ❿ "x pro Woche" | `3x pro Woche` (3× a week) or null |
| `behandlung.bis_voraussichtlich` | Expected until | ❿ | `2027-01-31` or null |
| `behandlung.termin_datum` | Appointment date | ❿ | only in records 4 and 12 |
| `behandlung.termin_uhrzeit` | Appointment time | not on the form | HH:MM |
| `behandlung.abholzeit_geplant` | **Planned pickup time** | not on the form (new, useful for route planning) | HH:MM |
| `behandlung.zieladresse.*` | Destination facility and address | ❿ "Behandlungsstätte" | clinic name, street, postcode, city |
| `hinfahrt.befoerderungsart` | Outbound vehicle type | ⓫ / ⓬ | `Taxi`, `KTW` |
| `hinfahrt.ausstattung` | Outbound equipment | ⓭ | `keine` (none), `Rollstuhl` (wheelchair), `Tragestuhl` (carry chair), `liegend` (lying down) |
| `rueckfahrt.*` | Same, for the return trip | ⓫–⓭ | |
| `sonstiges.gemeinschaftsfahrt` | Shared ride allowed | ⓱ | record 2 |
| `sonstiges.gewicht_kg` | Patient weight (bariatric) | ⓱ | record 18: 210 |
| `sonstiges.wartezeit_min` | Driver waiting time (min) | ⓱ | record 20: 60 |
| `bestaetigung_versicherter.datum` | Date of trip confirmation | B1 "Datum" | always `2026-11-15` |
| `…hinfahrt_bestaetigt / rueckfahrt_bestaetigt` | Outbound / return confirmed | B1 checkboxes | always true |
| `…unterschrieben` | Signed | B1 "Unterschrift" | always true |
| `…vertretung_durch_dritte_person` | **Signed by a third person (proxy)** | not on the form | true only in record 10 |
| `…hinfahrt.von/nach`, `…rueckfahrt.von/nach` | Route from / to | B1 "Fahrtstrecke" | `Wohnanschrift` (home) ↔ `Behandlungsort` (treatment site) |
| `bestaetigung_transporteur.datum` | Company confirmation date | B2 | always `2026-11-15` |
| `abrechnung_transporteur.ik_transporteur` | Company IK number | B3 | `4400000NN` |
| `…belegnummer` | Receipt number | B3 | `B000NN` |
| `…rechnungsnummer` | Invoice number | B3 | `R000NN` |
| `…gesamt_brutto` | Total gross (€) | B3 | 96–115 (synthetic, increments by 1) |
| `…zuzahlung` | Co-payment (€) | B3 | 10 or 0 |
| `…positionsnummer` | Billing position code | B3 | always `06010001` |
| `…anzahl` | Quantity | B3 | always 1 |
| `…km` | Kilometres | B3 | 13–32 |

## The 20 scenarios

| # | Scenario (DE) | English | Approval? | Outbound → return | Notes |
|---|---|---|---|---|---|
| 1 | Dialyse | Dialysis | needed | KTW wheelchair → KTW wheelchair | 3×/week until Jan 2027 (series) |
| 2 | Dialyse Gemeinschaftsfahrt | Dialysis, shared ride | needed | KTW wheelchair → KTW wheelchair | `gemeinschaftsfahrt: true` |
| 3 | Chemotherapie | Chemotherapy | needed | Taxi → Taxi | |
| 4 | Strahlentherapie | Radiotherapy | needed | KTW wheelchair → KTW wheelchair | exempt; has `termin_datum` |
| 5 | Krankenhausaufnahme | Hospital admission | free | Taxi → Taxi | |
| 6 | Krankenhausentlassung | Hospital discharge | free | Taxi → Taxi | |
| 7 | Vorstationär | Pre-inpatient treatment | free | Taxi → Taxi | |
| 8 | Nachstationär | Post-inpatient treatment | free | Taxi → Taxi | exempt |
| 9 | Hospiz | Hospice | free | Taxi → Taxi | |
| 10 | Hospiz Vertreter | Hospice, proxy signs | free | Taxi → Taxi | **`vertretung_durch_dritte_person: true`** |
| 11 | Mobilitätseinschränkung Taxi | Mobility impairment, taxi | needed | Taxi → Taxi | |
| 12 | Mobilitätseinschränkung KTW | Mobility impairment, KTW | needed | KTW wheelchair → KTW wheelchair | exempt; has `termin_datum` |
| 13 | Arbeitsunfallfolge | Consequence of a work accident | needed | KTW wheelchair → KTW wheelchair | `Arbeitsunfall` |
| 14 | Berufskrankheit | Occupational disease | needed | KTW wheelchair → KTW wheelchair | `Berufskrankheit` |
| 15 | BVG-Leiden | War-victims-law condition | needed | KTW wheelchair → KTW wheelchair | `Versorgungsleiden (BVG)` |
| 16 | Tragestuhltransport | **Carry-chair transport** (the slide 1 story) | needed | KTW carry chair → KTW carry chair | exempt |
| 17 | Liegendtransport | Lying-down transport | needed | KTW lying → KTW lying | |
| 18 | Schwergewichttransport | Bariatric (heavy patient) transport | needed | KTW lying → KTW lying | `gewicht_kg: 210` |
| 19 | Unterschiedliche Hin/Rückfahrt | Different outbound and return | needed | **KTW wheelchair → Taxi** | |
| 20 | Wartezeit Serienbehandlung | Waiting time, series treatment | needed | Taxi → Taxi | 3×/week; `wartezeit_min: 60`; exempt |

## Rule conflicts and gaps in the mock data (good material for validation logic and the pitch)

These are places where the data contradicts the Muster 4 rules, or lacks something a real e-prescription needs. They are
**exactly the kind of errors the paper process misses until billing**, so a demo that catches them is on-message.

1. **Co-payment charged on accident or BVG cases (records 13, 14, 15).** Rule ❶: work accident, occupational disease and
   Versorgungsleiden are *zuzahlungsfrei*. The data has `zuzahlung: 10` and `zuzahlungsbefreiung.status: false`.
   Work accident and occupational disease are also billed to the **accident insurance carrier** (e.g. a
   Berufsgenossenschaft), not the health insurer, yet `krankenkasse` is a normal health insurer.
2. **No KTW justification.** 11 records use a KTW, but no field holds the mandatory reason (⓬ "because medical attention
   or equipment is needed due to …"). The Impulspapier makes this a **mandatory field** in the e-prescription.
3. **No a–f reason code.** The approval category is a free string. A real schema needs the checkbox (a–f, plus the
   "vergleichbarer Ausnahmefall" variant) so approval rules can be computed.
4. **Mobility impairment, taxi (record 11), is marked "approval needed".** Under ❺ b), a taxi for patients with marker
   aG/Bl/H or care level 3 (with permanent mobility impairment) to 5 is **approval-free**. It's approval-needed only under
   ❽ e) (comparable impairment and ≥ 6 months of treatment). The data has **no disability-marker, care-level or
   treatment-duration field**, so you can't decide which applies.
5. **Different vehicles outbound and return (record 19)** is one prescription in the data. AOK guidance says **each trip
   must be prescribed separately** in that case.
6. **Series trips have only one confirmation.** Dialysis 3×/week from Nov to Jan means about 39 round trips, but each record
   has one `bestaetigung_versicherter` (one date) and `anzahl: 1`. The paper back side has 10 rows. A digital design needs
   **a list of trip confirmations**.
7. **Route direction is always home → treatment → home**, even for discharge (record 6, which should start at the
   hospital) and hospice admission (record 9, usually one-way). Every record also has `fahrtart: Hin- und Rückfahrt`.
8. **Schema inconsistency:** `termin_datum` exists only in records 4 and 12. `sonstiges` keys vary. `haeufigkeit` or
   `bis_voraussichtlich` are null for single trips.
9. **No prescriber data** (doctor number, site number, prescription date, signature) and **no approval decision** (approved
   or rejected, by whom, when) are present, even though both are central to the target process.
10. **Synthetic billing values:** `positionsnummer` is identical for taxi and KTW, and `gesamt_brutto`/`km` increase by 1
    per record. Fine for a demo, but don't infer pricing logic from them.
