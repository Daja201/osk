import type { AskAnswer } from "@/lib/ai/types";
import type { TrafficCountInput } from "@/lib/ai/tools";
import { type Facts, type View, checkOf, modelName, numberSource, placeOf, timingsOf } from "@/lib/ui/answer";
import { formatCars, formatDayLong, formatHourRange, formatNumber, formatSeconds, quote } from "@/lib/ui/format";
import NumberMark from "./NumberMark";

// „Cesta odpovědi“ jako tramvajová linka: svislá čára, zastávky jsou kroky.
// Kolečko = krok AI, čtvereček = krok našeho kódu, plné kolečko = začátek a konec.

type Marker = "end" | "ai" | "code";

const MARKER_CLASS: Record<Marker, string> = {
  end: "mt-1 size-7 rounded-full bg-ink shadow-[0_0_0_3px_#fff]",
  ai: "mt-1.5 size-6 rounded-full border-[5px] border-tabule bg-white",
  code: "mt-[7px] size-[22px] rounded-[3px] bg-ink shadow-[0_0_0_3px_#fff]",
};
const MARKER_LABEL: Record<Marker, string> = { end: "", ai: "Krok AI: ", code: "Krok našeho kódu: " };

type StopData = { marker: Marker; title: string; time?: string; body: React.ReactNode };

function Stop({ stop, last }: { stop: StopData; last: boolean }) {
  return (
    <li className={`relative grid grid-cols-[44px_minmax(0,1fr)] gap-x-4 sm:grid-cols-[56px_minmax(0,1fr)] sm:gap-x-5 ${last ? "" : "pb-10"}`}>
      {!last && <span aria-hidden="true" className="absolute top-[18px] -bottom-[18px] left-[19px] w-1.5 bg-tabule sm:left-[25px]" />}
      <span aria-hidden="true" className={`relative justify-self-center ${MARKER_CLASS[stop.marker]}`} />
      <div className="flex min-w-0 flex-col gap-2.5">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h3 className="m-0 font-sign text-[24px] leading-[1.25] font-semibold sm:text-[26px]">
            <span className="sr-only">{MARKER_LABEL[stop.marker]}</span>
            {stop.title}
          </h3>
          {stop.time && <span className="text-[16px] whitespace-nowrap text-muted">{stop.time}</span>}
        </div>
        {stop.body}
      </div>
    </li>
  );
}

