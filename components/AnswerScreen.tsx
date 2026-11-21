"use client";

import { useEffect, useRef, useState } from "react";
import { MAX_TURNS, useAsk } from "@/app/ask-context";
import type { AskAnswer } from "@/lib/ai/types";
import { useIsWide } from "@/lib/ui/media";
import { type ChartView, defaultView } from "@/lib/view";
import AnswerActions from "./AnswerActions";
import AnswerCard from "./AnswerCard";
import ChartEditor from "./ChartEditor";
import FollowUp from "./FollowUp";
import Footer from "./Footer";
import { PRESS } from "./styles";
import TopBar from "./TopBar";
import { effectiveView } from "./ViewChart";


// Uloží kopii odpovědi s upraveným vzhledem (nový odkaz). Vrátí ji, nebo null, když se to nepovede.
async function saveVariant(answer: AskAnswer, view: ChartView): Promise<AskAnswer | null> {
  if (!answer.id) return null;
  try {
    const response = await fetch(`/api/answers/${answer.id}/variant`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ view, conversation_id: answer.conversation_id ?? null }),
    });
    if (!response.ok) return null;
    return (await response.json()) as AskAnswer;
  } catch {
    return null;
  }
}

// Modrá obrazovka s konverzací: předchozí otázky a odpovědi nahoře, poslední odpověď s tlačítky,
// pod ní pole pro navazující otázku. „Upravit vzhled“ (jen na počítači) otevře editor vedle poslední odpovědi;
// view = vzhled z editoru (drží ho HomeView).
export default function AnswerScreen({
  active,
  onDetails,
  onNew,
  view,
  onViewChange,
}: {
  active: boolean;
  onDetails: (answer: AskAnswer) => void;
  onNew: () => void;
  view: ChartView | null;
  onViewChange: (view: ChartView | null) => void;
}) {
  const { answer, history, question, status, turns, ask, replace } = useAsk();
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
  // U navazující otázky poslední odpověď posuneme nahoru do pohledu.
  const latest = useRef<HTMLElement>(null);
  useEffect(() => {
    if (active && shown) region.current?.focus({ preventScroll: true });
  }, [active, shown]);
  useEffect(() => {
    if (history.length > 0) latest.current?.scrollIntoView({ block: "start", behavior: "smooth" });
  }, [history.length, shown]);

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
      {/* Lišta je uvnitř posouvané oblasti: při posouvání odjede nahoru s obsahem. */}
      <main className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        <TopBar tone="blue" info="answer" onNew={onNew} />
        <div className={`m-auto flex w-full flex-col px-4 py-3 sm:px-8 sm:py-4 ${editorOpen ? "max-w-[1240px]" : "max-w-[900px]"}`}>
          {/* Předchozí otázky konverzace: otázka, odpověď a odkaz na podrobnosti. */}
          {history.map((previous) => (
            <section key={previous.id ?? previous.created_at} className="mb-8 flex flex-col gap-3">
              <Question text={previous.question} />
              <AnswerCard answer={previous} interactive={false} />
              <button type="button" onClick={() => onDetails(previous)} className={`${PRESS} min-h-11 self-start rounded-full bg-white/15 px-4 py-2 text-[15px] font-semibold text-white hover:bg-white/25`}>
                Jak to víme
              </button>
            </section>
          ))}
          <section ref={latest} className="flex scroll-mt-4 flex-col gap-3">
            {history.length > 0 && <Question text={shown?.question ?? question} />}
            {shown === null ? (
              <p aria-live="polite" className="m-0 py-8 text-center font-sign text-[24px] font-semibold text-on-sign-muted">
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
                      onDetails={canOpenDetails ? () => onDetails(shown) : undefined}
                      onEdit={result && wide ? toggleEditor : undefined}
                      editing={editing}
                    />
                  </div>
                </div>
                {editor && <div className="animate-rise sticky top-4">{editor}</div>}
              </div>
            )}
          </section>
          {shown !== null && turns > 0 && <FollowUp turns={turns} max={MAX_TURNS} onAsk={(next) => void ask(next, view ?? shown.view)} />}
        </div>
        <Footer tone="blue" />
      </main>
    </div>
  );
}

// Otázka nad odpovědí v konverzaci.
function Question({ text }: { text: string }) {
  return <p className="m-0 text-[17px] leading-snug font-medium text-pretty text-on-sign-muted sm:text-[19px]">„{text}“</p>;
}
