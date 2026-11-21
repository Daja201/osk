import type Anthropic from "@anthropic-ai/sdk";
import type { SeriesOk, SeriesParams, SeriesResult } from "../citiq/series";
import type { WeatherSeriesOk, WeatherSeriesParams, WeatherSeriesResult } from "../citiq/weatherSeries";
import { checkNumbers, extractNumbers } from "./checkNumbers";
import { formatSelectedPeriod } from "./dates";
import { GATES } from "./gates";
import { buildSystemPrompt } from "./systemPrompt";
import { BuildAnswerInput, DATASET_BRIEF, type Format, buildAnswerTool, weatherSeriesTool, WeatherSeriesInput } from "./tools";
import { resolveWeatherMetric, stationName, WEATHER_STATIONS } from "../citiq/weatherStations";
import type { AskAnswer, TraceStep } from "./types";
import { placeName } from "../citiq/gates";
export { placeName };

// Jen část klienta, kterou potřebujeme. V testech se podstrčí falešný klient.
export type MessagesClient = {
  messages: { create(params: Anthropic.MessageCreateParamsNonStreaming): Promise<Anthropic.Message> };
};

// Podpis výpočtu lib/citiq/series.ts. V testech se podstrčí falešná funkce.
export type SeriesFn = (params: SeriesParams) => Promise<SeriesResult>;
export type WeatherSeriesFn = (params: WeatherSeriesParams) => Promise<WeatherSeriesResult>;

export type AskDeps = {
  client: MessagesClient;
  model: string;
  now: Date;
  trafficSeries: SeriesFn;
  weatherSeries: WeatherSeriesFn;
  // Předchozí odpovědi v konverzaci (nejvýš 2 poslední), aby šlo navázat: „a co předevčírem?“, „ukaž to grafem“.
  context?: AskAnswer[];
};

// Kontext pro Claude: jen otázka, zadání a nadpis / věta předchozích odpovědí. Čísla z nich nepočítá
// (kontrola čísel povolí jen čísla z nového výsledku).
export function contextText(context: AskAnswer[]): string | null {
  if (context.length === 0) return null;
  const turns = context.map((previous, i) => {
    const lines = [`${i + 1}) Otázka: ${previous.question}`];
    if (previous.spec) lines.push(`Zadání: ${JSON.stringify(previous.spec)}`);
    const shown = previous.sentence ?? previous.title;
    if (shown) lines.push(`Odpověď: ${shown}`);
    return lines.join("\n");
  });
  return `Předchozí otázky v této konverzaci (navazuj na ně, když nová otázka něco vynechá, např. místo, čas nebo formát):\n${turns.join("\n\n")}`;
}

// 1. volání = zadání, případně 2. = oprava neplatného zadání, poslední = věta (jen u formátu text).
const MAX_STEPS = 3;
const MAX_PIE_SLICES = 6;
// Do shrnutí pro Claude dáváme jednotlivé hodnoty jen u kratších řad, jinak jen součty a špičku.
const MAX_VALUES_FOR_CLAUDE = 48;

const OUT_OF_SCOPE_TEXT =
  "Na tohle odpovědět neumím – mám jen data o dopravě a měření počasí z meteorologických stanic v Olomouci.";
const AI_ERROR_TEXT = "Teď se nepodařilo spojit s AI. Zkuste to prosím znovu.";
const SOURCE_TEXT =
  "Data bereme z otevřeného API senzorové sítě Olomouc (CITIQ, view olomouc-traffic-gates): hodinové součty průjezdů dopravními branami. Přesné dotazy pro tuto odpověď jsou v odkazech.";
const WEATHER_SOURCE_TEXT =
  "Data bereme z otevřeného API senzorové sítě Olomouc (CITIQ, view meteorological-data-olomouc): hodinové průměry z meteorologických stanic. Přesné dotazy pro tuto odpověď jsou v odkazech.";
const cz = new Intl.NumberFormat("cs-CZ");


// Nadpis, když si ho uživatel neřekl. Složí ho kód z toho, co se opravdu spočítalo.
export function defaultTitle(result: SeriesOk): string {
  const { direction } = result.meta.params;
  const places = result.data.series.map((s) => placeName(s.gate));
  const placeText = places.length > 3 ? `${places.slice(0, 3).join(", ")} a další` : places.join(", ");
  const what = direction === "in" ? "Vjezdy" : direction === "out" ? "Výjezdy" : "Počet vozidel";
  return `${what} · ${placeText} · ${formatSelectedPeriod(result.meta.period.start, result.meta.period.end, result.meta.params.dates)}`;
}

type AskSeriesOk = SeriesOk | WeatherSeriesOk;

