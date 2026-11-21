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

// Písma, která graf používá (components/charts/Chart.tsx): text 400, hodnoty 600, nadpis Semi Condensed 700.
const EMBED: { family: string; weights: string[] }[] = [
  { family: "Barlow", weights: ["400", "600"] },
  { family: "Barlow Semi Condensed", weights: ["700"] },
];

// Latinka (U+0000-00FF) a latin-ext s češtinou (U+0100-02BA…). Build ji zkracuje na „U+??“ (zástupné znaky),
// prohlížeč ji může vrátit i jako „U+0-FF“.
export function isLatinRange(range: string): boolean {
  return /(^|,\s*)U\+(\?\?|0{0,4}-0{0,2}FF)(,|$)/i.test(range) || /(^|,\s*)U\+0?100-0?2BA/i.test(range);
}

function toBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

// SVG převedené na obrázek nesmí načítat písma zvenku, proto by PNG mělo systémové písmo.
// Najdeme ve stylech stránky soubory Barlow (už načtené z @fontsource) a vložíme je do SVG jako data: URL.
let fontCss: Promise<string> | null = null;
function embeddedFontCss(): Promise<string> {
  fontCss ??= (async () => {
    const faces: { family: string; weight: string; range: string; url: string }[] = [];
    for (const sheet of Array.from(document.styleSheets)) {
      let rules: CSSRuleList;
      try {
        rules = sheet.cssRules;
      } catch {
        continue; // cizí styl bez přístupu
      }
      for (const rule of Array.from(rules)) {
        if (!(rule instanceof CSSFontFaceRule)) continue;
        const family = rule.style.getPropertyValue("font-family").replace(/["']/g, "").trim();
        const weight = rule.style.getPropertyValue("font-weight").trim();
        const range = rule.style.getPropertyValue("unicode-range");
        if (!EMBED.some((e) => e.family === family && e.weights.includes(weight)) || !isLatinRange(range)) continue;
        const match = /url\(["']?([^"')]+\.woff2)["']?\)/.exec(rule.style.getPropertyValue("src"));
        if (match) faces.push({ family, weight, range, url: new URL(match[1], sheet.href ?? window.location.href).href });
      }
    }
    const css = await Promise.all(
      faces.map(async (face) => {
        const data = toBase64(await (await fetch(face.url)).arrayBuffer());
        return `@font-face{font-family:"${face.family}";font-weight:${face.weight};src:url(data:font/woff2;base64,${data}) format("woff2");unicode-range:${face.range}}`;
      }),
    );
    return css.join("");
  })().catch(() => ""); // bez písma se PNG udělá i tak, jen se systémovým písmem
  return fontCss;
}

// Graf jako samostatné SVG i s vloženými písmy (stejné jako na stránce).
export async function standaloneSvg(svg: SVGSVGElement): Promise<string> {
  const copy = svg.cloneNode(true) as SVGSVGElement;
  const style = document.createElementNS("http://www.w3.org/2000/svg", "style");
  style.textContent = await embeddedFontCss();
  copy.insertBefore(style, copy.firstChild);
  return new XMLSerializer().serializeToString(copy);
}

// SVG: v PowerPointu jde převést na upravitelné tvary (Převést na obrazec), v Google Prezentacích vložit jako obrázek.
export async function downloadSvg(svg: SVGSVGElement, filename: string): Promise<void> {
  download(new Blob([await standaloneSvg(svg)], { type: "image/svg+xml" }), filename);
}

// Graf (SVG) → PNG ve dvojnásobném rozlišení, aby byl ostrý i v prezentaci na projektoru.
export async function downloadPng(svg: SVGSVGElement, filename: string): Promise<void> {
  download(await renderPng(svg), filename);
}

// Samotné vykreslení PNG (zvlášť, aby šlo vyzkoušet v prohlížeči bez stahování).
//
// Proč ne jen „SVG → obrázek → canvas“: Safari v takovém obrázku vynechá text, jehož písmo ještě nestihlo
// načíst (typicky velký nadpis), a PNG pak nemá nadpis. Proto:
//   1. na canvas nakreslíme SVG BEZ textů (sloupce, čáry, QR…),
//   2. texty dokreslíme přímo na canvas písmy, která má stránka už načtená (počkáme na document.fonts.load).
// Každý text dostane stejnou polohu, velikost, barvu i zarovnání jako v SVG (matice z getScreenCTM).
export async function renderPng(svg: SVGSVGElement): Promise<Blob> {
  const width = svg.width.baseVal.value;
  const height = svg.height.baseVal.value;
  const scale = 2;

  const shapes = svg.cloneNode(true) as SVGSVGElement;
  shapes.querySelectorAll("text").forEach((text) => text.remove());
  const image = new Image();
  image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(new XMLSerializer().serializeToString(shapes))}`;
  await image.decode();

  const canvas = document.createElement("canvas");
  canvas.width = width * scale;
  canvas.height = height * scale;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Prohlížeč neumí kreslit do canvasu.");
  context.scale(scale, scale);
  context.drawImage(image, 0, 0, width, height);

  // Souřadnice textu v SVG: matice textu vůči <svg> (bez CSS zmenšení grafu na stránce).
  const root = svg.getScreenCTM();
  const texts = Array.from(svg.querySelectorAll("text"));
  for (const text of texts) {
    // Jen přímý text, ne <title> uvnitř (to je bublina při najetí myší).
    const content = Array.from(text.childNodes)
      .filter((node) => node.nodeType === Node.TEXT_NODE)
      .map((node) => node.textContent ?? "")
      .join("")
      .trim();
    const own = text.getScreenCTM();
    if (!content || !root || !own) continue;
    const m = root.inverse().multiply(own);
    const style = getComputedStyle(text);
    const font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
    await document.fonts.load(font, content).catch(() => undefined);
    const anchor = style.getPropertyValue("text-anchor");
    context.setTransform(scale * m.a, scale * m.b, scale * m.c, scale * m.d, scale * m.e, scale * m.f);
    context.font = font;
    context.fillStyle = style.getPropertyValue("fill") || "#000";
    context.textAlign = anchor === "middle" ? "center" : anchor === "end" ? "right" : "left";
    context.textBaseline = "alphabetic"; // jako SVG: y je účaří
    context.fillText(content, text.x.baseVal[0]?.value ?? 0, text.y.baseVal[0]?.value ?? 0);
  }

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) throw new Error("PNG se nepodařilo vytvořit.");
  return blob;
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
