// Vzhled grafu, který si uživatel upraví v editoru (typ, nadpis, barvy, osa, QR).
// Ukládá se k odpovědi (AskAnswer.view), čísla se tím nemění. Sdílí ho stránka i API. Testy: tests/view.test.ts.
import { z } from "zod";
import { PALETTE, PALETTE_NAMES } from "./ai/palette";
import type { AskAnswer } from "./ai/types";
import type { SeriesDisplayOk } from "./citiq/display";

export const VIEW_FORMATS = ["bar", "line", "pie", "table"] as const;
export type ViewFormat = (typeof VIEW_FORMATS)[number];
const MAX_PIE_SLICES = 6;

const HEX = /^#[0-9A-Fa-f]{6}$/;

export const AxisSettingSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("auto") }),
  z.object({ mode: z.literal("zero") }),
  z.object({ mode: z.literal("custom"), min: z.number().finite().min(0), max: z.number().finite().positive() }),
]);
export type AxisSetting = z.infer<typeof AxisSettingSchema>;

export const ChartViewSchema = z
  .object({
    format: z.enum(VIEW_FORMATS),
    title: z.string().trim().max(120),
    background: z.enum(PALETTE_NAMES).nullable(),
    colors: z.array(z.string().regex(HEX).nullable()).max(50), // barva každé řady; null = z palety
    axis: AxisSettingSchema,
    qr: z.boolean(),
  })
  .strict();
export type ChartView = z.infer<typeof ChartViewSchema>;

// Barvy do vzorníku: řady všech palet + bílá a tmavá.
export const SWATCHES = ["#0B4F96", "#E8A400", "#B3261E", "#1E7B45", "#5B2A86", "#7D95B0", "#8EC5FF", "#FFC21A", "#FFB4A2", "#9BE7C4", "#FFFFFF", "#14243A"];

// Výchozí vzhled z odpovědi: co vybrala AI. U věty a zdroje dat je výchozí sloupcový graf.
export function defaultView(answer: AskAnswer): ChartView {
  const format: ViewFormat = answer.format === "bar" || answer.format === "line" || answer.format === "pie" || answer.format === "table" ? answer.format : "bar";
  return { format, title: answer.title ?? "", background: answer.background, colors: [], axis: { mode: "auto" }, qr: true };
}

// Navazující otázka v konverzaci („červený“, „s nadpisem…“) staví na předchozí odpovědi: převezme její vzhled
// z editoru (barvy řad, osu, QR, typ, nadpis, pozadí). Co si uživatel řekl teď (spec od AI), má přednost.
// Barvy řad a osa se převezmou jen u stejných dat (stejná místa, čas, rozlišení), jinak by nesedily.
// null = nová odpověď není graf ani tabulka, nebo předchozí neměla data.
export function carryView(previous: ChartView, before: AskAnswer, next: AskAnswer): ChartView | null {
  const format = next.format;
  if (next.kind !== "answer" || !next.result?.ok || !before.result?.ok) return null;
  if (format !== "bar" && format !== "line" && format !== "pie" && format !== "table") return null;
  const sameData = JSON.stringify(before.result.meta.params) === JSON.stringify(next.result.meta.params);
  return {
    // Typ změnila otázka („jako čárový“), jinak zůstane typ z editoru.
    format: format !== before.format ? format : previous.format,
    title: next.spec?.title ?? (sameData ? previous.title : (next.title ?? "")),
    background: next.spec?.background ?? previous.background,
    colors: sameData ? previous.colors : [],
    axis: sameData ? previous.axis : { mode: "auto" },
    qr: previous.qr,
  };
}

// Které typy grafu se k datům hodí. Nevhodné jsou v editoru vypnuté i s důvodem.
export function formatOptions(result: SeriesDisplayOk): { format: ViewFormat; label: string; disabled: string | null }[] {
  const { buckets, series } = result.data;
  const metricCount = new Set(series.flatMap((item) => (item.metric ? [item.metric] : []))).size;
  const mixedUnits = result.meta.tool === "weather_series" && metricCount > 1;
  const slices = series.length > 1 || buckets.length === 1 ? series.length : buckets.length;
  return [
    { format: "bar", label: "Sloupcový", disabled: mixedUnits ? "Veličiny mají různé jednotky; zobrazte je v tabulce." : null },
    {
      format: "line",
      label: "Čárový",
      disabled: mixedUnits ? "Veličiny mají různé jednotky; zobrazte je v tabulce." : buckets.length < 2 ? "Čárový graf potřebuje průběh v čase (aspoň 2 období)." : null,
    },
    {
      format: "pie",
      label: "Koláčový",
      disabled: mixedUnits
        ? "Veličiny mají různé jednotky; zobrazte je v tabulce."
        : slices < 2
          ? "Koláč s jedinou položkou nic neukáže."
          : slices > MAX_PIE_SLICES
            ? `Na koláč je položek moc (${slices}, nejvýš ${MAX_PIE_SLICES}).`
            : null,
    },
    { format: "table", label: "Tabulka", disabled: null },
  ];
}

// Položky, kterým jde nastavit barva: místa; u koláče jednoho místa jeho období (výseče).
export function colorSlots(result: SeriesDisplayOk, format: ViewFormat): string[] {
  const { buckets, series } = result.data;
  const place = (gate: string) => gate.replace(/\s*\(obě brány\)$/, "");
  if (format === "pie" && series.length === 1 && buckets.length > 1) return buckets.map((b) => b.label);
  return series.map((s) => place(s.gate));
}

// Sloupcový graf „celkem za místo“ má ve výchozím stavu všechny sloupce jednou barvou (jako vždycky).
export function uniformColors(result: SeriesDisplayOk, format: ViewFormat): boolean {
  return format === "bar" && result.data.buckets.length === 1;
}

// Barva položky, jak ji graf opravdu nakreslí: vlastní z editoru, jinak výchozí z palety pozadí
// (stejně jako bez editoru: jednobarevné sloupce, jinak 1., 2., 3. barva palety).
export function slotColor(view: Pick<ChartView, "colors" | "background">, slot: number, uniform = false): string {
  const palette = PALETTE[view.background ?? "bila"];
  return view.colors[slot] ?? palette.series[uniform ? 0 : slot % palette.series.length];
}

// Kontrola vlastní osy: musí obsáhnout všechny hodnoty, jinak by graf některé sloupce uřízl (to by lhalo).
export function customAxisError(values: number[], min: number, max: number): string | null {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return "Zadejte obě čísla.";
  if (min < 0) return "Osa nemůže začínat pod nulou (počty aut nejsou záporné).";
  if (min >= max) return "Začátek osy musí být menší než konec.";
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  if (values.length > 0 && min > lo) return `Začátek osy musí být nejvýš ${lo.toLocaleString("cs-CZ")} (nejmenší hodnota), jinak by se sloupce uřízly.`;
  if (values.length > 0 && max < hi) return `Konec osy musí být aspoň ${hi.toLocaleString("cs-CZ")} (největší hodnota).`;
  return null;
}
