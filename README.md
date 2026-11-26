# move2med

**Healthcare Hackathon Bayern · Challenge #1 (gematik): Digital Patient Transport, from paper form to digital workflow.**

Transport companies (taxis, patient-transport ambulances) are not on Germany's Telematics Infrastructure, so they cannot
read the coming e-prescription for patient transport. move2med gives them one thing: a **ride key**.

- The **patient** hands the key (QR / short code, printed on a letter) to a company of their choice. No account.
- The **company** redeems key + date of birth, sees a minimal **Trip Card**, checks the **fleet match**, accepts, assigns.
- The **driver app** works **offline**. The patient taps their health card (simulated; real tap detection on Android Chrome),
  the phone signs the event, and the proof is verified when the connection returns.
- The **insurer** approves trips, registers companies, sees an **audit log** of every key redemption, and **verifies every
  layer of every proof** before paying.

Background, translations of the source documents and the full plan: [docs/](docs/) (start with
[docs/challenge/CHALLENGE_EXPLAINED.md](docs/challenge/CHALLENGE_EXPLAINED.md), [docs/PLAN.md](docs/PLAN.md)).
Demo runbook: [docs/DEMO.md](docs/DEMO.md).

## Run it

```bash
pnpm install
docker run -d --name move2med-pg -e POSTGRES_PASSWORD=move2med -e POSTGRES_DB=move2med -p 5433:5432 postgres:16-alpine
cp .env.example .env.local        # set DATABASE_URL=postgres://postgres:move2med@localhost:5433/move2med
pnpm db:push && pnpm seed
pnpm dev                          # http://localhost:3100
```

All demo accounts use the password `demo`. `/demo` lists every ride key and has a **reset** button. On a public deployment set
`DEMO_ADMIN_PIN`: `/demo` (reset, full key list) then asks for it; locally, without the variable, it is open.

| Role | Page | Account |
|---|---|---|
| Doctor | `/doctor` | doctor@demo.med |
| Insurer | `/insurer` | insurer@demo.med |
| Transport company | `/dispatch` | dispatch.spree@demo.med (Berlin, KTW fleet), dispatch.berlintaxi@demo.med (taxis only) |
| Driver (phone) | `/driver` | driver.spree@demo.med |
| Patient / relative | `/status` | ride key + date of birth |

Language: English by default, one click to German (top right).

## Tests

```bash
node scripts/smoke.mjs            # hero flow: issue → approve → redeem → accept → assign → sign → bill → verify
node scripts/smoke-cases.mjs      # #13 co-payment, #10 proxy, #18 heavy-duty, key revoke/reassign, suspend
node scripts/e2e-driver.mjs       # real Chromium: offline ride, reload offline, encrypted storage, sync, remote wipe
```
The first two need a running server; the last needs a **production** server (`pnpm build && pnpm start -p 3100`) and
`pnpm add -D playwright && pnpm exec playwright install chromium`.

## How it is built

- **Next.js 16** (App Router) + TypeScript + Tailwind v4, **Postgres + Drizzle**. One repo, one deployment.
- **Mock Fachdienst**: the organisers' 20 JSON records ([data/clean/](data/clean/), repaired copy of the raw file) are the
  prescriptions. Everything outside our scope (doctor's software, TI, PoPP service) is a mock behind the same shape.
- **Ride key**: derived from an HMAC, stored only as a keyed hash; redeemed with the patient's date of birth; binds to the
  first company that accepts; revocable; reassigning issues a new key. Rate-limited, every redemption audited.
- **Data minimisation**: before accepting, a company sees a preview without name, phone or street. The doctor's medical
  justification never leaves the insurer; companies only learn that it exists.
- **Rules engine** (`src/lib/rules.ts`): flags, never silently fixes. KTW without justification, co-payment errors
  (incl. accident / BVG), approval pending, different vehicles outbound/return, fleet mismatch, unverified proof.
- **Three-layer proof** per ride: (1) mock PoPP token for the patient, (2) ECDSA P-256 signature from the driver's device
  (private key non-extractable), (3) gateway countersignature. The insurer re-verifies all three.
- **Onboarding**: an insurer registers a company (IK + first dispatcher); the dispatcher adds vehicles (type, equipment) and drivers.
- **Offline driver app**: PWA + service worker, ride data AES-GCM encrypted in IndexedDB, append-only signed event log
  with device-generated IDs (idempotent), server-anchored trusted time checked against GPS, evidence never discarded
  (anything odd goes to an insurer review queue), remote revoke wipes the phone.

## Honest limitations

- The health-card tap is **detected, not read** (Android Chrome: Web NFC `readingerror`; elsewhere a demo button). Reading
  the card needs gematik's native PoPP client. The patient proof is a signed **mock** PoPP token.
- Phone clock tampering is detected within a session (monotonic clock) but only flagged after an app restart.
- Rate limiting is in-memory per server instance. Background Sync works on Android Chrome only; iOS syncs on reopen,
  reconnect and a 20 s timer.
- No real SMS (an in-app inbox simulates it), no real billing transfer (a downloadable JSON stands in for § 302 / TP5).
- `docs/source/` (gematik's copyrighted Impulspapier etc.) is not committed; see the links in the docs.
