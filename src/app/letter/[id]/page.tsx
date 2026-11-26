import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { db, schema } from "@/db";
import { Letter } from "@/components/Letter";
import { getSession } from "@/lib/session";
import { keyCodeFor, pinFor } from "@/lib/server-crypto";
import { approvalStatus } from "@/lib/domain";

export default async function LetterPage({ params }: { params: Promise<{ id: string }> }) {
  const s = await getSession();
  if (!s || !["doctor", "insurer"].includes(s.role)) redirect("/login?next=/doctor");
  const { id } = await params;
  const [row] = await db.select({ rx: schema.prescriptions, p: schema.patients }).from(schema.prescriptions).innerJoin(schema.patients, eq(schema.prescriptions.patientId, schema.patients.id)).where(eq(schema.prescriptions.id, id));
  if (!row) notFound();
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3100";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return (
    <Letter
      origin={`${proto}://${host}`}
      code={await keyCodeFor(id, row.rx.keyVersion)}
      pin={await pinFor(id, row.rx.keyVersion)}
      approval={approvalStatus(row.rx)}
      patient={{ name: row.p.name, birthdate: row.p.birthdate, address: row.p.address, insurer: row.p.insurerName }}
      trip={{ scenario: row.rx.data.szenario, facility: row.rx.data.behandlung.zieladresse, pickup: row.rx.data.behandlung.abholzeit_geplant, frequency: row.rx.data.behandlung.haeufigkeit, hin: row.rx.data.hinfahrt, rueck: row.rx.data.rueckfahrt }}
    />
  );
}
