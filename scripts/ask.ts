// Položí jednu otázku stejně jako /api/ask a vypíše odpověď a trace.
// Spuštění: npm run ask -- "Kolik aut projelo včera u Billy?"
// Reálná data bez úpravy .env.local: DATA_SOURCE=real npm run ask -- "…"
import Anthropic from "@anthropic-ai/sdk";
import { ask } from "../lib/ai/ask";
import { appNow } from "../lib/ai/dates";
import { dataMode, getTrafficCount } from "../lib/ai/registry";

const question = process.argv.slice(2).join(" ").trim();
if (!question) {
  console.error('Použití: npm run ask -- "otázka"');
  process.exit(1);
}

const answer = await ask(question, {
  client: new Anthropic({ maxRetries: 3, timeout: 30_000 }),
  model: process.env.CLAUDE_MODEL ?? "claude-haiku-5-5",
  now: appNow(),
  mode: dataMode(),
  trafficCount: await getTrafficCount(),
});

console.log(`[${answer.trace.mode}] ${answer.kind} (${answer.sentence_source}${answer.reason ? `, ${answer.reason.code}` : ""})`);
console.log(answer.sentence);
for (const step of answer.trace.steps) console.log("  ", JSON.stringify(step));
if (answer.result?.ok) console.log("   hourly:", JSON.stringify(answer.result.data.hourly));
console.log(`   celkem ${answer.trace.total_ms} ms`);
