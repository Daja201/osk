"use client";

import { useEffect, useRef } from "react";
import type { AskAnswer } from "@/lib/ai/types";
import type { TrafficCountInput } from "@/lib/ai/tools";
import { type Facts, factsOf, hourlyCsv, periodText, placeOf, toolCallOf, viewOf } from "@/lib/ui/answer";
import { capitalize, formatFetchedAt, formatHourRange, formatNumber } from "@/lib/ui/format";
import AnswerPath from "./AnswerPath";
import AnswerStrip from "./AnswerStrip";
import Footer from "./Footer";
import HourlyChart from "./HourlyChart";
import { PRESS } from "./styles";
import TopBar from "./TopBar";

const H2 = "m-0 font-sign text-[26px] leading-[1.2] font-bold sm:text-[30px]";

function downloadCsv(facts: Facts) {
  const blob = new Blob([hourlyCsv(facts)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `osk-${facts.place.replace(/[^\p{L}\d]+/gu, "-").toLowerCase()}-${facts.date}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

function Hourly({ facts }: { facts: Facts }) {
  // Jen zobrazené hodiny (u otázky na část dne jen ten rozsah), rozdělené do 3 sloupců.
  const rows = facts.hourly.slice(facts.from, facts.to).map((value, i) => ({ hour: facts.from + i, value }));
  const perColumn = Math.ceil(rows.length / 3);
  const columns = [0, 1, 2].map((i) => rows.slice(i * perColumn, (i + 1) * perColumn)).filter((c) => c.length > 0);
  return (
    <section aria-labelledby="hodiny" className="flex flex-col gap-3">
      <h2 id="hodiny" className={H2}>
        Data po hodinách
      </h2>
      <p className="m-0 text-muted">
        {capitalize(facts.scope)}, {periodText(facts)}, pražský čas.
      </p>
      <HourlyChart {...facts} />
      <div className="mt-4 grid gap-x-10 tabular-nums sm:grid-cols-3">
        {columns.map((column, i) => (
          <div key={i}>
            {column.map(({ hour, value }) => {
              const isPeak = facts.peak?.hour === hour;
              return (
                <div key={hour} className={`flex justify-between border-b border-line py-2 ${isPeak ? "font-semibold" : ""}`}>
                  <span className={isPeak ? undefined : "text-muted"}>{formatHourRange(hour)}</span>
                  <span className={value === null ? "text-muted" : undefined}>{value === null ? "chybí" : formatNumber(value)}</span>
                </div>
              );
            })}
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={() => downloadCsv(facts)}
        className={`${PRESS} mt-2 self-start rounded-full border border-line px-4 py-2 text-[16px] font-semibold text-accent hover:border-tabule`}
      >
        Stáhnout data jako CSV
      </button>
    </section>
  );
}

function Source({ facts, sensors, now }: { facts: Facts | null; sensors: string[]; now: Date }) {
  const rows: [string, React.ReactNode][] = [
    ["Síť", "Senzorová síť Olomouc (CITIQ, EnCLOD)"],
    ...(sensors.length > 0 ? [["Senzory", sensors.join(", ")] as [string, string]] : []),
    ["Interval", "1 hodina"],
    ["Čas", "data přicházejí v UTC, převádíme je na pražský čas"],
    ...(facts ? [["Staženo", formatFetchedAt(facts.fetchedAt, now)] as [string, string]] : []),
    ["Adresa", <a key="adresa" href={facts?.sourceUrl ?? "https://iot.citiq.cloud/"}>iot.citiq.cloud</a>],
  ];
  return (
    <section aria-labelledby="zdroj" className="flex flex-col gap-3">
      <h2 id="zdroj" className={H2}>
        Zdroj dat
      </h2>
      <dl className="m-0 grid grid-cols-[minmax(96px,auto)_minmax(0,1fr)] border-b border-line">
        {rows.map(([label, value]) => (
          <div key={label} className="contents">
            <dt className="border-t border-line py-2.5 pr-5 text-muted">{label}</dt>
            <dd className="m-0 border-t border-line py-2.5 [overflow-wrap:anywhere]">{value}</dd>
          </div>
        ))}
      </dl>
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
        <li>Když senzor nevysílá, hodina chybí. Nedoplňujeme ji nulou, součet pak není úplný.</li>
        <li>U bran na ulicích jsme zatím neověřili, který směr je „dovnitř“ a který „ven“. Proto počítáme hlavně oba směry dohromady.</li>
        <li>Na jednu otázku zatím umíme jedno místo a jeden den (celý, nebo jen některé hodiny).</li>
      </ul>
    </section>
  );
}

function Developers({ tool, facts }: { tool: TrafficCountInput; facts: Facts | null }) {
  const lines = [
    "traffic_count(",
    ...Object.entries(tool)
      .filter(([, value]) => value !== undefined)
      .map(([key, value]) => `  ${key}: ${JSON.stringify(value)},`),
    ")",
  ];
  if (facts) {
    lines.push(`coverage: ${facts.coverage.hours} / ${facts.coverage.of} hodin`, 'timezone: "Europe/Prague"');
    if (facts.notes.length > 0) lines.push("notes:", ...facts.notes.map((note) => `  - ${note}`));
  }
  return (
    <section aria-labelledby="vyvojari" className="flex flex-col gap-3">
      <h2 id="vyvojari" className={H2}>
        Pro vývojáře
      </h2>
      <p className="m-0 text-muted">Přesné volání výpočtu, jak ho AI vybrala.</p>
      <pre className="m-0 overflow-x-auto rounded-2xl bg-band px-5 py-[18px] font-mono text-[14px] leading-[1.6] text-ink">
        {lines.join("\n")}
      </pre>
    </section>
  );
}

// Druhá obrazovka pod odpovědí. Nahoře lišta a odpověď jako nízký pruh, pod tím se scrolluje
// jen obsah s podrobnostmi (stránka jako celek se nescrolluje, posouvá se celý pohled).
export default function DetailsScreen({
  answer,
  active,
  onBack,
  onNew,
}: {
  answer: AskAnswer;
  active: boolean;
  onBack: () => void;
  onNew: () => void;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);

  // Při otevření začít nahoře a přesunout focus na nadpis (bez posunu stránky, ten dělá animace).
  useEffect(() => {
    if (!active) return;
    scroller.current?.scrollTo({ top: 0 });
    heading.current?.focus({ preventScroll: true });
  }, [active, answer]);

  const view = viewOf(answer);
  const facts = answer.result?.ok ? factsOf(answer.result) : null;
  const tool = toolCallOf(answer);
  const sensors = facts?.sensors ?? (tool ? placeOf(tool.gate).sensors : []);

  return (
    <div className="flex h-dvh flex-col bg-surface">
      <TopBar tone="light" info="details" onBack={onBack} onNew={onNew} />
      <div className="px-4 sm:px-8">
        <div className="mx-auto max-w-[960px]">
          <h1 ref={heading} tabIndex={-1} className="sr-only">
            Podrobnosti odpovědi
          </h1>
          <AnswerStrip key={answer.sentence} sentence={answer.sentence} facts={facts} tool={tool} />
        </div>
      </div>
      <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex max-w-[960px] flex-col gap-14 px-4 pt-10 pb-6 sm:px-8">
          <AnswerPath answer={answer} view={view} facts={facts} tool={tool} />
          {facts && <Hourly facts={facts} />}
          <div className="grid grid-cols-[repeat(auto-fit,minmax(min(360px,100%),1fr))] items-start gap-x-14 gap-y-12">
            <Source facts={facts} sensors={sensors} now={new Date(answer.trace.now)} />
            <Limits />
          </div>
          {tool && <Developers tool={tool} facts={facts} />}
        </div>
        <Footer tone="light" />
      </div>
    </div>
  );
}
