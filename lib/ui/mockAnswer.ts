import type { TrafficCountOk } from "../citiq/traffic";
import type { AskAnswer } from "./types";

// Vymyšlená data jen pro vývoj stránky. Tvar je přesně jako výsledek Davidova trafficCount.
// Dvě hodiny chybí (null), aby byl vidět přerušovaný sloupec v grafu.
const hourly: (number | null)[] = [
  41, 22, 15, null, null, 30, 140, 520, 610, 430, 380, 400,
  450, 470, 520, 610, 690, 640, 480, 330, 210, 150, 90, 60,
];

const total = hourly.reduce<number>((sum, value) => sum + (value ?? 0), 0);
const coveredHours = hourly.filter((value) => value !== null).length;

const mockResult: TrafficCountOk = {
  ok: true,
  data: { total, hourly },
  meta: {
    tool: "traffic_count",
    params: { gate: "17.listopadu JIH", direction: "in", date: "2026-11-19" },
    period_local: "2026-11-19 0:00–24:00",
    period_utc: ["2026-11-18T23:00:00.000Z", "2026-11-19T22:59:59.000Z"],
    coverage: { hours: coveredHours, of: 24 },
    source_url:
      "https://iot.citiq.cloud/portal/api/v2/view/olomouc-traffic-gates/?format=json&window=1h&agg_func=sum&measurement_keys=gate_increment_value_sum",
    fetched_at: "2026-11-20T18:42:10.000Z",
    notes: ["chybí data za 2 hodin", "znaménko = směr je neověřená hypotéza, ověřit s CITIQ (p. Giesl)"],
  },
};

const cz = new Intl.NumberFormat("cs-CZ");

export async function mockAsk(question: string): Promise<AskAnswer> {
  // Simulace čekání na server, ať je vidět stav načítání.
  await new Promise((resolve) => setTimeout(resolve, 600));
  return {
    question,
    sentence: `Ve čtvrtek 19. 11. 2026 projelo branou 17. listopadu – jih ${cz.format(total)} vozidel, nejvíc mezi 16:00 a 17:00 (690).`,
    sentence_source: "ai",
    result: mockResult,
  };
}
