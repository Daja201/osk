import { describe, expect, it } from "vitest";
import { TrafficCountInput } from "../lib/ai/tools";
import {
  checkOf,
  factsOf,
  hourlyCsv,
  missingRanges,
  modelName,
  numberSource,
  periodText,
  placeOf,
  timingsOf,
  toolCallOf,
  viewOf,
  wantsChart,
} from "../lib/ui/answer";
import { FIXTURES } from "../lib/ui/fixtures";

const ok = (name: string) => {
  const result = FIXTURES[name].result;
  if (!result?.ok) throw new Error(`fixture ${name} nemá výsledek`);
  return factsOf(result);
};

describe("testovací odpovědi", () => {
  it("každá má stav, který stránka umí ukázat", () => {
    expect(Object.fromEntries(Object.entries(FIXTURES).map(([name, answer]) => [name, viewOf(answer)]))).toEqual({
      ok: "answer",
      partial: "answer",
      fallback: "answer",
      range: "answer",
      "out-of-scope": "out_of_scope",
      "no-data": "unknown",
      error: "error",
    });
  });

  it("vstup nástroje v trace projde stejným Zod schématem jako v lib/ai", () => {
    for (const answer of Object.values(FIXTURES)) {
      const step = answer.trace.steps.find((s) => s.type === "tool");
      if (step?.type === "tool") expect(TrafficCountInput.safeParse(step.input).success).toBe(true);
    }
  });

  it("součet v testovacích datech sedí s hodinami", () => {
    expect(ok("ok").total).toBe(15325);
    expect(ok("partial").total).toBe(15137);
    expect(ok("range").total).toBe(4012);
  });
});

describe("factsOf", () => {
  it("celý den: místo, senzory, špička a nejklidnější hodina", () => {
    const facts = ok("ok");
    expect(facts).toMatchObject({ place: "17. listopadu", from: 0, to: 24, range: null, scope: "oba směry dohromady" });
    expect(facts.sensors).toEqual(["17.listopadu JIH", "17.listopadu Sever"]);
    expect(facts.peak).toEqual({ hour: 7, value: 1318 });
    expect(facts.low).toEqual({ hour: 3, value: 24 });
    expect(facts.warnings).toEqual([]);
  });

  it("chybějící hodiny dají varování, technické poznámky z dat ne", () => {
    const facts = ok("partial");
    expect(facts.missing).toEqual([{ from: 3, to: 5 }]);
    expect(facts.warnings).toEqual(["Senzory nevysílaly mezi 3:00 a 5:00. Součet za den je proto neúplný."]);
  });

  it("část dne: hodiny mimo rozsah nejsou „chybí“", () => {
    const facts = ok("range");
    expect(facts).toMatchObject({ from: 6, to: 10, range: { from: 6, to: 10 }, missing: [], warnings: [] });
    expect(facts.low).toEqual({ hour: 6, value: 548 });
    expect(facts.verified).toEqual(expect.arrayContaining([6, 10]));
    expect(periodText(facts)).toBe("čtvrtek 19. 11. 2026, 6:00–10:00");
    expect(hourlyCsv(facts).split("\r\n")).toHaveLength(6); // hlavička + 4 hodiny + prázdný konec
  });
});

describe("pomocné funkce", () => {
  it("missingRanges spojí souvislé hodiny", () => {
    expect(missingRanges([1, null, null, 3, null])).toEqual([
      { from: 1, to: 3 },
      { from: 4, to: 5 },
    ]);
  });

  it("placeOf u brány bez skupiny", () => {
    expect(placeOf("Parkoviště Flora")).toEqual({ place: "Parkoviště Flora", sensors: ["Parkoviště Flora"] });
  });

  it("časy kroků a počet volání modelu", () => {
    expect(timingsOf(FIXTURES.ok)).toEqual({ choose: 700, compute: 300, write: 600, total: 1620, modelCalls: 2 });
    expect(timingsOf(FIXTURES["out-of-scope"])).toMatchObject({ choose: 610, compute: null, write: null, modelCalls: 1 });
  });

  it("toolCallOf a checkOf čtou z trace", () => {
    expect(toolCallOf(FIXTURES.range)).toMatchObject({ hour_from: 6, hour_to: 10 });
    expect(toolCallOf(FIXTURES["out-of-scope"])).toBeNull();
    expect(checkOf(FIXTURES.fallback)).toMatchObject({ passed: false, not_allowed: [1900] });
  });

  it("CSV: chybějící hodina je prázdná, ne 0", () => {
    const lines = hourlyCsv(ok("partial")).split("\r\n");
    expect(lines[0]).toBe("﻿hodina;počet aut");
    expect(lines[4]).toBe("3:00–4:00;");
  });

  it("název modelu", () => {
    expect(modelName("claude-haiku-5-5")).toBe("Claude Haiku 5.5");
  });
});

describe("wantsChart", () => {
  it("graf jen u otázek na průběh nebo špičku", () => {
    expect(wantsChart("Kolik aut včera projelo ulicí 17. listopadu?")).toBe(false);
    expect(wantsChart("Kdy byla včera největší špička u Billy?")).toBe(true);
    expect(wantsChart("Ukaž graf provozu na Kafkově")).toBe(true);
    expect(wantsChart("Jak se měnil provoz během dne?")).toBe(true);
  });
});

describe("numberSource", () => {
  const facts = ok("ok");
  const tool = toolCallOf(FIXTURES.ok);
  const num = (value: number) => ({ value, kind: "number" as const, text: String(value) });

  it("součet a špička jsou od našeho kódu", () => {
    expect(numberSource(num(15325), facts, tool)).toMatchObject({ who: "code", short: "součet za celý den" });
    expect(numberSource(num(1318), facts, tool).who).toBe("code");
    expect(numberSource({ value: 7, kind: "time", text: "7:00" }, facts, tool).who).toBe("code");
  });

  it("název ulice a datum jsou z otázky (AI)", () => {
    expect(numberSource({ value: 17, kind: "date", text: "17. listopadu" }, facts, tool)).toMatchObject({ who: "ai", short: "název místa „17. listopadu“" });
    expect(numberSource({ value: 19, kind: "date", text: "19. 11. 2026" }, facts, tool)).toMatchObject({ who: "ai", short: "datum" });
    expect(numberSource(num(17), facts, tool).who).toBe("ai");
  });

  it("rozsah hodin z otázky je od AI, číslo mimo data nesedí", () => {
    const range = ok("range");
    expect(numberSource({ value: 6, kind: "time", text: "6:00" }, range, toolCallOf(FIXTURES.range)).who).toBe("ai");
    expect(numberSource(num(1900), facts, tool, [1900]).who).toBe("bad");
  });

  it("u data, kdy AI doplnila včerejšek, to vysvětlení řekne", () => {
    const fallback = FIXTURES.fallback.result;
    if (!fallback?.ok) throw new Error("fixture bez výsledku");
    const source = numberSource({ value: 19, kind: "date", text: "19. 11. 2026" }, factsOf(fallback), toolCallOf(FIXTURES.fallback));
    expect(source.long).toContain("AI proto vzala včerejšek");
  });
});
