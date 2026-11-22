import type Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it } from "vitest";
import { ask, type AskDeps } from "../lib/ai/ask";
import { buildAnswerTool, weatherSeriesTool } from "../lib/ai/tools";
import { effectiveView } from "../components/ViewChart";
import { formatOptions } from "../lib/view";
import type { SeriesParams, SeriesResult } from "../lib/citiq/series";
import type { WeatherSeriesParams, WeatherSeriesResult } from "../lib/citiq/weatherSeries";
import type { WeatherMetricKey } from "../lib/citiq/weatherStations";

// Falešný Claude: vrací předem připravené odpovědi popořadě a pamatuje si, co dostal.
function fakeClient(responses: Partial<Anthropic.Message>[]) {
  const calls: Anthropic.MessageCreateParamsNonStreaming[] = [];
  return {
    calls,
    messages: {
      async create(params: Anthropic.MessageCreateParamsNonStreaming) {
        calls.push(structuredClone(params));
        const next = responses.shift();
        if (!next) throw new Error("došly připravené odpovědi");
        return { usage: { input_tokens: 10, output_tokens: 5 }, ...next } as Anthropic.Message;
      },
    },
  };
}

const toolUse = (input: object, id = "tu_1", name = "build_answer"): Partial<Anthropic.Message> => ({
  stop_reason: "tool_use",
  content: [
    { type: "thinking", thinking: "", signature: "sig" },
    { type: "tool_use", id, name, input, caller: { type: "direct" } },
  ] as Anthropic.ContentBlock[],
});
const text = (value: string): Partial<Anthropic.Message> => ({
  stop_reason: "end_turn",
  content: [{ type: "text", text: value, citations: null }] as Anthropic.ContentBlock[],
});

// Falešný výpočet: každé místo má v každém bucketu 100 × (pořadí místa + 1), poslední bucket místa 1 je 250.
const seriesCalls: SeriesParams[] = [];
async function fakeSeries(params: SeriesParams): Promise<SeriesResult> {
  seriesCalls.push(params);
  if (params.from.startsWith("2026-12")) return { ok: false, error: { code: "FUTURE", message: "Na budoucnost data nemám.", suggestions: [] } };
  const labels = params.granularity === "total" ? ["Celkem"] : ["8:00", "9:00", "10:00"];
  return {
    ok: true,
    data: {
      granularity: params.granularity,
      buckets: labels.map((label) => ({ label, start: "2026-11-19T07:00:00.000Z", end: "2026-11-19T08:00:00.000Z" })),
      series: params.gates.map((gate, g) => {
        const values = labels.map((_, i) => (g === 0 && i === labels.length - 1 && labels.length > 1 ? 250 : 100 * (g + 1)));
        return { gate, sensors: [gate], values, total: values.reduce((a, b) => a + b, 0), coverage: { hours: 3, of: 3 } };
      }),
    },
    meta: {
      tool: "traffic_series",
      params,
      period: { start: "2026-11-19T07:00:00.000Z", end: "2026-11-19T10:00:00.000Z", clipped: false },
      sources: [{ date: "2026-11-19", url: "https://iot.citiq.cloud/portal/api/v2/view/olomouc-traffic-gates/?x", fetched_at: "2026-11-20T10:00:00.000Z" }],
      notes: [],
    },
  };
}

function deps(client: ReturnType<typeof fakeClient>): AskDeps {
  seriesCalls.length = 0;
  return {
    client,
    model: "test",
    now: new Date("2026-11-20T18:00:00Z"),
    trafficSeries: fakeSeries,
    weatherSeries: async () => ({ ok: false, code: "NOT_CONFIGURED", message: "Weather mock not configured." }),
  };
}

