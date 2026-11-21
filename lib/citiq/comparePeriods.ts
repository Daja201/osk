import { formatPeriod } from "../ai/dates";
import { parsePragueDateTime } from "./cache";
import type { ComparisonPeriod, ComparisonPoint, PeriodComparison } from "./comparison";
import { MAX_DAYS, type SeriesParams, type SeriesResult, type SeriesOk } from "./series";
import type { WeatherSeriesParams, WeatherSeriesResult, WeatherSeriesOk } from "./weatherSeries";

const HOUR_MS = 60 * 60 * 1000;
const MAX_PERIODS = 12;

type PeriodError = { code: string; message: string };
type ValidatedPeriods = { periods: { input: ComparisonPeriod; from: number; to: number; durationHours: number }[]; error: null } | { periods: null; error: PeriodError };

function validatePeriods(
  periods: ComparisonPeriod[] | undefined,
  from: string,
  to: string,
  dates: string[] | undefined,
): ValidatedPeriods {
  if (!periods?.length) return { periods: null, error: { code: "BAD_PARAMS", message: "Pro srovnání zadejte alespoň dvě období." } };
  if (periods.length < 2 || periods.length > MAX_PERIODS) {
    return { periods: null, error: { code: "BAD_PARAMS", message: `Srovnání vyžaduje 2 až ${MAX_PERIODS} období.` } };
  }
  if (dates?.length) return { periods: null, error: { code: "BAD_PARAMS", message: "Nesouvislé vybrané dny nelze kombinovat se srovnávacími obdobími." } };

  const fromMs = parsePragueDateTime(from);
  const toMs = parsePragueDateTime(to);
  if (fromMs === null || toMs === null) {
    return { periods: null, error: { code: "BAD_PARAMS", message: "Čas musí být ve tvaru YYYY-MM-DDTHH:00 (pražský čas)." } };
  }
  if (fromMs >= toMs) return { periods: null, error: { code: "BAD_RANGE", message: "Začátek musí být před koncem." } };
  if (toMs - fromMs > MAX_DAYS * 24 * HOUR_MS) {
    return { periods: null, error: { code: "RANGE_TOO_LONG", message: `Srovnávaná období se musí vejít do rozsahu ${MAX_DAYS} dní.` } };
  }

  const validated: { input: ComparisonPeriod; from: number; to: number; durationHours: number }[] = [];
  for (const period of periods) {
    const periodFrom = parsePragueDateTime(period.from);
    const periodTo = parsePragueDateTime(period.to);
    if (periodFrom === null || periodTo === null) {
      return { periods: null, error: { code: "BAD_PARAMS", message: "Časy období musí být ve tvaru YYYY-MM-DDTHH:00 (pražský čas)." } };
    }
    if (periodFrom >= periodTo) return { periods: null, error: { code: "BAD_RANGE", message: "Začátek každého období musí být před jeho koncem." } };
    if (periodFrom < fromMs || periodTo > toMs) {
      return { periods: null, error: { code: "BAD_RANGE", message: "Každé srovnávané období musí ležet v rozsahu from/to." } };
    }
    const previous = validated.at(-1);
    if (previous && periodFrom < previous.to) {
      return { periods: null, error: { code: "BAD_RANGE", message: "Období zadejte chronologicky a bez překryvu." } };
    }
    validated.push({ input: period, from: periodFrom, to: periodTo, durationHours: (periodTo - periodFrom) / HOUR_MS });
  }
  if (validated[0].from !== fromMs || validated.at(-1)?.to !== toMs) {
    return { periods: null, error: { code: "BAD_RANGE", message: "from/to musí vymezovat celé srovnání od začátku prvního do konce posledního období." } };
  }
  return { periods: validated, error: null };
}

function round(value: number, precision: number): number {
  const scale = 10 ** precision;
  return Math.round((value + Number.EPSILON) * scale) / scale;
}

function trafficComparison(
  periodResults: SeriesOk[],
  durations: number[],
): { points: Map<string, ComparisonPoint[]>; comparison: PeriodComparison } {
  const baselineLabel = formatPeriod(periodResults[0].meta.period.start, periodResults[0].meta.period.end);
  const periods = periodResults.map((result, index) => ({
    label: formatPeriod(result.meta.period.start, result.meta.period.end),
    start: result.meta.period.start,
    end: result.meta.period.end,
    durationHours: durations[index],
  }));
  const basis = new Set(durations).size > 1 ? "traffic_per_hour" : "traffic_total";
  const pointsByGate = new Map<string, ComparisonPoint[]>();
  const comparisonSeries = periodResults[0].data.series.map((first) => {
    const points = periodResults.map((result) => {
      const current = result.data.series.find((item) => item.gate === first.gate);
      if (!current) throw new Error(`Místo „${first.gate}“ chybí ve výsledku jednoho období.`);
      const total = current.coverage.hours > 0 ? current.total : null;
      const perHour = total === null ? null : round(total / current.coverage.hours, 2);
      return { total, perHour, coverage: current.coverage };
    });
    const baseline = basis === "traffic_per_hour" ? points[0].perHour : points[0].total;
    const comparisonPoints = points.map((point) => {
      const value = basis === "traffic_per_hour" ? point.perHour : point.total;
      const delta = value === null || baseline === null ? null : round(value - baseline, basis === "traffic_per_hour" ? 2 : 0);
      return {
        value,
        total: point.total,
        perHour: point.perHour,
        delta,
        percent: value === null || baseline === null || baseline === 0 ? null : round(((value - baseline) / Math.abs(baseline)) * 100, 1),
        coverage: point.coverage,
      };
    });
    pointsByGate.set(first.gate, comparisonPoints);
    return { gate: first.gate, unit: "vozidel", points: comparisonPoints };
  });
  return {
    points: pointsByGate,
    comparison: { basis, baseline: baselineLabel, periods, series: comparisonSeries },
  };
}

