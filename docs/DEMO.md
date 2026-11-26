# Demo runbook (5 minutes, record #16)

Setup: `/demo` → **Reset demo data**. Open four windows: doctor, insurer, dispatcher (Spree), phone (driver). A second
dispatcher window (Berlin Taxi Zentrale) is the "wrong vehicle" moment.

1. **The problem (slide 1).** Record #16 is a patient who needs a carry chair. Paper: the taxi shows up with the wrong vehicle.
2. **Doctor** (`/doctor` → 16). The form is pre-filled, the system works out that approval is needed, and signing is
   blocked until the KTW justification is written. Sign → ride key + QR → **Print letter** (the paper path for elderly patients).
3. **Insurer** (`/insurer`). Approve. The patient gets an SMS (status page).
4. **Wrong company.** Berlin Taxi Zentrale redeems key + date of birth. Preview only (no name, no street), and
   *"No vehicle of yours fits this trip."* Decline.
5. **Right company.** Spree redeems → fleet check shows KTW 1 / KTW 2 fit, Taxi 1 does not → **Accept** (the key now
   binds to Spree; the taxi company is locked out) → assign KTW 1 + Alex Weber.
6. **Driver phone** (`/driver`, installed to the home screen). Pickup. Switch to **airplane mode** (or the menu's
   "Simulate offline"). **Patient confirms** → hold the card (or demo button) → saved, signed, "unverified until sync".
   Drop-off. Turn the connection back on: the badge syncs and the proof turns **verified**.
7. **Billing** (dispatcher → Billing) → submit → **insurer → Billing inbox → Verify proofs**: three green layers.
8. **Audit log** shows every key redemption, including the failed ones.
9. **Patient status page** (`/status`, key + date of birth): large print timeline and the SMS inbox. Revoke / choose another company.

Side cases (each seeded):
- **#13 Arbeitsunfall**: billing is blocked, co-payment 10 € billed but accident cases are free. Fix is an explicit, audited action.
- **#10 Hospiz Vertreter**: proof waits ("awaiting"); the relative confirms on the status page → verified.
- **#18 210 kg**: only the heavy-duty KTW fits.
- **#1 / #4 / #12** are left pending for the insurer's approval screen.

Phone testing on a real iPhone needs HTTPS (secure storage, GPS and signing keys): `cloudflared tunnel --url http://localhost:3100`
against a **production** server, then *Share → Add to Home Screen*.