const spec = {
  format: "bar",
  title: null,
  background: null,
  gates: ["17. listopadu (obě brány)", "Parkoviště Flora"],
  combine_gates: false,
  direction: "both",
  from: "2026-11-19T08:00",
  to: "2026-11-19T11:00",
  dates: [],
  periods: [],
  granularity: "hour",
  date_assumed: false,
};
const weatherSpec = {
  format: "bar",
  title: null,
  background: null,
  stations: ["Tržnice.meteostanice"],
  metrics: ["device_device_frmpayload_data_hih_temp"] as WeatherMetricKey[],
  from: "2026-11-19T08:00",
  to: "2026-11-19T11:00",
  dates: [],
  periods: [],
  granularity: "hour",
  date_assumed: false,
};
const weatherCalls: WeatherSeriesParams[] = [];
const fakeWeather: WeatherSeriesResult = {
  ok: true,
  data: {
    granularity: "hour",
    buckets: ["8:00", "9:00", "10:00"].map((label) => ({
      label,
      start: "2026-11-19T07:00:00.000Z",
      end: "2026-11-19T08:00:00.000Z",
    })),
    series: [
      {
        gate: "Tržnice.meteostanice · temperature (°C)",
        station: "Tržnice.meteostanice",
        metric: "device_device_frmpayload_data_hih_temp",
        unit: "°C",
        sensors: ["TMaBoxXbvgezGR4LrQL7cw"],
        values: [9, 10, 11],
        mean: 10,
        coverage: { hours: 3, of: 3 },
      },
    ],
  },
  meta: {
    tool: "weather_series",
    params: {
      stations: ["Tržnice.meteostanice"],
      metrics: ["device_device_frmpayload_data_hih_temp"],
      from: "2026-11-19T08:00",
      to: "2026-11-19T11:00",
      granularity: "hour",
    },
    period: { start: "2026-11-19T07:00:00.000Z", end: "2026-11-19T10:00:00.000Z", clipped: false },
    sources: [{ date: "2026-11-19", url: "https://iot.citiq.cloud/portal/api/v2/view/meteorological-data-olomouc/?agg_func=mean", fetched_at: "2026-11-20T10:00:00.000Z" }],
    notes: [],
  },
};

describe("build_answer: nástroj", () => {
  it("strict schéma vyžaduje všechna pole", () => {
    expect(buildAnswerTool.strict).toBe(true);
    expect(buildAnswerTool.input_schema.required).toEqual(["format", "title", "background", "gates", "combine_gates", "relation", "typical_profile", "direction", "from", "to", "dates", "periods", "granularity", "date_assumed"]);
  });

  it("weather_series má samostatné strict schéma bez dopravního směru", () => {
    expect(weatherSeriesTool.strict).toBe(true);
    expect(weatherSeriesTool.input_schema.required).toEqual(["format", "title", "background", "stations", "metrics", "relation", "typical_profile", "from", "to", "dates", "periods", "granularity", "date_assumed"]);
    expect(weatherSeriesTool.input_schema.properties).not.toHaveProperty("direction");
    expect(weatherSeriesTool.description).toContain("humidity (%)");
  });
});

describe("ask: meteorologická data", () => {
  it("volá samostatný weather tool a vynutí tabulku pro veličiny s různými jednotkami", async () => {
    weatherCalls.length = 0;
    const multiMetricResult: WeatherSeriesResult = {
      ...fakeWeather,
      meta: {
        ...fakeWeather.meta,
        params: {
          ...fakeWeather.meta.params,
          metrics: [...weatherSpec.metrics, "device_device_frmpayload_data_hih_relh"],
        },
      },
      data: {
        ...fakeWeather.data,
        series: [
          ...fakeWeather.data.series,
          {
            ...fakeWeather.data.series[0],
            gate: "Tržnice.meteostanice · humidity (%)",
            metric: "device_device_frmpayload_data_hih_relh",
            unit: "%",
            mean: 62,
            values: [60, 62, 64],
          },
        ],
      },
    };
    const answer = await ask("Jaká byla teplota a vlhkost?", {
      ...deps(fakeClient([toolUse({ ...weatherSpec, metrics: [...weatherSpec.metrics, "device_device_frmpayload_data_hih_relh"] }, "tu_weather", "weather_series")])),
      weatherSeries: async (params) => {
        weatherCalls.push(params);
        return multiMetricResult;
      },
    });

    expect(weatherSeriesTool.name).toBe("weather_series");
    expect(answer).toMatchObject({ kind: "answer", format: "table" });
    expect(answer.notes).toContain("Veličiny mají různé jednotky, proto místo společného grafu ukazujeme tabulku.");
    if (!answer.result?.ok) throw new Error("weather response should have a result");
    expect(formatOptions(answer.result).filter((option) => option.format !== "table").every((option) => option.disabled !== null)).toBe(true);
    expect(effectiveView(answer, { format: "bar", title: "", background: null, colors: [], axis: { mode: "auto" }, qr: false })?.format).toBe("table");
    expect(weatherCalls).toEqual([
      {
        stations: ["Tržnice.meteostanice"],
        metrics: ["device_device_frmpayload_data_hih_temp", "device_device_frmpayload_data_hih_relh"],
        from: weatherSpec.from,
        to: weatherSpec.to,
        granularity: "hour",
      },
    ]);
  });

  it("souhrn pro text obsahuje vypočtený průměr s jednotkou", async () => {
    const client = fakeClient([toolUse({ ...weatherSpec, format: "text" }, "tu_weather", "weather_series"), text("Průměrná teplota byla 10 °C.")]);
    const answer = await ask("Jaká byla teplota?", {
      ...deps(client),
      weatherSeries: async () => fakeWeather,
    });
    expect(answer).toMatchObject({ kind: "answer", format: "text", sentence_source: "ai" });
    const result = client.calls[1].messages[2].content as Anthropic.ToolResultBlockParam[];
    expect(JSON.parse(String(result[0].content)).stations[0]).toMatchObject({
      // Claude dostane názvy pro lidi, ne interní „Tržnice.meteostanice“ / „temperature“.
      station: "Tržnice",
      metric: "teplota",
      unit: "°C",
      mean: 10,
    });
  });
});

