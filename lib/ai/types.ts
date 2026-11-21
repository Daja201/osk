import type { SeriesResult } from "../citiq/series";
import type { ChartView } from "../view";
import type { PaletteName } from "./palette";
import type { BuildAnswerInput, Format } from "./tools";

export type ReasonCode = "OUT_OF_SCOPE" | "AI_ERROR" | "BAD_PARAMS" | "SOURCE_ERROR" | string;

export type TraceStep =
  | { type: "model"; ms: number; input_tokens: number; output_tokens: number; stop_reason: string | null }
  | { type: "tool"; name: string; input: unknown; ms: number; ok: boolean }
  | { type: "check"; passed: boolean; numbers: number[]; not_allowed: number[] }
  | { type: "note"; text: string };

// Odpověď /api/ask a uložená odpověď na /a/<id>.
export type AskAnswer = {
  id: string | null; // id uložené odpovědi (odkaz /a/<id>), null když se uložit nepodařilo
  expires_at: string | null; // do kdy odkaz platí (7 dní od uložení)
  question: string;
  created_at: string;
  kind: "answer" | "unknown";
  // Jak odpověď ukázat. Může se lišit od spec.format, když ho kód upravil (např. koláč se 20 výsečemi → sloupce).
  format: Format | null;
  title: string | null; // nadpis grafu / tabulky (od uživatele, nebo ho složil kód)
  background: PaletteName | null; // barva pozadí z palety, null = výchozí vzhled aplikace
  // Věta jen u formátu text, u „nevím“ a u zdroje dat. U grafů a tabulek null (žádný zbytečný text).
  sentence: string | null;
  // "ai" = napsal Claude a prošla kontrolou čísel, "fallback" = složil ji kód, "fixed" = pevná věta.
  sentence_source: "ai" | "fallback" | "fixed" | null;
  reason: { code: ReasonCode; message: string } | null;
  spec: BuildAnswerInput | null; // co AI vybrala
  result: SeriesResult | null; // co spočítal náš kód
  notes: string[]; // úpravy, které udělal kód (např. „V otázce nebyl čas, ukazujeme včerejšek.“)
  view: ChartView | null; // vzhled upravený v editoru (uložená kopie odpovědi), null = jak vybrala AI
  trace: { model: string; now: string; steps: TraceStep[]; total_ms: number };
};
