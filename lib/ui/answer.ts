// Z odpovědi /api/ask připraví údaje pro stránku. Nic se tu nestahuje ani nepočítá z AI,
// jen se přeskupí to, co spočítal náš kód (součet, hodiny), do tvaru pro zobrazení.
import { GATES } from "../ai/gates";
import { TrafficCountInput } from "../ai/tools";
import type { AskAnswer, TrafficResultOk } from "../ai/types";
import { formatDayLong, formatHourRange } from "./format";

export type View = "answer" | "out_of_scope" | "error" | "unknown";

export function viewOf(answer: AskAnswer): View {
  if (answer.kind === "answer" && answer.result?.ok) return "answer";
  const code = answer.reason?.code;
  if (code === "OUT_OF_SCOPE") return "out_of_scope";
  if (code === "SOURCE_ERROR" || code === "AI_ERROR" || code === "NETWORK_ERROR") return "error";
  return "unknown";
}

export const SCOPE_TEXT = { both: "oba směry dohromady", in: "směr dovnitř", out: "směr ven" } as const;

// Lidský název místa a senzory, ze kterých se počítá. Skupina „17. listopadu (obě brány)“ → „17. listopadu“.
export function placeOf(gate: string): { place: string; sensors: string[] } {
  const known = GATES.find((g) => g.objectName === gate);
  return {
    place: gate.replace(/\s*\(obě brány\)$/, ""),
    sensors: known?.members ?? [gate],
  };
}

type HourValue = { hour: number; value: number };

// Stejné pravidlo jako peakOf v lib/ai/ask.ts: první hodina s nejvyšší hodnotou.
export function peakOf(hourly: (number | null)[]): HourValue | null {
  let peak: HourValue | null = null;
  hourly.forEach((value, hour) => {
    if (value !== null && (peak === null || value > peak.value)) peak = { hour, value };
  });
  return peak;
}

export function lowOf(hourly: (number | null)[]): HourValue | null {
  let low: HourValue | null = null;
  hourly.forEach((value, hour) => {
    if (value !== null && (low === null || value < low.value)) low = { hour, value };
  });
  return low;
}

// Popis období pro dodatkovou tabulku: „čtvrtek 19. 11. 2026“ nebo „… 2026, 6:00–10:00“.
export function periodText(facts: Facts): string {
  const day = formatDayLong(facts.date);
  return facts.range ? `${day}, ${facts.range.from}:00–${facts.range.to}:00` : day;
}

// Souvislé úseky chybějících hodin: [null, null] od 3 → { from: 3, to: 5 }
export function missingRanges(hourly: (number | null)[]): { from: number; to: number }[] {
  const ranges: { from: number; to: number }[] = [];
  hourly.forEach((value, hour) => {
    if (value !== null) return;
    const last = ranges[ranges.length - 1];
    if (last && last.to === hour) last.to = hour + 1;
    else ranges.push({ from: hour, to: hour + 1 });
  });
  return ranges;
}

export function rangeText(range: { from: number; to: number }): string {
  return `mezi ${range.from}:00 a ${range.to}:00`;
}

export type Facts = {
  // Zobrazené hodiny [from, to). Bez rozsahu celý den (0 až počet hodin dne).
  from: number;
  to: number;
  // Rozsah hodin, když se otázka ptala jen na část dne („mezi 6 a 10“), jinak null.
  range: { from: number; to: number } | null;
  place: string;
  sensors: string[];
  direction: keyof typeof SCOPE_TEXT;
  scope: string;
  date: string;
  hourly: (number | null)[];
  total: number;
  peak: HourValue | null;
  low: HourValue | null;
  coverage: { hours: number; of: number };
  missing: { from: number; to: number }[];
  fetchedAt: string;
  sourceUrl: string;
  notes: string[];
  // Čísla, která náš kód spočítal a která se ve větě podtrhnou.
  verified: number[];
  // Upozornění pro občany pod tabulí (technické poznámky z dat jdou jen na /jak-to-vime).
  warnings: string[];
};