function isWeatherResult(result: AskSeriesOk): result is WeatherSeriesOk {
  return result.meta.tool === "weather_series";
}

function titleFor(result: AskSeriesOk): string {
  if (!isWeatherResult(result)) return defaultTitle(result);
  const stations = [...new Set(result.data.series.map((series) => stationName(series.station)))];
  const metrics = [...new Set(result.data.series.map((series) => resolveWeatherMetric(series.metric)?.label ?? series.metric))];
  return `Průměr · ${stations.join(", ")} · ${metrics.join(", ")} · ${formatSelectedPeriod(result.meta.period.start, result.meta.period.end, result.meta.params.dates)}`;
}

// Nejvyšší a nejnižší bucket řady (počítá kód, Claude dostane jen výsledek).
function extremes(labels: string[], values: (number | null)[]) {
  let peak: { label: string; value: number } | null = null;
  let low: { label: string; value: number } | null = null;
  values.forEach((value, i) => {
    if (value === null) return;
    if (!peak || value > peak.value) peak = { label: labels[i], value };
    if (!low || value < low.value) low = { label: labels[i], value };
  });
  return { peak: peak as { label: string; value: number } | null, low: low as { label: string; value: number } | null };
}

// Co uvidí Claude u formátu text: hotová čísla s popisky, nic k dopočítání.
function summaryForClaude(result: AskSeriesOk) {
  if (isWeatherResult(result)) {
    const labels = result.data.buckets.map((bucket) => bucket.label);
    const withValues = labels.length <= MAX_VALUES_FOR_CLAUDE && result.data.granularity !== "total";
    return {
      period: formatSelectedPeriod(result.meta.period.start, result.meta.period.end, result.meta.params.dates),
      granularity: result.data.granularity,
      dataset: "počasí",
      stations: result.data.series.map((series) => ({
        station: stationName(series.station),
        metric: resolveWeatherMetric(series.metric)?.label ?? series.metric,
        unit: series.unit,
        mean: series.mean,
        coverage: series.coverage,
        ...(result.data.granularity === "total" ? {} : extremes(labels, series.values)),
        ...(withValues ? { values: labels.map((label, index) => ({ label, value: series.values[index] })) } : {}),
      })),
      notes: result.meta.notes,
    };
  }
  const labels = result.data.buckets.map((b) => b.label);
  const withValues = labels.length <= MAX_VALUES_FOR_CLAUDE && result.data.granularity !== "total";
  return {
    period: formatSelectedPeriod(result.meta.period.start, result.meta.period.end, result.meta.params.dates),
    granularity: result.data.granularity,
    direction: result.meta.params.direction,
    places: result.data.series.map((s) => ({
      place: placeName(s.gate),
      sensors: s.sensors,
      total: s.total,
      coverage: s.coverage,
      ...(result.data.granularity === "total" ? {} : extremes(labels, s.values)),
      ...(withValues ? { values: labels.map((label, i) => ({ label, value: s.values[i] })) } : {}),
    })),
    notes: result.meta.notes,
  };
}

// Čísla, která věta smí obsahovat: vše ze shrnutí (včetně popisků a období) a z názvů bran.
function allowedNumbers(summary: unknown): Set<number> {
  const allowed = new Set<number>();
  const walk = (value: unknown): void => {
    if (typeof value === "number") allowed.add(value);
    else if (typeof value === "string") extractNumbers(value).forEach((n) => allowed.add(n));
    else if (Array.isArray(value)) value.forEach(walk);
    else if (value && typeof value === "object") Object.values(value).forEach(walk);
  };
  walk(summary);
  GATES.forEach((gate) => walk([gate.objectName, ...gate.aliases]));
  WEATHER_STATIONS.forEach((station) => walk(station.nick));
  return allowed;
}

function fallbackSentence(result: AskSeriesOk): string {
  const period = formatSelectedPeriod(result.meta.period.start, result.meta.period.end, result.meta.params.dates);
  if (isWeatherResult(result)) {
    const parts = result.data.series.map((series) =>
      `${stationName(series.station)}, ${resolveWeatherMetric(series.metric)?.label ?? series.metric}: ${series.mean === null ? "bez dat" : `${cz.format(series.mean)} ${series.unit}`}`,
    );
    return `${period}: průměr ${parts.join("; ")}.`;
  }
  const parts = result.data.series.map((s) => `${placeName(s.gate)} ${cz.format(s.total)} vozidel`);
  let sentence = `${period}: ${parts.join(", ")}.`;
  if (result.data.series.some((s) => s.coverage.hours < s.coverage.of)) sentence += " Část dat chybí, součty jsou neúplné.";
  return sentence;
}

