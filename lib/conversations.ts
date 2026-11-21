// Konverzace: až 10 navazujících otázek pod jedním odkazem (/c/<id>), platí 7 dní od poslední otázky.
// Soubor data/conversations/<id>.json drží jen id odpovědí; samotné odpovědi jsou v data/answers/ (lib/answers.ts).
import { promises as fs } from "fs";
import path from "path";
import { z } from "zod";
import type { AskAnswer } from "./ai/types";
import { ANSWER_TTL_DAYS, isAnswerId, loadAnswer, newId } from "./answers";

const DIR = path.join(process.cwd(), "data", "conversations");
const TTL_MS = ANSWER_TTL_DAYS * 24 * 3600 * 1000;
export const MAX_TURNS = 10;
// Kolik předchozích odpovědí dostane Claude jako kontext k nové otázce.
export const CONTEXT_TURNS = 2;

const StoredConversation = z.object({
  saved_at: z.string().refine((value) => !Number.isNaN(Date.parse(value))),
  answers: z.array(z.string().refine(isAnswerId)).max(MAX_TURNS),
});

export type Conversation = { id: string; expires_at: string; answers: AskAnswer[] };

async function readIds(id: string, now: number): Promise<{ savedAt: number; ids: string[] } | null> {
  if (!isAnswerId(id)) return null;
  try {
    const parsed = StoredConversation.safeParse(JSON.parse(await fs.readFile(path.join(DIR, `${id}.json`), "utf-8")));
    if (!parsed.success) return null;
    const savedAt = Date.parse(parsed.data.saved_at);
    return now - savedAt > TTL_MS ? null : { savedAt, ids: parsed.data.answers };
  } catch {
    return null;
  }
}

// Načte konverzaci i s odpověďmi. Odpovědi, které už vypršely, vynechá. null = neexistuje nebo vypršela.
export async function loadConversation(id: string, now = Date.now()): Promise<Conversation | null> {
  const stored = await readIds(id, now);
  if (!stored) return null;
  const answers = (await Promise.all(stored.ids.map((answerId) => loadAnswer(answerId, now)))).filter((a): a is AskAnswer => a !== null);
  if (answers.length === 0) return null;
  return { id, expires_at: new Date(stored.savedAt + TTL_MS).toISOString(), answers };
}

// Id pro novou konverzaci (stejný tvar jako id odpovědi).
export const newConversationId = newId;

// Přidá uloženou odpověď do konverzace; když ještě neexistuje, založí ji s tímhle id. false = uložit se nepodařilo.
export async function appendAnswer(conversationId: string, answerId: string, now = Date.now()): Promise<boolean> {
  if (!isAnswerId(conversationId)) return false;
  const existing = await readIds(conversationId, now);
  const ids = [...(existing?.ids ?? []), answerId].slice(-MAX_TURNS);
  try {
    await fs.mkdir(DIR, { recursive: true });
    await fs.writeFile(path.join(DIR, `${conversationId}.json`), JSON.stringify({ saved_at: new Date(now).toISOString(), answers: ids }), "utf-8");
    return true;
  } catch {
    return false;
  }
}

// Vymění odpověď v konverzaci (uložený vzhled z editoru je nová odpověď s novým id).
export async function replaceAnswer(conversationId: string, oldId: string, newAnswerId: string, now = Date.now()): Promise<boolean> {
  const existing = await readIds(conversationId, now);
  if (!existing || !existing.ids.includes(oldId)) return false;
  const ids = existing.ids.map((answerId) => (answerId === oldId ? newAnswerId : answerId));
  await fs.writeFile(path.join(DIR, `${conversationId}.json`), JSON.stringify({ saved_at: new Date(now).toISOString(), answers: ids }), "utf-8");
  return true;
}
