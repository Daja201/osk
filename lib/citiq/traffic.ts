import { getCachedDay, utcStartOfPragueDay } from "./cache";
import { CITIQ_BASE } from "./client";

const POSITIVE_SIGN_MEANS_IN = true;

const LOCAL_TIME_ZONE = "Europe/Prague";
const HOURS_IN_DAY = 24;
const VIEW = "olomouc-traffic-gates";
const MEASUREMENT_KEY = "gate_increment_value_sum";

export type TrafficCountParams = {
  gate: string;
  direction: "in" | "out";
  date: string; // YYYY-MM-DD, prague day
};

export type TrafficCountOk = {
  ok: true;
  data: { total: number; hourly: (number | null)[] };
  meta: {
    tool: "traffic_count";
    params: TrafficCountParams;
    period_local: string;
    period_utc: [string, string];
    coverage: { hours: number; of: number };
    source_url: string;
    fetched_at: string;
    notes: string[];
  };
};

export type TrafficCountError = {
  ok: false;
  error: { code: string; message: string; suggestions: string[] };
};

export type TrafficCountResult = TrafficCountOk | TrafficCountError;

type CitiqValuePoint = { point: { time: string; value: number }; tags: Record<string, unknown> };
type CitiqMeasurement = { key: string; name: string; unit: string; values: CitiqValuePoint[] };
type CitiqGateRow = { source_identifier: string; object_name: string; measurements: CitiqMeasurement[] };

function isCitiqGateRows(data: unknown): data is { results: CitiqGateRow[] } {
  if (typeof data !== "object" || data === null || !("results" in data)) return false;
  return Array.isArray((data as { results: unknown }).results);
}

function pragueHourOfDay(isoTimestamp: string): number {
  const formatted = new Intl.DateTimeFormat("en-GB", {
    timeZone: LOCAL_TIME_ZONE,
    hour: "2-digit",
    hourCycle: "h23",
  }).format(new Date(isoTimestamp));
  return Number(formatted);
}

function normalizeGateName(name: string): string {
  return name.trim().toLowerCase();
}

function buildSourceUrl(): string {
  const url = new URL(`${CITIQ_BASE}/${VIEW}/`);
  url.searchParams.set("format", "json");
  url.searchParams.set("window", "1h");
  url.searchParams.set("agg_func", "sum");
  url.searchParams.set("measurement_keys", MEASUREMENT_KEY);
  return url.toString();
}

export async function trafficCount(params: TrafficCountParams): Promise<TrafficCountResult> {
  const { gate, direction, date } = params;

  const start = utcStartOfPragueDay(date);
  const nextLocalDate = new Date(`${date}T00:00:00.000Z`);
  nextLocalDate.setUTCDate(nextLocalDate.getUTCDate() + 1);
  const nextDayStart = utcStartOfPragueDay(nextLocalDate.toISOString().slice(0, 10));
  const stop = new Date(nextDayStart.getTime() - 1000);

  let cacheEntry: { data: unknown; fetched_at: string };
  try {
    cacheEntry = await getCachedDay(VIEW, date, {
      measurement_keys: [MEASUREMENT_KEY],
      window: "1h",
      agg_func: "sum",
      format: "json",
    });
  } catch (error) {
    return {
      ok: false,
      error: {
        code: "FETCH_FAILED",
        message: error instanceof Error ? error.message : "Nepodařilo se stáhnout data z CITIQ.",
        suggestions: [],
      },
    };
  }

  if (!isCitiqGateRows(cacheEntry.data)) {
    return {
      ok: false,
      error: { code: "BAD_RESPONSE", message: "CITIQ vrátil neočekávaný formát dat.", suggestions: [] },
    };
  }

  const gateRow = cacheEntry.data.results.find(
    (row) => normalizeGateName(row.object_name) === normalizeGateName(gate)
  );
  if (!gateRow) {
    return {
      ok: false,
      error: { code: "UNKNOWN_GATE", message: `Brána "${gate}" nebyla v datech nalezena.`, suggestions: [] },
    };
  }

  const measurement = gateRow.measurements.find((m) => m.key === MEASUREMENT_KEY);
  if (!measurement || measurement.values.length === 0) {
    return {
      ok: false,
      error: {
        code: "NO_DATA",
        message: `Čidlo na bráně "${gate}" za ${date} neposlalo žádná data.`,
        suggestions: [],
      },
    };
  }

  const hourly: (number | null)[] = new Array(HOURS_IN_DAY).fill(null);
  let coveredHours = 0;
  let total = 0;
  const wantPositive = direction === "in" ? POSITIVE_SIGN_MEANS_IN : !POSITIVE_SIGN_MEANS_IN;

  for (const { point } of measurement.values) {
    const hourIdx = pragueHourOfDay(point.time);
    if (hourIdx < 0 || hourIdx >= HOURS_IN_DAY) continue;
    coveredHours += 1;
    const matchesDirection = wantPositive ? point.value >= 0 : point.value < 0;
    const contribution = matchesDirection ? Math.abs(point.value) : 0;
    hourly[hourIdx] = (hourly[hourIdx] ?? 0) + contribution;
    total += contribution;
  }

  const notes: string[] = [];
  if (coveredHours < HOURS_IN_DAY) {
    notes.push(`chybí data za ${HOURS_IN_DAY - coveredHours} hodin`);
  }
  notes.push("znaménko = směr je neověřená hypotéza, ověřit s CITIQ (p. Giesl)");

  return {
    ok: true,
    data: { total, hourly },
    meta: {
      tool: "traffic_count",
      params,
      period_local: `${date} 0:00–24:00`,
      period_utc: [start.toISOString(), stop.toISOString()],
      coverage: { hours: coveredHours, of: HOURS_IN_DAY },
      source_url: buildSourceUrl(),
      fetched_at: cacheEntry.fetched_at,
      notes,
    },
  };
}