"use client";

import { useRef, useState } from "react";
import { useAsk } from "@/app/ask-context";
import type { AskAnswer } from "@/lib/ai/types";
import type { ChartView } from "@/lib/view";
import AnswerScreen from "./AnswerScreen";
import DetailsScreen from "./DetailsScreen";
import IntroScreen from "./IntroScreen";

type Phase = "intro" | "answer" | "details";

// Celá aplikace na jedné adrese. Tři obrazovky:
// 1. úvod (bílá, jen otázka), 2. odpověď (modrá), 3. podrobnosti (bílá, pod odpovědí).
// Odpověď a podrobnosti jsou dvě obrazovky nad sebou; přechod mezi nimi posune celý pohled
// o výšku obrazovky (translateY), stránka sama se nescrolluje.
export default function HomeView() {
  const { answer, reset } = useAsk();
  const [phase, setPhase] = useState<Phase>("intro");
  // Podrobnosti se otevírají k jedné odpovědi konverzace (null = k poslední).
  const [detailsFor, setDetailsFor] = useState<AskAnswer | null>(null);
  const frame = useRef<HTMLDivElement>(null);
  // Vzhled upravený v editoru patří k jedné odpovědi; u nové odpovědi začíná znovu od uloženého / výchozího.
  const answerKey = answer ? (answer.id ?? answer.question) : "";
  const [edit, setEdit] = useState<{ key: string; view: ChartView | null }>({ key: "", view: null });
  const view = edit.key === answerKey ? edit.view : null;
  const setView = (next: ChartView | null) => setEdit({ key: answerKey, view: next });

  const detailsAnswer = detailsFor ?? answer;

  const newQuestion = () => {
    reset();
    setDetailsFor(null);
    setPhase("intro");
  };

  if (phase === "intro") return <IntroScreen onCovered={() => setPhase("answer")} />;

  const details = phase === "details";
  // Rám s overflow-hidden se nesmí nikdy posunout: obrazovky posouvá jen transform. Kdyby ho prohlížeč posunul
  // (např. focus na prvek během animace), byl by vršek useknutý a dole modrý pruh. Proto ho vracíme na 0
  // po každém posunu i po skončení animace (otevření i návrat).
  const resetFrame = () => {
    if (frame.current && frame.current.scrollTop !== 0) frame.current.scrollTop = 0;
  };
  return (
    <div ref={frame} onScroll={resetFrame} className="h-dvh overflow-hidden bg-tabule">
      <div
        onTransitionEnd={resetFrame}
        className="transition-transform duration-700 ease-[cubic-bezier(0.65,0,0.35,1)] motion-reduce:transition-none"
        style={{ transform: details ? "translateY(-100dvh)" : "translateY(0)" }}
      >
        {/* inert: obrazovka mimo pohled se nedá ovládat klávesnicí ani ji nečte čtečka. */}
        <div inert={details}>
          <AnswerScreen
            active={!details}
            onDetails={(which) => {
              setDetailsFor(which === answer ? null : which);
              setPhase("details");
            }}
            onNew={newQuestion}
            view={view}
            onViewChange={setView}
          />
        </div>
        <div inert={!details}>
          {detailsAnswer && (
            <DetailsScreen
              answer={detailsAnswer}
              view={detailsFor ? null : view}
              active={details}
              onBack={() => setPhase("answer")}
              onNew={newQuestion}
            />
          )}
        </div>
      </div>
    </div>
  );
}
