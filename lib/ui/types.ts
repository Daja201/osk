// Stránka používá stejné typy jako /api/ask.
export type { AskAnswer } from "../ai/types";

// Kladná hodnota = dovnitř, záporná = ven (podle mentora, viz docs/data-notes.md).
export const directionCz = { in: "dovnitř", out: "ven", both: "oba směry" } as const;
