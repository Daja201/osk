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
  "vjely/vyjely/oba směry, souvislá období i vybrané jednotlivé dny, výslovné sloučení více bran do jedné řady, porovnání 2–12 období v rozsahu nejvýše 31 dní, celkové počty a špičky; odpověď může být věta, " +
  "sloupcový nebo čárový graf, koláčový graf, tabulka nebo odkaz na zdroj.";

export const DATASET_BRIEF =
  `${TRAFFIC_DATASET_BRIEF} Také lze zjišťovat počasí z 10 olomouckých meteorologických stanic: ` +
  "teplotu, vlhkost, tlak, rychlost a směr větru; lze počítat typický denní profil, průměr, medián a špičky, vybrat jednotlivé nesouvislé dny a porovnat 2–12 období v rozsahu nejvýše 31 dní. Dopravní data lze také srovnat poměrem nebo podílem a graf může spojit dopravu s počasím na dvou osách.";

// Dopravní nástroj: Claude z otázky vyplní ZADÁNÍ odpovědi (co spočítat a jak to ukázat).
// Čísla spočítá náš kód (lib/citiq/series.ts), Claude je nevidí, dokud nejsou spočítaná.
export const buildAnswerTool: Anthropic.Tool = {
  name: "build_answer",
  description:
    "Připraví odpověď z dat dopravních senzorů v Olomouci: počty vozidel, které projely branami " +
    "v zadaném čase nebo ve více srovnávaných obdobích, a způsob zobrazení (věta, graf, tabulka, nebo odkaz na zdroj dat). " +
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
      combine_gates: {
        type: "boolean",
        description: "true jen pokud uživatel výslovně chce sečíst více vybraných bran do jedné řady/bodu v každém bucketu; jinak false.",
      },
      relation: {
        type: "string",
        enum: ["none", "ratio", "share", "difference", "direction_ratio", "direction_share"],
        description: "none = běžná data; ratio = první vybrané místo děleno druhým; share = podíl prvního z obou v %; difference = rozdíl první minus druhé („o kolik víc / míň“); direction_ratio = vjezdy/výjezdy; direction_share = podíl vjezdů z obou směrů v %.",
      },
      typical_profile: { type: "boolean", description: "true pro typický denní profil: průměr každé hodiny přes vybrané dny." },
      direction: { type: "string", enum: ["in", "out", "both"], description: "Směr; když ho otázka neurčuje, both." },
      from: { type: "string", description: "Začátek, pražský čas, tvar YYYY-MM-DDTHH:00." },
      to: { type: "string", description: "Konec (nezahrnuje se), pražský čas, tvar YYYY-MM-DDTHH:00; půlnoc na konci dne = T24:00." },
      dates: {
        type: "array",
        items: { type: "string" },
        description: "Volitelné přesné dny YYYY-MM-DD, jen pokud se ptá na vybrané nesouvislé dny. Jinak prázdné pole. Pro vybrané dny from/to vymezují celé dny od prvního do posledního.",
      },
      periods: {
        type: "array",
        items: {
          type: "object",
          properties: {
            from: { type: "string" },
            to: { type: "string" },
          },
          required: ["from", "to"],
          additionalProperties: false,
        },
        description: "Prázdné, pokud se období neporovnávají. Jinak 2–12 po sobě jdoucích, nepřekrývajících se intervalů od nejstaršího; from/to nahoře vymezují celý rozsah.",
      },
      granularity: { type: "string", enum: ["hour", "day", "total", "period"], description: "hour = po hodinách, day = po dnech, total = součet/průměr za rozsah, period = jedno srovnatelné číslo za každé zadané období." },
      date_assumed: { type: "boolean", description: "true, když v otázce nebyl žádný čas a použil jsi výchozí (včerejšek)." },
    },
    required: ["format", "title", "background", "gates", "combine_gates", "relation", "typical_profile", "direction", "from", "to", "dates", "periods", "granularity", "date_assumed"],
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
  "Hodinová data jsou průměry; více veličin lze požadovat najednou, vybrat jednotlivé nesouvislé dny nebo porovnat 2–12 období v rozsahu nejvýše 31 dní.",
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
      relation: {
        type: "string",
        enum: ["none", "ratio", "share", "difference"],
        description: "none = běžná data; ratio = první vybraná řada děleno druhou; share = podíl první řady ze součtu dvou řad v % (jen pro slučitelné veličiny); difference = rozdíl první minus druhé („o kolik tepleji / vlhčeji“, i pro teplotu).",
      },
      typical_profile: { type: "boolean", description: "true pro typický denní profil: průměr každé hodiny přes vybrané dny." },
      from: { type: "string", description: "Začátek, pražský čas, tvar YYYY-MM-DDTHH:00." },
      to: { type: "string", description: "Konec (nezahrnuje se), pražský čas, tvar YYYY-MM-DDTHH:00; půlnoc na konci dne = T24:00." },
      dates: {
        type: "array",
        items: { type: "string" },
        description: "Volitelné přesné dny YYYY-MM-DD pro výběr nesouvislých dní. Jinak prázdné pole. Pro vybrané dny from/to vymezují celé dny od prvního do posledního.",
      },
      periods: {
        type: "array",
        items: {
          type: "object",
          properties: {
            from: { type: "string" },
            to: { type: "string" },
          },
          required: ["from", "to"],
          additionalProperties: false,
        },
        description: "Prázdné, pokud se období neporovnávají. Jinak 2–12 po sobě jdoucích, nepřekrývajících se intervalů od nejstaršího; from/to nahoře vymezují celý rozsah.",
      },
      granularity: { type: "string", enum: ["hour", "day", "total", "period"], description: "hour = po hodinách; day = po dnech; total = průměr za rozsah; period = průměr za každé srovnávané období." },
      date_assumed: { type: "boolean", description: "true, když v otázce nebyl žádný čas a použil jsi výchozí (včerejšek)." },
    },
    required: ["format", "title", "background", "stations", "metrics", "relation", "typical_profile", "from", "to", "dates", "periods", "granularity", "date_assumed"],
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
    combine_gates: z.boolean().default(false),
    relation: z.enum(["none", "ratio", "share", "difference", "direction_ratio", "direction_share"]).default("none"),
    typical_profile: z.boolean().default(false),
    direction: z.enum(["in", "out", "both"]),
    from: z.string().regex(LOCAL_TIME),
    to: z.string().regex(LOCAL_TIME),
    dates: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).max(31).optional(),
    periods: z.array(z.object({ from: z.string().regex(LOCAL_TIME), to: z.string().regex(LOCAL_TIME) }).strict()).max(12).optional(),
    granularity: z.enum(["hour", "day", "total", "period"]),
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
    relation: z.enum(["none", "ratio", "share", "difference"]).default("none"),
    typical_profile: z.boolean().default(false),
    from: z.string().regex(LOCAL_TIME),
    to: z.string().regex(LOCAL_TIME),
    dates: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).max(31).optional(),
    periods: z.array(z.object({ from: z.string().regex(LOCAL_TIME), to: z.string().regex(LOCAL_TIME) }).strict()).max(12).optional(),
    granularity: z.enum(["hour", "day", "total", "period"]),
    date_assumed: z.boolean(),
  })
  .strict();

