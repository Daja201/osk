// lib/citiq/series.ts bez sítě: getCachedDay / getCachedRange vrací falešná data ve tvaru CITIQ.
// Čas bodu = KONEC hodinového okna, poslední bod dne má čas „stop“ (23:59:59 místního času).
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CitiqError } from "../lib/citiq/client";

const H = 3600 * 1000;
// Pravidlo pro falešná data: kolik aut projelo bránou v daný den a hodinu a směrem. null = senzor nevysílal.
type Rule = (gate: string, date: string, hour: number, direction: "in" | "out") => number | null;
let rule: Rule = () => 1;
// Brány, které v odpovědi CITIQ úplně chybí (senzor nevysílá).
let silent = new Set<string>();
let cacheError: unknown = null;
const calls: { kind: "day" | "range"; date?: string; stop?: string }[] = [];

const GATES = ["17.listopadu JIH", "17.listopadu Sever", "Kafkova - levá", "Kafkova - pravá", "Parkoviště Flora", "Billa (Hynaisova)", "Zikova"];

vi.mock("../lib/citiq/cache", async (importOriginal) => {
  const original = await importOriginal<typeof import("../lib/citiq/cache")>();
  const pragueDate = (ms: number) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Prague" }).format(ms);

  function day(date: string) {
    const start = original.utcStartOfPragueDay(date).getTime();
    const [y, m, d] = date.split("-").map(Number);
    const next = original.utcStartOfPragueDay(new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10)).getTime();
    const hours = Math.round((next - start) / H);
    const pointTime = (hour: number) => new Date(hour === hours - 1 ? next - 1000 : start + (hour + 1) * H).toISOString();
    return {
      fetched_at: "2026-11-20T21:14:00.000Z",
      data: {
        results: GATES.filter((gate) => !silent.has(gate)).map((gate) => ({
          source_identifier: gate,
          object_name: gate,
          measurements: [
            {
              key: "gate_increment_value_sum",
              name: "gate increment",
              unit: "",
              values: Array.from({ length: hours }, (_, hour) =>
                (["in", "out"] as const).flatMap((direction) => {
                  const value = rule(gate, date, hour, direction);
                  if (value === null) return [];
                  return [{ point: { time: pointTime(hour), value: direction === "in" ? value : -value }, tags: { direction: direction === "in" ? "1" : "-1" } }];
                }),
              ).flat(),
            },
          ],
        })),
      },
    };
  }

  return {
    ...original,
    getCachedDay: async (_view: string, date: string) => {
      if (cacheError) throw cacheError;
      calls.push({ kind: "day", date });
      return day(date);
    },
    getCachedRange: async (_view: string, start: Date, stop: Date) => {
      if (cacheError) throw cacheError;
      calls.push({ kind: "range", date: pragueDate(start.getTime()), stop: stop.toISOString() });
      return day(pragueDate(start.getTime()));
    },
  };
});

const { trafficSeries } = await import("../lib/citiq/series");

// Čtvrtek 20. 11. 2026, 22:00 pražského času: 19. 11. je celý uplynulý den.
const NOW = new Date("2026-11-20T21:00:00Z");
const run = (params: Parameters<typeof trafficSeries>[0], now = NOW) => trafficSeries(params, { now });

beforeEach(() => {
  rule = () => 1;
  silent = new Set();
  cacheError = null;
  calls.length = 0;
});

