"use client";

import { type Ref, useEffect, useRef, useState } from "react";
import type { PALETTE } from "@/lib/ai/palette";
import type { SeriesOk } from "@/lib/citiq/series";
import { type DataPick, type ValueAxis, axisFor, chartData, labelStep, percentShares, pickAt, pieSlices, textOn } from "@/lib/ui/chart";
import type { AxisSetting } from "@/lib/view";
import { formatNumber } from "@/lib/ui/format";
import QrCode from "../QrCode";

// Grafy jako SVG bez knihovny. Celý obrázek (pozadí, nadpis, graf, legenda, zdroj) je v jednom <svg>,
// takže ho jde stáhnout jako PNG a vložit do prezentace přesně tak, jak vypadá na stránce.

export type Colors = (typeof PALETTE)[keyof typeof PALETTE];
type Kind = "bar" | "line" | "pie";

export const FONT = "Barlow, system-ui, sans-serif";
export const TITLE_FONT = "'Barlow Semi Condensed', Barlow, system-ui, sans-serif";
const FOOTNOTE = "Zdroj: senzorová síť Olomouc (CITIQ) · Osk";

// Šířka rodiče, aby SVG mělo skutečné rozměry a písmo nebylo na mobilu zmenšené.
function useWidth(): [Ref<HTMLDivElement>, number] {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(800);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.max(300, Math.round(entry.contentRect.width))));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return [ref, width];
}

// Nadpis do nejvýš dvou řádků (SVG text se sám nezalamuje).
function wrap(text: string, maxChars: number): string[] {
  const words = text.split(" ");
  const lines: string[] = [""];
  for (const word of words) {
    const line = lines[lines.length - 1];
    if ((line + " " + word).trim().length <= maxChars || line === "") lines[lines.length - 1] = (line + " " + word).trim();
    else if (lines.length < 2) lines.push(word);
    else {
      lines[1] = `${lines[1].slice(0, maxChars - 1)}…`;
      break;
    }
  }
  return lines;
}

// Popisky na ose x: kolikátý ukázat (ať se nepřekrývají) a jak je zalomit. Dlouhý popisek („Billa (Hynaisova)“)
// se zalomí do dvou řádků, místo aby se zkrátil. Každý řádek je samostatný <text> (kvůli exportu do PNG).
function xLabels(categories: string[], plotW: number) {
  const n = Math.max(1, categories.length);
  const step = labelStep(n, Math.max(2, Math.floor(plotW / 64)));
  const maxChars = Math.max(6, Math.floor(((plotW / n) * step) / 7.5));
  const lines = categories.map((label, i) => (i % step === 0 ? wrap(label, maxChars) : []));
  return { step, lines, rows: Math.max(1, ...lines.map((l) => l.length)) };
}

type Legend = { label: string; color: string }[];

// Legenda do jednoho nebo víc řádků; vrací prvky a výšku, kterou zabrala.
function legendRows(items: Legend, width: number, colors: Colors, top: number) {
  const nodes: React.ReactNode[] = [];
  let x = 0;
  let row = 0;
  items.forEach((item, i) => {
    const w = 26 + item.label.length * 8.2;
    if (x > 0 && x + w > width) {
      x = 0;
      row += 1;
    }
    nodes.push(
      <g key={i} transform={`translate(${x}, ${top + row * 24})`}>
        <rect width="14" height="14" y="-11" rx="3" fill={item.color} stroke={colors.grid} />
        <text x="20" fontSize="14" fill={colors.text}>
          {item.label}
        </text>
      </g>,
    );
    x += w + 14;
  });
  return { nodes, height: items.length > 0 ? (row + 1) * 24 : 0 };
}

// Klikací prvek grafu (sloupec, bod, výseč): myší i klávesnicí (Tab + Enter/mezerník).
type Interaction = { onPick?: (pick: DataPick) => void; picked?: DataPick | null };

// Focus z klávesnice ukáže globální CSS (.chart-item:focus-visible v app/globals.css) obrysem v barvě textu grafu.
function interactive(pick: DataPick, label: string, { onPick, picked }: Interaction, color: string) {
  if (!onPick) return {};
  const isPicked = picked?.gate === pick.gate && picked?.bucket === pick.bucket;
  return {
    role: "button",
    tabIndex: 0,
    className: "chart-item",
    "aria-label": label,
    "aria-pressed": isPicked,
    style: { cursor: "pointer", color },
    onClick: () => onPick(pick),
    onKeyDown: (event: React.KeyboardEvent) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        onPick(pick);
      }
    },
  } as const;
}

const samePick = (a: DataPick | null | undefined, b: DataPick) => a?.gate === b.gate && a?.bucket === b.bucket;

