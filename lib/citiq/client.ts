// URL API
const CITIQ_BASE = "https://iot.citiq.cloud/portal/api/v2/view";

//type of data that fetchCitiq can get
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

//error
export class CitiqError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = "CitiqError";
  }
}

//function to get API data
export async function fetchCitiq(params: CitiqParams): Promise<unknown> {
  const { view, ...query } = params;
  const url = new URL(`${CITIQ_BASE}/${view}/`);

  url.searchParams.set("format", query.format ?? "json");
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

  const res = await fetch(url.toString());

  if (res.status === 429) {
    throw new CitiqError(429, "CITIQ: error (rate limit)");
  }
  if (!res.ok) {
    throw new CitiqError(res.status, `CITIQ: error ${res.status} on ${view}`);
  }

  return res.json();
}