export type WeatherSeriesInput = z.infer<typeof WeatherSeriesInput>;

const combinedSeriesDescription =
  "Vytvoří jeden graf nebo tabulku z dopravních a meteorologických dat ve stejných hodinách. Doprava a počasí se nikdy nesčítají; každá veličina si ponechá svou jednotku a graf použije samostatnou osu. " +
  "Použij pouze když uživatel chce v jednom výstupu obě skupiny dat.";

export const combinedSeriesTool: Anthropic.Tool = {
  name: "combined_series",
  description: combinedSeriesDescription,
  strict: true,
  input_schema: {
    type: "object",
    properties: {
      format: { type: "string", enum: [...FORMATS], description: "bar = sloupcový; line = průběh v čase; table = tabulka. Pro různé jednotky nikdy nepoužívej koláč." },
      title: { type: ["string", "null"], description: "Nadpis grafu nebo tabulky, když si ho uživatel řekl, jinak null." },
      background: {
        anyOf: [{ type: "string", enum: [...PALETTE_NAMES] }, { type: "null" }],
        description: "Barva pozadí grafu z palety, když si ji uživatel řekl, jinak null.",
      },
      gates: { type: "array", items: { type: "string", enum: GATE_NAMES }, description: `Jedno až ${MAX_GATES} dopravních míst.` },
      combine_gates: { type: "boolean", description: "true jen při výslovné žádosti o sloučení bran." },
      direction: { type: "string", enum: ["in", "out", "both"], description: "Dopravní směr; pokud není určen, both." },
      stations: { type: "array", items: { type: "string", enum: WEATHER_STATION_NAMES }, description: "Jedna nebo více meteorologických stanic." },
      metrics: { type: "array", items: { type: "string", enum: weatherMetricKeys }, description: "Vyber jednu veličinu, jejíž jednotka bude na pravé ose." },
      from: { type: "string", description: "Začátek, pražský čas, tvar YYYY-MM-DDTHH:00." },
      to: { type: "string", description: "Konec (nezahrnuje se), pražský čas, tvar YYYY-MM-DDTHH:00." },
      dates: { type: "array", items: { type: "string" }, description: "Volitelné přesné nesouvislé dny YYYY-MM-DD; jinak prázdné pole." },
      granularity: { type: "string", enum: ["hour", "day", "total"], description: "hour = po hodinách, day = po dnech, total = shrnutí rozsahu." },
      typical_profile: { type: "boolean", description: "true pro průměrný hodinový profil napříč vybranými dny." },
      date_assumed: { type: "boolean", description: "true, když v otázce nebyl žádný čas a použil jsi výchozí (včerejšek)." },
    },
    required: ["format", "title", "background", "gates", "combine_gates", "direction", "stations", "metrics", "from", "to", "dates", "granularity", "typical_profile", "date_assumed"],
    additionalProperties: false,
  },
};

export const CombinedSeriesInput = z
  .object({
    format: z.enum(FORMATS),
    title: z.string().trim().max(120).nullable(),
    background: z.enum(PALETTE_NAMES).nullable(),
    gates: z.array(z.enum(GATE_NAMES as [string, ...string[]])).min(1).max(MAX_GATES),
    combine_gates: z.boolean().default(false),
    direction: z.enum(["in", "out", "both"]),
    stations: z.array(z.enum(WEATHER_STATION_NAMES as [string, ...string[]])).min(1).max(10),
    metrics: z.array(z.string().refine((value): value is WeatherMetricKey => WEATHER_METRICS.some((metric) => metric.key === value))).min(1).max(WEATHER_METRICS.length),
    from: z.string().regex(LOCAL_TIME),
    to: z.string().regex(LOCAL_TIME),
    dates: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).max(31).optional(),
    granularity: z.enum(["hour", "day", "total"]),
    typical_profile: z.boolean().default(false),
    date_assumed: z.boolean(),
  })
  .strict();

export type CombinedSeriesInput = z.infer<typeof CombinedSeriesInput>;
