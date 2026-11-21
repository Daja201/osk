// Stažení a kopírování v prohlížeči: PNG z grafu, CSV z dat, text do schránky.
import type { SeriesOk } from "../citiq/series";
import { seriesCsv } from "../csv";
import { placeName } from "./chart";

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Graf (SVG) → PNG ve dvojnásobném rozlišení, aby byl ostrý i v prezentaci na projektoru.
export async function downloadPng(svg: SVGSVGElement, filename: string): Promise<void> {
  const width = svg.width.baseVal.value;
  const height = svg.height.baseVal.value;
  const source = new XMLSerializer().serializeToString(svg);
  const image = new Image();
  image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(source)}`;
  await image.decode();
  const canvas = document.createElement("canvas");
  canvas.width = width * 2;
  canvas.height = height * 2;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Prohlížeč neumí kreslit do canvasu.");
  context.scale(2, 2);
  context.drawImage(image, 0, 0, width, height);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) throw new Error("PNG se nepodařilo vytvořit.");
  download(blob, filename);
}

export function downloadCsv(result: SeriesOk, filename: string) {
  download(new Blob([seriesCsv(result)], { type: "text/csv;charset=utf-8" }), filename);
}

// Tabulka jako text oddělený tabulátory: po vložení do Excelu nebo Google Tabulek se rozdělí do buněk.
export function tableTsv(result: SeriesOk): string {
  const { buckets, series } = result.data;
  const header = ["Období", ...series.map((s) => placeName(s.gate))];
  const rows = buckets.map((b, i) => [b.label, ...series.map((s) => (s.values[i] === null ? "" : String(s.values[i])))]);
  return [header, ...rows].map((row) => row.join("\t")).join("\n");
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
