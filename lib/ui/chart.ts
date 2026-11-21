// Příprava dat pro grafy. Jen přeskupení čísel, která spočítal lib/citiq/series.ts. Testy: tests/chart.test.ts.
import type { SeriesOk } from "../citiq/series";
import { PALETTE, type PaletteName } from "../ai/palette";

export const placeName = (gate: string) => gate.replace(/\s*\(obě brány\)$/, "");

// Kategorie na ose x a řady. S jediným bucketem (celkem za období) jsou kategorie místa
// a řada jen jedna; jinak jsou kategorie období (hodiny / dny) a řada = místo.
export type ChartData = { categories: string[]; series: { name: string; values: (number | null)[] }[] };

export function chartData(result: SeriesOk): ChartData {
  const { buckets, series } = result.data;
  if (buckets.length === 1) {
    return {
      categories: series.map((s) => placeName(s.gate)),
      series: [{ name: buckets[0].label, values: series.map((s) => s.values[0]) }],
    };
  }
  return {
    categories: buckets.map((b) => b.label),
    series: series.map((s) => ({ name: placeName(s.gate), values: s.values })),
  };
}

// Bod grafu v datech: místo (index řady ve výsledku) a bucket (index období), nebo celé období (null).
export type DataPick = { gate: number; bucket: number | null };

// Kliknutí na graf → bod v datech. S jediným bucketem jsou kategorie místa, jinak období a řady místa.
export function pickAt(result: SeriesOk, seriesIndex: number, categoryIndex: number): DataPick {
  return result.data.buckets.length === 1 ? { gate: categoryIndex, bucket: 0 } : { gate: seriesIndex, bucket: categoryIndex };
}

// Výseče koláče: s víc místy = součet za místo, s jedním místem = jeho buckety. Prázdné (null, 0) vynecháme.
// Každá výseč si pamatuje, kterému bodu v datech odpovídá (pick).
export function pieSlices(result: SeriesOk): { label: string; value: number; pick: DataPick }[] {
  const { buckets, series } = result.data;
  const raw =
    series.length > 1 || buckets.length === 1
      ? series.map((s, gate) => ({
          label: placeName(s.gate),
          value: buckets.length === 1 ? s.values[0] : s.total,
          pick: { gate, bucket: buckets.length === 1 ? 0 : null },
        }))
      : buckets.map((b, bucket) => ({ label: b.label, value: series[0].values[bucket], pick: { gate: 0, bucket } }));
  return raw.filter((slice): slice is { label: string; value: number; pick: DataPick } => slice.value !== null && slice.value > 0);
}

// Podíly v celých procentech, které dají dohromady přesně 100 (metoda největšího zbytku).
export function percentShares(values: number[]): number[] {
  const sum = values.reduce((a, b) => a + b, 0);
  if (sum === 0) return values.map(() => 0);
  const exact = values.map((v) => (v / sum) * 100);
  const floors = exact.map(Math.floor);
  let rest = 100 - floors.reduce((a, b) => a + b, 0);
  const order = exact.map((v, i) => ({ i, frac: v - Math.floor(v) })).sort((a, b) => b.frac - a.frac);
  for (const { i } of order) {
    if (rest <= 0) break;
    floors[i] += 1;
    rest -= 1;
  }
  return floors;
}

// Kolikátý popisek na ose x ukázat, aby jich nebylo víc než `max` (ostatní by se překrývaly).
export function labelStep(count: number, max = 12): number {
  return Math.max(1, Math.ceil(count / max));
}

// Barvy grafu: zvolená paleta, jinak bílá (světlý režim) nebo tmavá (tmavý režim).
export function chartColors(background: PaletteName | null, theme: "light" | "dark") {
  return PALETTE[background ?? (theme === "dark" ? "tmava" : "bila")];
}

// Čitelná barva textu na dané barvě (#RRGGBB): tmavá na světlé, bílá na tmavé (relativní jas podle WCAG).
export function textOn(hex: string): "#14243A" | "#FFFFFF" {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luminance > 0.4 ? "#14243A" : "#FFFFFF";
}
