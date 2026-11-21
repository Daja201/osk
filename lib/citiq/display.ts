import type { Granularity } from "./series";
import type { WeatherGranularity } from "./weatherSeries";

export type DisplaySeries = {
  gate: string;
  sensors: string[];
  metric?: string;
  values: (number | null)[];
  coverage: { hours: number; of: number };
} & ({ total: number; mean?: never } | { mean: number | null; total?: never });

export type SeriesDisplayOk = {
  data: {
    granularity: Granularity | WeatherGranularity;
    buckets: { label: string; start: string; end: string }[];
    series: DisplaySeries[];
  };
  meta: {
    tool?: "traffic_series" | "weather_series";
    params?: { dates?: string[] };
    period: { start: string; end: string; clipped: boolean };
    sources: { date: string; url: string; fetched_at: string }[];
    notes: string[];
  };
};

export function aggregateValue(series: DisplaySeries): number | null {
  if ("mean" in series && series.mean !== undefined) return series.mean;
  if ("total" in series && series.total !== undefined) return series.total;
  return null;
}

export function isMeanSeries(result: Pick<SeriesDisplayOk, "data">): boolean {
  return result.data.series.some((series) => "mean" in series);
}
