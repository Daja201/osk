import { PALETTE } from "@/lib/ai/palette";
import type { AskAnswer } from "@/lib/ai/types";
import { aggregateValue } from "@/lib/citiq/display";
import { resolveWeatherMetric } from "@/lib/citiq/weatherStations";
import {
  DIRECTION_LABEL,
  FORMAT_LABEL,
  GRANULARITY_LABEL,
  checkOf,
  explainNumber,
  modelName,
  periodOf,
  timingsOf,
  viewOf,
} from "@/lib/ui/answer";
import { placeName } from "@/lib/ui/chart";
import { formatNumber, formatSeconds, quote } from "@/lib/ui/format";
import { type NumberToken, findNumbers } from "@/lib/ui/sentence";
import NumberMark from "./NumberMark";

// „Cesta odpovědi“ jako tramvajová linka: svislá čára, zastávky jsou kroky.
// Kolečko = krok AI, čtvereček = krok našeho kódu, plné kolečko = začátek a konec.

type Marker = "end" | "ai" | "code";

const MARKER_CLASS: Record<Marker, string> = {
  end: "mt-1 size-7 rounded-full bg-ink shadow-[0_0_0_3px_var(--color-surface)]",
  ai: "mt-1.5 size-6 rounded-full border-[5px] border-accent bg-surface",
  code: "mt-[7px] size-[22px] rounded-[3px] bg-ink shadow-[0_0_0_3px_var(--color-surface)]",
};
const MARKER_LABEL: Record<Marker, string> = { end: "", ai: "Krok AI: ", code: "Krok našeho kódu: " };

type StopData = { marker: Marker; title: string; time?: string; body: React.ReactNode };