function Details({ rows }: { rows: [string, React.ReactNode][] }) {
  return (
    <dl className="m-0 grid grid-cols-[minmax(96px,auto)_minmax(0,1fr)] gap-x-5 gap-y-1.5">
      {rows.map(([label, value]) => (
        <div key={label} className="contents">
          <dt className="text-muted">{label}</dt>
          <dd className="m-0">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

const SCOPE_SHORT = { both: "oba směry", in: "jen směr dovnitř", out: "jen směr ven" } as const;

type CheckRow = { value: number; status: "verified" | "allowed" | "mismatch"; explanation: string };

// Odkud je každé číslo z věty (stejné pravidlo jako v pruhu s odpovědí, lib/ui/answer.ts).
function explain(value: number, notAllowed: number[], facts: Facts | null, tool: TrafficCountInput | null): CheckRow {
  const source = numberSource({ value, kind: "number", text: String(value) }, facts, tool, notAllowed);
  const status = source.who === "code" ? "verified" : source.who === "bad" ? "mismatch" : "allowed";
  return { value, status, explanation: source.short };
}

function CheckIcon({ ok }: { ok: boolean }) {
  return (
    <svg
      aria-hidden="true"
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke={ok ? "var(--color-ok)" : "var(--color-bad)"}
      strokeWidth="2.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {ok ? <path d="M5 12.5l4.5 4.5L19 7.5" /> : <path d="M6 6l12 12M18 6L6 18" />}
    </svg>
  );
}

function CheckTable({ rows }: { rows: CheckRow[] }) {
  const th = "border-b-2 border-ink py-2 pr-4 text-left font-semibold text-muted";
  const td = "border-b border-line py-2.5 pr-4";
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-[18px]">
        <thead>
          <tr>
            <th scope="col" className={th}>Číslo ve větě</th>
            <th scope="col" className={th}>Odkud je</th>
            <th scope="col" className={`${th} pr-0`}>Výsledek</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={index}>
              <td className={`${td} whitespace-nowrap`}>
                {row.status === "verified" ? <NumberMark size="chip">{formatNumber(row.value)}</NumberMark> : formatNumber(row.value)}
              </td>
              <td className={td}>{row.explanation}</td>
              <td className={`${td} pr-0`}>
                {row.status === "allowed" ? (
                  "povoleno"
                ) : (
                  <span className={`flex items-center gap-1.5 ${row.status === "mismatch" ? "text-bad" : ""}`}>
                    <CheckIcon ok={row.status === "verified"} />
                    {row.status === "verified" ? "sedí" : "nesedí"}
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function modelCallsText(count: number): string {
  if (count === 0) return "Model jsme nevolali.";
  if (count === 1) return "Model jsme volali jednou.";
  if (count === 2) return "Model jsme volali dvakrát: jednou pro výběr výpočtu, jednou pro větu.";
  return `Model jsme volali ${count}krát.`;
}

type Props = { answer: AskAnswer; view: View; facts: Facts | null; tool: TrafficCountInput | null };

function stopsOf({ answer, view, facts, tool }: Props): StopData[] {
  const timings = timingsOf(answer);
  const check = checkOf(answer);
  const model = modelName(answer.trace.model);
  const time = (ms: number | null) => (ms === null ? undefined : formatSeconds(ms));
  const stops: StopData[] = [{ marker: "end", title: "Vaše otázka", body: <p className="m-0">{quote(answer.question)}</p> }];

  if (view === "out_of_scope") {
    stops.push(
      {
        marker: "ai",
        title: "AI nenašla vhodný výpočet",
        time: time(timings.choose),
        body: <p className="m-0">{model} nenašel výpočet, který by se k otázce hodil, a žádný nevybral.</p>,
      },
      {
        marker: "code",
        title: "Aplikace odpověděla pevnou větou",
        body: <p className="m-0">{quote(answer.sentence)} Model sám nic nedoplnil.</p>,
      },
    );
  } else if (answer.reason?.code === "AI_ERROR" && !tool) {
    stops.push({ marker: "ai", title: "Spojení s AI selhalo", body: <p className="m-0">{answer.reason.message}</p> });
  } else if (answer.reason?.code === "NETWORK_ERROR") {
    stops.push({ marker: "code", title: "Server neodpověděl", body: <p className="m-0">{answer.reason.message}</p> });
  }

  if (tool) {
    const { place, sensors } = placeOf(tool.gate);
    const hasRange = tool.hour_from !== undefined || tool.hour_to !== undefined;
    stops.push({
      marker: "ai",
      title: "AI vybrala, co spočítat",
      time: time(timings.choose),
      body: (
        <Details
          rows={[
            ["Výpočet", hasRange ? "počet aut za vybrané hodiny" : "počet aut za den"],
            ["Místo", `${place}, ${SCOPE_SHORT[tool.direction]}${sensors.length > 1 ? ` (senzory ${sensors.join(" a ")})` : ""}`],
            [
              "Den",
              <span key="den" className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
                <span>{formatDayLong(tool.date)}</span>
                {tool.date_assumed && (
                  <>
                    <span className="rounded border-[1.5px] border-ink px-2 text-[15px] font-semibold">předpoklad AI</span>
                    <span className="text-[16px] text-muted">v otázce nebylo datum, AI vzala včerejšek</span>
                  </>
                )}
              </span>,
            ],
            ["Hodiny", hasRange ? `${tool.hour_from ?? 0}:00–${tool.hour_to ?? 24}:00` : "celý den, 0:00–24:00"],
            ["Model", model],
          ]}
        />
      ),
    });
  }

  if (facts) {
    const several = facts.sensors.length > 1 || facts.direction === "both";
    stops.push({
      marker: "code",
      title: "Náš kód spočítal výsledek z dat",
      time: time(timings.compute),
      body: (
        <>
          <p className="m-0">
            Stáhl hodinové hodnoty ze senzorové sítě CITIQ{several ? " a sečetl je" : ""}. AI v tomhle kroku nic nepočítá.
          </p>
          <Details
            rows={[
              ["Úplnost", `${facts.coverage.hours} z ${facts.coverage.of} hodin`],
              ["Celkem", formatCars(facts.total)],
              ...(facts.peak ? [["Nejvíc", `${formatHourRange(facts.peak.hour)}, ${formatCars(facts.peak.value)}`] as [string, string]] : []),
              ...(facts.low ? [["Nejméně", `${formatHourRange(facts.low.hour)}, ${formatCars(facts.low.value)}`] as [string, string]] : []),
            ]}
          />
        </>
      ),
    });
  } else if (answer.result && !answer.result.ok) {
    const sourceDown = answer.result.error.code === "SOURCE_ERROR";
    stops.push({
      marker: "code",
      title: sourceDown ? "Data se nepodařilo stáhnout" : "Pro tohle data nemáme",
      time: time(timings.compute),
      body: <p className="m-0">{answer.result.error.message}</p>,
    });
  }

  if (timings.write !== null) {
    stops.push({
      marker: "ai",
      title: "AI napsala větu",
      time: time(timings.write),
      body:
        answer.sentence_source === "ai" ? (
          <>
            <p className="m-0 text-[21px] leading-[1.45]">{quote(answer.sentence)}</p>
            <p className="m-0 text-muted">AI dostala jen spočítané výsledky, ne surová data.</p>
          </>
        ) : (
          <p className="m-0 text-muted">AI dostala jen spočítané výsledky, ne surová data, a napsala z nich větu.</p>
        ),
    });
  }

  if (check && (answer.sentence_source === "ai" || check.numbers.length > 0)) {
    const rows = check.numbers.map((value) => explain(value, check.not_allowed, facts, tool));
    stops.push({
      marker: "code",
      title: "Náš kód zkontroloval každé číslo ve větě",
      time: "pod 0,1 s",
      body: (
        <>
          {rows.length > 0 ? <CheckTable rows={rows} /> : <p className="m-0">Ve větě nebylo žádné číslo ke kontrole.</p>}
          <p className="m-0">
            {check.passed
              ? "Všechna čísla sedí, proto ukazujeme větu od AI. Kdyby některé nesedělo, větu bychom složili sami přímo z dat."
              : `Číslo ${check.not_allowed.map(formatNumber).join(", ")} v datech není, proto větu od AI nezobrazujeme.`}
          </p>
        </>
      ),
    });
  }

  if (answer.sentence_source === "fallback") {
    stops.push({
      marker: "code",
      title: "Náš kód složil větu sám",
      body: (
        <>
          <p className="m-0 text-[21px] leading-[1.45]">{quote(answer.sentence)}</p>
          {facts && <p className="m-0 text-muted">Použil jen čísla spočítaná z dat.</p>}
        </>
      ),
    });
  }

  stops.push({
    marker: "end",
    title: "Odpověď zobrazena",
    time: answer.trace.total_ms > 0 ? `celkem ${formatSeconds(answer.trace.total_ms)}` : undefined,
    body: <p className="m-0">{modelCallsText(timings.modelCalls)}</p>,
  });
  return stops;
}

export default function AnswerPath(props: Props) {
  const stops = stopsOf(props);
  return (
    <section aria-labelledby="cesta" className="flex max-w-[880px] flex-col gap-6">
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
        <h2 id="cesta" className="m-0 font-sign text-[30px] leading-[1.2] font-bold sm:text-[34px]">
          Cesta odpovědi
        </h2>
        <p className="m-0 flex flex-wrap items-center gap-x-[22px] gap-y-1.5 text-[16px] text-muted">
          <span className="flex items-center gap-2">
            <span aria-hidden="true" className="size-[18px] rounded-full border-4 border-tabule bg-white" />
            krok AI
          </span>
          <span className="flex items-center gap-2">
            <span aria-hidden="true" className="size-4 rounded-[3px] bg-ink" />
            krok našeho kódu
          </span>
        </p>
      </div>
      <ol className="m-0 list-none p-0">
        {stops.map((stop, index) => (
          <Stop key={index} stop={stop} last={index === stops.length - 1} />
        ))}
      </ol>
    </section>
  );
}
