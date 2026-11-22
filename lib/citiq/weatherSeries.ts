import { type UncachedDay, getCachedDay, getCachedRange, getUncachedDays, parsePragueDateTime, utcStartOfPragueDay } from "./cache";
import { CitiqError, citiqUrl } from "./client";
import { ZodError } from "zod";
import type { ComparisonPeriod, PeriodComparison } from "./comparison";
import { findWeatherRow, parseWeatherResponse, weatherMeasurement } from "./weatherParse";
import { HIH_RELH_KEY, HIH_TEMP_KEY, resolveWeatherMetric, resolveWeatherStation, stationName, type WeatherMetricKey } from "./weatherStations";
import { validateSelectedDays } from "./selectedDays";

const VIEW = "meteorological-data-olomouc";
const TIME_ZONE = "Europe/Prague";
const MS_PER_HOUR = 60 * 60 * 1000;
const MAX_DAYS = 31;

export type WeatherGranularity = "hour" | "day" | "total" | "period";
export type WeatherSeriesParams = {
  stations: string[];
  metrics: WeatherMetricKey[];
  from: string;
  to: string;
  dates?: string[];
  periods?: ComparisonPeriod[];
  granularity: WeatherGranularity;
};
export type WeatherBucket = { label: string; start: string; end: string };
export type WeatherValueSeries = {
  gate: string;
  sensors: string[];
  station: string;
  metric: WeatherMetricKey;
  unit: string;
  values: (number | null)[];
  mean: number | null;
  coverage: { hours: number; of: number };
};
export type WeatherSeriesData = {
  granularity: WeatherGranularity;
  buckets: WeatherBucket[];
  series: WeatherValueSeries[];
  comparison?: PeriodComparison;
};
export type WeatherSource = { date: string; url: string; fetched_at: string };
export type WeatherSeriesOk = {
  ok: true;
  data: WeatherSeriesData;
  meta: {
    tool: "weather_series";
    params: WeatherSeriesParams;
    period: { start: string; end: string; clipped: boolean };
    sources: WeatherSource[];
    notes: string[];
    analysis?: undefined; // typ analýzy má jen výsledek z lib/citiq/analytics.ts; tady pro jednotný typ
  };
};
export type WeatherSeriesError = { ok: false; code: string; message: string };
export type WeatherSeriesResult = WeatherSeriesOk | WeatherSeriesError;

type WeatherStation = NonNullable<ReturnType<typeof resolveWeatherStation>>;
type Slot = { start: number; date: string; values: (number | null)[]; invalid: boolean[] };

const fail = (code: string, message: string): WeatherSeriesError => ({ ok: false, code, message });
const iso = (ms: number) => new Date(ms).toISOString();

function pragueDate(ms: number): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE }).format(ms);
}

function nextDate(date: string): string {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + 1)).toISOString().slice(0, 10);
}

function parseLocal(value: string): number | null {
  return parsePragueDateTime(value);
}

function hourIndexOf(pointMs: number, dayStartMs: number): number {
  return Math.ceil((pointMs - dayStartMs) / MS_PER_HOUR) - 1;
}

// Hodinové hodnoty jedné veličiny. Hodnota mimo fyzikální rozsah je chyba čidla: místo ní null
// a invalid = true (počítáme ji do poznámky, ne do průměru).
function metricHours(
  row: ReturnType<typeof findWeatherRow>,
  metric: WeatherMetricKey,
  dayStart: number,
  hours: number,
): { values: (number | null)[]; invalid: boolean[] } {
  const values: (number | null)[] = new Array(hours).fill(null);
  const invalid: boolean[] = new Array(hours).fill(false);
  const measurement = weatherMeasurement(row, metric);
  const range = resolveWeatherMetric(metric);
  if (!measurement || !range) return { values, invalid };
  for (const { point } of measurement.values) {
    const index = hourIndexOf(Date.parse(point.time), dayStart);
    if (index < 0 || index >= hours) continue;
    if (point.value < range.min || point.value > range.max) invalid[index] = true;
    else values[index] = point.value;
  }
  // Vlhkost: hodina s chybnou teplotou téhož čidla je chybná i u vlhkosti.
  if (metric === HIH_RELH_KEY) {
    const temperature = metricHours(row, HIH_TEMP_KEY, dayStart, hours);
    temperature.invalid.forEach((bad, index) => {
      if (bad) {
        values[index] = null;
        invalid[index] = true;
      }
    });
  }
  return { values, invalid };
}

// Průměr zaokrouhlený na jedno desetinné místo (čidla víc přesnosti nedávají; 9,460219… °C nikomu nepomůže).
function mean(values: (number | null)[]): number | null {
  const present = values.filter((value): value is number => value !== null);
  return present.length === 0 ? null : Math.round((present.reduce((sum, value) => sum + value, 0) / present.length) * 10) / 10;
}

