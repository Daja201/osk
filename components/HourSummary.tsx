import type { SeriesOk } from "@/lib/citiq/series";
import { hourSummary } from "@/lib/ui/chart";
import type { ChartView } from "@/lib/view";

// Závěr pod grafem po hodinách (jedno místo): nejvíc a nejméně vozidel. Spočítal kód z dat, ne AI.
export default function HourSummary({ result, view }: { result: SeriesOk; view: ChartView }) {
  const summary = view.format === "bar" || view.format === "line" ? hourSummary(result) : null;
  if (!summary) return null;
  return <p className="m-0 text-[17px] leading-snug font-semibold text-pretty text-white sm:text-[19px]">{summary}</p>;
}
