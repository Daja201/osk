"use client";

import { type Ref, useState } from "react";
import { useAsk } from "@/app/ask-context";
import type { AskAnswer } from "@/lib/ai/types";
import { aggregateValue, type SeriesDisplayOk } from "@/lib/citiq/display";
import { viewOf } from "@/lib/ui/answer";
import { copyText } from "@/lib/ui/export";
import { formatNumber } from "@/lib/ui/format";
import { splitSentence } from "@/lib/ui/sentence";
import type { ChartView } from "@/lib/view";
import HourSummary from "./HourSummary";
import { PRESS } from "./styles";
import TitleParts from "./TitleParts";
import ViewChart, { effectiveView } from "./ViewChart";

const OUT_OF_SCOPE_TEXT =
  "Odpovídám jen na otázky o dopravě nebo naměřeném počasí v Olomouci: průjezdy dopravními branami a teplota, vlhkost, tlak či vítr z meteorologických stanic.";

function WarningIcon() {
  return (
    <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round" className="mt-0.5 shrink-0">
      <path d="M12 3.5L22 20.5H2L12 3.5z" />
      <path d="M12 10v4.5" />
      <path d="M12 17.5v.01" />
    </svg>
  );
}

// Poznámky kódu (chybějící data, úprava formátu). Krátce, jen když nějaké jsou.
function Notes({ notes, className = "" }: { notes: string[]; className?: string }) {
  if (notes.length === 0) return null;
  return (
    <ul className={`m-0 flex list-none flex-col gap-1 p-0 text-[15px] ${className}`}>
      {notes.map((note) => (
        <li key={note} className="flex gap-2">
          <WarningIcon />
          {note}
        </li>
      ))}
    </ul>
  );
}

