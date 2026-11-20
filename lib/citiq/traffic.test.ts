import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";

type TrafficCount = typeof import("./traffic").trafficCount;

let trafficCount: TrafficCount;
let responseData: unknown;
let originalFetch: typeof globalThis.fetch;
let originalCwd: string;
let temporaryDirectory: string;

function point(time: string, value: number, direction: string) {
  return { point: { time, value }, tags: { direction } };
}

function responseWithPoints(values: ReturnType<typeof point>[]) {
  return {
    results: [
      {
        source_identifier: "test-source",
        object_name: "Parkoviště Flora",
        measurements: [
          {
            key: "gate_increment_value_sum",
            name: "Gate increment",
            unit: "",
            values,
          },
        ],
      },
    ],
  };
}

before(async () => {
  originalCwd = process.cwd();
  temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "osk-traffic-count-"));
  process.chdir(temporaryDirectory);
  originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    assert.equal(new URL(String(input)).pathname, "/portal/api/v2/view/olomouc-traffic-gates/");
    return new Response(JSON.stringify(responseData), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };
  ({ trafficCount } = await import("./traffic"));
});

after(async () => {
  globalThis.fetch = originalFetch;
  process.chdir(originalCwd);
  await rm(temporaryDirectory, { recursive: true, force: true });
});

test("counts both directions as nonnegative values and preserves gaps", async () => {
  responseData = responseWithPoints([
    point("2026-11-20T08:00:00+00:00", 14, "1"),
    point("2026-11-20T08:00:00+00:00", -15, "-1"),
    point("2026-11-20T09:00:00+00:00", 0, "1"),
  ]);

  const inbound = await trafficCount({ gate: "parkoviště flora", direction: "in", date: "2026-11-20" });
  assert.equal(inbound.ok, true);
  if (!inbound.ok) return;
  assert.equal(inbound.data.total, 14);
  assert.equal(inbound.data.hourly.length, 24);
  assert.equal(inbound.data.hourly[9], 14);
  assert.equal(inbound.data.hourly[10], 0);
  assert.equal(inbound.data.hourly[11], null);
  assert.deepEqual(inbound.meta.coverage, { hours: 2, of: 24 });
  assert.deepEqual(inbound.meta.period_utc, ["2026-11-19T23:00:00.000Z", "2026-11-20T22:59:59.000Z"]);
  const sourceUrl = new URL(inbound.meta.source_url);
  assert.equal(sourceUrl.searchParams.get("start"), inbound.meta.period_utc[0]);
  assert.equal(sourceUrl.searchParams.get("stop"), inbound.meta.period_utc[1]);

  const outbound = await trafficCount({ gate: "Parkoviště Flora", direction: "out", date: "2026-11-20" });
  assert.equal(outbound.ok, true);
  if (!outbound.ok) return;
  assert.equal(outbound.data.total, 15);
  assert.equal(outbound.data.hourly[9], 15);
});

test("uses 23 hourly buckets on the spring DST transition", async () => {
  responseData = responseWithPoints([
    point("2026-03-29T00:00:00+00:00", 7, "1"),
    point("2026-03-29T01:00:00+00:00", 8, "1"),
  ]);

  const result = await trafficCount({ gate: "Parkoviště Flora", direction: "in", date: "2026-03-29" });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.data.hourly.length, 23);
  assert.deepEqual(result.meta.coverage, { hours: 2, of: 23 });
});

test("keeps both repeated hours on the autumn DST transition", async () => {
  responseData = responseWithPoints([
    point("2026-10-25T00:00:00+00:00", 7, "1"),
    point("2026-10-25T01:00:00+00:00", 8, "1"),
  ]);

  const result = await trafficCount({ gate: "Parkoviště Flora", direction: "in", date: "2026-10-25" });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.data.hourly.length, 25);
  assert.equal(result.data.hourly[2], 7);
  assert.equal(result.data.hourly[3], 8);
  assert.deepEqual(result.meta.coverage, { hours: 2, of: 25 });
});

test("returns explicit errors for invalid dates and missing direction data", async () => {
  const unknownGate = await trafficCount({
    gate: "Neznámá brána",
    direction: "in",
    date: "2026-11-18",
  });
  assert.equal(unknownGate.ok, false);
  if (!unknownGate.ok) assert.equal(unknownGate.error.code, "UNKNOWN_GATE");

  const invalidDate = await trafficCount({
    gate: "Parkoviště Flora",
    direction: "in",
    date: "2026-02-30",
  });
  assert.equal(invalidDate.ok, false);
  if (!invalidDate.ok) assert.equal(invalidDate.error.code, "INVALID_DATE");

  responseData = responseWithPoints([point("2026-11-18T10:00:00+00:00", 3, "-1")]);
  const noInbound = await trafficCount({ gate: "Parkoviště Flora", direction: "in", date: "2026-11-18" });
  assert.equal(noInbound.ok, false);
  if (!noInbound.ok) assert.equal(noInbound.error.code, "NO_DATA");

  responseData = { error: "Unexpected CITIQ response" };
  const badResponse = await trafficCount({ gate: "Parkoviště Flora", direction: "in", date: "2026-11-17" });
  assert.equal(badResponse.ok, false);
  if (!badResponse.ok) assert.equal(badResponse.error.code, "BAD_RESPONSE");
});