function sanitize(text: string): string {
  return text
    .replace(/\*\*|__|`/g, "")
    .replace(/^\s*(#+|[-*•]|\d+\.)\s+/gm, "")
    .replace(/\s*\n+\s*/g, " ")
    .trim();
}

function isDatasetHelpQuestion(question: string): boolean {
  const normalized = question
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[?!.,]+$/g, "")
    .replace(/\s+/g, " ");
  return normalized === "na co se mohu zeptat" || normalized === "na co se muzu zeptat";
}

// Úprava zadání, kterou dělá kód, ne Claude. Vrací výsledný formát a poznámky pro uživatele.
function finalFormat(format: Format, result: AskSeriesOk, notes: string[]): Format {
  if (isWeatherResult(result) && format !== "text" && format !== "table" && format !== "source") {
    const metrics = new Set(result.data.series.map((series) => series.metric));
    if (metrics.size > 1) {
      notes.push("Veličiny mají různé jednotky, proto místo společného grafu ukazujeme tabulku.");
      return "table";
    }
  }
  const buckets = result.data.buckets.length;
  const slices = isWeatherResult(result)
    ? new Set(result.data.series.map((series) => series.station)).size > 1 || buckets === 1
      ? result.data.series.length
      : buckets
    : result.data.granularity === "total"
      ? result.data.series.length
      : buckets;
  if (format === "pie" && slices > MAX_PIE_SLICES) {
    notes.push(`Na koláčový graf je položek moc (${slices}), ukazujeme sloupcový.`);
    return "bar";
  }
  if (format === "pie" && slices < 2) {
    notes.push("Koláčový graf s jedinou položkou nedává smysl, ukazujeme sloupcový.");
    return "bar";
  }
  if (format === "line" && buckets < 2) {
    notes.push("Čárový graf potřebuje aspoň dva body, ukazujeme sloupcový.");
    return "bar";
  }
  return format;
}

export async function ask(question: string, deps: AskDeps): Promise<AskAnswer> {
  const started = Date.now();
  const steps: TraceStep[] = [];
  const notes: string[] = [];
  const system = buildSystemPrompt(deps.now);
  const context = contextText(deps.context ?? []);
  const messages: Anthropic.MessageParam[] = [{ role: "user", content: context ? `${context}\n\nNová otázka: ${question}` : question }];
  let spec: BuildAnswerInput | WeatherSeriesInput | null = null;
  let result: SeriesResult | WeatherSeriesResult | null = null;
  let finalText: string | null = null;
  let title: string | null = null;

  const answer = (rest: Pick<AskAnswer, "kind" | "format" | "title" | "sentence" | "sentence_source" | "reason">): AskAnswer => ({
    id: null,
    expires_at: null,
    question,
    created_at: deps.now.toISOString(),
    background: spec?.background ?? null,
    ...rest,
    spec,
    result,
    notes,
    view: null,
    trace: { model: deps.model, now: deps.now.toISOString(), steps, total_ms: Date.now() - started },
  });
  if (isDatasetHelpQuestion(question)) {
    return answer({
      kind: "unknown",
      format: null,
      title: null,
      sentence: DATASET_BRIEF,
      sentence_source: "fixed",
      reason: { code: "DATASET_HELP", message: "Briefing možností datasetu." },
    });
  }
  const unknown = (code: string, message: string, sentence = message): AskAnswer =>
    answer({ kind: "unknown", format: null, title: null, sentence, sentence_source: "fixed", reason: { code, message } });
  const aiError = (note: string) => {
    steps.push({ type: "note", text: note });
    return unknown("AI_ERROR", AI_ERROR_TEXT);
  };

  for (let step = 0; step < MAX_STEPS && finalText === null; step++) {
    let response: Anthropic.Message;
    const callStarted = Date.now();
    try {
      response = await deps.client.messages.create({
        model: deps.model,
        max_tokens: 2048,
        system,
        messages,
        tools: [buildAnswerTool, weatherSeriesTool],
        tool_choice: { type: "auto", disable_parallel_tool_use: true },
      });
    } catch (error) {
      return aiError(`Volání Claude selhalo: ${error instanceof Error ? error.message : String(error)}`);
    }
    steps.push({
      type: "model",
      ms: Date.now() - callStarted,
      input_tokens: response.usage.input_tokens,
      output_tokens: response.usage.output_tokens,
      stop_reason: response.stop_reason,
    });

    if (response.stop_reason === "end_turn") {
      finalText = response.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join(" ");
      break;
    }
    if (response.stop_reason !== "tool_use") return aiError(`Neočekávaný stop_reason: ${response.stop_reason}`);

    const block = response.content.find((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
    const isWeatherTool = block?.name === weatherSeriesTool.name;
    if (!block || (!isWeatherTool && block.name !== buildAnswerTool.name)) return aiError(`Neznámý nástroj: ${block?.name}`);
    // Druhé zadání po hotovém výsledku nečekáme; větu pak složí kód.
    if (result) break;

    // Obsah odpovědi vracíme beze změny, včetně thinking bloků (jinak API vrátí 400).
    messages.push({ role: "assistant", content: response.content });
    const toolStarted = Date.now();
    const parsed = isWeatherTool ? WeatherSeriesInput.safeParse(block.input) : BuildAnswerInput.safeParse(block.input);
    if (!parsed.success) {
      // Neplatné zadání: Claude dostane chybu a jeden pokus na opravu.
      steps.push({ type: "tool", name: block.name, input: block.input, ms: 0, ok: false });
      messages.push({
        role: "user",
        content: [{ type: "tool_result", tool_use_id: block.id, is_error: true, content: `Neplatné zadání: ${parsed.error.message}` }],
      });
      continue;
    }
    spec = parsed.data;
    if (spec.date_assumed) notes.push("V otázce nebyl čas, ukazujeme celý včerejšek.");

    try {
      if (isWeatherTool && "stations" in spec) {
        result = await deps.weatherSeries({
          stations: spec.stations,
          metrics: spec.metrics,
          from: spec.from,
          to: spec.to,
          ...(spec.dates?.length ? { dates: spec.dates } : {}),
          granularity: spec.granularity,
        });
      } else if ("gates" in spec) {
        // Koláč porovnává místa: s víc místy vždy jedno číslo za místo.
        const granularity = spec.format === "pie" && spec.gates.length > 1 ? "total" : spec.granularity;
        result = await deps.trafficSeries({
          gates: spec.gates,
          direction: spec.direction,
          from: spec.from,
          to: spec.to,
          ...(spec.dates?.length ? { dates: spec.dates } : {}),
          granularity,
        });
      } else {
        return aiError("Zadání nástroje neodpovídá jeho typu.");
      }
    } catch (error) {
      steps.push({ type: "note", text: `Výjimka ve výpočtu: ${String(error)}` });
      result = { ok: false, error: { code: "SOURCE_ERROR", message: "Zdroj dat teď neodpovídá. Zkuste to prosím za chvíli.", suggestions: [] } };
    }
    steps.push({ type: "tool", name: block.name, input: block.input, ms: Date.now() - toolStarted, ok: result.ok });

    if (!result.ok) {
      const error = "error" in result ? result.error : result;
      const code = error.code === "FETCH_FAILED" ? "SOURCE_ERROR" : error.code;
      return unknown(code, error.message);
    }
    notes.push(...result.meta.notes);

    // Nadpis od Claude smí obsahovat jen čísla z otázky nebo z výsledku, jinak ho složí kód.
    const allowed = allowedNumbers(summaryForClaude(result));
    extractNumbers(question).forEach((n) => allowed.add(n));
    title = spec.title && checkNumbers(spec.title, allowed).passed ? spec.title : titleFor(result);

    if (spec.format === "source") {
      return answer({ kind: "answer", format: "source", title, sentence: isWeatherResult(result) ? WEATHER_SOURCE_TEXT : SOURCE_TEXT, sentence_source: "fixed", reason: null });
    }
    if (spec.format !== "text") {
      // Graf nebo tabulka: druhé volání modelu není potřeba, žádný zbytečný text.
      return answer({ kind: "answer", format: finalFormat(spec.format, result, notes), title, sentence: null, sentence_source: null, reason: null });
    }

    messages.push({
      role: "user",
      content: [{ type: "tool_result", tool_use_id: block.id, content: JSON.stringify(summaryForClaude(result)) }],
    });
  }

  // Claude nezavolal nástroj → odpověděl by z hlavy. Jeho text dáme jen do trace.
  if (!spec || !result) {
    if (finalText === null) return aiError("Vyčerpány kroky smyčky bez platného zadání.");
    steps.push({ type: "note", text: `Claude bez nástroje: ${finalText}` });
    return unknown("OUT_OF_SCOPE", OUT_OF_SCOPE_TEXT);
  }
  // Chybu výpočtu jsme vrátili už ve smyčce, sem se dostane jen platný výsledek u formátu text.
  if (!result.ok) return aiError("Neočekávaný stav: výsledek s chybou po smyčce.");

  const sentence = finalText === null ? "" : sanitize(finalText);
  const check = checkNumbers(sentence, allowedNumbers(summaryForClaude(result)));
  steps.push({ type: "check", ...check });
  const passed = check.passed && sentence.length > 0;
  return answer({
    kind: "answer",
    format: "text",
    title: title ?? titleFor(result),
    sentence: passed ? sentence : fallbackSentence(result),
    sentence_source: passed ? "ai" : "fallback",
    reason: null,
  });
}
