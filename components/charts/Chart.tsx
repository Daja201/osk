"use client";

import { type Ref, useEffect, useRef, useState } from "react";
import type { PALETTE } from "@/lib/ai/palette";
import type { SeriesDisplayOk } from "@/lib/citiq/display";
import { type DataPick, type ValueAxis, axisFor, chartData, extremes, labelStep, percentShares, pickAt, pieSlices } from "@/lib/ui/chart";
import type { AxisSetting } from "@/lib/view";
import { formatNumber } from "@/lib/ui/format";
import QrCode from "../QrCode";

// Grafy jako SVG bez knihovny. Celý obrázek (pozadí, nadpis, graf, legenda, zdroj) je v jednom <svg>,
// takže ho jde stáhnout jako PNG a vložit do prezentace přesně tak, jak vypadá na stránce.

export type Colors = (typeof PALETTE)[keyof typeof PALETTE];
type Kind = "bar" | "line" | "pie";

export const FONT = "Barlow, system-ui, sans-serif";
export const TITLE_FONT = "'Barlow Semi Condensed', Barlow, system-ui, sans-serif";
const FOOTNOTE = "Zdroj: senzorová síť Olomouc (CITIQ) · OSK";

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

// Text do nejvýš `maxLines` řádků (SVG text se sám nezalamuje). Nadpis „Počet vozidel · 17. listopadu · 20. 11. 2026“
// se láme jen mezi částmi oddělenými „ · “, ne uvnitř nich; uvnitř části jen tehdy, když se celá na řádek nevejde.
// Jinak se dělí na mezerách i pevných mezerách.
function wrap(text: string, maxChars: number, maxLines = 2): string[] {
  const parts = text.split(" · ");
  const words = parts.flatMap((part, i) => {
    const unit = i < parts.length - 1 ? `${part} ·` : part;
    return unit.length <= maxChars ? [unit] : unit.split(/[ \u00A0]/);
  });
  const lines: string[] = [""];
  for (const word of words) {
    const line = lines[lines.length - 1];
    if ((line + " " + word).trim().length <= maxChars || line === "") lines[lines.length - 1] = (line + " " + word).trim();
    else if (lines.length < maxLines) lines.push(word);
    else {
      lines[lines.length - 1] = `${lines[lines.length - 1].slice(0, maxChars - 1)}…`;
      break;
    }
  }
  return lines;
}

// Kratší popisek dne na úzkém grafu: „so 14. 11.“ → „so 14.“ (měsíc je v nadpisu).
const compactDay = (label: string) => label.replace(/^(\S+[ \u00A0]\d{1,2}\.)[ \u00A0]\d{1,2}\.$/, "$1");

