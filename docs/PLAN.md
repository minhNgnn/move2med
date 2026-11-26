# move2med: build plan

**Product:** an open access interface on gematik's e-prescription workflow server (TIFlow), plus a reference app.
gematik would run the gateway. Insurers supply the list of registered transport companies, approve trips and receive
bills. Our dispatcher portal and driver app show what the market could build on top.

**Main users:** transport companies (dispatcher + driver) and patients / relatives. Doctor and insurer screens are minimal.

**Story:** one patient journey on record #16 (carry-chair patient), answering all three challenge questions.
Side cases: #18 bariatric, #10 proxy confirms, #13 co-payment wrongly charged, #1/#20 series treatment.

## Screens

| Screen | Behaviour |
|---|---|
| Doctor (minimal) | Pre-filled from patient record, dropdowns, approval need computed, KTW needs justification, different outbound/return vehicles, series fields. Submit creates prescription, ride key, printable letter (QR + short code). |
| Insurer / operator | Approve or reject trips, register transport companies, audit log of key redemptions, billing inbox with proof verification, review queue. |
| Dispatcher | Redeem key + date of birth, Trip Card (minimal data), fleet match, accept/decline, series calendar, assign driver, billing export of verified rides. |
| Driver (PWA, offline) | Encrypted 48h ride cache, pickup/drop-off, waiting time, card tap, GPS, signed proof, event queue with sync, sync badge, remote wipe. |
| Patient / relative | Key + date of birth, no account. Large-print timeline, simulated SMS inbox, revoke or reassign key. |

## Core rules

- **Ride key:** one per prescription, binds to the first accepting company, revocable/reassignable, needs code + date of birth.
- **Proof of ride:** mock PoPP token (patient) + driver device signature (ECDSA P-256) + gateway countersignature.
- **Offline:** tap captured as "unverified", verified on sync. Time anchored to server time and checked against GPS.
  Append-only event log with client IDs. Evidence is never discarded (needs-review queue). Billing accepts verified proofs only.
- **Rules engine:** flags, never silently fixes: fleet match, co-payment (incl. accident/BVG), approval status,
  KTW justification, different outbound/return vehicles, series ride without confirmation.
- **Live updates:** polling every 2-3 s. "Reset demo" reloads the 20 records.
- **Languages:** English default, German switch.

## Stack

Next.js (App Router) + TypeScript + Tailwind, Postgres + Drizzle, next-intl, Serwist (service worker), Dexie (IndexedDB),
WebCrypto. Local dev, HTTPS tunnel for phone tests, then Vercel + Neon.

## Build order

1. Foundation: data, logins, rules engine
2. Online flow: doctor, key, dispatcher, driver tap, proof, billing, insurer verify, audit
3. Offline layer
4. Patient status page + SMS inbox
5. Language switch, polish, demo cases

## Out of scope

Voice assistant (decided later), real SMS, real TI/PoPP connection or card reading, prescription editing (cancel and reissue instead).

## Repo notes

`docs/source/`, `docs/images/challenge_slides/` and the Impulspapier diagram are not committed (copyright / photos of people).
The mock JSON data may be public (approved by the organisers).

## Status (end of build day)

Built, deployed (Vercel + Neon) and tested: every screen and rule above, plus the series calendar with per-date cancellation,
stale-evidence handling (phone warning after 4 h, server review after 24 h), the insurer's "informed" list for approval-free trips,
a FHIR-Task-aligned status, company registration, fleet and driver management, live QR scanning, a bilingual PDF letter and bilingual SMS.

Deliberately not built: several companies sharing a series (slide only), a real FHIR / TIFlow model, the voice assistant (parked).
Unverified without a real device: Android NFC tap detection and Background Sync, live camera on a phone, printing.

Tests: `scripts/smoke.mjs`, `scripts/smoke-cases.mjs` (API), `scripts/e2e-driver.mjs`, `scripts/e2e-driver-claims.mjs` (real Chromium).
