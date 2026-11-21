export type WeatherStation = { nick: string; uuid: string };

export const WEATHER_STATIONS: WeatherStation[] = [
  { nick: "Fischerova.meteostanice", uuid: "NHxfjGZWyWSTP8a6FLkZJG" },
  { nick: "Tržnice.meteostanice", uuid: "TMaBoxXbvgezGR4LrQL7cw" },
  { nick: "Smetanovy sady.meteostanice", uuid: "HcJCjLU9542SranQwxAJZr" },
  { nick: "Nádraží.meteostanice", uuid: "735FvvadTkt42yKEmVXfKn" },
  { nick: "Nám. Republiky.meteostanice", uuid: "fQ9tGDF5imGS9FnTjgMT7F" },
  { nick: "UPOL.meteostanice", uuid: "m9hb7ypjfjHMpW2Rb6Xgxr" },
  { nick: "Flora.meteostanice", uuid: "YqdJZixXUWTKRFQaGuoF5g" },
  { nick: "Fugnerova.meteostanice", uuid: "kUmRffyMhmSXA2eemDGP64" },
  { nick: "U Letadla.meteostanice", uuid: "PS6WyjtdasZLMJB3sEusz5" },
  { nick: "Trnkova.meteostanice", uuid: "QYjB224iCx3RTcDn5DL7iX" },
];

export const WEATHER_STATION_NAMES = WEATHER_STATIONS.map((station) => station.nick);

export const WEATHER_METRICS = [
  { key: "device_device_frmpayload_data_hih_temp", name: "temperature", unit: "°C" },
  { key: "device_device_frmpayload_data_hih_relh", name: "humidity", unit: "%" },
  { key: "device_device_frmpayload_data_p", name: "pressure", unit: "hPa" },
  { key: "wind_speed", name: "wind speed", unit: "m/s" },
  { key: "wind_direction", name: "wind direction", unit: "°" },
] as const;

export type WeatherMetricKey = (typeof WEATHER_METRICS)[number]["key"];

export function resolveWeatherStation(name: string): WeatherStation | null {
  const wanted = name.trim().toLocaleLowerCase();
  return WEATHER_STATIONS.find((station) => station.nick.toLocaleLowerCase() === wanted) ?? null;
}

export function resolveWeatherMetric(key: string) {
  return WEATHER_METRICS.find((metric) => metric.key === key) ?? null;
}