function Stop({ stop, last }: { stop: StopData; last: boolean }) {
  return (
    <li className={`relative grid grid-cols-[44px_minmax(0,1fr)] gap-x-4 sm:grid-cols-[56px_minmax(0,1fr)] sm:gap-x-5 ${last ? "" : "pb-10"}`}>
      {!last && <span aria-hidden="true" className="absolute top-[18px] -bottom-[18px] left-[19px] w-1.5 bg-accent sm:left-[25px]" />}
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

type CheckRow = { text: string; status: "verified" | "allowed" | "mismatch"; explanation: string };

// Odkud je každé číslo z věty (stejné pravidlo jako v pruhu s odpovědí, lib/ui/answer.ts).
function row(token: { value: number; kind: NumberToken["kind"]; text: string }, notAllowed: number[], answer: AskAnswer): CheckRow {
  const source = explainNumber(token, answer, notAllowed);
  const status = source.who === "code" ? "verified" : source.who === "bad" ? "mismatch" : "allowed";
  return { text: token.text, status, explanation: source.short };
}

// Řádky tabulky kontroly. U věty od AI bereme čísla přímo z jejího textu (jak jsou napsaná, rok tedy „2026“,
// ne „2 026“); datum „20. 11. 2026“ se rozdělí na části jako při kontrole. Když větu složil kód (AI napsala
// číslo, které nesedělo), původní věta od AI nemáme, takže ukážeme čísla, jak je kontrola našla.
function checkRows(answer: AskAnswer, numbers: number[], notAllowed: number[]): CheckRow[] {
  if (answer.sentence_source !== "ai" || !answer.sentence) {
    return numbers.map((value) => row({ value, kind: "number", text: String(value) }, notAllowed, answer));
  }
  return findNumbers(answer.sentence).flatMap((token) => {
    if (token.kind !== "date") return [row(token, notAllowed, answer)];
    // „20. 11. 2026“ → 20, 11, 2026; „17. listopadu“ → 17 (název ulice nebo den)
    const parts = token.text.match(/\d+/g) ?? [];
    return parts.map((text) => row({ value: Number(text), kind: "date", text: parts.length === 1 ? token.text : text }, notAllowed, answer));
  });
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
                {row.status === "verified" ? <NumberMark size="chip">{row.text}</NumberMark> : row.text}
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

function modelCallsText(answer: AskAnswer, count: number): string {
  if (count === 0) return "Model jsme nevolali.";
  if (count === 1) return "Model jsme volali jednou.";
  if (count === 2 && answer.format === "text") return "Model jsme volali dvakrát: jednou pro zadání, jednou pro větu.";
  return `Model jsme volali ${count}krát (AI jednou opravovala neplatné zadání).`;
}

function stopsOf(answer: AskAnswer): StopData[] {
  const view = viewOf(answer);
  const timings = timingsOf(answer);
  const check = checkOf(answer);
  const model = modelName(answer.trace.model);
  const spec = answer.spec;
  const result = answer.result?.ok ? answer.result : null;
  const time = (ms: number | null) => (ms === null ? undefined : formatSeconds(ms));
  const datasetRows: [string, React.ReactNode][] =
    spec && "stations" in spec
      ? [
          ["Stanice", spec.stations.join(", ")],
          ["Veličiny", spec.metrics.map((metric) => `${resolveWeatherMetric(metric)?.label ?? metric} (${resolveWeatherMetric(metric)?.unit ?? ""})`).join(", ")],
        ]
      : spec
        ? [
            ["Místa", spec.gates.map(placeName).join(", ")],
            ["Směr", DIRECTION_LABEL[spec.direction]],
          ]
        : [];
  const resultRows: [string, React.ReactNode][] = result
    ? result.data.series.map((s) => [
        s.gate,
        result.data.comparison
          ? `${result.data.comparison.periods.length} období · ${result.data.comparison.basis === "weather_mean" ? "průměry a rozdíly" : result.data.comparison.basis === "traffic_per_hour" ? "vozidla na dostupnou hodinu" : "celkové počty"} vůči ${result.data.comparison.baseline} · podrobnosti níže`
          : result.meta.tool === "weather_series"
            ? `${aggregateValue(s) === null ? "bez dat" : formatNumber(aggregateValue(s) ?? 0)} · průměr za ${s.coverage.hours} z ${s.coverage.of} h`
            : `${formatNumber(aggregateValue(s) ?? 0)} vozidel · data za ${s.coverage.hours} z ${s.coverage.of} h${s.sensors.length > 1 ? ` · senzory ${s.sensors.join(", ")}` : ""}`,
      ])
    : [];
  const stops: StopData[] = [{ marker: "end", title: "Vaše otázka", body: <p className="m-0">{quote(answer.question)}</p> }];

  if (view === "out_of_scope") {
    stops.push(
      {
        marker: "ai",
        title: "AI nenašla vhodný výpočet",
        time: time(timings.choose),
        body: <p className="m-0">{model} usoudil, že se otázka netýká dat o dopravě, a zadání nepřipravil.</p>,
      },
      { marker: "code", title: "Aplikace odpověděla pevnou větou", body: <p className="m-0">{quote(answer.sentence ?? "")} Model sám nic nedoplnil.</p> },
    );
  } else if (answer.reason?.code === "AI_ERROR" && !spec) {
    stops.push({ marker: "ai", title: "Spojení s AI selhalo", body: <p className="m-0">{answer.reason.message}</p> });
  } else if (answer.reason?.code === "NETWORK_ERROR") {
    stops.push({ marker: "code", title: "Server neodpověděl", body: <p className="m-0">{answer.reason.message}</p> });
  } else if (answer.reason?.code === "RATE_LIMIT_ERROR") {
    stops.push({ marker: "code", title: "Server omezil počet dotazů", body: <p className="m-0">{answer.reason.message}</p> });
  }

  if (spec) {
    stops.push({
      marker: "ai",
      title: "AI připravila zadání",
      time: time(timings.choose),
      body: (
        <>
          <Details
            rows={[
              ["Ukázat jako", FORMAT_LABEL[spec.format]],
              ...datasetRows,
              [
                "Období",
                <span key="obdobi" className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
                  <span>{periodOf(answer)}</span>
                  {spec.date_assumed && <span className="rounded border-[1.5px] border-ink px-2 text-[15px] font-semibold">předpoklad AI</span>}
                </span>,
              ],
              ["Rozlišení", "stations" in spec && spec.granularity === "total" ? "průměr za období" : GRANULARITY_LABEL[spec.granularity]],
              ...(spec.title ? [["Nadpis", quote(spec.title)] as [string, string]] : []),
              ...(spec.background ? [["Pozadí", PALETTE[spec.background].label] as [string, string]] : []),
              ["Model", model],
            ]}
          />
        </>
      ),
    });
  }

  if (result) {
    const dotazu = result.meta.sources.length === 1 ? "jedním dotazem" : `${result.meta.sources.length} dotazy (jeden na den)`;
    stops.push({
      marker: "code",
      title: "Náš kód stáhl a spočítal data",
      time: time(timings.compute),
      body: (
        <>
          <p className="m-0">
            Stáhl hodinové hodnoty ze senzorové sítě CITIQ {dotazu} a{" "}
            {result.data.comparison
              ? result.meta.tool === "weather_series" ? "spočítal průměry a jejich rozdíly." : "spočítal součty a srovnání podle zadání."
              : result.meta.tool === "weather_series" ? "spočítal průměry podle zadání." : "sečetl je podle zadání."} AI v tomhle kroku nic nepočítá.
          </p>
          <Details
            rows={resultRows}
          />
          {answer.notes.length > 0 && (
            <ul className="m-0 flex list-disc flex-col gap-1 pl-5 text-muted">
              {answer.notes.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
          )}
        </>
      ),
    });
  } else if (answer.result && !answer.result.ok) {
    stops.push({
      marker: "code",
      title: answer.reason?.code === "SOURCE_ERROR" ? "Data se nepodařilo stáhnout" : "Odpověď z dat nejde",
      time: time(timings.compute),
      body: <p className="m-0">{"error" in answer.result ? answer.result.error.message : answer.result.message}</p>,
    });
  }

  if (result && answer.format && answer.format !== "text") {
    const what = answer.format === "table" ? "tabulku" : answer.format === "source" ? "seznam dotazů na API" : FORMAT_LABEL[answer.format];
    stops.push({
      marker: "code",
      title: `Náš kód vykreslil ${what}`,
      body: (
        <p className="m-0">
          Přímo z čísel výše. AI do {answer.format === "source" ? "odpovědi" : "grafu ani tabulky"} nic nepíše
          {spec?.title && spec.title === answer.title ? ", jen nadpis je podle vašeho zadání." : ", nadpis složil kód z toho, co se spočítalo."}
        </p>
      ),
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
            <p className="m-0 text-[21px] leading-[1.45]">{quote(answer.sentence ?? "")}</p>
            <p className="m-0 text-muted">AI dostala jen spočítané výsledky, ne surová data.</p>
          </>
        ) : (
          <p className="m-0 text-muted">AI dostala jen spočítané výsledky, ne surová data, a napsala z nich větu.</p>
        ),
    });
  }

  if (check) {
    const rows = checkRows(answer, check.numbers, check.not_allowed);
    stops.push({
      marker: "code",
      title: "Náš kód zkontroloval každé číslo ve větě",
      time: "pod 0,1 s",
      body: (
        <>
          {rows.length > 0 ? <CheckTable rows={rows} /> : <p className="m-0">Ve větě nebylo žádné číslo ke kontrole.</p>}
          {!check.passed && (
            <p className="m-0">Číslo {check.not_allowed.map(formatNumber).join(", ")} v datech není, proto větu od AI nezobrazujeme.</p>
          )}
        </>
      ),
    });
  }

  if (answer.sentence_source === "fallback") {
    stops.push({
      marker: "code",
      title: "Náš kód složil větu sám",
      body: <p className="m-0 text-[21px] leading-[1.45]">{quote(answer.sentence ?? "")}</p>,
    });
  }

  stops.push({
    marker: "end",
    title: "Odpověď zobrazena",
    time: answer.trace.total_ms > 0 ? `celkem ${formatSeconds(answer.trace.total_ms)}` : undefined,
    body: (
      <p className="m-0">
        {modelCallsText(answer, timings.modelCalls)}
        {answer.id && answer.expires_at && ` Odpověď je uložená a odkaz platí do ${new Date(answer.expires_at).toLocaleDateString("cs-CZ", { timeZone: "Europe/Prague" })}.`}
      </p>
    ),
  });
  return stops;
}

export default function AnswerPath({ answer }: { answer: AskAnswer }) {
  const stops = stopsOf(answer);
  return (
    <section aria-labelledby="cesta" className="flex max-w-[880px] flex-col gap-6">
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
        <h2 id="cesta" className="m-0 font-sign text-[30px] leading-[1.2] font-bold sm:text-[34px]">
          Cesta odpovědi
        </h2>
        <p className="m-0 flex flex-wrap items-center gap-x-[22px] gap-y-1.5 text-[16px] text-muted">
          <span className="flex items-center gap-2">
            <span aria-hidden="true" className="size-[18px] rounded-full border-4 border-accent bg-surface" />
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
