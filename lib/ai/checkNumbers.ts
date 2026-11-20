// Kontrola čísel (SPEC §8.4): každé číslo v Claudově větě musí být v seznamu povolených.

const MONTHS =
  "ledna|února|března|dubna|května|června|července|srpna|září|října|listopadu|prosince";

export function extractNumbers(text: string): number[] {
  const numbers: number[] = [];
  // 1) neobvyklé mezery (NBSP, úzká NBSP, tenká mezera) → obyčejná mezera
  let rest = text.replace(/[   ]/g, " ");

  const take = (pattern: RegExp, toNumbers: (match: RegExpMatchArray) => number[]) => {
    rest = rest.replace(pattern, (...args) => {
      numbers.push(...toNumbers(args as unknown as RegExpMatchArray));
      return " ";
    });
  };

  // 2) data „19. 11. 2026“ a „19.11.2026“
  take(/\b(\d{1,2})\.\s?(\d{1,2})\.\s?(\d{4})\b/g, (m) => [Number(m[1]), Number(m[2]), Number(m[3])]);
  // 3) „19. listopadu“
  take(new RegExp(`\\b(\\d{1,2})\\.\\s?(?:${MONTHS})`, "g"), (m) => [Number(m[1])]);
  // 4) časy „16:00“, minuty jiné než 00 jsou další číslo
  take(/\b(\d{1,2}):(\d{2})\b/g, (m) => (m[2] === "00" ? [Number(m[1])] : [Number(m[1]), Number(m[2])]));
  // 5) tisíce „12 345“
  take(/\b\d{1,3}(?: \d{3})+\b/g, (m) => [Number(m[0].replace(/ /g, ""))]);
  // 6) desetinná čísla „12,3“ nebo „12.3“
  take(/\b(\d+)[,.](\d+)\b/g, (m) => [Number(`${m[1]}.${m[2]}`)]);
  // 7) zbylá celá čísla
  take(/\b\d+\b/g, (m) => [Number(m[0])]);

  return numbers;
}

export function checkNumbers(text: string, allowed: Set<number>) {
  const numbers = extractNumbers(text);
  const rounded = new Set([...allowed].map((value) => Math.round(value * 10) / 10));
  const notAllowed = numbers.filter((value) =>
    Number.isInteger(value) ? !allowed.has(value) : !rounded.has(Math.round(value * 10) / 10),
  );
  return { passed: notAllowed.length === 0, numbers, not_allowed: notAllowed };
}
