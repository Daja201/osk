import Anthropic from "@anthropic-ai/sdk";
import { ask } from "@/lib/ai/ask";
import { saveAnswer } from "@/lib/answers";
import { CONTEXT_TURNS, MAX_TURNS, appendAnswer, loadConversation, newConversationId } from "@/lib/conversations";
import { appNow } from "@/lib/ai/dates";
import { ChartViewSchema, carryView } from "@/lib/view";
import { trafficSeries } from "@/lib/citiq/series";
import { weatherSeries } from "@/lib/citiq/weatherSeries";
import { checkAskRateLimit, clientIp } from "@/lib/askRateLimit";

const MAX_QUESTION_LENGTH = 300;

async function handle(question: unknown, conversationId: unknown, request: Request, view: unknown = null): Promise<Response> {
  if (typeof question !== "string" || question.trim() === "" || question.length > MAX_QUESTION_LENGTH) {
    return Response.json(
      { ok: false, error: `Otázka musí být text o délce 1–${MAX_QUESTION_LENGTH} znaků.` },
      { status: 400 },
    );
  }

  const limit = checkAskRateLimit(clientIp(request));
  if (!limit.allowed) {
    return Response.json(
      { ok: false, error: "Příliš mnoho požadavků. Zkuste to prosím později." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
    );
  }

  // Navazující otázka: konverzace musí existovat a mít méně než 10 otázek. Neplatná / vypršelá = nová konverzace.
  const conversation = typeof conversationId === "string" ? await loadConversation(conversationId) : null;
  if (conversation && conversation.answers.length >= MAX_TURNS) {
    return Response.json({ ok: false, error: `Konverzace má nejvýš ${MAX_TURNS} otázek. Začněte novou.` }, { status: 409 });
  }

  const now = appNow();
  const answer = await ask(question.trim(), {
    context: conversation?.answers.slice(-CONTEXT_TURNS) ?? [],
    // Klíč si SDK vezme z ANTHROPIC_API_KEY; Next načítá .env automaticky.
    client: new Anthropic({ maxRetries: 3, timeout: 30_000 }),
    model: process.env.CLAUDE_MODEL ?? "claude-haiku-5-5",
    now,
    // Výpočet z dat CITIQ (přes cache v data/cache/), se stejným „teď“ jako prompt.
    trafficSeries: (params) => trafficSeries(params, { now }),
    weatherSeries: (params) => weatherSeries(params, { now }),
  });
  // Navazující odpověď staví na vzhledu předchozí (barvy, osa, QR z editoru; i neuložený vzhled z prohlížeče).
  const before = conversation?.answers.at(-1) ?? null;
  const parsedView = ChartViewSchema.safeParse(view);
  const previousView = parsedView.success ? parsedView.data : (before?.view ?? null);
  if (before && previousView) answer.view = carryView(previousView, before, answer);

  // Každou odpověď uložíme na 7 dní a přidáme do konverzace (odkaz /c/<id>). „Nevím“ je platná odpověď, proto vždy 200.
  const conversationIdToUse = conversation?.id ?? newConversationId();
  const saved = await saveAnswer({ ...answer, conversation_id: conversationIdToUse });
  const added = saved.id ? await appendAnswer(conversationIdToUse, saved.id) : false;
  return Response.json({ ok: true, ...saved, conversation_id: added ? conversationIdToUse : null });
}

// GET /api/ask?q=…&c=<konverzace> pro rychlé zkoušení v prohlížeči
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  return handle(params.get("q"), params.get("c"), request);
}

// POST /api/ask s tělem { "question": "…", "conversation_id": "…", "view": {…} } pro stránku (id a vzhled nepovinné)
export async function POST(request: Request) {
  const body: unknown = await request.json().catch(() => null);
  const question = body && typeof body === "object" && "question" in body ? body.question : undefined;
  const conversationId = body && typeof body === "object" && "conversation_id" in body ? body.conversation_id : undefined;
  const view = body && typeof body === "object" && "view" in body ? body.view : null;
  return handle(question, conversationId, request, view);
}
