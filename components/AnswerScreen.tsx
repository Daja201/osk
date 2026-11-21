"use client";

import { useEffect, useRef, useState } from "react";
import { useAsk } from "@/app/ask-context";
import type { AskAnswer } from "@/lib/ai/types";
import { type ChartView, defaultView } from "@/lib/view";
import AnswerActions from "./AnswerActions";
import AnswerCard from "./AnswerCard";
import ChartEditor from "./ChartEditor";
import Footer from "./Footer";
import { PRESS } from "./styles";
import TopBar from "./TopBar";
import { effectiveView } from "./ViewChart";

function DetailsIcon() {
  return (
    <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 7h14M5 12h14M5 17h9" />
    </svg>
  );
}

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
  const editorOpen = editing && shown !== null && result !== null && current !== null;

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

  return (
    <div className="flex h-dvh flex-col bg-tabule text-white">
      <TopBar tone="blue" info="answer" onNew={onNew} />
      <main className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 py-4 sm:px-8">
        <div className={`m-auto flex w-full flex-col ${editorOpen ? "max-w-[1240px]" : "max-w-[900px]"}`}>
          {shown === null ? (
            <p aria-live="polite" className="m-0 text-center font-sign text-[24px] font-semibold text-on-sign-muted">
              Počítám z dat senzorů…
            </p>
          ) : (
            <div className={editorOpen ? "grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_360px]" : ""}>
              <div className="min-w-0">
                <div ref={region} tabIndex={-1} role="region" aria-label="Odpověď" className="animate-rise rounded-3xl">
                  <AnswerCard answer={shown} view={view} svgRef={svg} />
                </div>
                <div className="mt-4 flex items-start justify-between gap-3">
                  <AnswerActions answer={shown} view={view} svg={svg} onEdit={result ? toggleEditor : undefined} editing={editing} />
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
              </div>
              {editorOpen && (
                <div className="animate-rise flex flex-col gap-2 lg:sticky lg:top-0">
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
              )}
            </div>
          )}
        </div>
      </main>
      <Footer tone="blue" />
    </div>
  );
}
