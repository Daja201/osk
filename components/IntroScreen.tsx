"use client";

import { useRef, useState } from "react";
import { useAsk } from "@/app/ask-context";
import Footer from "./Footer";
import { PRESS } from "./styles";
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

// Úvod: jen pole pro otázku a tlačítko. Po odeslání se tlačítko rozleje přes obrazovku
// a zavolá se onCovered (rodič přepne na modrou obrazovku s odpovědí). Odpověď se mezitím počítá.
export default function IntroScreen({ onCovered }: { onCovered: () => void }) {
  const { ask } = useAsk();
  const [value, setValue] = useState("");
  const [leaving, setLeaving] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const blob = useRef<HTMLDivElement>(null);

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const question = value.trim();
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
      <main className="flex min-h-0 flex-1 items-center justify-center px-4 pb-[8vh] sm:px-8">
        <form role="search" onSubmit={submit} className="flex w-full max-w-[760px] flex-col gap-3 sm:flex-row">
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
            autoFocus
            disabled={leaving}
            onChange={(event) => setValue(event.target.value)}
            placeholder="Kolik aut včera projelo ulicí 17. listopadu?"
            className={`h-16 w-full min-w-0 rounded-2xl border-2 border-line bg-surface px-5 font-sans text-[19px] font-medium text-ink transition-colors hover:border-muted focus:border-ink sm:flex-1 sm:text-[21px] ${fade}`}
          />
          <button
            ref={button}
            type="submit"
            disabled={leaving}
            className={`${PRESS} h-16 shrink-0 rounded-2xl bg-tabule px-8 font-sans text-[21px] font-semibold whitespace-nowrap text-white hover:bg-[#0A4482] disabled:hover:scale-100`}
          >
            <span className={leaving ? "invisible" : undefined}>Zeptat se</span>
          </button>
        </form>
      </main>
      <div className={fade}>
        <Footer tone="light" />
      </div>
      {/* Modrá skvrna pro animaci. Je skrytá, dokud ji submit neumístí na tlačítko. */}
      <div ref={blob} aria-hidden="true" className="pointer-events-none fixed z-50 hidden bg-tabule" />
    </div>
  );
}
