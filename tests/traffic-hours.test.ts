// Přiřazení bodů z CITIQ k hodinám v lib/citiq/traffic.ts. Bez sítě: getCachedDay podstrčíme.
// Čas bodu = KONEC hodinového okna (docs/data-notes.md, H2); poslední bod dne má čas „stop“ = 22:59:59Z.
import { describe, expect, it, vi } from "vitest";

const points: { time: string; value: number; direction: string }[] = [];

vi.mock("../lib/citiq/cache", async (importOriginal) => {
  const original = await importOriginal<typeof import("../lib/citiq/cache")>();
  return {
    ...original,
    getCachedDay: async () => ({
      fetched_at: "2026-11-20T21:14:00.000Z",
      data: {
        results: [
          {
            source_identifier: "test",
            object_name: "Parkoviště Flora",
            measurements: [
              {
                key: "gate_increment_value_sum",
                name: "gate increment",
                unit: "",
                values: points.map((p) => ({ point: { time: p.time, value: p.value }, tags: { direction: p.direction } })),
              },
            ],
          },
        ],
      },
    }),
  };
});

const { trafficCount } = await import("../lib/citiq/traffic");

// 19. 11. 2026: místní půlnoc = 2026-11-18T23:00:00Z. Bod pro hodinu h (místní) končí v 23:00Z + (h + 1) h.
function endOfLocalHour(hour: number): string {
  if (hour === 23) return "2026-11-19T22:59:59+00:00"; // poslední okno je oříznuté na stop dotazu
  return new Date(Date.UTC(2026, 10, 18, 23 + hour + 1)).toISOString().replace(".000Z", "+00:00");
}

describe("trafficCount: hodiny podle konce okna", () => {
  it("každý bod padne do své hodiny, i poslední bod dne v 22:59:59Z", async () => {
    points.length = 0;
    for (let hour = 0; hour < 24; hour++) points.push({ time: endOfLocalHour(hour), value: 100 + hour, direction: "1" });

    const result = await trafficCount({ gate: "Parkoviště Flora", direction: "in", date: "2026-11-19" });
    if (!result.ok) throw new Error(result.error.message);
    expect(result.data.hourly).toEqual(Array.from({ length: 24 }, (_, hour) => 100 + hour));
    expect(result.meta.coverage).toEqual({ hours: 24, of: 24 });
  });

  it("bod přesně o místní půlnoci patří předchozímu dni", async () => {
    points.length = 0;
    points.push({ time: "2026-11-18T23:00:00+00:00", value: 999, direction: "1" });
    points.push({ time: endOfLocalHour(0), value: 5, direction: "1" });

    const result = await trafficCount({ gate: "Parkoviště Flora", direction: "in", date: "2026-11-19" });
    if (!result.ok) throw new Error(result.error.message);
    expect(result.data.hourly[0]).toBe(5);
    expect(result.data.total).toBe(5);
  });
});
