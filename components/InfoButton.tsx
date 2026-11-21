"use client";

import { useRef } from "react";
import { PRESS } from "./styles";
import Suggestions, { EXAMPLES } from "./Suggestions";
import { PALETTE } from "@/lib/ai/palette";

const PALETTE_LABELS = Object.values(PALETTE).map((color) => color.label).join(", ");

export type InfoTopic = "ask" | "answer" | "details";

// Místa pro nápovědu. TODO: později z gates.json (Davidova data).
const PLACES = ["17. listopadu", "Kafkova", "Hynaisova (u Billy)", "Tržnice", "U Letadla", "Parkoviště Flora", "Peškova", "Voskovcova"];


function Item({ term, children }: { term: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="text-[18px] font-semibold">{term}</dt>
      <dd className="m-0 text-[17px] leading-relaxed text-ink/80">{children}</dd>
    </div>
  );
}

function AskHelp({ onPick }: { onPick?: (question: string) => void }) {
  return (
    <>
      <p className="m-0 text-[17px] leading-relaxed text-ink/80">Odpovídám z dat dopravních senzorů (bran) v Olomouci. AI pochopí otázku a napíše větu. Čísla počítá a kontroluje náš kód.</p>
      <dl className="m-0 flex flex-col gap-3">
        <Item term="Co">Kolik vozidel projelo jedním nebo víc místy (až 12), porovnání míst a dní, špičky, vjezdy a výjezdy.</Item>
        <Item term="Kdy">Libovolný čas za posledních 30 dní, najednou až 31 dní: „včera“, „v pondělí“, „posledních 7 hodin“, „minulý týden“, „mezi 6 a 10“.</Item>
        <Item term="Jak">Větou, sloupcovým, čárovým nebo koláčovým grafem, tabulkou, nebo odkazem na zdrojové API. Můžete si říct nadpis a barvu pozadí ({PALETTE_LABELS}).</Item>
        <Item term="Kde">{PLACES.join(", ")}.</Item>
      </dl>
      <div className="flex flex-col gap-2">
        <p className="m-0 font-semibold">Zkuste třeba</p>
        <Suggestions questions={EXAMPLES} onPick={(question) => onPick?.(question)} />
      </div>
    </>
  );
}

function AnswerHelp() {
  return (
    <dl className="m-0 flex flex-col gap-3">
      <Item term="Graf nebo tabulka">Nakreslil je náš kód přímo z dat senzorů. AI do nich nic nepíše, jen vybrala, co ukázat.</Item>
      <Item term="Věta">U otázky „kolik…“ ji napsala AI z hotových čísel a náš kód v ní zkontroloval každé číslo.</Item>
      <Item term="Kopírovat odkaz">Odkaz na tuhle odpověď i s důkazem, odkud čísla jsou. Platí 7 dní, dá se vložit do prezentace nebo e-mailu.</Item>
      <Item term="Stáhnout PNG / CSV">Obrázek grafu (i s nadpisem a zdrojem) a data pro Excel.</Item>
      <Item term="Trojúhelník">Upozornění, že senzory část doby nevysílaly a součet není úplný.</Item>
      <Item term="Tlačítko vpravo">Podrobnosti: jak odpověď vznikla, všechna čísla a přesné dotazy na zdrojové API.</Item>
    </dl>
  );
}

function DetailsHelp() {
  return (
    <dl className="m-0 flex flex-col gap-3">
      <Item
        term={<span className="underline decoration-marking decoration-[3px] underline-offset-[6px] [text-decoration-skip-ink:none]">Plné žluté podtržení</span>}
      >
        Číslo spočítal náš kód z dat senzorů.
      </Item>
      <Item term={<span className="underline decoration-muted decoration-dashed decoration-2 underline-offset-[6px]">Čárkované podtržení</span>}>
        Číslo je z vaší otázky (místo, den, hodiny). Vybrala ho AI.
      </Item>
      <Item term="Cesta odpovědi">Každý krok od otázky k odpovědi: co dělala AI a co náš kód, a jak dlouho to trvalo.</Item>
      <Item term="Data">Všechna čísla, ze kterých je odpověď, včetně součtů.</Item>
      <Item term="Zdroj dat">Přesné dotazy na API CITIQ. Otevřou se v prohlížeči, takže si čísla může ověřit kdokoli.</Item>
    </dl>
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
        className={`${PRESS} flex size-11 shrink-0 rounded-xl p-[3px] ${tone === "blue" ? "bg-surface" : "bg-tabule"}`}
      >
        <span
          aria-hidden="true"
          className={`flex flex-1 items-center justify-center rounded-[7px] border-2 font-sign text-[24px] leading-none font-bold ${
            tone === "blue" ? "border-accent text-accent" : "border-white text-white"
          }`}
        >
          ?
        </span>
      </button>
      <dialog
        ref={dialog}
        aria-labelledby={`info-${topic}`}
        onClick={(event) => {
          if (event.target === dialog.current) close();
        }}
        // Na telefonu panel přes celou šířku zespodu (jako v mobilních aplikacích), na počítači okno uprostřed.
        className="m-auto max-h-[88dvh] w-[min(560px,calc(100vw-32px))] overflow-y-auto overscroll-contain rounded-3xl bg-surface p-0 text-ink backdrop:bg-black/50 max-sm:mb-0 max-sm:w-full max-sm:max-w-full max-sm:rounded-b-none"
      >
        <div className="flex flex-col gap-6 p-6 pb-[max(24px,env(safe-area-inset-bottom))] sm:p-8">
          <div className="flex items-start justify-between gap-4">
            <h2 id={`info-${topic}`} className="m-0 font-sign text-[28px] leading-[1.15] font-bold">
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
            © 2026 SleepNotFound · Data: senzorová síť Olomouc (CITIQ) · Nejde o oficiální službu města
          </p>
        </div>
      </dialog>
    </>
  );
}
