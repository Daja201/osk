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

// Logo „OSK“. Obyčejný <a>, ne next/link: kliknutí stránku celou znovu načte (jako logo na většině webů),
// takže se smaže odpověď a začne se od úvodu.
function Logo({ tone }: { tone: "light" | "blue" }) {
  return (
    // eslint-disable-next-line @next/next/no-html-link-for-pages -- chceme úplné znovunačtení, <Link> by ho neudělal
    <a
      href="/"
      className={`flex min-h-11 min-w-11 items-center gap-2.5 rounded-md font-sign no-underline transition-opacity hover:opacity-80 ${
        tone === "blue" ? "text-white hover:text-white" : "text-ink hover:text-ink"
      }`}
    >
      <span className="text-[32px] leading-none font-bold tracking-tight">OSK</span>
    </a>
  );
}

// Horní lišta: vlevo název, vpravo „Zpět“, „Nová otázka“, přepínač vzhledu a čtverec s otazníkem (nápověda).
// Na obrazovce odpovědi a v podrobnostech je uvnitř posouvané oblasti: při posouvání odjede s obsahem.
export default function TopBar({ tone, info, onNew, onBack, onPick }: Props) {
  return (
    <header className="flex shrink-0 items-center justify-between gap-3 px-4 pt-[max(12px,env(safe-area-inset-top))] pb-3 sm:px-8 sm:pt-5 sm:pb-5">
      <Logo tone={tone} />
      <div className="flex items-center gap-2">
        {onBack && (
          <button type="button" onClick={onBack} aria-label="Zpět na odpověď" className={`${PILL[tone]} whitespace-nowrap max-sm:rounded-xl max-[359px]:w-11 max-[359px]:justify-center max-[359px]:px-0`}>
            <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="mr-1.5 max-[359px]:mr-0">
              <path d="M6 15l6-6 6 6" />
            </svg>
            {/* Na nejužších telefonech (pod 360 px) jen šipka, jinak by se lišta nevešla. */}
            <span className="max-[359px]:sr-only">Odpověď</span>
          </button>
        )}
        {onNew && (
          <button type="button" onClick={onNew} className={`${PILL[tone]} whitespace-nowrap max-sm:w-11 max-sm:justify-center max-sm:rounded-xl max-sm:px-0`} aria-label="Nová otázka" title="Nová otázka">
            {/* Na mobilu jen „+“, jinak by se lišta nevešla a text se zalomil. */}
            <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" className="sm:hidden">
              <path d="M12 5v14M5 12h14" />
            </svg>
            <span className="max-sm:hidden">Nová otázka</span>
          </button>
        )}
        <ThemeToggle tone={tone} />
        <InfoButton topic={info} tone={tone} onPick={onPick} />
      </div>
    </header>
  );
}
