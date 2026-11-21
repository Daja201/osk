"use client";

// Otázka a odpověď sdílené mezi stránkami. Provider je v layout.tsx a layout se při navigaci
// nepřekresluje, takže odpověď přežije přechod na /jak-to-vime a zpět.
import { createContext, useCallback, useContext, useMemo, useState } from "react";
import type { AskAnswer } from "@/lib/ai/types";
import { getAnswer } from "@/lib/ui/ask-client";

type AskState = {
  question: string;
  answer: AskAnswer | null;
  status: "idle" | "loading" | "done";
};

type AskContextValue = AskState & {
  ask: (question: string) => Promise<void>;
  reset: () => void;
};

const AskContext = createContext<AskContextValue | null>(null);

const INITIAL: AskState = { question: "", answer: null, status: "idle" };

export function AskProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AskState>(INITIAL);

  const ask = useCallback(async (raw: string) => {
    const question = raw.trim();
    if (!question) return;
    setState((current) => ({ ...current, question, status: "loading" }));
    const answer = await getAnswer(question);
    setState({ question: answer.question, answer, status: "done" });
  }, []);

  const reset = useCallback(() => setState(INITIAL), []);

  const value = useMemo(() => ({ ...state, ask, reset }), [state, ask, reset]);
  return <AskContext.Provider value={value}>{children}</AskContext.Provider>;
}

export function useAsk(): AskContextValue {
  const value = useContext(AskContext);
  if (!value) throw new Error("useAsk musí být uvnitř <AskProvider>.");
  return value;
}
