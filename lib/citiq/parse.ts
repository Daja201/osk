// Čtení odpovědi CITIQ (view olomouc-traffic-gates) a přiřazení bodů k hodinám.
import type { CitiqParams } from "./client";
import { normalizeGateName } from "./gates";

export const VIEW = "olomouc-traffic-gates";
const MEASUREMENT_KEY_REQUEST = "gate_increment_value"; // posílá se v measurement_keys (bez _sum, jinak CITIQ vrátí [])
const AGG_FUNC = "sum";
const MEASUREMENT_KEY_RESPONSE = `${MEASUREMENT_KEY_REQUEST}_${AGG_FUNC}`; // v odpovědi má klíč příponu _sum
const DIRECTION_TAG = "direction";
export const MS_PER_HOUR = 60 * 60 * 1000;

// Dotaz: hodinové součty, rozdělené podle směru. Stejné parametry jsou v odkazu na zdroj.
export const TRAFFIC_CITIQ_PARAMS = {
  measurement_keys: [MEASUREMENT_KEY_REQUEST],
  window: "1h",
  agg_func: AGG_FUNC,
  group_by_tags: [DIRECTION_TAG],
  format: "json",
} satisfies Omit<CitiqParams, "view" | "start" | "stop">;

// tags.direction "1" = dovnitř (kladné hodnoty), "-1" = ven (záporné). Viz docs/data-notes.md.
const DIRECTION_TAG_VALUE = { in: "1", out: "-1" } as const;

type CitiqValuePoint = {
  point: { time: string; value: number };
  tags: { direction?: string } & Record<string, unknown>;
};
type CitiqMeasurement = { key: string; name: string; unit: string; values: CitiqValuePoint[] };
export type CitiqGateRow = { source_identifier: string; object_name: string; measurements: CitiqMeasurement[] };

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

export function isCitiqGateRows(data: unknown): data is { results: CitiqGateRow[] } {
  return isRecord(data) && Array.isArray(data.results) && data.results.every(isCitiqGateRow);
}

// Brána v odpovědi. Když chybí, senzor ten den nevysílal (CITIQ ji vynechá, nevrátí prázdnou).
export function findGateRow(data: { results: CitiqGateRow[] }, gate: string): CitiqGateRow | null {
  const wanted = normalizeGateName(gate);
  return data.results.find((row) => normalizeGateName(row.object_name) === wanted) ?? null;
}

// Čas bodu je KONEC hodinového okna (docs/data-notes.md, H2): bod v 1:00 = provoz 0:00–1:00.
// Proto ceil(…) - 1: poslední okno dne končí v 23:59:59 (= stop dotazu) a patří do poslední hodiny.
export function hourIndexOf(pointMs: number, dayStartMs: number): number {
  return Math.ceil((pointMs - dayStartMs) / MS_PER_HOUR) - 1;
}

// Hodinové hodnoty jedné brány a jednoho směru za místní den. Hodina bez bodu = null (nikdy 0).
export function hourlyOf(row: CitiqGateRow | null, direction: "in" | "out", dayStartMs: number, hours: number): (number | null)[] {
  const hourly: (number | null)[] = new Array(hours).fill(null);
  const measurement = row?.measurements.find((m) => m.key === MEASUREMENT_KEY_RESPONSE);
  if (!measurement) return hourly;
  for (const { point, tags } of measurement.values) {
    if (tags.direction !== DIRECTION_TAG_VALUE[direction]) continue;
    const index = hourIndexOf(Date.parse(point.time), dayStartMs);
    if (index < 0 || index >= hours) continue; // bod přesně o půlnoci patří předchozímu dni
    hourly[index] = (hourly[index] ?? 0) + Math.abs(point.value);
  }
  return hourly;
}
