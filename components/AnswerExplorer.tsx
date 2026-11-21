"use client";

import { type Ref, useState } from "react";
import type { AskAnswer } from "@/lib/ai/types";
import { explainPoint } from "@/lib/ui/answer";
import { type DataPick, chartColors } from "@/lib/ui/chart";
import { formatNumber } from "@/lib/ui/format";
import { useTheme } from "@/lib/ui/theme";
import AnswerStrip from "./AnswerStrip";
import Chart from "./charts/Chart";
import DataTable from "./DataTable";

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

// Odpověď v podrobnostech a na /a/<id>: graf nebo tabulka, na jejichž čísla jde kliknout,
// a pod nimi vysvětlení, odkud číslo je. U věty a zdroje dat pruh s klikacími čísly ve větě.
export default function AnswerExplorer({ answer, height = 360, svgRef }: { answer: AskAnswer; height?: number; svgRef?: Ref<SVGSVGElement> }) {
  const theme = useTheme();
  const [picked, setPicked] = useState<DataPick | null>(null);
  const result = answer.result?.ok ? answer.result : null;
  const toggle = (pick: DataPick) => setPicked(picked?.gate === pick.gate && picked?.bucket === pick.bucket ? null : pick);

  if (result && (answer.format === "bar" || answer.format === "line" || answer.format === "pie")) {
    return (
      <div className="flex flex-col gap-3">
        <div className="overflow-hidden rounded-3xl ring-1 ring-line">
          <Chart
            kind={answer.format}
            result={result}
            title={answer.title ?? ""}
            colors={chartColors(answer.background, theme)}
            height={height}
            svgRef={svgRef}
            onPick={toggle}
            picked={picked}
          />
        </div>
        <PointPanel answer={answer} picked={picked} hint="Klikněte na sloupec, bod nebo výseč a uvidíte, odkud to číslo je." />
      </div>
    );
  }

  if (result && answer.format === "table") {
    const colors = chartColors(answer.background, theme);
    return (
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-4 rounded-3xl p-5 ring-1 ring-line sm:p-7" style={{ background: colors.bg, color: colors.text }}>
          <h2 className="m-0 font-sign text-[22px] leading-tight font-bold sm:text-[26px]">{answer.title}</h2>
          <DataTable result={result} onPick={toggle} picked={picked} />
        </div>
        <PointPanel answer={answer} picked={picked} hint="Klikněte na číslo v tabulce a uvidíte, odkud je." />
      </div>
    );
  }

  return <AnswerStrip key={answer.id ?? answer.question} answer={answer} />;
}