type ChartProps = Interaction & {
  kind: Kind;
  result: SeriesOk;
  title: string;
  colors: Colors;
  svgRef?: Ref<SVGSVGElement>;
  height?: number;
  qrUrl?: string | null; // odkaz na uloženou odpověď: QR vpravo nahoře (je i ve staženém PNG)
  axisSetting?: AxisSetting; // osa z editoru (výchozí automaticky)
  slotColors?: (string | null)[]; // jen barvy, které si uživatel v editoru sám nastavil (null = výchozí z palety)
};

export default function Chart({
  kind,
  result,
  title,
  colors,
  svgRef,
  height,
  onPick,
  picked,
  qrUrl,
  axisSetting = { mode: "auto" },
  slotColors = [],
}: ChartProps) {
  const interaction = { onPick, picked };
  const [box, width] = useWidth();
  // Výška: zadaná, jinak na telefonu nižší (graf se vejde na obrazovku i s tlačítky pod ním).
  const HEIGHT = height ?? (width < 500 ? 360 : 460);
  const pad = width < 500 ? 16 : 28;
  // QR kód vpravo nahoře vedle nadpisu; nadpis se zúží, graf začne pod QR.
  const qrSize = qrUrl ? (width < 500 ? 64 : 84) : 0;
  const qrSpace = qrSize ? qrSize + 16 : 0;
  const titleLines = wrap(title, Math.floor((width - 2 * pad - qrSpace) / 13));
  const top = Math.max(pad + titleLines.length * 32 + 10, qrSize ? pad + qrSize + 22 : 0);
  const data = chartData(result);
  const values = data.series.flatMap((s) => s.values).filter((v): v is number => v !== null);
  const axis = axisFor(values, axisSetting);
  const footnote = kind !== "pie" && axis.zoomed ? `Osa začíná na ${formatNumber(axis.min)}, ne na nule · ${FOOTNOTE}` : FOOTNOTE;
  // Barvy: výchozí jako vždycky (sloupce „celkem za místo“ jednou barvou, jinak 1., 2., 3. barva palety),
  // vlastní barva z editoru jen tam, kde si ji uživatel nastavil. Řada i = místo i; u „celkem za místo“ je místo kategorie.
  const perCategory = result.data.buckets.length === 1;
  const paletteColor = (i: number) => colors.series[i % colors.series.length];
  const seriesColor = (series: number, category: number) =>
    perCategory ? (slotColors[category] ?? paletteColor(0)) : (slotColors[series] ?? paletteColor(series));

  // Legenda: u koláče výseče, jinak řady (jen když jich je víc než jedna).
  const slices = kind === "pie" ? pieSlices(result) : [];
  // Výseč = místo, jen u koláče jednoho místa po obdobích je výseč období. Výchozí barva podle pořadí výseče.
  const pieSlot = (pick: DataPick) => (result.data.series.length > 1 || result.data.buckets.length === 1 ? pick.gate : (pick.bucket ?? 0));
  const sliceColor = (i: number) => slotColors[pieSlot(slices[i].pick)] ?? paletteColor(i);
  const shares = percentShares(slices.map((s) => s.value));
  const legendItems: Legend =
    kind === "pie"
      ? slices.map((s, i) => ({ label: `${s.label}: ${formatNumber(s.value)} (${shares[i]} %)`, color: sliceColor(i) }))
      : data.series.length > 1
        ? data.series.map((s, i) => ({ label: s.name, color: seriesColor(i, 0) }))
        : [];
  const legend = legendRows(legendItems, width - 2 * pad, colors, 0);
  // Popis pro čtečky obrazovky: hodnoty grafu slovy (u dlouhých řad jen prvních 12).
  const summary =
    kind === "pie"
      ? legendItems.map((l) => l.label).join(", ")
      : data.series
          .map((s) => `${data.series.length > 1 ? `${s.name}: ` : ""}${data.categories.slice(0, 12).map((c, i) => `${c} ${s.values[i] === null ? "bez dat" : formatNumber(s.values[i] ?? 0)}`).join(", ")}`)
          .join("; ");
  const bottom = HEIGHT - pad - 22 - (legend.height > 0 ? legend.height + 12 : 0);

  // Místo pod grafem na popisky osy x: jeden, nebo dva řádky.
  const labelRows = kind === "pie" ? 0 : xLabels(data.categories, width - pad - (pad + 52)).rows;
  const plot = { left: pad + (kind === "pie" ? 0 : 52), right: width - pad, top, bottom: bottom - (kind === "pie" ? 0 : 14 + labelRows * 16) };
  const plotW = plot.right - plot.left;
  const plotH = plot.bottom - plot.top;

  return (
    <div ref={box} className="w-full">
      <svg
        ref={svgRef}
        xmlns="http://www.w3.org/2000/svg"
        width={width}
        height={HEIGHT}
        viewBox={`0 0 ${width} ${HEIGHT}`}
        role="img"
        aria-label={`${title}. ${summary}${kind !== "pie" && axis.zoomed ? `. Osa začíná na ${formatNumber(axis.min)}, ne na nule.` : ""}`}
        fontFamily={FONT}
        className="block h-auto w-full"
      >
        <rect width={width} height={HEIGHT} fill={colors.bg} />
        {titleLines.map((line, i) => (
          <text key={i} x={pad} y={pad + 24 + i * 32} fontSize="28" fontWeight="700" fontFamily={TITLE_FONT} fill={colors.text}>
            {line}
          </text>
        ))}

        {kind === "pie" ? (
          <Pie slices={slices} shares={shares} sliceColor={sliceColor} cx={plot.left + plotW / 2} cy={plot.top + plotH / 2} r={Math.max(40, Math.min(plotW, plotH) / 2 - 4)} colors={colors} interaction={interaction} />
        ) : (
          <Axes kind={kind} result={result} data={data} axis={axis} plot={plot} plotW={plotW} plotH={plotH} colors={colors} seriesColor={seriesColor} interaction={interaction} />
        )}

        <g transform={`translate(${pad}, ${bottom + 26})`}>{legend.nodes}</g>
        <text x={pad} y={HEIGHT - pad + 4} fontSize="12" fill={colors.muted}>
          {footnote}
        </text>
        {qrUrl && (
          <>
            <QrCode inline text={qrUrl} size={qrSize} x={width - pad - qrSize} y={pad} />
            <text x={width - pad - qrSize / 2} y={pad + qrSize + 15} fontSize="12" textAnchor="middle" fill={colors.muted}>
              Ověřit data
            </text>
          </>
        )}
      </svg>
    </div>
  );
}

