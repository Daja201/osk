import { getCachedDay, utcStartOfPragueDay } from "./cache";
import { CITIQ_BASE, type CitiqParams } from "./client";

const LOCAL_TIME_ZONE = "Europe/Prague";
const MS_PER_HOUR = 60 * 60 * 1000;
const VIEW = "olomouc-traffic-gates";
const DIRECTION_TAG = "direction";

const MEASUREMENT_KEY_REQUEST = "gate_increment_value"; // posílá se v measurement_keys
const AGG_FUNC = "sum";
const MEASUREMENT_KEY_RESPONSE = `${MEASUREMENT_KEY_REQUEST}_${AGG_FUNC}`; // "gate_increment_value_sum" v odpovědi
export const TRAFFIC_CITIQ_PARAMS = {
  measurement_keys: [MEASUREMENT_KEY_REQUEST],
  window: "1h",
  agg_func: AGG_FUNC,
  group_by_tags: [DIRECTION_TAG],
  format: "json",
} satisfies Omit<CitiqParams, "view" | "start" | "stop">;

// Ověřeno empiricky (20. 11. 2026, brána Parkoviště Flora, group_by_tags=direction):
// hodnoty s tags.direction === "1" jsou vždy kladné, s "-1" vždy záporné.
// Fyzický směr (dovnitř/ven) je týmové rozhodnutí, ne CITIQ-ověřené - ověřit s p. Giesl.
const DIRECTION_TAG_VALUE_FOR_IN = "1";
const DIRECTION_TAG_VALUE_FOR_OUT = "-1";

// Všech 19 bran z olomouc-traffic-gates/metadata/, včetně těch, co aktuálně nevysílají
// (Aksamitova/Vídeňská, Voskovcova) - CITIQ je v results jednoduše vynechá, nevrátí je
// s prázdnými hodnotami. Potřebujeme to pro rozlišení UNKNOWN_GATE vs NO_DATA.
const KNOWN_GATES = [
  "17.listopadu JIH",
  "17.listopadu Sever",
  "Aksamitova/Vídeňská",
  "Billa (Hynaisova)",
  "Fisherova",
  "Fugnerova",
  "Kafkova - levá",
  "Kafkova - pravá",
  "Parkoviště Flora",
  "Peškova",
  "Trnkova/Rooseveltova",
  "Trnkova/Zítkova",
  "Tržnice/Polská",
  "U Letadla",
  "Voskovcova",
  "Zikova",
  "Šmeralova IN",
  "Šmeralova OUT/17.listopadu",
  "Šmeralova OUT/Blahoslavova",
];

export type TrafficCountParams = {
  gate: string;
  direction: "in" | "out";
  date: string; // YYYY-MM-DD, prague day
  hour_from?: number;
  hour_to?: number;
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

type CitiqValuePoint = {
  point: { time: string; value: number };
  tags: { direction?: string } & Record<string, unknown>;
};
type CitiqMeasurement = { key: string; name: string; unit: string; values: CitiqValuePoint[] };
type CitiqGateRow = { source_identifier: string; object_name: string; measurements: CitiqMeasurement[] };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isCitiqValuePoint(value: unknown): value is CitiqValuePoint {
  if (!isRecord(value) || !isRecord(value.point) || !isRecord(value.tags)) return false;
  return (
    typeof value.point.time === "string" &&
    !Number.isNaN(Date.parse(value.point.time)) &&
    typeof value.point.value === "number" &&
    Number.isFinite(value.point.value) &&
    (value.tags.direction === undefined || typeof value.tags.direction === "string")
  );
}

function isCitiqMeasurement(value: unknown): value is CitiqMeasurement {
  return (
    isRecord(value) &&
    typeof value.key === "string" &&
    typeof value.name === "string" &&
    typeof value.unit === "string" &&
    Array.isArray(value.values) &&
    value.values.every(isCitiqValuePoint)
  );
}

function isCitiqGateRow(value: unknown): value is CitiqGateRow {
  return (
    isRecord(value) &&
    typeof value.source_identifier === "string" &&
    typeof value.object_name === "string" &&
    Array.isArray(value.measurements) &&
    value.measurements.every(isCitiqMeasurement)
  );
}

function isCitiqGateRows(data: unknown): data is { results: CitiqGateRow[] } {
  return isRecord(data) && Array.isArray(data.results) && data.results.every(isCitiqGateRow);
}

function normalizeGateName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, ""); // odstraní diakritiku, aby se AI nemusela trefit do háčků/čárek
}

function buildSourceUrl(start: Date, stop: Date): string {
  const url = new URL(`${CITIQ_BASE}/${VIEW}/`);
  url.searchParams.set("format", "json");
  url.searchParams.set("start", start.toISOString());
  url.searchParams.set("stop", stop.toISOString());
  url.searchParams.set("window", "1h");
  url.searchParams.set("agg_func", AGG_FUNC);
  url.searchParams.set("measurement_keys", MEASUREMENT_KEY_REQUEST);
  url.searchParams.set("group_by_tags", DIRECTION_TAG);
  return url.toString();
}

