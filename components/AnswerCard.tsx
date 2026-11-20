import type { AskAnswer } from "@/lib/ui/types";
import Badge from "./Badge";
import HourChart from "./HourChart";

const cz = new Intl.NumberFormat("cs-CZ");

export default function AnswerCard({ answer, loading }: { answer: AskAnswer | null; loading: boolean }) {
  const result = answer?.result;

  return (
    <section className="rounded-lg border border-neutral-700 p-5" aria-live="polite">
      <h2 className="mb-3 text-lg">Odpověď na otázku</h2>

      {loading && <p className="text-neutral-400">Hledám v datech…</p>}

      {!loading && !answer && <p className="text-neutral-500">Zeptejte se nahoře, odpověď se ukáže tady.</p>}

      {!loading && answer && (
        <div className="space-y-3">
          <Badge tone={answer.sentence_source === "ai" ? "ai" : "warn"}>
            {answer.sentence_source === "ai" ? "věta: AI" : "věta: složil kód"}
          </Badge>
          <p className="rounded bg-neutral-800/60 p-4 text-xl leading-snug">{answer.sentence}</p>

          {result?.ok ? (
            <>
              <Badge tone="data">číslo a graf: data</Badge>
              <div className="rounded bg-neutral-800/60 p-4 text-center">
                <div className="text-4xl font-semibold">{cz.format(result.data.total)}</div>
                <div className="text-sm text-neutral-400">vozidel za den (směr {result.meta.params.direction})</div>
              </div>
              <HourChart hourly={result.data.hourly} />
            </>
          ) : (
            result && (
              <p className="rounded border border-amber-800 p-3 text-amber-200">
                Nevím: {result.error.message}
              </p>
            )
          )}
        </div>
      )}
    </section>
  );
}
