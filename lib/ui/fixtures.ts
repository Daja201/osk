// Testovací odpovědi pro ladění vzhledu bez AI a sítě: /?fixture=bar (line, pie, table, text, source,
// fallback, out-of-scope, no-data, error). Stejný tvar jako skutečné /api/ask. Čísla jsou ze skutečných běhů 21. 11. 2026.
import type { AskAnswer, TraceStep } from "../ai/types";
import type { BuildAnswerInput } from "../ai/tools";
import type { Granularity, SeriesOk } from "../citiq/series";

const NOW = "2026-11-21T10:30:00.000Z"; // 11:30 pražského času
const H = 3600 * 1000;
const url = (date: string) =>
  `https://iot.citiq.cloud/portal/api/v2/view/olomouc-traffic-gates/?format=json&start=${date}T00%3A00%3A00.000Z&stop=${date}T23%3A59%3A59.000Z&window=1h&measurement_keys=gate_increment_value&agg_func=sum&group_by_tags=direction`;

// Výsledek výpočtu ze zadaných hodnot (jedna řada na místo).
function result(
  spec: BuildAnswerInput,
  granularity: Granularity,
  buckets: { label: string; start: string }[],
  places: { gate: string; sensors?: string[]; values: (number | null)[]; hours?: [number, number] }[],
  period: [string, string],
  notes: string[] = [],
): SeriesOk {
  const dates = [...new Set(buckets.map((b) => b.start.slice(0, 10)))];
  return {
    ok: true,
    data: {
      granularity,
      // „Celkem“ končí s obdobím (jako v lib/citiq/series.ts), hodina / den o hodinu / den později.
      buckets: buckets.map((b) => ({
        ...b,
        end: granularity === "total" ? period[1] : new Date(Date.parse(b.start) + (granularity === "day" ? 24 : 1) * H).toISOString(),
      })),
      series: places.map((p) => ({
        gate: p.gate,
        sensors: p.sensors ?? [p.gate],
        values: p.values,
        total: p.values.reduce<number>((sum, v) => sum + (v ?? 0), 0),
        coverage: { hours: p.hours?.[0] ?? 24, of: p.hours?.[1] ?? 24 },
      })),
    },
    meta: {
      tool: "traffic_series",
      params: { gates: spec.gates, direction: spec.direction, from: spec.from, to: spec.to, granularity },
      period: { start: period[0], end: period[1], clipped: false },
      sources: dates.map((date) => ({ date, url: url(date), fetched_at: "2026-11-21T10:05:00.000Z" })),
      notes,
    },
  };
}

const model = (ms: number, stop: string): TraceStep => ({ type: "model", ms, input_tokens: 2400, output_tokens: 120, stop_reason: stop });
const tool = (spec: BuildAnswerInput, ms: number, ok = true): TraceStep => ({ type: "tool", name: "build_answer", input: spec, ms, ok });

function answer(question: string, rest: Partial<AskAnswer> & Pick<AskAnswer, "trace">): AskAnswer {
  return {
    id: null,
    expires_at: null,
    question,
    created_at: NOW,
    kind: "answer",
    format: null,
    title: null,
    background: null,
    sentence: null,
    sentence_source: null,
    reason: null,
    spec: null,
    result: null,
    notes: [],
    view: null,
    ...rest,
  };
}

const trace = (steps: TraceStep[], total: number): AskAnswer["trace"] => ({ model: "claude-haiku-5-5", now: NOW, steps, total_ms: total });

const LISTOPADU = { gate: "17. listopadu (obě brány)", sensors: ["17.listopadu JIH", "17.listopadu Sever"] };
const KAFKOVA = { gate: "Kafkova (obě brány)", sensors: ["Kafkova - levá", "Kafkova - pravá"] };
const TOTAL = [{ label: "Celkem", start: "2026-11-21T07:00:00.000Z" }];

const barSpec: BuildAnswerInput = {
  format: "bar",
  title: "Stav nyní",
  background: "cervena",
  gates: [LISTOPADU.gate, KAFKOVA.gate, "Billa (Hynaisova)"],
  combine_gates: false,
  relation: "none",
  typical_profile: false,
  direction: "both",
  from: "2026-11-21T08:00",
  to: "2026-11-21T11:00",
  granularity: "total",
  date_assumed: false,
};
const barResult = result(
  barSpec,
  "total",
  TOTAL,
  [
    { ...LISTOPADU, values: [3314], hours: [3, 3] },
    { ...KAFKOVA, values: [3607], hours: [3, 3] },
    { gate: "Billa (Hynaisova)", values: [260], hours: [3, 3] },
  ],
  ["2026-11-21T07:00:00.000Z", "2026-11-21T10:00:00.000Z"],
);

