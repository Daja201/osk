import type { SeriesOk } from "@/lib/citiq/series";
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
  result: SeriesOk;
  onPick?: (pick: DataPick) => void;
  picked?: DataPick | null;
}) {
  const { buckets, series } = result.data;
  const showTotal = buckets.length > 1;
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
              {series.map((s, gate) => (
                <td key={s.gate} className="border-b border-current/15 px-3 py-1.5 text-right">
                  {cell(
                    { gate, bucket: i },
                    s.values[i] === null ? <span className="opacity-60">–</span> : formatNumber(s.values[i] ?? 0),
                    `${placeName(s.gate)}, ${bucket.label}: ${s.values[i] === null ? "bez dat" : formatNumber(s.values[i] ?? 0)}`,
                  )}
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
              {series.map((s, gate) => (
                <td key={s.gate} className="px-3 py-2 text-right">
                  {cell({ gate, bucket: null }, formatNumber(s.total), `${placeName(s.gate)}, celkem: ${formatNumber(s.total)}`)}
                </td>
              ))}
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}