type Plot = { left: number; right: number; top: number; bottom: number };

function Axes({
  kind,
  result,
  data,
  axis,
  plot,
  plotW,
  plotH,
  colors,
  seriesColor,
  interaction,
}: {
  kind: "bar" | "line";
  result: SeriesOk;
  interaction: Interaction;
  axis: ValueAxis;
  data: ReturnType<typeof chartData>;
  plot: Plot;
  plotW: number;
  plotH: number;
  colors: Colors;
  seriesColor: (series: number, category: number) => string;
}) {
  // Hodnota → výška. Osa může začínat nad nulou (axis.min), pak je to u ní vyznačené přerušením.
  const y = (value: number) => plot.bottom - ((value - axis.min) / (axis.max - axis.min)) * plotH;
  const n = data.categories.length;
  const labels = xLabels(data.categories, plotW);
  const slot = plotW / n;
  const x = (i: number) => (kind === "bar" ? plot.left + slot * (i + 0.5) : plot.left + (n === 1 ? plotW / 2 : (plotW * i) / (n - 1)));
  const showValues = kind === "bar" && n * data.series.length <= 16;

  return (
    <g>
      {axis.ticks.map((tick) => (
        <g key={tick}>
          <line
            x1={plot.left}
            x2={plot.right}
            y1={y(tick)}
            y2={y(tick)}
            stroke={tick === axis.min ? colors.text : colors.grid}
            strokeWidth={tick === axis.min ? 2 : 1}
          />
          <text x={plot.left - 8} y={y(tick) + 4} fontSize="13" textAnchor="end" fill={colors.muted}>
            {formatNumber(tick)}
          </text>
        </g>
      ))}

      {/* Přerušení osy: dvě šikmé čárky na začátku spodní čáry, když osa nezačíná nulou. */}
      {axis.zoomed && (
        <g aria-hidden="true">
          <rect x={plot.left - 2} y={plot.bottom - 7} width="14" height="14" fill={colors.bg} />
          <path d={`M${plot.left - 3},${plot.bottom + 7} l7,-14 M${plot.left + 4},${plot.bottom + 7} l7,-14`} stroke={colors.text} strokeWidth="2" />
        </g>
      )}

      {data.categories.map((label, i) =>
        labels.lines[i].map((line, row) => (
          <text key={`${i}-${row}`} x={x(i)} y={plot.bottom + 22 + row * 16} fontSize="14" textAnchor="middle" fill={colors.muted}>
            <title>{label}</title>
            {line}
          </text>
        )),
      )}

      {kind === "bar"
        ? data.series.map((s, si) => {
            const group = slot * 0.76;
            const barW = Math.min(64, group / data.series.length);
            const start = (i: number) => x(i) - (barW * data.series.length) / 2 + si * barW;
            return (
              <g key={si}>
                {s.values.map((value, i) =>
                  value === null ? (
                    <text key={i} x={start(i) + barW / 2} y={plot.bottom - 6} fontSize="14" textAnchor="middle" fill={colors.muted}>
                      <title>{`${data.categories[i]}, ${s.name}: data chybí`}</title>–
                    </text>
                  ) : (
                    <g key={i} {...interactive(pickAt(result, si, i), `${data.categories[i]}, ${s.name}: ${formatNumber(value)}. Ukázat odkud je.`, interaction, colors.text)}>
                      <rect
                        x={start(i) + 1}
                        y={y(value)}
                        width={Math.max(1, barW - 2)}
                        height={plot.bottom - y(value)}
                        rx="3"
                        fill={seriesColor(si, i)}
                        stroke={samePick(interaction.picked, pickAt(result, si, i)) ? colors.text : "none"}
                        strokeWidth="3"
                      >
                        <title>{`${data.categories[i]}, ${s.name}: ${formatNumber(value)}`}</title>
                      </rect>
                      {showValues && (
                        <text x={start(i) + barW / 2} y={y(value) - 7} fontSize="14" fontWeight="600" textAnchor="middle" fill={colors.text}>
                          {formatNumber(value)}
                        </text>
                      )}
                    </g>
                  ),
                )}
              </g>
            );
          })
        : data.series.map((s, si) => {
            // Chybějící hodnota (null) čáru přeruší, nespojujeme přes ni.
            const d = s.values.map((value, i) => (value === null ? "" : `${i > 0 && s.values[i - 1] !== null ? "L" : "M"}${x(i)},${y(value)}`)).join("");
            return (
              <g key={si}>
                <path d={d} fill="none" stroke={seriesColor(si, 0)} strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />
                {(n <= 40 || interaction.onPick) &&
                  s.values.map((value, i) =>
                    value === null ? null : (
                      <circle
                        key={i}
                        cx={x(i)}
                        cy={y(value)}
                        r={samePick(interaction.picked, pickAt(result, si, i)) ? 7 : 4}
                        fill={seriesColor(si, i)}
                        stroke={samePick(interaction.picked, pickAt(result, si, i)) ? colors.text : "none"}
                        strokeWidth="2"
                        {...interactive(pickAt(result, si, i), `${data.categories[i]}, ${s.name}: ${formatNumber(value)}. Ukázat odkud je.`, interaction, colors.text)}
                      >
                        <title>{`${data.categories[i]}, ${s.name}: ${formatNumber(value)}`}</title>
                      </circle>
                    ),
                  )}
              </g>
            );
          })}
    </g>
  );
}

