import type { SeriesOk } from "@/lib/citiq/series";
import { placeName } from "@/lib/ui/chart";
import { formatNumber } from "@/lib/ui/format";

// Tabulka dat: řádek = období (hodina / den), sloupec = místo, poslední řádek = součet za období.
// Součty spočítal náš kód (lib/citiq/series.ts). Chybějící hodnota je „–“, nikdy 0.
export default function DataTable({ result }: { result: SeriesOk }) {
  const { buckets, series } = result.data;
  const showTotal = buckets.length > 1;
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
              {series.map((s) => (
                <td key={s.gate} className="border-b border-current/15 px-3 py-1.5 text-right">
                  {s.values[i] === null ? <span className="opacity-60">–</span> : formatNumber(s.values[i] ?? 0)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
        {showTotal && (
          <tfoot>
            <tr className="font-semibold">
              <th scope="row" className="px-3 py-2">
                Celkem
              </th>
              {series.map((s) => (
                <td key={s.gate} className="px-3 py-2 text-right">
                  {formatNumber(s.total)}
                </td>
              ))}
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}
