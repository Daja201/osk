"use client";

import { type Ref, useState } from "react";
import type { AskAnswer } from "@/lib/ai/types";
import { explainPoint } from "@/lib/ui/answer";
import type { DataPick } from "@/lib/ui/chart";
import { formatNumber } from "@/lib/ui/format";
import type { ChartView } from "@/lib/view";
import AnswerStrip from "./AnswerStrip";
import ViewChart, { effectiveView } from "./ViewChart";

const czDate = (date: string) => date.split("-").reverse().map(Number).join(". ");

// Panel pod grafem: odkud je číslo, na které uživatel klikl (senzory, směr, hodiny, dotaz na CITIQ).
function PointPanel({ answer, picked, hint }: { answer: AskAnswer; picked: DataPick | null; hint: string }) {
  const point = picked ? explainPoint(answer, picked) : null;
  return (
    <div aria-live="polite" className="rounded-2xl border border-line bg-surface px-4 py-3 text-[16px] text-ink sm:px-5 sm:py-4">
      {!point ? (
        <p className="m-0 text-muted">{hint}</p>
      ) : (
        <div className="animate-rise flex flex-col gap-1.5">
          <p className="m-0 flex flex-wrap items-baseline gap-x-3">
            <span className="font-sign text-[28px] leading-none font-bold text-accent">{point.value === null ? "–" : formatNumber(point.value)}</span>
            <span className="font-semibold">
              {point.place} · {point.period}
            </span>
          </p>
          <p className="m-0 text-muted">{point.text}</p>
          {point.sources.length > 0 && (
            <p className="m-0 flex flex-wrap gap-x-4 gap-y-1">
              {point.sources.map((source) => (
                <a key={source.url} href={source.url} target="_blank" rel="noreferrer">
                  Dotaz na CITIQ za {czDate(source.date)}
                </a>
              ))}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// Odpověď v podrobnostech a na /a/<id>: graf nebo tabulka (ve vzhledu z editoru), na jejichž čísla jde kliknout,
// a pod nimi vysvětlení, odkud číslo je. U věty a zdroje dat pruh s klikacími čísly ve větě.
export default function AnswerExplorer({
  answer,
  view = null,
  height = 360,
  svgRef,
}: {
  answer: AskAnswer;
  view?: ChartView | null;
  height?: number;
  svgRef?: Ref<SVGSVGElement>;
}) {
  const [picked, setPicked] = useState<DataPick | null>(null);
  const result = answer.result?.ok ? answer.result : null;
  const shown = effectiveView(answer, view);
  const toggle = (pick: DataPick) => setPicked(picked?.gate === pick.gate && picked?.bucket === pick.bucket ? null : pick);

  if (result && shown) {
    return (
      <div className="flex flex-col gap-3">
        <ViewChart answer={answer} result={result} view={shown} svgRef={svgRef} height={height} onPick={toggle} picked={picked} ring="ring-line" />
        <PointPanel
          answer={answer}
          picked={picked}
          hint={shown.format === "table" ? "Klikněte na číslo v tabulce a uvidíte, odkud je." : "Klikněte na sloupec, bod nebo výseč a uvidíte, odkud to číslo je."}
        />
      </div>
    );
  }

  return <AnswerStrip key={answer.id ?? answer.question} answer={answer} />;
}
