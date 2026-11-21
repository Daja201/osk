import { loadAnswer } from "@/lib/answers";

// GET /api/answers/<id>: uložená odpověď jako JSON (platí 7 dní). Stejná data jako na stránce /a/<id>.
export async function GET(_request: Request, ctx: RouteContext<"/api/answers/[id]">) {
  const { id } = await ctx.params;
  const answer = await loadAnswer(id);
  if (!answer) {
    return Response.json({ ok: false, error: "Odpověď neexistuje nebo vypršela (odkazy platí 7 dní)." }, { status: 404 });
  }
  return Response.json({ ok: true, ...answer });
}
