"use client";

import { useRef } from "react";
import { PRESS } from "./styles";

export type InfoTopic = "ask" | "answer" | "details";

// Místa pro nápovědu. TODO: později z gates.json (Davidova data).
const PLACES = ["17. listopadu", "Kafkova", "Hynaisova (u Billy)", "Tržnice", "U Letadla", "Parkoviště Flora", "Peškova", "Voskovcova"];

const EXAMPLES = [
  "Kolik aut včera projelo ulicí 17. listopadu?",
  "Kolik aut včera přijelo na parkoviště Flora?",
  "Kdy byla včera největší špička u Billy?",
  "Kolik aut projelo v pondělí mezi 6 a 10 ulicí Kafkova?",
];

function Item({ term, children }: { term: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="font-semibold">{term}</dt>
      <dd className="m-0 text-muted">{children}</dd>
    </div>
  );
}

function AskHelp({ onPick }: { onPick?: (question: string) => void }) {
  return (
    <>
      <p className="m-0 text-muted">Odpovídám z dat dopravních senzorů v Olomouci.</p>
      <dl className="m-0 flex flex-col gap-3">
        <Item term="Co">Kolik aut projelo místem za celý den nebo jen v některých hodinách a kdy byla největší špička.</Item>
        <Item term="Kdy">Dny v minulosti, třeba „včera“, „předevčírem“, „v pondělí“ nebo „mezi 6 a 10“.</Item>
        <Item term="Kde">{PLACES.join(", ")}.</Item>
      </dl>
      <div className="flex flex-col gap-2">
        <p className="m-0 font-semibold">Zkuste třeba</p>
        <div className="flex flex-wrap gap-2">
          {EXAMPLES.map((question) => (
            <button
              key={question}
              type="button"
              onClick={() => onPick?.(question)}
              className={`${PRESS} rounded-xl border border-line bg-band px-3 py-2 text-left text-[16px] text-ink hover:border-ink`}
            >
              {question}
            </button>
          ))}
        </div>
      </div>
    </>
  );
}

function AnswerHelp() {
  return (
    <dl className="m-0 flex flex-col gap-3">
      <Item term="Velké číslo">Hlavní výsledek, třeba kolik aut projelo za den. Spočítal ho náš kód z dat senzorů, ne AI.</Item>
      <Item term="Věta">Napsala ji AI z hotových výsledků. Náš kód v ní zkontroloval každé číslo.</Item>
      <Item term="Řádek pod větou">Den, hodiny a směr, ke kterým se odpověď vztahuje.</Item>
      <Item term="Trojúhelník">Upozornění, že senzory část doby nevysílaly a součet není úplný.</Item>
      <Item term="Graf">Ukáže se, když se ptáte na průběh dne nebo na špičku.</Item>
      <Item term="Tlačítko vpravo dole">Podrobnosti: odkud jsou data, jak AI postupovala a jak jsme kontrolovali čísla.</Item>
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
      <Item term="Kliknutí na číslo">Ukáže, odkud přesně číslo je.</Item>
      <Item term="Cesta odpovědi">Každý krok od otázky k odpovědi: co dělala AI a co náš kód, a jak dlouho to trvalo.</Item>
      <Item term="Data po hodinách">Hodnoty, ze kterých je odpověď spočítaná. Dají se stáhnout jako CSV.</Item>
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
        className={`${PRESS} flex size-10 shrink-0 rounded-[10px] p-[3px] ${tone === "blue" ? "bg-surface" : "bg-tabule"}`}
      >
        <span
          aria-hidden="true"
          className={`flex flex-1 items-center justify-center rounded-[7px] border-2 font-sign text-[22px] leading-none font-bold ${
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
        className="m-auto w-[min(560px,calc(100vw-32px))] rounded-3xl bg-surface p-0 text-ink backdrop:bg-black/50"
      >
        <div className="flex flex-col gap-5 p-6 sm:p-8">
          <div className="flex items-start justify-between gap-4">
            <h2 id={`info-${topic}`} className="m-0 font-sign text-[28px] leading-[1.15] font-bold">
              {TITLES[topic]}
            </h2>
            <button
              type="button"
              aria-label="Zavřít"
              onClick={close}
              className={`${PRESS} flex size-10 shrink-0 items-center justify-center rounded-full bg-band text-ink`}
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
        </div>
      </dialog>
    </>
  );
}
