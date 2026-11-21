import { aggregateValue, isMeanSeries, type SeriesDisplayOk } from "@/lib/citiq/display";
import { type DataPick, placeName } from "@/lib/ui/chart";
import { formatNumber } from "@/lib/ui/format";

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
    <div className="max-h-[60vh] overflow-auto rounded-xl border border-current/15">
      <table className="w-full border-collapse text-left text-[16px] tabular-nums">
        <thead className="sticky top-0 bg-inherit">
          <tr>
            <th scope="col" className="border-b-2 border-current/40 px-3 py-2 font-semibold opacity-80">
              Období
            </th>
            {series.map((s) => (
              <th key={s.gate} scope="col" className="border-b-2 border-current/40 px-3 py-2 text-right font-semibold opacity-80">
                {placeName(s.gate)}
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
