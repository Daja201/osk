"use client";

import { useRef } from "react";
import { ICON_BUTTON, PRESS } from "./styles";
import Suggestions, { EXAMPLES } from "./Suggestions";
import { PALETTE } from "@/lib/ai/palette";
import { TRAFFIC_DATASET } from "@/lib/citiq/gates";
import { WEATHER_DATASET } from "@/lib/citiq/weatherStations";

const PALETTE_LABELS = Object.values(PALETTE).map((color) => color.label).join(", ");

export type InfoTopic = "ask" | "answer" | "details";


// Nápověda je všude stejně kompaktní: krátký pojem vlevo, text vpravo, aby se vešla bez posouvání.
function HelpList({ children }: { children: React.ReactNode }) {
  return <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-[15px] leading-snug sm:gap-x-4 sm:gap-y-2.5">{children}</dl>;
}

function Item({ term, children }: { term: React.ReactNode; children: React.ReactNode }) {
  return (
    <>
      <dt className="font-semibold">{term}</dt>
      <dd className="m-0 text-ink/80">{children}</dd>
    </>
  );
}

function AskHelp({ onPick }: { onPick?: (question: string) => void }) {
  return (
    <>
      <p className="m-0 text-[15px] leading-snug text-ink/80 sm:text-[16px]">
        AI pochopí otázku, čísla počítá a kontroluje náš kód. Na odpověď můžete navázat další otázkou (až 10).
      </p>
      <HelpList>
        <Item term="Co">Doprava: kolik vozidel projelo, porovnání míst a dní, špičky, vjezdy a výjezdy. Počasí: teplota, vlhkost, tlak a vítr.</Item>
        <Item term="Kdy">Doprava od září 2024, počasí od léta 2025, najednou až 31 dní: „včera“, „posledních 7 hodin“, „loni v listopadu“.</Item>
        <Item term="Jak">Věta, sloupcový, čárový nebo koláčový graf, tabulka, odkaz na API. I s nadpisem a barvou pozadí ({PALETTE_LABELS}).</Item>
        <Item term="Kde">
          {TRAFFIC_DATASET.places.length} dopravních míst a {WEATHER_DATASET.places.length} meteostanic. Seznam je pod polem v „Na co se můžu zeptat?“.
        </Item>
      </HelpList>
      <div className="flex flex-col gap-2">
        <p className="m-0 text-[15px] font-semibold">Zkuste třeba</p>
        <Suggestions compact questions={EXAMPLES} onPick={(question) => onPick?.(question)} />
      </div>
    </>
  );
}

function AnswerHelp() {
  return (
    <>
      <p className="m-0 text-[15px] leading-snug text-ink/80 sm:text-[16px]">Graf, tabulku i čísla spočítal náš kód z dat senzorů. AI jen vybrala, co ukázat.</p>
      <HelpList>
        <Item term="Věta">U otázky „kolik…“ ji napsala AI z hotových čísel a náš kód v ní zkontroloval každé číslo.</Item>
        <Item term="Navázat">Pole pod odpovědí: další otázka staví na předchozí („červený“, „a předevčírem?“). Až 10 v konverzaci.</Item>
        <Item term="Odkaz a QR">Celá konverzace i s důkazem, odkud čísla jsou. Platí 7 dní.</Item>
        <Item term="Stáhnout">Obrázek PNG / SVG (i s nadpisem a zdrojem), data CSV nebo do tabulky.</Item>
        <Item term="Upravit">Typ, nadpis, barvy, osa a QR grafu (jen na počítači).</Item>
        <Item term="△">Senzory část doby nevysílaly nebo posílaly chybné hodnoty, součet není úplný.</Item>
        <Item term="Jak to víme">Jak odpověď vznikla, všechna čísla a přesné dotazy na zdrojové API.</Item>
      </HelpList>
    </>
  );
}

function DetailsHelp() {
  return (
    <HelpList>
      <Item term={<span className="underline decoration-marking decoration-[3px] underline-offset-[5px] [text-decoration-skip-ink:none]">123</span>}>
        Plné žluté podtržení: číslo spočítal náš kód z dat senzorů.
      </Item>
      <Item term={<span className="underline decoration-muted decoration-dashed decoration-2 underline-offset-[5px]">123</span>}>
        Čárkované podtržení: číslo je z vaší otázky (místo, den, hodiny), vybrala ho AI.
      </Item>
      <Item term="Cesta">Každý krok od otázky k odpovědi: co dělala AI, co náš kód a jak dlouho to trvalo.</Item>
      <Item term="Data">Všechna čísla, ze kterých je odpověď, včetně součtů.</Item>
      <Item term="Zdroj">Přesné dotazy na API CITIQ. Otevřou se v prohlížeči, takže si čísla může ověřit kdokoli.</Item>
    </HelpList>
  );
}

const TITLES: Record<InfoTopic, string> = {
  ask: "Na co se můžete zeptat",
  answer: "Co najdete v odpovědi",
  details: "Jak číst podrobnosti",
};

// Malý čtverec s otazníkem vpravo nahoře. Otevře okno s nápovědou podle obrazovky.
// <dialog> se zavře klávesou Esc, křížkem nebo kliknutím vedle.
export default function InfoButton({
  topic,
  tone,
  onPick,
}: {
  topic: InfoTopic;
  tone: "light" | "blue";
  onPick?: (question: string) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const close = () => dialog.current?.close();

  return (
    <>
      <button
        type="button"
        aria-haspopup="dialog"
        aria-label={TITLES[topic]}
        title={TITLES[topic]}
        onClick={() => dialog.current?.showModal()}
        className={`${ICON_BUTTON[tone]} font-sign text-[22px] leading-none font-bold`}
      >
        <span aria-hidden="true">?</span>
      </button>
      <dialog
        ref={dialog}
        aria-labelledby={`info-${topic}`}
        onClick={(event) => {
          if (event.target === dialog.current) close();
        }}
        // Na telefonu panel přes celou šířku zespodu (jako v mobilních aplikacích), na počítači okno uprostřed.
        className="m-auto max-h-[92dvh] w-[min(620px,calc(100vw-32px))] max-sm:max-h-[calc(100dvh-12px)] overflow-y-auto overscroll-contain rounded-3xl bg-surface p-0 text-ink backdrop:bg-black/50 max-sm:mb-0 max-sm:w-full max-sm:max-w-full max-sm:rounded-b-none"
      >
        <div className="flex flex-col gap-4 p-4 pb-[max(14px,env(safe-area-inset-bottom))] sm:gap-5 sm:p-7">
          <div className="flex items-start justify-between gap-4">
            <h2 id={`info-${topic}`} className="m-0 font-sign text-[26px] leading-[1.15] font-bold">
              {TITLES[topic]}
            </h2>
            <button
              type="button"
              aria-label="Zavřít"
              onClick={close}
              className={`${PRESS} flex size-11 shrink-0 items-center justify-center rounded-full bg-band text-ink`}
            >
              <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </div>
          {topic === "ask" && (
            <AskHelp
              onPick={(question) => {
                close();
                onPick?.(question);
              }}
            />
          )}
          {topic === "answer" && <AnswerHelp />}
          {topic === "details" && <DetailsHelp />}
          <p className="m-0 border-t border-line pt-4 text-[14px] leading-relaxed text-muted sm:hidden">
            © 2026 SleepNotFound ·{" "}
            <a href="https://github.com/Daja201/osk" target="_blank" rel="noreferrer" className="text-inherit underline underline-offset-2">
              GitHub
            </a>
          </p>
        </div>
      </dialog>
    </>
  );
}