describe("trafficSeries: po hodinách", () => {
  it("skupina blízkých bran (Kafkova, 39 m) a oba směry se sečtou, hodiny sedí na pražský čas", async () => {
    rule = (gate, _date, hour, direction) => (gate === "Kafkova - levá" ? 100 : 10) + hour + (direction === "out" ? 1000 : 0);
    const result = await run({ gates: ["Kafkova"], direction: "both", from: "2026-11-19T00:00", to: "2026-11-19T24:00", granularity: "hour" });
    if (!result.ok) throw new Error(result.error.message);

    const { buckets, series } = result.data;
    expect(buckets).toHaveLength(24);
    expect(buckets[0]).toEqual({ label: "0:00", start: "2026-11-18T23:00:00.000Z", end: "2026-11-19T00:00:00.000Z" });
    expect(buckets[23].label).toBe("23:00");
    // hodina h: levá (100+h) + (1100+h), pravá (10+h) + (1010+h)
    expect(series[0].values[0]).toBe(100 + 1100 + 10 + 1010);
    expect(series[0].values[23]).toBe(100 + 1100 + 10 + 1010 + 4 * 23);
    expect(series[0]).toMatchObject({ gate: "Kafkova (obě brány)", sensors: ["Kafkova - levá", "Kafkova - pravá"] });
    expect(series[0].coverage).toEqual({ hours: 24, of: 24 });
  });

  it("vzdálené brány (17. listopadu, 684 m) se nesčítají: každá brána zvlášť, směry sečtené", async () => {
    rule = (gate, _date, _hour, direction) => (gate === "17.listopadu JIH" ? 100 : 10) + (direction === "out" ? 1 : 0);
    const result = await run({ gates: ["17. listopadu"], direction: "both", from: "2026-11-19T08:00", to: "2026-11-19T10:00", granularity: "hour" });
    if (!result.ok) throw new Error(result.error.message);
    expect(result.data.series.map((s) => [s.gate, s.values])).toEqual([
      ["17.listopadu JIH", [201, 201]],
      ["17.listopadu Sever", [21, 21]],
    ]);
  });

  it("výslovně sloučené vzdálené brány se sčítají uvnitř každého dne do jedné řady", async () => {
    rule = (gate) => (gate === "17.listopadu JIH" ? 2 : 3);
    const result = await run({
      gates: ["17. listopadu"],
      combineGates: true,
      direction: "in",
      from: "2026-11-17T00:00",
      to: "2026-11-19T00:00",
      granularity: "day",
    });
    if (!result.ok) throw new Error(result.error.message);

    expect(result.data.series).toHaveLength(1);
    expect(result.data.series[0]).toMatchObject({
      gate: "17. listopadu (jih) + 17. listopadu (sever)",
      sensors: ["17.listopadu JIH", "17.listopadu Sever"],
      values: [5 * 24, 5 * 24],
      total: 5 * 48,
      coverage: { hours: 48, of: 48 },
    });
    expect(result.meta.notes).toContain("Součet zahrnuje průjezdy na všech vybraných branách; stejné vozidlo může být započteno na více branách.");
  });

  it("při sloučení vynechá hodiny, kdy chybí data alespoň z jedné brány", async () => {
    rule = (gate, _date, hour) => (gate === "17.listopadu Sever" && hour === 2 ? null : gate === "17.listopadu JIH" ? 2 : 3);
    const result = await run({
      gates: ["17. listopadu"],
      combineGates: true,
      direction: "in",
      from: "2026-11-19T00:00",
      to: "2026-11-19T24:00",
      granularity: "day",
    });
    if (!result.ok) throw new Error(result.error.message);

    expect(result.data.series[0]).toMatchObject({
      values: [5 * 23],
      total: 5 * 23,
      coverage: { hours: 23, of: 24 },
    });
    expect(result.meta.notes).toContain("Součet zahrnuje jen hodiny s daty ze všech vybraných bran; 1 částečných hodin jsme vynechali.");
  });

  it("jen jeden směr", async () => {
    rule = (_gate, _date, _hour, direction) => (direction === "in" ? 3 : 7);
    const result = await run({ gates: ["Parkoviště Flora"], direction: "out", from: "2026-11-19T06:00", to: "2026-11-19T09:00", granularity: "hour" });
    if (!result.ok) throw new Error(result.error.message);
    expect(result.data.series[0].values).toEqual([7, 7, 7]);
    expect(result.data.buckets.map((b) => b.label)).toEqual(["6:00", "7:00", "8:00"]);
  });

  it("rozsah přes půlnoc: dva dny, popisky s dnem, dva dotazy na CITIQ", async () => {
    const result = await run({ gates: ["Flora"], direction: "in", from: "2026-11-18T22:00", to: "2026-11-19T02:00", granularity: "hour" });
    if (!result.ok) throw new Error(result.error.message);
    expect(result.data.buckets.map((b) => b.label)).toEqual(["st 18. 11. 22:00", "st 18. 11. 23:00", "čt 19. 11. 0:00", "čt 19. 11. 1:00"]);
    expect(result.meta.sources.map((s) => s.date)).toEqual(["2026-11-18", "2026-11-19"]);
  });

  it("chybějící hodina je null, ne 0, a je v poznámkách", async () => {
    rule = (_gate, _date, hour) => (hour === 3 ? null : 5);
    const result = await run({ gates: ["Flora"], direction: "both", from: "2026-11-19T02:00", to: "2026-11-19T05:00", granularity: "hour" });
    if (!result.ok) throw new Error(result.error.message);
    expect(result.data.series[0].values).toEqual([10, null, 10]);
    expect(result.data.series[0].coverage).toEqual({ hours: 2, of: 3 });
    expect(result.meta.notes).toContain("Parkoviště Flora: chybí data za 1 h, součet je neúplný.");
  });
});

