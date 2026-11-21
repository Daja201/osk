"use client";

// Otázka a odpovědi sdílené mezi obrazovkami. Provider je v layout.tsx a layout se při navigaci
// nepřekresluje, takže odpověď přežije přechod na podrobnosti a zpět.
// Konverzace: další otázka navazuje na předchozí (server dostane conversation_id a přidá kontext).
import { createContext, useCallback, useContext, useMemo, useState } from "react";
import type { AskAnswer } from "@/lib/ai/types";
import type { ChartView } from "@/lib/view";
import { getAnswer } from "@/lib/ui/ask-client";

// Kolik otázek může mít jedna konverzace (stejně jako MAX_TURNS v lib/conversations.ts).
export const MAX_TURNS = 10;

type AskState = {
  question: string;
  answer: AskAnswer | null; // poslední odpověď
  history: AskAnswer[]; // předchozí odpovědi téže konverzace, od nejstarší
  conversationId: string | null;
  status: "idle" | "loading" | "done";
};

type AskContextValue = AskState & {
  turns: number; // kolik otázek konverzace už má
  // Položí otázku. Když běží konverzace, navazuje na ni; reset() začne novou.
  // view = aktuální vzhled poslední odpovědi (z editoru), aby na něm navazující odpověď stavěla.
  ask: (question: string, view?: ChartView | null) => Promise<void>;
  reset: () => void;
  // Nahradí zobrazenou odpověď (např. uloženou kopií s upraveným vzhledem a novým odkazem).
  replace: (answer: AskAnswer) => void;
};

const AskContext = createContext<AskContextValue | null>(null);

const INITIAL: AskState = { question: "", answer: null, history: [], conversationId: null, status: "idle" };

// Do konverzace patří jen odpovědi, které server uložil (chyba spojení nebo limit tam nejsou).
const inConversation = (answer: AskAnswer | null): answer is AskAnswer => Boolean(answer?.conversation_id);

export function AskProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AskState>(INITIAL);

  const ask = useCallback(
    async (raw: string, view: ChartView | null = null) => {
      const question = raw.trim();
      if (!question) return;
      setState((current) => ({
        ...current,
        question,
        status: "loading",
        // Předchozí odpověď se posune do historie, nová se počítá.
        history: inConversation(current.answer) ? [...current.history, current.answer] : current.history,
        answer: null,
      }));
      const answer = await getAnswer(question, state.conversationId, view);
      setState((current) => ({
        ...current,
        question: answer.question,
        answer,
        conversationId: answer.conversation_id ?? current.conversationId,
        status: "done",
      }));
    },
    [state.conversationId],
  );

  const reset = useCallback(() => setState(INITIAL), []);
  const replace = useCallback((answer: AskAnswer) => setState((current) => ({ ...current, question: answer.question, answer, status: "done" })), []);

  const value = useMemo(() => {
    const turns = state.history.length + (inConversation(state.answer) ? 1 : 0);
    return { ...state, turns, ask, reset, replace };
  }, [state, ask, reset, replace]);
  return <AskContext.Provider value={value}>{children}</AskContext.Provider>;
}

export function useAsk(): AskContextValue {
  const value = useContext(AskContext);
  if (!value) throw new Error("useAsk musí být uvnitř <AskProvider>.");
  return value;
}
