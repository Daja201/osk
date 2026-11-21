"use client";

import { type Ref, useEffect, useRef, useState } from "react";
import type { PALETTE } from "@/lib/ai/palette";
import type { SeriesOk } from "@/lib/citiq/series";
import { chartData, labelStep, percentShares, pieSlices, textOn } from "@/lib/ui/chart";
import { formatNumber, niceAxis } from "@/lib/ui/format";

// Grafy jako SVG bez knihovny. Celý obrázek (pozadí, nadpis, graf, legenda, zdroj) je v jednom <svg>,
// takže ho jde stáhnout jako PNG a vložit do prezentace přesně tak, jak vypadá na stránce.

export type Colors = (typeof PALETTE)[keyof typeof PALETTE];
type Kind = "bar" | "line" | "pie";

const FONT = "Barlow, 'Barlow Semi Condensed', system-ui, sans-serif";
const HEIGHT = 460;
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

const shorten = (text: string, max: number) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

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

type ChartProps = { kind: Kind; result: SeriesOk; title: string; colors: Colors; svgRef?: Ref<SVGSVGElement> };

export default function Chart({ kind, result, title, colors, svgRef }: ChartProps) {
  const [box, width] = useWidth();
  const pad = width < 500 ? 16 : 28;
  const titleLines = wrap(title, Math.floor((width - 2 * pad) / 13));
  const top = pad + titleLines.length * 32 + 10;
  const data = chartData(result);
  const seriesColor = (i: number) => colors.series[i % colors.series.length];

  // Legenda: u koláče výseče, jinak řady (jen když jich je víc než jedna).
  const slices = kind === "pie" ? pieSlices(result) : [];
  const shares = percentShares(slices.map((s) => s.value));
  const legendItems: Legend =
    kind === "pie"
      ? slices.map((s, i) => ({ label: `${s.label}: ${formatNumber(s.value)} (${shares[i]} %)`, color: seriesColor(i) }))
      : data.series.length > 1
        ? data.series.map((s, i) => ({ label: s.name, color: seriesColor(i) }))
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

  const plot = { left: pad + (kind === "pie" ? 0 : 52), right: width - pad, top, bottom: bottom - (kind === "pie" ? 0 : 30) };
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
        aria-label={`${title}. ${summary}`}
        fontFamily={FONT}
        className="block h-auto w-full"
      >
        <rect width={width} height={HEIGHT} fill={colors.bg} />
        {titleLines.map((line, i) => (
          <text key={i} x={pad} y={pad + 24 + i * 32} fontSize="26" fontWeight="700" fill={colors.text}>
            {line}
          </text>
        ))}

        {kind === "pie" ? (
          <Pie slices={slices} shares={shares} cx={plot.left + plotW / 2} cy={plot.top + plotH / 2} r={Math.max(40, Math.min(plotW, plotH) / 2 - 4)} colors={colors} />
        ) : (
          <Axes kind={kind} data={data} plot={plot} plotW={plotW} plotH={plotH} colors={colors} seriesColor={seriesColor} />
        )}

        <g transform={`translate(${pad}, ${bottom + 26})`}>{legend.nodes}</g>
        <text x={pad} y={HEIGHT - pad + 4} fontSize="12" fill={colors.muted}>
          {FOOTNOTE}
        </text>
      </svg>
    </div>
  );
}

type Plot = { left: number; right: number; top: number; bottom: number };

function Axes({
  kind,
  data,
  plot,
  plotW,
  plotH,
  colors,
  seriesColor,
}: {
  kind: "bar" | "line";
  data: ReturnType<typeof chartData>;
  plot: Plot;
  plotW: number;
  plotH: number;
  colors: Colors;
  seriesColor: (i: number) => string;
}) {
  const values = data.series.flatMap((s) => s.values).filter((v): v is number => v !== null);
  const axis = niceAxis(Math.max(0, ...values));
  const y = (value: number) => plot.bottom - (value / axis.max) * plotH;
  const n = data.categories.length;
  const step = labelStep(n, Math.max(2, Math.floor(plotW / 64)));
  const slot = plotW / n;
  const x = (i: number) => (kind === "bar" ? plot.left + slot * (i + 0.5) : plot.left + (n === 1 ? plotW / 2 : (plotW * i) / (n - 1)));
  const showValues = kind === "bar" && n * data.series.length <= 16;
  const maxLabel = Math.max(6, Math.floor((slot * step) / 7.5));

  return (
    <g>
      {[0, ...axis.ticks].map((tick) => (
        <g key={tick}>
          <line x1={plot.left} x2={plot.right} y1={y(tick)} y2={y(tick)} stroke={tick === 0 ? colors.text : colors.grid} strokeWidth={tick === 0 ? 2 : 1} />
          <text x={plot.left - 8} y={y(tick) + 4} fontSize="13" textAnchor="end" fill={colors.muted}>
            {formatNumber(tick)}
          </text>
        </g>
      ))}

      {data.categories.map((label, i) =>
        i % step === 0 ? (
          <text key={i} x={x(i)} y={plot.bottom + 22} fontSize="14" textAnchor="middle" fill={colors.muted}>
            <title>{label}</title>
            {shorten(label, maxLabel)}
          </text>
        ) : null,
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
                    <g key={i}>
                      <rect x={start(i) + 1} y={y(value)} width={Math.max(1, barW - 2)} height={plot.bottom - y(value)} rx="3" fill={seriesColor(si)}>
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
                <path d={d} fill="none" stroke={seriesColor(si)} strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />
                {n <= 40 &&
                  s.values.map((value, i) =>
                    value === null ? null : (
                      <circle key={i} cx={x(i)} cy={y(value)} r="4" fill={seriesColor(si)}>
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
}: {
  slices: { label: string; value: number }[];
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
          <g key={i}>
            <path d={path} fill={colors.series[i % colors.series.length]} stroke={colors.bg} strokeWidth="2">
              <title>{`${slice.label}: ${formatNumber(slice.value)} (${shares[i]} %)`}</title>
            </path>
            {shares[i] >= 6 && (
              <text x={lx} y={ly + 6} fontSize="17" fontWeight="700" textAnchor="middle" fill={textOn(colors.series[i % colors.series.length])}>
                {shares[i]} %
              </text>
            )}
          </g>
        );
      })}
    </g>
  );
}
