// Z odpovědi /api/ask připraví údaje pro stránku. Nic se tu nepočítá z AI, jen se čte to,
// co spočítal náš kód (lib/citiq/series.ts). Testy: tests/ui-answer.test.ts.
import { formatPeriod } from "../ai/dates";
import type { Format } from "../ai/tools";
import type { AskAnswer } from "../ai/types";
import { type DataPick, placeName } from "./chart";
import { formatNumber } from "./format";
import type { NumberToken } from "./sentence";

export type View = "answer" | "out_of_scope" | "error" | "unknown";

export function viewOf(answer: AskAnswer): View {
  if (answer.kind === "answer" && answer.result?.ok) return "answer";
  const code = answer.reason?.code;
  if (code === "OUT_OF_SCOPE") return "out_of_scope";
  if (
    code === "SOURCE_ERROR" ||
    code === "AI_ERROR" ||
    code === "NETWORK_ERROR" ||
    code === "RATE_LIMIT_ERROR" ||
    code === "BAD_RESPONSE"
  ) return "error";
  return "unknown";
}

export const FORMAT_LABEL: Record<Format, string> = {
  text: "odpověď větou",
  bar: "sloupcový graf",
  line: "čárový graf",
  pie: "koláčový graf",
  table: "tabulka",
  source: "zdroj dat (odkaz na API)",
};

export const DIRECTION_LABEL = { both: "oba směry", in: "jen dovnitř (vjezdy)", out: "jen ven (výjezdy)" } as const;
export const GRANULARITY_LABEL = { hour: "po hodinách", day: "po dnech", total: "celkem za období" } as const;

// Období odpovědi pro lidi („19. 11. 2026, 8:00–15:00“). Bez výsledku z toho, co zadala AI.
export function periodOf(answer: AskAnswer): string | null {
  if (answer.result?.ok) return formatPeriod(answer.result.meta.period.start, answer.result.meta.period.end);
  if (answer.spec) return `${answer.spec.from.replace("T", " ")} – ${answer.spec.to.replace("T", " ")}`;
  return null;
}

export function checkOf(answer: AskAnswer) {
  const step = answer.trace.steps.find((s) => s.type === "check");
  return step && step.type === "check" ? step : null;
}

// Časy kroků: 1. volání modelu = zadání, nástroj = stažení a výpočet, poslední volání = věta (jen u textu).
export function timingsOf(answer: AskAnswer) {
  const models = answer.trace.steps.filter((s) => s.type === "model");
  const tool = answer.trace.steps.find((s) => s.type === "tool");
  return {
    choose: models[0]?.ms ?? null,
    compute: tool && tool.type === "tool" ? tool.ms : null,
    write: answer.format === "text" && models.length > 1 ? models[models.length - 1].ms : null,
    total: answer.trace.total_ms,
    modelCalls: models.length,
  };
}

// „claude-haiku-5-5“ → „Claude Haiku 5.5“
export function modelName(id: string): string {
  const match = id.match(/^claude-([a-z]+)-(\d+)-(\d+)$/);
  if (!match) return id;
  return `Claude ${match[1].charAt(0).toUpperCase()}${match[1].slice(1)} ${match[2]}.${match[3]}`;
}

// Odkud je číslo ve větě: spočítal ho náš kód ("code"), pochází z otázky (místo, období; vybrala AI)
// ("ai"), nebo v datech není ("bad"). `short` do tabulky kontroly, `long` do vysvětlení po kliknutí.
export type NumberSource = { who: "code" | "ai" | "bad"; short: string; long: string };
type TokenLike = Pick<NumberToken, "value" | "kind" | "text">;

