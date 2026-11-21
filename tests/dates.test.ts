import { describe, expect, it } from "vitest";
import { addDays, formatSelectedPeriod, pragueDate } from "../lib/ai/dates";
import { parsePragueDateTime } from "../lib/citiq/cache";

describe("pražské datum", () => {
  it("před UTC půlnocí je Praha ještě předchozí den", () => {
    expect(pragueDate(new Date("2026-11-19T22:30:00Z"))).toBe("2026-11-19");
  });

  it("po UTC půlnoci může být Praha nový den", () => {
    expect(pragueDate(new Date("2026-11-19T23:30:00Z"))).toBe("2026-11-20");
  });

  it("výpočet dnů je stabilní přes UTC kalendář", () => {
    expect(addDays("2026-11-20", -1)).toBe("2026-11-19");
  });

  it("nesouvislé vybrané dny vypíše jednotlivě místo souvislého rozsahu", () => {
    expect(
      formatSelectedPeriod("2026-11-16T23:00:00.000Z", "2026-11-19T23:00:00.000Z", ["2026-11-17", "2026-11-19"]),
    ).toBe("úterý 17. 11. 2026 a čtvrtek 19. 11. 2026");
  });

  it("pražská půlnoc a konec dne zohlední přechod na letní čas", () => {
    expect(new Date(parsePragueDateTime("2026-03-29T00:00") ?? NaN).toISOString()).toBe("2026-03-28T23:00:00.000Z");
    expect(new Date(parsePragueDateTime("2026-03-29T24:00") ?? NaN).toISOString()).toBe("2026-03-29T22:00:00.000Z");
    expect(parsePragueDateTime("2026-03-29T02:00")).toBeNull();
  });

  it("při opakované hodině na podzim vybere její první výskyt", () => {
    expect(new Date(parsePragueDateTime("2026-10-25T02:00") ?? NaN).toISOString()).toBe("2026-10-25T00:00:00.000Z");
  });
});
