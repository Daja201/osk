import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CacheEntry } from "../lib/citiq/cache";

vi.mock("../lib/citiq/cache", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/citiq/cache")>();
  return {
    ...actual,
    getCachedDay: vi.fn(),
    getCachedRange: vi.fn(),
  };
});

import { getCachedDay, getCachedRange } from "../lib/citiq/cache";
import { weatherSeries, type WeatherSeriesParams } from "../lib/citiq/weatherSeries";

const NOW = new Date("2026-11-20T18:00:00Z");
const params: WeatherSeriesParams = {
  stations: ["Tržnice.meteostanice"],
  metrics: ["device_device_frmpayload_data_hih_temp"],
  from: "2026-11-19T08:00",
  to: "2026-11-19T11:00",
  granularity: "hour" as const,
};
const entry = (values: number[]): CacheEntry => ({
  fetched_at: "2026-11-20T10:00:00.000Z",
  data: {
    results: [
      {
        source_identifier: "TMaBoxXbvgezGR4LrQL7cw",
        object_name: "Tržnice.meteostanice",
        measurements: [
          {
            key: "device_device_frmpayload_data_hih_temp_mean",
            name: "temperature",
            unit: "°C",
            values: values.map((value, index) => ({
              point: { time: `2026-11-19T${String(index + 8).padStart(2, "0")}:00:00Z`, value },
            })),
          },
        ],
      },
    ],
  },
});

describe("weatherSeries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("loads hourly means and builds the requested station series deterministically", async () => {
    vi.mocked(getCachedDay).mockResolvedValue(entry([10, 0, 20]));
    const result = await weatherSeries(params, { now: NOW });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.series[0].station).toBe("Tržnice.meteostanice");
    expect(result.data.series[0].metric).toBe("device_device_frmpayload_data_hih_temp");
    expect(result.data.series[0].unit).toBe("°C");
    expect(result.data.series[0].values).toEqual([10, 0, 20]);
    expect(result.data.series[0].mean).toBe(10);
    expect(result.data.series[0].coverage).toEqual({ hours: 3, of: 3 });
    expect(getCachedDay).toHaveBeenCalledWith(
      "meteorological-data-olomouc",
      "2026-11-19",
      expect.objectContaining({
        agg_func: "mean",
        window: "1h",
        measurement_keys: ["device_device_frmpayload_data_hih_temp"],
      }),
    );
    expect(result.meta.sources[0].url).toContain("agg_func=mean");
    expect(getCachedRange).not.toHaveBeenCalled();
  });

  it("averages by day and over the full interval, preserving real zeroes", async () => {
    vi.mocked(getCachedDay).mockResolvedValue(entry([10, 0, 20]));
    const daily = await weatherSeries({ ...params, granularity: "day" }, { now: NOW });
    const total = await weatherSeries({ ...params, granularity: "total" }, { now: NOW });

    expect(daily.ok && daily.data.series[0].values).toEqual([10]);
    expect(total.ok && total.data.series[0].values).toEqual([10]);
    expect(total.ok && total.data.series[0].mean).toBe(10);
  });

  it("uses the current-day range cache and clips future hours", async () => {
    vi.mocked(getCachedRange).mockResolvedValue({
      fetched_at: "2026-11-20T18:00:00.000Z",
      data: {
        results: [
          {
            source_identifier: "TMaBoxXbvgezGR4LrQL7cw",
            object_name: "Tržnice.meteostanice",
            measurements: [
              {
                key: "device_device_frmpayload_data_hih_temp_mean",
                name: "temperature",
                unit: "°C",
                values: [
                  { point: { time: "2026-11-20T16:00:00Z", value: 3 } },
                  { point: { time: "2026-11-20T17:00:00Z", value: 4 } },
                ],
              },
            ],
          },
        ],
      },
    });
    const result = await weatherSeries(
      { ...params, from: "2026-11-20T17:00", to: "2026-11-20T20:00" },
      { now: NOW },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.meta.period.clipped).toBe(true);
    expect(getCachedRange).toHaveBeenCalledWith(
      "meteorological-data-olomouc",
      expect.any(Date),
      expect.any(Date),
      expect.objectContaining({ agg_func: "mean" }),
    );
  });

  it("validates station, metric, range and maximum duration before fetching", async () => {
    expect((await weatherSeries({ ...params, stations: ["chodník"] }, { now: NOW })).ok).toBe(false);
    expect((await weatherSeries({ ...params, metrics: ["unknown"] as never }, { now: NOW })).ok).toBe(false);
    expect((await weatherSeries({ ...params, from: "2026-11-19T11:00" }, { now: NOW })).ok).toBe(false);
    expect((await weatherSeries({ ...params, to: "2026-12-21T08:00" }, { now: NOW })).ok).toBe(false);
    expect(getCachedDay).not.toHaveBeenCalled();
  });

  it("keeps missing values null and reports no-data selections", async () => {
    vi.mocked(getCachedDay).mockResolvedValue(entry([]));
    const result = await weatherSeries(params, { now: NOW });
    expect(result).toMatchObject({ ok: false, code: "NO_DATA" });

    vi.mocked(getCachedDay).mockResolvedValue(entry([1, 2, 3]));
    const partial = await weatherSeries({ ...params, stations: ["Tržnice.meteostanice", "Flora.meteostanice"] }, { now: NOW });
    expect(partial.ok).toBe(true);
    if (!partial.ok) return;
    expect(partial.data.series[1].values).toEqual([null, null, null]);
    expect(partial.data.series[1].mean).toBeNull();
  });
});
