"use client";

import { useSyncExternalStore } from "react";
import { PRESS } from "./styles";

// Přepínač světlý / tmavý. Stránka se vždycky načte podle systému (CSS: color-scheme: light dark).
// Kliknutí nastaví <html data-theme="light|dark">. Volba se nikam neukládá, po obnovení platí zase systém.

type Theme = "light" | "dark";

const systemDark = () => window.matchMedia("(prefers-color-scheme: dark)");

// Co je teď vidět: ruční volba, jinak systém.
function readTheme(): Theme {
  const chosen = document.documentElement.dataset.theme;
  if (chosen === "light" || chosen === "dark") return chosen;
  return systemDark().matches ? "dark" : "light";
}

const listeners = new Set<() => void>();

// Ikona se přepne i při změně vzhledu v systému (dokud uživatel nevybral ručně).
function subscribe(listener: () => void) {
  listeners.add(listener);
  const media = systemDark();
  media.addEventListener("change", listener);
  return () => {
    listeners.delete(listener);
    media.removeEventListener("change", listener);
  };
}

function setTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  listeners.forEach((listener) => listener());
}

const ICON = { width: 20, height: 20, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2.2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };

function Sun() {
  return (
    <svg aria-hidden="true" {...ICON}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2.5v2M12 19.5v2M4.6 4.6l1.4 1.4M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4L6 18M18 6l1.4-1.4" />
    </svg>
  );
}

function Moon() {
  return (
    <svg aria-hidden="true" {...ICON}>
      <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" />
    </svg>
  );
}

// Ikona ukazuje, na co se kliknutím přepne: ve světlém měsíc, v tmavém slunce.
export default function ThemeToggle({ tone }: { tone: "light" | "blue" }) {
  // Na serveru systém neznáme, proto "light"; v prohlížeči se hned přečte skutečný stav.
  const theme = useSyncExternalStore(subscribe, readTheme, () => "light" as const);
  const next: Theme = theme === "dark" ? "light" : "dark";
  const label = next === "dark" ? "Přepnout na tmavý režim" : "Přepnout na světlý režim";

  return (
    <button
      type="button"
      onClick={() => setTheme(next)}
      aria-label={label}
      title={label}
      className={`${PRESS} flex size-10 shrink-0 items-center justify-center rounded-[10px] ${
        tone === "blue" ? "bg-white/15 text-white hover:bg-white/25" : "border border-line bg-surface text-ink hover:border-ink"
      }`}
    >
      {next === "dark" ? <Moon /> : <Sun />}
    </button>
  );
}
