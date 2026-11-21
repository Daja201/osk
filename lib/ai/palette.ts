// Barvy pozadí grafu, ze kterých může AI vybírat („s červeným pozadím“). Jen tahle paleta:
// ke každé barvě jsme předem vybrali čitelný text a barvy řad, aby graf šel vložit do prezentace.
// `series` = barvy sloupců / čar / výsečí v tomhle pořadí (první místo, druhé místo…).

export const PALETTE = {
  modra: { label: "modrá", bg: "#0B4F96", text: "#FFFFFF", muted: "#D6DEE7", grid: "#3A73B0", series: ["#FFFFFF", "#FFC21A", "#8EC5FF", "#FFB4A2", "#9BE7C4", "#D7B8F5"] },
  cervena: { label: "červená", bg: "#B3261E", text: "#FFFFFF", muted: "#F6D5D2", grid: "#C9544D", series: ["#FFFFFF", "#FFC21A", "#14243A", "#FFD7A8", "#A8D8FF", "#CFE8B8"] },
  zelena: { label: "zelená", bg: "#1E7B45", text: "#FFFFFF", muted: "#D2EBDC", grid: "#4A9669", series: ["#FFFFFF", "#FFC21A", "#14243A", "#A8D8FF", "#FFB4A2", "#E9D5FF"] },
  oranzova: { label: "oranžová", bg: "#C2410C", text: "#FFFFFF", muted: "#FBDCCB", grid: "#D2693E", series: ["#FFFFFF", "#14243A", "#FFE08A", "#A8D8FF", "#CFE8B8", "#E9D5FF"] },
  fialova: { label: "fialová", bg: "#5B2A86", text: "#FFFFFF", muted: "#E3D4F0", grid: "#7C55A0", series: ["#FFFFFF", "#FFC21A", "#8EC5FF", "#9BE7C4", "#FFB4A2", "#FFE08A"] },
  seda: { label: "šedá", bg: "#3D4B5C", text: "#FFFFFF", muted: "#D6DEE7", grid: "#5E6B7B", series: ["#FFFFFF", "#FFC21A", "#8EC5FF", "#9BE7C4", "#FFB4A2", "#D7B8F5"] },
  tmava: { label: "tmavá", bg: "#14243A", text: "#FFFFFF", muted: "#C9D3DE", grid: "#33445A", series: ["#8EC5FF", "#FFC21A", "#FFFFFF", "#9BE7C4", "#FFB4A2", "#D7B8F5"] },
  bila: { label: "bílá", bg: "#FFFFFF", text: "#14243A", muted: "#4B5A6B", grid: "#DCE3EA", series: ["#0B4F96", "#E8A400", "#B3261E", "#1E7B45", "#5B2A86", "#7D95B0"] },
} as const;

export type PaletteName = keyof typeof PALETTE;
export const PALETTE_NAMES = Object.keys(PALETTE) as [PaletteName, ...PaletteName[]];