const days = ["so 14. 11.", "ne 15. 11.", "po 16. 11.", "út 17. 11.", "st 18. 11.", "čt 19. 11.", "pá 20. 11."].map((label, i) => ({
  label,
  start: new Date(Date.parse("2026-11-13T23:00:00.000Z") + i * 24 * H).toISOString(),
}));
const lineSpec: BuildAnswerInput = { ...barSpec, format: "line", title: null, background: null, gates: ["Parkoviště Flora"], from: "2026-11-14T00:00", to: "2026-11-20T24:00", granularity: "day" };
const lineResult = result(lineSpec, "day", days, [{ gate: "Parkoviště Flora", values: [804, 272, 320, 179, 394, 453, 410], hours: [135, 168] }], ["2026-11-13T23:00:00.000Z", "2026-11-20T23:00:00.000Z"], [
  "Parkoviště Flora: chybí data za 33 h, součet je neúplný.",
]);

const pieSpec: BuildAnswerInput = { ...barSpec, format: "pie", title: null, background: "modra", from: "2026-11-20T00:00", to: "2026-11-20T24:00" };
const pieResult = result(
  pieSpec,
  "total",
  [{ label: "Celkem", start: "2026-11-19T23:00:00.000Z" }],
  [
    { ...LISTOPADU, values: [30067] },
    { ...KAFKOVA, values: [23418] },
    { gate: "Billa (Hynaisova)", values: [1936], hours: [21, 24] },
  ],
  ["2026-11-19T23:00:00.000Z", "2026-11-20T23:00:00.000Z"],
  ["Billa (Hynaisova): chybí data za 3 h, součet je neúplný."],
);

const hours = Array.from({ length: 24 }, (_, h) => ({ label: `${h}:00`, start: new Date(Date.parse("2026-11-19T23:00:00.000Z") + h * H).toISOString() }));
const tableSpec: BuildAnswerInput = { ...barSpec, format: "table", title: null, background: null, gates: ["Parkoviště Flora"], direction: "in", from: "2026-11-20T00:00", to: "2026-11-20T24:00", granularity: "hour" };
const floraIn = [null, null, 1, null, null, 3, 5, 4, 14, 6, 14, 12, 9, 8, 7, 3, 13, 2, 1, 1, null, 1, 1, null];
const tableResult = result(tableSpec, "hour", hours, [{ gate: "Parkoviště Flora", values: floraIn, hours: [18, 24] }], ["2026-11-19T23:00:00.000Z", "2026-11-20T23:00:00.000Z"], [
  "Parkoviště Flora: chybí data za 6 h, součet je neúplný.",
]);

const textSpec: BuildAnswerInput = { ...tableSpec, format: "text", gates: ["Billa (Hynaisova)"], direction: "both", from: "2026-11-16T00:00", to: "2026-11-17T00:00" };
const billa = [4, null, 2, null, 3, 4, 26, 89, 107, 133, 102, 108, 122, 106, 110, 97, 117, 90, 94, 66, 48, 16, 8, 10];
const textResult = result(
  textSpec,
  "hour",
  hours.map((h) => ({ ...h, start: new Date(Date.parse(h.start) - 4 * 24 * H).toISOString() })),
  [{ gate: "Billa (Hynaisova)", values: billa, hours: [22, 24] }],
  ["2026-11-15T23:00:00.000Z", "2026-11-16T23:00:00.000Z"],
  ["Billa (Hynaisova): chybí data za 2 h, součet je neúplný."],
);

const sourceSpec: BuildAnswerInput = { ...barSpec, format: "source", title: null, background: null, gates: [LISTOPADU.gate], from: "2026-11-20T00:00", to: "2026-11-20T24:00", date_assumed: true };
const sourceResult = result(sourceSpec, "total", [{ label: "Celkem", start: "2026-11-19T23:00:00.000Z" }], [{ ...LISTOPADU, values: [30067] }], [
  "2026-11-19T23:00:00.000Z",
  "2026-11-20T23:00:00.000Z",
]);

