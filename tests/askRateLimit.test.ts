import { describe, expect, it } from "vitest";
import { clientIp, createAskRateLimiter } from "../lib/askRateLimit";

describe("ask rate limit", () => {
  it("allows one request per minute per IP", () => {
    const limit = createAskRateLimiter();

    expect(limit("192.0.2.1", 0)).toEqual({ allowed: true });
    expect(limit("192.0.2.1", 59_999)).toEqual({ allowed: false, retryAfterSeconds: 1 });
    expect(limit("192.0.2.1", 60_000)).toEqual({ allowed: true });
    expect(limit("192.0.2.2", 60_000)).toEqual({ allowed: true });
  });

  it("allows at most ten requests in a rolling 24-hour window", () => {
    const limit = createAskRateLimiter();

    for (let request = 0; request < 10; request += 1) {
      expect(limit("192.0.2.1", request * 60_000)).toEqual({ allowed: true });
    }

    expect(limit("192.0.2.1", 10 * 60_000)).toEqual({
      allowed: false,
      retryAfterSeconds: 23 * 60 * 60 + 50 * 60,
    });
    expect(limit("192.0.2.1", 24 * 60 * 60 * 1000)).toEqual({ allowed: true });
  });

  it("uses proxy IP headers and falls back to one shared unknown address", () => {
    expect(clientIp(new Request("http://localhost", {
      headers: { "x-real-ip": "192.0.2.1", "x-forwarded-for": "192.0.2.2" },
    }))).toBe("192.0.2.1");
    expect(clientIp(new Request("http://localhost", {
      headers: { "x-forwarded-for": "198.51.100.1, 192.0.2.2" },
    }))).toBe("198.51.100.1");
    expect(clientIp(new Request("http://localhost", {
      headers: { "x-real-ip": "not-an-ip" },
    }))).toBe("unknown");
  });
});
