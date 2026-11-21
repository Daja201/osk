import { type Facts, rangeText } from "@/lib/ui/answer";
import { capitalize, formatCars, formatHourRange, formatNumber, niceAxis } from "@/lib/ui/format";

type Props = Pick<Facts, "hourly" | "from" | "to" | "peak" | "low" | "missing">;

type Column = { kind: "bar"; hour: number; value: number } | { kind: "missing"; from: number; to: number };

// Souvislé chybějící hodiny spojíme do jednoho pruhu „chybí“. `from` je hodina prvního sloupce.
function columnsOf(hourly: (number | null)[], from: number): Column[] {
  const columns: Column[] = [];
  hourly.forEach((value, index) => {
    const hour = from + index;
    const last = columns[columns.length - 1];
    if (value !== null) columns.push({ kind: "bar", hour, value });
    else if (last?.kind === "missing" && last.to === hour) last.to = hour + 1;
    else columns.push({ kind: "missing", from: hour, to: hour + 1 });
  });
  return columns;
}

// Popisky osy x: celý den po 6 hodinách (0:00, 6:00…), kratší rozsah po 2 nebo po 1 hodině.
function axisLabels(from: number, count: number): { hour: number; span: number }[] {
  const step = count > 12 ? 6 : count > 6 ? 2 : 1;
  const labels: { hour: number; span: number }[] = [];
  for (let i = 0; i < count; i += step) labels.push({ hour: from + i, span: Math.min(step, count - i) });
  return labels;
}

function summary({ peak, low, missing }: Props): string {
  let text = "Sloupcový graf počtu aut po hodinách.";
  if (peak) text += ` Nejvíc ${formatCars(peak.value)} mezi ${peak.hour}:00 a ${peak.hour + 1}:00`;
  if (peak && low) text += `, nejméně ${formatCars(low.value)} mezi ${low.hour}:00 a ${low.hour + 1}:00`;
  if (peak) text += ".";
  if (missing.length > 0) text += ` Data chybí ${missing.map(rangeText).join(" a ")}.`;
  return text;
}

// Graf z obyčejných divů. Výška sloupce je v procentech osy, takže stejný graf funguje
// ve 220 px (počítač) i 150 px (mobil).
// Při otázce na část dne („mezi 6 a 10“) ukazuje jen tyto hodiny.
export default function HourlyChart(props: Props) {
  const { peak, low, missing, from } = props;
  const hourly = props.hourly.slice(from, props.to);
  const values = hourly.filter((value): value is number => value !== null);
  const axis = niceAxis(Math.max(0, ...values));
  const columns = columnsOf(hourly, from);
  const grid = { gridTemplateColumns: `repeat(${hourly.length}, minmax(0, 1fr))` };
  const percent = (value: number) => `${(value / axis.max) * 100}%`;
  const hasMissing = missing.length > 0;

  return (
    <div className="flex flex-col gap-2">
      <div className="mt-[18px] flex flex-col gap-2">
        <div role="img" aria-label={summary(props)} className="relative h-[150px] border-b-2 border-ink sm:h-[220px]">
          {axis.ticks.map((tick) => (
            <div key={tick}>
              <div className="absolute inset-x-0 border-t border-grid" style={{ bottom: percent(tick) }} />
              <span
                className="absolute left-0 text-[13px] leading-none text-muted"
                style={{ bottom: `calc(${percent(tick)} + 4px)` }}
              >
                {formatNumber(tick)}
              </span>
            </div>
          ))}
          <div className="absolute inset-y-0 right-0 left-11 grid items-end gap-x-0.5 sm:gap-x-1" style={grid}>
            {columns.map((column) =>
              column.kind === "missing" ? (
                <div
                  key={`m${column.from}`}
                  title={`${column.from}:00–${column.to}:00: data chybí`}
                  className="mx-px flex justify-center self-stretch rounded-t-md border-2 border-b-0 border-dashed border-muted bg-[#F3F5F8] pt-2.5"
                  style={{ gridColumn: `span ${column.to - column.from}` }}
                >
                  <span
                    className={`text-[13px] leading-none text-muted ${column.to - column.from < 2 ? "hidden sm:inline" : ""}`}
                  >
                    chybí
                  </span>
                </div>
              ) : (
                <div
                  key={column.hour}
                  title={`${formatHourRange(column.hour)}: ${formatCars(column.value)}`}
                  className={`relative w-full max-w-6 justify-self-center rounded-t-[4px] ${
                    peak?.hour === column.hour ? "bg-tabule" : "bg-bar"
                  }`}
                  style={{ height: percent(column.value) }}
                >
                  {peak?.hour === column.hour && (
                    <span className="absolute bottom-full left-1/2 mb-1.5 -translate-x-1/2 text-[15px] leading-none font-semibold whitespace-nowrap text-ink">
                      {formatNumber(column.value)}
                    </span>
                  )}
                </div>
              ),
            )}
          </div>
        </div>
        <div aria-hidden="true" className="grid gap-x-0.5 pl-11 text-[14px] text-muted sm:gap-x-1" style={grid}>
          {axisLabels(from, hourly.length).map(({ hour, span }) => (
            <span key={hour} style={{ gridColumn: `span ${span}` }}>
              {hour}:00
            </span>
          ))}
        </div>
      </div>

      {hasMissing && (
        <div className="mt-2 flex flex-wrap items-center gap-x-7 gap-y-2 text-[16px] text-muted">
          <span className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className="size-4 rounded-[3px] border-2 border-dashed border-muted bg-[#F3F5F8]"
            />
            data chybí
          </span>
        </div>
      )}

      {peak && (
        <p className="m-0 mt-1.5 text-[17px] text-muted">
          Nejvíc aut jelo mezi {peak.hour}:00 a {peak.hour + 1}:00
          {low ? `, nejméně mezi ${low.hour}:00 a ${low.hour + 1}:00.` : "."}
          {hasMissing && ` ${capitalize(missing.map(rangeText).join(" a "))} senzory nevysílaly.`}
        </p>
      )}
    </div>
  );
}
