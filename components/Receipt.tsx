import { directionCz, type AskAnswer } from "@/lib/ui/types";
import Badge from "./Badge";

// „Původ odpovědi“ (účtenka): odkud přesně se vzala čísla.
function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 border-b border-neutral-700 py-2">
      <dt className="font-medium">{label}</dt>
      <dd className="text-right text-neutral-400">{children}</dd>
    </div>
  );
}

const pragueTime = new Intl.DateTimeFormat("cs-CZ", {
  timeZone: "Europe/Prague",
  day: "numeric",
  month: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

export default function Receipt({ answer }: { answer: AskAnswer | null }) {
  const result = answer?.result;

  return (
    <section className="rounded-lg border border-neutral-700 p-5">
      <h2 className="mb-3 text-lg">Původ odpovědi</h2>

      {!result?.ok ? (
        <p className="text-neutral-500">Tady bude vidět, z jakých dat odpověď je.</p>
      ) : (
        <>
          <Badge tone="data">celé z dat (účtenka)</Badge>
          <dl className="mt-2">
            <Row label="Funkce">{result.meta.tool}</Row>
            <Row label="Parametry">
              {result.meta.params.gate}, směr {directionCz[result.meta.params.direction]}, {result.meta.params.date}
            </Row>
            <Row label="Období">
              {result.meta.period_local}
              <span className="block text-xs">
                UTC {result.meta.period_utc[0]} – {result.meta.period_utc[1]}
              </span>
            </Row>
            <Row label="Zdroj">
              <a className="underline hover:text-neutral-200" href={result.meta.source_url} target="_blank" rel="noreferrer">
                CITIQ (otevřít dotaz)
              </a>
            </Row>
            <Row label="Pokrytí">
              {result.meta.coverage.hours} z {result.meta.coverage.of} hodin
            </Row>
            <Row label="Stáří dat">staženo {pragueTime.format(new Date(result.meta.fetched_at))}</Row>
          </dl>
          {result.meta.notes.length > 0 && (
            <ul className="mt-3 list-disc pl-5 text-sm text-neutral-400">
              {result.meta.notes.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
