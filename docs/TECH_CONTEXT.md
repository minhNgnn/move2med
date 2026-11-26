# Technical context: gematik building blocks relevant to the challenge

Short pointers, not a spec. Check the details with the gematik mentors at the hackathon.

## Patterns worth reusing

### eRezept token: the "key" model
The e-prescription for medicine already works the way the Impulspapier wants for transport. The doctor creates a **Task**
on the eRezept Fachdienst. The patient gets a **DataMatrix code** (app or printout) containing
`Task/{prescriptionId}/$accept?ac={accessCode}`. **Whoever holds the code can claim the prescription** (a pharmacy). The
patient chooses the pharmacy by handing over the code.
- API docs: <https://github.com/gematik/api-erp>
- FHIR profiles: <https://simplifier.net/erezept-workflow>
- **Difference for our case:** pharmacies are on the TI and transport companies are not. So the key must be redeemable
  through a non-TI channel (portal or API), and should expose **only the data the company needs**.

### PoPP: Proof of Patient Presence (TI 2.0)
Tap the **eGK by NFC** on a smartphone or card terminal, and the PoPP service issues a **signed, time-limited token**
proving the patient was physically present. Designed for practices and pharmacies. Conceptually it matches "confirm that
the trip happened" (Q2) and "an elderly person 'signs'" (Q3): every insured person already has the card, and no app is needed.
- API: <https://github.com/gematik/api-popp>
- **Mock tokens for demos:** <https://github.com/gematik/popp-token-generator>
- Sample code: <https://github.com/gematik/popp-sample-code>
- Concept: <https://gemspec.gematik.de/downloads/gemKPT/gemKPT_PoPP/gemKPT_PoPP_V1.0.0.pdf>
- ⚠️ Open question: whether non-TI parties like taxi companies may use it, and on which devices. Present it as a future option or ask the mentors.

### ZETA: Zero Trust Access (TI 2.0)
TI 2.0 moves from a closed VPN network ("connector") to internet-reachable services protected by zero-trust access. This
may make "access without the classic TI connection" more realistic in future.
- <https://github.com/gematik/zeta>

### WANDA
*Weitere Anwendungen für den Datenaustausch*: a framework for additional, non-core applications that use TI services.
Named in the Impulspapier as one access route. See the gematik Fachportal.

### TI-Messenger
Secure Matrix-based messaging between healthcare actors. Suggested in the Impulspapier for sending the insurer's approval
decision. Could also carry transport requests and status updates.

### Billing
Transport companies bill insurers electronically under **§ 302 SGB V** (DTA). The Impulspapier names the **TP5 procedure**
as a possible carrier for the digital trip confirmation. The `abrechnung_transporteur` fields in the mock data are the billing payload.

## Main portals
- gematik GitHub: <https://github.com/gematik>
- gematik Fachportal (concepts and specifications, German): <https://fachportal.gematik.de/>
- gematik specs: <https://gemspec.gematik.de/>
- Impulspapier news: <https://www.gematik.de/newsroom/news-detail/impulspapier-fuer-digitale-verordnung-von-krankenbefoerderung>
- gematik media library (logos): <https://www.gematik.de/newsroom/mediathek>
- KBV patient transport info: <https://www.kbv.de/html/krankentransport.php>
- Official form collection (all "Muster", incl. Muster 4 front and back): <https://www.gkv-spitzenverband.de/media/dokumente/krankenversicherung_1/aerztliche_versorgung/bundesmantelvertrag_1/bmv_anlagen/2026-05_BMV_Anlage_2_Mustersammlung.pdf>
