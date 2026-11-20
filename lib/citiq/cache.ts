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

function paramsHash(params: Omit<CitiqParams, "view">): string {
  const normalized = { ...params, format: params.format ?? "json" };
  const stableParams = Object.fromEntries(
    Object.entries(normalized).sort(([left], [right]) => left.localeCompare(right))
  );
  return crypto.createHash("sha256").update(JSON.stringify(stableParams)).digest("hex");
}

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

function dateStringInPrague(date: Date): string {
  const parts = datePartsInPrague(date);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function addDays(date: string, days: number): string {
  const result = new Date(`${date}T00:00:00.000Z`);
  result.setUTCDate(result.getUTCDate() + days);
  return result.toISOString().slice(0, 10);
}

export function getCacheRetentionStartDate(now = new Date()): string {
  return addDays(dateStringInPrague(now), -(CACHE_RETENTION_DAYS - 1));
}

// exportováno - traffic.ts (a další funkce nástrojů) to potřebují pro period_utc v účtence
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

export type CacheEntry = {
  data: unknown;
  fetched_at: string;
};

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

async function writeCacheFile(filePath: string, data: unknown, fetchedAt: string) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const payload = { data, fetched_at: fetchedAt };
  await fs.writeFile(filePath, JSON.stringify(payload, null, 2), "utf-8");
}

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

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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
