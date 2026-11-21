"use client";

import { useRouter } from "next/navigation";
import type { AskAnswer } from "@/lib/ai/types";
import Footer from "./Footer";
import Proof from "./Proof";
import { SavedBody } from "./SavedView";
import TopBar from "./TopBar";

// Uložená konverzace (/c/<id>): všechny otázky pod sebou, u každé odpověď a rozbalitelné „Jak to víme“.
// Na tuhle stránku vede QR kód i „Kopírovat odkaz“; platí 7 dní od poslední otázky.
export default function ConversationView({ answers, expiresAt }: { answers: AskAnswer[]; expiresAt: string }) {
  const router = useRouter();
  const until = new Date(expiresAt).toLocaleDateString("cs-CZ", { timeZone: "Europe/Prague", day: "numeric", month: "numeric", year: "numeric" });
  return (
    <div className="flex min-h-dvh flex-col bg-tabule text-white">
      <TopBar tone="blue" info="answer" onNew={() => router.push("/")} />
      <main className="mx-auto flex w-full max-w-[900px] flex-1 flex-col gap-10 px-4 pt-2 pb-12 sm:px-8">
        <p className="m-0 text-[15px] text-on-sign-muted">Uložená konverzace · odkaz platí do {until}</p>
        {answers.map((answer, i) => (
          <section key={answer.id ?? i} className="flex flex-col gap-4">
            <h2 className="m-0 text-[19px] leading-snug font-medium text-pretty sm:text-[21px]">„{answer.question}“</h2>
            <SavedBody answer={answer} />
            {answer.trace.steps.length > 0 && (
              <details className="rounded-3xl bg-surface text-ink">
                <summary className="cursor-pointer rounded-3xl px-6 py-4 text-[17px] font-bold">Jak to víme</summary>
                <div className="px-4 pb-6 sm:px-8">
                  <Proof answer={answer} />
                </div>
              </details>
            )}
          </section>
        ))}
      </main>
      <Footer tone="blue" />
    </div>
  );
}
