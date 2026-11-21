import type Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { GATES, GATE_NAMES, MAX_GATES } from "./gates";
import { PALETTE_NAMES } from "./palette";
import { WEATHER_METRICS, WEATHER_STATION_NAMES, type WeatherMetricKey } from "../citiq/weatherStations";

const gateList = GATES.map((gate) =>
  gate.aliases.length > 0 ? `${gate.objectName} (${gate.aliases.join(", ")})` : gate.objectName,
).join("; ");

export const FORMATS = ["text", "bar", "line", "pie", "table", "source"] as const;
export type Format = (typeof FORMATS)[number];

const TRAFFIC_DATASET_BRIEF =
  "Lze se ptát na počty vozidel na dopravních senzorech v Olomouci: jednotlivá místa nebo porovnání míst, " +
  "vjely/vyjely/oba směry, období po hodinách nebo dnech, celkové počty a špičky; odpověď může být věta, " +
  "sloupcový nebo čárový graf, koláčový graf, tabulka nebo odkaz na zdroj.";

export const DATASET_BRIEF =
  `${TRAFFIC_DATASET_BRIEF} Také lze zjišťovat počasí z 10 olomouckých meteorologických stanic: ` +
  "teplotu, vlhkost, tlak, rychlost a směr větru.";

// Dopravní nástroj: Claude z otázky vyplní ZADÁNÍ odpovědi (co spočítat a jak to ukázat).
// Čísla spočítá náš kód (lib/citiq/series.ts), Claude je nevidí, dokud nejsou spočítaná.
export const buildAnswerTool: Anthropic.Tool = {
  name: "build_answer",
  description:
    "Připraví odpověď z dat dopravních senzorů v Olomouci: počty vozidel, které projely branami " +
    "v zadaném čase, a způsob zobrazení (věta, graf, tabulka, nebo odkaz na zdroj dat). " +
    `Brány (název a v závorce přezdívky): ${gateList}. ${TRAFFIC_DATASET_BRIEF}`,
  strict: true,
  input_schema: {
    type: "object",
    properties: {
      format: {
        type: "string",
        enum: [...FORMATS],
        description:
          "text = odpověď větou; bar = sloupcový graf (porovnání); line = čárový graf (průběh v čase); " +
          "pie = koláčový graf (podíl míst na celku); table = tabulka; source = jen odkud data bereme (API).",
      },
      title: { type: ["string", "null"], description: "Nadpis grafu nebo tabulky, když si ho uživatel řekl, jinak null." },
      // enum nejde spojit s type: ["string", "null"] (API vrátí 400), proto anyOf.
      background: {
        anyOf: [{ type: "string", enum: [...PALETTE_NAMES] }, { type: "null" }],
        description: "Barva pozadí grafu z palety, když si ji uživatel řekl, jinak null.",
      },
      gates: {
        type: "array",
        items: { type: "string", enum: GATE_NAMES },
        description: `Místa (1 až ${MAX_GATES}). Pro místo s víc branami použij skupinu „(obě brány)“.`,
      },
      direction: { type: "string", enum: ["in", "out", "both"], description: "Směr; když ho otázka neurčuje, both." },
      from: { type: "string", description: "Začátek, pražský čas, tvar YYYY-MM-DDTHH:00." },
      to: { type: "string", description: "Konec (nezahrnuje se), pražský čas, tvar YYYY-MM-DDTHH:00; půlnoc na konci dne = T24:00." },
      granularity: { type: "string", enum: ["hour", "day", "total"], description: "hour = po hodinách, day = po dnech, total = jedno číslo za místo." },
      date_assumed: { type: "boolean", description: "true, když v otázce nebyl žádný čas a použil jsi výchozí (včerejšek)." },
    },
    required: ["format", "title", "background", "gates", "direction", "from", "to", "granularity", "date_assumed"],
    additionalProperties: false,
  },
};

