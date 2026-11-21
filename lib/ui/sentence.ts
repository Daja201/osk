// Rozdělení věty na úseky pro tabuli s odpovědí. Testy jsou v tests/sentence.test.ts.
//
// Které číslo je „ověřené“ (žluté podtržení), rozhoduje kód podle výsledku výpočtu:
// součet, špička, hodiny špičky… Data a názvy ulic („17. listopadu“) se nepodtrhávají,
// i když v nich je číslo, které náhodou odpovídá třeba hodině špičky.

const MONTHS = "ledna|února|března|dubna|května|června|července|srpna|září|října|listopadu|prosince";
const SPACE = "[ \\u00A0\\u202F\\u2009]";

// Pořadí alternativ = priorita (stejně jako v lib/ai/checkNumbers.ts):
// datum, „19. listopadu“, čas, tisíce, desetinné číslo, celé číslo.
const TOKEN = new RegExp(
  [
    `(?<date>\\b\\d{1,2}\\.${SPACE}?\\d{1,2}\\.${SPACE}?\\d{4}\\b|\\b\\d{1,2}\\.${SPACE}?(?:${MONTHS}))`,
    `(?<time>\\b\\d{1,2}:\\d{2}\\b)`,
    `(?<number>\\b\\d{1,3}(?:${SPACE}\\d{3})+\\b|\\b\\d+,\\d+\\b|\\b\\d+\\b)`,
  ].join("|"),
  "g",
);

export type NumberToken = {
  text: string;
  value: number;
  start: number;
  end: number;
  kind: "date" | "time" | "number";
};

export function findNumbers(sentence: string): NumberToken[] {
  return [...sentence.matchAll(TOKEN)].map((match) => {
    const text = match[0];
    const kind = match.groups?.date ? "date" : match.groups?.time ? "time" : "number";
    const value =
      kind === "time"
        ? Number(text.split(":")[0])
        : kind === "date"
          ? Number(text.split(".")[0])
          : Number(text.replace(/\s/g, "").replace(",", "."));
    return { text, value, start: match.index, end: match.index + text.length, kind };
  });
}

export type Segment = { type: "text" | "verified" | "main"; text: string };

export type SentenceParts =
  // Hlavní číslo ve větě je: tři řádky (před číslem, číslo + slovo za ním, zbytek).
  | { layout: "big"; before: Segment[]; main: string; wordAfter: string; after: Segment[] }
  // Hlavní číslo ve větě není: celá věta jedním písmem.
  | { layout: "plain"; segments: Segment[] };

export function splitSentence(sentence: string, mainValue: number | null, verified: number[]): SentenceParts {
  const allowed = new Set(verified);
  const segments: Segment[] = [];
  let cursor = 0;
  let mainFound = false;
  const pushText = (text: string) => {
    if (text) segments.push({ type: "text", text });
  };

  for (const token of findNumbers(sentence)) {
    if (token.kind === "date") continue;
    const isMain = !mainFound && token.kind === "number" && token.value === mainValue;
    if (!isMain && !allowed.has(token.value)) continue;
    pushText(sentence.slice(cursor, token.start));
    segments.push({ type: isMain ? "main" : "verified", text: token.text });
    if (isMain) mainFound = true;
    cursor = token.end;
  }
  pushText(sentence.slice(cursor));

  const mainIndex = segments.findIndex((segment) => segment.type === "main");
  if (mainIndex === -1) return { layout: "plain", segments };

  const before = segments.slice(0, mainIndex);
  const after = segments.slice(mainIndex + 1);
  // První slovo za číslem („aut,“) jde na stejný řádek jako číslo.
  let wordAfter = "";
  const [next] = after;
  if (next?.type === "text") {
    const match = next.text.match(/^\s*(\S+)\s*/);
    if (match) {
      wordAfter = match[1];
      const rest = next.text.slice(match[0].length);
      after.splice(0, 1, ...(rest ? [{ type: "text" as const, text: rest }] : []));
    }
  }
  if (before.length > 0) {
    const last = before[before.length - 1];
    if (last.type === "text") last.text = last.text.trimEnd();
  }
  return { layout: "big", before, main: segments[mainIndex].text, wordAfter, after };
}

// Věta rozdělená na text a čísla (včetně dat a časů). Pro pruh s odpovědí v detailech,
// kde se dá na každé číslo kliknout a zjistit, odkud je.
export type Piece = { type: "text"; text: string } | { type: "number"; token: NumberToken };

export function piecesOf(sentence: string): Piece[] {
  const pieces: Piece[] = [];
  let cursor = 0;
  for (const token of findNumbers(sentence)) {
    if (token.start > cursor) pieces.push({ type: "text", text: sentence.slice(cursor, token.start) });
    pieces.push({ type: "number", token });
    cursor = token.end;
  }
  if (cursor < sentence.length) pieces.push({ type: "text", text: sentence.slice(cursor) });
  return pieces;
}