export function factsOf(result: TrafficResultOk): Facts {
  const { gate, direction, date, hour_from, hour_to } = result.meta.params;
  const { hourly, total } = result.data;
  const { place, sensors } = placeOf(gate);
  const range = hour_from !== undefined || hour_to !== undefined ? { from: hour_from ?? 0, to: hour_to ?? 24 } : null;
  const from = range?.from ?? 0;
  const to = Math.min(range?.to ?? hourly.length, hourly.length);
  // Hodiny mimo rozsah jsou v datech null, ale nechybí, jen o ně nikdo nežádal. Proto je vynecháme.
  const inRange = hourly.map((value, hour) => (hour >= from && hour < to ? value : null));
  const peak = peakOf(inRange);
  const low = lowOf(inRange);
  const missing = missingRanges(hourly.slice(from, to)).map((r) => ({ from: r.from + from, to: r.to + from }));
  const coverage = result.meta.coverage;

  const verified = [total, coverage.hours, coverage.of, coverage.of - coverage.hours];
  if (peak) verified.push(peak.value, peak.hour, peak.hour + 1);
  if (low) verified.push(low.value);
  if (range) verified.push(range.from, range.to);

  const warnings: string[] = [];
  if (missing.length > 0) {
    const ranges = missing.map(rangeText).join(" a ");
    warnings.push(`Senzory nevysílaly ${ranges}. Součet za den je proto neúplný.`);
  }
  warnings.push(...result.meta.notes.filter((note) => note.includes("změně času")));

  return {
    from,
    to,
    range,
    place,
    sensors,
    direction,
    scope: SCOPE_TEXT[direction],
    date,
    hourly,
    total,
    peak,
    low,
    coverage,
    missing,
    fetchedAt: result.meta.fetched_at,
    sourceUrl: result.meta.source_url,
    notes: result.meta.notes,
    verified,
    warnings,
  };
}

// Co AI vybrala: vstup nástroje z trace (ověřený stejným Zod schématem jako v lib/ai).
export function toolCallOf(answer: AskAnswer): TrafficCountInput | null {
  const step = answer.trace.steps.find((s) => s.type === "tool");
  if (!step || step.type !== "tool") return null;
  const parsed = TrafficCountInput.safeParse(step.input);
  return parsed.success ? parsed.data : null;
}

export function checkOf(answer: AskAnswer) {
  const step = answer.trace.steps.find((s) => s.type === "check");
  return step && step.type === "check" ? step : null;
}

// Časy kroků: 1. volání modelu = výběr výpočtu, nástroj = výpočet, 2. volání = věta.
export function timingsOf(answer: AskAnswer) {
  const models = answer.trace.steps.filter((s) => s.type === "model");
  const tool = answer.trace.steps.find((s) => s.type === "tool");
  return {
    choose: models[0]?.ms ?? null,
    compute: tool && tool.type === "tool" ? tool.ms : null,
    write: models[1]?.ms ?? null,
    total: answer.trace.total_ms,
    modelCalls: models.length,
  };
}

// „claude-haiku-5-5“ → „Claude Haiku 5.5“
export function modelName(id: string): string {
  const match = id.match(/^claude-([a-z]+)-(\d+)-(\d+)$/);
  if (!match) return id;
  return `Claude ${match[1].charAt(0).toUpperCase()}${match[1].slice(1)} ${match[2]}.${match[3]}`;
}

// Hodinová data jako CSV. Středník a BOM na začátku, aby český Excel správně ukázal sloupce i diakritiku.
// Chybějící hodina je prázdná buňka, ne 0.
export function hourlyCsv(facts: Facts): string {
  const rows = facts.hourly
    .slice(facts.from, facts.to)
    .map((value, i) => `${formatHourRange(facts.from + i)};${value ?? ""}`);
  return "﻿" + ["hodina;počet aut", ...rows].join("\r\n") + "\r\n";
}

// Ukázat graf? Jen když se otázka ptá na průběh nebo na hodinu (graf, po hodinách, kdy, špička…).
// Jinak stačí odpověď slovy. Pravidlo je schválně jednoduché a je v testech.
export function wantsChart(question: string): boolean {
  return /graf|průběh|po hodinách|během dne|hodin|kdy|špičk|nejvíc|nejméně/i.test(question);
}

