// Počty vozidel pro víc bran a libovolný časový rozsah, po hodinách, po dnech nebo celkem.
// Tohle je jediný výpočet, ze kterého AI vrstva bere čísla. Claude tu nic nepočítá.
import { getCachedDay, getCachedRange, utcStartOfPragueDay } from "./cache";
import { CitiqError, citiqUrl } from "./client";
import { GATE_NAMES, type Gate, MAX_GATES, resolveGate, sensorsOf } from "./gates";
import { type CitiqGateRow, MS_PER_HOUR, TRAFFIC_CITIQ_PARAMS, VIEW, findGateRow, hourlyOf, isCitiqGateRows } from "./parse";

const TIME_ZONE = "Europe/Prague";
export const MAX_DAYS = 31; // cache drží 30 dní, víc najednou nestahujeme

export type Direction = "in" | "out" | "both";
export type Granularity = "hour" | "day" | "total";

// from / to jsou místní (pražský) čas „YYYY-MM-DDTHH:00“, `to` se nezahrnuje. „T24:00“ = půlnoc dalšího dne.
export type SeriesParams = {
  gates: string[];
  direction: Direction;
  from: string;
  to: string;
  granularity: Granularity;
};

// Jeden sloupec / bod grafu. start a end jsou UTC (ISO), label je pro lidi v pražském čase.
export type Bucket = { label: string; start: string; end: string };

export type GateSeries = {
  gate: string; // název místa (brána nebo skupina)
  sensors: string[]; // jednotlivé brány, ze kterých se sčítá
  values: (number | null)[]; // jedna hodnota na bucket; null = žádná data (nikdy 0)
  total: number; // součet všech hodin s daty
  coverage: { hours: number; of: number }; // hodin s daty / hodin v rozsahu
};

export type Source = { date: string; url: string; fetched_at: string };

export type SeriesOk = {
  ok: true;
  data: { granularity: Granularity; buckets: Bucket[]; series: GateSeries[] };
  meta: {
    tool: "traffic_series";
    params: SeriesParams;
    // Skutečně spočítaný rozsah (UTC). Konec se ořízne na poslední celou hodinu, když sahá do budoucnosti.
    period: { start: string; end: string; clipped: boolean };
    sources: Source[]; // přesné dotazy na CITIQ, ze kterých jsou data (jeden na den)
    notes: string[];
  };
};

export type SeriesError = { ok: false; error: { code: string; message: string; suggestions: string[] } };
export type SeriesResult = SeriesOk | SeriesError;

const fail = (code: string, message: string, suggestions: string[] = []): SeriesError => ({
  ok: false,
  error: { code, message, suggestions },
});

// --- pražský čas -------------------------------------------------------------

function pragueDate(ms: number): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE }).format(ms); // YYYY-MM-DD
}

function nextDate(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
}

// „2026-11-19T15:00“ → UTC milisekundy. Hodina se počítá od místní půlnoci (jako hodiny v datech).
function parseLocal(value: string): number | null {
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}):00$/.exec(value);
  if (!match) return null;
  const hour = Number(match[2]);
  if (hour > 24) return null;
  try {
    return utcStartOfPragueDay(match[1]).getTime() + hour * MS_PER_HOUR;
  } catch {
    return null;
  }
}

const timeFormat = new Intl.DateTimeFormat("cs-CZ", { timeZone: TIME_ZONE, hour: "numeric", minute: "2-digit" });
const dayFormat = new Intl.DateTimeFormat("cs-CZ", { timeZone: TIME_ZONE, weekday: "short", day: "numeric", month: "numeric" });

const iso = (ms: number) => new Date(ms).toISOString();

// --- výpočet -----------------------------------------------------------------

