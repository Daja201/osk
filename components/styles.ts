// Společné třídy pro tlačítka. Po najetí myší se tlačítko lehce zvětší, při stisku zmenší.
// Kdo má v systému „omezit pohyb“, zvětšení nevidí.
export const PRESS =
  "cursor-pointer transition-[transform,background-color,color] duration-150 ease-out hover:scale-105 active:scale-95 disabled:cursor-wait disabled:hover:scale-100 motion-reduce:transform-none";

// Povrch tlačítek v horní liště (na bílé a na modré obrazovce), společný pro tlačítka s textem i ikony.
const BAR_SURFACE = {
  light: "border border-line bg-surface text-ink hover:border-ink",
  blue: "bg-white/15 text-white hover:bg-white/25",
} as const;

// Kulaté tlačítko s textem v horní liště: na bílé a na modré obrazovce. Výška 44 px = doporučená dotyková plocha na mobilu.
export const PILL = {
  light: `${PRESS} inline-flex h-11 items-center rounded-full px-4 text-[16px] font-semibold ${BAR_SURFACE.light}`,
  blue: `${PRESS} inline-flex h-11 items-center rounded-full px-4 text-[16px] font-semibold ${BAR_SURFACE.blue}`,
} as const;

// Čtvercová ikona v horní liště (přepínač vzhledu, nápověda „?“): stejný povrch jako PILL, ať jsou všechny ve stejném stylu.
export const ICON_BUTTON = {
  light: `${PRESS} flex size-11 shrink-0 items-center justify-center rounded-xl ${BAR_SURFACE.light}`,
  blue: `${PRESS} flex size-11 shrink-0 items-center justify-center rounded-xl ${BAR_SURFACE.blue}`,
} as const;
