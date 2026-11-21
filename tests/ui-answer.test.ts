import { describe, expect, it } from "vitest";
import { explainNumber, periodOf, timingsOf, viewOf } from "../lib/ui/answer";
import { chartColors, chartData, labelStep, percentShares, pieSlices, textOn } from "../lib/ui/chart";
import { tableTsv } from "../lib/ui/export";
import { FIXTURES } from "../lib/ui/fixtures";

const ok = (name: string) => {
  const result = FIXTURES[name].result;
  if (!result?.ok) throw new Error(`fixture ${name} nemá výsledek`);
  return result;
};

describe("testovací odpovědi", () => {
  it("každá má stav, který stránka umí ukázat", () => {
    expect(Object.fromEntries(Object.entries(FIXTURES).map(([name, answer]) => [name, viewOf(answer)]))).toEqual({
      bar: "answer",
      line: "answer",
      pie: "answer",
      table: "answer",
      text: "answer",
      fallback: "answer",
      source: "answer",
      "out-of-scope": "out_of_scope",
      "no-data": "unknown",
      error: "error",
    });
  });
});

describe("data pro grafy", () => {
  it("celkem za období: kategorie = místa, jedna řada", () => {
    expect(chartData(ok("bar"))).toEqual({ categories: ["17. listopadu", "Kafkova", "Billa (Hynaisova)"], series: [{ name: "Celkem", values: [3314, 3607, 260] }] });
  });

  it("po dnech: kategorie = dny, řada = místo", () => {
    const data = chartData(ok("line"));
    expect(data.categories[0]).toBe("so 14. 11.");
    expect(data.series).toEqual([{ name: "Parkoviště Flora", values: [804, 272, 320, 179, 394, 453, 410] }]);
  });

  it("koláč: výseče = místa, procenta dají dohromady 100", () => {
    const slices = pieSlices(ok("pie"));
    expect(slices.map((s) => s.label)).toEqual(["17. listopadu", "Kafkova", "Billa (Hynaisova)"]);
    const shares = percentShares(slices.map((s) => s.value));
    expect(shares.reduce((a, b) => a + b, 0)).toBe(100);
    expect(percentShares([1, 1, 1])).toEqual([34, 33, 33]);
    expect(percentShares([0, 0])).toEqual([0, 0]);
  });

  it("popisky na ose se ředí, ať se nepřekrývají", () => {
    expect(labelStep(7)).toBe(1);
    expect(labelStep(24, 12)).toBe(2);
    expect(labelStep(168, 12)).toBe(14);
  });

  it("barvy: zvolená paleta, jinak podle režimu; čitelný text na barvě", () => {
    expect(chartColors("cervena", "light").bg).toBe("#B3261E");
    expect(chartColors(null, "light").bg).toBe("#FFFFFF");
    expect(chartColors(null, "dark").bg).toBe("#14243A");
    expect(textOn("#FFFFFF")).toBe("#14243A");
    expect(textOn("#0B4F96")).toBe("#FFFFFF");
    expect(textOn("#FFC21A")).toBe("#14243A");
  });

  it("tabulka do schránky: tabulátory, chybějící hodnota prázdná", () => {
    const lines = tableTsv(ok("table")).split("\n");
    expect(lines[0]).toBe("Období\tParkoviště Flora");
    expect(lines[1]).toBe("0:00\t");
    expect(lines[3]).toBe("2:00\t1");
  });
});

describe("vysvětlení čísel a časy", () => {
  const text = FIXTURES.text;
  it("čísla z výsledku spočítal kód, datum a název místa jsou z otázky", () => {
    expect(explainNumber({ value: 133, kind: "number", text: "133" }, text)).toMatchObject({ who: "code", short: "Billa (Hynaisova), 9:00" });
    expect(explainNumber({ value: 9, kind: "time", text: "9:00" }, text)).toMatchObject({ who: "code", short: "hodina z výsledku" });
    expect(explainNumber({ value: 2, kind: "number", text: "2" }, text)).toMatchObject({ who: "code", short: "počet hodin bez dat" });
    expect(explainNumber({ value: 16, kind: "date", text: "16. 11. 2026" }, text)).toMatchObject({ who: "ai", short: "datum" });
    expect(explainNumber({ value: 17, kind: "date", text: "17. listopadu" }, FIXTURES.bar)).toMatchObject({ who: "ai", short: "název místa „17. listopadu“" });
    expect(explainNumber({ value: 1300, kind: "number", text: "1300" }, FIXTURES.fallback, [1300])).toMatchObject({ who: "bad" });
  });

  it("u grafu se věta nepíše: jedno volání modelu", () => {
    expect(timingsOf(FIXTURES.bar)).toMatchObject({ choose: 1900, compute: 3100, write: null, modelCalls: 1 });
    expect(timingsOf(text)).toMatchObject({ write: 2600, modelCalls: 2 });
  });

  it("období pro lidi", () => {
    expect(periodOf(FIXTURES.bar)).toBe("21. 11. 2026, 8:00–11:00");
    expect(periodOf(FIXTURES.line)).toBe("14.–20. 11. 2026");
  });
});
