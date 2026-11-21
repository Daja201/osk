import crypto from "crypto";
import { promises as fs } from "fs";
import path from "path";
import { fetchCitiq, type CitiqParams } from "./client";

const CACHE_DIR = path.join(process.cwd(), "data", "cache");
const LOCAL_TIME_ZONE = "Europe/Prague";
const CACHE_RETENTION_DAYS = 30;
const MIN_REQUEST_INTERVAL_MS = 1000;

const pendingFetches = new Map<string, Promise<CacheEntry>>();
let lastRequestAt = 0;
let requestQueue = Promise.resolve();

//creates name for cache from hash
function paramsHash(params: Omit<CitiqParams, "view">): string {
  const normalized = { ...params, format: params.format ?? "json" };
  const stableParams = Object.fromEntries(
    Object.entries(normalized).sort(([left], [right]) => left.localeCompare(right))
  );
  return crypto.createHash("sha256").update(JSON.stringify(stableParams)).digest("hex");
}

//saves data to cache with right name
function cacheFilePath(
  view: string,
  start: Date,
  stop: Date,
  params: Omit<CitiqParams, "view" | "start" | "stop">
): string {
  const date = dateStringInPrague(start);
  return path.join(
    CACHE_DIR,
    view,
    `${date}_${paramsHash({ ...params, start: start.toISOString(), stop: stop.toISOString() })}.json`
  );
}

// converts Date to time vars
function datePartsInPrague(date: Date): Record<string, string> {
  return Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: LOCAL_TIME_ZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(date)
      .filter(({ type }) => type !== "literal")
      .map(({ type, value }) => [type, value])
  );
}

//creates YYYY-MM-DD
function dateStringInPrague(date: Date): string {
  const parts = datePartsInPrague(date);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

// helper to get following calendar day
function addDays(date: string, days: number): string {
  const result = new Date(`${date}T00:00:00.000Z`);
  result.setUTCDate(result.getUTCDate() + days);
  return result.toISOString().slice(0, 10);
}

// returns oldest date whose cache can exist
export function getCacheRetentionStartDate(now = new Date()): string {
  return addDays(dateStringInPrague(now), -(CACHE_RETENTION_DAYS - 1));
}

// returns UTC correspondin to prague day (eg 1-2 hours minus)
export function utcStartOfPragueDay(date: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) {
    throw new Error(`Invalid date "${date}"; expected YYYY-MM-DD`);
  }

  const [, yearString, monthString, dayString] = match;
  const year = Number(yearString);
  const month = Number(monthString);
  const day = Number(dayString);
  const localMidnightAsUtc = Date.UTC(year, month - 1, day);
  const normalizedDate = new Date(localMidnightAsUtc).toISOString().slice(0, 10);
  if (normalizedDate !== date) {
    throw new Error(`Invalid calendar date "${date}"`);
  }

  const reference = new Date(localMidnightAsUtc);
  const parts = datePartsInPrague(reference);
  const localTimeAsUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second)
  );

  const utcOffsetMs = localTimeAsUtc - localMidnightAsUtc;
  return new Date(localMidnightAsUtc - utcOffsetMs);
}

// Converts an input wall-clock hour without assuming every Prague day is exactly 24 hours.
// On the autumn clock change, the earlier occurrence of an ambiguous hour is selected.
export function parsePragueDateTime(value: string): number | null {
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}):00$/.exec(value);
  if (!match || Number(match[2]) > 24) return null;
  const [, date, hourText] = match;
  try {
    utcStartOfPragueDay(date);
  } catch {
    return null;
  }
  const hour = Number(hourText);
  if (hour === 24) {
    try {
      return utcStartOfPragueDay(addDays(date, 1)).getTime();
    } catch {
      return null;
    }
  }

  const [year, month, day] = date.split("-").map(Number);
  const wallTimeAsUtc = Date.UTC(year, month - 1, day, hour);
  const probes = [-6, -3, -1, 0, 1, 3, 6].map((offset) => wallTimeAsUtc + offset * 60 * 60 * 1000);
  const offsets = new Set(
    probes.map((probe) => {
      const parts = datePartsInPrague(new Date(probe));
      return Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute)) - probe;
    }),
  );
  const candidates = [...offsets]
    .map((offset) => wallTimeAsUtc - offset)
    .filter((candidate) => {
      const parts = datePartsInPrague(new Date(candidate));
      return parts.year === String(year).padStart(4, "0") &&
        parts.month === String(month).padStart(2, "0") &&
        parts.day === String(day).padStart(2, "0") &&
        Number(parts.hour) === hour &&
        parts.minute === "00";
    })
    .sort((left, right) => left - right);
  return candidates[0] ?? null;
}