const timeFormat = new Intl.DateTimeFormat("cs-CZ", { timeZone: TIME_ZONE, hour: "numeric", minute: "2-digit" });
const dayFormat = new Intl.DateTimeFormat("cs-CZ", { timeZone: TIME_ZONE, weekday: "short", day: "numeric", month: "numeric" });

export async function weatherSeries(
  params: WeatherSeriesParams,
  options: { now?: Date } = {},
): Promise<WeatherSeriesResult> {
  const now = (options.now ?? new Date()).getTime();
  if (!["hour", "day", "total"].includes(params.granularity)) return fail("BAD_PARAMS", "Rozlišení musí být hour, day nebo total.");
  if (params.stations.length === 0 || params.metrics.length === 0) return fail("BAD_PARAMS", "Vyberte alespoň jednu stanici a jednu veličinu.");

  const stations: WeatherStation[] = [];
  for (const name of params.stations) {
    const station = resolveWeatherStation(name);
    if (!station) return fail("UNKNOWN_STATION", `Stanici „${name}“ neznám.`);
    if (!stations.some((item) => item.uuid === station.uuid)) stations.push(station);
  }
  const metrics = [...new Set(params.metrics)];
  for (const key of metrics) {
    if (!resolveWeatherMetric(key)) return fail("UNKNOWN_METRIC", `Měřenou veličinu „${key}“ neznám.`);
  }

  const fromMs = parseLocal(params.from);
  const toMs = parseLocal(params.to);
  if (fromMs === null || toMs === null) return fail("BAD_PARAMS", "Čas musí být ve tvaru YYYY-MM-DDTHH:00 (pražský čas).");
  if (fromMs >= toMs) return fail("BAD_RANGE", "Začátek musí být před koncem.");
  if (toMs - fromMs > MAX_DAYS * 24 * MS_PER_HOUR) return fail("RANGE_TOO_LONG", `Najednou umím nejvýš ${MAX_DAYS} dní.`);

  const lastFullHour = Math.floor(now / MS_PER_HOUR) * MS_PER_HOUR;
  if (fromMs >= lastFullHour) return fail("FUTURE", "Na budoucnost data nemám. Zkuste se zeptat na hodiny, které už proběhly.");
  const endMs = Math.min(toMs, lastFullHour);
  const clipped = endMs < toMs;
  const today = pragueDate(now);
  const selection = validateSelectedDays(params.dates, fromMs, toMs, today);
  if (selection.error) return fail(selection.error.code, selection.error.message);
  const selectedDates = selection.dates;
  const slots: Slot[] = [];
  const sources: WeatherSource[] = [];
  // U vlhkosti stahujeme i teplotu téhož čidla (podle ní poznáme poruchu, viz metricHours).
  const requestedKeys: WeatherMetricKey[] = metrics.includes(HIH_RELH_KEY) && !metrics.includes(HIH_TEMP_KEY) ? [...metrics, HIH_TEMP_KEY] : metrics;

  const datesToFetch = selectedDates ?? [];
  if (!selectedDates) {
    for (let date = pragueDate(fromMs); date <= pragueDate(endMs - 1); date = nextDate(date)) datesToFetch.push(date);
  }
  const query = {
    measurement_keys: requestedKeys,
    window: "1h" as const,
    agg_func: "mean",
    format: "json" as const,
  };
  // Dny starší než půl roku (mimo cache) stáhneme najednou po souvislých úsecích, viz getUncachedDays.
  let oldDays: Map<string, UncachedDay>;
  try {
    oldDays = await getUncachedDays(VIEW, datesToFetch, query, new Date(now));
  } catch (error) {
    if (error instanceof CitiqError && error.status === 429) {
      return fail("RATE_LIMIT_ERROR", "Zdroj dat dočasně omezuje počet dotazů. Zkuste to prosím za chvíli.");
    }
    return fail("FETCH_FAILED", error instanceof Error ? error.message : "Data z CITIQ se nepodařilo stáhnout.");
  }
  for (const date of datesToFetch) {
    const dayStart = utcStartOfPragueDay(date).getTime();
    if (dayStart >= endMs) continue;
    const dayEnd = utcStartOfPragueDay(nextDate(date)).getTime();
    const hours = Math.round((dayEnd - dayStart) / MS_PER_HOUR);
    const stop = date === today ? lastFullHour - 1000 : dayEnd - 1000;
    const old = oldDays.get(date);

    let entry: { data: unknown; fetched_at: string };
    try {
      entry =
        old ??
        (date === today
          ? await getCachedRange(VIEW, new Date(dayStart), new Date(stop), query)
          : await getCachedDay(VIEW, date, query));
    } catch (error) {
      if (error instanceof CitiqError && error.status === 429) {
        return fail("RATE_LIMIT_ERROR", "Zdroj dat dočasně omezuje počet dotazů. Zkuste to prosím za chvíli.");
      }
      return fail("FETCH_FAILED", error instanceof Error ? error.message : "Data z CITIQ se nepodařilo stáhnout.");
    }

    let data: ReturnType<typeof parseWeatherResponse>;
    try {
      data = parseWeatherResponse(entry.data);
    } catch (error) {
      if (error instanceof ZodError) return fail("BAD_RESPONSE", "CITIQ vrátil neočekávaný formát meteorologických dat.");
      throw error;
    }
    // Zdroj = skutečný dotaz na CITIQ; u starých dnů jeden společný pro celý úsek (uvedený jednou).
    const url = citiqUrl({ view: VIEW, start: old ? old.start.toISOString() : iso(dayStart), stop: old ? old.stop.toISOString() : iso(stop), ...query });
    if (!sources.some((source) => source.url === url)) sources.push({ date, url, fetched_at: entry.fetched_at });

    const perSelection = stations.flatMap((station) => {
      const row = findWeatherRow(data, station.uuid);
      return metrics.map((metric) => metricHours(row, metric, dayStart, hours));
    });
    for (let index = 0; index < hours; index++) {
      const start = dayStart + index * MS_PER_HOUR;
      if (start >= fromMs && start < endMs) {
        slots.push({ start, date, values: perSelection.map((item) => item.values[index]), invalid: perSelection.map((item) => item.invalid[index]) });
      }
    }
  }

  const keyOf = (slot: Slot) => (params.granularity === "hour" ? String(slot.start) : params.granularity === "day" ? slot.date : "total");
  const dayCount = datesToFetch.filter((date) => utcStartOfPragueDay(date).getTime() < endMs).length;
  const labelOf = (slot: Slot) =>
    params.granularity === "total"
      ? "Průměr"
      : params.granularity === "day"
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

  const invalidHours = new Map<number, number>(); // index řady → kolik hodin čidlo poslalo chybnou hodnotu
  const series: WeatherValueSeries[] = stations.flatMap((station, stationIndex) =>
    metrics.map((metric, metricIndex) => {
      const index = stationIndex * metrics.length + metricIndex;
      const descriptor = resolveWeatherMetric(metric)!;
      const hourly = slots.map((slot) => slot.values[index]);
      invalidHours.set(index, slots.filter((slot) => slot.invalid[index]).length);
      return {
        gate: `${stationName(station.nick)} · ${descriptor.label} (${descriptor.unit})`,
        sensors: [station.uuid],
        station: station.nick,
        metric,
        unit: descriptor.unit,
        values: groups.map((group) => mean(group.slots.map((slot) => slot.values[index]))),
        mean: mean(hourly),
        coverage: { hours: hourly.filter((value) => value !== null).length, of: hourly.length },
      };
    }),
  );
  if (series.every((item) => item.coverage.hours === 0)) {
    if ([...invalidHours.values()].some((count) => count > 0)) {
      return fail("NO_DATA", "Čidla vybraných stanic v tomto čase posílala jen chybné hodnoty (např. 125 °C), proto je neukazujeme.");
    }
    return fail("NO_DATA", "Vybrané meteorologické stanice v tomto čase neposlaly žádná data.");
  }

  const notes: string[] = [];
  if (clipped) notes.push(`Rozsah sahal do budoucnosti, data jsou do ${timeFormat.format(endMs)} (poslední celá hodina).`);
  if (selectedDates) notes.push(`Zahrnujeme jen vybrané dny: ${selectedDates.map((date) => dayFormat.format(utcStartOfPragueDay(date).getTime())).join(", ")}.`);
  series.forEach((item, index) => {
    const invalid = invalidHours.get(index) ?? 0;
    const missing = item.coverage.of - item.coverage.hours - invalid;
    if (item.coverage.hours === 0 && invalid > 0) notes.push(`${item.gate}: čidlo v tomto čase posílalo jen chybné hodnoty.`);
    else if (item.coverage.hours === 0) notes.push(`${item.gate}: stanice v tomto čase nevysílala.`);
    else {
      if (invalid > 0) notes.push(`${item.gate}: ${invalid} h vyřazeno (chybná hodnota čidla), průměr je neúplný.`);
      if (missing > 0) notes.push(`${item.gate}: chybí data za ${missing} h, průměr je neúplný.`);
    }
  });

  return {
    ok: true,
    data: {
      granularity: params.granularity,
      buckets: groups.map((group) => ({ label: group.label, start: iso(group.start), end: iso(group.end) })),
      series,
    },
    meta: {
      tool: "weather_series",
      params: { ...params, ...(selectedDates ? { dates: selectedDates } : {}), stations: stations.map((station) => station.nick), metrics },
      period: { start: iso(fromMs), end: iso(endMs), clipped },
      sources,
      notes,
    },
  };
}
