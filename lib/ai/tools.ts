import type Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { GATES, GATE_NAMES, MAX_GATES } from "./gates";
import { PALETTE_NAMES } from "./palette";

const gateList = GATES.map((gate) =>
  gate.aliases.length > 0 ? `${gate.objectName} (${gate.aliases.join(", ")})` : gate.objectName,
).join("; ");

export const FORMATS = ["text", "bar", "line", "pie", "table", "source"] as const;
export type Format = (typeof FORMATS)[number];

// Jediný nástroj: Claude z otázky vyplní ZADÁNÍ odpovědi (co spočítat a jak to ukázat).
// Čísla spočítá náš kód (lib/citiq/series.ts), Claude je nevidí, dokud nejsou spočítaná.
export const buildAnswerTool: Anthropic.Tool = {
  name: "build_answer",
  description:
    "Připraví odpověď z dat dopravních senzorů v Olomouci: počty vozidel, které projely branami " +
    "v zadaném čase, a způsob zobrazení (věta, graf, tabulka, nebo odkaz na zdroj dat). " +
    `Brány (název a v závorce přezdívky): ${gateList}.`,
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
