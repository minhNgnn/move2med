import type { Lang } from "./model";

/** Every reply the assistant speaks. Written by us, filled with the patient's data by the server: the model writes none of it. */
const t = (lang: Lang, en: string, de: string) => (lang === "de" ? de : en);

export type RideLite = { date: string; pickupTime: string; leg: string; status: string; vehicle: string | null };
export type CompanyLite = { name: string; phone: string | null } | null;

export function when(date: string, time: string, lang: Lang) {
  const d = new Date(date + "T12:00:00Z");
  const day = d.toLocaleDateString(lang === "de" ? "de-DE" : "en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
  return lang === "de" ? `${day} um ${time} Uhr` : `${day} at ${time}`;
}
export const legPhrase = (leg: string, lang: Lang) =>
  leg === "hin" ? t(lang, "your ride to the clinic", "Ihre Fahrt zur Klinik") : t(lang, "your ride back home", "Ihre Rückfahrt nach Hause");

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const phoneLine = (c: CompanyLite, lang: Lang) => (c?.phone ? t(lang, `Please phone ${c.name} on ${c.phone}.`, `Bitte rufen Sie ${c.name} an: ${c.phone}.`) : t(lang, "Please phone the transport company.", "Bitte rufen Sie das Transportunternehmen an."));

const legShort = (leg: string, lang: Lang) => (leg === "hin" ? t(lang, "To the clinic", "Zur Klinik") : t(lang, "Back home", "Zurück nach Hause"));

export const R = {
  optionLabel: (r: RideLite, lang: Lang) => `${legShort(r.leg, lang)}: ${when(r.date, r.pickupTime, lang)}`,
  status(next: RideLite, company: CompanyLite, approvalPending: boolean, lang: Lang) {
    const dest = next.leg === "hin" ? t(lang, "to the clinic", "zur Klinik") : t(lang, "back home", "zurück nach Hause");
    const parts = [
      t(lang, `Your next ride is ${dest}, on ${when(next.date, next.pickupTime, lang)}.`, `Ihre nächste Fahrt geht ${dest}, am ${when(next.date, next.pickupTime, lang)}.`),
    ];
    if (next.status === "picked_up") parts.push(t(lang, "You have already been picked up.", "Sie wurden bereits abgeholt."));
    else parts.push(next.vehicle ? t(lang, `The vehicle is ${next.vehicle}.`, `Das Fahrzeug ist ${next.vehicle}.`) : t(lang, "No vehicle has been assigned yet.", "Es wurde noch kein Fahrzeug zugewiesen."));
    if (company) parts.push(t(lang, `Your transport company is ${company.name}${company.phone ? `, phone ${company.phone}` : ""}.`, `Ihr Transportunternehmen ist ${company.name}${company.phone ? `, Telefon ${company.phone}` : ""}.`));
    if (approvalPending) parts.push(t(lang, "Your insurer has not approved the trip yet.", "Ihre Krankenkasse hat die Fahrt noch nicht genehmigt."));
    return parts.join(" ");
  },
  driver(next: RideLite, company: CompanyLite, lang: Lang) {
    if (next.status === "picked_up") return t(lang, "You have been picked up and are on your way.", "Sie wurden abgeholt und sind unterwegs.");
    const veh = next.vehicle ? t(lang, `${next.vehicle} is planned for ${when(next.date, next.pickupTime, lang)}.`, `${next.vehicle} ist für ${when(next.date, next.pickupTime, lang)} geplant.`) : t(lang, "No vehicle has been assigned yet.", "Es wurde noch kein Fahrzeug zugewiesen.");
    return `${veh} ${t(lang, "Drivers are not tracked live.", "Fahrer werden nicht live verfolgt.")} ${phoneLine(company, lang)}`;
  },
  noUpcoming(bound: boolean, approvalPending: boolean, lang: Lang) {
    if (approvalPending) return t(lang, "Your insurer is still checking your trip. You will get a message when it is approved.", "Ihre Krankenkasse prüft Ihre Fahrt noch. Sie erhalten eine Nachricht, sobald sie genehmigt ist.");
    return bound ? t(lang, "You have no upcoming rides.", "Sie haben keine anstehenden Fahrten.") : t(lang, "No transport company has accepted your trip yet. Give your ride key to a company.", "Noch kein Transportunternehmen hat Ihre Fahrt angenommen. Geben Sie Ihren Fahrtschlüssel an ein Unternehmen.");
  },
  readback(r: RideLite, lang: Lang) {
    return t(lang, `Do you want to cancel ${legPhrase(r.leg, lang)} on ${when(r.date, r.pickupTime, lang)}? Say yes or no.`, `Möchten Sie ${legPhrase(r.leg, lang)} am ${when(r.date, r.pickupTime, lang)} absagen? Sagen Sie ja oder nein.`);
  },
  clarify(n: number, lang: Lang) {
    return t(lang, `You have ${n} rides that could mean. Which one do you want to cancel?`, `Es kommen ${n} Fahrten infrage. Welche möchten Sie absagen?`);
  },
  requested(r: RideLite, lang: Lang) {
    return t(lang, `Done. I sent your request to cancel ${legPhrase(r.leg, lang)} on ${when(r.date, r.pickupTime, lang)}. It is not cancelled until the transport company confirms. You will get a message.`, `Erledigt. Ich habe Ihre Bitte gesendet, ${legPhrase(r.leg, lang)} am ${when(r.date, r.pickupTime, lang)} abzusagen. Sie ist erst abgesagt, wenn das Transportunternehmen bestätigt. Sie erhalten eine Nachricht.`);
  },
  declinedByPatient: (lang: Lang) => t(lang, "Okay, I did not cancel anything.", "In Ordnung, ich habe nichts abgesagt."),
  alreadyPending: (lang: Lang) => t(lang, "A request for that ride is already waiting for the transport company.", "Für diese Fahrt wartet bereits eine Bitte auf das Transportunternehmen."),
  tooMany: (lang: Lang) => t(lang, "You already have three requests waiting. Please wait for the company to answer.", "Es warten bereits drei Bitten. Bitte warten Sie, bis das Unternehmen antwortet."),
  tooClose: (c: CompanyLite, lang: Lang) => t(lang, `That ride starts very soon, so I cannot send a request. ${phoneLine(c, lang)}`, `Diese Fahrt beginnt in Kürze, deshalb kann ich keine Bitte senden. ${phoneLine(c, lang)}`),
  started: (c: CompanyLite, lang: Lang) => t(lang, `That ride has already started. ${phoneLine(c, lang)}`, `Diese Fahrt hat bereits begonnen. ${phoneLine(c, lang)}`),
  notFound: (lang: Lang) => t(lang, "I could not find a ride that could be cancelled for that day. Ask me about your next ride to see what is planned.", "Ich habe für diesen Tag keine Fahrt gefunden, die abgesagt werden kann. Fragen Sie nach Ihrer nächsten Fahrt, um zu sehen, was geplant ist."),
  button(kind: "revoke_key" | "reassign" | "cancel_all", lang: Lang) {
    if (kind === "revoke_key") return t(lang, "I cannot do that by voice. To make your key invalid, press the red button “Revoke my key” on this page.", "Das kann ich nicht per Sprache. Um Ihren Schlüssel ungültig zu machen, drücken Sie auf dieser Seite den roten Knopf „Meinen Schlüssel widerrufen“.");
    if (kind === "reassign") return t(lang, "I cannot do that by voice. To use another company, press the button “Choose another company” on this page.", "Das kann ich nicht per Sprache. Um ein anderes Unternehmen zu wählen, drücken Sie auf dieser Seite den Knopf „Anderes Unternehmen wählen“.");
    return t(lang, "I cannot cancel your whole trip by voice. I can cancel one ride; tell me which day. For anything bigger, use the buttons on this page.", "Die ganze Fahrt kann ich nicht per Sprache absagen. Eine einzelne Fahrt kann ich absagen, nennen Sie mir den Tag. Für Größeres nutzen Sie die Knöpfe auf dieser Seite.");
  },
  noQuestion: (lang: Lang) => t(lang, "I did not ask you anything. You can ask about your next ride or say which ride to cancel.", "Ich habe Ihnen keine Frage gestellt. Sie können nach Ihrer nächsten Fahrt fragen oder sagen, welche Fahrt abgesagt werden soll."),
  unknown: (lang: Lang) => t(lang, "I did not understand. You can use the buttons below, or ask “When is my next ride?”.", "Das habe ich nicht verstanden. Nutzen Sie die Knöpfe unten oder fragen Sie „Wann ist meine nächste Fahrt?“."),
  unavailable: (lang: Lang) => t(lang, "I cannot listen right now. Please use the buttons below.", "Ich kann gerade nicht zuhören. Bitte nutzen Sie die Knöpfe unten."),
  tooLong: (lang: Lang) => t(lang, "That was too long. Please say it in a shorter sentence.", "Das war zu lang. Bitte sagen Sie es in einem kürzeren Satz."),
  tokenInvalid: (lang: Lang) => t(lang, "That question has expired. Please ask again.", "Diese Frage ist abgelaufen. Bitte fragen Sie noch einmal."),
};

export const sms = {
  requested: (r: RideLite) => ({
    en: `move2med: Your request to cancel ${legPhrase(r.leg, "en")} on ${when(r.date, r.pickupTime, "en")} was sent. The transport company will confirm.`,
    de: `move2med: Ihre Bitte, ${legPhrase(r.leg, "de")} am ${when(r.date, r.pickupTime, "de")} abzusagen, wurde gesendet. Das Transportunternehmen bestätigt.`,
  }),
  confirmed: (r: RideLite) => ({
    en: `move2med: Cancelled: ${legPhrase(r.leg, "en")} on ${when(r.date, r.pickupTime, "en")}.`,
    de: `move2med: Abgesagt: ${legPhrase(r.leg, "de")} am ${when(r.date, r.pickupTime, "de")}.`,
  }),
  declined: (r: RideLite, c: CompanyLite) => ({
    en: `move2med: The transport company could not cancel ${legPhrase(r.leg, "en")} on ${when(r.date, r.pickupTime, "en")} and will phone you.${c?.phone ? ` ${c.phone}` : ""}`,
    de: `move2med: Das Transportunternehmen konnte ${legPhrase(r.leg, "de")} am ${when(r.date, r.pickupTime, "de")} nicht absagen und ruft Sie an.${c?.phone ? ` ${c.phone}` : ""}`,
  }),
};
