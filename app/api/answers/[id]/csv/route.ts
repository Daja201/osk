import { loadAnswer } from "@/lib/answers";
import { seriesCsv } from "@/lib/csv";

// GET /api/answers/<id>/csv: data uložené odpovědi jako CSV (otevře se v Excelu).
export async function GET(_request: Request, ctx: RouteContext<"/api/answers/[id]/csv">) {
  const { id } = await ctx.params;
  const answer = await loadAnswer(id);
  if (!answer?.result?.ok) {
    return new Response("Odpověď neexistuje, vypršela, nebo nemá data.", { status: 404, headers: { "content-type": "text/plain; charset=utf-8" } });
  }
  return new Response(seriesCsv(answer.result), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="osk-${id}.csv"`,
    },
  });
}
