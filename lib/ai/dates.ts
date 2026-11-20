// Celé datum v aplikaci patří vždy do Europe/Prague. Nepoužíváme serverové či
// systémové časové pásmo ani pevný posun +1/+2 hodiny.
export const PRAGUE_TIME_ZONE = "Europe/Prague";

export function appNow(): Date {
  if (!process.env.APP_NOW) return new Date();
  const fixedNow = new Date(process.env.APP_NOW);
  if (Number.isNaN(fixedNow.getTime())) {
    throw new Error(`Neplatná hodnota APP_NOW: "${process.env.APP_NOW}"`);
  }
  return fixedNow;
}

export function pragueDate(at: Date): string {
  if (Number.isNaN(at.getTime())) {
    throw new Error("Neplatný datum pro výpočet dnešního dne");
  }
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: PRAGUE_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(at);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function addDays(date: string, days: number): string {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

export function formatCzDate(date: string): string {
  const [year, month, day] = date.split("-").map(Number);
  return `${day}. ${month}. ${year}`;
}

export function weekdayCz(date: string): string {
  return new Intl.DateTimeFormat("cs-CZ", { weekday: "long", timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`));
}

export function pragueTime(at: Date): string {
  return new Intl.DateTimeFormat("cs-CZ", { timeZone: "Europe/Prague", hour: "2-digit", minute: "2-digit" }).format(at);
}
