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

// Procentní rozdíl patří do popisu analýzy (meta.analysis), ne do uložených řad.
function withoutPercent<T extends { percentDifference: number | null }>(series: T): Omit<T, "percentDifference"> {
  const copy: Partial<T> = { ...series };
  delete copy.percentDifference;
  return copy as Omit<T, "percentDifference">;
}

export function deriveRatios(
  result: SeriesDisplayOk,
  pairs: { numerator: number; denominator: number }[],
  type: "ratio" | "share" | "difference",
): AnalyticsSeriesOk {
  const derived = pairs.map(({ numerator, denominator }) => {
    const top = result.data.series[numerator];
    const bottom = result.data.series[denominator];
    if (!top || !bottom) throw new Error("Poměr odkazuje na neexistující řadu.");
    const values = top.values.map((a, index) => {
      const b = bottom.values[index];
      if (a === null || a === undefined || b === null || b === undefined || (type === "ratio" && b === 0)) return null;
      if (type === "share" && a + b === 0) return null;
      if (type === "difference") return round(a - b, 1);
      return round(type === "ratio" ? a / b : (a / (a + b)) * 100, type === "ratio" ? 2 : 1);
    });
    const valid = values.filter((value): value is number => value !== null);
    // Celkový poměr = poměr součtů (ne průměr poměrů): dny s poměrem 0,5 a 2 nejsou „1,25“.
    let sumTop = 0;
    let sumBottom = 0;
    top.values.forEach((a, index) => {
      const b = bottom.values[index];
      if (a === null || a === undefined || b === null || b === undefined) return;
      sumTop += a;
      sumBottom += b;
    });
    // Rozdíl: u počtů (doprava) rozdíl součtů, u průměrů (počasí) průměr rozdílů po sloupcích.
    const counts = !("mean" in top);
    const overall =
      type === "difference"
        ? counts
          ? round(sumTop - sumBottom, 1)
          : valid.length > 0
            ? round(valid.reduce((sum, value) => sum + value, 0) / valid.length, 1)
            : null
        : type === "ratio"
          ? sumBottom === 0
            ? null
            : round(sumTop / sumBottom, 2)
          : sumTop + sumBottom === 0
            ? null
            : round((sumTop / (sumTop + sumBottom)) * 100, 1);
    // O kolik procent víc / míň (A proti B), spočítané kódem: Claude ho u rozdílu smí napsat.
    // U °C a ° (bez skutečné nuly) procenta nedávají smysl („o 46 % tepleji“), tam je vynecháme.
    const noRatioScale = top.unit === "°C" || top.unit === "°";
    const percentDifference = sumBottom === 0 || noRatioScale ? null : round((sumTop / sumBottom - 1) * 100, 1);
    const numeratorLabel = top.direction ? `${top.gate} (${top.direction === "in" ? "vjezd" : "výjezd"})` : top.gate;
    const denominatorLabel = bottom.direction ? `${bottom.gate} (${bottom.direction === "in" ? "vjezd" : "výjezd"})` : bottom.gate;
    return {
      gate:
        type === "ratio"
          ? `${numeratorLabel} / ${denominatorLabel}`
          : type === "difference"
            ? `${numeratorLabel} − ${denominatorLabel}`
            : `${numeratorLabel} / (${numeratorLabel} + ${denominatorLabel})`,
      sensors: [...new Set([...top.sensors, ...bottom.sensors])],
      metric: type,
      unit: type === "ratio" ? "×" : type === "share" ? "%" : (top.unit ?? "vozidel"),
      percentDifference,
      values,
      mean: valid.length > 0 ? overall : null,
      coverage: { hours: Math.min(top.coverage.hours, bottom.coverage.hours), of: Math.max(top.coverage.of, bottom.coverage.of) },
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
    data: { ...result.data, series: derived.map(withoutPercent), comparison: undefined },
    meta: {
      ...result.meta,
      analysis: {
        type,
        numerator: derived[0]?.gate ?? "",
        denominator: result.data.series[pairs[0]?.denominator]?.gate ?? "",
        ...(type === "difference" ? { percent_difference: derived[0]?.percentDifference ?? null } : {}),
      },
      notes,
    },
  };
}

// Připraví dvojice řad pro poměr tak, aby se porovnávaly jen hodiny, kdy mají data obě řady.
// shape = výsledek v požadovaném rozlišení (sloupce: dny, celkem…), hourly = stejný dotaz po hodinách.
// V každém sloupci se obě řady sečtou jen přes společné hodiny; jinak by poměr porovnával různý čas
// (jedno místo bez 23 hodin, druhé bez 17 → nesmyslný poměr).
export function pairOverCommonHours(
  shape: SeriesDisplayOk,
  hourly: SeriesDisplayOk,
  pairs: { numerator: number; denominator: number }[],
): { result: SeriesDisplayOk; pairs: { numerator: number; denominator: number }[]; skippedHours: number } {
  const bucketOfHour = hourly.data.buckets.map((hour) => {
    const t = Date.parse(hour.start);
    return shape.data.buckets.findIndex((bucket) => t >= Date.parse(bucket.start) && t < Date.parse(bucket.end));
  });
  let skippedHours = 0;
  const series = pairs.flatMap(({ numerator, denominator }) => {
    const top = hourly.data.series[numerator];
    const bottom = hourly.data.series[denominator];
    if (!top || !bottom) throw new Error("Poměr odkazuje na neexistující řadu.");
    const sums = shape.data.buckets.map(() => ({ top: 0, bottom: 0, hours: 0 }));
    let common = 0;
    top.values.forEach((a, hour) => {
      const b = bottom.values[hour];
      const bucket = bucketOfHour[hour];
      if (bucket < 0) return;
      if (a === null || a === undefined || b === null || b === undefined) {
        if (a !== null || b !== null) skippedHours += 1;
        return;
      }
      sums[bucket].top += a;
      sums[bucket].bottom += b;
      sums[bucket].hours += 1;
      common += 1;
    });
    const coverage = { hours: common, of: top.values.length };
    // Počty aut se ve sloupci sčítají, průměry (počasí) se průměrují: 23 hodin po 10 °C není 230 °C.
    const averaged = "mean" in top;
    const values = (side: "top" | "bottom") =>
      sums.map((sum) => (sum.hours === 0 ? null : round(averaged ? sum[side] / sum.hours : sum[side], 1)));
    return [
      { ...top, values: values("top"), coverage },
      { ...bottom, values: values("bottom"), coverage },
    ];
  });
  const result: SeriesDisplayOk = { ...shape, data: { ...shape.data, series } };
  const notes = [...shape.meta.notes];
  if (skippedHours > 0) notes.push(`Výpočet je jen z hodin, kdy měla data obě řady; ${skippedHours} h s daty jen u jedné řady jsme vynechali.`);
  result.meta = { ...shape.meta, notes };
  return { result, pairs: pairs.map((_, index) => ({ numerator: 2 * index, denominator: 2 * index + 1 })), skippedHours };
}
