// Data odpovědi jako CSV: řádek = období (hodina / den), sloupec = místo.
// Středník a BOM na začátku, aby český Excel správně ukázal sloupce i diakritiku. Chybějící hodnota = prázdná buňka.
import type { SeriesDisplayOk } from "./citiq/display";

const cell = (value: string) => (/[;"\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value);

export function seriesCsv(result: SeriesDisplayOk): string {
  const { buckets, series } = result.data;
  const comparison = result.data.comparison;
  if (comparison) {
    const header = ["Období", "Začátek (UTC)"];
    for (const item of comparison.series) {
      if (comparison.basis === "weather_mean") {
        header.push(`${item.gate} — průměr (${item.unit ?? ""})`, `${item.gate} — rozdíl vs ${comparison.baseline} (${item.unit ?? ""})`, `${item.gate} — pokrytí (h)`);
      } else {
        header.push(
          `${item.gate} — součet (vozidla)`,
          `${item.gate} — průměr (voz/h)`,
          `${item.gate} — rozdíl vs ${comparison.baseline} (${comparison.basis === "traffic_per_hour" ? "voz/h" : "vozidla"})`,
          `${item.gate} — změna (%)`,
          `${item.gate} — pokrytí (h)`,
        );
      }
    }
    const rows = buckets.map((bucket, index) => [
      bucket.label,
      bucket.start,
      ...comparison.series.flatMap((item) => {
        const point = item.points[index];
        const coverage = `${point.coverage.hours}/${point.coverage.of}`;
        return comparison.basis === "weather_mean"
          ? [point.value, point.delta, coverage].map((value) => value === null ? "" : String(value))
          : [point.total, point.perHour, point.delta, point.percent, coverage].map((value) => value === null ? "" : String(value));
      }),
    ]);
    return "﻿" + [header, ...rows].map((row) => row.map(cell).join(";")).join("\r\n") + "\r\n";
  }
  const header = ["Období", "Začátek (UTC)", ...series.map((s) => s.gate)];
  const rows = buckets.map((bucket, i) => [bucket.label, bucket.start, ...series.map((s) => (s.values[i] === null ? "" : String(s.values[i])))]);
  return "﻿" + [header, ...rows].map((row) => row.map(cell).join(";")).join("\r\n") + "\r\n";
}
