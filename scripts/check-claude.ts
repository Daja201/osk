// Ověří, že API klíč a model z .env.local fungují. Klíč nikdy nevypisuje.
// Spuštění: node --env-file=.env.local --import tsx scripts/check-claude.ts
import Anthropic from "@anthropic-ai/sdk";

const model = process.env.CLAUDE_MODEL;
if (!process.env.ANTHROPIC_API_KEY) {
  console.error("ANTHROPIC_API_KEY není nastavený (chybí v .env.local?)");
  process.exit(1);
}
if (!model) {
  console.error("CLAUDE_MODEL není nastavený");
  process.exit(1);
}

const client = new Anthropic();

try {
  // 1) Které modely tvůj klíč vidí (jen Haiku a Sonnet, ty nás zajímají).
  const ids: string[] = [];
  for await (const m of client.models.list()) {
    if (/haiku|sonnet/.test(m.id)) ids.push(m.id);
  }
  console.log("Dostupné Haiku/Sonnet modely:", ids.join(", "));
  if (!ids.includes(model)) {
    console.error(
      `Model "${model}" v seznamu není. Uprav CLAUDE_MODEL v .env.local.`,
    );
    process.exit(1);
  }

  // 2) Jedna krátká zpráva.
  const response = await client.messages.create({
    model,
    max_tokens: 2048,
    messages: [{ role: "user", content: "Odpověz jedním slovem: ahoj" }],
  });
  const text = response.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("");
  console.log("Model:", response.model);
  console.log("stop_reason:", response.stop_reason);
  console.log("Odpověď:", text);
  console.log(
    "Tokeny in/out:",
    response.usage.input_tokens,
    response.usage.output_tokens,
  );
} catch (error) {
  if (error instanceof Anthropic.AuthenticationError) {
    console.error("Klíč je neplatný (401).");
  } else if (error instanceof Anthropic.PermissionDeniedError) {
    console.error("Klíč nemá přístup (403), zkontroluj kredit/workspace.");
  } else if (error instanceof Anthropic.APIError) {
    console.error(`API chyba ${error.status}:`, error.message);
  } else {
    throw error;
  }
  process.exit(1);
}
