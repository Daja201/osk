"use client";

import { useEffect, useRef } from "react";
import type { AskAnswer } from "@/lib/ai/types";
import type { ChartView } from "@/lib/view";
import AnswerExplorer from "./AnswerExplorer";
import Footer from "./Footer";
import Proof from "./Proof";
import TopBar from "./TopBar";

// Druhá obrazovka pod odpovědí. Nahoře lišta, pod ní se scrolluje odpověď (graf, na který jde kliknout)
// a důkaz. Stránka jako celek se nescrolluje, posouvá se celý pohled.
export default function DetailsScreen({
  answer,
  view,
  active,
  onBack,
  onNew,
}: {
  answer: AskAnswer;
  view: ChartView | null;
  active: boolean;
  onBack: () => void;
  onNew: () => void;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);

  // Při otevření začít nahoře a přesunout focus na nadpis (bez posunu stránky, ten dělá animace).
  useEffect(() => {
    if (!active) return;
    scroller.current?.scrollTo({ top: 0 });
    heading.current?.focus({ preventScroll: true });
  }, [active, answer]);

  return (
    <div className="flex h-dvh flex-col bg-surface">
      {/* Lišta je uvnitř posouvané oblasti: při posouvání odjede nahoru s obsahem. */}
      <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto">
        <TopBar tone="light" info="details" onBack={onBack} onNew={onNew} />
        <div className="mx-auto flex max-w-[960px] flex-col gap-12 px-4 pt-2 pb-6 sm:px-8">
          <h1 ref={heading} tabIndex={-1} className="sr-only">
            Podrobnosti odpovědi
          </h1>
          {/* Odpověď = graf / tabulka (klikací čísla), u věty pruh s klikacími čísly ve větě. */}
          <AnswerExplorer key={answer.id ?? answer.question} answer={answer} view={view} height={340} />
          <Proof answer={answer} />
        </div>
        <Footer tone="light" />
      </div>
    </div>
  );
}
