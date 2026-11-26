import { z } from "zod";
import { addDaysIso, weekdayOf } from "../time";

export type Lang = "en" | "de";
export type IntentName = "status" | "cancel" | "revoke_key" | "reassign" | "cancel_all" | "yes" | "no" | "unknown";
export type Intent = { intent: IntentName; day: string | null; leg: "hin" | "rueck" | null };
export type IntentContext = { lang: Lang; today: string };

/** The model's only job: label one sentence. It never sees ride data and never writes a reply (ADR 0001). */
export interface IntentModel {
  classify(text: string, ctx: IntentContext): Promise<Intent>;
}
export class ModelUnavailable extends Error {}

const intentSchema = z.object({
  intent: z.enum(["status", "cancel", "revoke_key", "reassign", "cancel_all", "yes", "no", "unknown"]),
  day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional().transform((v) => v ?? null),
  leg: z.enum(["hin", "rueck"]).nullable().optional().transform((v) => v ?? null),
});

// ---------------------------------------------------------------- fake (tests, no key needed)
const WEEKDAYS: Record<string, number> = {
  sunday: 0, sonntag: 0, monday: 1, montag: 1, tuesday: 2, dienstag: 2, wednesday: 3, mittwoch: 3,
  thursday: 4, donnerstag: 4, friday: 5, freitag: 5, saturday: 6, samstag: 6,
};

function parseDay(t: string, today: string): string | null {
  const iso = t.match(/\b(\d{4}-\d{2}-\d{2})\b/);
  if (iso) return iso[1];
  const de = t.match(/\b(\d{1,2})\.(\d{1,2})\./);
  if (de) return `${today.slice(0, 4)}-${de[2].padStart(2, "0")}-${de[1].padStart(2, "0")}`;
  if (/day after tomorrow|übermorgen/.test(t)) return addDaysIso(today, 2);
  if (/\btomorrow\b|\bmorgen\b/.test(t)) return addDaysIso(today, 1);
  if (/\btoday\b|\bheute\b/.test(t)) return today;
  for (const [name, wd] of Object.entries(WEEKDAYS)) {
    if (new RegExp(`\\b${name}\\b`).test(t)) {
      const diff = (wd - weekdayOf(today) + 7) % 7;
      return addDaysIso(today, diff);
    }
  }
  return null;
}
function parseLeg(t: string): "hin" | "rueck" | null {
  if (/\b(back|home|return|returning)\b|zurück|rückfahrt|nach hause|heimfahrt/.test(t)) return "rueck";
  if (/to the clinic|to the hospital|to the doctor|outbound|\bthere\b|hinfahrt|zur klinik|zum arzt|zum krankenhaus/.test(t)) return "hin";
  return null;
}

export class FakeModel implements IntentModel {
  async classify(text: string, ctx: IntentContext): Promise<Intent> {
    const t = text.toLowerCase().trim();
    const words = t.split(/\s+/).filter(Boolean).length;
    let intent: IntentName = "unknown";
    if (words <= 4 && /^(yes|yeah|yep|ok|okay|sure|correct|right|ja|jawohl|genau|richtig|klar|stimmt|gerne)\b/.test(t)) intent = "yes";
    else if (words <= 4 && /^(no|nope|nein|stop|lieber nicht)\b/.test(t)) intent = "no";
    else if (/(revoke|invalidate|withdraw).*key|key.*(revoke|invalid)|schlüssel.*(widerruf|sperr|ungültig)|widerruf/.test(t)) intent = "revoke_key";
    else if (/(another|other|different|new) (company|firm|provider)|anderes? (unternehmen|firma)|anderen (fahrdienst|firma|unternehmen)|unternehmen wechseln/.test(t)) intent = "reassign";
    else if (/cancel (everything|all|the whole|my whole|the trip|my trip)|alles (stornieren|absagen)|ganze fahrt|alle fahrten/.test(t)) intent = "cancel_all";
    else if (/cancel|can't make|cannot make|can not make|won't make|not coming|not going|absagen|stornier|nicht (kommen|mitfahren|mitkommen)|kann nicht/.test(t)) intent = "cancel";
    else if (/when|where|next|ride|driver|pick|fahrt|wann|wo\b|fahrer|abhol|nächste|status/.test(t)) intent = "status";
    return { intent, day: intent === "cancel" || intent === "status" ? parseDay(t, ctx.today) : null, leg: intent === "cancel" || intent === "status" ? parseLeg(t) : null };
  }
}

// ---------------------------------------------------------------- real (OpenRouter)
export class OpenRouterModel implements IntentModel {
  constructor(private key: string, private model: string, private timeoutMs = 3000) {}

  /** One quick retry: a provider hiccup or an empty reply should not leave an elderly patient without an answer. */
  async classify(text: string, ctx: IntentContext): Promise<Intent> {
    try {
      return await this.once(text, ctx);
    } catch {
      return await this.once(text, ctx);
    }
  }

  private async once(text: string, ctx: IntentContext): Promise<Intent> {
    const wd = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][weekdayOf(ctx.today)];
    const system = [
      "You label ONE sentence from an elderly patient about their medical transport rides. The sentence is German or English. Answer with a single JSON object and nothing else.",
      'Fields: "intent", "day", "leg".',
      '"intent" is one of: "status" (asks when/where/which about a ride, the driver or the vehicle), "cancel" (cannot make one specific ride and wants it cancelled), "revoke_key" (wants their ride key made invalid), "reassign" (wants another transport company), "cancel_all" (wants the whole trip cancelled), "yes", "no", "unknown".',
      `"day": the ISO date (YYYY-MM-DD) of the day the patient names, resolved against today, or null. Today is ${ctx.today} (${wd}).`,
      '"leg": "hin" if they mean the ride to the clinic/hospital/doctor, "rueck" if they mean the ride back home, otherwise null.',
      "Never answer the patient's question. Output JSON only.",
    ].join("\n");
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), this.timeoutMs);
    try {
      const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        signal: ctrl.signal,
        headers: { "content-type": "application/json", authorization: `Bearer ${this.key}`, "x-title": "move2med" },
        body: JSON.stringify({
          model: this.model,
          temperature: 0,
          max_tokens: 300,
          // Ask providers not to retain or train on this request.
          provider: { data_collection: "deny" },
          messages: [{ role: "system", content: system }, { role: "user", content: text }],
        }),
      });
      if (!res.ok) throw new ModelUnavailable(`model http ${res.status}`);
      const body = await res.json();
      const content: string = body?.choices?.[0]?.message?.content ?? "";
      const json = content.match(/\{[\s\S]*\}/)?.[0];
      if (!json) throw new ModelUnavailable(`no json (reply length ${content.length})`);
      return intentSchema.parse(JSON.parse(json));
    } catch (e) {
      throw e instanceof ModelUnavailable ? e : new ModelUnavailable(e instanceof z.ZodError ? `bad shape: ${e.issues.map((i) => i.path.join(".")).join(",")}` : e instanceof Error ? e.name : "error");
    } finally {
      clearTimeout(timer);
    }
  }
}

/** `ASSISTANT_MODEL=fake` switches in the deterministic fake (tests, demos without a key). */
export function getModel(): IntentModel | null {
  if (process.env.ASSISTANT_MODEL === "fake") return new FakeModel();
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) return null;
  return new OpenRouterModel(key, process.env.ASSISTANT_MODEL_ID || "anthropic/claude-haiku-5.5");
}
