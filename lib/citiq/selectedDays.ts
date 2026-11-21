import { utcStartOfPragueDay } from "./cache";

type SelectedDaysResult =
  | { dates: null; error: null }
  | { dates: string[]; error: null }
  | { dates: null; error: { code: string; message: string } };

function nextDate(date: string): string {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + 1)).toISOString().slice(0, 10);
}

export function validateSelectedDays(
  input: string[] | undefined,
  fromMs: number,
  toMs: number,
  today: string,
): SelectedDaysResult {
  if (!input?.length) return { dates: null, error: null };
  if (input.length > 31) {
    return { dates: null, error: { code: "RANGE_TOO_LONG", message: "Najednou umím nejvýš 31 vybraných dní." } };
  }
  if (new Set(input).size !== input.length) {
    return { dates: null, error: { code: "BAD_PARAMS", message: "Vybrané dny se nesmí opakovat." } };
  }

  const dates = [...input].sort();
  let firstDayStart: number;
  let lastDayEnd: number;
  try {
    firstDayStart = utcStartOfPragueDay(dates[0]).getTime();
    lastDayEnd = utcStartOfPragueDay(nextDate(dates.at(-1)!)).getTime();
    for (const date of dates) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("Neplatný tvar data.");
      utcStartOfPragueDay(date);
      if (date > today) {
        return { dates: null, error: { code: "FUTURE", message: "Na budoucnost data nemám. Zkuste vybrat jen dny, které už proběhly." } };
      }
    }
  } catch {
    return { dates: null, error: { code: "BAD_PARAMS", message: "Vybrané dny musí být platná data ve tvaru YYYY-MM-DD." } };
  }

  if (firstDayStart !== fromMs || lastDayEnd !== toMs) {
    return {
      dates: null,
      error: {
        code: "BAD_RANGE",
        message: "Při výběru jednotlivých dnů musí rozsah from/to začínat o půlnoci prvního a končit o půlnoci po posledním dni.",
      },
    };
  }
  return { dates, error: null };
}
