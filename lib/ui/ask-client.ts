// Jak stránka získá odpověď. Běží v prohlížeči.
import { z } from "zod";
import type { AskAnswer } from "../ai/types";
import type { ChartView } from "../view";
import { FORMATS } from "../ai/tools";
import { FIXTURES } from "./fixtures";

// Kontrola tvaru odpovědi z /api/ask: jen pole, bez kterých stránka nic neukáže.
const AskResponse = z.looseObject({
  ok: z.literal(true),
  question: z.string(),
  kind: z.enum(["answer", "unknown"]),
  format: z.enum(FORMATS).nullable(),
  sentence: z.string().nullable(),
  sentence_source: z.enum(["ai", "fallback", "fixed"]).nullable(),
  notes: z.array(z.string()),
  trace: z.looseObject({ steps: z.array(z.unknown()), total_ms: z.number(), model: z.string(), now: z.string() }),
});

export const NETWORK_ERROR_TEXT = "Data se teď nepodařilo stáhnout.";

function requestError(
  question: string,
  code: "NETWORK_ERROR" | "RATE_LIMIT_ERROR" | "CONVERSATION_FULL",
  sentence: string,
  message: string,
): AskAnswer {
  return {
    id: null,
    expires_at: null,
    question,
    created_at: new Date().toISOString(),
    kind: "unknown",
    format: null,
    title: null,
    background: null,
    sentence,
    sentence_source: "fixed",
    reason: { code, message },
    spec: null,
    result: null,
    notes: [],
    view: null,
    trace: { model: "", now: new Date().toISOString(), steps: [], total_ms: 0 },
  };
}

function networkError(question: string, message: string): AskAnswer {
  return requestError(question, "NETWORK_ERROR", NETWORK_ERROR_TEXT, message);
}

function rateLimitError(question: string, response: Response): AskAnswer {
  const retryAfter = Number(response.headers.get("Retry-After"));
  const message =
    Number.isFinite(retryAfter) && retryAfter > 0
      ? `Počkejte prosím ${retryAfter} s a zkuste to znovu.`
      : "Počkejte prosím chvíli a zkuste to znovu.";
  return requestError(question, "RATE_LIMIT_ERROR", "Příliš mnoho dotazů.", message);
}

// conversationId = navazující otázka v konverzaci (server přidá kontext z posledních 2 odpovědí).
// view = aktuální vzhled poslední odpovědi (i neuložený z editoru), aby na něm nová odpověď stavěla.
export async function getAnswer(question: string, conversationId: string | null = null, view: ChartView | null = null): Promise<AskAnswer> {
  // ?fixture=bar apod. → testovací odpověď bez volání serveru. Čte se až teď, při odeslání.
  const fixture = new URLSearchParams(window.location.search).get("fixture");
  if (fixture && fixture in FIXTURES) return FIXTURES[fixture];

  try {
    const response = await fetch("/api/ask", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ question, conversation_id: conversationId, view }),
    });
    if (response.status === 429) return rateLimitError(question, response);
    if (response.status === 409) {
      return requestError(question, "CONVERSATION_FULL", "Konverzace je plná.", "Konverzace má nejvýš 10 otázek. Začněte novou.");
    }
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
