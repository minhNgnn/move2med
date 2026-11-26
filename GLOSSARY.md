# move2med

A gateway and reference app that lets transport companies, which are not on the Telematics Infrastructure, read a patient's transport prescription and prove that rides happened. The German-English translation table lives in `docs/GLOSSARY.md`.

## Language

### People and organisations

**Patient**:
The insured person who needs transport. Uses no account; identifies with a ride key and date of birth.
_Avoid_: User, customer, client

**Relative**:
Someone who acts for a patient from the patient's status page.
_Avoid_: Proxy, carer (use only for the confirmation method "proxy")

**Transport company**:
A taxi, rental-car or patient-transport operator registered with an insurer by its IK number.
_Avoid_: Provider, vendor, Fahrdienst

**Dispatcher**:
A transport company's office user who redeems keys, plans and assigns rides, and bills.
_Avoid_: Admin, operator

**Driver**:
A transport company's driver who works from the offline driver app.

### The trip

**Prescription**:
The digital transport order a doctor issues, the stand-in for the paper form Muster 4.
_Avoid_: Order, request, Verordnung

**Ride key**:
The short code (also a QR code) that gives one transport company access to one prescription. Needs the patient's date of birth to be redeemed.
_Avoid_: Token, code, access code, password

**Trip Card**:
What a transport company sees of a prescription: only what it needs to send the right vehicle.
_Avoid_: Job, order details

**Preview**:
The reduced Trip Card shown before a company accepts: no name, phone or street address.

**Ride**:
One leg of a trip on one date: outbound or return. A series has many rides.
_Avoid_: Trip, job, transport (when one leg is meant)

**Series**:
A prescription for recurring treatment, such as dialysis three times a week, which produces many rides under one key.

**Approval**:
The insurer's decision that a trip may be driven, required for some reasons and not for others.

### Proof

**Proof**:
The record that a ride happened: the patient's confirmation, the driver's device signature and the gateway's countersignature together.
_Avoid_: Receipt, signature (alone)

**Confirmation**:
The patient's part of a proof: a health-card tap, a PIN from the letter, or a relative's confirmation.

**Review queue**:
The insurer's list of proofs that need a human decision because something was odd. Nothing odd is silently dropped or accepted.

### Ending or changing a trip

**Cancel ride**:
A dispatcher ends one ride that has not started. The patient is told by message.

**Cancel prescription**:
A doctor withdraws a prescription; a correction means cancel and reissue.

**Revoke key**:
The patient makes the ride key useless. No company can redeem it any more.

**Reassign**:
The patient frees the trip for another company: unstarted rides are cancelled and a new ride key replaces the old one.

**Cancellation request**:
A patient's ask to cancel one ride, pending until a dispatcher confirms or declines it. It is never a Revoke key, a Reassign or a Cancel prescription.
_Avoid_: Cancel (alone), cancellation

### Voice assistant

**Voice assistant**:
An optional spoken or typed way for a patient to ask about their rides and to make a Cancellation request. It is read-only apart from that request.
_Avoid_: Chatbot, agent, bot

**Intent**:
What the Voice assistant decides a patient's sentence is asking for: read status, make a Cancellation request, or neither.

**Read-back**:
The Voice assistant repeating what it understood and waiting for a yes before it creates a Cancellation request. Never called a confirmation, which means the patient's part of a Proof.
_Avoid_: Confirmation (for this step), double-check
