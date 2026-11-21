"use client";

import { useEffect, useRef } from "react";
import type { AskAnswer } from "@/lib/ai/types";
import AnswerStrip from "./AnswerStrip";
import Footer from "./Footer";
import Proof from "./Proof";
import TopBar from "./TopBar";

// Druhá obrazovka pod odpovědí. Nahoře lišta a odpověď jako nízký pruh, pod tím se scrolluje
// jen obsah s důkazem (stránka jako celek se nescrolluje, posouvá se celý pohled).
export default function DetailsScreen({
  answer,
  active,
  onBack,
  onNew,
}: {
  answer: AskAnswer;
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
      <TopBar tone="light" info="details" onBack={onBack} onNew={onNew} />
      <div className="px-4 sm:px-8">
        <div className="mx-auto max-w-[960px]">
          <h1 ref={heading} tabIndex={-1} className="sr-only">
            Podrobnosti odpovědi
          </h1>
          <AnswerStrip key={answer.id ?? answer.question} answer={answer} />
        </div>
      </div>
      <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[960px] px-4 pt-10 pb-6 sm:px-8">
          <Proof answer={answer} />
        </div>
        <Footer tone="light" />
      </div>
    </div>
  );
}
