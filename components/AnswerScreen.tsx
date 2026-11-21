"use client";

import { useEffect, useRef, useState } from "react";
import { useAsk } from "@/app/ask-context";
import type { AskAnswer } from "@/lib/ai/types";
import { useIsWide } from "@/lib/ui/media";
import { type ChartView, defaultView } from "@/lib/view";
import AnswerActions from "./AnswerActions";
import AnswerCard from "./AnswerCard";
import ChartEditor from "./ChartEditor";
import Footer from "./Footer";
import TopBar from "./TopBar";
import { effectiveView } from "./ViewChart";


// Uloží kopii odpovědi s upraveným vzhledem (nový odkaz). Vrátí ji, nebo null, když se to nepovede.
async function saveVariant(answer: AskAnswer, view: ChartView): Promise<AskAnswer | null> {
  if (!answer.id) return null;
  try {
    const response = await fetch(`/api/answers/${answer.id}/variant`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ view }),
    });
    if (!response.ok) return null;
    return (await response.json()) as AskAnswer;
  } catch {
    return null;
  }
}

// Modrá obrazovka: uprostřed odpověď (věta, graf, tabulka…), pod ní tlačítka a vpravo malé tlačítko na podrobnosti.
// „Upravit vzhled“ otevře editor vedle grafu (na mobilu pod ním); view = vzhled z editoru (drží ho HomeView).
export default function AnswerScreen({
  active,
  onDetails,
  onNew,
  view,
  onViewChange,
}: {
  active: boolean;
  onDetails: () => void;
  onNew: () => void;
  view: ChartView | null;
  onViewChange: (view: ChartView | null) => void;
}) {
  const { answer, status, replace } = useAsk();
  const wide = useIsWide();
  const region = useRef<HTMLDivElement>(null);
  const svg = useRef<SVGSVGElement>(null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const shown = status === "loading" ? null : answer;
  const result = shown?.result?.ok ? shown.result : null;
  const current = shown ? (effectiveView(shown, view) ?? defaultView(shown)) : null;

  // Po příchodu odpovědi (a po návratu z podrobností) přesuneme focus na odpověď,
  // aby ji čtečka obrazovky přečetla a klávesnice pokračovala odtud.
  useEffect(() => {
    if (active && shown) region.current?.focus({ preventScroll: true });
  }, [active, shown]);

  const canOpenDetails = shown !== null && shown.trace.steps.length > 0;
  // Editor vzhledu je jen na široké obrazovce (počítač). Na telefonu by byl nepřehledný, proto tam není vůbec.
  const editorOpen = wide && editing && shown !== null && result !== null && current !== null;

  // U věty nebo zdroje dat editor rovnou přepne na sloupcový graf (jinak by nebylo co upravovat).
  function toggleEditor() {
    if (!editing && shown && !effectiveView(shown, view)) onViewChange(defaultView(shown));
    setEditing(!editing);
  }

  async function save() {
    if (!shown || !current) return;
    setSaving(true);
    setSaveError(null);
    const saved = await saveVariant(shown, current);
    setSaving(false);
    if (!saved) {
      setSaveError(shown.id ? "Vzhled se nepodařilo uložit." : "Uložit jde jen skutečnou odpověď (ne testovací).");
      return;
    }
    replace(saved); // nová odpověď má nové id → odkaz i QR vedou na vzhled, který uživatel vidí
    onViewChange(null);
  }

  const editor = editorOpen ? (
    <div className="flex flex-col gap-2">
      <ChartEditor
        result={result}
        view={current}
        onChange={(next) => {
          setSaveError(null);
          onViewChange(next);
        }}
        onReset={() => onViewChange(null)}
        onSave={() => void save()}
        onClose={() => setEditing(false)}
        saving={saving}
        saved={view === null && shown.view !== null}
        hasLink={shown.id !== null}
      />
      {saveError && <p className="m-0 text-[15px] text-white">{saveError}</p>}
    </div>
  ) : null;

  // Rozložení: na široké obrazovce editor vedle grafu. Patička je v posouvané části,
  // aby na malém displeji nezabírala místo tlačítkům.
  return (
    <div className="flex h-dvh flex-col bg-tabule text-white">
      <TopBar tone="blue" info="answer" onNew={onNew} />
      <main className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        <div className={`m-auto flex w-full flex-col px-4 py-3 sm:px-8 sm:py-4 ${editorOpen ? "max-w-[1240px]" : "max-w-[900px]"}`}>
          {shown === null ? (
            <p aria-live="polite" className="m-0 text-center font-sign text-[24px] font-semibold text-on-sign-muted">
              Počítám z dat senzorů…
            </p>
          ) : (
            <div className={editorOpen ? "grid items-start gap-5 grid-cols-[minmax(0,1fr)_360px]" : ""}>
              <div className="min-w-0">
                <div ref={region} tabIndex={-1} role="region" aria-label="Odpověď" className="animate-rise rounded-3xl">
                  <AnswerCard answer={shown} view={view} svgRef={svg} />
                </div>
                <div className="mt-3 sm:mt-4">
                  <AnswerActions
                    answer={shown}
                    view={view}
                    svg={svg}
                    onDetails={canOpenDetails ? onDetails : undefined}
                    onEdit={result && wide ? toggleEditor : undefined}
                    editing={editing}
                  />
                </div>
              </div>
              {editor && <div className="animate-rise sticky top-0">{editor}</div>}
            </div>
          )}
        </div>
        <Footer tone="blue" />
      </main>
    </div>
  );
}