// Odkud je číslo ve větě: spočítal ho náš kód (who: "code"), vybrala ho AI z otázky ("ai"),
// nebo v datech není ("bad"). `short` je do tabulky kontroly, `long` do vysvětlení po kliknutí.
export type NumberSource = { who: "code" | "ai" | "bad"; short: string; long: string };

type TokenLike = { value: number; kind: "date" | "time" | "number"; text: string };

export function numberSource(
  token: TokenLike,
  facts: Facts | null,
  tool: TrafficCountInput | null,
  notAllowed: number[] = [],
): NumberSource {
  const place = tool ? placeOf(tool.gate).place : (facts?.place ?? null);
  const fromQuestion = "AI ho vybrala z vaší otázky, náš kód s ním jen počítal.";
  const placeSource = (): NumberSource => ({
    who: "ai",
    short: `název místa „${place}“`,
    long: `Je to část názvu místa „${place}“. Místo vybrala AI z vaší otázky.`,
  });
  const dateSource = (): NumberSource => ({
    who: "ai",
    short: "datum",
    long: tool
      ? `Den ${formatDayLong(tool.date)}. ${tool.date_assumed ? "V otázce datum nebylo, AI proto vzala včerejšek." : fromQuestion}`
      : "Datum z odpovědi.",
  });

  if (token.kind === "date") {
    return place && place.includes(token.text.replace(/\s+/g, " ")) ? placeSource() : dateSource();
  }
  const value = token.value;
  if (notAllowed.includes(value)) {
    return {
      who: "bad",
      short: "v datech takové číslo není",
      long: "Tohle číslo v datech není. Proto jsme větu od AI nepoužili a složili ji sami.",
    };
  }
  if (facts) {
    const { total, peak, low, coverage, range, sensors } = facts;
    const period = range ? `za ${range.from}:00–${range.to}:00` : "za celý den";
    const from = `z hodinových dat ${sensors.length > 1 ? `senzorů ${sensors.join(" a ")}` : `senzoru ${sensors[0]}`} (síť CITIQ)`;
    const code = (short: string, long: string): NumberSource => ({ who: "code", short, long });
    if (value === total) {
      const partial = facts.missing.length > 0 ? " Některé hodiny chybí, součet je proto neúplný." : "";
      return code(`součet ${period}`, `Součet ${period}. Sečetl ho náš kód ${from}.${partial}`);
    }
    if (peak && value === peak.value) {
      return code("počet aut v nejrušnější hodině", `Počet aut v nejrušnější hodině (${formatHourRange(peak.hour)}). Našel ho náš kód ${from}.`);
    }
    if (peak && value === peak.hour) {
      return code(`začátek nejrušnější hodiny, ${formatHourRange(peak.hour)}`, `Začátek nejrušnější hodiny. Našel ji náš kód ${from}.`);
    }
    if (peak && value === peak.hour + 1) {
      return code("konec nejrušnější hodiny", `Konec nejrušnější hodiny (${formatHourRange(peak.hour)}). Našel ji náš kód ${from}.`);
    }
    if (low && value === low.value) {
      return code("počet aut v nejklidnější hodině", `Počet aut v nejklidnější hodině (${formatHourRange(low.hour)}). Našel ho náš kód ${from}.`);
    }
    if (value === coverage.of - coverage.hours && value > 0) {
      return code("počet hodin bez dat", "Počet hodin, za které senzory neposlaly data. Spočítal ho náš kód.");
    }
    if (range && (value === range.from || value === range.to)) {
      return { who: "ai", short: "rozsah hodin z otázky", long: `Rozsah hodin ${range.from}:00–${range.to}:00. ${fromQuestion}` };
    }
  }
  if (place && place.match(/\d+/g)?.map(Number).includes(value)) return placeSource();
  if (tool && tool.date.split("-").map(Number).includes(value)) return dateSource();
  return { who: "ai", short: "povolené číslo", long: "Číslo, které napsala AI. Kontrola ho povolila, ale v datech ho přímo nenajdeme." };
}
