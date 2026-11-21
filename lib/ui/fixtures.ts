// Testovací odpovědi pro ladění vzhledu: /?fixture=ok (partial, range, fallback, out-of-scope, no-data, error).
// Mají stejný tvar jako skutečné /api/ask (typ AskAnswer). Čísla jsou ukázková z docs/design/fixtures.
import type { AskAnswer, TrafficResultOk } from "../ai/types";

const NOW = "2026-11-20T21:20:00.000Z"; // 22:20 pražského času
const FETCHED_AT = "2026-11-20T21:14:00.000Z";
const SOURCE_URL = "https://iot.citiq.cloud/portal/api/v2/view/olomouc-traffic-gates/";

function result(gate: string, date: string, hourly: (number | null)[], utc: [string, string]): TrafficResultOk {
  const hours = hourly.filter((value) => value !== null).length;
  return {
    ok: true,
    data: { total: hourly.reduce<number>((sum, value) => sum + (value ?? 0), 0), hourly },
    meta: {
      tool: "traffic_count",
      params: { gate, direction: "both", date },
      period_local: `${date} (Europe/Prague)`,
      period_utc: utc,
      coverage: { hours, of: hourly.length },
      source_url: SOURCE_URL,
      fetched_at: FETCHED_AT,
      notes: [
        "Hodiny jsou seřazeny chronologicky od půlnoci v Europe/Prague; chybějící hodiny mají hodnotu null.",
      ],
    },
  };
}

const okResult = result(
  "17. listopadu (obě brány)",
  "2026-11-19",
  [64, 38, 27, 24, 41, 162, 548, 1318, 1204, 942, 861, 902, 958, 997, 1103, 1276, 1251, 1089, 834, 598, 431, 322, 214, 121],
  ["2026-11-18T23:00:00.000Z", "2026-11-19T22:59:59.000Z"],
);

const partialResult = result(
  "17. listopadu (obě brány)",
  "2026-11-16",
  [71, 42, 30, null, null, 236, 561, 1297, 1188, 931, 850, 889, 947, 981, 1090, 1262, 1239, 1071, 822, 585, 418, 309, 203, 115],
  ["2026-11-15T23:00:00.000Z", "2026-11-16T22:59:59.000Z"],
);

const billaResult = result(
  "Billa (Hynaisova)",
  "2026-11-19",
  [12, 6, 4, 3, 5, 18, 52, 98, 104, 96, 101, 112, 118, 109, 115, 124, 131, 129, 133, 137, 96, 71, 45, 26],
  ["2026-11-18T23:00:00.000Z", "2026-11-19T22:59:59.000Z"],
);

// Otázka na část dne: hodiny mimo rozsah jsou null (stejně jako u Davidova trafficCount s hour_from/hour_to).
const rangeHourly = okResult.data.hourly.map((value, hour) => (hour >= 6 && hour < 10 ? value : null));
const rangeResult: TrafficResultOk = {
  ok: true,
  data: { total: rangeHourly.reduce<number>((sum, value) => sum + (value ?? 0), 0), hourly: rangeHourly },
  meta: {
    ...okResult.meta,
    params: { ...okResult.meta.params, hour_from: 6, hour_to: 10 },
    coverage: { hours: 4, of: 4 },
    notes: [...okResult.meta.notes, "Vybraný časový rozsah je 6:00–10:00."],
  },
};

const trace = (steps: AskAnswer["trace"]["steps"], total: number): AskAnswer["trace"] => ({
  model: "claude-haiku-5-5",
  now: NOW,
  steps,
  total_ms: total,
});

const toolStep = (gate: string, date: string, dateAssumed: boolean, ok: boolean, ms: number) =>
  ({ type: "tool", name: "traffic_count", input: { gate, direction: "both", date, date_assumed: dateAssumed }, ms, ok }) as const;

const model = (ms: number, stop: string) =>
  ({ type: "model", ms, input_tokens: 1800, output_tokens: 90, stop_reason: stop }) as const;

