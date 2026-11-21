import { describe, expect, it } from "vitest";
import {
  carsWord,
  formatDayLong,
  formatFetchedAt,
  formatHourRange,
  formatNumber,
  formatSeconds,
  niceAxis,
  quote,
} from "../lib/ui/format";

describe("formátování", () => {
  it("čísla s pevnou mezerou", () => {
    expect(formatNumber(15325)).toBe("15 325");
    expect(formatNumber(64)).toBe("64");
  });

  it("tvar slova auto", () => {
    expect([0, 1, 2, 4, 5, 1318].map(carsWord)).toEqual(["aut", "auto", "auta", "auta", "aut", "aut"]);
  });

  it("hodiny, den, uvozovky, sekundy", () => {
    expect(formatHourRange(7)).toBe("7:00–8:00");
    expect(formatHourRange(23)).toBe("23:00–24:00");
    expect(formatDayLong("2026-11-19")).toBe("čtvrtek 19. 11. 2026");
    expect(quote("ahoj")).toBe("„ahoj“");
    expect(formatSeconds(700)).toBe("0,7 s");
    expect(formatSeconds(1620)).toBe("1,6 s");
    expect(formatSeconds(20)).toBe("pod 0,1 s");
  });

  it("čas stažení v pražském čase", () => {
    const now = new Date("2026-11-20T21:20:00Z"); // 22:20 v Praze
    expect(formatFetchedAt("2026-11-20T21:14:00Z", now)).toBe("dnes ve 22:14");
    expect(formatFetchedAt("2026-11-20T07:05:00Z", now)).toBe("dnes v 8:05");
    expect(formatFetchedAt("2026-11-19T12:30:00Z", now)).toBe("včera ve 13:30");
    expect(formatFetchedAt("2026-11-17T08:00:00Z", now)).toBe("17. 11. 2026 v 9:00");
  });
});

describe("niceAxis", () => {
  it("1 318 → osa do 1 500, čáry 500 a 1 000", () => {
    expect(niceAxis(1318)).toEqual({ max: 1500, ticks: [500, 1000] });
  });

  it("nad nejvyšším sloupcem zbude místo", () => {
    expect(niceAxis(1500).max).toBeGreaterThan(1500);
  });

  it("malá a nulová maxima", () => {
    expect(niceAxis(137)).toEqual({ max: 150, ticks: [50, 100] });
    expect(niceAxis(0)).toEqual({ max: 1, ticks: [] });
  });
});