function Pie({
  slices,
  shares,
  cx,
  cy,
  r,
  colors,
  interaction,
  sliceColor,
}: {
  interaction: Interaction;
  sliceColor: (i: number) => string;
  slices: { label: string; value: number; pick: DataPick }[];
  shares: number[];
  cx: number;
  cy: number;
  r: number;
  colors: Colors;
}) {
  const total = slices.reduce((sum, s) => sum + s.value, 0);
  // Úhel začátku každé výseče (od 12 hodin po směru hodinových ručiček), spočítaný předem.
  const starts = slices.map((_, i) => -Math.PI / 2 + (slices.slice(0, i).reduce((sum, s) => sum + s.value, 0) / total) * Math.PI * 2);
  const point = (a: number, radius: number) => `${cx + radius * Math.cos(a)},${cy + radius * Math.sin(a)}`;
  return (
    <g>
      {slices.map((slice, i) => {
        const sweep = (slice.value / total) * Math.PI * 2;
        const start = starts[i];
        const end = start + sweep;
        const mid = start + sweep / 2;
        const path =
          slices.length === 1
            ? `M${cx - r},${cy}a${r},${r} 0 1,0 ${2 * r},0a${r},${r} 0 1,0 ${-2 * r},0`
            : `M${cx},${cy}L${point(start, r)}A${r},${r} 0 ${sweep > Math.PI ? 1 : 0},1 ${point(end, r)}Z`;
        const [lx, ly] = point(mid, r * 0.62).split(",").map(Number);
        return (
          <g key={i} {...interactive(slice.pick, `${slice.label}: ${formatNumber(slice.value)} (${shares[i]} %). Ukázat odkud je.`, interaction, colors.text)}>
            <path
              d={path}
              fill={sliceColor(i)}
              stroke={samePick(interaction.picked, slice.pick) ? colors.text : colors.bg}
              strokeWidth={samePick(interaction.picked, slice.pick) ? 4 : 2}
            >
              <title>{`${slice.label}: ${formatNumber(slice.value)} (${shares[i]} %)`}</title>
            </path>
            {shares[i] >= 6 && (
              <text x={lx} y={ly + 6} fontSize="17" fontWeight="700" textAnchor="middle" fill={textOn(sliceColor(i))}>
                {shares[i]} %
              </text>
            )}
          </g>
        );
      })}
    </g>
  );
}
