import { describe, expect, it } from "vitest";
import { addDays, pragueDate } from "../lib/ai/dates";

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
});
