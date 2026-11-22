import { aggregateValue, isMeanSeries, type SeriesDisplayOk } from "@/lib/citiq/display";
import { type DataPick, placeName } from "@/lib/ui/chart";
import { formatNumber } from "@/lib/ui/format";

// Buňka hlavičky: neprůhledná (barva karty), čára dole jako stín v barvě textu (40 %).
const HEAD = "bg-inherit px-3 py-2 font-semibold shadow-[inset_0_-2px_0_color-mix(in_srgb,currentColor_40%,transparent)]";

// Tabulka dat: řádek = období (hodina / den), sloupec = místo, poslední řádek = součet za období.
// Součty spočítal náš kód (lib/citiq/series.ts). Chybějící hodnota je „–“, nikdy 0.
// S onPick je každé číslo tlačítko (v podrobnostech ukáže, odkud je).
export default function DataTable({
  result,
  onPick,
  picked,
}: {
  result: SeriesDisplayOk;
  onPick?: (pick: DataPick) => void;
  picked?: DataPick | null;
}) {
  const { buckets, series } = result.data;
  const mean = isMeanSeries(result);
  const comparison = result.data.comparison;
  const showTotal = buckets.length > 1 && !comparison;
  const cell = (pick: DataPick, content: React.ReactNode, label: string) =>
    onPick ? (
      <button
        type="button"
        onClick={() => onPick(pick)}
        aria-label={`${label}. Ukázat odkud je.`}
        aria-pressed={picked?.gate === pick.gate && picked?.bucket === pick.bucket}
        className="-mx-1.5 cursor-pointer rounded px-1.5 tabular-nums hover:bg-current/10 aria-pressed:bg-current/15 aria-pressed:font-semibold"
      >
        {content}
      </button>
    ) : (
      content
    );
  return (
    // Hlavička (Období, místa) zůstává při posouvání nahoře. Musí mít neprůhledné pozadí: barvu karty zdědí
    // přes všechny vrstvy (bg-inherit), jinak by data prosvítala přes její text. Čára pod ní je stín,
    // protože okraj buňky by se při border-collapse posunul s daty.
    <div className="max-h-[60vh] overflow-auto rounded-xl border border-current/15 bg-inherit">
      <table className="w-full border-collapse bg-inherit text-left text-[16px] tabular-nums">
        <thead className="sticky top-0 z-10 bg-inherit">
          <tr className="bg-inherit">
            <th scope="col" className={HEAD}>
              <span className="opacity-80">Období</span>
            </th>
            {series.map((s) => (
              <th key={s.gate} scope="col" className={`${HEAD} text-right`}>
                <span className="opacity-80">{placeName(s.gate)}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {buckets.map((bucket, i) => (
            <tr key={bucket.start}>
              <th scope="row" className="border-b border-current/15 px-3 py-1.5 font-normal whitespace-nowrap opacity-80">
                {bucket.label}
              </th>
              {series.map((s, gate) => {
                const point = comparison?.series[gate]?.points[i];
                const value = point ? point.value : s.values[i];
                const unit = comparison?.series[gate]?.unit;
                const delta =
                  point?.delta === null || point?.delta === undefined
                    ? null
                    : `${point.delta > 0 ? "+" : ""}${formatNumber(point.delta)}${point.percent === null ? "" : ` (${point.percent > 0 ? "+" : ""}${formatNumber(point.percent)} %)`}`;
                const secondary = point && comparison
                  ? comparison.basis === "weather_mean"
                    ? `${i === 0 ? "základ" : `Δ ${delta ?? "—"} vs první období`} · data ${point.coverage.hours}/${point.coverage.of} h`
                    : comparison.basis === "traffic_per_hour"
                      ? `${point.total === null ? "součet —" : `součet ${formatNumber(point.total)} vozidel`} · ${i === 0 ? "základ" : `Δ ${delta ?? "—"} voz/h vs první období`} · data ${point.coverage.hours}/${point.coverage.of} h`
                      : `${point.perHour === null ? "průměr —" : `${formatNumber(point.perHour)} voz/h`} · ${i === 0 ? "základ" : `Δ ${delta ?? "—"} vs první období`} · data ${point.coverage.hours}/${point.coverage.of} h`
                  : null;
                const shown = value === null
                  ? <span className="opacity-60">–</span>
                  : `${formatNumber(value)}${comparison ? ` ${comparison.basis === "weather_mean" ? unit ?? "" : comparison.basis === "traffic_per_hour" ? "voz/h" : "vozidel"}` : ""}`;
                const primaryUnit = comparison
                  ? comparison.basis === "weather_mean" ? unit ?? "" : comparison.basis === "traffic_per_hour" ? "voz/h" : "vozidel"
                  : unit ?? "";
                const label = `${placeName(s.gate)}, ${bucket.label}: ${value === null ? "bez dat" : `${formatNumber(value)}${primaryUnit ? ` ${primaryUnit}` : ""}`}${secondary ? `. ${secondary}` : ""}`;
                return (
                  <td key={s.gate} className="border-b border-current/15 px-3 py-1.5 text-right">
                    {cell(
                      { gate, bucket: i },
                      <>{shown}{secondary && <span className="block text-[13px] leading-snug opacity-70">{secondary}</span>}</>,
                      label,
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
        {showTotal && (
          <tfoot>
            <tr className="font-semibold">
              <th scope="row" className="px-3 py-2">
                {mean ? "Průměr" : "Celkem"}
              </th>
              {series.map((s, gate) => (
                <td key={s.gate} className="px-3 py-2 text-right">
                  {cell(
                    { gate, bucket: null },
                    aggregateValue(s) === null ? <span className="opacity-60">–</span> : formatNumber(aggregateValue(s) ?? 0),
                    `${placeName(s.gate)}, ${mean ? "průměr" : "celkem"}: ${aggregateValue(s) === null ? "bez dat" : formatNumber(aggregateValue(s) ?? 0)}`,
                  )}
                </td>
              ))}
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}
