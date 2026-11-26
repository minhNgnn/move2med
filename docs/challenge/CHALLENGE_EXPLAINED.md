# The challenge, explained in plain English

> **One sentence:** In Germany, doctors will soon prescribe patient transport digitally, but taxi and
> ambulance-transport companies can't get into the secure health network where that prescription
> lives. Build the bridge: let them **read the trip details** before they send a car, and let the
> patient **confirm the ride happened** so the company can get paid.

---

## 1. Who's involved

| German | English | Role in the story |
|---|---|---|
| **Patient:in / Versicherte:r** | Patient / insured person | Often elderly, in a wheelchair, on dialysis. May not have a smartphone. Is supposed to choose the transport company. |
| **Angehörige / Pflegekraft** | Relative / carer | Often acts *for* the patient: books the ride, signs. The mock data has a flag for this (`vertretung_durch_dritte_person`). |
| **Behandler:in / Arzt / Krankenhaus** | Doctor / hospital | Decides the trip is medically necessary and fills out the prescription (**Muster 4**). |
| **Krankenkasse (KK)** | Statutory health insurer (TK, AOK, Barmer, DAK…) | Pays. For some trip types it must **approve before** the ride (*genehmigungspflichtig*). |
| **Transportunternehmen / Fahrdienst** | Transport company: taxi, rental car (*Mietwagen*), patient transport ambulance (**KTW**) | Drives the patient and bills the insurer. **No TI access**, and that's the core problem. |
| **Abrechnungsdienstleister** | Billing service provider | Often does the billing for the transport company. |
| **gematik** | Germany's national agency for health digitalisation | Builds and runs the **TI** (the secure health network), the e-prescription (eRezept), the ePA, etc. This is the challenge provider. |

## 2. How it works today (paper)

The whole process runs on **one double-sided paper form: "Muster 4 – Verordnung einer Krankenbeförderung"**
(*Form 4 – Prescription for patient transport*). See [`docs/images/muster4_official_front.png`](../images/muster4_official_front.png)
and [`muster4_official_back.png`](../images/muster4_official_back.png).

```
 Doctor fills FRONT ──► Patient carries paper ──► (if approval needed) mails it to insurer ──► waits
                                                                                               │
 Insurer pays ◄── Company bills (re-types data) ◄── Patient SIGNS BACK per trip ◄── Company drives ◄── Patient phones a company
```

- **Front side** (filled by the doctor): patient and insurer data; co-payment yes/no; accident or work-injury flags;
  **reason for the trip** (checkboxes a–f, which decide whether approval is needed); date or frequency and destination;
  **vehicle type** (Taxi / KTW / RTW / NAW) and **equipment** (wheelchair / carry chair / lying down); free-text justification.
- **Back side** (filled by the patient and the transport company): one row per trip with date, from → to, outbound or return, and the **patient's
  signature**. Below that, the company's stamp, whether a co-payment exemption card was shown, and **billing data**
  (company IK number, receipt number, invoice number, gross amount, co-payment, position number, count, km).

**The mock JSON file is this form, flattened into fields, once per patient.** See [`data/DATA_DICTIONARY.md`](../../data/DATA_DICTIONARY.md).

## 3. What goes wrong (why gematik cares)

Figures from the gematik working-group paper ([translation](../translations/impulspapier_EN.md)):

- **40 million** taxi or rental-car patient trips and **5.6 million** KTW trips per year in Germany (2023).
- Doctors' practices spent **4.1 million working hours** on this form in 2020.
- About **10% of paper prescriptions contain errors**, and fixing each one costs about **30 minutes** of extra work.
- Typical errors: wrong addresses, unclear co-payment exemption status, **wrong checkboxes**. They are usually discovered
  **only when the transport company bills**, which starts long correction loops.
- A lost form means the doctor has to issue a new one.

