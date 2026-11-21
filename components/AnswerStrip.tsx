"use client";

import { useState } from "react";
import type { TrafficCountInput } from "@/lib/ai/tools";
import { type Facts, type NumberSource, numberSource } from "@/lib/ui/answer";
import { piecesOf } from "@/lib/ui/sentence";

// Podtržení podle toho, kdo číslo dodal: plné žluté = náš kód, čárkované = AI z otázky, červené = nesedí.
const UNDERLINE: Record<NumberSource["who"], string> = {
  code: "decoration-marking decoration-[3px]",
  ai: "decoration-on-sign-muted decoration-dashed decoration-2",
  bad: "decoration-bad decoration-[3px]",
};

const WHO_TEXT: Record<NumberSource["who"], string> = {
  code: "Spočítal náš kód",
  ai: "Z vaší otázky, vybrala AI",
  bad: "Nesedí s daty",
};

// Odpověď jako nízký pruh nahoře v podrobnostech. Na každé číslo jde kliknout
// a pod větou se ukáže, odkud je.
export default function AnswerStrip({
  sentence,
  facts,
  tool,
}: {
  sentence: string;
  facts: Facts | null;
  tool: TrafficCountInput | null;
}) {
  const [selected, setSelected] = useState<number | null>(null);
  const pieces = piecesOf(sentence);
  const picked = selected === null ? null : pieces[selected];
  const pickedSource = picked?.type === "number" ? numberSource(picked.token, facts, tool) : null;
  const hasNumbers = pieces.some((piece) => piece.type === "number");

  return (
    <section aria-label="Odpověď" className="shrink-0 rounded-2xl bg-tabule px-5 py-4 text-white sm:px-7 sm:py-5">
      <p className="m-0 text-[18px] leading-[1.6] font-medium sm:text-[21px]">
        {pieces.map((piece, index) => {
          if (piece.type === "text") return <span key={index}>{piece.text}</span>;
          const source = numberSource(piece.token, facts, tool);
          return (
            <button
              key={index}
              type="button"
              aria-expanded={selected === index}
              aria-controls="odkud-cislo"
              onClick={() => setSelected(selected === index ? null : index)}
              className={`cursor-pointer rounded-[4px] px-0.5 whitespace-nowrap underline underline-offset-[6px] transition-colors [text-decoration-skip-ink:none] hover:bg-white/15 ${UNDERLINE[source.who]} ${
                selected === index ? "bg-white/20" : ""
              }`}
            >
              {piece.token.text}
              <span className="sr-only"> ({WHO_TEXT[source.who]})</span>
            </button>
          );
        })}
      </p>

      <div id="odkud-cislo" aria-live="polite">
        {picked?.type === "number" && pickedSource && (
          <div className="animate-rise mt-3 flex flex-col gap-0.5 rounded-xl bg-surface px-4 py-3 text-[16px] text-ink">
            <span className="font-semibold">
              {picked.token.text} · {WHO_TEXT[pickedSource.who]}
            </span>
            <span className="text-muted">{pickedSource.long}</span>
          </div>
        )}
      </div>

      {hasNumbers && (
        <p className="m-0 mt-2.5 flex flex-wrap gap-x-5 gap-y-1 text-[14px] text-on-sign-muted">
          <span>
            <span className="underline decoration-marking decoration-[3px] underline-offset-4 [text-decoration-skip-ink:none]">123</span> spočítal náš kód
          </span>
          <span>
            <span className="underline decoration-on-sign-muted decoration-dashed decoration-2 underline-offset-4">123</span> z vaší otázky (vybrala AI)
          </span>
          <span>Klikněte na číslo.</span>
        </p>
      )}
    </section>
  );
}
