import type Anthropic from "@anthropic-ai/sdk";
import type { SeriesOk, SeriesParams, SeriesResult } from "../citiq/series";
import type { WeatherSeriesOk, WeatherSeriesParams, WeatherSeriesResult } from "../citiq/weatherSeries";
import type { AnalyticsSeriesOk } from "../citiq/display";
import { type CombinedSeriesResult, combinedSeries } from "../citiq/combinedSeries";
import { deriveRatios, seriesStatistics, typicalDayProfile } from "../citiq/analytics";
import { compareTrafficPeriods, compareWeatherPeriods } from "../citiq/comparePeriods";
import { checkNumbers, extractNumbers } from "./checkNumbers";
import { formatPeriod, formatSelectedPeriod } from "./dates";
import { GATES } from "./gates";
import { buildSystemPrompt } from "./systemPrompt";
import {
  BuildAnswerInput,
  CombinedSeriesInput,
  DATASET_BRIEF,
  type Format,
  buildAnswerTool,
  combinedSeriesTool,
  weatherSeriesTool,
  WeatherSeriesInput,
} from "./tools";
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
const COMBINED_SOURCE_TEXT =
  "Data o dopravě i počasí bereme z otevřeného API senzorové sítě Olomouc (CITIQ). Každý dataset si zachovává vlastní jednotku a v grafu vlastní osu. Přesné dotazy jsou v odkazech.";
const cz = new Intl.NumberFormat("cs-CZ");


// Nadpis, když si ho uživatel neřekl. Složí ho kód z toho, co se opravdu spočítalo.
export function defaultTitle(result: SeriesOk): string {
  const { direction } = result.meta.params;
  const places = result.data.series.map((s) => placeName(s.gate));
  const placeText = places.length > 3 ? `${places.slice(0, 3).join(", ")} a další` : places.join(", ");
  const what = direction === "in" ? "Vjezdy" : direction === "out" ? "Výjezdy" : "Počet vozidel";
  if (result.data.comparison) {
    const basis = result.data.comparison.basis === "traffic_per_hour" ? " · průměr vozidel/h" : "";
    return `${what} · ${placeText} · srovnání ${result.data.comparison.periods.length} období${basis}`;
  }
  return `${what} · ${placeText} · ${formatSelectedPeriod(result.meta.period.start, result.meta.period.end, result.meta.params.dates)}`;
}

type AskSeriesOk = SeriesOk | WeatherSeriesOk | AnalyticsSeriesOk;

function isWeatherResult(result: AskSeriesOk): result is WeatherSeriesOk {
  return result.meta.tool === "weather_series";
}

function isCombinedResult(result: AskSeriesOk): result is AnalyticsSeriesOk {
  return result.meta.tool === "combined_series";
}

