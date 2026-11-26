import { and, eq, inArray, isNull } from "drizzle-orm";
import { db, schema } from "@/db";
import { approvalStatus } from "./domain";
import { checkPrescription, type ReasonCode } from "./rules";

/** Completed, not-yet-billed rides with their proof and any blocking rule error (shown to the dispatcher, never silently fixed). */
export async function billingCandidates(companyId: string) {
  const rows = await db
    .select({ ride: schema.rides, rx: schema.prescriptions, p: schema.patients })
    .from(schema.rides)
    .innerJoin(schema.prescriptions, eq(schema.rides.prescriptionId, schema.prescriptions.id))
    .innerJoin(schema.patients, eq(schema.prescriptions.patientId, schema.patients.id))
    .where(and(eq(schema.rides.companyId, companyId), eq(schema.rides.status, "completed"), isNull(schema.rides.billingId)));
  const proofs = rows.length ? await db.select().from(schema.proofs).where(inArray(schema.proofs.rideId, rows.map((r) => r.ride.id))) : [];
  return rows.map(({ ride, rx, p }) => {
    const proof = proofs.find((x) => x.rideId === ride.id) ?? null;
    const ruleFlags = checkPrescription({
      reasonCode: rx.reasonCode as ReasonCode, data: rx.data, justification: rx.justification, exemption: p.exemption,
      billed: { zuzahlung: rx.copayOverride ?? p.billing.zuzahlung, gesamt_brutto: p.billing.gesamt_brutto },
      approval: { required: rx.approvalRequired, status: approvalStatus(rx) },
    }).filter((f) => f.severity === "error");
    const flags = [...ruleFlags];
    if (!proof) flags.push(rx.data.behandlung.haeufigkeit ? { code: "series_unconfirmed", severity: "error", params: { date: ride.scheduledDate } } : { code: "no_proof", severity: "error" });
    else if (proof.status !== "verified") flags.push({ code: "unverified_proof", severity: "error" });
    return { ride, rx, p, proof, flags, eligible: flags.length === 0 };
  });
}

