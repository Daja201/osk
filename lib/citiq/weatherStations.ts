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

// label = název pro lidi. min / max = fyzikálně možný rozsah: hodnota mimo něj je chyba čidla, ne měření.
// Čidlo teploty a vlhkosti (HIH) při poruše posílá 125,01 °C a 100,01 % (ověřeno na datech 14.–20. 11. 2026).
export const WEATHER_METRICS = [
  { key: "device_device_frmpayload_data_hih_temp", name: "temperature", label: "teplota", unit: "°C", min: -40, max: 60 },
  { key: "device_device_frmpayload_data_hih_relh", name: "humidity", label: "vlhkost", unit: "%", min: 0, max: 100 },
  { key: "device_device_frmpayload_data_p", name: "pressure", label: "tlak", unit: "hPa", min: 870, max: 1085 },
  { key: "wind_speed", name: "wind speed", label: "rychlost větru", unit: "m/s", min: 0, max: 60 },
  { key: "wind_direction", name: "wind direction", label: "směr větru", unit: "°", min: 0, max: 360 },
] as const;

// Teplota a vlhkost jsou ze stejného čidla: když je v hodině chybná teplota, je chybná i vlhkost
// (porucha 100,01 % se v hodinovém průměru schová, 125,01 °C ne).
export const HIH_TEMP_KEY = "device_device_frmpayload_data_hih_temp";
export const HIH_RELH_KEY = "device_device_frmpayload_data_hih_relh";

// Název stanice pro lidi: „Fugnerova.meteostanice“ → „Fugnerova“.
export const stationName = (nick: string) => nick.replace(/\.meteostanice$/, "");

export type WeatherMetricKey = (typeof WEATHER_METRICS)[number]["key"];

export function resolveWeatherStation(name: string): WeatherStation | null {
  const wanted = name.trim().toLocaleLowerCase();
  return WEATHER_STATIONS.find((station) => station.nick.toLocaleLowerCase() === wanted) ?? null;
}

export function resolveWeatherMetric(key: string) {
  return WEATHER_METRICS.find((metric) => metric.key === key) ?? null;
}

// Popis datasetu pro lidi (panel „Co za data mám“ pod polem pro otázku). Zdroj: metadata CITIQ meteorological-data-olomouc.
export const WEATHER_DATASET = {
  title: "Počasí",
  description: "Hodinová měření z meteostanic za posledních 30 dní: teplota (°C), vlhkost (%), tlak (hPa), rychlost (m/s) a směr větru (°).",
  places: WEATHER_STATIONS.map((station) => stationName(station.nick)),
};