And the human version ([slide 1](challenge_slides_transcript.md#slide-1--the-problem-wrong-vehicle)): a taxi turns
up for a patient who needed a **carry chair** (*Tragestuhl*). The result is an empty trip, delayed treatment, extra cost and frustration.
The company **couldn't see the requirements in advance**.

## 4. The future process gematik's working group designed

The diagram is at [`docs/images/impulspapier_soll_prozess.png`](../images/impulspapier_soll_prozess.png) (*"Soll-Prozess"* = target process).

1. **Prescription.** The doctor issues an **eVerordnung** (e-prescription) in their practice software, using dropdowns and
   plausibility checks. Choosing a KTW makes a medical justification **mandatory**. The prescription goes to a central
   server called the **Fachdienst** (a "specialist service", like the server behind the eRezept).
2. **Approval.**
   - **2a, no approval needed** (e.g. hospital admission): the patient gets the e-prescription right away (e.g. as a QR code in an app).
   - **2b, approval needed** (e.g. dialysis, KTW): the insurer is notified, checks it, and sends its decision back to the Fachdienst
     (ideally in real time). The patient receives the decision by letter or digitally.
   - In both cases the patient gets a **"key" (*Schlüssel*)**, such as an order number or a **QR code**.
     **The patient decides which transport company gets access.**
3. **Request.** The patient passes the key to the chosen company. The company retrieves the trip details from the Fachdienst
   and can see them **before accepting the job**.
4. **Trip(s).** The company drives. The patient **confirms each trip digitally**. The patient pays the legal co-payment
   (*Zuzahlung*, usually €5–10) unless they are exempt.
5. **Billing.** The company sends the confirmation to the insurer through the existing electronic billing channel (**DTA**,
   Datenträgeraustausch). The confirmation proves the ride happened.

Applying across all steps: standard interfaces, and digital queries and corrections.

## 5. The gap is your hackathon

Steps 3 and 4 have **no technical solution yet**. The working group only listed options. The slides turn this into three questions:

### Q1. How can transport companies access the prescription data without being connected to the TI?

The **TI (Telematikinfrastruktur)** is a closed network. Getting onto it requires an institution smart card (SMC-B), a
connector or TI gateway, and certified software. Doctors, pharmacies and hospitals have these. **A taxi company does not**,
and the paper says not to force it on them.

Options named in the paper:
- **WANDA** (*Weitere Anwendungen für den Datenaustausch*, a gematik framework for non-core apps that use the TI)
- **Platform solutions**, or **insurer web portals**. Companies log in through a browser using an "Authenticator".
- Access **by key**: a prescription ID code, certain insured-person data, or a **QR or DataMatrix code**
- For series or permanent approvals (e.g. dialysis 3× a week), **several companies** should be able to access the data, so that capacity is used well.

> 💡 The eRezept (e-prescription for medicine) already does this. The patient's QR or DataMatrix code contains a
> **task ID + access code** (`Task/{id}/$accept?ac={accessCode}`), and whoever holds it can retrieve the prescription
> from the Fachdienst. The pharmacy, however, is on the TI. Your job is the **same "holder of the key" idea, for someone
> outside the TI**: for example a gateway or portal run by the insurer or the Fachdienst operator, which checks the key and
> returns only the data the company needs.

### Q2. How can the transport company digitally confirm the transport took place?

This replaces the **back side** of Muster 4, where the patient signs once per trip. The paper suggests an
**"eLeistungsbestätigung"** (electronic service confirmation) or the existing **TP5 procedure**, an electronic billing
channel to insurers under §302 SGB V. The proof must be strong enough that the insurer **trusts it for payment**.
Think about:
- Proof that the patient was **really present** (not just a click by the driver)
- Time and place (pickup and drop-off), km, outbound or return
- Each trip in a series, as separate entries
- How it feeds into billing (the `abrechnung_transporteur` fields)

> 💡 gematik is introducing **PoPP (Proof of Patient Presence)** in TI 2.0. The patient's **health card (eGK) is tapped by
> NFC** on a smartphone or card reader, and a signed token comes back proving that the patient was present. It's designed
> for doctors and pharmacies, but it's conceptually the closest thing to a "digital signature by tapping a card". Worth
> mentioning as a "future-proof" path. Check the current rules on who may use it.

### Q3. How can an elderly person "sign" for confirmation?

The patient may be 85, have poor eyesight, tremors or dementia, have **no smartphone**, or be lying on a stretcher.
A finger signature on the driver's tablet works poorly and proves little. Ideas to compare:
- **Tap the health card** (eGK) that every insured person already carries, on the driver's phone (NFC)
- A **PIN or code** on a printed letter or card from the insurer
- **Carer or relative confirms** remotely (the data has `vertretung_durch_dritte_person`). The paper explicitly asks the
  ministry to regulate proxy rules.
- **Destination confirms**: the dialysis centre or hospital reception confirms arrival
- **Fallback to paper** must remain. Nobody can be excluded.

## 6. What "good" looks like (judging hints from the slides)

The solution should enable **early route planning**, **correct vehicle and equipment selection** and **seamless
integration into existing workflows**, so that **empty trips go down**, **capacity goes up**, **pickup times become
reliable** and **admin effort drops**. The brief adds **"simple and reliable"**, fewer avoidable errors, and
**transparency** for patients (e.g. a status overview: prescribed → approved → company assigned → driven → billed).

## 7. Out of scope

- Emergency transport (RTW or NAW via 112) and rescue helicopters
- Reimbursement claims for public transport or your own car
- Building the doctor's practice software or the real Fachdienst. **Mock them.** The JSON data is your "Fachdienst content".
- Changing the law. The paper lists legal open points (proxy rules, G-BA guideline). You can mention them, not solve them.

## 8. A suggested demo slice (my recommendation)

Pick the slice that answers all three questions in one storyline, using the mock data:

1. **Patient view**: shows the prescription status and a **QR key**. A large-print, low-tech variant is printed on a letter.
2. **Transport company portal** (outside the TI): scan or enter the key → see **only what's needed** (pickup, destination,
   time, **vehicle + equipment**, weight, waiting time, co-payment status, approval status) → accept or decline. Show the
   "wrong vehicle" problem being caught here, using record #16 (carry chair) or #18 (210 kg, lying down).
3. **Driver confirmation** at the trip: the patient (or a carer) confirms by a simple method such as an eGK tap, PIN or carer
   link, which produces a signed trip record.
4. **Billing export**: the confirmed trips are turned into the billing fields (`abrechnung_transporteur`), with plausibility
   checks that catch the errors the paper process misses (see the data dictionary's "rule conflicts" section; the mock
   data contains some).

## 9. Questions to ask the gematik mentors

- Who would **operate** the non-TI access point: the insurers, gematik or a third party? Does it matter for the pitch?
- Is **PoPP or eGK-NFC** acceptable as a proof idea for transport companies, or should we assume no card interaction?
- What exactly must a **digital trip confirmation** contain for the insurer to pay (the TP5 dataset)?
- Should a **series prescription** (dialysis 3×/week) produce one key or one per trip? Can a key be **revoked** or **passed on** to another company?
- How should **data minimisation** work, i.e. which fields may a taxi company see? (Diagnosis: probably not. Equipment needs: yes.)
- Is the JSON format fixed, or can we propose a cleaner schema (e.g. FHIR-like)?

---
Sources: [challenge slides](challenge_slides_transcript.md) · [Impulspapier (EN)](../translations/impulspapier_EN.md) ·
[Muster 4 guide (EN)](../translations/muster4_form_guide_EN.md) · [Glossary](../GLOSSARY.md) ·
gematik Fachportal on PoPP: <https://fachportal.gematik.de/> · gematik GitHub (eRezept API: `api-erp`): <https://github.com/gematik>