export async function trafficCount(params: TrafficCountParams): Promise<TrafficCountResult> {
  const { gate, direction, date, hour_from, hour_to } = params;

  if (typeof gate !== "string" || !gate.trim()) {
    return {
      ok: false,
      error: { code: "INVALID_PARAMS", message: "Název brány nesmí být prázdný.", suggestions: KNOWN_GATES },
    };
  }
  if (direction !== "in" && direction !== "out") {
    return {
      ok: false,
      error: { code: "INVALID_DIRECTION", message: 'Směr musí být "in" nebo "out".', suggestions: [] },
    };
  }
  if (
    (hour_from !== undefined && (!Number.isInteger(hour_from) || hour_from < 0 || hour_from > 23)) ||
    (hour_to !== undefined && (!Number.isInteger(hour_to) || hour_to < 1 || hour_to > 24)) ||
    (hour_from !== undefined && hour_to !== undefined && hour_from >= hour_to)
  ) {
    return {
      ok: false,
      error: { code: "INVALID_HOUR_RANGE", message: "Neplatný rozsah hodin. hour_from musí být 0–23 a hour_to 1–24.", suggestions: [] },
    };
  }

  let start: Date;
  let nextDayStart: Date;
  try {
    start = utcStartOfPragueDay(date);
    const nextLocalDate = new Date(`${date}T00:00:00.000Z`);
    nextLocalDate.setUTCDate(nextLocalDate.getUTCDate() + 1);
    nextDayStart = utcStartOfPragueDay(nextLocalDate.toISOString().slice(0, 10));
  } catch (error) {
    return {
      ok: false,
      error: {
        code: "INVALID_DATE",
        message: error instanceof Error ? error.message : "Datum musí být platné datum ve formátu YYYY-MM-DD.",
        suggestions: [],
      },
    };
  }
  const stop = new Date(nextDayStart.getTime() - 1000);
  const expectedHours = (nextDayStart.getTime() - start.getTime()) / MS_PER_HOUR;

  const knownGate = KNOWN_GATES.find((g) => normalizeGateName(g) === normalizeGateName(gate));
  if (!knownGate) {
    return {
      ok: false,
      error: {
        code: "UNKNOWN_GATE",
        message: `Brána "${gate}" neexistuje. Dostupné brány: ${KNOWN_GATES.join(", ")}.`,
        suggestions: KNOWN_GATES,
      },
    };
  }

  let cacheEntry: { data: unknown; fetched_at: string };
  try {
    cacheEntry = await getCachedDay(VIEW, date, TRAFFIC_CITIQ_PARAMS);
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
    // Brána existuje (prošla KNOWN_GATES), ale CITIQ ji v results nevrátil -> čidlo nevysílá
    return {
      ok: false,
      error: {
        code: "NO_DATA",
        message: `Čidlo na bráně "${knownGate}" nevysílá - CITIQ pro ni nemá žádná data.`,
        suggestions: [],
      },
    };
  }

  const measurement = gateRow.measurements.find((m) => m.key === MEASUREMENT_KEY_RESPONSE);
  if (!measurement || measurement.values.length === 0) {
    return {
      ok: false,
      error: {
        code: "NO_DATA",
        message: `Čidlo na bráně "${knownGate}" za ${date} neposlalo žádná data.`,
        suggestions: [],
      },
    };
  }

  const wantedTagValue = direction === "in" ? DIRECTION_TAG_VALUE_FOR_IN : DIRECTION_TAG_VALUE_FOR_OUT;

  const hourly: (number | null)[] = new Array(expectedHours).fill(null);
  const startMs = start.getTime();
  let matchedPoints = 0;
  const rangeFrom = hour_from ?? 0;
  const rangeTo = hour_to ?? 24;

  for (const { point, tags } of measurement.values) {
    if (tags.direction !== wantedTagValue) continue;

    const pointMs = Date.parse(point.time);
    if (pointMs < startMs || pointMs >= nextDayStart.getTime()) continue;

    const hourIndex = Math.floor((pointMs - startMs) / MS_PER_HOUR);
    if (hourIndex < rangeFrom || hourIndex >= rangeTo) continue;
    const count = Math.abs(point.value);
    hourly[hourIndex] = (hourly[hourIndex] ?? 0) + count;
    matchedPoints += 1;
  }

  if (matchedPoints === 0) {
    return {
      ok: false,
      error: {
        code: "NO_DATA",
        message: `Čidlo na bráně "${knownGate}" za ${date} neposlalo data pro směr "${direction}".`,
        suggestions: [],
      },
    };
  }

  const total = hourly.reduce<number>((sum, value) => sum + (value ?? 0), 0);
  for (let hour = 0; hour < hourly.length; hour++) {
    if (hour < rangeFrom || hour >= rangeTo) hourly[hour] = null;
  }
  const coveredHours = hourly.slice(rangeFrom, rangeTo).filter((value) => value !== null).length;
  const rangeHours = rangeTo - rangeFrom;
  const notes = [
    `Směr "${direction}" je vybrán podle tags.direction="${wantedTagValue}"; výstupní počty jsou nezáporné.`,
    "Hodiny jsou seřazeny chronologicky od půlnoci v Europe/Prague; chybějící hodiny mají hodnotu null.",
  ];
  if (hour_from !== undefined || hour_to !== undefined) {
    notes.push(`Vybraný časový rozsah je ${rangeFrom}:00–${rangeTo}:00.`);
  }
  if (expectedHours !== 24) {
    notes.push(`Tento místní den má kvůli změně času ${expectedHours} hodinových intervalů.`);
  }

  return {
    ok: true,
    data: { total, hourly },
    meta: {
      tool: "traffic_count",
      params: { gate: knownGate, direction, date, ...(hour_from !== undefined ? { hour_from } : {}), ...(hour_to !== undefined ? { hour_to } : {}) },
      period_local: `${date} (${LOCAL_TIME_ZONE})`,
      period_utc: [start.toISOString(), stop.toISOString()],
      coverage: { hours: coveredHours, of: rangeHours },
      source_url: buildSourceUrl(start, stop),
      fetched_at: cacheEntry.fetched_at,
      notes,
    },
  };
}