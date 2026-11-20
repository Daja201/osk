// Sloupcový graf po hodinách bez knihovny. null = chybějící data (přerušovaný obrys).
export default function HourChart({ hourly }: { hourly: (number | null)[] }) {
  const max = Math.max(1, ...hourly.map((value) => value ?? 0));

  return (
    <figure>
      <div className="flex h-32 items-end gap-0.5" role="img" aria-label="Graf průjezdů po hodinách">
        {hourly.map((value, hour) => (
          <div key={hour} className="flex h-full flex-1 flex-col justify-end" title={`${hour}:00–${hour + 1}:00: ${value ?? "chybí data"}`}>
            {value === null ? (
              <div className="h-1/3 border border-dashed border-neutral-500" />
            ) : (
              <div className="bg-neutral-500" style={{ height: `${(value / max) * 100}%` }} />
            )}
          </div>
        ))}
      </div>
      <div className="mt-1 flex justify-between text-xs text-neutral-500">
        <span>0:00</span>
        <span>6:00</span>
        <span>12:00</span>
        <span>18:00</span>
        <span>24:00</span>
      </div>
      <figcaption className="mt-2 text-sm text-neutral-400">graf po hodinách, přerušovaně = chybějící data</figcaption>
    </figure>
  );
}
