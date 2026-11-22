import type { AnalyticsSeriesOk, SeriesDisplayOk } from "./display";
import type { SeriesParams, SeriesResult } from "./series";
import type { WeatherSeriesParams, WeatherSeriesResult } from "./weatherSeries";

export type CombinedSeriesParams = {
  gates: string[];
  combineGates: boolean;
  direction: "in" | "out" | "both";
  stations: string[];
  metrics: WeatherSeriesParams["metrics"];
  from: string;
  to: string;
  dates?: string[];
  granularity: "hour" | "day" | "total";
};

export type CombinedSeriesResult = AnalyticsSeriesOk | { ok: false; error: { code: string; message: string; suggestions: string[] } };

const fail = (code: string, message: string): CombinedSeriesResult => ({
  ok: false,
  error: { code, message, suggestions: [] },
});

export async function combinedSeries(
  params: CombinedSeriesParams,
  traffic: (params: SeriesParams) => Promise<SeriesResult>,
  weather: (params: WeatherSeriesParams) => Promise<WeatherSeriesResult>,
): Promise<CombinedSeriesResult> {
  const [trafficResult, weatherResult] = await Promise.all([
    traffic({
      gates: params.gates,
      combineGates: params.combineGates,
      direction: params.direction,
      from: params.from,
      to: params.to,
      ...(params.dates?.length ? { dates: params.dates } : {}),
      granularity: params.granularity,
    }),
    weather({
      stations: params.stations,
      metrics: params.metrics,
      from: params.from,
      to: params.to,
      ...(params.dates?.length ? { dates: params.dates } : {}),
      granularity: params.granularity,
    }),
  ]);
  if (!trafficResult.ok) return trafficResult;
  if (!weatherResult.ok) return fail(weatherResult.code, weatherResult.message);
  if (
    trafficResult.meta.period.start !== weatherResult.meta.period.start ||
    trafficResult.meta.period.end !== weatherResult.meta.period.end ||
    trafficResult.data.buckets.length !== weatherResult.data.buckets.length ||
    trafficResult.data.buckets.some(
      (bucket, index) =>
        bucket.start !== weatherResult.data.buckets[index].start || bucket.end !== weatherResult.data.buckets[index].end,
    )
  ) {
    return fail("DATA_ALIGNMENT", "Dopravní a meteorologická data nemají shodné časové intervaly, proto je nelze bezpečně spojit.");
  }

  const result: SeriesDisplayOk = {
    data: {
      granularity: params.granularity,
      buckets: trafficResult.data.buckets,
      series: [
        ...trafficResult.data.series.map((series) => ({
          ...series,
          unit: "vozidel",
          dataset: "traffic" as const,
          direction: params.direction === "both" ? undefined : params.direction,
        })),
        ...weatherResult.data.series.map((series) => ({ ...series, dataset: "weather" as const })),
      ],
    },
    meta: {
      tool: "combined_series",
      params: {
        gates: params.gates,
        combineGates: params.combineGates,
        direction: params.direction,
        stations: params.stations,
        metrics: params.metrics,
        from: params.from,
        to: params.to,
        ...(params.dates?.length ? { dates: params.dates } : {}),
        granularity: params.granularity,
      },
      period: trafficResult.meta.period,
      sources: [...trafficResult.meta.sources, ...weatherResult.meta.sources],
      notes: [
        ...trafficResult.meta.notes.map((note) => `Doprava: ${note}`),
        ...weatherResult.meta.notes.map((note) => `Počasí: ${note}`),
      ],
    },
  };
  return { ok: true, ...result };
}
