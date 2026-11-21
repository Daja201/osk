// URL API
export const CITIQ_BASE = "https://iot.citiq.cloud/portal/api/v2/view";

//type of data that fetchCitiq can get (becomes a part of URL when API call)
export type CitiqParams = {
  view: string;
  start?: string;
  stop?: string;
  window?: "15m" | "1h" | "1d";
  measurement_keys?: string[];
  agg_func?: string;
  group_by_tags?: string[];
  format?: "json" | "csv" | "geojson";
};

//class for error
export class CitiqError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = "CitiqError";
  }
}

// Přesná adresa dotazu na CITIQ. Používá ji fetchCitiq a stejnou adresu ukazujeme uživateli
// jako zdroj dat (dá se otevřít v prohlížeči a ověřit).
export function citiqUrl(params: CitiqParams): string {
  const { view, ...query } = params;
  const url = new URL(`${CITIQ_BASE}/${encodeURIComponent(view)}/`);
  const format = query.format ?? "json";
  url.searchParams.set("format", format);
  if (query.start) url.searchParams.set("start", query.start);
  if (query.stop) url.searchParams.set("stop", query.stop);
  if (query.window) url.searchParams.set("window", query.window);
  if (query.measurement_keys) {
    url.searchParams.set("measurement_keys", query.measurement_keys.join(","));
  }
  if (query.agg_func) url.searchParams.set("agg_func", query.agg_func);
  if (query.group_by_tags) {
    url.searchParams.set("group_by_tags", query.group_by_tags.join(","));
  }
  return url.toString();
}

//function to get API data
export async function fetchCitiq(params: CitiqParams): Promise<unknown> {
  const { view } = params;
  const format = params.format ?? "json";
  //call
  const res = await fetch(citiqUrl(params));
  //error handler
  if (res.status === 429) {
    throw new CitiqError(429, "CITIQ: error (rate limit)");
  }
  if (!res.ok) {
    throw new CitiqError(res.status, `CITIQ: error ${res.status} on ${view}`);
  }
  //
  return format === "csv" ? res.text() : res.json();
}