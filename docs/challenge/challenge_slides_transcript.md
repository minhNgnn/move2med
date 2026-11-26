# Challenge slides — transcript

Transcribed from the four photos taken at the Healthcare Hackathon Bayern (München).
Photos: [`docs/images/challenge_slides/`](../images/challenge_slides/).

---

## Slide 4 — Challenge brief (the official text)

**Healthcare Hackathon Bayern · München — CHALLENGE #1**
**Digital Patient Transport: From Paper Form to Digital Workflow — by gematik**

> When patients cannot travel to medical appointments on their own, they may need a medically
> necessary transport, such as a taxi, rental car or specialized patient transport vehicle. Today,
> this process often relies on a standardized paper prescription. A doctor or hospital fills it out,
> a health insurer may need to approve it, the patient has to find a suitable transport provider and
> the transport company needs the correct information to carry out and later bill the trip. This
> paper-based process can be confusing and leaves room for small mistakes. Missing addresses, unclear
> approvals, wrong checkboxes or missing proof that the trip actually took place can lead to delays,
> phone calls and additional work for everyone involved.
>
> A working group of health systems experts has already recommended that a workflow model should be
> implemented for a digital prescription within Germany's Telematics Infrastructure (TI) to which
> doctors and health insurances have access. However, transport companies such as taxis or companies
> specialized in transporting patients have no access to the TI which is necessary to provide a
> suitable car for the respective patients. Also a digital confirmation that the trip has been carried
> out would be needed by patients for billing purposes.
>
> **This challenge asks: How can we make the access for transport companies to the future digital
> prescriptions possible, simple and reliable?**
>
> Possible solutions could include a QR code as a digital key, a patient-friendly status overview, a
> web portal by health insurances for transport companies, a simple access point for transport
> providers, or a digital confirmation by patients that the trip was completed allowing transport
> companies to bill health insurances directly. The best solution should make the process easier to
> access, reduce avoidable errors and improve transparency for patients and transport professionals.

Tags: `#digital patient transport` `#electronic prescription` `#healthcare workflow` `#patient journey` `#administrative burden`

Logos on slide: gematik · Microsoft · bayern innovativ Health · Patronage: Bavarian Ministry of Economic Affairs, Regional Development and Energy.

---

## Slide 1 — The problem: "WRONG VEHICLE"

**Picture:** In front of a hospital, an elderly woman sits in a wheelchair, and an older man pushes her.
A regular taxi has arrived. The driver holds the paper form, which reads
**"Tragestuhltransport erforderlich"** (*carry-chair transport required*), and looks shocked.
A warning sign says **WRONG VEHICLE**.

Consequences listed:

- ✗ Empty trip (the taxi drove there for nothing)
- ✗ Delayed treatment
- ✗ Additional costs
- ✗ Frustration

> This is exactly record **#16 "Tragestuhltransport"** in the mock data. The transport company only learned
> what was needed when the driver was already standing in front of the patient.

---

## Slide 2 — What the solution should enable

**Picture:** Inside a patient-transport van, a driver shows an elderly woman a tablet. The tablet displays a document with a
QR code, a loading spinner and a signature field. A thought bubble shows the document and QR code pointing to a
**locked cloud**, crossed out with a red ✗ and a "?". The driver can't reach the data. A building with a
kidney logo (a dialysis centre) is in the background.

**The solution should enable…**

- … early route planning
- … correct vehicle and equipment selection
- … seamless integration in existing workflows

**→ Benefits**

- ✓ Reduce empty trips
- ✓ Increase transport capacity
- ✓ Reliable pickup times
- ✓ Reduced administrative effort

---

## Slide 3 — Challenge (the three concrete questions)

1. **How can transport companies access the prescription data without being connected to the Telematics Infrastructure?**
2. **How can the transport company digitally confirm that the transport has taken place?**
3. **How can an elderly person "sign" for confirmation?**
