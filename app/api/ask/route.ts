import Anthropic from "@anthropic-ai/sdk";
import { ask } from "@/lib/ai/ask";
import { saveAnswer } from "@/lib/answers";
import { appNow } from "@/lib/ai/dates";
import { trafficSeries } from "@/lib/citiq/series";

const MAX_QUESTION_LENGTH = 300;

async function handle(question: unknown): Promise<Response> {
  if (typeof question !== "string" || question.trim() === "" || question.length > MAX_QUESTION_LENGTH) {
    return Response.json(
      { ok: false, error: `Otázka musí být text o délce 1–${MAX_QUESTION_LENGTH} znaků.` },
      { status: 400 },
    );
  }

  const now = appNow();
  const answer = await ask(question.trim(), {
    // Klíč si SDK vezme z ANTHROPIC_API_KEY; Next načítá .env automaticky.
    client: new Anthropic({ maxRetries: 3, timeout: 30_000 }),
    model: process.env.CLAUDE_MODEL ?? "claude-haiku-5-5",
    now,
    // Výpočet z dat CITIQ (přes cache v data/cache/), se stejným „teď“ jako prompt.
    trafficSeries: (params) => trafficSeries(params, { now }),
  });
  // Každou odpověď uložíme na 7 dní, aby šla sdílet odkazem /a/<id>. „Nevím“ je platná odpověď, proto vždy 200.
  const saved = await saveAnswer(answer);
  return Response.json({ ok: true, ...saved });
}

// GET /api/ask?q=… pro rychlé zkoušení v prohlížeči
export async function GET(request: Request) {
  return handle(new URL(request.url).searchParams.get("q"));
}

// POST /api/ask s tělem { "question": "…" } pro stránku
export async function POST(request: Request) {
  const body: unknown = await request.json().catch(() => null);
  const question = body && typeof body === "object" && "question" in body ? body.question : undefined;
  return handle(question);
}
