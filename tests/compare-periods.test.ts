import { describe, expect, it } from "vitest";
import { compareTrafficPeriods, compareWeatherPeriods } from "../lib/citiq/comparePeriods";
import type { ComparisonPeriod } from "../lib/citiq/comparison";
import type { SeriesParams, SeriesResult } from "../lib/citiq/series";
import type { WeatherSeriesParams, WeatherSeriesResult } from "../lib/citiq/weatherSeries";

const periods: ComparisonPeriod[] = [
  { from: "2026-11-17T00:00", to: "2026-11-18T00:00" },
  { from: "2026-11-19T00:00", to: "2026-11-21T00:00" },
  { from: "2026-11-21T00:00", to: "2026-11-22T00:00" },
];

const utcStarts: Record<string, string> = {
  "2026-11-17": "2026-11-16T23:00:00.000Z",
  "2026-11-18": "2026-11-17T23:00:00.000Z",
  "2026-11-19": "2026-11-18T23:00:00.000Z",
  "2026-11-21": "2026-11-20T23:00:00.000Z",
  "2026-11-22": "2026-11-21T23:00:00.000Z",
};

function trafficResult(params: SeriesParams, total: number, hours: number, of: number): SeriesResult {
  const start = utcStarts[params.from.slice(0, 10)];
  const end = utcStarts[params.to.slice(0, 10)];
  if (!start || !end) throw new Error("Missing test period boundary.");
  return {
    ok: true,
    data: {
      granularity: "total",
      buckets: [{ label: "Celkem", start, end }],
      series: [{ gate: "Flora", sensors: ["F1"], values: [hours ? total : null], total, coverage: { hours, of } }],
    },
    meta: {
      tool: "traffic_series",
      params,
      period: { start, end, clipped: false },
      sources: [{ date: params.from.slice(0, 10), url: `https://example.test/${params.from.slice(0, 10)}`, fetched_at: "2026-11-22T10:00:00.000Z" }],
      notes: [],
    },
  };
}

const trafficParams: SeriesParams = {
  gates: ["Flora"],
  direction: "both",
  from: "2026-11-17T00:00",
  to: "2026-11-22T00:00",
  periods,
  granularity: "period",
};

