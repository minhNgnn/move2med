import { eq } from "drizzle-orm";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import QRCode from "qrcode";
import { db, schema } from "@/db";
import { handle, HttpError, requireUser, audit } from "@/lib/api";
import { approvalStatus } from "@/lib/domain";
import { keyCodeFor, pinFor } from "@/lib/server-crypto";

/** The approval letter as a real PDF (A4, bilingual), for printing or posting. Doctor or insurer only. */
export const GET = handle(async (req, ctx) => {
  const s = await requireUser(["doctor", "insurer"]);
  const { id } = await ctx.params;
  const [row] = await db.select({ rx: schema.prescriptions, p: schema.patients }).from(schema.prescriptions).innerJoin(schema.patients, eq(schema.prescriptions.patientId, schema.patients.id)).where(eq(schema.prescriptions.id, id));
  if (!row) throw new HttpError(404, "Not found");
  const { rx, p } = row;
  const code = await keyCodeFor(id, rx.keyVersion);
  const pin = await pinFor(id, rx.keyVersion);
  const origin = req.nextUrl.origin;

  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595, 842]);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const mono = await pdf.embedFont(StandardFonts.CourierBold);
  const ink = rgb(0, 0.055, 0.32);
  const grey = rgb(0.36, 0.4, 0.53);
  const text = (t: string, x: number, y: number, size = 11, f = font, color = rgb(0.04, 0.07, 0.19)) => page.drawText(t, { x, y, size, font: f, color });

  page.drawRectangle({ x: 0, y: 782, width: 595, height: 60, color: ink });
  text("move2med", 48, 804, 22, bold, rgb(1, 1, 1));
  text(`${p.insurerName} · Fahrt-Genehmigung / Transport approval`, 48, 790, 9, font, rgb(0.8, 0.93, 0.98));
  text(p.name, 48, 740, 11, bold); text(p.address.strasse, 48, 726); text(`${p.address.plz} ${p.address.ort}`, 48, 712);

  text("Ihr Fahrtschlüssel für die Krankenbeförderung", 48, 670, 17, bold, ink);
  text("Your ride key for patient transport", 48, 652, 12, font, grey);
  const ap = approvalStatus(rx);
  text(ap === "pending" ? "Die Krankenkasse prüft noch. Der Schlüssel funktioniert nach der Genehmigung (SMS)." : "Ihre Fahrt ist genehmigt. Geben Sie den Schlüssel an ein Transportunternehmen Ihrer Wahl.", 48, 630, 10, font, grey);
  text(ap === "pending" ? "The insurer is still checking. The key works once approved (you will get an SMS)." : "Your trip is approved. Give the key to a transport company of your choice.", 48, 616, 10, font, grey);

  page.drawRectangle({ x: 48, y: 410, width: 499, height: 190, borderColor: ink, borderWidth: 2 });
  const png = await pdf.embedPng(await QRCode.toBuffer(`${origin}/status?k=${code}`, { margin: 1, width: 400, color: { dark: "#000e52", light: "#ffffff" } }));
  page.drawImage(png, { x: 66, y: 426, width: 158, height: 158 });
  text("FAHRTSCHLÜSSEL / RIDE KEY", 250, 560, 9, font, grey);
  text(code, 250, 520, 34, mono, ink);
  text("PIN (falls die Karte nicht geht / if the card does not work)", 250, 480, 9, font, grey);
  text(pin, 250, 450, 24, mono, ink);

  const steps = [
    "1. Rufen Sie ein Transportunternehmen an und lesen Sie den Schlüssel vor. / Call a company and read out the key.",
    `2. Es wird nach Ihrem Geburtsdatum (${p.birthdate}) gefragt. / It will ask for your date of birth.`,
    "3. Am Fahrtag halten Sie Ihre Gesundheitskarte an das Handy des Fahrers. Das ist Ihre Unterschrift.",
    "    On the day, hold your health card to the driver's phone. That is your signature.",
    `4. Status: ${origin.replace(/^https?:\/\//, "")}/status (Schlüssel + Geburtsdatum / key + date of birth)`,
  ];
  steps.forEach((t, i) => text(t, 48, 380 - i * 18, 10));
  const d = rx.data;
  page.drawRectangle({ x: 48, y: 204, width: 499, height: 78, color: rgb(0.96, 0.97, 0.98) });
  text("Ihre Fahrt / Your trip", 60, 264, 10, bold, ink);
  text(`${d.szenario} · ${d.behandlung.zieladresse.einrichtung}, ${d.behandlung.zieladresse.strasse}, ${d.behandlung.zieladresse.plz} ${d.behandlung.zieladresse.ort}`, 60, 248, 9);
  text(`Abholung / Pickup ${d.behandlung.abholzeit_geplant} · ${d.behandlung.haeufigkeit ?? "Einzelfahrt / single trip"}`, 60, 234, 9);
  text(`Hinfahrt / Outbound: ${d.hinfahrt.befoerderungsart} ${d.hinfahrt.ausstattung !== "keine" ? d.hinfahrt.ausstattung : ""} · Rückfahrt / Return: ${d.rueckfahrt.befoerderungsart} ${d.rueckfahrt.ausstattung !== "keine" ? d.rueckfahrt.ausstattung : ""}`, 60, 220, 9);
  text("Veröffentlichen Sie den Schlüssel nie. Sie können ihn jederzeit auf der Statusseite widerrufen.", 48, 172, 8, font, grey);
  text("Never share the key publicly. You can revoke it at any time on the status page.", 48, 160, 8, font, grey);

  await audit({ actorType: "user", actorId: s.uid, actorName: s.name, action: "letter.pdf", prescriptionId: id });
  const bytes = await pdf.save();
  return new Response(Buffer.from(bytes), { headers: { "content-type": "application/pdf", "content-disposition": `inline; filename="move2med-${code}.pdf"` } });
});
