// České formátování pro stránku. Jen čisté funkce, testy jsou v tests/format.test.ts.
import { formatCzDate, weekdayCz } from "../ai/dates";

const numberFormat = new Intl.NumberFormat("cs-CZ");
const decimalFormat = new Intl.NumberFormat("cs-CZ", { maximumFractionDigits: 1 });

// 15325 → „15 325“ (s pevnou mezerou, takže se číslo nezalomí)
export function formatNumber(value: number): string {
  return numberFormat.format(value);
}

// 1 auto, 2–4 auta, 0 a 5+ aut
export function carsWord(value: number): string {
  if (value === 1) return "auto";
  if (value >= 2 && value <= 4) return "auta";
  return "aut";
}

export function formatCars(value: number): string {
  return `${formatNumber(value)} ${carsWord(value)}`;
}

// 7 → „7:00–8:00“
export function formatHourRange(hour: number): string {
  return `${hour}:00–${hour + 1}:00`;
}

// „2026-11-19“ → „čtvrtek 19. 11. 2026“
export function formatDayLong(date: string): string {
  return `${weekdayCz(date)} ${formatCzDate(date)}`;
}

export function capitalize(text: string): string {
  return text.charAt(0).toLocaleUpperCase("cs-CZ") + text.slice(1);
}

// Text do českých uvozovek „…“
export function quote(text: string): string {
  return `„${text}“`;
}

// 700 → „0,7 s“, pod 100 ms → „pod 0,1 s“
export function formatSeconds(ms: number): string {
  if (ms < 100) return "pod 0,1 s";
  return `${decimalFormat.format(Math.round(ms / 100) / 10)} s`;
}

// Hodiny, před kterými se říká „ve“ (ve dvě, ve dvanáct, ve dvacet…), jinak „v“.
const VE_HOURS = new Set([2, 3, 4, 12, 13, 14, 20, 21, 22, 23]);

function pragueParts(at: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Prague",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "numeric",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(at);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return { date: `${get("year")}-${get("month")}-${get("day")}`, hour: Number(get("hour")), minute: get("minute") };
}

// Čas stažení dat vzhledem k „teď“: „dnes ve 22:14“, „včera v 8:05“, „17. 11. 2026 v 9:30“
export function formatFetchedAt(fetchedAt: string, now: Date): string {
  const at = pragueParts(new Date(fetchedAt));
  const today = pragueParts(now).date;
  const yesterday = pragueParts(new Date(now.getTime() - 24 * 3600 * 1000)).date;
  const time = `${VE_HOURS.has(at.hour) ? "ve" : "v"} ${at.hour}:${at.minute}`;
  if (at.date === today) return `dnes ${time}`;
  if (at.date === yesterday) return `včera ${time}`;
  return `${formatCzDate(at.date)} ${time}`;
}

// Osa grafu: „hezké“ maximum a pomocné čáry. Pro 1 318 vyjde osa do 1 500 s čarami 500 a 1 000.
export function niceAxis(max: number): { max: number; ticks: number[] } {
  if (max <= 0) return { max: 1, ticks: [] };
  const rough = max / 3;
  const power = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 5, 10].map((m) => m * power).find((candidate) => candidate >= rough) ?? 10 * power;
  let top = Math.ceil(max / step) * step;
  // Nad nejvyšším sloupcem musí zbýt místo na popisek s hodnotou.
  if (top < max * 1.08) top += step;
  const ticks: number[] = [];
  for (let tick = step; tick < top; tick += step) ticks.push(tick);
  return { max: top, ticks };
}