describe("comparison of periods", () => {
  it("compares every traffic period with the first and normalizes different lengths", async () => {
    const calls: SeriesParams[] = [];
    const result = await compareTrafficPeriods(trafficParams, async (params) => {
      calls.push(params);
      if (params.from === periods[0].from) return trafficResult(params, 240, 24, 24);
      if (params.from === periods[1].from) return trafficResult(params, 720, 48, 48);
      return trafficResult(params, 288, 24, 24);
    });

    expect(calls.map(({ from, to, granularity }) => ({ from, to, granularity }))).toEqual(
      periods.map((period) => ({ ...period, granularity: "total" })),
    );
    expect(result).toMatchObject({
      ok: true,
      data: {
        granularity: "period",
        series: [{ values: [10, 15, 12], total: 1248, coverage: { hours: 96, of: 96 } }],
        comparison: {
          basis: "traffic_per_hour",
          series: [{ points: [
            { value: 10, total: 240, perHour: 10, delta: 0, percent: 0 },
            { value: 15, total: 720, perHour: 15, delta: 5, percent: 50 },
            { value: 12, total: 288, perHour: 12, delta: 2, percent: 20 },
          ] }],
        },
      },
    });
    if (!result.ok) throw new Error("comparison should succeed");
    const { seriesCsv } = await import("../lib/csv");
    const { tableTsv } = await import("../lib/ui/export");
    expect(seriesCsv(result)).toContain("Flora — součet (vozidla)");
    expect(seriesCsv(result)).toContain("240;10;0;0;24/24");
    expect(tableTsv(result)).toContain("Flora — rozdíl vs");
    expect(tableTsv(result)).toContain("240\t10\t0\t0\t24/24");
  });

  it("keeps total comparison for equal durations and suppresses percentages for a zero baseline", async () => {
    const equalPeriods = [
      { from: "2026-11-17T00:00", to: "2026-11-18T00:00" },
      { from: "2026-11-18T00:00", to: "2026-11-19T00:00" },
    ];
    const params = { ...trafficParams, to: "2026-11-19T00:00", periods: equalPeriods };
    const result = await compareTrafficPeriods(params, async (period) =>
      trafficResult(period, period.from === equalPeriods[0].from ? 0 : 120, period.from === equalPeriods[0].from ? 0 : 24, 24),
    );

    expect(result).toMatchObject({
      ok: true,
      data: {
        comparison: {
          basis: "traffic_total",
          series: [{ points: [
            { value: null, total: null, perHour: null, delta: null, percent: null },
            { value: 120, total: 120, perHour: 5, delta: null, percent: null },
          ] }],
        },
      },
    });
  });

  it("rejects overlapping or oversized comparisons before fetching", async () => {
    let calls = 0;
    const run = async (params: SeriesParams) => {
      calls++;
      return trafficResult(params, 1, 1, 1);
    };
    const overlapping = await compareTrafficPeriods(
      { ...trafficParams, to: "2026-11-19T00:00", periods: [periods[0], { from: "2026-11-17T12:00", to: "2026-11-19T00:00" }] },
      run,
    );
    const oversized = await compareTrafficPeriods(
      {
        ...trafficParams,
        from: "2026-11-01T00:00",
        to: "2026-12-05T00:00",
        periods: [
          { from: "2026-11-01T00:00", to: "2026-11-02T00:00" },
          { from: "2026-12-04T00:00", to: "2026-12-05T00:00" },
        ],
      },
      run,
    );

    expect(overlapping).toMatchObject({ ok: false, error: { code: "BAD_RANGE" } });
    expect(oversized).toMatchObject({ ok: false, error: { code: "RANGE_TOO_LONG" } });
    expect(calls).toBe(0);
  });

  it("compares weather means by absolute difference, not percentage", async () => {
    const weatherPeriods = periods.slice(0, 2);
    const params: WeatherSeriesParams = {
      stations: ["Tržnice.meteostanice"],
      metrics: ["device_device_frmpayload_data_hih_temp"],
      from: weatherPeriods[0].from,
      to: weatherPeriods[1].to,
      periods: weatherPeriods,
      granularity: "period",
    };
    const result = await compareWeatherPeriods(params, async (period): Promise<WeatherSeriesResult> => {
      const start = utcStarts[period.from.slice(0, 10)];
      const end = utcStarts[period.to.slice(0, 10)];
      if (!start || !end) throw new Error("Missing test period boundary.");
      const mean = period.from === weatherPeriods[0].from ? 10 : 12;
      return {
        ok: true,
        data: {
          granularity: "total",
          buckets: [{ label: "Průměr", start, end }],
          series: [{
            gate: "Tržnice · teplota (°C)",
            station: "Tržnice",
            metric: "device_device_frmpayload_data_hih_temp",
            unit: "°C",
            sensors: ["S1"],
            values: [mean],
            mean,
            coverage: { hours: 24, of: 24 },
          }],
        },
        meta: {
          tool: "weather_series",
          params: period,
          period: { start, end, clipped: false },
          sources: [{ date: period.from.slice(0, 10), url: `https://example.test/${period.from.slice(0, 10)}`, fetched_at: "2026-11-22T10:00:00.000Z" }],
          notes: [],
        },
      };
    });

    expect(result).toMatchObject({
      ok: true,
      data: {
        series: [{ values: [10, 12], mean: 11 }],
        comparison: {
          basis: "weather_mean",
          series: [{ unit: "°C", points: [
            { value: 10, delta: 0, percent: null },
            { value: 12, delta: 2, percent: null },
          ] }],
        },
      },
    });
  });
});