describe("ask: grafy a tabulky", () => {
  it("otázka na možnosti datasetu vrátí pevný uživatelský briefing bez volání modelu", async () => {
    const client = fakeClient([]);
    const answer = await ask("Na co se mohu zeptat?", deps(client));
    expect(answer).toMatchObject({
      kind: "unknown",
      format: null,
      sentence_source: "fixed",
      reason: { code: "DATASET_HELP" },
    });
    expect(answer.sentence).toContain("počty vozidel");
    expect(answer.sentence).toContain("graf");
    expect(client.calls).toHaveLength(0);
  });

  it("graf: jedno volání modelu, žádná věta, nadpis složí kód", async () => {
    const client = fakeClient([toolUse(spec)]);
    const answer = await ask("Porovnej 17. listopadu a Floru včera od 8 do 11", deps(client));
    expect(client.calls).toHaveLength(1);
    expect(answer).toMatchObject({ kind: "answer", format: "bar", sentence: null, sentence_source: null, background: null });
    expect(answer.title).toBe("Počet vozidel · 17. listopadu, Parkoviště Flora · 19. 11. 2026, 8:00–11:00");
    expect(seriesCalls).toEqual([
      { gates: spec.gates, combineGates: false, direction: "both", from: "2026-11-19T08:00", to: "2026-11-19T11:00", granularity: "hour" },
    ]);
  });

  it("předá přesný výběr nesouvislých dní do deterministického výpočtu", async () => {
    const dates = ["2026-11-17", "2026-11-19"];
    const input = {
      ...spec,
      from: "2026-11-17T00:00",
      to: "2026-11-20T00:00",
      dates,
      granularity: "day",
    };
    const answer = await ask("Ukaž sloupcově úterý a čtvrtek bez dnů mezi nimi", deps(fakeClient([toolUse(input)])));

    expect(seriesCalls[0]).toMatchObject({ dates, from: input.from, to: input.to, granularity: "day" });
    expect(answer.title).toContain("úterý 17. 11. 2026 a čtvrtek 19. 11. 2026");
  });

  it("volá výpočet samostatně pro každé srovnávané období", async () => {
    const periods = [
      { from: "2026-11-17T00:00", to: "2026-11-18T00:00" },
      { from: "2026-11-19T00:00", to: "2026-11-20T00:00" },
    ];
    const input = {
      ...spec,
      gates: ["Parkoviště Flora"],
      from: periods[0].from,
      to: periods[1].to,
      periods,
      granularity: "period",
    };
    const answer = await ask("Porovnej pondělí a středu", deps(fakeClient([toolUse(input)])));

    expect(seriesCalls).toHaveLength(2);
    expect(seriesCalls.map(({ from, to, granularity }) => ({ from, to, granularity }))).toEqual(
      periods.map((period) => ({ ...period, granularity: "total" })),
    );
    expect(answer).toMatchObject({ kind: "answer", format: "bar", title: expect.stringContaining("srovnání 2 období") });
    expect(answer.result).toMatchObject({ ok: true, data: { granularity: "period", buckets: [{}, {}], comparison: { periods: [{}, {}] } } });
  });

  it("různě dlouhá období: Claude dostane jen průměr za hodinu, věta se součty neprojde", async () => {
    const periods = [
      { from: "2026-11-17T00:00", to: "2026-11-18T00:00" },
      { from: "2026-11-18T00:00", to: "2026-11-20T00:00" },
    ];
    const input = { ...spec, format: "text", gates: ["Parkoviště Flora"], from: periods[0].from, to: periods[1].to, periods, granularity: "period" };
    const client = fakeClient([toolUse(input), text("Projelo 100 vozidel oproti 100 vozidlům.")]);
    const answer = await ask("Porovnej úterý se středou a čtvrtkem", deps(client));

    const toolResult = client.calls[1].messages[2].content as Anthropic.ToolResultBlockParam[];
    const summary = JSON.parse(String(toolResult[0].content));
    expect(summary.comparison).toMatchObject({ basis: "traffic_per_hour", compare_by: expect.stringContaining("za hodinu") });
    expect(summary.places[0].periods[0]).not.toHaveProperty("total_vehicles");
    expect(summary.places[0].periods[0]).toHaveProperty("vehicles_per_hour");
    // Součet (100) v shrnutí není, proto věta se součty neprojde a větu složí kód.
    expect(answer.sentence_source).toBe("fallback");
  });

  it("nadpis a barva od uživatele projdou", async () => {
    const answer = await ask("…s červeným pozadím a nadpisem Stav nyní", deps(fakeClient([toolUse({ ...spec, title: "Stav nyní", background: "cervena" })])));
    expect(answer).toMatchObject({ title: "Stav nyní", background: "cervena" });
  });

  it("nadpis s vymyšleným číslem nahradí kód; číslo z otázky je v pořádku", async () => {
    const invented = await ask("graf", deps(fakeClient([toolUse({ ...spec, title: "Celkem 99999 aut" })])));
    expect(invented.title).toMatch(/^Počet vozidel/);
    const fromQuestion = await ask("graf s nadpisem Posledních 7 hodin", deps(fakeClient([toolUse({ ...spec, title: "Posledních 7 hodin" })])));
    expect(fromQuestion.title).toBe("Posledních 7 hodin");
  });

  it("koláč s víc místy počítá jedno číslo za místo", async () => {
    const answer = await ask("koláč", deps(fakeClient([toolUse({ ...spec, format: "pie" })])));
    expect(seriesCalls[0].granularity).toBe("total");
    expect(answer.format).toBe("pie");
  });

  it("koláč s moc položkami → sloupcový graf s poznámkou", async () => {
    const gates = ["Fisherova", "Fugnerova", "Peškova", "Zikova", "U Letadla", "Voskovcova", "Parkoviště Flora"];
    const answer = await ask("koláč všech", deps(fakeClient([toolUse({ ...spec, format: "pie", gates })])));
    expect(answer.format).toBe("bar");
    expect(answer.notes).toContain("Na koláčový graf je položek moc (7), ukazujeme sloupcový.");
  });

  it("zdroj dat: pevná věta, odkazy jsou ve výsledku", async () => {
    const answer = await ask("Dej mi kód, kterým si to stáhnu", deps(fakeClient([toolUse({ ...spec, format: "source" })])));
    expect(answer).toMatchObject({ format: "source", sentence_source: "fixed" });
    expect(answer.sentence).toContain("CITIQ");
    expect(answer.result?.ok && answer.result.meta.sources[0].url).toContain("olomouc-traffic-gates");
  });

  it("date_assumed → poznámka pro uživatele", async () => {
    const answer = await ask("graf Flory", deps(fakeClient([toolUse({ ...spec, date_assumed: true })])));
    expect(answer.notes).toContain("V otázce nebyl čas, ukazujeme celý včerejšek.");
  });
});

