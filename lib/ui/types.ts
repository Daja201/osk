import type { TrafficCountResult } from "../citiq/traffic";

// Co stránka dostane na jednu otázku. Později to bude vracet /api/ask.
export type AskAnswer = {
  question: string;
  // Věta pro člověka. "ai" = napsal Claude a prošla kontrolou čísel, "fallback" = složil ji kód.
  sentence: string;
  sentence_source: "ai" | "fallback" | "fixed";
  // Výsledek Davidovy funkce trafficCount, beze změny.
  result: TrafficCountResult;
};

// Kladná hodnota = dovnitř, záporná = ven (podle mentora, viz docs/data-notes.md).
export const directionCz = { in: "dovnitř", out: "ven" } as const;
