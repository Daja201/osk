import type Anthropic from "@anthropic-ai/sdk";
import type { TrafficCountOk, TrafficCountParams, TrafficCountResult } from "../citiq/traffic";
import { checkNumbers, extractNumbers } from "./checkNumbers";
import { formatCzDate, pragueDate, weekdayCz } from "./dates";
import { GATES } from "./gates";
import { buildSystemPrompt } from "./systemPrompt";
import { TrafficCountInput, trafficCountTool } from "./tools";
import type { AskAnswer, TraceStep, TrafficResult, TrafficResultOk } from "./types";

// Jen část klienta, kterou potřebujeme. V testech se podstrčí falešný klient.
export type MessagesClient = {
  messages: { create(params: Anthropic.MessageCreateParamsNonStreaming): Promise<Anthropic.Message> };
};

// Podpis Davidovy funkce trafficCount. V testech se podstrčí falešná funkce.
export type TrafficCountFn = (params: TrafficCountParams) => Promise<TrafficCountResult>;

export type AskDeps = {
  client: MessagesClient;
  model: string;
  now: Date;
  trafficCount: TrafficCountFn;
};

const MAX_STEPS = 3;
const OUT_OF_SCOPE_TEXT =
  "Na tohle odpovědět neumím – mám jen data o průjezdech vozidel dopravními branami v Olomouci.";
const AI_ERROR_TEXT = "Teď se nepodařilo spojit s AI. Zkuste to prosím znovu.";
const cz = new Intl.NumberFormat("cs-CZ");

// Sečte několik výsledků po hodinách (oba směry nebo brány ve skupině). Počítá kód, ne Claude.
function sumResults(results: TrafficResultOk[], params: TrafficResultOk["meta"]["params"]): TrafficResultOk {
  const [first] = results;
  const hourly = first.data.hourly.map((_, hour) => {
    const values = results.map((result) => result.data.hourly[hour]);
    return values.every((value) => value === null) ? null : values.reduce<number>((sum, value) => sum + (value ?? 0), 0);
  });
  const rangeFrom = params.hour_from ?? 0;
  const rangeTo = params.hour_to ?? 24;
  return {
    ok: true,
    data: { total: results.reduce((sum, result) => sum + result.data.total, 0), hourly },
    meta: {
      ...first.meta,
      params,
      coverage: { hours: hourly.slice(rangeFrom, rangeTo).filter((value) => value !== null).length, of: rangeTo - rangeFrom },
      notes: [...new Set(results.flatMap((result) => result.meta.notes))],
    },
  };
}

// Zavolá Davidovu funkci. "both" = oba směry, skupina = všechny její brány; součty dělá sumResults.
async function runTrafficCount(input: TrafficCountInput, fn: TrafficCountFn): Promise<TrafficResult> {
  const { gate, direction, date, hour_from, hour_to } = input;
  const members = GATES.find((g) => g.objectName === gate)?.members ?? [gate];
  const directions = direction === "both" ? (["in", "out"] as const) : [direction];

  const results = await Promise.all(
    members.flatMap((member) =>
      directions.map((d) =>
        fn({
          gate: member,
          direction: d,
          date,
          ...(hour_from !== undefined ? { hour_from } : {}),
          ...(hour_to !== undefined ? { hour_to } : {}),
        }),
      ),
    ),
  );
  const failed = results.find((result) => !result.ok);
  if (failed) return failed;
  const ok = results.filter((result): result is TrafficCountOk => result.ok);
  if (ok.length === 1) return ok[0];
  return sumResults(ok, { gate, direction, date, ...(hour_from !== undefined ? { hour_from } : {}), ...(hour_to !== undefined ? { hour_to } : {}) });
}

// Nejrušnější hodina. Počítá ji kód, Claude dostane jen hotový výsledek.
function peakOf(hourly: (number | null)[]) {
  let peak: { hour: number; value: number } | null = null;
  hourly.forEach((value, hour) => {
    if (value !== null && (peak === null || value > peak.value)) peak = { hour, value };
  });
  return peak as { hour: number; value: number } | null;
}

// Co uvidí Claude: shrnutí bez pole hodin, aby nemusel nic počítat ani číst pozice v poli.
function summaryForClaude(result: TrafficResult) {
  if (!result.ok) return result;
  const peak = peakOf(result.data.hourly);
  return {
    ok: true,
    gate: result.meta.params.gate,
    direction: result.meta.params.direction,
    date: result.meta.params.date,
    ...(result.meta.params.hour_from !== undefined ? { hour_from: result.meta.params.hour_from } : {}),
    ...(result.meta.params.hour_to !== undefined ? { hour_to: result.meta.params.hour_to } : {}),
    // Den v týdnu počítá kód, jinak si ho Claude vymýšlí.
    day: `${weekdayCz(result.meta.params.date)} ${formatCzDate(result.meta.params.date)}`,
    total: result.data.total,
    peak: peak && { from: `${peak.hour}:00`, to: `${peak.hour + 1}:00`, value: peak.value },
    coverage: result.meta.coverage,
    notes: result.meta.notes,
  };
}

// Čísla, která věta smí obsahovat: vše ze shrnutí, z názvů bran a z data.
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

