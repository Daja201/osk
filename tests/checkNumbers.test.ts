import { describe, expect, it } from "vitest";
import { checkNumbers, extractNumbers } from "../lib/ai/checkNumbers";

describe("extractNumbers", () => {
  it("tisíce s mezerou, NBSP i úzkou NBSP", () => {
    expect(extractNumbers("12 345")).toEqual([12345]);
    expect(extractNumbers("12 345")).toEqual([12345]);
    expect(extractNumbers("12 345")).toEqual([12345]);
  });
  it("oba formáty data", () => {
    expect(extractNumbers("19. 11. 2026")).toEqual([19, 11, 2026]);
    expect(extractNumbers("19.11.2026")).toEqual([19, 11, 2026]);
  });
  it("den s měsícem slovem a název ulice", () => {
    expect(extractNumbers("19. listopadu")).toEqual([19]);
    expect(extractNumbers("ulicí 17. listopadu")).toEqual([17]);
  });
  it("časy a minuty", () => {
    expect(extractNumbers("mezi 16:00 a 17:00")).toEqual([16, 17]);
    expect(extractNumbers("v 7:30")).toEqual([7, 30]);
  });
  it("desetinná čísla a procenta", () => {
    expect(extractNumbers("12,3 %")).toEqual([12.3]);
  });
});

describe("checkNumbers", () => {
  const allowed = new Set([17, 19, 11, 2026, 12345, 16, 1234]);

  it("projde, když jsou všechna čísla povolená", () => {
    const result = checkNumbers("Ve čtvrtek 19. 11. 2026 projelo 17. listopadu 12 345 vozidel, nejvíc mezi 16:00 a 17:00 (1 234).", allowed);
    expect(result.passed).toBe(true);
  });
  it("neprojde s číslem navíc", () => {
    expect(checkNumbers("Projelo 12 345 vozidel, průměrně 514 za hodinu.", allowed).not_allowed).toEqual([514]);
  });
  it("neprojde se zaokrouhleným číslem", () => {
    expect(checkNumbers("Projelo asi 12 300 vozidel.", allowed).passed).toBe(false);
  });
});
