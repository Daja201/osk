import type Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it } from "vitest";
import { ask, type AskDeps } from "../lib/ai/ask";
import type { TrafficCountParams, TrafficCountResult } from "../lib/citiq/traffic";

// Falešný Claude: vrací předem připravené odpovědi popořadě a pamatuje si, co dostal.
function fakeClient(responses: Partial<Anthropic.Message>[]) {
  const calls: Anthropic.MessageCreateParamsNonStreaming[] = [];
  return {
    calls,
    messages: {
      async create(params: Anthropic.MessageCreateParamsNonStreaming) {
        calls.push(structuredClone(params));
        const next = responses.shift();
        if (!next) throw new Error("došly připravené odpovědi");
        return { usage: { input_tokens: 10, output_tokens: 5 }, ...next } as Anthropic.Message;
      },
    },
  };
}

const toolUse = (input: object): Partial<Anthropic.Message> => ({
  stop_reason: "tool_use",
  content: [
    { type: "thinking", thinking: "", signature: "sig" },
    { type: "tool_use", id: "tu_1", name: "traffic_count", input, caller: { type: "direct" } },
  ] as Anthropic.ContentBlock[],
});
const text = (value: string): Partial<Anthropic.Message> => ({
  stop_reason: "end_turn",
  content: [{ type: "text", text: value, citations: null }] as Anthropic.ContentBlock[],
});

const hourly = Array.from({ length: 24 }, (_, hour) => (hour === 3 ? null : hour === 16 ? 100 : 10));
async function fakeTraffic(params: TrafficCountParams): Promise<TrafficCountResult> {
  if (params.gate === "Zikova") return { ok: false, error: { code: "NO_DATA", message: "Čidlo Zikova za 19. 11. neposlalo data.", suggestions: [] } };
  return {
    ok: true,
    data: { total: 320, hourly },
    meta: {
      tool: "traffic_count",
      params,
      period_local: "",
      period_utc: ["", ""],
      coverage: { hours: 23, of: 24 },
      source_url: "",
      fetched_at: "",
      notes: [],
    },
  };
}

function deps(client: ReturnType<typeof fakeClient>): AskDeps {
  return { client, model: "test", now: new Date("2026-11-20T18:00:00Z"), mode: "mock", trafficCount: fakeTraffic };
}

const input = { gate: "17.listopadu JIH", direction: "in", date: "2026-11-19", date_assumed: false };

describe("ask", () => {
  it("nástroj → odpověď s Claudovou větou, která prošla kontrolou", async () => {
    const client = fakeClient([toolUse(input), text("19. 11. 2026 projelo branou 17.listopadu JIH 320 vozidel, nejvíc mezi 16:00 a 17:00 (100).")]);
    const answer = await ask("Kolik aut včera?", deps(client));
    expect(answer.kind).toBe("answer");
    expect(answer.sentence_source).toBe("ai");
    // obsah asistenta (včetně thinking bloku) se poslal zpět beze změny
    expect(client.calls[1].messages[1]).toEqual({ role: "assistant", content: toolUse(input).content });
  });

  it("bez nástroje → OUT_OF_SCOPE s pevnou větou", async () => {
    const answer = await ask("Kdo vyhraje ligu?", deps(fakeClient([text("Sparta.")])));
    expect(answer.kind).toBe("unknown");
    expect(answer.reason?.code).toBe("OUT_OF_SCOPE");
    expect(answer.sentence).not.toContain("Sparta");
  });

  it("číslo navíc ve větě → věta složená kódem", async () => {
    const answer = await ask("?", deps(fakeClient([toolUse(input), text("Projelo 320 vozidel, průměrně 14 za hodinu.")])));
    expect(answer.sentence_source).toBe("fallback");
    expect(answer.sentence).toContain("320");
  });

  it("ok: false → nevím s důvodem z dat", async () => {
    const answer = await ask("?", deps(fakeClient([toolUse({ ...input, gate: "Zikova" }), text("Čidlo neposlalo data.")])));
    expect(answer.kind).toBe("unknown");
    expect(answer.reason?.code).toBe("NO_DATA");
  });

  it("budoucnost → BAD_PARAMS, datová funkce se nezavolá", async () => {
    const answer = await ask("?", deps(fakeClient([toolUse({ ...input, date: "2026-11-21" }), text("Na budoucnost data nemám.")])));
    expect(answer.reason?.code).toBe("BAD_PARAMS");
  });

  it("both → součet obou směrů spočítá kód", async () => {
    const answer = await ask("?", deps(fakeClient([toolUse({ ...input, direction: "both" }), text("Projelo 640 vozidel.")])));
    expect(answer.result?.ok && answer.result.data.total).toBe(640);
  });

  it("skupina bran + both → kód sečte 2 brány × 2 směry", async () => {
    const group = { ...input, gate: "17. listopadu (obě brány)", direction: "both" };
    const answer = await ask("?", deps(fakeClient([toolUse(group), text("Projelo 1280 vozidel.")])));
    expect(answer.result?.ok && answer.result.data.total).toBe(1280);
    expect(answer.sentence_source).toBe("ai");
  });

  it("date_assumed → předpoklad v odpovědi", async () => {
    const answer = await ask("?", deps(fakeClient([toolUse({ ...input, date_assumed: true }), text("Projelo 320 vozidel.")])));
    expect(answer.assumptions).toHaveLength(1);
  });

  it("markdown se odstraní", async () => {
    const answer = await ask("?", deps(fakeClient([toolUse(input), text("**Projelo** 320 vozidel.\n- celkem")])));
    expect(answer.sentence).toBe("Projelo 320 vozidel. celkem");
  });
});
