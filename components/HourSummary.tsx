import type { AnalyticsSeriesOk } from "@/lib/citiq/display";
import type { SeriesOk } from "@/lib/citiq/series";
import type { WeatherSeriesOk } from "@/lib/citiq/weatherSeries";
import { comparisonSummary, hourSummary } from "@/lib/ui/chart";
import type { ChartView } from "@/lib/view";

// Závěr pod grafem, spočítaný kódem z dat, ne AI:
// - graf po hodinách (jedno místo): nejvíc a nejméně vozidel,
// - porovnání období: rozdíl a procenta proti prvnímu období (graf ho sám neukáže).
type Result = SeriesOk | WeatherSeriesOk | AnalyticsSeriesOk;

function isTrafficResult(result: Result): result is SeriesOk {
  return result.meta.tool === "traffic_series";
}

export default function HourSummary({ result, view }: { result: Result; view: ChartView }) {
  if (view.format === "table") return null; // tabulka má rozdíly ve sloupcích
  const comparison = comparisonSummary(result);
  const hours = isTrafficResult(result) && (view.format === "bar" || view.format === "line") ? hourSummary(result) : null;
  const lines = comparison ?? (hours ? [hours] : null);
  if (!lines) return null;
  return (
    <div className="flex flex-col gap-1 text-[17px] leading-snug font-semibold text-pretty text-white sm:text-[19px]">
      {lines.map((line) => (
        <p key={line} className="m-0">
          {line}
        </p>
      ))}
    </div>
  );
}
