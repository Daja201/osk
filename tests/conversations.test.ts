// Konverzace (lib/conversations.ts). Soubory jdou do dočasné složky, ne do repa.
import { promises as fs } from "fs";
import os from "os";
import path from "path";
import { describe, expect, it, vi } from "vitest";
import type { AskAnswer } from "../lib/ai/types";

const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "osk-conversations-"));
vi.spyOn(process, "cwd").mockReturnValue(tmp);
const { saveAnswer } = await import("../lib/answers");
const { MAX_TURNS, appendAnswer, loadConversation, newConversationId, replaceAnswer } = await import("../lib/conversations");

const answer = (question: string): AskAnswer => ({
  id: null,
  expires_at: null,
  question,
  created_at: "2026-11-20T10:00:00.000Z",
  kind: "unknown",
  format: null,
  title: null,
  background: null,
  sentence: "Na tohle odpověď nemám.",
  sentence_source: "fixed",
  reason: { code: "OUT_OF_SCOPE", message: "" },
  spec: null,
  result: null,
  notes: [],
  view: null,
  trace: { model: "test", now: "2026-11-20T10:00:00.000Z", steps: [], total_ms: 1 },
});

async function saved(question: string): Promise<string> {
  const { id } = await saveAnswer(answer(question));
  if (!id) throw new Error("uložení selhalo");
  return id;
}

describe("konverzace", () => {
  it("první odpověď založí konverzaci, další se přidají pod stejné id", async () => {
    const id = newConversationId();
    expect(await appendAnswer(id, await saved("první"))).toBe(true);
    expect(await appendAnswer(id, await saved("druhá"))).toBe(true);
    const conversation = await loadConversation(id);
    expect(conversation?.answers.map((a) => a.question)).toEqual(["první", "druhá"]);
    expect(Date.parse(conversation?.expires_at ?? "") - Date.now()).toBeGreaterThan(6.9 * 24 * 3600 * 1000);
  });

  it("neznámé, neplatné a vypršelé id → null; neplatné id se nezapíše", async () => {
    expect(await loadConversation("../etc/pas")).toBeNull();
    expect(await loadConversation("AAAAAAAAAA")).toBeNull();
    expect(await appendAnswer("../etc/pas", await saved("x"))).toBe(false);
    const id = newConversationId();
    await appendAnswer(id, await saved("y"));
    expect(await loadConversation(id, Date.now() + 8 * 24 * 3600 * 1000)).toBeNull();
  });

  it(`drží nejvýš ${MAX_TURNS} odpovědí; vzhled z editoru vymění odpověď na místě`, async () => {
    const id = newConversationId();
    for (let i = 1; i <= MAX_TURNS + 1; i++) await appendAnswer(id, await saved(`otázka ${i}`));
    const conversation = await loadConversation(id);
    expect(conversation?.answers).toHaveLength(MAX_TURNS);
    const second = conversation?.answers[1].id ?? "";
    const variant = await saved("otázka 3 (vlastní vzhled)");
    expect(await replaceAnswer(id, second, variant)).toBe(true);
    expect((await loadConversation(id))?.answers[1].question).toBe("otázka 3 (vlastní vzhled)");
  });
});
