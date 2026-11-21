import { loadAnswer, saveAnswer } from "@/lib/answers";
import { ChartViewSchema } from "@/lib/view";

// POST /api/answers/<id>/variant s tělem { view }: uloží KOPII odpovědi s upraveným vzhledem (nové id, 7 dní).
// Čísla se berou z uloženého souboru na serveru, ne od prohlížeče, takže úpravou vzhledu nejde podvrhnout data.
// Původní odkaz zůstává beze změny.
export async function POST(request: Request, ctx: RouteContext<"/api/answers/[id]/variant">) {
  const { id } = await ctx.params;
  const original = await loadAnswer(id);
  if (!original?.result?.ok) {
    return Response.json({ ok: false, error: "Odpověď neexistuje, vypršela, nebo nemá data." }, { status: 404 });
  }
  const body: unknown = await request.json().catch(() => null);
  const parsed = ChartViewSchema.safeParse(body && typeof body === "object" && "view" in body ? body.view : undefined);
  if (!parsed.success) {
    return Response.json({ ok: false, error: "Neplatný vzhled grafu." }, { status: 400 });
  }
  const saved = await saveAnswer({ ...original, id: null, expires_at: null, view: parsed.data });
  if (!saved.id) return Response.json({ ok: false, error: "Odpověď se nepodařilo uložit." }, { status: 500 });
  return Response.json({ ok: true, ...saved });
}
