import { isIP } from "node:net";

const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * MINUTE_MS;
const MAX_PER_MINUTE = 5;
const MAX_PER_DAY = 300;
const CLEANUP_INTERVAL = 256;

export type AskRateLimitResult =
  | { allowed: true }
  | { allowed: false; retryAfterSeconds: number };

export function createAskRateLimiter() {
  const requestsByIp = new Map<string, number[]>();
  let requestsSinceCleanup = 0;

  return (ip: string, now = Date.now()): AskRateLimitResult => {
    requestsSinceCleanup += 1;
    if (requestsSinceCleanup >= CLEANUP_INTERVAL) {
      requestsSinceCleanup = 0;
      const cutoff = now - DAY_MS;
      for (const [address, timestamps] of requestsByIp) {
        if (timestamps.every((timestamp) => timestamp <= cutoff)) requestsByIp.delete(address);
      }
    }

    const cutoff = now - DAY_MS;
    const timestamps = (requestsByIp.get(ip) ?? []).filter((timestamp) => timestamp > cutoff);
    const minuteLimitAt =
      timestamps.length < MAX_PER_MINUTE
        ? now
        : timestamps[timestamps.length - MAX_PER_MINUTE] + MINUTE_MS;
    const nextAllowedAt = Math.max(
      minuteLimitAt,
      timestamps.length < MAX_PER_DAY ? now : timestamps[0] + DAY_MS,
    );

    if (nextAllowedAt > now) {
      if (timestamps.length > 0) requestsByIp.set(ip, timestamps);
      return { allowed: false, retryAfterSeconds: Math.ceil((nextAllowedAt - now) / 1000) };
    }

    timestamps.push(now);
    requestsByIp.set(ip, timestamps);
    return { allowed: true };
  };
}

const allowAskRequest = createAskRateLimiter();

export function clientIp(request: Request): string {
  const realIp = request.headers.get("x-real-ip")?.trim();
  if (realIp && isIP(realIp)) return realIp;

  const forwardedIp = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  if (forwardedIp && isIP(forwardedIp)) return forwardedIp;

  return "unknown";
}

export function checkAskRateLimit(ip: string): AskRateLimitResult {
  return allowAskRequest(ip);
}
