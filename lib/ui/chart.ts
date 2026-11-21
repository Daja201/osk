// Příprava dat pro grafy. Jen přeskupení čísel, která spočítal lib/citiq/series.ts. Testy: tests/chart.test.ts.
import { aggregateValue, type SeriesDisplayOk } from "../citiq/display";
import type { SeriesOk } from "../citiq/series";
import { PALETTE, type PaletteName } from "../ai/palette";
import { type AxisSetting, customAxisError } from "../view";
import { formatNumber, niceAxis } from "./format";
import { placeName } from "../citiq/gates";
export { placeName };


// Kategorie na ose x a řady. S jediným bucketem (celkem za období) jsou kategorie místa
// a řada jen jedna; jinak jsou kategorie období (hodiny / dny) a řada = místo.
export type ChartData = { categories: string[]; series: { name: string; unit?: string; values: (number | null)[] }[] };

export function chartData(result: SeriesDisplayOk): ChartData {
  const { buckets, series } = result.data;
  if (buckets.length === 1 && result.meta.tool !== "combined_series") {
    return {
      categories: series.map((s) => placeName(s.gate)),
      series: [{ name: buckets[0].label, unit: series[0]?.unit, values: series.map((s) => s.values[0]) }],
    };
  }
  return {
    categories: buckets.map((b) => b.label),
    series: series.map((s) => ({ name: placeName(s.gate), unit: s.unit, values: s.values })),
  };
}

// Index nejvyšší a nejnižší hodnoty. Chybějící hodnoty (null) se nepočítají; při shodě vyhrává první.
// Potřebujeme aspoň dvě známé hodnoty, jinak null.
export function extremes(values: (number | null)[]): { max: number; min: number } | null {
  const known = values.flatMap((value, index) => (value === null ? [] : [{ value, index }]));
  if (known.length < 2) return null;
  const max = known.reduce((best, item) => (item.value > best.value ? item : best));
  const min = known.reduce((best, item) => (item.value < best.value ? item : best));
  return { max: max.index, min: min.index };
}

// „14:00“ → „14:00–15:00“, „st 18. 11. 22:00“ → „st 18. 11. 22:00–23:00“
const hourRange = (label: string) => label.replace(/(\d{1,2}):00$/, (_, hour: string) => `${hour}:00–${Number(hour) + 1}:00`);

// Závěr pod graf po hodinách s jedním místem, spočítaný kódem (ne AI):
// „Nejvíc vozidel: 14:00–15:00 (2 290). Nejméně: 3:00–4:00 (60).“ U jiných grafů null.
export function hourSummary(result: SeriesOk): string | null {
  const { granularity, buckets, series } = result.data;
  if (granularity !== "hour" || series.length !== 1) return null;
  const { values } = series[0];
  const found = extremes(values);
  if (!found) return null;
  const part = (index: number) => `${hourRange(buckets[index].label)} (${formatNumber(values[index] ?? 0)})`;
  return `Nejvíc vozidel: ${part(found.max)}. Nejméně: ${part(found.min)}.`;
}

// Bod grafu v datech: místo (index řady ve výsledku) a bucket (index období), nebo celé období (null).
export type DataPick = { gate: number; bucket: number | null };

// Kliknutí na graf → bod v datech. S jediným bucketem jsou kategorie místa, jinak období a řady místa.
export function pickAt(result: SeriesDisplayOk, seriesIndex: number, categoryIndex: number): DataPick {
  return result.data.buckets.length === 1 && result.meta.tool !== "combined_series"
    ? { gate: categoryIndex, bucket: 0 }
    : { gate: seriesIndex, bucket: categoryIndex };
}

// Výseče koláče: s víc místy = součet za místo, s jedním místem = jeho buckety. Prázdné (null, 0) vynecháme.
// Každá výseč si pamatuje, kterému bodu v datech odpovídá (pick).
export function pieSlices(result: SeriesDisplayOk): { label: string; value: number; pick: DataPick }[] {
  const { buckets, series } = result.data;
  const raw =
    series.length > 1 || buckets.length === 1
      ? series.map((s, gate) => ({
          label: placeName(s.gate),
          value: buckets.length === 1 ? s.values[0] : aggregateValue(s),
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

// Barvy grafu: vždy podle zvoleného pozadí (bez volby bílé), nikdy podle světlého / tmavého režimu stránky.
// Graf je obrázek do prezentace a má vypadat pořád stejně.
export function chartColors(background: PaletteName | null) {
  return PALETTE[background ?? "bila"];
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

// --- osa hodnot ---------------------------------------------------------------

export type ValueAxis = { min: number; max: number; ticks: number[]; zoomed: boolean };

// Kolik rozpětí (max − min) necháme pod nejmenší hodnotou, když osu přibližujeme.
// 1,5 = nejmenší sloupec zabere zhruba 40–60 % výšky: rozdíl je vidět hned, ale přiblížení je mírné.
const ZOOM_PADDING = 1.5;

function niceStep(rough: number): number {
  const power = 10 ** Math.floor(Math.log10(rough));
  return [1, 2, 2.5, 5, 10].map((m) => m * power).find((step) => step >= rough) ?? 10 * power;
}

// Osa grafu. Normálně od nuly. Když jsou hodnoty blízko sebe (21 500 a 23 000), začne na hezkém čísle
// pod nimi (19 000), aby byl rozdíl vidět. Graf to pak musí označit (zoomed: true): přerušení osy a poznámka.
export function valueAxis(values: number[]): ValueAxis {
  const max = Math.max(0, ...values);
  const min = values.length > 0 ? Math.min(...values) : 0;
  const fromZero = (): ValueAxis => {
    const axis = niceAxis(max);
    return { min: 0, max: axis.max, ticks: [0, ...axis.ticks], zoomed: false };
  };
  const span = max - min;
  const guess = min - span * ZOOM_PADDING;
  if (values.length < 2 || min <= 0 || span === 0 || guess <= 0) return fromZero();
  const step = niceStep((max - guess) / 4);
  const lo = Math.floor(guess / step) * step;
  if (lo <= 0) return fromZero();
  let hi = Math.ceil(max / step) * step;
  if (hi < max + step * 0.25) hi += step; // nad nejvyšším sloupcem místo na popisek
  const ticks: number[] = [];
  for (let tick = lo; tick < hi; tick += step) ticks.push(tick);
  return { min: lo, max: hi, ticks, zoomed: true };
}

// Osa podle nastavení z editoru: automaticky (valueAxis), od nuly, nebo vlastní rozsah.
// Vlastní rozsah musí obsáhnout všechny hodnoty (kontroluje customAxisError v lib/view.ts), jinak se použije automatický.
export function axisFor(values: number[], setting: AxisSetting): ValueAxis {
  if (setting.mode === "zero") {
    const axis = niceAxis(Math.max(0, ...values));
    return { min: 0, max: axis.max, ticks: [0, ...axis.ticks], zoomed: false };
  }
  if (setting.mode === "custom" && customAxisError(values, setting.min, setting.max) === null) {
    const step = niceStep((setting.max - setting.min) / 5);
    const ticks = [setting.min];
    for (let tick = Math.ceil(setting.min / step) * step; tick < setting.max; tick += step) {
      if (tick > setting.min + step * 0.3) ticks.push(tick); // popisek těsně nad začátkem by se překrýval
    }
    return { min: setting.min, max: setting.max, ticks, zoomed: setting.min > 0 };
  }
  return valueAxis(values);
}
