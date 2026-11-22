import type { Granularity } from "./series";
import type { WeatherGranularity } from "./weatherSeries";
import type { PeriodComparison } from "./comparison";

export type DisplaySeries = {
  gate: string;
  sensors: string[];
  metric?: string;
  unit?: string;
  dataset?: "traffic" | "weather";
  direction?: "in" | "out";
  values: (number | null)[];
  coverage: { hours: number; of: number };
} & ({ total: number; mean?: never } | { mean: number | null; total?: never });

export type AnalysisInfo =
  | { type: "typical_profile" }
  | { type: "ratio" | "share" | "difference"; numerator: string; denominator: string; percent_difference?: number | null };

export type SeriesDisplayOk = {
  data: {
    granularity: Granularity | WeatherGranularity | "profile";
    buckets: { label: string; start: string; end: string }[];
    series: DisplaySeries[];
    comparison?: PeriodComparison;
  };
  meta: {
    tool?: "traffic_series" | "weather_series" | "combined_series";
    params?: {
      dates?: string[];
      direction?: string;
      gates?: string[];
      combineGates?: boolean;
      stations?: string[];
      metrics?: string[];
      from?: string;
      to?: string;
      granularity?: string;
    };
    analysis?: AnalysisInfo;
    period: { start: string; end: string; clipped: boolean };
    sources: { date: string; url: string; fetched_at: string }[];
    notes: string[];
  };
};

export type AnalyticsSeriesOk = { ok: true } & SeriesDisplayOk;

export function aggregateValue(series: DisplaySeries): number | null {
  if ("mean" in series && series.mean !== undefined) return series.mean;
  if ("total" in series && series.total !== undefined) return series.total;
  return null;
}

export function isMeanSeries(result: Pick<SeriesDisplayOk, "data">): boolean {
  return result.data.series.some((series) => "mean" in series);
}
