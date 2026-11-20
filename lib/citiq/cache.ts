import { promises as fs } from "fs";
import path from "path";
import { fetchCitiq, type CitiqParams } from "./client";

const CACHE_DIR = path.join(process.cwd(), "data", "cache");
//every hour
const REFRESH_INTERVAL_MS = 60 * 60 * 1000; 

function cacheFilePath(view: string, date: string): string {
  return path.join(CACHE_DIR, view, `${date}.json`);
}

// YYYY-MM-DD
function todayUtcDateString(): string {
  return new Date().toISOString().slice(0, 10);
}

async function readCacheFile(filePath: string) {
  try {
    const raw = await fs.readFile(filePath, "utf-8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function writeCacheFile(filePath: string, data: unknown) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const payload = {
    data,
    fetched_at: new Date().toISOString(),
  };
  await fs.writeFile(filePath, JSON.stringify(payload, null, 2), "utf-8");
}

//Returns data for day and wiew
//takes yesterdays from cache
export async function getCachedDay(
  view: string,
  date: string,
  citiqParams: Omit<CitiqParams, "view" | "start" | "stop"> = {}
): Promise<unknown> {
  const filePath = cacheFilePath(view, date);
  const isToday = date === todayUtcDateString();

  const existing = await readCacheFile(filePath);

  if (existing && !isToday) {
    return existing.data;
  }

  if (existing && isToday) {
    const age = Date.now() - new Date(existing.fetched_at).getTime();
    if (age < REFRESH_INTERVAL_MS) {
      return existing.data;
    }
  }

  const fresh = await fetchCitiq({
    view,
    start: `${date}T00:00:00Z`,
    stop: `${date}T23:59:59Z`,
    ...citiqParams,
  });

  await writeCacheFile(filePath, fresh);
  return fresh;
}