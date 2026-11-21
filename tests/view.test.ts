import { describe, expect, it } from "vitest";
import { axisFor } from "../lib/ui/chart";
import { FIXTURES } from "../lib/ui/fixtures";
import { ChartViewSchema, colorSlots, customAxisError, defaultView, formatOptions, slotColor } from "../lib/view";

const ok = (name: string) => {
  const result = FIXTURES[name].result;
  if (!result?.ok) throw new Error(`fixture ${name} nemá výsledek`);
  return result;
};

describe("výchozí vzhled", () => {
  it("převezme typ, nadpis a pozadí od AI, QR zapnutý", () => {
    expect(defaultView(FIXTURES.bar)).toEqual({ format: "bar", title: "Stav nyní", background: "cervena", colors: [], axis: { mode: "auto" }, qr: true });
  });
  it("věta a zdroj dat → sloupcový graf", () => {
    expect(defaultView(FIXTURES.text).format).toBe("bar");
    expect(defaultView(FIXTURES.source).format).toBe("bar");
  });
});

describe("typy grafu v editoru", () => {
  const disabled = (name: string) => Object.fromEntries(formatOptions(ok(name)).map((o) => [o.format, o.disabled !== null]));
  it("celkem za místa: čárový nejde (žádný průběh), koláč ano", () => {
    expect(disabled("bar")).toEqual({ bar: false, line: true, pie: false, table: false });
  });
  it("jedno místo po hodinách: koláč má moc výsečí (24)", () => {
    expect(disabled("table")).toEqual({ bar: false, line: false, pie: true, table: false });
  });
  it("7 dní jednoho místa: koláč nad 6 výsečí nejde", () => {
    expect(formatOptions(ok("line")).find((o) => o.format === "pie")?.disabled).toContain("moc (7");
  });
});

describe("barvy", () => {
  it("položky = místa; u koláče jednoho místa období", () => {
    expect(colorSlots(ok("bar"), "bar")).toEqual(["17. listopadu", "Kafkova", "Billa (Hynaisova)"]);
    expect(colorSlots(ok("line"), "pie")).toHaveLength(7);
  });
  it("výchozí barva v editoru odpovídá grafu: sloupce „celkem za místo“ jednou barvou", () => {
    expect(slotColor({ colors: [], background: null }, 2, true)).toBe("#0B4F96");
    expect(slotColor({ colors: [], background: null }, 2, false)).toBe("#B3261E");
  });
  it("vlastní barva má přednost, jinak paleta pozadí (bez volby bílé)", () => {
    expect(slotColor({ colors: [null, "#FF0000"], background: "cervena" }, 1)).toBe("#FF0000");
    expect(slotColor({ colors: [], background: "cervena" }, 0)).toBe("#FFFFFF");
    expect(slotColor({ colors: [], background: null }, 0)).toBe("#0B4F96");
    expect(slotColor({ colors: [], background: "tmava" }, 0)).toBe("#8EC5FF");
  });
});

describe("vlastní osa", () => {
  const values = [21500, 23000];
  it("musí obsáhnout všechny hodnoty, jinak by uřízla sloupce", () => {
    expect(customAxisError(values, 15000, 25000)).toBeNull();
    expect(customAxisError(values, 22000, 25000)).toContain("nejvýš 21");
    expect(customAxisError(values, 15000, 22000)).toContain("aspoň 23");
    expect(customAxisError(values, 20000, 20000)).toContain("menší než konec");
    expect(customAxisError(values, -5, 25000)).toContain("pod nulou");
    expect(customAxisError(values, Number.NaN, 25000)).toContain("obě čísla");
  });
  it("osa podle nastavení: od nuly, vlastní (označená, když nezačíná nulou), neplatná → automaticky", () => {
    expect(axisFor(values, { mode: "zero" })).toMatchObject({ min: 0, zoomed: false });
    expect(axisFor(values, { mode: "custom", min: 15000, max: 25000 })).toMatchObject({ min: 15000, max: 25000, zoomed: true });
    expect(axisFor(values, { mode: "custom", min: 15000, max: 25000 }).ticks[0]).toBe(15000);
    expect(axisFor(values, { mode: "custom", min: 0, max: 30000 })).toMatchObject({ min: 0, zoomed: false });
    expect(axisFor(values, { mode: "custom", min: 22000, max: 25000 })).toEqual(axisFor(values, { mode: "auto" }));
  });
});

describe("schéma vzhledu (kontrola na serveru)", () => {
  const view = defaultView(FIXTURES.bar);
  it("projde platný vzhled", () => {
    expect(ChartViewSchema.safeParse({ ...view, colors: ["#AABBCC", null] }).success).toBe(true);
  });
  it("odmítne cizí pole, špatnou barvu a neznámou paletu", () => {
    expect(ChartViewSchema.safeParse({ ...view, result: { ok: true } }).success).toBe(false);
    expect(ChartViewSchema.safeParse({ ...view, colors: ["red"] }).success).toBe(false);
    expect(ChartViewSchema.safeParse({ ...view, background: "duhova" }).success).toBe(false);
  });
});

describe("graf: výchozí barvy beze změny, vlastní jen kde je uživatel nastavil, QR jde vypnout", async () => {
  const { createElement } = await import("react");
  const { renderToStaticMarkup } = await import("react-dom/server");
  const { default: Chart } = await import("../components/charts/Chart");
  const { PALETTE } = await import("../lib/ai/palette");
  const result = ok("bar");
  const render = (props: Record<string, unknown>) =>
    renderToStaticMarkup(createElement(Chart, { kind: "bar", result, title: "Test", colors: PALETTE.bila, ...props }));
  const barFills = (html: string) => [...html.matchAll(/<rect x="[^"]*" y="[^"]*" width="[^"]*" height="[^"]*" rx="3" fill="([^"]+)"/g)].map((m) => m[1]);

  it("bez úprav: všechny sloupce první barvou palety (jako dřív)", () => {
    expect(barFills(render({}))).toEqual(["#0B4F96", "#0B4F96", "#0B4F96"]);
  });
  it("vlastní barva jen u druhého místa", () => {
    expect(barFills(render({ slotColors: [null, "#FF0000"] }))).toEqual(["#0B4F96", "#FF0000", "#0B4F96"]);
  });
  it("QR: s odkazem je v grafu, bez něj (vypnutý) ne", () => {
    expect(render({ qrUrl: "https://osk.example.cz/a/QkfDiTzpk7" })).toContain("Ověřit data");
    expect(render({ qrUrl: null })).not.toContain("Ověřit data");
  });
});