const weatherStationList = WEATHER_STATION_NAMES.join("; ");
const weatherMetricKeys = WEATHER_METRICS.map((metric) => metric.key) as [WeatherMetricKey, ...WeatherMetricKey[]];
const weatherMetricDescriptions = WEATHER_METRICS.map((metric) => `${metric.key} = ${metric.name} (${metric.unit})`).join("; ");

export const weatherSeriesTool: Anthropic.Tool = {
  name: "weather_series",
  description:
    "Připraví zadání výpočtu meteorologických dat z CITIQ v Olomouci. " +
    `Stanice: ${weatherStationList}. Měřené veličiny a jednotky: ${weatherMetricDescriptions}. ` +
    "Hodinová data jsou průměry; více veličin lze požadovat najednou.",
  strict: true,
  input_schema: {
    type: "object",
    properties: {
      format: {
        type: "string",
        enum: [...FORMATS],
        description:
          "text = odpověď větou; bar = sloupcový graf; line = čárový graf; pie = koláčový graf; table = tabulka; source = odkaz na zdroj dat.",
      },
      title: { type: ["string", "null"], description: "Nadpis grafu nebo tabulky, když si ho uživatel řekl, jinak null." },
      background: {
        anyOf: [{ type: "string", enum: [...PALETTE_NAMES] }, { type: "null" }],
        description: "Barva pozadí grafu z palety, když si ji uživatel řekl, jinak null.",
      },
      stations: {
        type: "array",
        items: { type: "string", enum: WEATHER_STATION_NAMES },
        description: "Jedna nebo více z uvedených meteorologických stanic.",
      },
      metrics: {
        type: "array",
        items: { type: "string", enum: weatherMetricKeys },
        description: "Jedna nebo více veličin. Vlhkost je procento (0–100), nikoli stupně.",
      },
      from: { type: "string", description: "Začátek, pražský čas, tvar YYYY-MM-DDTHH:00." },
      to: { type: "string", description: "Konec (nezahrnuje se), pražský čas, tvar YYYY-MM-DDTHH:00; půlnoc na konci dne = T24:00." },
      granularity: { type: "string", enum: ["hour", "day", "total"], description: "hour = po hodinách; day = po dnech; total = průměr za období." },
      date_assumed: { type: "boolean", description: "true, když v otázce nebyl žádný čas a použil jsi výchozí (včerejšek)." },
    },
    required: ["format", "title", "background", "stations", "metrics", "from", "to", "granularity", "date_assumed"],
    additionalProperties: false,
  },
};

const LOCAL_TIME = /^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-4]):00$/;

// Stejná pravidla ještě jednou v Zodu. strict hlídá tvar, Zod navíc formát času a počet míst.
export const BuildAnswerInput = z
  .object({
    format: z.enum(FORMATS),
    title: z.string().trim().max(120).nullable(),
    background: z.enum(PALETTE_NAMES).nullable(),
    gates: z.array(z.enum(GATE_NAMES as [string, ...string[]])).min(1).max(MAX_GATES),
    direction: z.enum(["in", "out", "both"]),
    from: z.string().regex(LOCAL_TIME),
    to: z.string().regex(LOCAL_TIME),
    granularity: z.enum(["hour", "day", "total"]),
    date_assumed: z.boolean(),
  })
  .strict();

export type BuildAnswerInput = z.infer<typeof BuildAnswerInput>;

export const WeatherSeriesInput = z
  .object({
    format: z.enum(FORMATS),
    title: z.string().trim().max(120).nullable(),
    background: z.enum(PALETTE_NAMES).nullable(),
    stations: z.array(z.enum(WEATHER_STATION_NAMES as [string, ...string[]])).min(1).max(10),
    metrics: z
      .array(
        z.string().refine((value): value is WeatherMetricKey => WEATHER_METRICS.some((metric) => metric.key === value)),
      )
      .min(1)
      .max(WEATHER_METRICS.length),
    from: z.string().regex(LOCAL_TIME),
    to: z.string().regex(LOCAL_TIME),
    granularity: z.enum(["hour", "day", "total"]),
    date_assumed: z.boolean(),
  })
  .strict();

export type WeatherSeriesInput = z.infer<typeof WeatherSeriesInput>;
