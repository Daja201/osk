"use client";

import { useEffect, useRef } from "react";
import { useAsk } from "@/app/ask-context";
import type { AskAnswer } from "@/lib/ai/types";
import { type Facts, factsOf, periodText, viewOf, wantsChart } from "@/lib/ui/answer";
import { capitalize } from "@/lib/ui/format";
import { splitSentence } from "@/lib/ui/sentence";
import Footer from "./Footer";
import HourlyChart from "./HourlyChart";
import { PRESS } from "./styles";
import Suggestions, { TOP_EXAMPLES } from "./Suggestions";
import TopBar from "./TopBar";

const OUT_OF_SCOPE_TEXT =
  "Odpovídám jen na otázky o dopravě v Olomouci, a to z dat dopravních senzorů: kolik aut projelo místem za den nebo jeho část a kdy byla špička.";


function WarningIcon() {
  return (
    <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round" className="mt-0.5 shrink-0">
      <path d="M12 3.5L22 20.5H2L12 3.5z" />
      <path d="M12 10v4.5" />
      <path d="M12 17.5v.01" />
    </svg>
  );
}

// Věta s velkým číslem: text před číslem, číslo + slovo za ním, zbytek. Bez podtržení,
// odkud jsou čísla, ukazují až podrobnosti.
function Sentence({ sentence, total }: { sentence: string; total: number }) {
  const parts = splitSentence(sentence, total, []);
  const text = (segments: { text: string }[]) => segments.map((s) => s.text).join("");
  if (parts.layout === "plain") {
    return <p className="m-0 text-[22px] leading-[1.4] font-medium text-pretty sm:text-[26px]">{text(parts.segments)}</p>;
  }
  return (
    <p className="m-0 text-[20px] leading-[1.4] font-medium text-pretty sm:text-[26px]">
      {parts.before.length > 0 && <span className="block">{text(parts.before)}</span>}
      <span className="my-1 block sm:my-2">
        <span className="font-sign text-[68px] leading-none font-bold tracking-[-0.02em] whitespace-nowrap text-accent sm:text-[108px]">
          {parts.main}
        </span>
        {parts.wordAfter && (
          <>
            {" "}
            <span className="font-sign text-[28px] leading-none font-semibold sm:text-[42px]">{parts.wordAfter}</span>
          </>
        )}
      </span>
      {parts.after.length > 0 && <span className="block">{text(parts.after)}</span>}
    </p>
  );
}

function AnswerBody({ answer, facts }: { answer: AskAnswer; facts: Facts }) {
  return (
    <>
      <Sentence sentence={answer.sentence} total={facts.total} />
      <p className="m-0 mt-5 text-[16px] text-muted">
        {capitalize(periodText(facts))} · {facts.scope}
      </p>
      {facts.warnings.map((warning) => (
        <p key={warning} className="m-0 mt-2 flex gap-2 text-[16px] text-ink">
          <WarningIcon />
          {warning}
        </p>
      ))}
      {wantsChart(answer.question) && (
        <div className="mt-6 border-t border-line pt-5">
          <h2 className="m-0 font-sign text-[20px] leading-tight font-semibold">Po hodinách</h2>
          <HourlyChart {...facts} />
        </div>
      )}
    </>
  );
}

function TrySuggestions() {
  const { ask } = useAsk();
  return (
    <div className="mt-6 flex flex-col gap-2.5">
      <p className="m-0 text-[16px] font-semibold">Zkuste se zeptat třeba</p>
      <Suggestions questions={TOP_EXAMPLES} onPick={(question) => void ask(question)} />
    </div>
  );
}

function OtherBody({ answer }: { answer: AskAnswer }) {
  const { ask } = useAsk();
  const view = viewOf(answer);
  if (view === "error") {
    const aiFailed = answer.reason?.code === "AI_ERROR";
    const detail =
      answer.reason?.code === "NETWORK_ERROR"
        ? "Zkontrolujte připojení k internetu a zkuste to znovu."
        : (answer.reason?.message ?? "Zkuste to prosím za chvíli.");
    return (
      <>
        <p className="m-0 font-sign text-[30px] leading-[1.1] font-bold sm:text-[38px]">
          {aiFailed ? "Odpověď se teď nepodařilo připravit." : "Data se teď nepodařilo stáhnout."}
        </p>
        <p className="m-0 mt-2 text-muted">{detail}</p>
        <button
          type="button"
          onClick={() => void ask(answer.question)}
          className={`${PRESS} mt-6 h-14 rounded-2xl bg-tabule px-7 text-[19px] font-semibold text-white`}
        >
          Zkusit znovu
        </button>
      </>
    );
  }
  return (
    <>
      <p className="m-0 font-sign text-[34px] leading-[1.05] font-bold sm:text-[44px]">
        {view === "out_of_scope" ? "Na tohle odpověď nemám." : "Tohle nevím."}
      </p>
      <p className="m-0 mt-3 text-[19px] leading-[1.45] text-pretty sm:text-[21px]">
        {view === "out_of_scope" ? OUT_OF_SCOPE_TEXT : answer.sentence}
      </p>
      <TrySuggestions />
    </>
  );
}

function DetailsIcon() {
  return (
    <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 7h14M5 12h14M5 17h9" />
    </svg>
  );
}

// Modrá obrazovka: uprostřed bílé okno s odpovědí, pod ním vpravo malé tlačítko na podrobnosti.
export default function AnswerScreen({
  active,
  onDetails,
  onNew,
}: {
  active: boolean;
  onDetails: () => void;
  onNew: () => void;
}) {
  const { answer, status } = useAsk();
  const card = useRef<HTMLDivElement>(null);
  const shown = status === "loading" ? null : answer;

  // Po příchodu odpovědi (a po návratu z podrobností) přesuneme focus na okno s odpovědí,
  // aby ji čtečka obrazovky přečetla a klávesnice pokračovala odtud.
  useEffect(() => {
    if (active && shown) card.current?.focus({ preventScroll: true });
  }, [active, shown]);

  const facts = shown?.result?.ok && viewOf(shown) === "answer" ? factsOf(shown.result) : null;
  const canOpenDetails = shown !== null && shown.trace.steps.length > 0;

  return (
    <div className="flex h-dvh flex-col bg-tabule text-white">
      <TopBar tone="blue" info="answer" onNew={onNew} />
      <main className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 py-4 sm:px-8">
        <div className="m-auto flex w-full max-w-[760px] flex-col">
          {shown === null ? (
            <p aria-live="polite" className="m-0 text-center font-sign text-[24px] font-semibold text-on-sign-muted">
              Počítám z dat senzorů…
            </p>
          ) : (
            <>
              <div
                ref={card}
                tabIndex={-1}
                aria-label="Odpověď"
                role="region"
                className="animate-rise rounded-3xl bg-surface p-6 text-ink sm:p-10"
              >
                {facts ? <AnswerBody answer={shown} facts={facts} /> : <OtherBody answer={shown} />}
              </div>
              {canOpenDetails && (
                <div className="mt-3 flex justify-end">
                  <button
                    type="button"
                    onClick={onDetails}
                    aria-label="Podrobnosti: odkud jsou data a jak jsme je ověřili"
                    title="Podrobnosti"
                    className={`${PRESS} flex size-12 items-center justify-center rounded-xl bg-surface text-accent`}
                  >
                    <DetailsIcon />
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </main>
      <Footer tone="blue" />
    </div>
  );
}