// Popisky na ose x: kolikátý ukázat (ať se nepřekrývají) a jak je zalomit. Dlouhý popisek („Billa (Hynaisova)“)
// se zalomí do dvou řádků, místo aby se zkrátil. Každý řádek je samostatný <text> (kvůli exportu do PNG).
function xLabels(kind: Kind, data: ReturnType<typeof chartData>, plotW: number) {
  const categories = data.categories;
  const n = Math.max(1, categories.length);
  // Časový (čárový) graf s jednou řadou a málo body: pod každým popiskem i jeho hodnota (den → číslo pod ním).
  // Vejde se, když je mezi body místo na nejdelší číslo; popisek se pak klidně rozdělí na víc řádků („so“ / „14.“).
  const values = data.series[0]?.values ?? [];
  const longest = Math.max(0, ...values.map((v) => (v === null ? 1 : formatNumber(v).length)));
  const candidate = kind === "line" && data.series.length === 1 && n >= 2 && n <= 14;
  // Okraj po stranách čárového grafu, aby i první a poslední číslo šlo vycentrovat pod bod.
  const inset = candidate ? Math.ceil((longest * 7.5) / 2) + 2 : 0;
  const spacing = kind === "line" ? (plotW - 2 * inset) / Math.max(1, n - 1) : plotW / n;
  // Písmo čísel: 14 px, když se nevejde, 12 px. Když se nevejdou ani tak (pěticiferná čísla na telefonu),
  // napíšou se střídavě do dvou řádků (lichý den výš, sudý níž) – každé pak má dvojnásobek místa.
  const fitsAt = (room: number) => (room >= longest * 7.5 + 6 ? 14 : room >= longest * 6.4 + 4 ? 12 : 0);
  const stagger = fitsAt(spacing) === 0 && fitsAt(spacing * 2) > 0;
  const valueFont = stagger ? fitsAt(spacing * 2) : fitsAt(spacing);
  if (candidate && valueFont > 0) {
    const fits = (text: string) => text.length * 7.5 <= spacing - 4;
    const lines = categories.map((label) => {
      if (fits(label)) return [label];
      const short = compactDay(label);
      return fits(short) ? [short] : short.split(/[ \u00A0]/);
    });
    const valueTexts = values.map((v) => (v === null ? "–" : formatNumber(v)));
    return { step: 1, lines, values: valueTexts, valueFont, inset, stagger, rows: Math.max(1, ...lines.map((l) => l.length)) + (stagger ? 2 : 1) };
  }
  const step = labelStep(n, Math.max(2, Math.floor(plotW / 64)));
  const maxChars = Math.max(6, Math.floor(((plotW / n) * step) / 7.5));
  const lines = categories.map((label, i) => {
    if (i % step !== 0) return [];
    const fitted = label.length > maxChars ? compactDay(label) : label;
    // Málo sloupců (např. porovnání 2 období) = dost místa pod nimi: až 3 řádky, ať se vejde celé období.
    return wrap(fitted, maxChars, n <= 4 ? 3 : 2);
  });
  return { step, lines, values: null, valueFont: 14, inset: 0, stagger: false, rows: Math.max(1, ...lines.map((l) => l.length)) };
}

type Legend = { label: string; color: string }[];

