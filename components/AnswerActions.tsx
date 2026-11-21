"use client";

import { type RefObject, useState } from "react";
import type { AskAnswer } from "@/lib/ai/types";
import { copyText, downloadCsv, downloadPng, tableTsv } from "@/lib/ui/export";
import { PRESS } from "./styles";

// Tlačítka pod odpovědí: odkaz na sdílení (platí 7 dní), PNG grafu, CSV dat, tabulka do schránky.
export default function AnswerActions({ answer, svg }: { answer: AskAnswer; svg: RefObject<SVGSVGElement | null> }) {
  const [status, setStatus] = useState<string | null>(null);
  const result = answer.result?.ok ? answer.result : null;
  const isChart = answer.format === "bar" || answer.format === "line" || answer.format === "pie";
  const name = `osk-${answer.id ?? "odpoved"}`;
  const flash = (text: string) => {
    setStatus(text);
    setTimeout(() => setStatus(null), 2000);
  };

  const button = `${PRESS} inline-flex h-10 items-center gap-2 rounded-full bg-white/15 px-4 text-[15px] font-semibold text-white hover:bg-white/25`;
  const actions: { label: string; run: () => Promise<void> | void }[] = [];
  if (answer.id) {
    actions.push({
      label: "Kopírovat odkaz",
      run: async () => flash((await copyText(`${window.location.origin}/a/${answer.id}`)) ? "Odkaz zkopírován, platí 7 dní" : "Kopírování se nepovedlo"),
    });
  }
  if (isChart) {
    actions.push({
      label: "Stáhnout PNG",
      run: async () => {
        if (!svg.current) return;
        try {
          await downloadPng(svg.current, `${name}.png`);
        } catch {
          flash("Obrázek se nepodařilo vytvořit");
        }
      },
    });
  }
  if (result && answer.format !== "source") actions.push({ label: "Stáhnout CSV", run: () => downloadCsv(result, `${name}.csv`) });
  if (result && answer.format === "table") {
    actions.push({ label: "Kopírovat tabulku", run: async () => flash((await copyText(tableTsv(result))) ? "Tabulka zkopírována, vložte ji do Excelu" : "Kopírování se nepovedlo") });
  }
  if (actions.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {actions.map((action) => (
        <button key={action.label} type="button" onClick={() => void action.run()} className={button}>
          {action.label}
        </button>
      ))}
      <span aria-live="polite" className="text-[15px] text-on-sign-muted">
        {status}
      </span>
    </div>
  );
}
