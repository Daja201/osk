import crypto from "crypto";

import { promises as fs } from "fs";
import path from "path";
import { fetchCitiq, type CitiqParams } from "./client";

const CACHE_DIR = path.join(process.cwd(), "data", "cache");
const LOCAL_TIME_ZONE = "Europe/Prague";
const REFRESH_INTERVAL_MS = 60 * 60 * 1000;

function paramsHash(params: Omit<CitiqParams, "view" | "start" | "stop">): string {
  const normalized = { ...params, format: params.format ?? "json" };
  const stableParams = Object.fromEntries(
    Object.entries(normalized).sort(([left], [right]) => left.localeCompare(right))
  );
  return crypto.createHash("sha256").update(JSON.stringify(stableParams)).digest("hex");
}

function cacheFilePath(
  view: string,
  date: string,
  params: Omit<CitiqParams, "view" | "start" | "stop">
): string {
  return path.join(CACHE_DIR, view, `${date}_${paramsHash(params)}.json`);
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

export async function getCachedDay(
  view: string,
  date: string,
  citiqParams: Omit<CitiqParams, "view" | "start" | "stop"> = {}
): Promise<CacheEntry> {
  const start = utcStartOfPragueDay(date);
  const nextLocalDate = new Date(`${date}T00:00:00.000Z`);
  nextLocalDate.setUTCDate(nextLocalDate.getUTCDate() + 1);
  const nextDayStart = utcStartOfPragueDay(nextLocalDate.toISOString().slice(0, 10));
  const stop = new Date(nextDayStart.getTime() - 1000);
  const filePath = cacheFilePath(view, date, citiqParams);
  const isToday = date === dateStringInPrague(new Date());

  const existing = await readCacheFile(filePath);

  if (existing && !isToday) {
    return existing;
  }

  if (existing && isToday) {
    const age = Date.now() - new Date(existing.fetched_at).getTime();
    if (age >= 0 && age < REFRESH_INTERVAL_MS) {
      return existing;
    }
  }

  const fresh = await fetchCitiq({
    view,
    start: start.toISOString(),
    stop: stop.toISOString(),
    ...citiqParams,
  });

  const fetchedAt = new Date().toISOString();
  await writeCacheFile(filePath, fresh, fetchedAt);
  return { data: fresh, fetched_at: fetchedAt };
}