export const FIXTURES: Record<string, AskAnswer> = {
  bar: answer(
    "Udělej mi porovnání posledních 7 hodin od 15:00 do kruhového nebo sloupcového grafu s červeným pozadím a nadpisem Stav nyní, které ukáže počet aut, jež projely branami 17. listopadu, Kafkova a Billa",
    { format: "bar", title: "Stav nyní", background: "cervena", spec: barSpec, result: barResult, trace: trace([model(1900, "tool_use"), tool(barSpec, 3100)], 5200) },
  ),
  line: answer("Jak se měnil provoz na Floře posledních 7 dní?", {
    format: "line",
    title: "Počet vozidel · Parkoviště Flora · 14.–20. 11. 2026",
    spec: lineSpec,
    result: lineResult,
    notes: lineResult.meta.notes,
    trace: trace([model(2100, "tool_use"), tool(lineSpec, 3400)], 6500),
  }),
  pie: answer("Jaký podíl aut včera připadl na 17. listopadu, Kafkovu a Billu? Koláčový graf na modrém pozadí.", {
    format: "pie",
    title: "Počet vozidel · 17. listopadu, Kafkova, Billa (Hynaisova) · 20. 11. 2026",
    background: "modra",
    spec: pieSpec,
    result: pieResult,
    notes: pieResult.meta.notes,
    trace: trace([model(1800, "tool_use"), tool(pieSpec, 40)], 1900),
  }),
  table: answer("Dej mi tabulku vjezdů na parkoviště Flora včera po hodinách", {
    format: "table",
    title: "Vjezdy · Parkoviště Flora · 20. 11. 2026",
    spec: tableSpec,
    result: tableResult,
    notes: tableResult.meta.notes,
    trace: trace([model(2200, "tool_use"), tool(tableSpec, 12)], 2300),
  }),
  text: answer("Kdy byla v pondělí největší špička u Billy?", {
    format: "text",
    title: "Počet vozidel · Billa (Hynaisova) · 16. 11. 2026",
    sentence: "Největší špička u Billy (Hynaisova) v pondělí 16. 11. 2026 byla mezi 9:00 a 10:00, kdy projelo 133 vozidel. Data za 2 hodiny chybí, takže součet je neúplný.",
    sentence_source: "ai",
    spec: textSpec,
    result: textResult,
    notes: textResult.meta.notes,
    trace: trace(
      [model(2300, "tool_use"), tool(textSpec, 12), model(2600, "end_turn"), { type: "check", passed: true, numbers: [16, 11, 2026, 9, 10, 133, 2], not_allowed: [] }],
      4960,
    ),
  }),
  fallback: answer("Kolik aut projelo v pondělí u Billy?", {
    format: "text",
    title: "Počet vozidel · Billa (Hynaisova) · 16. 11. 2026",
    sentence: "16. 11. 2026: Billa (Hynaisova) 1 462 vozidel. Část dat chybí, součty jsou neúplné.",
    sentence_source: "fallback",
    spec: textSpec,
    result: textResult,
    notes: textResult.meta.notes,
    trace: trace(
      [model(2300, "tool_use"), tool(textSpec, 12), model(2400, "end_turn"), { type: "check", passed: false, numbers: [16, 1300], not_allowed: [1300] }],
      4800,
    ),
  }),
  source: answer("Odkud berete data? Dej mi kód, kterým si to stáhnu", {
    format: "source",
    title: "Počet vozidel · 17. listopadu · 20. 11. 2026",
    sentence:
      "Data bereme z otevřeného API senzorové sítě Olomouc (CITIQ, view olomouc-traffic-gates): hodinové součty průjezdů dopravními branami. Přesné dotazy pro tuto odpověď jsou v odkazech.",
    sentence_source: "fixed",
    spec: sourceSpec,
    result: sourceResult,
    notes: ["V otázce nebyl čas, ukazujeme celý včerejšek."],
    trace: trace([model(2700, "tool_use"), tool(sourceSpec, 9)], 2840),
  }),
  "out-of-scope": answer("Kdo vyhrál včera zápas Sigmy?", {
    kind: "unknown",
    sentence: "Na tohle odpovědět neumím – mám jen data o průjezdech vozidel dopravními branami v Olomouci.",
    sentence_source: "fixed",
    reason: { code: "OUT_OF_SCOPE", message: "Na tohle odpovědět neumím – mám jen data o průjezdech vozidel dopravními branami v Olomouci." },
    trace: trace([model(2080, "end_turn"), { type: "note", text: "Claude bez nástroje: …" }], 2084),
  }),
  "no-data": answer("Kolik aut včera projelo ulicí Zikova?", {
    kind: "unknown",
    sentence: "Senzory na vybraných místech v tomto čase neposlaly žádná data.",
    sentence_source: "fixed",
    reason: { code: "NO_DATA", message: "Senzory na vybraných místech v tomto čase neposlaly žádná data." },
    spec: { ...tableSpec, format: "text", gates: ["Zikova"] },
    result: { ok: false, error: { code: "NO_DATA", message: "Senzory na vybraných místech v tomto čase neposlaly žádná data.", suggestions: [] } },
    trace: trace([model(1900, "tool_use"), tool({ ...tableSpec, gates: ["Zikova"] }, 20, false)], 1950),
  }),
  error: answer("Kolik aut včera projelo ulicí Kafkova?", {
    kind: "unknown",
    sentence: "Zdroj dat teď neodpovídá. Zkuste to prosím za chvíli.",
    sentence_source: "fixed",
    reason: { code: "SOURCE_ERROR", message: "Zdroj dat teď neodpovídá. Zkuste to prosím za chvíli." },
    spec: { ...tableSpec, format: "text", gates: [KAFKOVA.gate] },
    result: { ok: false, error: { code: "SOURCE_ERROR", message: "Zdroj dat teď neodpovídá. Zkuste to prosím za chvíli.", suggestions: [] } },
    trace: trace([model(2000, "tool_use"), tool({ ...tableSpec, gates: [KAFKOVA.gate] }, 5000, false), { type: "note", text: "Výjimka ve výpočtu: fetch failed" }], 7100),
  }),
};
