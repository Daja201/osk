// Položí jednu otázku stejně jako /api/ask a vypíše odpověď a trace.
// Spuštění: npm run ask -- "Kolik aut projelo včera u Billy?"
import Anthropic from "@anthropic-ai/sdk";
import { ask } from "../lib/ai/ask";
import { appNow } from "../lib/ai/dates";
import { trafficSeries } from "../lib/citiq/series";
import { weatherSeries } from "../lib/citiq/weatherSeries";

const question = process.argv.slice(2).join(" ").trim();
if (!question) {
  console.error('Použití: npm run ask -- "otázka"');
  process.exit(1);
}

const now = appNow();
const answer = await ask(question, {
  client: new Anthropic({ maxRetries: 3, timeout: 30_000 }),
  model: process.env.CLAUDE_MODEL ?? "claude-haiku-5-5",
  now,
  trafficSeries: (params) => trafficSeries(params, { now }),
  weatherSeries: (params) => weatherSeries(params, { now }),
});

console.log(`${answer.kind} · ${answer.format ?? "-"} (${answer.sentence_source ?? "bez věty"}${answer.reason ? `, ${answer.reason.code}` : ""})`);
if (answer.title) console.log(`nadpis: ${answer.title}${answer.background ? ` · pozadí ${answer.background}` : ""}`);
if (answer.sentence) console.log(answer.sentence);
for (const note of answer.notes) console.log("   pozn.:", note);
for (const step of answer.trace.steps) console.log("  ", JSON.stringify(step));
if (answer.result?.ok) {
  const { buckets, series } = answer.result.data;
  for (const s of series) console.log(`   ${s.gate}:`, buckets.map((b, i) => `${b.label}=${s.values[i] ?? "–"}`).join(" "));
}
console.log(`   celkem ${answer.trace.total_ms} ms`);
