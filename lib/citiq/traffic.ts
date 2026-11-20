import { getCachedDay, utcStartOfPragueDay } from "./cache";
import { CITIQ_BASE } from "./client";

const LOCAL_TIME_ZONE = "Europe/Prague";
const HOURS_IN_DAY = 24;
const VIEW = "olomouc-traffic-gates";
const DIRECTION_TAG = "direction";

const MEASUREMENT_KEY_REQUEST = "gate_increment_value"; // posílá se v measurement_keys
const AGG_FUNC = "sum";
const MEASUREMENT_KEY_RESPONSE = `${MEASUREMENT_KEY_REQUEST}_${AGG_FUNC}`; // "gate_increment_value_sum" v odpovědi

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
  return name
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, ""); // odstraní diakritiku, aby se AI nemusela trefit do háčků/čárek
}

function buildSourceUrl(): string {
  const url = new URL(`${CITIQ_BASE}/${VIEW}/`);
  url.searchParams.set("format", "json");
  url.searchParams.set("window", "1h");
  url.searchParams.set("agg_func", AGG_FUNC);
  url.searchParams.set("measurement_keys", MEASUREMENT_KEY_REQUEST);
  url.searchParams.set("group_by_tags", DIRECTION_TAG);
  return url.toString();
}

export async function trafficCount(params: TrafficCountParams): Promise<TrafficCountResult> {
  const { gate, direction, date } = params;

  const start = utcStartOfPragueDay(date);
  const nextLocalDate = new Date(`${date}T00:00:00.000Z`);
  nextLocalDate.setUTCDate(nextLocalDate.getUTCDate() + 1);
  const nextDayStart = utcStartOfPragueDay(nextLocalDate.toISOString().slice(0, 10));
  const stop = new Date(nextDayStart.getTime() - 1000);

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
    cacheEntry = await getCachedDay(VIEW, date, {
      measurement_keys: [MEASUREMENT_KEY_REQUEST],
      window: "1h",
      agg_func: AGG_FUNC,
      group_by_tags: [DIRECTION_TAG],
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

  const hourly: (number | null)[] = new Array(HOURS_IN_DAY).fill(null);
  let coveredHours = 0;
  let total = 0;

  for (const { point,