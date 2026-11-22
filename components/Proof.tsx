"use client";

import type { AskAnswer } from "@/lib/ai/types";
import { MAX_GATES } from "@/lib/ai/gates";
import { periodOf } from "@/lib/ui/answer";
import AnswerPath from "./AnswerPath";
import DataTable from "./DataTable";

const H2 = "m-0 font-sign text-[26px] leading-[1.2] font-bold sm:text-[30px]";

const fetchedText = (iso: string) =>
  new Date(iso).toLocaleString("cs-CZ", { timeZone: "Europe/Prague", day: "numeric", month: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });

function Sources({ answer }: { answer: AskAnswer }) {
  const result = answer.result?.ok ? answer.result : null;
  return (
    <section aria-labelledby="zdroj" className="flex flex-col gap-3">
      <h2 id="zdroj" className={H2}>
        Zdroj dat
      </h2>
      <p className="m-0">
        Senzorová síť Olomouc (CITIQ, EnCLOD), view <code className="font-mono text-[15px]">olomouc-traffic-gates</code>: hodinové součty průjezdů
        dopravními branami. Data přicházejí v UTC, převádíme je na pražský čas.
      </p>
      {result && (
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {result.meta.sources.map((source) => (
            <li key={source.url} className="flex flex-col gap-1">
              <span className="text-[15px] text-muted">
                Den {source.date.split("-").reverse().join(". ")} · staženo {fetchedText(source.fetched_at)}
              </span>
              <a href={source.url} target="_blank" rel="noreferrer" className="font-mono text-[13px] break-all">
                {source.url}
              </a>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Limits() {
  return (
    <section aria-labelledby="omezeni" className="flex flex-col gap-3">
      <h2 id="omezeni" className={H2}>
        Co data neumí
      </h2>
      <ul className="m-0 flex list-disc flex-col gap-2.5 pl-[22px]">
        <li>Senzory posílají počty vozidel po hodinách. Přesnější čas průjezdu neznáme.</li>
        <li>Když senzor nevysílá, hodina chybí. Nedoplňujeme ji nulou, součet pak není úplný a je to u odpovědi napsané.</li>
        <li>Dnešek je jen do poslední celé hodiny.</li>
        <li>U bran na ulicích jsme zatím neověřili, který směr je „dovnitř“ a který „ven“. Proto počítáme hlavně oba směry dohromady.</li>
        <li>Najednou umíme nejvýš 31 dní a {MAX_GATES} míst; porovnat lze až 12 období v tomto rozsahu.</li>
        <li>Posledního půl roku máme uložené u sebe, starší data stahujeme přímo z CITIQ (trvá déle). Doprava je zhruba od září 2024, počasí od léta 2025.</li>
      </ul>
    </section>
  );
}

// Důkaz k odpovědi: jak vznikla, z jakých čísel a odkud data jsou.
export default function Proof({ answer }: { answer: AskAnswer }) {
  const result = answer.result?.ok ? answer.result : null;
  return (
    <div className="flex flex-col gap-14">
      <AnswerPath answer={answer} />
      {result && (
        <section aria-labelledby="data" className="flex flex-col gap-3">
          <h2 id="data" className={H2}>
            Data
          </h2>
          <p className="m-0 text-muted">{periodOf(answer)}, pražský čas. Z těchto čísel je odpověď.</p>
          <DataTable result={result} />
        </section>
      )}
      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(360px,100%),1fr))] items-start gap-x-14 gap-y-12">
        <Sources answer={answer} />
        <Limits />
      </div>
    </div>
  );
}
