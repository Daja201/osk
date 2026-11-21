import { describe, expect, it } from "vitest";
import { explainNumber, periodOf, timingsOf, viewOf } from "../lib/ui/answer";
import { chartColors, chartData, extremes, hourSummary, labelStep, percentShares, pieSlices, textOn } from "../lib/ui/chart";
import { tableTsv } from "../lib/ui/export";
import { FIXTURES } from "../lib/ui/fixtures";

const ok = (name: string) => {
  const result = FIXTURES[name].result;
  if (!result?.ok) throw new Error(`fixture ${name} nemá výsledek`);
  return result;
};

describe("testovací odpovědi", () => {
  it("briefing datasetu má vlastní stav místo „nevím“", () => {
    const help = {
      ...FIXTURES["out-of-scope"],
      kind: "unknown" as const,
      reason: { code: "DATASET_HELP", message: "Briefing možností datasetu." },
    };
    expect(viewOf(help)).toBe("dataset_help");
  });

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

  it("barvy: vždy podle zvoleného pozadí (bez volby bílé), ne podle režimu stránky; čitelný text na barvě", () => {
    expect(chartColors("cervena").bg).toBe("#B3261E");
    expect(chartColors(null).bg).toBe("#FFFFFF");
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
    expect(explainNumber({ value: 16, kind: "date", text: "16. 11. 2026" }, text)).toMatchObject({ who: "ai", short: "datum z otázky" });
    // Části data jako samostatná čísla (rok, měsíc) nejsou „povolené číslo“, ale datum z otázky.
    expect(explainNumber({ value: 2026, kind: "number", text: "2026" }, text)).toMatchObject({ who: "ai", short: "datum z otázky" });
    expect(explainNumber({ value: 11, kind: "number", text: "11" }, FIXTURES.bar)).toMatchObject({ who: "ai", short: "datum z otázky" });
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

describe("písma do PNG", () => {
  it("vloží jen latinku a latin-ext (čeština), ne vietnamštinu", async () => {
    const { isLatinRange } = await import("../lib/ui/export");
    expect(isLatinRange("U+??,U+131,U+152-153")).toBe(true);
    expect(isLatinRange("U+0-FF, U+131")).toBe(true);
    expect(isLatinRange("U+0000-00FF, U+0131")).toBe(true);
    expect(isLatinRange("U+100-2BA,U+2BD-2C5")).toBe(true);
    expect(isLatinRange("U+0100-02BA, U+02BD-02C5")).toBe(true);
    expect(isLatinRange("U+102-103,U+110-111,U+1EA0-1EF9")).toBe(false);
  });
});

describe("odkud je číslo v grafu", () => {
  it("sloupec = místo a období, s popisem senzorů a odkazem na dotaz", async () => {
    const { explainPoint } = await import("../lib/ui/answer");
    const { pickAt } = await import("../lib/ui/chart");
    const bar = FIXTURES.bar;
    const result = ok("bar");
    const point = explainPoint(bar, pickAt(result, 0, 1));
    expect(point).toMatchObject({ place: "Kafkova", value: 3607, period: "21. 11. 2026, 8:00–11:00" });
    expect(point?.text).toContain("Součet 3 hodinových hodnot senzorů Kafkova - levá a Kafkova - pravá (oba směry)");
    expect(point?.sources.map((s) => s.date)).toEqual(["2026-11-21"]);
  });

  it("součet sloupce za nesouvislé dny vysvětlí jen vybrané dny a hodiny", async () => {
    const { explainPoint } = await import("../lib/ui/answer");
    const { pickAt } = await import("../lib/ui/chart");
    const original = FIXTURES.bar.result;
    if (!original?.ok || original.meta.tool !== "traffic_series") throw new Error("bar fixture nemá dopravní výsledek");
    const selected: (typeof FIXTURES)["bar"] = {
      ...FIXTURES.bar,
      result: {
        ...original,
        data: {
          ...original.data,
          series: original.data.series.map((series) => ({
            ...series,
            total: 48,
            coverage: { hours: 48, of: 48 },
          })),
        },
        meta: {
          ...original.meta,
          params: { ...original.meta.params, dates: ["2026-11-17", "2026-11-19"] },
          period: { start: "2026-11-16T23:00:00.000Z", end: "2026-11-19T23:00:00.000Z", clipped: false },
          sources: [
            ...original.meta.sources,
            { date: "2026-11-17", url: "https://example.test/17", fetched_at: "2026-11-21T10:00:00.000Z" },
            { date: "2026-11-19", url: "https://example.test/19", fetched_at: "2026-11-21T10:00:00.000Z" },
          ],
        },
      },
    };
    const result = selected.result;
    if (!result?.ok || result.meta.tool !== "traffic_series") throw new Error("selected result should be successful");
    const point = explainPoint(selected, pickAt(result, 0, 0));

    expect(point).toMatchObject({
      value: 48,
      period: "úterý 17. 11. 2026 a čtvrtek 19. 11. 2026",
    });
    expect(point?.text).toContain("Součet 48 hodinových hodnot");
    expect(point?.sources.map((source) => source.date)).toEqual(["2026-11-17", "2026-11-19"]);
  });

  it("chybějící hodina: vysvětlí, že ji nedoplňujeme nulou", async () => {
    const { explainPoint } = await import("../lib/ui/answer");
    const point = explainPoint(FIXTURES.table, { gate: 0, bucket: 0 });
    expect(point).toMatchObject({ value: null, period: "20. 11. 2026, 0:00–1:00" });
    expect(point?.text).toContain("Nedoplňujeme");
  });

  it("výseč koláče si pamatuje své místo", async () => {
    const { pieSlices } = await import("../lib/ui/chart");
    expect(pieSlices(ok("pie")).map((s) => s.pick)).toEqual([
      { gate: 0, bucket: 0 },
      { gate: 1, bucket: 0 },
      { gate: 2, bucket: 0 },
    ]);
  });
});

describe("závěr grafu po hodinách", () => {
  it("nejvyšší a nejnižší hodnota bez chybějících hodin, při shodě první", () => {
    expect(extremes([5, null, 9, 0, 9])).toEqual({ max: 2, min: 3 });
    expect(extremes([null, 4, null])).toBeNull();
  });

  it("věta s rozsahem hodin a čísly; jen po hodinách a pro jedno místo", () => {
    const result = (labels: string[], values: (number | null)[][], granularity: "hour" | "day" = "hour") =>
      ({
        ok: true,
        data: {
          granularity,
          buckets: labels.map((label) => ({ label, start: "", end: "" })),
          series: values.map((v, i) => ({ gate: `Místo ${i}`, sensors: [], values: v, total: 0, coverage: { hours: 0, of: 0 } })),
        },
      }) as unknown as Parameters<typeof hourSummary>[0];
    expect(hourSummary(result(["3:00", "4:00", "14:00"], [[60, null, 2290]]))).toBe("Nejvíc vozidel: 14:00–15:00 (2\u00a0290). Nejméně: 3:00–4:00 (60).");
    expect(hourSummary(result(["st 18. 11. 22:00", "st 18. 11. 23:00"], [[5, 7]]))).toBe(
      "Nejvíc vozidel: st 18. 11. 23:00–24:00 (7). Nejméně: st 18. 11. 22:00–23:00 (5).",
    );
    expect(hourSummary(result(["3:00", "4:00"], [[1, 2], [3, 4]]))).toBeNull();
    expect(hourSummary(result(["po", "út"], [[1, 2]], "day"))).toBeNull();
  });
});