describe("ask: konverzace", () => {
  it("Claude dostane otázku, zadání a odpověď předchozích otázek a novou otázku", async () => {
    const previous = await ask("Kolik aut projelo včera na Floře?", deps(fakeClient([toolUse({ ...spec, gates: ["Parkoviště Flora"] })])));
    const client = fakeClient([toolUse({ ...spec, gates: ["Parkoviště Flora"], from: "2026-11-18T08:00", to: "2026-11-18T11:00" })]);
    await ask("a předevčírem?", { ...deps(client), context: [previous] });
    const content = String(client.calls[0].messages[0].content);
    expect(content).toContain("1) Otázka: Kolik aut projelo včera na Floře?");
    expect(content).toContain('"gates":["Parkoviště Flora"]');
    expect(content).toContain(`Odpověď: ${previous.title}`);
    expect(content.endsWith("Nová otázka: a předevčírem?")).toBe(true);
  });

  it("bez kontextu dostane Claude jen otázku", async () => {
    const client = fakeClient([toolUse(spec)]);
    await ask("graf", deps(client));
    expect(client.calls[0].messages[0].content).toBe("graf");
  });
});

describe("ask: věta (format text)", () => {
  const textSpec = { ...spec, format: "text", gates: ["17. listopadu (obě brány)"] };

  it("Claude dostane spočítané shrnutí a jeho věta projde kontrolou", async () => {
    const client = fakeClient([toolUse(textSpec), text("Na 17. listopadu projelo 19. 11. mezi 8:00 a 11:00 celkem 450 vozidel, nejvíc mezi 10:00 a 11:00 (250).")]);
    const answer = await ask("Kolik aut projelo?", deps(client));
    expect(answer).toMatchObject({ kind: "answer", format: "text", sentence_source: "ai" });
    const toolResult = client.calls[1].messages[2].content as Anthropic.ToolResultBlockParam[];
    const summary = JSON.parse(String(toolResult[0].content));
    expect(summary.places[0]).toMatchObject({ place: "17. listopadu", total: 450, peak: { label: "10:00", value: 250 } });
  });

  it("vymyšlené číslo ve větě → větu složí kód", async () => {
    const answer = await ask("Kolik aut?", deps(fakeClient([toolUse(textSpec), text("Projelo 512 vozidel.")])));
    expect(answer).toMatchObject({ sentence_source: "fallback", sentence: "19. 11. 2026, 8:00–11:00: 17. listopadu 450 vozidel." });
    expect(answer.trace.steps.find((s) => s.type === "check")).toMatchObject({ passed: false, not_allowed: [512] });
  });

  it("markdown se z věty odstraní", async () => {
    const answer = await ask("Kolik?", deps(fakeClient([toolUse(textSpec), text("**Projelo 450 vozidel.**")])));
    expect(answer.sentence).toBe("Projelo 450 vozidel.");
  });
});

