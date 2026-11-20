// Pražské datum a čas bez knihovny. Počítáme jen s celými dny (YYYY-MM-DD),
// takže změna času nevadí.

export function appNow(): Date {
  return process.env.APP_NOW ? new Date(process.env.APP_NOW) : new Date();
}

export function pragueDate(at: Date): string {
  // en-CA formátuje jako YYYY-MM-DD
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Prague" }).format(at);
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
