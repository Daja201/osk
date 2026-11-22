"use client";

import type { Ref } from "react";
import type { AskAnswer } from "@/lib/ai/types";
import type { SeriesDisplayOk } from "@/lib/citiq/display";
import { type DataPick, chartColors } from "@/lib/ui/chart";
import { useShareUrl } from "@/lib/ui/qr";
import { type ChartView, defaultView } from "@/lib/view";
import Chart from "./charts/Chart";
import DataTable from "./DataTable";
import TitleParts from "./TitleParts";

// Vzhled, podle kterého se odpověď kreslí: úprava z editoru, uložený vzhled, nebo výchozí od AI.
// null = odpověď není graf ani tabulka (věta, zdroj dat) a nikdo ji v editoru nepřepnul.
export function effectiveView(answer: AskAnswer, edited: ChartView | null | undefined): ChartView | null {
  const view =
    edited ??
    answer.view ??
    (answer.format === "bar" || answer.format === "line" || answer.format === "pie" || answer.format === "table" ? defaultView(answer) : null);
  if (!view) return null;
  const result = answer.result?.ok ? answer.result : null;
  if (result?.meta.tool === "weather_series" && result.meta.params.metrics.length > 1 && view.format !== "table") {
    return { ...view, format: "table" };
  }
  if (
    result?.meta.tool === "combined_series" &&
    new Set(result.data.series.map((series) => series.unit ?? "")).size > 2 &&
    view.format !== "table"
  ) {
    return { ...view, format: "table" };
  }
  return view;
}

// Graf nebo tabulka přesně podle vzhledu (typ, nadpis, pozadí, barvy, osa, QR).
export default function ViewChart({
  answer,
  result,
  view,
  svgRef,
  height,
  onPick,
  picked,
  ring = "ring-white/25",
}: {
  ring?: string; // rámeček: bílý na modré stránce, šedý na bílé (podrobnosti)
  answer: AskAnswer;
  result: SeriesDisplayOk;
  view: ChartView;
  svgRef?: Ref<SVGSVGElement>;
  height?: number;
  onPick?: (pick: DataPick) => void;
  picked?: DataPick | null;
}) {
  const shareUrl = useShareUrl(answer);
  const colors = chartColors(view.background);

  if (view.format === "table") {
    return (
      <div className={`flex flex-col gap-4 rounded-3xl p-5 ring-1 sm:p-8 ${ring}`} style={{ background: colors.bg, color: colors.text }}>
        {view.title && (
          <h2 className="m-0 font-sign text-[24px] leading-tight font-bold sm:text-[28px]">
            <TitleParts title={view.title} />
          </h2>
        )}
        <DataTable result={result} onPick={onPick} picked={picked} />
      </div>
    );
  }

  return (
    // Graf má vlastní pozadí z palety; tenký okraj, aby byl vidět i na modré stránce.
    <div className={`overflow-hidden rounded-3xl ring-1 ${ring}`}>
      <Chart
        kind={view.format}
        result={result}
        title={view.title}
        colors={colors}
        svgRef={svgRef}
        height={height}
        onPick={onPick}
        picked={picked}
        qrUrl={view.qr ? shareUrl : null}
        axisSetting={view.axis}
        slotColors={view.colors}
      />
    </div>
  );
}
