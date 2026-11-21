import type Anthropic from "@anthropic-ai/sdk";
import type { SeriesOk, SeriesParams, SeriesResult } from "../citiq/series";
import { checkNumbers, extractNumbers } from "./checkNumbers";
import { formatPeriod } from "./dates";
import { GATES } from "./gates";
import { buildSystemPrompt } from "./systemPrompt";
import { BuildAnswerInput, type Format, buildAnswerTool } from "./tools";
import type { AskAnswer, TraceStep } from "./types";

// Jen část klienta, kterou potřebujeme. V testech se podstrčí falešný klient.
export type MessagesClient = {
  messages: { create(params: Anthropic.MessageCreateParamsNonStreaming): Promise<Anthropic.Message> };
};

// Podpis výpočtu lib/citiq/series.ts. V testech se podstrčí falešná funkce.
export type SeriesFn = (params: SeriesParams) => Promise<SeriesResult>;

export type AskDeps = {
  client: MessagesClient;
  model: string;
  now: Date;
  trafficSeries: SeriesFn;
};

// 1. volání = zadání, případně 2. = oprava neplatného zadání, poslední = věta (jen u formátu text).
const MAX_STEPS = 3;
const MAX_PIE_SLICES = 6;
// Do shrnutí pro Claude dáváme jednotlivé hodnoty jen u kratších řad, jinak jen součty a špičku.
const MAX_VALUES_FOR_CLAUDE = 48;

const OUT_OF_SCOPE_TEXT =
  "Na tohle odpovědět neumím – mám jen data o průjezdech vozidel dopravními branami v Olomouci.";
const AI_ERROR_TEXT = "Teď se nepodařilo spojit s AI. Zkuste to prosím znovu.";
const SOURCE_TEXT =
  "Data bereme z otevřeného API senzorové sítě Olomouc (CITIQ, view olomouc-traffic-gates): hodinové součty průjezdů dopravními branami. Přesné dotazy pro tuto odpověď jsou v odkazech.";
const cz = new Intl.NumberFormat("cs-CZ");

// Název místa pro lidi: skupina „17. listopadu (obě brány)“ → „17. listopadu“.
export const placeName = (gate: string) => gate.replace(/\s*\(obě brány\)$/, "");

// Nadpis, když si ho uživatel neřekl. Složí ho kód z toho, co se opravdu spočítalo.
export function defaultTitle(result: SeriesOk): string {
  const { direction } = result.meta.params;
  const places = result.data.series.map((s) => placeName(s.gate));
  const placeText = places.length > 3 ? `${places.slice(0, 3).join(", ")} a další` : places.join(", ");
  const what = direction === "in" ? "Vjezdy" : direction === "out" ? "Výjezdy" : "Počet vozidel";
  return `${what} · ${placeText} · ${formatPeriod(result.meta.period.start, result.meta.period.end)}`;
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
function summaryForClaude(result: SeriesOk) {
  const labels = result.data.buckets.map((b) => b.label);
  const withValues = labels.length <= MAX_VALUES_FOR_CLAUDE && result.data.granularity !== "total";
  return {
    period: formatPeriod(result.meta.period.start, result.meta.period.end),
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
  return allowed;
}

function fallbackSentence(result: SeriesOk): string {
  const period = formatPeriod(result.meta.period.start, result.meta.period.end);
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

// Úprava zadání, kterou dělá kód, ne Claude. Vrací výsledný formát a poznámky pro uživatele.
function finalFormat(format: Format, result: SeriesOk, notes: string[]): Format {
  const buckets = result.data.buckets.length;
  const slices = result.data.granularity === "total" ? result.data.series.length : buckets;
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
  const messages: Anthropic.MessageParam[] = [{ role: "user", content: question }];
  let spec: BuildAnswerInput | null = null;
  let result: SeriesResult | null = null;
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
    trace: { model: deps.model, now: deps.now.toISOString(), steps, total_ms: Date.now() - started },
  });
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
        tools: [buildAnswerTool],
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
    if (!block || block.name !== buildAnswerTool.name) return aiError(`Neznámý nástroj: ${block?.name}`);
    // Druhé zadání po hotovém výsledku nečekáme; větu pak složí kód.
    if (result) break;

    // Obsah odpovědi vracíme beze změny, včetně thinking bloků (jinak API vrátí 400).
    messages.push({ role: "assistant", content: response.content });
    const toolStarted = Date.now();
    const parsed = BuildAnswerInput.safeParse(block.input);
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
    // Koláč porovnává místa: s víc místy vždy jedno číslo za místo.
    const granularity = spec.format === "pie" && spec.gates.length > 1 ? "total" : spec.granularity;

    try {
      result = await deps.trafficSeries({ gates: spec.gates, direction: spec.direction, from: spec.from, to: spec.to, granularity });
    } catch (error) {
      steps.push({ type: "note", text: `Výjimka ve výpočtu: ${String(error)}` });
      result = { ok: false, error: { code: "SOURCE_ERROR", message: "Zdroj dat teď neodpovídá. Zkuste to prosím za chvíli.", suggestions: [] } };
    }
    steps.push({ type: "tool", name: block.name, input: block.input, ms: Date.now() - toolStarted, ok: result.ok });

    if (!result.ok) {
      const code = result.error.code === "FETCH_FAILED" ? "SOURCE_ERROR" : result.error.code;
      return unknown(code, result.error.message);
    }
    notes.push(...result.meta.notes);

    // Nadpis od Claude smí obsahovat jen čísla z otázky nebo z výsledku, jinak ho složí kód.
    const allowed = allowedNumbers(summaryForClaude(result));
    extractNumbers(question).forEach((n) => allowed.add(n));
    title = spec.title && checkNumbers(spec.title, allowed).passed ? spec.title : defaultTitle(result);

    if (spec.format === "source") {
      return answer({ kind: "answer", format: "source", title, sentence: SOURCE_TEXT, sentence_source: "fixed", reason: null });
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
    title: title ?? defaultTitle(result),
    sentence: passed ? sentence : fallbackSentence(result),
    sentence_source: passed ? "ai" : "fallback",
    reason: null,
  });
}
