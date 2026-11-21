// Uložené odpovědi: každá jako data/answers/<id>.json, platí 7 dní (odkaz /a/<id>).
// Databázi nepoužíváme; aplikace běží na jednom stroji, takže stačí soubory.
import crypto from "crypto";
import { promises as fs } from "fs";
import path from "path";
import { z } from "zod";
import type { AskAnswer } from "./ai/types";

const DIR = path.join(process.cwd(), "data", "answers");
export const ANSWER_TTL_DAYS = 7;
const TTL_MS = ANSWER_TTL_DAYS * 24 * 3600 * 1000;
const ID = /^[A-Za-z0-9]{10}$/; // jen tohle smí do cesty k souboru (žádné ../)
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";

// Obal souboru. saved_at je skutečný čas uložení (ne „teď“ aplikace, které může být pevné kvůli demu).
const StoredFile = z.object({
  saved_at: z.string().refine((value) => !Number.isNaN(Date.parse(value))),
  answer: z.looseObject({ id: z.string(), question: z.string(), kind: z.enum(["answer", "unknown"]) }),
});

export function newId(): string {
  const bytes = crypto.randomBytes(10);
  return Array.from(bytes, (byte) => ALPHABET[byte % ALPHABET.length]).join("");
}

export function isAnswerId(id: string): boolean {
  return ID.test(id);
}

// Smaže odpovědi starší než 7 dní. Volá se při každém uložení.
export async function pruneAnswers(now = Date.now()): Promise<void> {
  let files: string[];
  try {
    files = await fs.readdir(DIR);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
    throw error;
  }
  for (const file of files) {
    if (!file.endsWith(".json")) continue;
    const filePath = path.join(DIR, file);
    const stat = await fs.stat(filePath).catch(() => null);
    if (stat && now - stat.mtimeMs > TTL_MS) await fs.unlink(filePath).catch(() => undefined);
  }
}

// Uloží odpověď a vrátí ji i s id. Když se uložit nepodaří, vrátí ji s id: null (odpověď se ukáže, jen bez odkazu).
export async function saveAnswer(answer: AskAnswer): Promise<AskAnswer> {
  const id = newId();
  const savedAt = Date.now();
  const saved: AskAnswer = { ...answer, id, expires_at: new Date(savedAt + TTL_MS).toISOString() };
  try {
    await fs.mkdir(DIR, { recursive: true });
    await fs.writeFile(path.join(DIR, `${id}.json`), JSON.stringify({ saved_at: new Date(savedAt).toISOString(), answer: saved }), "utf-8");
    await pruneAnswers();
    return saved;
  } catch {
    return { ...answer, id: null, expires_at: null };
  }
}

// Načte odpověď podle id. null = neexistuje, vypršela, nebo je soubor poškozený.
export async function loadAnswer(id: string, now = Date.now()): Promise<AskAnswer | null> {
  if (!isAnswerId(id)) return null;
  let raw: string;
  try {
    raw = await fs.readFile(path.join(DIR, `${id}.json`), "utf-8");
  } catch {
    return null;
  }
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return null;
  }
  const parsed = StoredFile.safeParse(json);
  if (!parsed.success || now - Date.parse(parsed.data.saved_at) > TTL_MS) return null;
  // Tvar jsme ověřili výše; soubor zapsal náš vlastní saveAnswer.
  return parsed.data.answer as AskAnswer;
}