// shape for item in cache
export type CacheEntry = {
  data: unknown;
  fetched_at: string;
};

// reads cached API response from disk
async function readCacheFile(filePath: string): Promise<CacheEntry | null> {
  let raw: string;
  try {
    raw = await fs.readFile(filePath, "utf-8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }
    throw error;
  }

  const parsed: unknown = JSON.parse(raw);
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    !("data" in parsed) ||
    !("fetched_at" in parsed) ||
    typeof parsed.fetched_at !== "string" ||
    Number.isNaN(Date.parse(parsed.fetched_at))
  ) {
    throw new Error(`Invalid CITIQ cache entry at ${filePath}`);
  }

  return { data: parsed.data, fetched_at: parsed.fetched_at };
}

//writes data to cache
async function writeCacheFile(filePath: string, data: unknown, fetchedAt: string) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const payload = { data, fetched_at: fetchedAt };
  await fs.writeFile(filePath, JSON.stringify(payload, null, 2), "utf-8");
}

//deletes 31st day
export async function pruneExpiredCache(now = new Date()): Promise<void> {
  const firstRetainedDate = getCacheRetentionStartDate(now);
  let views: import("fs").Dirent[];

  try {
    views = await fs.readdir(CACHE_DIR, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
    throw error;
  }

  for (const view of views) {
    if (!view.isDirectory()) continue;
    const viewPath = path.join(CACHE_DIR, view.name);
    const files = await fs.readdir(viewPath, { withFileTypes: true });

    for (const file of files) {
      if (!file.isFile()) continue;
      const match = /^(\d{4}-\d{2}-\d{2})_[a-f0-9]{64}\.json$/.exec(file.name);
      if (!match || match[1] >= firstRetainedDate) continue;

      try {
        await fs.unlink(path.join(viewPath, file.name));
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
    }
  }
}

// just wait
function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// makes requests wait some time (1000ms) after last one finishes
async function fetchCitiqAtLimitedRate(params: CitiqParams): Promise<unknown> {
  const previousRequest = requestQueue;
  let releaseRequest!: () => void;
  requestQueue = new Promise<void>((resolve) => {
    releaseRequest = resolve;
  });
  await previousRequest;

  try {
    const remainingWait = MIN_REQUEST_INTERVAL_MS - (Date.now() - lastRequestAt);
    if (lastRequestAt > 0 && remainingWait > 0) await wait(remainingWait);
    lastRequestAt = Date.now();
    return await fetchCitiq(params);
  } finally {
    releaseRequest();
  }
}

// fetch API (dont if cached one exists or is waiting for download)
export async function getCachedRange(
  view: string,
  start: Date,
  stop: Date,
  citiqParams: Omit<CitiqParams, "view" | "start" | "stop"> = {}
): Promise<CacheEntry> {
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(stop.getTime()) || start > stop) {
    throw new RangeError("Invalid cache range: expected valid dates with start <= stop.");
  }
  if (dateStringInPrague(start) !== dateStringInPrague(stop)) {
    throw new RangeError("Cached ranges must stay within one Europe/Prague calendar day.");
  }

  await pruneExpiredCache();
  const filePath = cacheFilePath(view, start, stop, citiqParams);
  const existing = await readCacheFile(filePath);
  if (existing) return existing;

  const pending = pendingFetches.get(filePath);
  if (pending) return pending;

  const fetchPromise = (async (): Promise<CacheEntry> => {
    const fresh = await fetchCitiqAtLimitedRate({
      view,
      start: start.toISOString(),
      stop: stop.toISOString(),
      ...citiqParams,
    });

    const fetchedAt = new Date().toISOString();
    await writeCacheFile(filePath, fresh, fetchedAt);
    await pruneExpiredCache();
    return { data: fresh, fetched_at: fetchedAt };
  })();
  pendingFetches.set(filePath, fetchPromise);

  try {
    return await fetchPromise;
  } finally {
    pendingFetches.delete(filePath);
  }
}

// creates start and stop of day from data 00.00>59.00, 1 second between days
export async function getCachedDay(
  view: string,
  date: string,
  citiqParams: Omit<CitiqParams, "view" | "start" | "stop"> = {},
): Promise<CacheEntry> {
  const start = utcStartOfPragueDay(date);
  const nextLocalDate = addDays(date, 1);
  const nextDayStart = utcStartOfPragueDay(nextLocalDate);
  const stop = new Date(nextDayStart.getTime() - 1000);
  return getCachedRange(view, start, stop, citiqParams);
}
