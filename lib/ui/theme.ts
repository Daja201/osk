// Světlý / tmavý režim. Stránka se vždy načte podle systému; tlačítko pak nastaví <html data-theme>.
// Volba se neukládá. Sdílí to přepínač (components/ThemeToggle.tsx) i grafy (barvy výchozí palety).
import { useSyncExternalStore } from "react";

export type Theme = "light" | "dark";

const systemDark = () => window.matchMedia("(prefers-color-scheme: dark)");

function readTheme(): Theme {
  const chosen = document.documentElement.dataset.theme;
  if (chosen === "light" || chosen === "dark") return chosen;
  return systemDark().matches ? "dark" : "light";
}

const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  const media = systemDark();
  media.addEventListener("change", listener);
  return () => {
    listeners.delete(listener);
    media.removeEventListener("change", listener);
  };
}

// Přepnutí je okamžité: na chvíli vypneme všechny přechody (data-theme-switching, viz app/globals.css),
// jinak by se barvy tlačítek a ploch „dobarvovaly“ několik setin. Po vykreslení přechody zase zapneme.
export function setTheme(theme: Theme) {
  const root = document.documentElement;
  root.dataset.themeSwitching = "";
  root.dataset.theme = theme;
  listeners.forEach((listener) => listener());
  requestAnimationFrame(() => requestAnimationFrame(() => delete root.dataset.themeSwitching));
}

// Aktuální režim. Na serveru ho neznáme, proto "light"; v prohlížeči se hned přečte skutečný.
export function useTheme(): Theme {
  return useSyncExternalStore(subscribe, readTheme, () => "light" as const);
}
