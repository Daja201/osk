// Ukázkové otázky. Jsou jen v nápovědě „?“.
// Krátké a vybrané tak, aby předvedly hlavní možnosti (graf víc míst, vývoj v čase, věta se špičkou).
// Každou jsme vyzkoušeli se skutečným Haiku (21. 11. 2026).
export const EXAMPLES = [
  "Porovnej grafem Floru, Billu a U Letadla za včerejšek",
  "Jak se měnil provoz u Billy za 7 dní?",
  "Kdy byla včera špička u Letadla?",
];

// Položky jsou pod sebou v jednom sloupci s mezerou 10 px. Po najetí se tlačítko jen o 1 px zvedne
// a ztmavne mu rámeček (žádné zvětšení), takže se ani rámeček focusu nedotkne sousední položky.
const ITEM =
  "group flex w-full cursor-pointer items-center justify-between gap-4 rounded-xl border border-line bg-surface px-4 py-3 text-left text-[16px] leading-snug text-ink transition-[transform,border-color,background-color] duration-150 ease-out hover:-translate-y-px hover:border-ink hover:bg-band active:translate-y-0 motion-reduce:transform-none";

export default function Suggestions({
  questions,
  onPick,
  id,
  className = "",
  compact = false,
}: {
  questions: string[];
  onPick: (question: string) => void;
  id?: string;
  className?: string;
  compact?: boolean; // nižší položky (nápověda „?“, ať se vejde bez posouvání)
}) {
  return (
    <ul id={id} className={`m-0 flex w-full list-none flex-col p-0 ${compact ? "gap-1.5" : "gap-2.5"} ${className}`}>
      {questions.map((question) => (
        <li key={question}>
          <button type="button" onClick={() => onPick(question)} className={compact ? `${ITEM} min-h-11 py-2! text-[15px]!` : ITEM}>
            <span>{question}</span>
            <svg
              aria-hidden="true"
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="shrink-0 text-muted transition-transform duration-150 group-hover:translate-x-0.5 group-hover:text-ink motion-reduce:transform-none"
            >
              <path d="M5 12h14M13 6l6 6-6 6" />
            </svg>
          </button>
        </li>
      ))}
    </ul>
  );
}
