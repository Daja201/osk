import { z } from "zod";
import type { WeatherMetricKey } from "./weatherStations";

const WeatherPointSchema = z.object({
  point: z.object({
    time: z.string().refine((value) => !Number.isNaN(Date.parse(value))),
    value: z.number().finite(),
  }),
});

const WeatherMeasurementSchema = z.object({
  key: z.string(),
  name: z.string(),
  unit: z.string(),
  values: z.array(WeatherPointSchema),
});

const WeatherRowSchema = z.object({
  source_identifier: z.string(),
  object_name: z.string(),
  measurements: z.array(WeatherMeasurementSchema),
});

export const WeatherResponseSchema = z.object({
  results: z.array(WeatherRowSchema),
});

export type CitiqWeatherPoint = z.infer<typeof WeatherPointSchema>;
export type CitiqWeatherMeasurement = z.infer<typeof WeatherMeasurementSchema>;
export type CitiqWeatherRow = z.infer<typeof WeatherRowSchema>;
export type CitiqWeatherRows = z.infer<typeof WeatherResponseSchema>;

export function parseWeatherResponse(data: unknown): CitiqWeatherRows {
  return WeatherResponseSchema.parse(data);
}

export function findWeatherRow(data: CitiqWeatherRows, uuid: string): CitiqWeatherRow | null {
  return data.results.find((row) => row.source_identifier === uuid) ?? null;
}

export function weatherMeasurement(
  row: CitiqWeatherRow | null,
  key: WeatherMetricKey,
): CitiqWeatherMeasurement | null {
  return row?.measurements.find((measurement) => measurement.key === `${key}_mean`) ?? null;
}
