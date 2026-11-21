"use client";

import { useState } from "react";
import { useAsk } from "@/app/ask-context";
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

  const newQuestion = () => {
    reset();
    setPhase("intro");
  };

  if (phase === "intro") return <IntroScreen onCovered={() => setPhase("answer")} />;

  const details = phase === "details";
  return (
    <div className="h-dvh overflow-hidden bg-tabule">
      <div
        className="transition-transform duration-700 ease-[cubic-bezier(0.65,0,0.35,1)] motion-reduce:transition-none"
        style={{ transform: details ? "translateY(-100dvh)" : "translateY(0)" }}
      >
        {/* inert: obrazovka mimo pohled se nedá ovládat klávesnicí ani ji nečte čtečka. */}
        <div inert={details}>
          <AnswerScreen active={!details} onDetails={() => setPhase("details")} onNew={newQuestion} />
        </div>
        <div inert={!details}>
          {answer && <DetailsScreen answer={answer} active={details} onBack={() => setPhase("answer")} onNew={newQuestion} />}
        </div>
      </div>
    </div>
  );
}
