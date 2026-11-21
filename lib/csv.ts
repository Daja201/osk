// Data odpovědi jako CSV: řádek = období (hodina / den), sloupec = místo.
// Středník a BOM na začátku, aby český Excel správně ukázal sloupce i diakritiku. Chybějící hodnota = prázdná buňka.
import type { SeriesOk } from "./citiq/series";

const cell = (value: string) => (/[;"\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value);

export function seriesCsv(result: SeriesOk): string {
  const { buckets, series } = result.data;
  const header = ["Období", "Začátek (UTC)", ...series.map((s) => s.gate)];
  const rows = buckets.map((bucket, i) => [bucket.label, bucket.start, ...series.map((s) => (s.values[i] === null ? "" : String(s.values[i])))]);
  return "﻿" + [header, ...rows].map((row) => row.map(cell).join(";")).join("\r\n") + "\r\n";
}
