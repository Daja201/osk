import type { TrafficCountError, TrafficCountOk } from "../citiq/traffic";

export type Direction = "in" | "out" | "both";

// Výsledek Davidova trafficCount. Jediný rozdíl: směr může být i "both" (oba směry sečetl náš kód).
export type TrafficResultOk = Omit<TrafficCountOk, "meta"> & {
  meta: Omit<TrafficCountOk["meta"], "params"> & {
    params: { gate: string; direction: Direction; date: string };
  };
};
export type TrafficResult = TrafficResultOk | TrafficCountError;

export type ReasonCode = "OUT_OF_SCOPE" | "AI_ERROR" | "BAD_PARAMS" | "SOURCE_ERROR" | string;

export type TraceStep =
  | { type: "model"; ms: number; input_tokens: number; output_tokens: number; stop_reason: string | null }
  | { type: "tool"; name: string; input: unknown; ms: number; ok: boolean }
  | { type: "check"; passed: boolean; numbers: number[]; not_allowed: number[] }
  | { type: "note"; text: string };

// Odpověď /api/ask (SPEC §7, zjednodušeně).
export type AskAnswer = {
  question: string;
  kind: "answer" | "unknown";
  sentence: string;
  // "ai" = napsal Claude a prošla kontrolou čísel, "fallback" = složil ji kód, "fixed" = pevná věta.
  sentence_source: "ai" | "fallback" | "fixed";
  reason: { code: ReasonCode; message: string } | null;
  assumptions: string[];
  result: TrafficResult | null;
  trace: { model: string; mode: "real" | "mock"; now: string; steps: TraceStep[]; total_ms: number };
};
