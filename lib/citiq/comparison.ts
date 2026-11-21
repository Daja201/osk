export type ComparisonPeriod = { from: string; to: string };

export type ComparisonBasis = "traffic_total" | "traffic_per_hour" | "weather_mean";

export type ComparisonPoint = {
  value: number | null;
  total: number | null;
  perHour: number | null;
  delta: number | null;
  percent: number | null;
  coverage: { hours: number; of: number };
};

export type PeriodComparison = {
  basis: ComparisonBasis;
  baseline: string;
  periods: { label: string; start: string; end: string; durationHours: number }[];
  series: { gate: string; unit: string | null; points: ComparisonPoint[] }[];
};