function titleFor(result: AskSeriesOk): string {
  if (result.meta.analysis?.type === "typical_profile") {
    // Rozsah („9.–20. 11. 2026“), ne výčet všech vybraných dnů, ať je nadpis krátký. Vybrané dny jsou v poznámce.
    return `Typický den · ${result.data.series.map((series) => placeName(series.gate)).join(", ")} · ${formatPeriod(result.meta.period.start, result.meta.period.end)}`;
  }
  if (result.meta.analysis?.type === "ratio" || result.meta.analysis?.type === "share") {
    return `${result.meta.analysis.type === "ratio" ? "Poměr" : "Podíl"} · ${result.data.series.map((series) => series.gate).join(", ")} · ${formatSelectedPeriod(result.meta.period.start, result.meta.period.end, result.meta.params?.dates)}`;
  }
  if (isCombinedResult(result)) {
    // Názvy řad („U Letadla, U Letadla · teplota (°C)“) místo počtů („1 dopravních řad“): čitelné a gramaticky správně.
    const names = result.data.series.map((series) => placeName(series.gate)).join(", ");
    return `Doprava a počasí · ${names} · ${formatSelectedPeriod(result.meta.period.start, result.meta.period.end, result.meta.params?.dates)}`;
  }
  if (!isWeatherResult(result)) return defaultTitle(result);
  const stations = [...new Set(result.data.series.map((series) => stationName(series.station)))];
  const metrics = [...new Set(result.data.series.map((series) => resolveWeatherMetric(series.metric)?.label ?? series.metric))];
  if (result.data.comparison) return `Srovnání · ${stations.join(", ")} · ${metrics.join(", ")} · ${result.data.comparison.periods.length} období`;
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
  const labels = result.data.buckets.map((bucket) => bucket.label);
  const withValues = labels.length <= MAX_VALUES_FOR_CLAUDE && result.data.granularity !== "total";
  if (result.data.comparison) {
    const comparison = result.data.comparison;
    const periods = comparison.periods.map(({ label }) => label);
    if (isWeatherResult(result)) {
      return {
        dataset: "počasí",
        comparison: { baseline: comparison.baseline, basis: comparison.basis, periods },
        stations: result.data.series.map((series, index) => ({
          station: stationName(series.station),
          metric: resolveWeatherMetric(series.metric)?.label ?? series.metric,
          unit: series.unit,
          periods: comparison.series[index].points.map((point, period) => ({
            label: periods[period],
            mean: point.value,
            difference_from_first: point.delta,
            coverage: point.coverage,
          })),
        })),
        notes: result.meta.notes,
      };
    }
    // Různě dlouhá období (traffic_per_hour): Claude dostane jen průměr za hodinu, ne součty. Jinak by porovnal
    // součty 6 a 7 dní („7528 oproti 9803“) a vyšel by klamavě velký pokles. Kontrola čísel pak součty ani nepustí.
    const perHour = comparison.basis === "traffic_per_hour";
    return {
      dataset: "doprava",
      comparison: {
        baseline: comparison.baseline,
        basis: comparison.basis,
        compare_by: perHour ? "průměrný počet vozidel za hodinu (období jsou různě dlouhá)" : "celkový počet vozidel",
        periods,
      },
      places: result.data.series.map((series, index) => ({
        place: placeName(series.gate),
        sensors: series.sensors,
        periods: comparison.series[index].points.map((point, period) => ({
          label: periods[period],
          ...(perHour ? { vehicles_per_hour: point.perHour } : { total_vehicles: point.total }),
          compared_value: point.value,
          difference_from_first: point.delta,
          percent_from_first: point.percent,
          coverage: point.coverage,
        })),
      })),
      notes: result.meta.notes,
    };
  }
  if (result.meta.analysis) {
    return {
      period: formatSelectedPeriod(result.meta.period.start, result.meta.period.end, result.meta.params?.dates),
      granularity: result.data.granularity,
      dataset: result.meta.analysis.type,
      analysis: result.meta.analysis,
      series: result.data.series.map((series) => ({
        name: series.gate,
        unit: series.unit ?? ("mean" in series ? "průměr" : "vozidel"),
        aggregate: "mean" in series ? series.mean : series.total,
        // Poměr i v procentech (0,21 × = 21 %), spočítané kódem: Claude ho pak smí napsat a kontrola čísel ho pustí.
        ...(result.meta.analysis?.type === "ratio" && "mean" in series && typeof series.mean === "number"
          ? { as_percent: Math.round(series.mean * 1000) / 10 }
          : {}),
        statistics: seriesStatistics(labels, series.values),
        coverage: series.coverage,
        ...(withValues ? { values: labels.map((label, index) => ({ label, value: series.values[index] })) } : {}),
      })),
      notes: result.meta.notes,
    };
  }
  if (isCombinedResult(result)) {
    return {
      period: formatSelectedPeriod(result.meta.period.start, result.meta.period.end, result.meta.params?.dates),
      granularity: result.data.granularity,
      dataset: "kombinace dopravy a počasí",
      series: result.data.series.map((series) => ({
        dataset: series.dataset,
        name: series.gate,
        unit: series.unit,
        mean_or_total: "mean" in series ? series.mean : series.total,
        statistics: seriesStatistics(labels, series.values),
        coverage: series.coverage,
        ...(withValues ? { values: labels.map((label, index) => ({ label, value: series.values[index] })) } : {}),
      })),
      notes: result.meta.notes,
    };
  }
  if (isWeatherResult(result)) {
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
        statistics: seriesStatistics(labels, series.values),
        ...(result.data.granularity === "total" ? {} : extremes(labels, series.values)),
        ...(withValues ? { values: labels.map((label, index) => ({ label, value: series.values[index] })) } : {}),
      })),
      notes: result.meta.notes,
    };
  }
  return {
    period: formatSelectedPeriod(result.meta.period.start, result.meta.period.end, result.meta.params.dates),
    granularity: result.data.granularity,
    direction: result.meta.params.direction,
    places: result.data.series.map((s) => ({
      place: placeName(s.gate),
      sensors: s.sensors,
      total: s.total,
      coverage: s.coverage,
      statistics: seriesStatistics(labels, s.values),
      ...(result.meta.analysis ? { analysis: result.meta.analysis } : {}),
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
    // I absolutní hodnota: rozdíl −4,48 napíše Claude jako „o 4,48 méně“. Pořád je to číslo spočítané kódem.
    if (typeof value === "number") {
      allowed.add(value);
      allowed.add(Math.abs(value));
    }
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
  if (result.data.comparison) {
    const comparison = result.data.comparison;
    const first = comparison.periods[0].label;
    const last = comparison.periods.at(-1)!.label;
    if (isWeatherResult(result)) {
      const series = result.data.series[0];
      const points = comparison.series[0].points;
      const start = points[0];
      const end = points.at(-1)!;
      const metric = resolveWeatherMetric(series.metric)?.label ?? series.metric;
      const describe = (point: (typeof points)[number]) => point.value === null ? "bez dat" : `${cz.format(point.value)} ${series.unit}`;
      const difference = end.delta === null ? "rozdíl nelze určit" : `${end.delta > 0 ? "+" : ""}${cz.format(end.delta)} ${series.unit}`;
      return `${stationName(series.station)}, ${metric}: ${first} ${describe(start)}, ${last} ${describe(end)} (${difference} vůči prvnímu období). Podrobnosti všech období jsou v důkazu pod odpovědí.`;
    }
    if (result.meta.analysis?.type === "ratio" || result.meta.analysis?.type === "share") {
      const parts = result.data.series.map((series) => {
        const value = "mean" in series ? (series.mean ?? null) : null;
        return `${series.gate}: ${value === null ? "bez dat" : `${cz.format(value)} ${series.unit ?? ""}`}`;
      });
      return `Vypočtený ${result.meta.analysis.type === "ratio" ? "poměr" : "podíl"} za vybrané období: ${parts.join("; ")}.`;
    }
    if (result.meta.analysis?.type === "typical_profile") {
      const labels = result.data.buckets.map((bucket) => bucket.label);
      const parts = result.data.series.map((series) => {
        const stats = seriesStatistics(labels, series.values);
        return `${series.gate}: ${stats.max ? `nejvyšší průměr ${stats.max.value} v ${stats.max.label}` : "bez dat"}`;
      });
      return `Typický den za vybrané období: ${parts.join("; ")}.`;
    }
    if (isCombinedResult(result)) {
      const parts = result.data.series.map((series) => {
        const value = ("mean" in series ? series.mean : series.total) ?? null;
        return `${series.gate}: ${value === null ? "bez dat" : `${cz.format(value)} ${series.unit ?? ""}`}`;
      });
      return `Doprava a počasí za vybrané období: ${parts.join("; ")}.`;
    }
    const series = result.data.series[0];
    const points = comparison.series[0].points;
    const start = points[0];
    const end = points.at(-1)!;
    const basisValue = (point: (typeof points)[number]) => comparison.basis === "traffic_per_hour"
      ? point.perHour === null ? "bez dat" : `${cz.format(point.perHour)} voz/h`
      : point.total === null ? "bez dat" : `${cz.format(point.total)} vozidel`;
    const difference = end.delta === null
      ? "rozdíl nelze určit"
      : `${end.delta > 0 ? "+" : ""}${cz.format(end.delta)} ${comparison.basis === "traffic_per_hour" ? "voz/h" : "vozidel"}${end.percent === null ? "" : ` (${end.percent > 0 ? "+" : ""}${cz.format(end.percent)} %)`}`;
    return `${placeName(series.gate)}: ${first} ${basisValue(start)}, ${last} ${basisValue(end)} (${difference} vůči prvnímu období). Podrobnosti všech období jsou v důkazu pod odpovědí.`;
  }
  const period = formatSelectedPeriod(result.meta.period.start, result.meta.period.end, result.meta.params?.dates);
  if (isWeatherResult(result)) {
    const parts = result.data.series.map((series) =>
      `${stationName(series.station)}, ${resolveWeatherMetric(series.metric)?.label ?? series.metric}: ${series.mean === null ? "bez dat" : `${cz.format(series.mean)} ${series.unit}`}`,
    );
    return `${period}: průměr ${parts.join("; ")}.`;
  }
  const parts = result.data.series.map((s) => `${placeName(s.gate)} ${s.total === undefined ? "bez dat" : `${cz.format(s.total)} vozidel`}`);
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
  if (result.data.comparison && format === "pie") {
    notes.push("Koláčový graf neukazuje změny mezi obdobími, proto používáme sloupcový graf.");
    return "bar";
  }
  if (isWeatherResult(result) && format !== "text" && format !== "table" && format !== "source") {
    const metrics = new Set(result.data.series.map((series) => series.metric));
    if (metrics.size > 1) {
      notes.push("Veličiny mají různé jednotky, proto místo společného grafu ukazujeme tabulku.");
      return "table";
    }
  }
  if (isCombinedResult(result) && format !== "text" && format !== "table" && format !== "source") {
    const units = new Set(result.data.series.map((series) => series.unit ?? ""));
    if (units.size > 2) {
      notes.push("Graf umí nejvýše dvě různé jednotky; ukazujeme tabulku.");
      return "table";
    }
    if (format === "pie") {
      notes.push("Koláčový graf nesrovnává různé jednotky; ukazujeme sloupcový graf se samostatnými osami.");
      return "bar";
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
  let spec: BuildAnswerInput | WeatherSeriesInput | CombinedSeriesInput | null = null;
  let result: SeriesResult | WeatherSeriesResult | CombinedSeriesResult | AnalyticsSeriesOk | null = null;
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
        tools: [buildAnswerTool, weatherSeriesTool, combinedSeriesTool],
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
    const isCombinedTool = block?.name === combinedSeriesTool.name;
    if (!block || (!isWeatherTool && !isCombinedTool && block.name !== buildAnswerTool.name)) return aiError(`Neznámý nástroj: ${block?.name}`);
    // Druhé zadání po hotovém výsledku nečekáme; větu pak složí kód.
    if (result) break;

    // Obsah odpovědi vracíme beze změny, včetně thinking bloků (jinak API vrátí 400).
    messages.push({ role: "assistant", content: response.content });
    const toolStarted = Date.now();
    const parsed = isCombinedTool
      ? CombinedSeriesInput.safeParse(block.input)
      : isWeatherTool
        ? WeatherSeriesInput.safeParse(block.input)
        : BuildAnswerInput.safeParse(block.input);
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
      if (isCombinedTool && "gates" in spec && "stations" in spec) {
        const base = await combinedSeries(
          {
            gates: spec.gates,
            combineGates: spec.combine_gates,
            direction: spec.direction,
            stations: spec.stations,
            metrics: spec.metrics,
            from: spec.from,
            to: spec.to,
            ...(spec.dates?.length ? { dates: spec.dates } : {}),
            granularity: spec.typical_profile ? "hour" : spec.granularity,
          },
          deps.trafficSeries,
          deps.weatherSeries,
        );
        result = base.ok && spec.typical_profile ? typicalDayProfile(base) : base;
      } else if (isWeatherTool && "stations" in spec && !("gates" in spec)) {
        if (spec.typical_profile && spec.periods?.length) {
          result = { ok: false, code: "BAD_PARAMS", message: "Typický denní profil nelze kombinovat se srovnávacími obdobími." };
        } else if (spec.typical_profile && spec.relation !== "none") {
          result = { ok: false, code: "BAD_PARAMS", message: "Typický denní profil a poměr jsou samostatné analýzy; vyberte jednu." };
        } else {
          const params: WeatherSeriesParams = {
            stations: spec.stations,
            metrics: spec.metrics,
            from: spec.from,
            to: spec.to,
            ...(spec.dates?.length ? { dates: spec.dates } : {}),
            ...(spec.periods?.length ? { periods: spec.periods } : {}),
            granularity: spec.typical_profile ? "hour" : spec.granularity,
          };
          const base = spec.periods?.length || spec.granularity === "period"
            ? await compareWeatherPeriods(params, deps.weatherSeries)
            : await deps.weatherSeries(params);
          if (!base.ok) result = base;
          else if (spec.relation !== "none") {
            const first = base.data.series[0];
            const second = base.data.series[1];
            const descriptor = first ? resolveWeatherMetric(first.metric) : null;
            if (!first || !second) {
              result = { ok: false, code: "BAD_PARAMS", message: "Poměr počasí vyžaduje dvě porovnatelné řady." };
            } else if (first.metric !== second.metric || first.unit !== second.unit || first.unit === "°C" || first.unit === "°") {
              result = { ok: false, code: "BAD_PARAMS", message: "Poměr počasí lze počítat jen mezi dvěma stanicemi se stejnou veličinou a jednotkou; teplotu a směr větru nepoměřujeme." };
            } else {
              void descriptor;
              result = deriveRatios(base, [{ numerator: 0, denominator: 1 }], spec.relation);
            }
          } else {
            result = spec.typical_profile ? typicalDayProfile(base) : base;
          }
        }
      } else if ("gates" in spec && !("stations" in spec)) {
        if (spec.typical_profile && spec.periods?.length) {
          result = { ok: false, error: { code: "BAD_PARAMS", message: "Typický denní profil nelze kombinovat se srovnávacími obdobími.", suggestions: [] } };
        } else if (spec.typical_profile && spec.relation !== "none") {
          result = { ok: false, error: { code: "BAD_PARAMS", message: "Typický denní profil a poměr jsou samostatné analýzy; vyberte jednu.", suggestions: [] } };
        } else {
          // Koláč porovnává místa: s víc místy vždy jedno číslo za místo.
          const granularity = spec.format === "pie" && spec.gates.length > 1 && !spec.periods?.length ? "total" : spec.typical_profile ? "hour" : spec.granularity;
          const params: SeriesParams = {
            gates: spec.gates,
            combineGates: spec.combine_gates,
            direction: spec.direction,
            from: spec.from,
            to: spec.to,
            ...(spec.dates?.length ? { dates: spec.dates } : {}),
            ...(spec.periods?.length ? { periods: spec.periods } : {}),
            granularity,
          };
          // Zadání si uložíme do konstanty: uvnitř funkce TypeScript zúžení proměnné `spec` neudrží.
          const comparePeriods = Boolean(spec.periods?.length) || spec.granularity === "period";
          const runTraffic = (direction = params.direction) => {
            const next = { ...params, direction };
            return comparePeriods
              ? compareTrafficPeriods(next, deps.trafficSeries)
              : deps.trafficSeries(next);
          };
          if (spec.relation === "direction_ratio" || spec.relation === "direction_share") {
            const [incoming, outgoing] = await Promise.all([runTraffic("in"), runTraffic("out")]);
            if (!incoming.ok) result = incoming;
            else if (!outgoing.ok) result = outgoing;
            else if (
              incoming.data.buckets.length !== outgoing.data.buckets.length ||
              incoming.data.buckets.some((bucket, index) => bucket.start !== outgoing.data.buckets[index].start || bucket.end !== outgoing.data.buckets[index].end) ||
              incoming.data.series.length !== outgoing.data.series.length
            ) {
              result = { ok: false, error: { code: "DATA_ALIGNMENT", message: "Řady vjezdů a výjezdů nemají shodná časová období.", suggestions: [] } };
            } else {
              const paired: AnalyticsSeriesOk = {
                ok: true,
                data: {
                  granularity: incoming.data.granularity,
                  buckets: incoming.data.buckets,
                  series: [
                    ...incoming.data.series.map((series) => ({ ...series, unit: "vozidel", dataset: "traffic" as const, direction: "in" as const })),
                    ...outgoing.data.series.map((series) => ({ ...series, unit: "vozidel", dataset: "traffic" as const, direction: "out" as const })),
                  ],
                },
                meta: {
                  tool: "traffic_series",
                  params: { ...incoming.meta.params, direction: "both" },
                  period: incoming.meta.period,
                  sources: [...incoming.meta.sources, ...outgoing.meta.sources],
                  notes: [...incoming.meta.notes, ...outgoing.meta.notes],
                },
              };
              const count = incoming.data.series.length;
              result = deriveRatios(
                paired,
                incoming.data.series.map((_, index) => ({ numerator: index, denominator: index + count })),
                spec.relation === "direction_ratio" ? "ratio" : "share",
              );
            }
          } else {
            const base = await runTraffic();
            if (!base.ok) result = base;
            else if (spec.relation !== "none") {
              if (spec.gates.length !== 2 || base.data.series.length !== 2) {
                result = { ok: false, error: { code: "BAD_PARAMS", message: "Poměr míst vyžaduje právě dvě samostatně vybrané brány.", suggestions: [] } };
              } else {
                result = deriveRatios(base, [{ numerator: 0, denominator: 1 }], spec.relation);
              }
            } else {
              result = spec.typical_profile ? typicalDayProfile(base) : base;
            }
          }
        }
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

    // Nadpis od Claude projde, jen když ho uživatel opravdu napsal (v této nebo předchozích otázkách konverzace)
    // a obsahuje jen čísla z otázky nebo z výsledku. Jinak ho složí kód (Claude si nadpisy občas vymýšlí).
    const allowed = allowedNumbers(summaryForClaude(result));
    extractNumbers(question).forEach((n) => allowed.add(n));
    const said = [question, ...(deps.context ?? []).map((previous) => previous.question)].join(" ").toLocaleLowerCase("cs");
    const fromUser = spec.title !== null && said.includes(spec.title.trim().toLocaleLowerCase("cs"));
    title = spec.title && fromUser && checkNumbers(spec.title, allowed).passed ? spec.title : titleFor(result);

    if (spec.format === "source") {
      return answer({
        kind: "answer",
        format: "source",
        title,
        sentence: isCombinedResult(result) ? COMBINED_SOURCE_TEXT : isWeatherResult(result) ? WEATHER_SOURCE_TEXT : SOURCE_TEXT,
        sentence_source: "fixed",
        reason: null,
      });
    }
    // Poměr nebo podíl jedné dvojice je jedno číslo: graf s jediným sloupcem „A / B“ nic neřekne,
    // proto ho vždy ukážeme jako odpověď větou (s velkým číslem).
    const singleRatio =
      (result.meta.analysis?.type === "ratio" || result.meta.analysis?.type === "share") &&
      result.data.series.length === 1 &&
      result.data.buckets.length === 1;
    if (spec.format !== "text" && !singleRatio) {
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
