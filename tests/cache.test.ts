// Cache CITIQ (lib/citiq/cache.ts) bez sítě: fetchCitiq podstrčíme a soubory jdou do dočasné složky.
import { promises as fs } from "fs";
import os from "os";
import path from "path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "osk-cache-"));
vi.spyOn(process, "cwd").mockReturnValue(tmp);
const requests: { start?: string; stop?: string }[] = [];
vi.mock("../lib/citiq/client", async (importOriginal) => {
  const original = await importOriginal<typeof import("../lib/citiq/client")>();
  return {
    ...original,
    // Odpověď: jeden bod na každou hodinu rozsahu (čas = konec hodiny), hodnota = pořadí hodiny.
    fetchCitiq: async (params: { start?: string; stop?: string }) => {
      requests.push({ start: params.start, stop: params.stop });
      const from = Date.parse(params.start ?? "");
      const to = Date.parse(params.stop ?? "") + 1000;
      const values = [];
      for (let t = from + 3600000, i = 0; t <= to; t += 3600000, i++) values.push({ point: { time: new Date(t).toISOString(), value: i } });
      return { results: [{ source_identifier: "g", object_name: "g", measurements: [{ key: "k", name: "k", unit: "", values }] }] };
    },
  };
});
const { getCachedDay, getUncachedDays } = await import("../lib/citiq/cache");
const valuesOf = (entry: { data: unknown }) =>
  (entry.data as { results: { measurements: { values: { point: { time: string } }[] }[] }[] }).results[0].measurements[0].values;

const files = async () => (await fs.readdir(path.join(tmp, "data", "cache", "test-view")).catch(() => [])).length;

beforeEach(() => {
  requests.length = 0;
});

describe("cache: půl roku v cache, starší data bez ukládání", () => {
  it("staré dny: souvislé úseky jedním dotazem, nic se neuloží, novější dny vynechá", async () => {
    const now = new Date("2026-11-22T12:00:00Z");
    const days = await getUncachedDays("test-view", ["2026-01-05", "2026-01-06", "2026-01-07", "2026-01-10"], {}, now);
    expect([...days.keys()]).toEqual(["2026-01-05", "2026-01-06", "2026-01-07", "2026-01-10"]);
    // dva úseky (5.–7. 1. a 10. 1.) = dva dotazy
    expect(requests).toEqual([
      { start: "2026-01-04T23:00:00.000Z", stop: "2026-01-07T22:59:59.000Z" },
      { start: "2026-01-09T23:00:00.000Z", stop: "2026-01-10T22:59:59.000Z" },
    ]);
    expect(days.get("2026-01-06")).toMatchObject({ start: new Date("2026-01-04T23:00:00.000Z") });
    expect(await files()).toBe(0);
  });

  it("chybějící dny z posledního půl roku: jeden dotaz na úsek, uloží se po dnech a příště jdou z cache", async () => {
    const now = new Date();
    const day = (offset: number) => new Date(now.getTime() - offset * 24 * 3600 * 1000).toISOString().slice(0, 10);
    const dates = [day(12), day(11), day(10)];
    expect(await getUncachedDays("test-view", dates, {}, now)).toEqual(new Map());
    expect(requests).toHaveLength(1);
    expect(await files()).toBe(3);
    // Každý den má jen svoje body (23–25 podle změny času), poslední bod dne je o půlnoci.
    const cached = await getCachedDay("test-view", dates[1]);
    expect(valuesOf(cached).length).toBeGreaterThanOrEqual(23);
    expect(valuesOf(cached).length).toBeLessThanOrEqual(25);
    expect(requests).toHaveLength(1); // z cache, žádný další dotaz
    await getUncachedDays("test-view", dates, {}, now);
    expect(requests).toHaveLength(1);
  });

  it("starý den přes getCachedDay se stáhne pokaždé a neuloží; nedávný se uloží a podruhé jde z cache", async () => {
    const before = await files(); // složku sdílí testy, počítáme přírůstek
    await getCachedDay("test-view", "2025-12-01");
    await getCachedDay("test-view", "2025-12-01");
    expect(requests).toHaveLength(2);
    expect(await files()).toBe(before);

    const recent = new Date(Date.now() - 3 * 24 * 3600 * 1000).toISOString().slice(0, 10);
    await getCachedDay("test-view", recent);
    await getCachedDay("test-view", recent);
    expect(requests).toHaveLength(3);
    expect(await files()).toBe(before + 1);
  });
});
