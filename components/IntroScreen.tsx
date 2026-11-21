"use client";

import { useEffect, useRef, useState } from "react";
import { useAsk } from "@/app/ask-context";
import { useIsWide } from "@/lib/ui/media";
import Footer from "./Footer";
import { PRESS } from "./styles";
import Suggestions, { TOP_EXAMPLES } from "./Suggestions";
import TopBar from "./TopBar";

// Kroky animace: tlačítko se roztočí, „roztéká“ (mění tvar) a zvětší přes celou obrazovku.
// Dělá to Web Animations API prohlížeče (element.animate), žádná knihovna.
function blobFrames(scale: number): Keyframe[] {
  return [
    { transform: "rotate(0deg) scale(1)", borderRadius: "16px" },
    { transform: "rotate(110deg) scale(1.15)", borderRadius: "46% 54% 38% 62% / 55% 38% 62% 45%", offset: 0.25 },
    { transform: "rotate(230deg) scale(3)", borderRadius: "60% 40% 55% 45% / 40% 60% 45% 55%", offset: 0.55 },
    { transform: `rotate(360deg) scale(${scale})`, borderRadius: "50%" },
  ];
}

const HINT_DELAY_MS = 5000;

// Úvod: jen pole pro otázku a tlačítko. Po odeslání se tlačítko rozleje přes obrazovku
// a zavolá se onCovered (rodič přepne na modrou obrazovku s odpovědí). Odpověď se mezitím počítá.
export default function IntroScreen({ onCovered }: { onCovered: () => void }) {
  const { ask } = useAsk();
  const wide = useIsWide(); // na úzkém displeji kratší ukázkový text, dlouhý by se uřízl
  const [value, setValue] = useState("");
  const [leaving, setLeaving] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const blob = useRef<HTMLDivElement>(null);
  // Nápověda pod polem: tlačítko se objeví až po chvíli, ať úvod na začátku zůstane čistý.
  const [hintVisible, setHintVisible] = useState(false);
  const [hintOpen, setHintOpen] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setHintVisible(true), HINT_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, []);

  function submit(event: React.FormEvent) {
    event.preventDefault();
    start(value);
  }

  // Odeslání otázky a animace. Volá ho formulář i kliknutí na navrženou otázku.
  function start(raw: string) {
    const question = raw.trim();
    if (!question || leaving) return;
    void ask(question);
    setLeaving(true);

    const from = button.current;
    const el = blob.current;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!from || !el || reduceMotion) {
      onCovered();
      return;
    }
    // Skvrnu položíme přesně na tlačítko a spočítáme, kolikrát ji zvětšit, aby zakryla celou obrazovku.
    const r = from.getBoundingClientRect();
    Object.assign(el.style, { left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px`, display: "block" });
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    const reach = Math.hypot(Math.max(cx, window.innerWidth - cx), Math.max(cy, window.innerHeight - cy));
    const scale = (reach * 2.3) / Math.min(r.width, r.height);
    el.animate(blobFrames(scale), { duration: 950, easing: "cubic-bezier(0.7, 0, 0.3, 1)", fill: "forwards" })
      .finished.then(onCovered, onCovered);
  }

  const fade = `transition-opacity duration-300 ${leaving ? "opacity-0" : ""}`;

  // Pole pro otázku: zaoblené pole s tlačítkem uvnitř (na mobilu kulatá šipka, na počítači „Zeptat se“).
  const composer = (
    <form
      role="search"
      onSubmit={submit}
      className="composer flex w-full items-center gap-2 rounded-[30px] border-2 border-line bg-surface p-1.5 pl-5 transition-colors hover:border-muted sm:rounded-[34px] sm:p-2 sm:pl-6"
    >
      <label htmlFor="otazka" className="sr-only">
        Vaše otázka
      </label>
      <input
        ref={input}
        id="otazka"
        type="text"
        value={value}
        maxLength={300}
        required
        autoComplete="off"
        enterKeyHint="send"
        autoFocus
        disabled={leaving}
        onChange={(event) => setValue(event.target.value)}
        placeholder={wide ? "Kolik aut včera projelo ulicí 17. listopadu?" : "Napište otázku o dopravě…"}
        className={`composer-input h-12 min-w-0 flex-1 bg-transparent font-sans text-[17px] font-medium text-ink placeholder:text-muted sm:h-14 sm:text-[20px] ${fade}`}
      />
      <button
        ref={button}
        type="submit"
        disabled={leaving}
        aria-label="Zeptat se"
        className={`${PRESS} flex size-12 shrink-0 items-center justify-center rounded-full bg-tabule font-sans text-[19px] font-semibold whitespace-nowrap text-white hover:bg-[#0A4482] disabled:hover:scale-100 sm:h-14 sm:w-auto sm:px-7`}
      >
        <span className={`max-sm:hidden ${leaving ? "invisible" : ""}`}>Zeptat se</span>
        <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" className={`sm:hidden ${leaving ? "invisible" : ""}`}>
          <path d="M5 12h14M13 6l6 6-6 6" />
        </svg>
      </button>
    </form>
  );

  const hint = (
    <div className={`flex flex-col items-center gap-3 ${fade}`}>
      {/* Tlačítko je ve stránce od začátku (má rezervované místo), jen je neviditelné. Po 5 s se plynule objeví,
          takže nic neposkočí. Dokud není vidět, nejde na něj kliknout ani se na něj dostat Tabem. */}
      {!leaving && (
        <button
          type="button"
          aria-expanded={hintOpen}
          aria-controls="navrhy"
          aria-hidden={!hintVisible}
          tabIndex={hintVisible ? 0 : -1}
          onClick={() => setHintOpen(!hintOpen)}
          className={`${PRESS} flex min-h-11 items-center gap-1.5 rounded-full px-4 py-2 text-[16px] font-medium text-muted transition-[opacity,translate,background-color,color] duration-700 ease-out hover:bg-band hover:text-ink motion-reduce:transition-none ${
            hintVisible ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-1.5 opacity-0"
          }`}
        >
          Na co se můžu zeptat?
          <svg
            aria-hidden="true"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={`transition-transform duration-200 ${hintOpen ? "rotate-180" : ""}`}
          >
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>
      )}
      {hintOpen && !leaving && (
        <Suggestions
          id="navrhy"
          questions={TOP_EXAMPLES}
          className="animate-rise max-w-[560px]"
          onPick={(question) => {
            setValue(question);
            start(question);
          }}
        />
      )}
    </div>
  );

  // Rozložení:
  // - telefon: nahoře krátké přivítání, pole pro otázku dole u palce (jako v mobilních aplikacích), návrhy nad ním,
  //   patička je v nápovědě „?“ (úvod zůstane čistý),
  // - počítač: pole uprostřed obrazovky, návrhy pod ním, patička dole.
  return (
    <div className="flex h-dvh flex-col bg-surface">
      <div className={fade}>
        <TopBar
          tone="light"
          info="ask"
          onPick={(question) => {
            setValue(question);
            input.current?.focus();
          }}
        />
      </div>
      {/* overflow-y-auto: když se obsah nevejde (otevřená klávesnice, rozbalené návrhy), dá se posunout,
          místo aby se texty a ikony překryly. */}
      <main className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 pb-[max(16px,env(safe-area-inset-bottom))] sm:items-center sm:justify-center sm:px-8 sm:pb-[8vh]">
        {/* Přivítání jen na telefonu. Nesmršťuje se (shrink-0); když se rozbalí návrhy, ustoupí jim. */}
        <div className={`flex-1 shrink-0 flex-col items-center justify-center gap-3 py-6 text-center sm:hidden ${hintOpen ? "hidden" : "flex"} ${fade}`}>
          <h1 className="m-0 font-sign text-[30px] leading-[1.1] font-bold text-ink">Na co se chcete zeptat?</h1>
          <p className="m-0 max-w-[30ch] text-[16px] leading-snug text-muted">Grafy, tabulky a čísla z dopravních senzorů v Olomouci.</p>
        </div>
        <h1 className="sr-only max-sm:hidden">OSK – Zeptej se Olomouce</h1>
        {/* Na mobilu návrhy nad polem (order), na počítači pod ním. */}
        {/* Na počítači visí nápověda pod polem samostatně (absolute), takže se pole nehne ani po rozbalení návrhů. */}
        <div className={`relative flex w-full max-w-[760px] shrink-0 flex-col gap-4 sm:gap-6 ${hintOpen ? "max-sm:mt-auto" : ""}`}>
          <div className="order-2 sm:order-1">{composer}</div>
          <div className="order-1 sm:absolute sm:inset-x-0 sm:top-full sm:order-2 sm:mt-6">{hint}</div>
        </div>
      </main>
      <div className={`max-sm:hidden ${fade}`}>
        <Footer tone="light" />
      </div>
      {/* Modrá skvrna pro animaci. Je skrytá, dokud ji submit neumístí na tlačítko. */}
      <div ref={blob} aria-hidden="true" className="pointer-events-none fixed z-50 hidden bg-tabule" />
    </div>
  );
}
