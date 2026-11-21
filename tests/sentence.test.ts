import { describe, expect, it } from "vitest";
import { findNumbers, piecesOf, splitSentence } from "../lib/ui/sentence";

const SENTENCE = "Včera projelo ulicí 17. listopadu 15 325 aut, nejvíc jich jelo mezi 7. a 8. hodinou ráno (1 318).";
// Ověřená čísla: součet, špička, hodiny špičky
const VERIFIED = [15325, 1318, 7, 8];

describe("findNumbers", () => {
  it("najde data, časy, tisíce i obyčejná čísla s pozicemi", () => {
    const tokens = findNumbers("Billa, 19. 11. 2026: 1 845 vozidel, nejvíc mezi 19:00 a 20:00 (137).");
    expect(tokens.map((t) => [t.text, t.kind, t.value])).toEqual([
      ["19. 11. 2026", "date", 19],
      ["1 845", "number", 1845],
      ["19:00", "time", 19],
      ["20:00", "time", 20],
      ["137", "number", 137],
    ]);
    expect(tokens[1]).toMatchObject({ start: 21, end: 26 });
  });

  it("„17. listopadu“ je název (datum), ne číslo", () => {
    expect(findNumbers("ulicí 17. listopadu")[0].kind).toBe("date");
  });
});

describe("splitSentence", () => {
  it("rozdělí větu na tři řádky kolem hlavního čísla", () => {
    const parts = splitSentence(SENTENCE, 15325, VERIFIED);
    expect(parts.layout).toBe("big");
    if (parts.layout !== "big") return;
    expect(parts.before).toEqual([{ type: "text", text: "Včera projelo ulicí 17. listopadu" }]);
    expect(parts.main).toBe("15 325");
    expect(parts.wordAfter).toBe("aut,");
    expect(parts.after.map((s) => s.type)).toEqual(["text", "verified", "text", "verified", "text", "verified", "text"]);
    expect(parts.after.filter((s) => s.type === "verified").map((s) => s.text)).toEqual(["7", "8", "1 318"]);
    expect(parts.after[0].text).toBe("nejvíc jich jelo mezi ");
  });

  it("čísla v názvu ulice a v datu se nepodtrhávají, ani když se shodují s hodinou špičky", () => {
    const parts = splitSentence("Billa, 19. 11. 2026: 1 845 vozidel, nejvíc mezi 19:00 a 20:00.", 1845, [1845, 19, 20]);
    if (parts.layout !== "big") throw new Error("čekal jsem velké číslo");
    expect(parts.before).toEqual([{ type: "text", text: "Billa, 19. 11. 2026:" }]);
    expect(parts.after.filter((s) => s.type === "verified").map((s) => s.text)).toEqual(["19:00", "20:00"]);
  });

  it("číslo, které kód nespočítal, zůstane obyčejným textem", () => {
    const parts = splitSentence("Projelo 640 aut, asi 3 kamiony.", 640, [640]);
    if (parts.layout !== "big") throw new Error("čekal jsem velké číslo");
    expect(parts.after).toEqual([{ type: "text", text: "asi 3 kamiony." }]);
  });

  it("bez hlavního čísla ve větě vrátí celou větu s podtrženými čísly", () => {
    const parts = splitSentence("Nejvíc aut jelo mezi 7:00 a 8:00.", 15325, VERIFIED);
    expect(parts.layout).toBe("plain");
    if (parts.layout !== "plain") return;
    expect(parts.segments.map((s) => s.type)).toEqual(["text", "verified", "text", "verified", "text"]);
  });

  it("hlavní číslo na začátku věty: žádný první řádek", () => {
    const parts = splitSentence("1 845 vozidel projelo včera.", 1845, [1845]);
    if (parts.layout !== "big") throw new Error("čekal jsem velké číslo");
    expect(parts.before).toEqual([]);
    expect(parts.wordAfter).toBe("vozidel");
    expect(parts.after).toEqual([{ type: "text", text: "projelo včera." }]);
  });
});

describe("piecesOf", () => {
  it("střídá text a čísla, nic se neztratí", () => {
    const pieces = piecesOf(SENTENCE);
    expect(pieces.map((p) => (p.type === "text" ? p.text : p.token.text)).join("")).toBe(SENTENCE);
    expect(pieces.filter((p) => p.type === "number").map((p) => (p.type === "number" ? p.token.text : ""))).toEqual([
      "17. listopadu",
      "15 325",
      "7",
      "8",
      "1 318",
    ]);
  });
});
