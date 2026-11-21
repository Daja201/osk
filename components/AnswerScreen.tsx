"use client";

import { useEffect, useRef } from "react";
import { useAsk } from "@/app/ask-context";
import AnswerActions from "./AnswerActions";
import AnswerCard from "./AnswerCard";
import Footer from "./Footer";
import { PRESS } from "./styles";
import TopBar from "./TopBar";

function DetailsIcon() {
  return (
    <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 7h14M5 12h14M5 17h9" />
    </svg>
  );
}

// Modrá obrazovka: uprostřed odpověď (věta, graf, tabulka…), pod ní tlačítka a vpravo malé tlačítko na podrobnosti.
export default function AnswerScreen({ active, onDetails, onNew }: { active: boolean; onDetails: () => void; onNew: () => void }) {
  const { answer, status } = useAsk();
  const region = useRef<HTMLDivElement>(null);
  const svg = useRef<SVGSVGElement>(null);
  const shown = status === "loading" ? null : answer;

  // Po příchodu odpovědi (a po návratu z podrobností) přesuneme focus na odpověď,
  // aby ji čtečka obrazovky přečetla a klávesnice pokračovala odtud.
  useEffect(() => {
    if (active && shown) region.current?.focus({ preventScroll: true });
  }, [active, shown]);

  const canOpenDetails = shown !== null && shown.trace.steps.length > 0;

  return (
    <div className="flex h-dvh flex-col bg-tabule text-white">
      <TopBar tone="blue" info="answer" onNew={onNew} />
      <main className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 py-4 sm:px-8">
        <div className="m-auto flex w-full max-w-[900px] flex-col">
          {shown === null ? (
            <p aria-live="polite" className="m-0 text-center font-sign text-[24px] font-semibold text-on-sign-muted">
              Počítám z dat senzorů…
            </p>
          ) : (
            <>
              <div ref={region} tabIndex={-1} role="region" aria-label="Odpověď" className="animate-rise rounded-3xl">
                <AnswerCard answer={shown} svgRef={svg} />
              </div>
              <div className="mt-4 flex items-start justify-between gap-3">
                <AnswerActions answer={shown} svg={svg} />
                {canOpenDetails && (
                  <button
                    type="button"
                    onClick={onDetails}
                    aria-label="Podrobnosti: odkud jsou data a jak jsme je ověřili"
                    title="Podrobnosti"
                    className={`${PRESS} ml-auto flex size-12 shrink-0 items-center justify-center rounded-xl bg-surface text-accent`}
                  >
                    <DetailsIcon />
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </main>
      <Footer tone="blue" />
    </div>
  );
}