describe("trafficSeries: součet vzdálených bran na přání", () => {
  it("„17. listopadu (součet bran)“ sečte jih a sever do jednoho čísla a upozorní na dvojí započtení", async () => {
    rule = (gate) => (gate === "17.listopadu JIH" ? 3 : 2);
    const result = await run({ gates: ["17. listopadu dohromady"], direction: "both", from: "2026-11-18T00:00", to: "2026-11-20T00:00", granularity: "day" });
    if (!result.ok) throw new Error(result.error.message);
    expect(result.data.series).toHaveLength(1);
    expect(result.data.series[0]).toMatchObject({ gate: "17. listopadu (součet bran)", values: [(3 + 2) * 2 * 24, (3 + 2) * 2 * 24] });
    expect(result.meta.notes).toContain("17. listopadu (součet bran): brány jsou 684 m od sebe, auto, které projede obě, je v součtu dvakrát.");
  });
});

describe("trafficSeries: po dnech a celkem", () => {
  it("po dnech pro víc míst", async () => {
    rule = (gate, date) => (gate === "Parkoviště Flora" ? 1 : 2) * Number(date.slice(-2));
    const result = await run({ gates: ["Flora", "u Billy"], direction: "in", from: "2026-11-17T00:00", to: "2026-11-20T00:00", granularity: "day" });
    if (!result.ok) throw new Error(result.error.message);
    expect(result.data.buckets.map((b) => b.label)).toEqual(["út 17. 11.", "st 18. 11.", "čt 19. 11."]);
    expect(result.data.series.map((s) => s.values)).toEqual([
      [17 * 24, 18 * 24, 19 * 24],
      [34 * 24, 36 * 24, 38 * 24],
    ]);
    expect(result.data.series[1].gate).toBe("Billa (Hynaisova)");
  });

  it("celkem: jeden bucket, součet = total", async () => {
    silent = new Set(["Kafkova - levá", "Kafkova - pravá"]);
    const result = await run({ gates: ["Flora", "Hynaisova", "Kafkova"], direction: "both", from: "2026-11-19T07:00", to: "2026-11-19T10:00", granularity: "total" });
    if (!result.ok) throw new Error(result.error.message);
    expect(result.data.buckets).toEqual([{ label: "Celkem", start: "2026-11-19T06:00:00.000Z", end: "2026-11-19T09:00:00.000Z" }]);
    expect(result.data.series.map((s) => s.values[0])).toEqual([6, 6, null]); // Kafkova v datech není
    expect(result.data.series.map((s) => s.total)).toEqual([6, 6, 0]);
    expect(result.meta.notes).toContain("Kafkova (obě brány): senzor v tomto čase nevysílal.");
  });

  it("vybrané nesouvislé dny vrátí jen jejich sloupce a nestahují mezilehlé dny", async () => {
    rule = (_gate, date) => Number(date.slice(-2));
    const result = await run({
      gates: ["Flora"],
      direction: "in",
      from: "2026-11-17T00:00",
      to: "2026-11-20T00:00",
      dates: ["2026-11-17", "2026-11-19"],
      granularity: "day",
    });
    if (!result.ok) throw new Error(result.error.message);

    expect(result.data.buckets.map((bucket) => bucket.label)).toEqual(["út 17. 11.", "čt 19. 11."]);
    expect(result.data.series[0].values).toEqual([17 * 24, 19 * 24]);
    expect(calls.map((call) => call.date)).toEqual(["2026-11-17", "2026-11-19"]);
    expect(result.meta.sources.map((source) => source.date)).toEqual(["2026-11-17", "2026-11-19"]);
  });

  it("součet přes vybrané dny zahrnuje jen jejich hodnoty", async () => {
    rule = (_gate, date) => Number(date.slice(-2));
    const result = await run({
      gates: ["Flora"],
      direction: "in",
      from: "2026-11-17T00:00",
      to: "2026-11-20T00:00",
      dates: ["2026-11-17", "2026-11-19"],
      granularity: "total",
    });
    if (!result.ok) throw new Error(result.error.message);

    expect(result.data.series[0].values).toEqual([(17 + 19) * 24]);
    expect(result.data.series[0].coverage).toEqual({ hours: 48, of: 48 });
    expect(calls.map((call) => call.date)).toEqual(["2026-11-17", "2026-11-19"]);
  });
});

