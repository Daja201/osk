// Společné třídy pro tlačítka. Po najetí myší se tlačítko lehce zvětší, při stisku zmenší.
// Kdo má v systému „omezit pohyb“, zvětšení nevidí.
export const PRESS =
  "cursor-pointer transition-[transform,background-color,color] duration-150 ease-out hover:scale-105 active:scale-95 disabled:cursor-wait disabled:hover:scale-100 motion-reduce:transform-none";

// Kulaté tlačítko v horní liště: na bílé a na modré obrazovce. Výška 44 px = doporučená dotyková plocha na mobilu.
export const PILL = {
  light: `${PRESS} inline-flex h-11 items-center rounded-full border border-line bg-surface px-4 text-[16px] font-semibold text-ink hover:border-ink`,
  blue: `${PRESS} inline-flex h-11 items-center rounded-full bg-white/15 px-4 text-[16px] font-semibold text-white hover:bg-white/25`,
} as const;
