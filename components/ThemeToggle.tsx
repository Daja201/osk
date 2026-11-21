"use client";

import { type Theme, setTheme, useTheme } from "@/lib/ui/theme";
import { ICON_BUTTON } from "./styles";

// Přepínač světlý / tmavý. Logika je v lib/ui/theme.ts (sdílí ji i grafy).

const ICON = { width: 22, height: 22, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2.2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };

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
  const theme = useTheme();
  const next: Theme = theme === "dark" ? "light" : "dark";
  const label = next === "dark" ? "Přepnout na tmavý režim" : "Přepnout na světlý režim";

  return (
    <button
      type="button"
      onClick={() => setTheme(next)}
      aria-label={label}
      title={label}
      className={ICON_BUTTON[tone]}
    >
      {next === "dark" ? <Moon /> : <Sun />}
    </button>
  );
}
