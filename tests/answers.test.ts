// Ukládání odpovědí (lib/answers.ts) a CSV (lib/csv.ts). Soubory jdou do dočasné složky, ne do repa.
import { promises as fs } from "fs";
import os from "os";
import path from "path";
import { describe, expect, it, vi } from "vitest";
import type { AskAnswer } from "../lib/ai/types";
import type { SeriesOk } from "../lib/citiq/series";

const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "osk-answers-"));
vi.spyOn(process, "cwd").mockReturnValue(tmp);
const { isAnswerId, loadAnswer, pruneAnswers, saveAnswer } = await import("../lib/answers");
const { seriesCsv } = await import("../lib/csv");

const result: SeriesOk = {
  ok: true,
  data: {
    granularity: "hour",
    buckets: [
      { label: "8:00", start: "2026-11-19T07:00:00.000Z", end: "2026-11-19T08:00:00.000Z" },
      { label: "9:00", start: "2026-11-19T08:00:00.000Z", end: "2026-11-19T09:00:00.000Z" },
    ],
    series: [
      { gate: "17. listopadu (obě brány)", sensors: [], values: [1200, null], total: 1200, coverage: { hours: 1, of: 2 } },
      { gate: "Parkoviště Flora", sensors: [], values: [12, 9], total: 21, coverage: { hours: 2, of: 2 } },
    ],
  },
  meta: {
    tool: "traffic_series",
    params: { gates: [], direction: "both", from: "2026-11-19T08:00", to: "2026-11-19T10:00", granularity: "hour" },
    period: { start: "2026-11-19T07:00:00.000Z", end: "2026-11-19T09:00:00.000Z", clipped: false },
    sources: [],
    notes: [],
  },
};

const answer: AskAnswer = {
  id: null,
  expires_at: null,
  question: "Porovnej 17. listopadu a Floru",
  created_at: "2026-11-20T10:00:00.000Z",
  kind: "answer",
  format: "bar",
  title: "Test",
  background: "cervena",
  sentence: null,
  sentence_source: null,
  reason: null,
  spec: null,
  result,
  notes: [],
  view: null,
  trace: { model: "test", now: "2026-11-20T10:00:00.000Z", steps: [], total_ms: 1 },
};

describe("uložené odpovědi", () => {
  it("uloží a načte stejnou odpověď, odkaz platí 7 dní", async () => {
    const saved = await saveAnswer(answer);
    expect(saved.id && isAnswerId(saved.id)).toBe(true);
    expect(Date.parse(saved.expires_at ?? "") - Date.now()).toBeGreaterThan(6.9 * 24 * 3600 * 1000);
    expect(await loadAnswer(saved.id ?? "")).toEqual(saved);
  });

  it("po 7 dnech se nenačte a úklid soubor smaže", async () => {
    const saved = await saveAnswer(answer);
    const later = Date.now() + 8 * 24 * 3600 * 1000;
    expect(await loadAnswer(saved.id ?? "", later)).toBeNull();
    await pruneAnswers(later);
    await expect(fs.access(path.join(tmp, "data", "answers", `${saved.id}.json`))).rejects.toThrow();
  });

  it("neplatné id se ani nezkouší číst (žádné ../)", async () => {
    expect(isAnswerId("../../etc/passwd")).toBe(false);
    expect(await loadAnswer("../../etc/passwd")).toBeNull();
    expect(await loadAnswer("Neexistuje")).toBeNull();
  });
});

describe("CSV", () => {
  it("řádek = období, sloupec = místo, chybějící hodnota je prázdná", () => {
    const lines = seriesCsv(result).split("\r\n");
    expect(lines[0]).toBe("﻿Období;Začátek (UTC);17. listopadu (obě brány);Parkoviště Flora");
    expect(lines[1]).toBe("8:00;2026-11-19T07:00:00.000Z;1200;12");
    expect(lines[2]).toBe("9:00;2026-11-19T08:00:00.000Z;;9");
  });
});

describe("uložení vzhledu (POST /api/answers/<id>/variant)", () => {
  const post = async (id: string, body: unknown) => {
    const { POST } = await import("../app/api/answers/[id]/variant/route");
    const request = new Request("http://test/api", { method: "POST", body: JSON.stringify(body) });
    return POST(request, { params: Promise.resolve({ id }) } as never);
  };
  const view = { format: "pie", title: "Můj graf", background: "modra", colors: ["#FF0000"], axis: { mode: "auto" }, qr: false };

  it("vytvoří novou kopii s vlastním id; čísla vezme ze serveru, původní odpověď zůstane", async () => {
    const original = await saveAnswer(answer);
    const response = await post(original.id ?? "", { view, result: { ok: true, data: "podvržená data" } });
    const copy = await response.json();
    expect(response.status).toBe(200);
    expect(copy.id).not.toBe(original.id);
    expect(copy.view).toEqual(view);
    expect(copy.result).toEqual(original.result);
    expect((await loadAnswer(original.id ?? ""))?.view).toBeNull();
  });

  it("neplatný vzhled → 400, neexistující odpověď → 404", async () => {
    const original = await saveAnswer(answer);
    expect((await post(original.id ?? "", { view: { ...view, colors: ["javascript:alert(1)"] } })).status).toBe(400);
    expect((await post("Neexistuje", { view })).status).toBe(404);
  });
});
