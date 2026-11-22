// Analýzy (lib/citiq/analytics.ts): poměr a podíl jen přes společné hodiny, celkový poměr = poměr součtů.
import { describe, expect, it } from "vitest";
import { deriveRatios, pairOverCommonHours } from "../lib/citiq/analytics";
import type { SeriesDisplayOk } from "../lib/citiq/display";

const hour = (h: number) => ({ label: `${h}:00`, start: new Date(Date.UTC(2026, 10, 19, h)).toISOString(), end: new Date(Date.UTC(2026, 10, 19, h + 1)).toISOString() });
const series = (gate: string, values: (number | null)[]) => {
  const known = values.filter((v): v is number => v !== null);
  return { gate, sensors: [gate], values, total: known.reduce((a, b) => a + b, 0), coverage: { hours: known.length, of: values.length } };
};
const result = (buckets: ReturnType<typeof hour>[], rows: ReturnType<typeof series>[]): SeriesDisplayOk => ({
  data: { granularity: buckets.length === 1 ? "total" : "hour", buckets, series: rows },
  meta: { tool: "traffic_series", period: { start: buckets[0].start, end: buckets.at(-1)!.end, clipped: false }, sources: [], notes: [] },
});

describe("poměr jen přes společné hodiny", () => {
  it("hodina s daty jen u jednoho místa se do součtu nepočítá (jinak by poměr porovnával různý čas)", () => {
    const hourly = result([hour(8), hour(9), hour(10)], [series("A", [10, 10, 100]), series("B", [20, 20, null])]);
    const total = result([{ label: "Celkem", start: hour(8).start, end: hour(10).end }], [series("A", [120]), series("B", [40])]);
    const paired = pairOverCommonHours(total, hourly, [{ numerator: 0, denominator: 1 }]);
    const ratio = deriveRatios(paired.result, paired.pairs, "ratio");
    // společné hodiny 8 a 9: 20 / 40 = 0,5 (ze součtů 120 / 40 by vyšlo nesmyslných 3)
    expect(ratio.data.series[0]).toMatchObject({ values: [0.5], mean: 0.5 });
    expect(paired.skippedHours).toBe(1);
    expect(ratio.meta.notes.some((note) => note.includes("1 h s daty jen u jedné řady"))).toBe(true);
  });

  it("celkový poměr za víc sloupců = poměr součtů, ne průměr poměrů; podíl v procentech", () => {
    // po sloupcích 0,5 a 3 → průměr poměrů by byl 1,75; správně poměr součtů 100 / 50 = 2
    const other = result([hour(8), hour(9)], [series("A", [10, 90]), series("B", [20, 30])]);
    // podíl: po sloupcích 33,3 % a 66,7 %, celkem 50 / (50 + 40) = 55,6 %
    const days = result([hour(8), hour(9)], [series("A", [10, 40]), series("B", [20, 20])]);
    expect(deriveRatios(other, [{ numerator: 0, denominator: 1 }], "ratio").data.series[0]).toMatchObject({ values: [0.5, 3], mean: 2 });
    expect(deriveRatios(days, [{ numerator: 0, denominator: 1 }], "share").data.series[0]).toMatchObject({ values: [33.3, 66.7], mean: 55.6 });
  });

  it("rozdíl: u počtů rozdíl součtů a o kolik procent víc; u průměrů (počasí) průměr rozdílů", () => {
    const counts = result([hour(8), hour(9)], [series("Billa", [100, 300]), series("Flora", [40, 60])]);
    const diff = deriveRatios(counts, [{ numerator: 0, denominator: 1 }], "difference");
    expect(diff.data.series[0]).toMatchObject({ gate: "Billa − Flora", unit: "vozidel", values: [60, 240], mean: 300 });
    expect(diff.meta.analysis).toMatchObject({ type: "difference", percent_difference: 300 }); // 400 / 100 − 1
    expect(diff.data.series[0]).not.toHaveProperty("percentDifference");

    const temps: SeriesDisplayOk = {
      ...counts,
      data: { ...counts.data, series: [{ ...series("UPOL", [12, 14]), total: undefined, mean: 13, unit: "°C" }, { ...series("Letadlo", [10, 11]), total: undefined, mean: 10.5, unit: "°C" }] },
    } as unknown as SeriesDisplayOk;
    expect(deriveRatios(temps, [{ numerator: 0, denominator: 1 }], "difference").data.series[0]).toMatchObject({ unit: "°C", values: [2, 3], mean: 2.5 });
  });

  it("společné hodiny u průměrů (počasí): ve sloupci průměr, ne součet", () => {
    const temp = (gate: string, values: (number | null)[]) => ({ ...series(gate, values), mean: 0, unit: "°C" });
    const hourly = { ...result([hour(8), hour(9), hour(10)], []), data: { granularity: "hour", buckets: [hour(8), hour(9), hour(10)], series: [temp("UPOL", [12, 14, 99]), temp("Letadlo", [10, 11, null])] } } as unknown as SeriesDisplayOk;
    const total = { ...hourly, data: { ...hourly.data, granularity: "total", buckets: [{ label: "Celkem", start: hour(8).start, end: hour(10).end }] } } as unknown as SeriesDisplayOk;
    const paired = pairOverCommonHours(total, hourly, [{ numerator: 0, denominator: 1 }]);
    expect(paired.result.data.series.map((s) => s.values)).toEqual([[13], [10.5]]);
    expect(deriveRatios(paired.result, paired.pairs, "difference").data.series[0]).toMatchObject({ values: [2.5] });
  });
});
