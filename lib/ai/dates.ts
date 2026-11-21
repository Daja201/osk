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

export function formatSelectedPeriod(startIso: string, endIso: string, dates?: string[]): string {
  if (!dates?.length) return formatPeriod(startIso, endIso);
  const labels = dates.map((date) => `${weekdayCz(date)} ${formatCzDate(date)}`);
  if (labels.length === 1) return labels[0];
  return `${labels.slice(0, -1).join(", ")} a ${labels.at(-1)}`;
}

export function weekdayCz(date: string): string {
  return new Intl.DateTimeFormat("cs-CZ", { weekday: "long", timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`));
}

export function pragueTime(at: Date): string {
  return new Intl.DateTimeFormat("cs-CZ", { timeZone: "Europe/Prague", hour: "2-digit", minute: "2-digit" }).format(at);
}

// Celá hodina v pražském čase (0–23).
export function pragueHour(at: Date): number {
  const hour = new Intl.DateTimeFormat("en-GB", { timeZone: PRAGUE_TIME_ZONE, hour: "numeric", hourCycle: "h23" }).format(at);
  return Number(hour);
}

// Období pro lidi z UTC začátku a konce: „19. 11. 2026“, „17.–19. 11. 2026“, „19. 11. 2026, 8:00–15:00“,
// „18. 11. 2026 22:00 – 19. 11. 2026 2:00“. Konec se nezahrnuje.
export function formatPeriod(startIso: string, endIso: string): string {
  const start = new Date(startIso);
  const end = new Date(endIso);
  const lastHour = new Date(end.getTime() - 3600 * 1000);
  const startDate = pragueDate(start);
  const endDate = pragueDate(lastHour);
  const hourOf = (at: Date) => `${pragueHour(at)}:00`;
  const wholeDays = pragueHour(start) === 0 && pragueHour(end) === 0;
  if (wholeDays) {
    if (startDate === endDate) return formatCzDate(startDate);
    const [sy, sm, sd] = startDate.split("-").map(Number);
    const [ey, em] = endDate.split("-").map(Number);
    if (sy === ey && sm === em) return `${sd}.–${formatCzDate(endDate)}`;
    return `${formatCzDate(startDate)} – ${formatCzDate(endDate)}`;
  }
  const endHour = pragueHour(end) === 0 ? "24:00" : hourOf(end);
  if (startDate === endDate) return `${formatCzDate(startDate)}, ${hourOf(start)}–${endHour}`;
  return `${formatCzDate(startDate)} ${hourOf(start)} – ${formatCzDate(endDate)} ${endHour}`;
}
