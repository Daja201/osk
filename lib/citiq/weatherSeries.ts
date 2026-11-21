import { getCachedDay, getCachedRange, utcStartOfPragueDay } from "./cache";
import { CitiqError, citiqUrl } from "./client";
import { ZodError } from "zod";
import { findWeatherRow, parseWeatherResponse, weatherMeasurement } from "./weatherParse";
import { resolveWeatherMetric, resolveWeatherStation, type WeatherMetricKey } from "./weatherStations";

const VIEW = "meteorological-data-olomouc";
const TIME_ZONE = "Europe/Prague";
const MS_PER_HOUR = 60 * 60 * 1000;
const MAX_DAYS = 31;

export type WeatherGranularity = "hour" | "day" | "total";
export type WeatherSeriesParams = {
  stations: string[];
  metrics: WeatherMetricKey[];
  from: string;
  to: string;
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
  };
};
export type WeatherSeriesError = { ok: false; code: string; message: string };
export type WeatherSeriesResult = WeatherSeriesOk | WeatherSeriesError;

type WeatherStation = NonNullable<ReturnType<typeof resolveWeatherStation>>;
type Slot = { start: number; date: string; values: (number | null)[] };

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
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}):00$/.exec(value);
  if (!match || Number(match[2]) > 24) return null;
  try {
    return utcStartOfPragueDay(match[1]).getTime() + Number(match[2]) * MS_PER_HOUR;
  } catch {
    return null;
  }
}

function hourIndexOf(pointMs: number, dayStartMs: number): number {
  return Math.ceil((pointMs - dayStartMs) / MS_PER_HOUR) - 1;
}

function metricHours(
  row: ReturnType<typeof findWeatherRow>,
  metric: WeatherMetricKey,
  dayStart: number,
  hours: number,
): (number | null)[] {
  const values: (number | null)[] = new Array(hours).fill(null);
  const measurement = weatherMeasurement(row, metric);
  if (!measurement) return values;
  for (const { point } of measurement.values) {
    const index = hourIndexOf(Date.parse(point.time), dayStart);
    if (index >= 0 && index < hours) values[index] = point.value;
  }
  return values;
}

function mean(values: (number | null)[]): number | null {
  const present = values.filter((value): value is number => value !== null);
  return present.length === 0 ? null : present.reduce((sum, value) => sum + value, 0) / present.length;
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
  const slots: Slot[] = [];
  const sources: WeatherSource[] = [];
  const requestedKeys = metrics.map((key) => key);

  for (let date = pragueDate(fromMs); date <= pragueDate(endMs - 1); date = nextDate(date)) {
    const dayStart = utcStartOfPragueDay(date).getTime();
    const dayEnd = utcStartOfPragueDay(nextDate(date)).getTime();
    const hours = Math.round((dayEnd - dayStart) / MS_PER_HOUR);
    const stop = date === today ? lastFullHour - 1000 : dayEnd - 1000;
    const query = {
      measurement_keys: requestedKeys,
      window: "1h" as const,
      agg_func: "mean",
      format: "json" as const,
    };

    let entry: { data: unknown; fetched_at: string };
    try {
      entry =
        date === today
          ? await getCachedRange(VIEW, new Date(dayStart), new Date(stop), query)
          : await getCachedDay(VIEW, date, query);
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
    sources.push({
      date,
      url: citiqUrl({ view: VIEW, start: iso(dayStart), stop: iso(stop), ...query }),
      fetched_at: entry.fetched_at,
    });

    const perSelection = stations.flatMap((station) => {
      const row = findWeatherRow(data, station.uuid);
      return metrics.map((metric) => metricHours(row, metric, dayStart, hours));
    });
    for (let index = 0; index < hours; index++) {
      const start = dayStart + index * MS_PER_HOUR;
      if (start >= fromMs && start < endMs) slots.push({ start, date, values: perSelection.map((values) => values[index]) });
    }
  }

  const keyOf = (slot: Slot) => (params.granularity === "hour" ? String(slot.start) : params.granularity === "day" ? slot.date : "total");
  const labelOf = (slot: Slot) =>
    params.granularity === "total" ? "Průměr" : params.granularity === "day" ? dayFormat.format(slot.start) : timeFormat.format(slot.start);
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

  const series: WeatherValueSeries[] = stations.flatMap((station, stationIndex) =>
    metrics.map((metric, metricIndex) => {
      const index = stationIndex * metrics.length + metricIndex;
      const descriptor = resolveWeatherMetric(metric)!;
      const hourly = slots.map((slot) => slot.values[index]);
      return {
        gate: `${station.nick} · ${descriptor.name} (${descriptor.unit})`,
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
    return fail("NO_DATA", "Vybrané meteorologické stanice v tomto čase neposlaly žádná data.");
  }

  const notes: string[] = [];
  if (clipped) notes.push(`Rozsah sahal do budoucnosti, data jsou do ${timeFormat.format(endMs)} (poslední celá hodina).`);
  for (const item of series) {
    if (item.coverage.hours === 0) notes.push(`${item.gate}: stanice v tomto čase nevysílala.`);
    else if (item.coverage.hours < item.coverage.of) notes.push(`${item.gate}: chybí data za ${item.coverage.of - item.coverage.hours} h, průměr je neúplný.`);
  }

  return {
    ok: true,
    data: {
      granularity: params.granularity,
      buckets: groups.map((group) => ({ label: group.label, start: iso(group.start), end: iso(group.end) })),
      series,
    },
    meta: {
      tool: "weather_series",
      params: { ...params, stations: stations.map((station) => station.nick), metrics },
      period: { start: iso(fromMs), end: iso(endMs), clipped },
      sources,
      notes,
    },
  };
}