// Hodnoty místa (součet jeho senzorů a vybraných směrů) za místní den, po hodinách.
// Hodina je null, jen když nemá data žádný senzor ani směr.
function placeHourly(data: { results: CitiqGateRow[] }, gate: Gate, direction: Direction, dayStart: number, hours: number): (number | null)[] {
  const directions = direction === "both" ? (["in", "out"] as const) : [direction];
  const parts = sensorsOf(gate).flatMap((sensor) => {
    const row = findGateRow(data, sensor);
    return directions.map((d) => hourlyOf(row, d, dayStart, hours));
  });
  return Array.from({ length: hours }, (_, index) => parts.reduce<number | null>((sum, part) => add(sum, part[index]), null));
}

const add = (a: number | null, b: number | null) => (b === null ? a : (a ?? 0) + b);

export async function trafficSeries(params: SeriesParams, options: { now?: Date } = {}): Promise<SeriesResult> {
  const now = (options.now ?? new Date()).getTime();
  const { direction, granularity } = params;

  // 1) Kontrola vstupu
  if (!["in", "out", "both"].includes(direction)) return fail("BAD_PARAMS", 'Směr musí být "in", "out" nebo "both".');
  if (!["hour", "day", "total"].includes(granularity)) return fail("BAD_PARAMS", 'Rozlišení musí být "hour", "day" nebo "total".');
  if (params.gates.length === 0 || params.gates.length > MAX_GATES) {
    return fail("BAD_PARAMS", `Zadejte 1 až ${MAX_GATES} míst.`);
  }
  const gates: Gate[] = [];
  for (const name of params.gates) {
    const gate = resolveGate(name);
    if (!gate) return fail("UNKNOWN_GATE", `Místo „${name}“ neznám.`, GATE_NAMES);
    if (!gates.includes(gate)) gates.push(gate);
  }
  const fromMs = parseLocal(params.from);
  const toMs = parseLocal(params.to);
  if (fromMs === null || toMs === null) return fail("BAD_PARAMS", "Čas musí být ve tvaru YYYY-MM-DDTHH:00 (pražský čas).");
  if (fromMs >= toMs) return fail("BAD_RANGE", "Začátek musí být před koncem.");
  if (toMs - fromMs > MAX_DAYS * 24 * MS_PER_HOUR) return fail("RANGE_TOO_LONG", `Najednou umím nejvýš ${MAX_DAYS} dní.`);

  // Data máme jen za celé uplynulé hodiny.
  const lastFullHour = Math.floor(now / MS_PER_HOUR) * MS_PER_HOUR;
  if (fromMs >= lastFullHour) return fail("FUTURE", "Na budoucnost data nemám. Zkuste se zeptat na hodiny, které už proběhly.");
  const endMs = Math.min(toMs, lastFullHour);
  const clipped = endMs < toMs;

  // 2) Stažení dat po místních dnech (jeden dotaz na CITIQ vrátí všechny brány za den)
  //    a z nich hodiny v rozsahu s hodnotou pro každé místo.
  type Slot = { start: number; date: string; values: (number | null)[] };
  const slots: Slot[] = [];
  const sources: Source[] = [];
  const today = pragueDate(now);
  let dayCount = 0;
  let otherDayLength = false;
  for (let date = pragueDate(fromMs); date <= pragueDate(endMs - 1); date = nextDate(date)) {
    const dayStart = utcStartOfPragueDay(date).getTime();
    const dayEnd = utcStartOfPragueDay(nextDate(date)).getTime();
    const hours = Math.round((dayEnd - dayStart) / MS_PER_HOUR); // 23 / 24 / 25 (změna času)
    // Dnešek je neúplný: ptáme se jen do poslední celé hodiny (cache má pro každou hodinu jiný soubor).
    const stop = date === today ? lastFullHour - 1000 : dayEnd - 1000;
    let entry: { data: unknown; fetched_at: string };
    try {
      entry =
        date === today
          ? await getCachedRange(VIEW, new Date(dayStart), new Date(stop), TRAFFIC_CITIQ_PARAMS)
          : await getCachedDay(VIEW, date, TRAFFIC_CITIQ_PARAMS);
    } catch (error) {
      if (error instanceof CitiqError && error.status === 429) {
        return fail("RATE_LIMIT_ERROR", "Zdroj dat dočasně omezuje počet dotazů. Zkuste to prosím za chvíli.");
      }
      return fail("FETCH_FAILED", error instanceof Error ? error.message : "Data z CITIQ se nepodařilo stáhnout.");
    }
    if (!isCitiqGateRows(entry.data)) return fail("BAD_RESPONSE", "CITIQ vrátil neočekávaný formát dat.");
    sources.push({
      date,
      url: citiqUrl({ view: VIEW, start: iso(dayStart), stop: iso(stop), ...TRAFFIC_CITIQ_PARAMS }),
      fetched_at: entry.fetched_at,
    });
    dayCount += 1;
    if (hours !== 24) otherDayLength = true;

    const data = entry.data;
    const perPlace = gates.map((gate) => placeHourly(data, gate, direction, dayStart, hours));
    for (let index = 0; index < hours; index++) {
      const start = dayStart + index * MS_PER_HOUR;
      if (start >= fromMs && start < endMs) slots.push({ start, date, values: perPlace.map((hourly) => hourly[index]) });
    }
  }

  // 3) Seskupení hodin do bucketů podle rozlišení (hodina / den / celkem).
  const keyOf = (slot: Slot) => (granularity === "hour" ? String(slot.start) : granularity === "day" ? slot.date : "total");
  const labelOf = (slot: Slot) =>
    granularity === "total"
      ? "Celkem"
      : granularity === "day"
        ? dayFormat.format(slot.start)
        : dayCount > 1
          ? `${dayFormat.format(slot.start)} ${timeFormat.format(slot.start)}`
          : timeFormat.format(slot.start);
  const groups: { key: string; label: string; start: number; end: number; slots: Slot[] }[] = [];
  for (const slot of slots) {
    const last = groups[groups.length - 1];
    if (last?.key === keyOf(slot)) {
      last.slots.push(slot);
      last.end = slot.start + MS_PER_HOUR;
    } else {
      groups.push({ key: keyOf(slot), label: labelOf(slot), start: slot.start, end: slot.start + MS_PER_HOUR, slots: [slot] });
    }
  }

  // 4) Výsledek pro každé místo.
  const series: GateSeries[] = gates.map((gate, g) => {
    const hourValues = slots.map((slot) => slot.values[g]);
    return {
      gate: gate.objectName,
      sensors: sensorsOf(gate),
      values: groups.map((group) => group.slots.reduce<number | null>((sum, slot) => add(sum, slot.values[g]), null)),
      total: hourValues.reduce<number>((sum, value) => sum + (value ?? 0), 0),
      coverage: { hours: hourValues.filter((value) => value !== null).length, of: hourValues.length },
    };
  });

  if (series.every((s) => s.coverage.hours === 0)) {
    return fail("NO_DATA", "Senzory na vybraných místech v tomto čase neposlaly žádná data.");
  }

  const notes: string[] = [];
  if (clipped) notes.push(`Rozsah sahal do budoucnosti, data jsou do ${timeFormat.format(endMs)} (poslední celá hodina).`);
  for (const s of series) {
    if (s.coverage.hours === 0) notes.push(`${s.gate}: senzor v tomto čase nevysílal.`);
    else if (s.coverage.hours < s.coverage.of) notes.push(`${s.gate}: chybí data za ${s.coverage.of - s.coverage.hours} h, součet je neúplný.`);
  }
  if (otherDayLength) notes.push("V rozsahu je den se změnou času (23 nebo 25 hodin).");

  return {
    ok: true,
    data: {
      granularity,
      buckets: groups.map((group) => ({ label: group.label, start: iso(group.start), end: iso(group.end) })),
      series,
    },
    meta: {
      tool: "traffic_series",
      params,
      period: { start: iso(fromMs), end: iso(endMs), clipped },
      sources,
      notes,
    },
  };
}