export function explainNumber(token: TokenLike, answer: AskAnswer, notAllowed: number[] = []): NumberSource {
  const result = answer.result?.ok ? answer.result : null;
  const places = result ? result.data.series.map((s) => placeName(s.gate)) : (answer.spec?.gates.map(placeName) ?? []);
  const fromQuestion = "Vybrala ho AI z vaší otázky, náš kód s ním jen počítal.";
  const placeSource = (place: string): NumberSource => ({
    who: "ai",
    short: `název místa „${place}“`,
    long: `Část názvu místa „${place}“. Místo vybrala AI z vaší otázky.`,
  });

  if (token.kind === "date") {
    const place = places.find((p) => p.includes(token.text.replace(/\s+/g, " ")));
    if (place) return placeSource(place);
    return { who: "ai", short: "datum", long: `Datum z období ${periodOf(answer) ?? ""}. ${fromQuestion}` };
  }
  if (notAllowed.includes(token.value)) {
    return { who: "bad", short: "v datech takové číslo není", long: "Tohle číslo v datech není. Proto jsme větu od AI nepoužili a složili ji sami." };
  }
  if (result) {
    const from = "Spočítal ho náš kód z hodinových dat senzorů (síť CITIQ).";
    // Pořadí: součty, pak počet chybějících hodin (malé číslo ve větě je spíš tohle než hodnota jedné hodiny),
    // nakonec hodnoty jednotlivých hodin / dnů.
    for (const s of result.data.series) {
      const place = placeName(s.gate);
      if (s.total === token.value) return { who: "code", short: `součet za období, ${place}`, long: `Součet za celé období u místa ${place}. ${from}` };
    }
    for (const s of result.data.series) {
      const missing = s.coverage.of - s.coverage.hours;
      if (missing > 0 && missing === token.value) {
        return { who: "code", short: "počet hodin bez dat", long: `Za ${missing} h senzory u místa ${placeName(s.gate)} neposlaly data. Spočítal náš kód.` };
      }
    }
    for (const s of result.data.series) {
      const i = s.values.findIndex((value) => value === token.value);
      if (i >= 0) {
        const label = result.data.buckets[i].label;
        const place = placeName(s.gate);
        return { who: "code", short: `${place}, ${label}`, long: `Hodnota u místa ${place} za ${label}: ${formatNumber(token.value)}. ${from}` };
      }
    }
    // Hodina („mezi 10:00 a 11:00“): začátek / konec období vybrala AI, ostatní hodiny jsou z výsledku.
    const periodHours = [answer.spec?.from, answer.spec?.to].map((v) => (v ? Number(v.slice(11, 13)) : null));
    if (token.kind === "time" && periodHours.includes(token.value)) {
      return { who: "ai", short: "začátek nebo konec období", long: `Hranice období ${periodOf(answer) ?? ""}. ${fromQuestion}` };
    }
    if (result.data.buckets.some((b) => b.label === `${token.value}:00` || b.label.endsWith(` ${token.value}:00`))) {
      return { who: "code", short: "hodina z výsledku", long: "Hodina, kterou náš kód našel v hodinových datech (třeba ta nejrušnější)." };
    }
  }
  const place = places.find((p) => p.match(/\d+/g)?.map(Number).includes(token.value));
  if (place) return placeSource(place);
  return { who: "ai", short: "povolené číslo", long: "Číslo z věty, které kontrola povolila (např. část data), v datech ho přímo nenajdeme." };
}

// Odkud je jedno číslo grafu nebo tabulky (kliknutí v podrobnostech). Spočítal ho vždy náš kód;
// tady se jen popíše z čeho: které senzory, směry, hodiny a který dotaz na CITIQ.
export type PointSource = {
  place: string;
  period: string;
  value: number | null;
  text: string;
  sources: { date: string; url: string }[];
};

const DIRECTION_TEXT = { both: "oba směry", in: "jen směr dovnitř", out: "jen směr ven" } as const;
const pragueDate = (ms: number) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Prague" }).format(ms);

export function explainPoint(answer: AskAnswer, pick: DataPick): PointSource | null {
  const result = answer.result?.ok ? answer.result : null;
  const series = result?.data.series[pick.gate];
  if (!result || !series) return null;
  const bucket = pick.bucket === null ? null : result.data.buckets[pick.bucket];
  const start = bucket ? bucket.start : result.meta.period.start;
  const end = bucket ? bucket.end : result.meta.period.end;
  const value = bucket ? series.values[pick.bucket ?? 0] : series.total;
  const hours = Math.round((Date.parse(end) - Date.parse(start)) / 3600000);
  const sensors = series.sensors.length > 1 ? `senzorů ${series.sensors.join(" a ")}` : `senzoru ${series.sensors[0]}`;
  const direction = DIRECTION_TEXT[result.meta.params.direction];
  const firstDate = pragueDate(Date.parse(start));
  const lastDate = pragueDate(Date.parse(end) - 1);
  const text =
    value === null
      ? `Senzory v tomto čase neposlaly žádná data. Nedoplňujeme je nulou, proto tu číslo chybí.`
      : `${hours === 1 ? "Hodinová hodnota" : `Součet ${hours} hodinových hodnot`} ${sensors} (${direction}) ze sítě CITIQ. ` +
        `Sečetl je náš kód, AI do čísla nezasahovala.`;
  return {
    place: placeName(series.gate),
    period: formatPeriod(start, end),
    value,
    text,
    sources: result.meta.sources.filter((s) => s.date >= firstDate && s.date <= lastDate).map(({ date, url }) => ({ date, url })),
  };
}
