// Z odpovědi /api/ask připraví údaje pro stránku. Nic se tu nepočítá z AI, jen se čte to,
// co spočítal náš kód (lib/citiq/series.ts). Testy: tests/ui-answer.test.ts.
import { formatPeriod, formatSelectedPeriod } from "../ai/dates";
import type { Format } from "../ai/tools";
import type { AskAnswer } from "../ai/types";
import { aggregateValue } from "../citiq/display";
import { type DataPick, placeName } from "./chart";
import { formatNumber } from "./format";
import type { NumberToken } from "./sentence";

export type View = "answer" | "dataset_help" | "out_of_scope" | "error" | "unknown";
export function viewOf(answer: AskAnswer): View {
  if (answer.kind === "answer" && answer.result?.ok) return "answer";
  const code = answer.reason?.code;
  if (code === "DATASET_HELP") return "dataset_help";
  if (code === "OUT_OF_SCOPE") return "out_of_scope";
  if (
    code === "SOURCE_ERROR" ||
    code === "AI_ERROR" ||
    code === "NETWORK_ERROR" ||
    code === "RATE_LIMIT_ERROR" ||
    code === "CONVERSATION_FULL" ||
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
export const GRANULARITY_LABEL = { hour: "po hodinách", day: "po dnech", total: "celkem za období", period: "po srovnávaných obdobích" } as const;

// Období odpovědi pro lidi („19. 11. 2026, 8:00–15:00“). Bez výsledku z toho, co zadala AI.
export function periodOf(answer: AskAnswer): string | null {
  if (answer.result?.ok) {
    if (answer.result.data.comparison) return answer.result.data.comparison.periods.map((period) => period.label).join("; ");
    return formatSelectedPeriod(answer.result.meta.period.start, answer.result.meta.period.end, answer.result.meta.params?.dates);
  }
  if (answer.spec) {
    // Srovnávaná období má jen zadání pro dopravu a počasí, kombinovaný výpočet je nemá.
    const periods = "periods" in answer.spec ? (answer.spec.periods ?? []) : [];
    if (periods.length) {
      return periods.map((period) => formatSelectedPeriod(period.from, period.to)).join("; ");
    }
    return answer.spec.dates?.length
      ? formatSelectedPeriod(answer.spec.from, answer.spec.to, answer.spec.dates)
      : `${answer.spec.from.replace("T", " ")} – ${answer.spec.to.replace("T", " ")}`;
  }
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
  const places =
    result ? result.data.series.map((s) => placeName(s.gate)) :
    answer.spec && "gates" in answer.spec ? answer.spec.gates.map(placeName) :
    answer.spec && "stations" in answer.spec ? answer.spec.stations : [];
  const fromQuestion = "Vybrala ho AI z vaší otázky, náš kód s ním jen počítal.";
  const placeSource = (place: string): NumberSource => ({
    who: "ai",
    short: `název místa „${place}“`,
    long: `Část názvu místa „${place}“. Místo vybrala AI z vaší otázky.`,
  });

  if (token.kind === "date") {
    const place = places.find((p) => p.includes(token.text.replace(/\s+/g, " ")));
    if (place) return placeSource(place);
    return { who: "ai", short: "datum z otázky", long: `Datum z období ${periodOf(answer) ?? ""}. ${fromQuestion}` };
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
      if ("mean" in s && s.mean === token.value) {
        return { who: "code", short: `průměr za období, ${place}`, long: `Průměr za celé období u místa ${place}. ${from}` };
      }
      if ("total" in s && s.total === token.value) return { who: "code", short: `součet za období, ${place}`, long: `Součet za celé období u místa ${place}. ${from}` };
    }
    for (const s of result.data.series) {
      const missing = s.coverage.of - s.coverage.hours;
      if (missing > 0 && missing === token.value) {
        return { who: "code", short: "počet hodin bez dat", long: `Za ${missing} h senzory u místa ${placeName(s.gate)} neposlaly data. Spočítal náš kód.` };
      }
    }
    if (result.data.comparison) {
      for (const comparisonSeries of result.data.comparison.series) {
        const place = placeName(comparisonSeries.gate);
        for (const [periodIndex, point] of comparisonSeries.points.entries()) {
          const label = result.data.comparison.periods[periodIndex].label;
          if (point.delta === token.value) {
            const unit = result.data.comparison.basis === "weather_mean"
              ? comparisonSeries.unit ?? ""
              : result.data.comparison.basis === "traffic_per_hour"
                ? "voz/h"
                : "vozidel";
            return { who: "code", short: `rozdíl oproti základu, ${place}`, long: `Rozdíl ${formatNumber(token.value)} ${unit} za ${label} oproti prvnímu období (${result.data.comparison.baseline}). Spočítal náš kód.` };
          }
          if (point.percent === token.value) {
            return { who: "code", short: `procentní změna, ${place}`, long: `Změna ${formatNumber(token.value)} % za ${label} oproti prvnímu období (${result.data.comparison.baseline}). Spočítal náš kód.` };
          }
          if (point.value === token.value) {
            const unit = result.data.comparison.basis === "weather_mean"
              ? comparisonSeries.unit ?? ""
              : result.data.comparison.basis === "traffic_per_hour"
                ? "voz/h"
                : "vozidel";
            return { who: "code", short: `${place}, ${label}`, long: `Srovnávací hodnota ${formatNumber(token.value)} ${unit} za ${label}. Spočítal náš kód.` };
          }
          if (point.total === token.value) {
            return { who: "code", short: `součet za období, ${place}`, long: `Celkový součet ${formatNumber(token.value)} vozidel za ${label}. Spočítal náš kód.` };
          }
          if (point.perHour === token.value) {
            return { who: "code", short: `průměr za hodinu, ${place}`, long: `Průměr ${formatNumber(token.value)} vozidel na dostupnou hodinu za ${label}. Spočítal náš kód.` };
          }
        }
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
  // Den, měsíc nebo rok z období, které AI vybrala z otázky (např. 20, 11, 2026).
  const dateParts = [
    answer.spec?.from,
    answer.spec?.to,
    ...(answer.spec?.dates ?? []),
    ...(answer.spec && "periods" in answer.spec ? (answer.spec.periods ?? []) : []).flatMap((period) => [period.from, period.to]),
  ].flatMap((v) => (v ? v.slice(0, 10).split("-").map(Number) : []));
  if (dateParts.includes(token.value)) {
    return { who: "ai", short: "datum z otázky", long: `Část data z období ${periodOf(answer) ?? ""}. ${fromQuestion}` };
  }
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
// Směr z parametrů výpočtu (u kombinovaného výpočtu je obecný řetězec); neznámý = oba směry.
const directionOf = (direction: string | undefined): keyof typeof DIRECTION_TEXT => (direction === "in" || direction === "out" ? direction : "both");
const pragueDate = (ms: number) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Prague" }).format(ms);

export function explainPoint(answer: AskAnswer, pick: DataPick): PointSource | null {
  const result = answer.result?.ok ? answer.result : null;
  const series = result?.data.series[pick.gate];
  if (!result || !series) return null;
  const bucket = pick.bucket === null || result.data.granularity === "total" ? null : result.data.buckets[pick.bucket];
  const start = bucket ? bucket.start : result.meta.period.start;
  const end = bucket ? bucket.end : result.meta.period.end;
  const comparisonPoint = bucket ? result.data.comparison?.series[pick.gate]?.points[pick.bucket ?? 0] : undefined;
  const value = comparisonPoint ? comparisonPoint.value : bucket ? series.values[pick.bucket ?? 0] : aggregateValue(series);
  const hours = comparisonPoint
    ? comparisonPoint.coverage.hours
    : bucket
      ? Math.round((Date.parse(end) - Date.parse(start)) / 3600000)
      : series.coverage.of;
  const sensors = series.sensors.length > 1 ? `senzorů ${series.sensors.join(" a ")}` : `senzoru ${series.sensors[0]}`;
  const direction = result.meta.tool === "weather_series" ? "meteorologické veličiny" : DIRECTION_TEXT[directionOf(result.meta.params?.direction)];
  const firstDate = pragueDate(Date.parse(start));
  const lastDate = pragueDate(Date.parse(end) - 1);
  const period = bucket ? formatPeriod(start, end) : formatSelectedPeriod(start, end, result.meta.params?.dates);
  if (comparisonPoint && result.data.comparison) {
    const comparison = result.data.comparison;
    const details = comparison.series[pick.gate];
    const baseline = details.points[0];
    const differenceUnit = comparison.basis === "weather_mean"
      ? details.unit ?? ""
      : comparison.basis === "traffic_per_hour"
        ? " voz/h"
        : " vozidel";
    const difference =
      comparisonPoint.delta === null
        ? "rozdíl oproti prvnímu období nelze určit"
        : `rozdíl oproti prvnímu období (${comparison.baseline}) je ${comparisonPoint.delta > 0 ? "+" : ""}${formatNumber(comparisonPoint.delta)}${differenceUnit}${comparisonPoint.percent === null ? "" : ` (${comparisonPoint.percent > 0 ? "+" : ""}${formatNumber(comparisonPoint.percent)} %)`}`;
    const text =
      value === null
        ? "Pro toto období nejsou dostupná data."
        : comparison.basis === "weather_mean"
          ? `Průměr ${formatNumber(value)} ${details.unit ?? ""} za ${hours} z ${comparisonPoint.coverage.of} dostupných hodin; ${difference}. Spočítal ho náš kód.`
          : comparison.basis === "traffic_per_hour"
            ? `Průměr ${formatNumber(comparisonPoint.perHour ?? 0)} vozidel na dostupnou hodinu; celkem ${formatNumber(comparisonPoint.total ?? 0)} vozidel za ${hours} z ${comparisonPoint.coverage.of} dostupných hodin; ${difference}.`
            : `Součet ${formatNumber(comparisonPoint.total ?? 0)} vozidel za ${hours} z ${comparisonPoint.coverage.of} dostupných hodin; průměr ${formatNumber(comparisonPoint.perHour ?? 0)} voz/h; ${difference}.`;
    return {
      place: placeName(series.gate),
      period,
      value,
      text: comparisonPoint === baseline ? `${text} Jde o výchozí období.` : text,
      sources: result.meta.sources.filter((s) => s.date >= pragueDate(Date.parse(start)) && s.date <= pragueDate(Date.parse(end) - 1)).map(({ date, url }) => ({ date, url })),
    };
  }
  const text =
    value === null
      ? `Senzory v tomto čase neposlaly žádná data. Nedoplňujeme je nulou, proto tu číslo chybí.`
      : result.meta.tool === "weather_series"
        ? `${hours === 1 ? "Hodinový průměr" : `Průměr ${hours} hodinových hodnot`} ${result.data.series[pick.gate].gate} ze sítě CITIQ. ` +
          `Spočítal ho náš kód, AI do čísla nezasahovala.`
        : `${hours === 1 ? "Hodinová hodnota" : `Součet ${hours} hodinových hodnot`} ${sensors} (${direction}) ze sítě CITIQ. ` +
          `Sečetl je náš kód, AI do čísla nezasahovala.`;
  return {
    place: placeName(series.gate),
    period,
    value,
    text,
    sources: result.meta.sources.filter((s) => s.date >= firstDate && s.date <= lastDate).map(({ date, url }) => ({ date, url })),
  };
}
