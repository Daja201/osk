"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef } from "react";
import type { AskAnswer } from "@/lib/ai/types";
import { defaultView } from "@/lib/view";
import AnswerActions from "./AnswerActions";
import AnswerCard from "./AnswerCard";
import AnswerExplorer from "./AnswerExplorer";
import Footer from "./Footer";
import HourSummary from "./HourSummary";
import Proof from "./Proof";
import { PRESS } from "./styles";
import TopBar from "./TopBar";
import { effectiveView } from "./ViewChart";

// Uložená odpověď (/a/<id>): stejná grafika jako v aplikaci, pod ní celý důkaz.
// Odkaz jde poslat dál nebo vložit do prezentace; platí 7 dní.
export default function SavedView({ answer }: { answer: AskAnswer }) {
  const router = useRouter();
  const svg = useRef<SVGSVGElement>(null);
  const until = answer.expires_at
    ? new Date(answer.expires_at).toLocaleDateString("cs-CZ", { timeZone: "Europe/Prague", day: "numeric", month: "numeric", year: "numeric" })
    : null;
  return (
    <div className="min-h-dvh bg-tabule text-white">
      <TopBar tone="blue" info="answer" onNew={() => router.push("/")} />
      <main className="mx-auto flex max-w-[900px] flex-col gap-4 px-4 pt-2 pb-12 sm:px-8">
        <div className="flex flex-col gap-1">
          <p className="m-0 text-[15px] text-on-sign-muted">Uložená odpověď{until ? ` · odkaz platí do ${until}` : ""}</p>
          <h1 className="m-0 text-[19px] leading-snug font-medium text-pretty sm:text-[21px]">„{answer.question}“</h1>
        </div>
        {/* Graf a tabulka jsou klikací (odkud je číslo); věta, zdroj a „nevím“ jako v aplikaci. */}
        {["bar", "line", "pie", "table"].includes(answer.format ?? "") && answer.result?.ok ? (
          <>
            <AnswerExplorer answer={answer} svgRef={svg} />
            {answer.result?.ok && <HourSummary result={answer.result} view={effectiveView(answer, null) ?? defaultView(answer)} />}
          </>
        ) : (
          <AnswerCard answer={answer} svgRef={svg} interactive={false} />
        )}
        <AnswerActions answer={answer} svg={svg} />
      </main>
      <section aria-label="Jak to víme" className="rounded-t-[32px] bg-surface text-ink">
        <div className="mx-auto max-w-[960px] px-4 pt-12 pb-6 sm:px-8">
          <Proof answer={answer} />
        </div>
        <Footer tone="light" />
      </section>
    </div>
  );
}

// Odkaz neexistuje nebo vypršel.
export function SavedMissing() {
  const router = useRouter();
  return (
    <div className="flex min-h-dvh flex-col bg-tabule text-white">
      <TopBar tone="blue" info="ask" onNew={() => router.push("/")} />
      <main className="m-auto flex max-w-[640px] flex-col items-start gap-5 px-4 pb-[10vh]">
        <h1 className="m-0 font-sign text-[38px] leading-[1.05] font-bold sm:text-[48px]">Tahle odpověď už tu není.</h1>
        <p className="m-0 text-[19px] text-on-sign-muted">Odpovědi uchováváme 7 dní. Otázku můžete položit znovu, data jsou stejná.</p>
        <Link href="/" className={`${PRESS} rounded-2xl bg-surface px-6 py-3 text-[18px] font-semibold text-accent no-underline`}>
          Položit otázku
        </Link>
      </main>
      <Footer tone="blue" />
    </div>
  );
}
