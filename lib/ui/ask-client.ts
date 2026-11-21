// Jak stránka získá odpověď. Běží v prohlížeči.
import { z } from "zod";
import type { AskAnswer } from "../ai/types";
import { FIXTURES } from "./fixtures";

// Kontrola tvaru odpovědi z /api/ask: jen pole, bez kterých stránka nic neukáže.
// Celé schéma kontraktu přijde, až se domluvíme s Davidem (ZADANI.md, fáze 2).
const AskResponse = z.looseObject({
  ok: z.literal(true),
  question: z.string(),
  kind: z.enum(["answer", "unknown"]),
  sentence: z.string(),
  sentence_source: z.enum(["ai", "fallback", "fixed"]),
  trace: z.looseObject({ steps: z.array(z.unknown()), total_ms: z.number(), model: z.string(), now: z.string() }),
});

export const NETWORK_ERROR_TEXT = "Data se teď nepodařilo stáhnout.";

function networkError(question: string, message: string): AskAnswer {
  return {
    question,
    kind: "unknown",
    sentence: NETWORK_ERROR_TEXT,
    sentence_source: "fixed",
    reason: { code: "NETWORK_ERROR", message },
    assumptions: [],
    result: null,
    trace: { model: "", now: new Date().toISOString(), steps: [], total_ms: 0 },
  };
}

export async function getAnswer(question: string): Promise<AskAnswer> {
  // ?fixture=ok apod. → testovací odpověď bez volání serveru. Čte se až teď, při odeslání.
  const fixture = new URLSearchParams(window.location.search).get("fixture");
  if (fixture && fixture in FIXTURES) return FIXTURES[fixture];

  try {
    const response = await fetch(`/api/ask?q=${encodeURIComponent(question)}`);
    const body: unknown = await response.json();
    if (!AskResponse.safeParse(body).success) {
      return networkError(question, `Server vrátil neočekávanou odpověď (HTTP ${response.status}).`);
    }
    // Tvar jsme ověřili výše; zbytek polí posílá náš vlastní /api/ask.
    return body as AskAnswer;
  } catch (error) {
    return networkError(question, error instanceof Error ? error.message : String(error));
  }
}