describe("trafficSeries: dnešek a budoucnost", () => {
  it("konec v budoucnosti se ořízne na poslední celou hodinu, dnešek se stahuje jen do ní", async () => {
    const now = new Date("2026-11-20T14:20:00Z"); // 15:20 v Praze
    const result = await run({ gates: ["Flora"], direction: "both", from: "2026-11-20T08:00", to: "2026-11-20T18:00", granularity: "hour" }, now);
    if (!result.ok) throw new Error(result.error.message);
    expect(result.data.buckets.map((b) => b.label)).toEqual(["8:00", "9:00", "10:00", "11:00", "12:00", "13:00", "14:00"]);
    expect(result.meta.period).toMatchObject({ end: "2026-11-20T14:00:00.000Z", clipped: true });
    expect(calls).toEqual([{ kind: "range", date: "2026-11-20", stop: "2026-11-20T13:59:59.000Z" }]);
    expect(result.meta.notes[0]).toContain("do 15:00");
  });

  it("rozsah celý v budoucnosti je chyba", async () => {
    const result = await run({ gates: ["Flora"], direction: "both", from: "2026-11-21T08:00", to: "2026-11-21T10:00", granularity: "hour" });
    expect(result).toMatchObject({ ok: false, error: { code: "FUTURE" } });
  });
});

describe("trafficSeries: chyby a zdroj", () => {
  it("neznámé místo, špatný rozsah, příliš dlouhý rozsah", async () => {
    const base = { direction: "both", granularity: "day" } as const;
    expect(await run({ ...base, gates: ["Václavák"], from: "2026-11-19T00:00", to: "2026-11-20T00:00" })).toMatchObject({ ok: false, error: { code: "UNKNOWN_GATE" } });
    expect(await run({ ...base, gates: ["Flora"], from: "2026-11-19T10:00", to: "2026-11-19T10:00" })).toMatchObject({ ok: false, error: { code: "BAD_RANGE" } });
    expect(await run({ ...base, gates: ["Flora"], from: "2026-09-01T00:00", to: "2026-11-01T00:00" })).toMatchObject({ ok: false, error: { code: "RANGE_TOO_LONG" } });
    expect(await run({ ...base, gates: ["Flora"], from: "19. 11.", to: "2026-11-20T00:00" })).toMatchObject({ ok: false, error: { code: "BAD_PARAMS" } });
  });

  it("odmítne opakované nebo neplatné vybrané dny před stahováním", async () => {
    const base = {
      gates: ["Flora"],
      direction: "both" as const,
      from: "2026-11-17T00:00",
      to: "2026-11-20T00:00",
      granularity: "day" as const,
    };
    expect(await run({ ...base, dates: ["2026-11-17", "2026-11-17"] })).toMatchObject({ ok: false, error: { code: "BAD_PARAMS" } });
    expect(await run({ ...base, dates: ["2026-02-31"] })).toMatchObject({ ok: false, error: { code: "BAD_PARAMS" } });
    expect(calls).toHaveLength(0);
  });

  it("žádná data na žádném místě → NO_DATA", async () => {
    silent = new Set(["Zikova"]);
    expect(await run({ gates: ["Zikova"], direction: "both", from: "2026-11-19T00:00", to: "2026-11-20T00:00", granularity: "total" })).toMatchObject({
      ok: false,
      error: { code: "NO_DATA" },
    });
  });

  it("rate limit CITIQ rozpozná jako omezení počtu dotazů", async () => {
    cacheError = new CitiqError(429, "CITIQ: error (rate limit)");
    expect(await run({ gates: ["Flora"], direction: "both", from: "2026-11-19T00:00", to: "2026-11-20T00:00", granularity: "total" })).toMatchObject({
      ok: false,
      error: {
        code: "RATE_LIMIT_ERROR",
        message: "Zdroj dat dočasně omezuje počet dotazů. Zkuste to prosím za chvíli.",
      },
    });
  });

  it("odkaz na zdroj je přesný dotaz na CITIQ, dá se otevřít", async () => {
    const result = await run({ gates: ["Flora"], direction: "both", from: "2026-11-19T00:00", to: "2026-11-19T24:00", granularity: "total" });
    if (!result.ok) throw new Error(result.error.message);
    const url = new URL(result.meta.sources[0].url);
    expect(url.origin + url.pathname).toBe("https://iot.citiq.cloud/portal/api/v2/view/olomouc-traffic-gates/");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      format: "json",
      start: "2026-11-18T23:00:00.000Z",
      stop: "2026-11-19T22:59:59.000Z",
      window: "1h",
      measurement_keys: "gate_increment_value",
      agg_func: "sum",
      group_by_tags: "direction",
    });
  });
});
