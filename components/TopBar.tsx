"use client";

import InfoButton, { type InfoTopic } from "./InfoButton";
import { PILL } from "./styles";
import ThemeToggle from "./ThemeToggle";

type Props = {
  tone: "light" | "blue";
  info: InfoTopic;
  onNew?: () => void;
  onBack?: () => void;
  onPick?: (question: string) => void;
};

// Horní lišta: vlevo název, vpravo „Zpět“, „Nová otázka“, přepínač vzhledu a čtverec s otazníkem (nápověda).
export default function TopBar({ tone, info, onNew, onBack, onPick }: Props) {
  const onBlue = tone === "blue";
  return (
    <header className="flex shrink-0 items-center justify-between gap-3 px-4 py-4 sm:px-8 sm:py-5">
      {/* Obyčejný <a>, ne next/link: kliknutí stránku celou znovu načte (jako logo na většině webů),
          takže se smaže odpověď a začne se od úvodu. */}
      {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- chceme úplné znovunačtení, <Link> by ho neudělal */}
      <a
        href="/"
        className={`flex items-baseline gap-2.5 rounded-md font-sign no-underline transition-opacity hover:opacity-80 ${
          onBlue ? "text-white hover:text-white" : "text-ink hover:text-ink"
        }`}
      >
        <span className="text-[26px] leading-none font-bold">Osk</span>
        <span className={`hidden text-[17px] leading-none font-medium sm:inline ${onBlue ? "text-on-sign-muted" : "text-muted"}`}>
          Zeptej se Olomouce
        </span>
      </a>
      <div className="flex items-center gap-2">
        {onBack && (
          <button type="button" onClick={onBack} className={PILL[tone]}>
            <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="mr-1.5">
              <path d="M6 15l6-6 6 6" />
            </svg>
            Odpověď
          </button>
        )}
        {onNew && (
          <button type="button" onClick={onNew} className={PILL[tone]}>
            Nová otázka
          </button>
        )}
        <ThemeToggle tone={tone} />
        <InfoButton topic={info} tone={tone} onPick={onPick} />
      </div>
    </header>
  );
}
