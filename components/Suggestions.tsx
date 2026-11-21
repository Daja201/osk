// Navržené otázky. Jeden seznam pro úvod, odpověď „nevím“ i nápovědu „?“, ať jsou všude stejné.
// Vybrané tak, aby dohromady předvedly, co aplikace umí:
//   1. víc míst naráz, sloupcový graf a nadpis podle přání,
//   2. vývoj v čase přes víc dní (čárový graf),
//   3. odpověď větou, kterou napíše AI a náš kód v ní zkontroluje každé číslo.
export const EXAMPLES = [
  "Porovnej sloupcovým grafem s nadpisem Provoz včera, kolik aut projelo na 17. listopadu, Kafkově a u Billy",
  "Jak se měnil provoz na 17. listopadu za posledních 7 dní?",
  "Kdy byla včera největší špička na Kafkově a kolik aut tehdy projelo?",
];

export const TOP_EXAMPLES = EXAMPLES;

// Položky jsou pod sebou v jednom sloupci s mezerou 10 px. Po najetí se tlačítko jen o 1 px zvedne
// a ztmavne mu rámeček (žádné zvětšení), takže se ani rámeček focusu nedotkne sousední položky.
const ITEM =
  "group flex w-full cursor-pointer items-center justify-between gap-4 rounded-xl border border-line bg-surface px-4 py-3 text-left text-[16px] leading-snug text-ink transition-[transform,border-color,background-color] duration-150 ease-out hover:-translate-y-px hover:border-ink hover:bg-band active:translate-y-0 motion-reduce:transform-none";

export default function Suggestions({
  questions,
  onPick,
  id,
  className = "",
}: {
  questions: string[];
  onPick: (question: string) => void;
  id?: string;
  className?: string;
}) {
  return (
    <ul id={id} className={`m-0 flex w-full list-none flex-col gap-2.5 p-0 ${className}`}>
      {questions.map((question) => (
        <li key={question}>
          <button type="button" onClick={() => onPick(question)} className={ITEM}>
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