function fallbackSentence(result: TrafficResultOk): string {
  const { gate, direction, date, hour_from, hour_to } = result.meta.params;
  const peak = peakOf(result.data.hourly);
  const directionText = direction === "both" ? "oba směry" : direction === "in" ? "dovnitř" : "ven";
  let sentence = `${gate}, ${formatCzDate(date)}: ${cz.format(result.data.total)} vozidel (${directionText})`;
  if (hour_from !== undefined || hour_to !== undefined) {
    sentence += ` mezi ${hour_from ?? 0}:00 a ${hour_to ?? 24}:00`;
  }
  if (peak) sentence += `, nejvíc mezi ${peak.hour}:00 a ${peak.hour + 1}:00 (${cz.format(peak.value)})`;
  sentence += ".";
  const { hours, of } = result.meta.coverage;
  if (hours < of) sentence += ` Data chybí za ${of - hours} h.`;
  return sentence;
}

function sanitize(text: string): string {
  return text
    .replace(/\*\*|__|`/g, "")
    .replace(/^\s*(#+|[-*•]|\d+\.)\s+/gm, "")
    .replace(/\s*\n+\s*/g, " ")
    .trim();
}

export async function ask(question: string, deps: AskDeps): Promise<AskAnswer> {
  const started = Date.now();
  const steps: TraceStep[] = [];
  const assumptions: string[] = [];
  const system = buildSystemPrompt(deps.now);
  const messages: Anthropic.MessageParam[] = [{ role: "user", content: question }];
  let result: TrafficResult | null = null;
  let toolUsed = false;
  let finalText: string | null = null;

  const answer = (rest: Pick<AskAnswer, "kind" | "sentence" | "sentence_source" | "reason">): AskAnswer => ({
    question,
    ...rest,
    assumptions,
    result,
    trace: { model: deps.model, now: deps.now.toISOString(), steps, total_ms: Date.now() - started },
  });
  const aiError = (note: string) => {
    steps.push({ type: "note", text: note });
    return answer({
      kind: "unknown",
      sentence: AI_ERROR_TEXT,
      sentence_source: "fixed",
      reason: { code: "AI_ERROR", message: AI_ERROR_TEXT },
    });
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
        tools: [trafficCountTool],
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

    if (response.stop_reason === "tool_use") {
      const block = response.content.find((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
      if (!block || block.name !== trafficCountTool.name) return aiError(`Neznámý nástroj: ${block?.name}`);

      // Obsah odpovědi vracíme beze změny, včetně thinking bloků (jinak API vrátí 400).
      messages.push({ role: "assistant", content: response.content });

      const toolStarted = Date.now();
      const parsed = TrafficCountInput.safeParse(block.input);
      if (!parsed.success) {
        result = { ok: false, error: { code: "BAD_PARAMS", message: "Neplatné parametry nástroje.", suggestions: [] } };
      } else if (parsed.data.date > pragueDate(deps.now)) {
        result = {
          ok: false,
          error: { code: "BAD_PARAMS", message: "Na budoucnost data nemám – zkuste se zeptat na včerejšek.", suggestions: [] },
        };
      } else {
        if (parsed.data.date_assumed) assumptions.push(`V otázce nebylo datum, použit ${formatCzDate(parsed.data.date)}.`);
        try {
          result = await runTrafficCount(parsed.data, deps.trafficCount);
        } catch (error) {
          result = {
            ok: false,
            error: { code: "SOURCE_ERROR", message: "Zdroj dat teď neodpovídá. Zkuste to prosím za chvíli.", suggestions: [] },
          };
          steps.push({ type: "note", text: `Výjimka v datové funkci: ${String(error)}` });
        }
      }
      toolUsed = true;
      steps.push({ type: "tool", name: block.name, input: block.input, ms: Date.now() - toolStarted, ok: result.ok });

      messages.push({
        role: "user",
        content: [
          { type: "tool_result", tool_use_id: block.id, content: JSON.stringify(summaryForClaude(result)), is_error: !result.ok },
        ],
      });
      continue;
    }

    if (response.stop_reason === "end_turn") {
      finalText = response.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join(" ");
    } else {
      return aiError(`Neočekávaný stop_reason: ${response.stop_reason}`);
    }
  }

  if (finalText === null) return aiError("Vyčerpány kroky smyčky.");

  // Claude nezavolal nástroj → odpověděl by z hlavy. Jeho text dáme jen do trace.
  if (!toolUsed || !result) {
    steps.push({ type: "note", text: `Claude bez nástroje: ${finalText}` });
    return answer({
      kind: "unknown",
      sentence: OUT_OF_SCOPE_TEXT,
      sentence_source: "fixed",
      reason: { code: "OUT_OF_SCOPE", message: OUT_OF_SCOPE_TEXT },
    });
  }

  const sentence = sanitize(finalText);
  const check = checkNumbers(sentence, allowedNumbers(summaryForClaude(result)));
  steps.push({ type: "check", ...check });

  if (!result.ok) {
    return answer({
      kind: "unknown",
      sentence: check.passed ? sentence : result.error.message,
      sentence_source: check.passed ? "ai" : "fallback",
      reason: { code: result.error.code, message: result.error.message },
    });
  }

  return answer({
    kind: "answer",
    sentence: check.passed ? sentence : fallbackSentence(result),
    sentence_source: check.passed ? "ai" : "fallback",
    reason: null,
  });
}
