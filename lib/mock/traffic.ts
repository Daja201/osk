import type { TrafficCountParams, TrafficCountResult } from "../citiq/traffic";

// Vymyšlená data se stejným podpisem jako Davidův trafficCount (lib/citiq/traffic.ts).
// Slouží, dokud CITIQ nevrací data, a pro testy bez sítě. Čísla jsou stejná pro stejné vstupy.

const DAY_PROFILE = [3, 2, 1, 1, 1, 4, 14, 52, 61, 43, 38, 40, 45, 47, 52, 61, 69, 64, 48, 33, 21, 15, 9, 6];
const MISSING_HOURS = [3, 4];

function seed(text: string): number {
  let hash = 0;
  for (const char of text) hash = (hash * 31 + char.charCodeAt(0)) % 1000;
  return hash;
}

export async function mockTrafficCount(params: TrafficCountParams): Promise<TrafficCountResult> {
  const { gate, direction, date } = params;
  const scale = 5 + (seed(gate) % 10) + (direction === "out" ? -1 : 0);

  const hourly = DAY_PROFILE.map((base, hour) =>
    MISSING_HOURS.includes(hour) ? null : base * scale + (seed(`${date}${hour}`) % 7),
  );
  const total = hourly.reduce<number>((sum, value) => sum + (value ?? 0), 0);
  const covered = hourly.filter((value) => value !== null).length;

  return {
    ok: true,
    data: { total, hourly },
    meta: {
      tool: "traffic_count",
      params,
      period_local: `${date} 0:00–24:00`,
      period_utc: [`${date}T00:00:00.000Z`, `${date}T23:59:59.000Z`],
      coverage: { hours: covered, of: 24 },
      source_url: "https://iot.citiq.cloud/portal/api/v2/view/olomouc-traffic-gates/ (mock)",
      fetched_at: new Date().toISOString(),
      notes: [`chybí data za ${24 - covered} hodin`, "vymyšlená data (mock)"],
    },
  };
}
