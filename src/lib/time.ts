const TZ = "Europe/Berlin";

function parts(at: Date) {
  const f = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" });
  return Object.fromEntries(f.formatToParts(at).map((x) => [x.type, x.value])) as Record<string, string>;
}

/** Offset of Berlin local time from UTC at a given instant (handles summer time). */
function offsetMs(at: Date) {
  const p = parts(at);
  return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - at.getTime();
}

/** Today's calendar date in Berlin (the server itself runs in UTC). */
export function berlinToday(now = new Date()) {
  const p = parts(now);
  return `${p.year}-${p.month}-${p.day}`;
}

/** The instant at which a Berlin wall-clock date and time ("2026-11-27", "08:45") occurs. */
export function berlinInstant(date: string, time: string) {
  const [y, mo, d] = date.split("-").map(Number);
  const [h, mi] = time.split(":").map(Number);
  const guess = Date.UTC(y, mo - 1, d, h, mi);
  return new Date(guess - offsetMs(new Date(guess - offsetMs(new Date(guess)))));
}

export const addDaysIso = (d: string, n: number) => new Date(Date.parse(d + "T12:00:00Z") + n * 86400000).toISOString().slice(0, 10);
export const weekdayOf = (d: string) => new Date(d + "T12:00:00Z").getUTCDay(); // 0 = Sunday
