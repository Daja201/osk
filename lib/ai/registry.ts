import type { TrafficCountParams, TrafficCountResult } from "../citiq/traffic";

export type TrafficCountFn = (params: TrafficCountParams) => Promise<TrafficCountResult>;

// Jediné místo, kde se rozhoduje mezi mockem a Davidovými daty (DATA_SOURCE=mock|real).
// Import je dynamický, aby se v režimu mock vůbec nenačítal kód, který sahá na síť a disk.
export async function getTrafficCount(): Promise<TrafficCountFn> {
  if (process.env.DATA_SOURCE === "real") {
    const { trafficCount } = await import("../citiq/traffic");
    return trafficCount;
  }
  const { mockTrafficCount } = await import("../mock/traffic");
  return mockTrafficCount;
}

export function dataMode(): "real" | "mock" {
  return process.env.DATA_SOURCE === "real" ? "real" : "mock";
}