export const FIXTURES: Record<string, AskAnswer> = {
  ok: {
    question: "Kolik aut včera projelo ulicí 17. listopadu?",
    kind: "answer",
    sentence: "Včera projelo ulicí 17. listopadu 15 325 aut, nejvíc jich jelo mezi 7. a 8. hodinou ráno (1 318).",
    sentence_source: "ai",
    reason: null,
    assumptions: [],
    result: okResult,
    trace: trace(
      [
        model(700, "tool_use"),
        toolStep("17. listopadu (obě brány)", "2026-11-19", false, true, 300),
        model(600, "end_turn"),
        { type: "check", passed: true, numbers: [17, 15325, 7, 8, 1318], not_allowed: [] },
      ],
      1620,
    ),
  },
  partial: {
    question: "Kolik aut projelo v pondělí ulicí 17. listopadu?",
    kind: "answer",
    sentence:
      "V pondělí projelo ulicí 17. listopadu nejméně 15 137 aut, nejvíc jich jelo mezi 7. a 8. hodinou ráno (1 297). Data chybí za 2 hodiny.",
    sentence_source: "ai",
    reason: null,
    assumptions: [],
    result: partialResult,
    trace: trace(
      [
        model(720, "tool_use"),
        toolStep("17. listopadu (obě brány)", "2026-11-16", false, true, 310),
        model(640, "end_turn"),
        { type: "check", passed: true, numbers: [17, 15137, 7, 8, 1297, 2], not_allowed: [] },
      ],
      1690,
    ),
  },
  fallback: {
    question: "Kolik aut projelo u Billy?",
    kind: "answer",
    sentence: "Billa (Hynaisova), 19. 11. 2026: 1 845 vozidel (oba směry), nejvíc mezi 19:00 a 20:00 (137).",
    sentence_source: "fallback",
    reason: null,
    assumptions: ["V otázce nebylo datum, použit 19. 11. 2026."],
    result: billaResult,
    trace: trace(
      [
        model(680, "tool_use"),
        toolStep("Billa (Hynaisova)", "2026-11-19", true, true, 290),
        model(610, "end_turn"),
        { type: "check", passed: false, numbers: [1900, 19, 20, 137], not_allowed: [1900] },
      ],
      1600,
    ),
  },
  range: {
    question: "Kolik aut projelo včera ráno mezi 6 a 10 ulicí 17. listopadu?",
    kind: "answer",
    sentence: "Včera mezi 6:00 a 10:00 projelo ulicí 17. listopadu 4 012 aut, nejvíc mezi 7:00 a 8:00 (1 318).",
    sentence_source: "ai",
    reason: null,
    assumptions: [],
    result: rangeResult,
    trace: trace(
      [
        model(710, "tool_use"),
        {
          type: "tool",
          name: "traffic_count",
          input: { gate: "17. listopadu (obě brány)", direction: "both", date: "2026-11-19", date_assumed: false, hour_from: 6, hour_to: 10 },
          ms: 280,
          ok: true,
        },
        model(590, "end_turn"),
        { type: "check", passed: true, numbers: [6, 10, 17, 4012, 7, 8, 1318], not_allowed: [] },
      ],
      1600,
    ),
  },
  "out-of-scope": {
    question: "Kdo vyhrál včera zápas Sigmy?",
    kind: "unknown",
    sentence: "Na tohle odpovědět neumím – mám jen data o průjezdech vozidel dopravními branami v Olomouci.",
    sentence_source: "fixed",
    reason: {
      code: "OUT_OF_SCOPE",
      message: "Na tohle odpovědět neumím – mám jen data o průjezdech vozidel dopravními branami v Olomouci.",
    },
    assumptions: [],
    result: null,
    trace: trace([model(610, "end_turn"), { type: "note", text: "Claude bez nástroje: …" }], 640),
  },
  "no-data": {
    question: "Kolik aut včera projelo ulicí Zikova?",
    kind: "unknown",
    sentence: "Pro bránu Zikova nemám za 19. 11. 2026 žádná data, senzor ten den nevysílal.",
    sentence_source: "ai",
    reason: { code: "NO_DATA", message: 'Čidlo na bráně "Zikova" za 2026-11-19 neposlalo data pro směr "in".' },
    assumptions: [],
    result: {
      ok: false,
      error: { code: "NO_DATA", message: 'Čidlo na bráně "Zikova" za 2026-11-19 neposlalo data pro směr "in".', suggestions: [] },
    },
    trace: trace(
      [
        model(650, "tool_use"),
        toolStep("Zikova", "2026-11-19", false, false, 270),
        model(580, "end_turn"),
        { type: "check", passed: true, numbers: [19, 11, 2026], not_allowed: [] },
      ],
      1510,
    ),
  },
  error: {
    question: "Kolik aut včera projelo ulicí Kafkova?",
    kind: "unknown",
    sentence: "Zdroj dat teď neodpovídá. Zkuste to prosím za chvíli.",
    sentence_source: "fallback",
    reason: { code: "SOURCE_ERROR", message: "Zdroj dat teď neodpovídá. Zkuste to prosím za chvíli." },
    assumptions: [],
    result: {
      ok: false,
      error: { code: "SOURCE_ERROR", message: "Zdroj dat teď neodpovídá. Zkuste to prosím za chvíli.", suggestions: [] },
    },
    trace: trace(
      [
        model(680, "tool_use"),
        toolStep("Kafkova (obě brány)", "2026-11-19", false, false, 5000),
        { type: "note", text: "Výjimka v datové funkci: fetch failed" },
        model(560, "end_turn"),
        { type: "check", passed: false, numbers: [], not_allowed: [] },
      ],
      6260,
    ),
  },
};
