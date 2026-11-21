import { describe, expect, it } from "vitest";
import { findWeatherRow, parseWeatherResponse, weatherMeasurement } from "../lib/citiq/weatherParse";
import { WEATHER_METRICS, WEATHER_STATIONS } from "../lib/citiq/weatherStations";

const uuid = "TMaBoxXbvgezGR4LrQL7cw";
const response = {
  results: [
    {
      source_identifier: uuid,
      object_name: "Tržnice.meteostanice",
      measurements: [
        {
          key: "device_device_frmpayload_data_hih_relh_mean",
          name: "relative humidity",
          unit: "°",
          values: [{ point: { time: "2026-11-19T08:00:00Z", value: 61.5 } }],
        },
      ],
    },
  ],
};

describe("meteorologické odpovědi CITIQ", () => {
  it("validuje body bez direction tagů a najde řadu podle UUID a klíče", () => {
    const parsed = parseWeatherResponse(response);
    const row = findWeatherRow(parsed, uuid);
    expect(weatherMeasurement(row, "device_device_frmpayload_data_hih_relh")?.values[0].point.value).toBe(61.5);
    expect(findWeatherRow(parsed, "unknown")).toBeNull();
  });

  it("používá procenta pro vlhkost bez ohledu na vadnou jednotku metadat", () => {
    expect(WEATHER_METRICS.find((metric) => metric.key === "device_device_frmpayload_data_hih_relh")?.unit).toBe("%");
  });

  it("obsahuje jen deset určených meteostanic", () => {
    expect(WEATHER_STATIONS).toHaveLength(10);
    expect(WEATHER_STATIONS.map((station) => station.nick)).not.toContain("chodník");
  });

  it("odmítne bod s neplatným časem nebo nekonečnou hodnotou", () => {
    expect(() => parseWeatherResponse({ results: [{ ...response.results[0], measurements: [{ ...response.results[0].measurements[0], values: [{ point: { time: "bad", value: 2 } }] }] }] })).toThrow();
    expect(() => parseWeatherResponse({ results: [{ ...response.results[0], measurements: [{ ...response.results[0].measurements[0], values: [{ point: { time: "2026-11-19T08:00:00Z", value: Infinity } }] }] }] })).toThrow();
  });
});
