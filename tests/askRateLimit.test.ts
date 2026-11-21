import { describe, expect, it } from "vitest";
import { clientIp, createAskRateLimiter } from "../lib/askRateLimit";

describe("ask rate limit", () => {
  it("allows five requests per minute per IP", () => {
    const limit = createAskRateLimiter();

    for (let request = 0; request < 5; request += 1) {
      expect(limit("192.0.2.1", request * 1000)).toEqual({ allowed: true });
    }
    // Šestý dotaz v téže minutě: další jde, až první vypadne z okna (v 60 s).
    expect(limit("192.0.2.1", 5000)).toEqual({ allowed: false, retryAfterSeconds: 55 });
    expect(limit("192.0.2.1", 60_000)).toEqual({ allowed: true });
    expect(limit("192.0.2.2", 5000)).toEqual({ allowed: true });
  });

  it("allows at most 300 requests in a rolling 24-hour window", () => {
    const limit = createAskRateLimiter();

    for (let request = 0; request < 300; request += 1) {
      expect(limit("192.0.2.1", request * 60_000)).toEqual({ allowed: true });
    }

    expect(limit("192.0.2.1", 300 * 60_000)).toEqual({
      allowed: false,
      retryAfterSeconds: 19 * 60 * 60, // první dotaz (v čase 0) vypadne z okna za 24 h
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