// Legenda do jednoho nebo víc řádků; vrací prvky a výšku, kterou zabrala.
// fontSize: u koláče větší (14 → 17), protože čísla a procenta jsou jen v legendě.
function legendRows(items: Legend, width: number, colors: Colors, top: number, fontSize = 14) {
  const nodes: React.ReactNode[] = [];
  const rowHeight = Math.round(fontSize * 1.7);
  const box = fontSize;
  let x = 0;
  let row = 0;
  items.forEach((item, i) => {
    const w = box + 12 + item.label.length * fontSize * 0.59;
    if (x > 0 && x + w > width) {
      x = 0;
      row += 1;
    }
    nodes.push(
      <g key={i} transform={`translate(${x}, ${top + row * rowHeight})`}>
        <rect width={box} height={box} y={-box * 0.8} rx="3" fill={item.color} stroke={colors.grid} />
        <text x={box + 6} fontSize={fontSize} fontWeight={fontSize > 14 ? 600 : undefined} fill={colors.text}>
          {item.label}
        </text>
      </g>,
    );
    x += w + 14;
  });
  return { nodes, height: items.length > 0 ? (row + 1) * rowHeight : 0 };
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
  result: SeriesDisplayOk;
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
  const narrow = width < 500;
  // Základní výška: zadaná, jinak na telefonu nižší. Když nadpis, legenda nebo patička potřebují víc místa,
  // graf se prodlouží (HEIGHT níž), aby samotná plocha grafu zůstala dost velká a nic se nepřekrývalo.
  const baseHeight = height ?? (narrow ? 360 : 460);
  const pad = narrow ? 16 : 28;
  // QR kód vpravo nahoře vedle nadpisu; nadpis se zúží, graf začne pod QR.
  const qrSize = qrUrl ? (width < 500 ? 64 : 84) : 0;
  const qrSpace = qrSize ? qrSize + 16 : 0;
  // Nadpis: na telefonu menší písmem a až na 3 řádky, ať se z něj neztratí období.
  const titleSize = width < 500 ? 22 : 28;
  const titleLineHeight = titleSize + 6;
  // Až 3 řádky (na telefonu 5): dlouhý nadpis (víc míst + datum) se jinak uřízne a ztratí se datum.
  const titleLines = wrap(title, Math.floor((width - 2 * pad - qrSpace) / (titleSize * 0.47)), narrow ? 5 : 3);
  const top = Math.max(pad + titleLines.length * titleLineHeight + 12, qrSize ? pad + qrSize + 22 : 0);
  const data = chartData(result);
  // Pravá osa: graf dopravy a počasí (Davidův combined_series) má řady s jinou jednotkou (vozidla × °C).
  // Řady počasí jdou na vlastní pravou osu, jinak by teplota (kolem 10) byla u auta (stovky) rovná čára u nuly.
  const onRight = result.data.buckets.length > 1 ? result.data.series.map((s) => "dataset" in s && s.dataset === "weather") : [];
  const dual = kind !== "pie" && onRight.some(Boolean) && onRight.some((r) => !r);
  const valuesOf = (right: boolean) =>
    data.series.flatMap((s, i) => (dual && (onRight[i] ?? false) !== right ? [] : s.values)).filter((v): v is number => v !== null);
  const values = valuesOf(false);
  const axis = axisFor(values, axisSetting);
  const rightAxis = dual ? axisFor(valuesOf(true), { mode: "auto" }) : null;
  const rightSeries = result.data.series.find((_, i) => onRight[i]);
  const rightUnit = rightSeries && "unit" in rightSeries ? (rightSeries.unit ?? "") : "";
  const zoomNotes = [
    kind !== "pie" && axis.zoomed ? `${dual ? "Levá osa" : "Osa"} začíná na ${formatNumber(axis.min)}, ne na nule` : null,
    rightAxis?.zoomed ? `pravá osa začíná na ${formatNumber(rightAxis.min)}` : null,
  ].filter((note) => note !== null);
  const footnote = zoomNotes.length > 0 ? `${zoomNotes.join(", ")} · ${FOOTNOTE}` : FOOTNOTE;
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
        ? data.series.map((s, i) => ({ label: dual && onRight[i] ? `${s.name} (pravá osa)` : s.name, color: seriesColor(i, 0) }))
        : [];
  const legend = legendRows(legendItems, width - 2 * pad, colors, 0, kind === "pie" ? (width < 500 ? 15 : 17) : 14);
  // Popis pro čtečky obrazovky: hodnoty grafu slovy (u dlouhých řad jen prvních 12).
  const summary =
    kind === "pie"
      ? legendItems.map((l) => l.label).join(", ")
      : data.series
          .map((s) => `${data.series.length > 1 ? `${s.name}: ` : ""}${data.categories.slice(0, 12).map((c, i) => `${c} ${s.values[i] === null ? "bez dat" : formatNumber(s.values[i] ?? 0)}`).join(", ")}`)
          .join("; ");
  // Patička (zdroj, případně „osa nezačíná nulou“) se na úzkém grafu zalomí, místo aby přetekla.
  const footLines = wrap(footnote, Math.floor((width - 2 * pad) / 6.2), 2);
  const footExtra = (footLines.length - 1) * 15;

  // Místo pod grafem na popisky osy x: jeden až tři řádky.
  const labelRows = kind === "pie" ? 0 : xLabels(kind, data, width - pad - (pad + 52)).rows;
  const below = pad + 22 + footExtra + (legend.height > 0 ? legend.height + 12 : 0) + (kind === "pie" ? 0 : 14 + labelRows * 16);
  const HEIGHT = Math.max(baseHeight, top + (narrow ? 170 : 220) + below);
  const bottom = HEIGHT - pad - 22 - footExtra - (legend.height > 0 ? legend.height + 12 : 0);
  const plot = { left: pad + (kind === "pie" ? 0 : 52), right: width - pad - (dual ? 52 : 0), top, bottom: bottom - (kind === "pie" ? 0 : 14 + labelRows * 16) };
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
          <text key={i} x={pad} y={pad + titleSize - 4 + i * titleLineHeight} fontSize={titleSize} fontWeight="700" fontFamily={TITLE_FONT} fill={colors.text}>
            {line}
          </text>
        ))}

        {kind === "pie" ? (
          <Pie slices={slices} shares={shares} sliceColor={sliceColor} cx={plot.left + plotW / 2} cy={plot.top + plotH / 2} r={Math.max(40, Math.min(plotW, plotH) / 2 - 4)} colors={colors} interaction={interaction} />
        ) : (
          <Axes kind={kind} result={result} data={data} axis={axis} rightAxis={rightAxis} onRight={onRight} rightUnit={rightUnit} plot={plot} plotW={plotW} plotH={plotH} colors={colors} seriesColor={seriesColor} interaction={interaction} />
        )}

        <g transform={`translate(${pad}, ${bottom + 26})`}>{legend.nodes}</g>
        {footLines.map((line, i) => (
          <text key={i} x={pad} y={HEIGHT - pad + 4 - (footLines.length - 1 - i) * 15} fontSize="12" fill={colors.muted}>
            {line}
          </text>
        ))}
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
  rightAxis,
  onRight,
  rightUnit,
  plot,
  plotW,
  plotH,
  colors,
  seriesColor,
  interaction,
}: {
  kind: "bar" | "line";
  result: SeriesDisplayOk;
  interaction: Interaction;
  axis: ValueAxis;
  rightAxis: ValueAxis | null; // pravá osa pro řady s jinou jednotkou (počasí u dopravy), jinak null
  onRight: boolean[]; // která řada patří na pravou osu
  rightUnit: string;
  data: ReturnType<typeof chartData>;
  plot: Plot;
  plotW: number;
  plotH: number;
  colors: Colors;
  seriesColor: (series: number, category: number) => string;
}) {
  // Hodnota → výška. Osa může začínat nad nulou (axis.min), pak je to u ní vyznačené přerušením.
  const y = (value: number) => plot.bottom - ((value - axis.min) / (axis.max - axis.min)) * plotH;
  const yRight = (value: number) => (rightAxis ? plot.bottom - ((value - rightAxis.min) / (rightAxis.max - rightAxis.min)) * plotH : y(value));
  // Výška pro řadu: řady na pravé ose podle pravé stupnice.
  const yOf = (series: number) => (rightAxis && onRight[series] ? yRight : y);
  const n = data.categories.length;
  const labels = xLabels(kind, data, plotW);
  const slot = plotW / n;
  const inner = plotW - 2 * labels.inset;
  const x = (i: number) =>
    kind === "bar" ? plot.left + slot * (i + 0.5) : plot.left + labels.inset + (n === 1 ? inner / 2 : (inner * i) / (n - 1));
  const showValues = kind === "bar" && n * data.series.length <= 16;
  // Popisek u nejvyššího sloupce / bodu (jedna řada), když hodnoty nejsou vypsané u všech.
  const peak = data.series.length === 1 && !showValues && !labels.values ? extremes(data.series[0].values)?.max ?? null : null;
  const peakValue = peak === null ? null : data.series[0].values[peak];
  const peakX = peak === null ? 0 : Math.min(plot.right - 28, Math.max(plot.left + 28, x(peak)));

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

      {/* Pravá osa (počasí u dopravy): jen popisky vpravo i s jednotkou („10 °C“), mřížka patří levé ose. */}
      {rightAxis && (
        <g>
          {rightAxis.ticks.map((tick) => (
            <text key={`r${tick}`} x={plot.right + 8} y={yRight(tick) + 4} fontSize="13" textAnchor="start" fill={colors.muted}>
              {`${formatNumber(tick)}${rightUnit ? ` ${rightUnit}` : ""}`}
            </text>
          ))}
        </g>
      )}

      {/* Přerušení osy: dvě šikmé čárky na začátku spodní čáry, když osa nezačíná nulou. */}
      {axis.zoomed && (
        <g aria-hidden="true">
          <rect x={plot.left - 2} y={plot.bottom - 7} width="14" height="14" fill={colors.bg} />
          <path d={`M${plot.left - 3},${plot.bottom + 7} l7,-14 M${plot.left + 4},${plot.bottom + 7} l7,-14`} stroke={colors.text} strokeWidth="2" />
        </g>
      )}

      {/* Svislá mřížka u časového grafu: čára u každého bodu, ať jde snadno najít den a jeho číslo pod ním. */}
      {kind === "line" &&
        data.categories.map((_, i) => (
          <line key={`g${i}`} x1={x(i)} x2={x(i)} y1={plot.top} y2={plot.bottom} stroke={colors.grid} strokeWidth="1" />
        ))}

      {data.categories.map((label, i) => {
        // U čárového grafu jsou první a poslední bod na okraji: popisek zarovnáme dovnitř, ať nepřeteče.
        const edge = kind === "line" && !labels.values;
        const anchor = edge && i === 0 ? "start" : edge && i === n - 1 ? "end" : "middle";
        return (
          <g key={`l${i}`}>
            {labels.lines[i].map((line, row) => (
              <text key={row} x={x(i)} y={plot.bottom + 22 + row * 16} fontSize="14" textAnchor={anchor} fill={colors.muted}>
                <title>{label}</title>
                {line}
              </text>
            ))}
            {labels.values && (
              <text
                x={x(i)}
                y={plot.bottom + 22 + Math.max(...labels.lines.map((l) => l.length)) * 16 + 2 + (labels.stagger && i % 2 === 1 ? 16 : 0)}
                fontSize={labels.valueFont} fontWeight="700" textAnchor={anchor} fill={colors.text}>
                {labels.values[i]}
              </text>
            )}
          </g>
        );
      })}

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
                        y={yOf(si)(value)}
                        width={Math.max(1, barW - 2)}
                        height={plot.bottom - yOf(si)(value)}
                        rx="3"
                        fill={seriesColor(si, i)}
                        stroke={samePick(interaction.picked, pickAt(result, si, i)) ? colors.text : "none"}
                        strokeWidth="3"
                      >
                        <title>{`${data.categories[i]}, ${s.name}: ${formatNumber(value)}`}</title>
                      </rect>
                      {showValues && (
                        <text x={start(i) + barW / 2} y={yOf(si)(value) - 7} fontSize="14" fontWeight="600" textAnchor="middle" fill={colors.text}>
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
            const d = s.values.map((value, i) => (value === null ? "" : `${i > 0 && s.values[i - 1] !== null ? "L" : "M"}${x(i)},${yOf(si)(value)}`)).join("");
            return (
              <g key={si}>
                <path d={d} fill="none" stroke={seriesColor(si, 0)} strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />
                {(n <= 40 || interaction.onPick) &&
                  s.values.map((value, i) =>
                    value === null ? null : (
                      <circle
                        key={i}
                        cx={x(i)}
                        cy={yOf(si)(value)}
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

      {peak !== null && peakValue !== null && (
        <text x={peakX} y={y(peakValue) - (kind === "line" ? 12 : 8)} fontSize="15" fontWeight="700" textAnchor="middle" fill={colors.text} stroke={colors.bg} strokeWidth="4" paintOrder="stroke">
          {formatNumber(peakValue)}
        </text>
      )}
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
  // Čísla a procenta jsou v legendě pod grafem, ne ve výsečích: u malé výseče (2 %) by se překrývala s grafem.
  return (
    <g>
      {slices.map((slice, i) => {
        const sweep = (slice.value / total) * Math.PI * 2;
        const start = starts[i];
        const end = start + sweep;
        const path =
          slices.length === 1
            ? `M${cx - r},${cy}a${r},${r} 0 1,0 ${2 * r},0a${r},${r} 0 1,0 ${-2 * r},0`
            : `M${cx},${cy}L${point(start, r)}A${r},${r} 0 ${sweep > Math.PI ? 1 : 0},1 ${point(end, r)}Z`;
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
          </g>
        );
      })}
    </g>
  );
}
