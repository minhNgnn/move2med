import { sql, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import raw from "../../data/clean/testdatensatz_20.json";
import { createPrescription, generateRides, approvalStatus } from "@/lib/domain";
import { hashPassword } from "@/lib/server-crypto";
import type { ReasonCode } from "@/lib/rules";
import type { TransportData } from "@/lib/types";

const DEMO_PASSWORD = "demo";

/** Muster 4 section-1 reason per mock record (the mock JSON only has free text). */
const REASON: Record<number, ReasonCode> = {
  1: "d", 2: "d", 3: "d", 4: "d", 5: "a", 6: "a", 7: "a", 8: "a", 9: "c", 10: "c",
  11: "e", 12: "e", 13: "f", 14: "f", 15: "f", 16: "f", 17: "f", 18: "f", 19: "f", 20: "d",
};
/** Left un-issued on purpose: the doctor issues #16 live in the demo. */
export const LIVE_DEMO_PATIENT = 16;
const PENDING_APPROVAL = new Set([1, 4, 12]);
const NO_JUSTIFICATION = new Set([19]);

const companies = [
  { id: "c_spree", name: "Spree Krankentransport", ik: "440100001", city: "Berlin" },
  { id: "c_berlintaxi", name: "Berlin Taxi Zentrale", ik: "440100002", city: "Berlin" },
  { id: "c_elbe", name: "Elbe Patiententransport", ik: "440200001", city: "Hamburg" },
  { id: "c_isar", name: "Isar Krankenfahrten", ik: "440300001", city: "München" },
  { id: "c_rhein", name: "Rhein Mobil Köln", ik: "440400001", city: "Köln" },
];

const FULL = ["rollstuhl", "tragestuhl", "liegend"];
const vehicles = [
  { id: "v_spree_ktw1", companyId: "c_spree", label: "KTW 1", plate: "B-SK 101", type: "ktw", equipment: ["rollstuhl", "tragestuhl"] },
  { id: "v_spree_ktw2", companyId: "c_spree", label: "KTW 2 (Trage)", plate: "B-SK 102", type: "ktw", equipment: [...FULL, "schwerlast"] },
  { id: "v_spree_taxi1", companyId: "c_spree", label: "Taxi 1", plate: "B-SK 201", type: "taxi", equipment: [] },
  { id: "v_bt_taxi1", companyId: "c_berlintaxi", label: "Taxi 1", plate: "B-TZ 301", type: "taxi", equipment: [] },
  { id: "v_bt_taxi2", companyId: "c_berlintaxi", label: "Taxi 2", plate: "B-TZ 302", type: "taxi", equipment: [] },
  { id: "v_bt_rolli", companyId: "c_berlintaxi", label: "Mietwagen Rolli", plate: "B-TZ 303", type: "taxi", equipment: ["rollstuhl"] },
  { id: "v_elbe_ktw1", companyId: "c_elbe", label: "KTW 1", plate: "HH-EP 101", type: "ktw", equipment: FULL },
  { id: "v_elbe_taxi1", companyId: "c_elbe", label: "Taxi 1", plate: "HH-EP 201", type: "taxi", equipment: [] },
  { id: "v_isar_ktw1", companyId: "c_isar", label: "KTW 1", plate: "M-IK 101", type: "ktw", equipment: [...FULL, "schwerlast"] },
  { id: "v_isar_taxi1", companyId: "c_isar", label: "Taxi 1", plate: "M-IK 201", type: "taxi", equipment: [] },
  { id: "v_isar_rolli", companyId: "c_isar", label: "Mietwagen Rolli", plate: "M-IK 202", type: "taxi", equipment: ["rollstuhl"] },
  { id: "v_rhein_ktw1", companyId: "c_rhein", label: "KTW 1", plate: "K-RM 101", type: "ktw", equipment: FULL },
  { id: "v_rhein_taxi1", companyId: "c_rhein", label: "Taxi 1", plate: "K-RM 201", type: "taxi", equipment: [] },
];

const users = [
  { id: "u_doctor", email: "doctor@demo.med", name: "Dr. Keller", role: "doctor", companyId: null },
  { id: "u_insurer", email: "insurer@demo.med", name: "Insurer operator", role: "insurer", companyId: null },
  ...companies.flatMap((c) => {
    const k = c.id.replace("c_", "");
    return [
      { id: `u_disp_${k}`, email: `dispatch.${k}@demo.med`, name: `Dispatcher ${c.name}`, role: "dispatcher", companyId: c.id },
      { id: `u_drv_${k}`, email: `driver.${k}@demo.med`, name: k === "spree" ? "Alex Weber" : `Driver ${c.name}`, role: "driver", companyId: c.id },
    ];
  }),
];

export async function seedAll() {
  await db.execute(sql`truncate table companies, vehicles, users, devices, patients, prescriptions, rides, ride_events, proofs, patient_confirmations, audit_log, sms, billing_submissions restart identity`);
  await db.insert(schema.companies).values(companies);
  await db.insert(schema.vehicles).values(vehicles);
  const passwordHash = hashPassword(DEMO_PASSWORD);
  await db.insert(schema.users).values(users.map((u) => ({ ...u, passwordHash })));

  const records = raw.testdaten;
  const toData = (t: (typeof records)[number]["transportdaten"]) =>
    ({
      szenario: t.szenario, fahrtart: t.fahrtart, unfallbezug: t.unfallbezug,
      grund_der_befoerderung: t.grund_der_befoerderung, behandlung: t.behandlung,
      hinfahrt: t.hinfahrt, rueckfahrt: t.rueckfahrt, sonstiges: t.sonstiges,
    }) as TransportData;
  await db.insert(schema.patients).values(
    records.map((r) => ({
      draft: toData(r.transportdaten),
      id: r.patient_id,
      name: r.display_name,
      birthdate: r.birthdate,
      kvnr: r.versichertennummer,
      address: r.anschrift,
      insurerName: r.krankenkasse.name,
      insurerIk: r.krankenkasse.ikNummer,
      exemption: r.zuzahlungsbefreiung,
      phone: `+49 30 555 ${String(r.patient_id).padStart(4, "0")}`,
      billing: {
        gesamt_brutto: r.transportdaten.abrechnung_transporteur.gesamt_brutto,
        zuzahlung: r.transportdaten.abrechnung_transporteur.zuzahlung,
        km: r.transportdaten.abrechnung_transporteur.km,
        positionsnummer: r.transportdaten.abrechnung_transporteur.positionsnummer,
        anzahl: r.transportdaten.abrechnung_transporteur.anzahl,
        belegnummer: r.transportdaten.abrechnung_transporteur.belegnummer,
        rechnungsnummer: r.transportdaten.abrechnung_transporteur.rechnungsnummer,
      },
    })),
  );

  for (const r of records) {
    if (r.patient_id === LIVE_DEMO_PATIENT) continue;
    const t = r.transportdaten;
    const data = toData(t);
    const ktw = t.hinfahrt.befoerderungsart === "KTW" || t.rueckfahrt.befoerderungsart === "KTW";
    const id = `rx_p${r.patient_id}`;
    await createPrescription({
      id, patientId: r.patient_id, data, reasonCode: REASON[r.patient_id],
      justification: ktw && !NO_JUSTIFICATION.has(r.patient_id) ? "Cannot sit unsupported; transfer needs two trained attendants." : null,
      issuedBy: "u_doctor",
    });
    // Most approval-required trips are already approved; a few stay pending for the insurer demo.
    const [rx] = await db.select().from(schema.prescriptions).where(eq(schema.prescriptions.id, id));
    if (rx.approvalRequired && !PENDING_APPROVAL.has(r.patient_id)) {
      await db.update(schema.prescriptions).set({ status: "ready", approvalDecidedAt: new Date() }).where(eq(schema.prescriptions.id, id));
    }
  }

  // Patient #20 (taxi series) is already accepted and assigned, so the driver app is not empty.
  const [rx20] = await db.select().from(schema.prescriptions).where(eq(schema.prescriptions.id, "rx_p20"));
  const [p20] = await db.select().from(schema.patients).where(eq(schema.patients.id, 20));
  await db.update(schema.prescriptions).set({ boundCompanyId: "c_spree", boundAt: new Date() }).where(eq(schema.prescriptions.id, "rx_p20"));
  await generateRides({ ...rx20, boundCompanyId: "c_spree" }, p20, "c_spree");
  await db.update(schema.rides).set({ vehicleId: "v_spree_taxi1", driverId: "u_drv_spree", status: "assigned" }).where(eq(schema.rides.prescriptionId, "rx_p20"));

  await db.insert(schema.auditLog).values({ actorType: "system", action: "demo.reset", detail: { patients: records.length } });
  return { patients: records.length, approvalPending: [...PENDING_APPROVAL], status: approvalStatus(rx20) };
}