// Věta s velkým číslem (součet u jediného místa): text před číslem, číslo + slovo za ním, zbytek.
function Sentence({ sentence, main }: { sentence: string; main: number | null }) {
  const parts = splitSentence(sentence, main, []);
  const text = (segments: { text: string }[]) => segments.map((s) => s.text).join("");
  if (parts.layout === "plain") {
    return <p className="m-0 text-[22px] leading-[1.4] font-medium text-pretty sm:text-[26px]">{text(parts.segments)}</p>;
  }
  return (
    <p className="m-0 text-[20px] leading-[1.4] font-medium text-pretty sm:text-[26px]">
      {parts.before.length > 0 && <span className="block">{text(parts.before)}</span>}
      <span className="my-1 block sm:my-2">
        {/* Velké číslo vždy z hodnoty v datech, naformátované kódem (AI ho jednou píše „30 067“, jindy „30067“). */}
        <span className="font-sign text-[68px] leading-none font-bold tracking-[-0.02em] whitespace-nowrap text-accent sm:text-[108px]">
          {main === null ? parts.main : formatNumber(main)}
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

// Zdroj dat: přesné dotazy na CITIQ, ze kterých odpověď je (otevřou se v prohlížeči jako JSON).
function Sources({ answer, result }: { answer: AskAnswer; result: SeriesDisplayOk }) {
  const [copied, setCopied] = useState<string | null>(null);
  return (
    <>
      <p className="m-0 text-[19px] leading-[1.5] text-pretty sm:text-[21px]">{answer.sentence}</p>
      <ul className="m-0 mt-5 flex list-none flex-col gap-3 p-0">
        {result.meta.sources.map((source) => (
          <li key={source.url} className="flex flex-col gap-1.5">
            <span className="text-[15px] font-semibold text-muted">Dotaz za {source.date.split("-").reverse().join(". ").replace(/^0/, "")}</span>
            <code className="block rounded-xl bg-band px-3 py-2 font-mono text-[13px] leading-relaxed break-all">{source.url}</code>
            <span className="flex gap-2">
              <button
                type="button"
                onClick={async () => setCopied((await copyText(source.url)) ? source.url : null)}
                className={`${PRESS} rounded-full border border-line px-3 py-1.5 text-[15px] font-semibold hover:border-ink`}
              >
                {copied === source.url ? "Zkopírováno" : "Kopírovat odkaz"}
              </button>
              <a href={source.url} target="_blank" rel="noreferrer" className={`${PRESS} rounded-full border border-line px-3 py-1.5 text-[15px] font-semibold no-underline hover:border-ink`}>
                Otevřít
              </a>
            </span>
          </li>
        ))}
      </ul>
    </>
  );
}

function OtherBody({ answer, interactive }: { answer: AskAnswer; interactive: boolean }) {
  const { ask } = useAsk();
  const view = viewOf(answer);
  if (view === "dataset_help") {
    return (
      <>
        <p className="m-0 font-sign text-[34px] leading-[1.05] font-bold sm:text-[44px]">Na co se můžete zeptat?</p>
        <p className="m-0 mt-3 text-[19px] leading-[1.45] text-pretty sm:text-[21px]">{answer.sentence}</p>
      </>
    );
  }
  if (view === "error") {
    const aiFailed = answer.reason?.code === "AI_ERROR";
    const rateLimited = answer.reason?.code === "RATE_LIMIT_ERROR";
    const full = answer.reason?.code === "CONVERSATION_FULL";
    const detail =
      rateLimited || full
        ? (answer.reason?.message ?? "Počkejte prosím chvíli a zkuste to znovu.")
        : answer.reason?.code === "NETWORK_ERROR"
          ? "Zkontrolujte připojení k internetu a zkuste to znovu."
          : (answer.reason?.message ?? "Zkuste to prosím za chvíli.");
    return (
      <>
        <p className="m-0 font-sign text-[30px] leading-[1.1] font-bold sm:text-[38px]">
          {full
            ? "Konverzace je plná."
            : rateLimited
            ? "Příliš mnoho dotazů."
            : aiFailed
              ? "Odpověď se teď nepodařilo připravit."
              : "Data se teď nepodařilo stáhnout."}
        </p>
        <p className="m-0 mt-2 text-muted">{detail}</p>
        {interactive && !full && (
          <button type="button" onClick={() => void ask(answer.question)} className={`${PRESS} mt-6 h-14 rounded-2xl bg-tabule px-7 text-[19px] font-semibold text-white`}>
            Zkusit znovu
          </button>
        )}
      </>
    );
  }
  return (
    <>
      <p className="m-0 font-sign text-[34px] leading-[1.05] font-bold sm:text-[44px]">{view === "out_of_scope" ? "Na tohle odpověď nemám." : "Tohle nevím."}</p>
      <p className="m-0 mt-3 text-[19px] leading-[1.45] text-pretty sm:text-[21px]">{view === "out_of_scope" ? OUT_OF_SCOPE_TEXT : answer.sentence}</p>
    </>
  );
}

// Odpověď podle formátu: věta, graf, tabulka, zdroj dat, nebo „nevím“.
// view = vzhled z editoru (null = jak vybrala AI, nebo uložený vzhled). svgRef dostane <svg> grafu (pro stažení).
// interactive = ukázat „Zkusit znovu“.
export default function AnswerCard({
  answer,
  view = null,
  svgRef,
  interactive = true,
}: {
  answer: AskAnswer;
  view?: ChartView | null;
  svgRef?: Ref<SVGSVGElement>;
  interactive?: boolean;
}) {
  const result = answer.result?.ok ? answer.result : null;
  const plain = "rounded-3xl bg-surface p-6 text-ink sm:p-10";

  const kind = viewOf(answer);
  if (kind !== "answer" || !result) {
    // „Nevím“ je na první pohled jiná než běžná odpověď: neutrální šedá karta.
    const unknown = kind === "out_of_scope" || kind === "unknown";
    return (
      <div className={unknown ? "rounded-3xl bg-band p-6 text-ink sm:p-10" : plain}>
        <OtherBody answer={answer} interactive={interactive} />
      </div>
    );
  }

  const shown = effectiveView(answer, view);
  if (shown) {
    return (
      <div className="flex flex-col gap-3">
        <ViewChart answer={answer} result={result} view={shown} svgRef={svgRef} />
        <HourSummary result={result} view={shown} />
        <Notes notes={answer.notes} className="text-white" />
      </div>
    );
  }

  if (answer.format === "source") {
    return (
      <div className={plain}>
        <Sources answer={answer} result={result} />
      </div>
    );
  }

  // Věta: velké číslo jen u jediného místa (jeho součet).
  const main = !result.data.comparison && result.data.series.length === 1 ? aggregateValue(result.data.series[0]) : null;
  return (
    <div className={plain}>
      <Sentence sentence={answer.sentence ?? ""} main={main} />
      {answer.title && (
        <p className="m-0 mt-5 text-[16px] text-muted">
          <TitleParts title={answer.title} />
        </p>
      )}
      <Notes notes={answer.notes} className="mt-2 text-ink" />
    </div>
  );
}
