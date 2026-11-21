import type { AnalyticsSeriesOk, SeriesDisplayOk } from "./display";

const round = (value: number, precision: number) => {
  const scale = 10 ** precision;
  return Math.round((value + Number.EPSILON) * scale) / scale;
};

export type SeriesStatistics = {
  count: number;
  mean: number | null;
  median: number | null;
  min: { label: string; value: number } | null;
  max: { label: string; value: number } | null;
};

export function seriesStatistics(labels: string[], values: (number | null)[]): SeriesStatistics {
  const known = values.flatMap((value, index) => (value === null ? [] : [{ value, label: labels[index] ?? String(index) }]));
  const sorted = known.map(({ value }) => value).sort((a, b) => a - b);
  if (sorted.length === 0) return { count: 0, mean: null, median: null, min: null, max: null };
  const middle = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
  return {
    count: sorted.length,
    mean: round(sorted.reduce((sum, value) => sum + value, 0) / sorted.length, 1),
    median: round(median, 1),
    min: known.reduce((best, item) => (item.value < best.value ? item : best)),
    max: known.reduce((best, item) => (item.value > best.value ? item : best)),
  };
}

const pragueHour = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/Prague",
  hour: "2-digit",
  hourCycle: "h23",
});

export function typicalDayProfile(result: SeriesDisplayOk): AnalyticsSeriesOk {
  if (result.data.granularity !== "hour") throw new Error("Typický den vyžaduje hodinová data.");

  const indexes = Array.from({ length: 24 }, () => [] as number[]);
  result.data.buckets.forEach((bucket, index) => {
    const hour = Number(pragueHour.format(Date.parse(bucket.start)));
    if (Number.isInteger(hour) && hour >= 0 && hour < 24) indexes[hour].push(index);
  });
  const firstBucket = result.data.buckets[0];
  const buckets = indexes.map((bucketIndexes, hour) => {
    const first = bucketIndexes.length > 0 ? result.data.buckets[bucketIndexes[0]] : null;
    const last = bucketIndexes.length > 0 ? result.data.buckets[bucketIndexes.at(-1)!] : null;
    return {
      label: `${hour}:00`,
      start: first?.start ?? firstBucket?.start ?? result.meta.period.start,
      end: last?.end ?? firstBucket?.end ?? result.meta.period.end,
    };
  });

  const series = result.data.series.map((item) => ({
    ...item,
    values: indexes.map((bucketIndexes) => {
      const values = bucketIndexes.flatMap((index) => {
        const value = item.values[index];
        return value === null || value === undefined ? [] : [value];
      });
      return values.length === 0 ? null : round(values.reduce((sum, value) => sum + value, 0) / values.length, 1);
    }),
  }));
  return {
    ok: true,
    ...result,
    data: { ...result.data, granularity: "profile", buckets, series, comparison: undefined },
    meta: { ...result.meta, analysis: { type: "typical_profile" } },
  };
}

export function deriveRatios(
  result: SeriesDisplayOk,
  pairs: { numerator: number; denominator: number }[],
  type: "ratio" | "share",
): AnalyticsSeriesOk {
  const derived = pairs.map(({ numerator, denominator }) => {
    const top = result.data.series[numerator];
    const bottom = result.data.series[denominator];
    if (!top || !bottom) throw new Error("Poměr odkazuje na neexistující řadu.");
    const values = top.values.map((a, index) => {
      const b = bottom.values[index];
      if (a === null || a === undefined || b === null || b === undefined || (type === "ratio" && b === 0)) return null;
      if (type === "share" && a + b === 0) return null;
      return round(type === "ratio" ? a / b : (a / (a + b)) * 100, type === "ratio" ? 2 : 1);
    });
    const valid = values.filter((value): value is number => value !== null);
    const numeratorLabel = top.direction ? `${top.gate} (${top.direction === "in" ? "vjezd" : "výjezd"})` : top.gate;
    const denominatorLabel = bottom.direction ? `${bottom.gate} (${bottom.direction === "in" ? "vjezd" : "výjezd"})` : bottom.gate;
    return {
      gate: type === "ratio" ? `${numeratorLabel} / ${denominatorLabel}` : `${numeratorLabel} / (${numeratorLabel} + ${denominatorLabel})`,
      sensors: [...new Set([...top.sensors, ...bottom.sensors])],
      metric: type,
      unit: type === "ratio" ? "×" : "%",
      values,
      mean: valid.length > 0 ? round(valid.reduce((sum, value) => sum + value, 0) / valid.length, type === "ratio" ? 2 : 1) : null,
      coverage: { hours: valid.length, of: values.length },
    };
  });
  const hasValue = derived.some((series) => series.values.some((value) => value !== null));
  const notes = [...result.meta.notes];
  if (derived.some((series) => series.values.some((value) => value === null))) {
    notes.push("Poměr u neúplných hodin nebo při nulovém jmenovateli není uveden.");
  }
  if (!hasValue) notes.push("Ve vybraném období nelze poměr vypočítat: chybí data nebo je jmenovatel nulový.");
  return {
    ok: true,
    ...result,
    data: { ...result.data, series: derived, comparison: undefined },
    meta: {
      ...result.meta,
      analysis: {
        type,
        numerator: derived[0]?.gate ?? "",
        denominator: result.data.series[pairs[0]?.denominator]?.gate ?? "",
      },
      notes,
    },
  };
}