export async function compareTrafficPeriods(
  params: SeriesParams,
  run: (params: SeriesParams) => Promise<SeriesResult>,
): Promise<SeriesResult> {
  const validated = validatePeriods(params.periods, params.from, params.to, params.dates);
  if (validated.error) return { ok: false, error: { ...validated.error, suggestions: [] } };

  const results: SeriesOk[] = [];
  for (const period of validated.periods) {
    const result = await run({
      gates: params.gates,
      direction: params.direction,
      from: period.input.from,
      to: period.input.to,
      granularity: "total",
    });
    if (!result.ok) return result;
    results.push(result);
  }

  const comparison = trafficComparison(results, validated.periods.map((period) => period.durationHours));
  const labels = comparison.comparison.periods;
  const base = results[0];
  const series = base.data.series.map((first) => {
    const points = comparison.points.get(first.gate)!;
    const hours = points.reduce((sum, point) => sum + point.coverage.hours, 0);
    const of = points.reduce((sum, point) => sum + point.coverage.of, 0);
    return {
      ...first,
      values: points.map((point) => point.value),
      total: points.reduce((sum, point) => sum + (point.total ?? 0), 0),
      coverage: { hours, of },
    };
  });
  const sources = [...new Map(results.flatMap((result) => result.meta.sources).map((source) => [source.url, source])).values()];
  const notes = results.flatMap((result, index) => result.meta.notes.map((note) => `${labels[index].label}: ${note}`));
  if (comparison.comparison.basis === "traffic_per_hour") {
    notes.unshift("Období mají rozdílnou délku; porovnáváme průměrný počet vozidel na dostupnou hodinu. Součty jsou uvedené zvlášť.");
  }
  if (series.some((item) => item.coverage.hours < item.coverage.of)) {
    notes.push("Průměr na hodinu vychází jen z hodin, kdy senzor posílal data; chybějící hodiny nedoplňujeme.");
  }

  return {
    ok: true,
    data: {
      granularity: "period",
      buckets: labels.map(({ label, start, end }) => ({ label, start, end })),
      series,
      comparison: comparison.comparison,
    },
    meta: {
      tool: "traffic_series",
      params: {
        gates: params.gates,
        direction: params.direction,
        from: params.from,
        to: params.to,
        periods: validated.periods.map(({ input }) => input),
        granularity: "period",
      },
      period: { start: base.meta.period.start, end: results.at(-1)!.meta.period.end, clipped: results.some((result) => result.meta.period.clipped) },
      sources,
      notes,
    },
  };
}

export async function compareWeatherPeriods(
  params: WeatherSeriesParams,
  run: (params: WeatherSeriesParams) => Promise<WeatherSeriesResult>,
): Promise<WeatherSeriesResult> {
  const validated = validatePeriods(params.periods, params.from, params.to, params.dates);
  if (validated.error) return { ok: false, ...validated.error };

  const results: WeatherSeriesOk[] = [];
  for (const period of validated.periods) {
    const result = await run({
      stations: params.stations,
      metrics: params.metrics,
      from: period.input.from,
      to: period.input.to,
      granularity: "total",
    });
    if (!result.ok) return result;
    results.push(result);
  }

  const labels = results.map((result) => ({
    label: formatPeriod(result.meta.period.start, result.meta.period.end),
    start: result.meta.period.start,
    end: result.meta.period.end,
    durationHours: (Date.parse(result.meta.period.end) - Date.parse(result.meta.period.start)) / HOUR_MS,
  }));
  const first = results[0];
  const comparisonSeries = first.data.series.map((baseSeries, index) => {
    const means = results.map((result) => result.data.series[index]?.mean ?? null);
    const baseline = means[0];
    const points = means.map((value, periodIndex) => ({
      value,
      total: null,
      perHour: null,
      delta: value === null || baseline === null ? null : round(value - baseline, 1),
      percent: null,
      coverage: results[periodIndex].data.series[index].coverage,
    }));
    return { gate: baseSeries.gate, unit: baseSeries.unit, points };
  });
  const comparison: PeriodComparison = {
    basis: "weather_mean",
    baseline: labels[0].label,
    periods: labels,
    series: comparisonSeries,
  };
  const series = first.data.series.map((baseSeries, index) => {
    const values = comparisonSeries[index].points.map((point) => point.value);
    const hours = comparisonSeries[index].points.reduce((sum, point) => sum + point.coverage.hours, 0);
    const of = comparisonSeries[index].points.reduce((sum, point) => sum + point.coverage.of, 0);
    const weighted = comparisonSeries[index].points.reduce((sum, point) => sum + (point.value ?? 0) * point.coverage.hours, 0);
    return {
      ...baseSeries,
      values,
      mean: hours > 0 ? round(weighted / hours, 1) : null,
      coverage: { hours, of },
    };
  });
  const sources = [...new Map(results.flatMap((result) => result.meta.sources).map((source) => [source.url, source])).values()];
  const notes = results.flatMap((result, index) => result.meta.notes.map((note) => `${labels[index].label}: ${note}`));

  return {
    ok: true,
    data: {
      granularity: "period",
      buckets: labels.map(({ label, start, end }) => ({ label, start, end })),
      series,
      comparison,
    },
    meta: {
      tool: "weather_series",
      params: {
        stations: params.stations,
        metrics: params.metrics,
        from: params.from,
        to: params.to,
        periods: validated.periods.map(({ input }) => input),
        granularity: "period",
      },
      period: { start: first.meta.period.start, end: results.at(-1)!.meta.period.end, clipped: results.some((result) => result.meta.period.clipped) },
      sources,
      notes,
    },
  };
}
