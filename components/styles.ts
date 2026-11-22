// Společné třídy pro tlačítka. Po najetí myší se tlačítko lehce zvětší, při stisku zmenší.
// Kdo má v systému „omezit pohyb“, zvětšení nevidí.
export const PRESS =
  "cursor-pointer transition-[transform,background-color,color] duration-150 ease-out hover:scale-105 active:scale-95 disabled:cursor-wait disabled:hover:scale-100 motion-reduce:transform-none";

// Povrch tlačítek v horní liště, společný pro tlačítka s textem i ikony. Lehce průhledný s rozmazáním pozadí:
// v konverzaci tlačítka plavou nad obsahem (průhledná lišta) a musí zůstat čitelná i nad bílým grafem.
// Na klidném pozadí vypadají jako dřív (na modré: bílá 15 % přes modrou).
const BAR_SURFACE = {
  light: "border border-line bg-surface/85 text-ink backdrop-blur-md hover:border-ink",
  blue: "bg-[color-mix(in_srgb,color-mix(in_srgb,white_15%,var(--color-tabule))_85%,transparent)] text-white backdrop-blur-md hover:bg-[color-mix(in_srgb,color-mix(in_srgb,white_25%,var(--color-tabule))_90%,transparent)]",
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