describe("ask: nevím a chyby", () => {
  it("bez nástroje → OUT_OF_SCOPE s pevnou větou", async () => {
    const answer = await ask("Kdo vyhrál zápas?", deps(fakeClient([text("To nevím.")])));
    expect(answer).toMatchObject({ kind: "unknown", reason: { code: "OUT_OF_SCOPE" }, sentence_source: "fixed" });
  });

  it("chyba výpočtu → nevím s důvodem, druhé volání modelu se nedělá", async () => {
    const client = fakeClient([toolUse({ ...spec, from: "2026-12-01T08:00", to: "2026-12-01T10:00" })]);
    const answer = await ask("Kolik aut projede zítra?", deps(client));
    expect(answer).toMatchObject({ kind: "unknown", reason: { code: "FUTURE" }, sentence: "Na budoucnost data nemám." });
    expect(client.calls).toHaveLength(1);
  });

  it("neplatné zadání → Claude dostane chybu a opraví ho", async () => {
    const client = fakeClient([toolUse({ ...spec, from: "včera ráno" }, "tu_1"), toolUse(spec, "tu_2")]);
    const answer = await ask("graf", deps(client));
    const retry = client.calls[1].messages[2].content as Anthropic.ToolResultBlockParam[];
    expect(retry[0]).toMatchObject({ type: "tool_result", tool_use_id: "tu_1", is_error: true });
    expect(answer).toMatchObject({ kind: "answer", format: "bar" });
  });

  it("výjimka ve výpočtu → SOURCE_ERROR", async () => {
    const answer = await ask("graf", {
      ...deps(fakeClient([toolUse(spec)])),
      trafficSeries: async () => {
        throw new Error("fetch failed");
      },
    });
    expect(answer).toMatchObject({ kind: "unknown", reason: { code: "SOURCE_ERROR" } });
  });
});
