import type Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { GATES, GATE_NAMES } from "./gates";

const gateList = GATES.map((gate) =>
  gate.aliases.length > 0 ? `${gate.objectName} (${gate.aliases.join(", ")})` : gate.objectName,
).join("; ");

// Definice nástroje pro Claude. Odpovídá Davidově funkci trafficCount({ gate, direction, date }),
// navíc "both" (oba směry sečte náš kód) a date_assumed (jen pro účtenku, funkci se neposílá).
export const trafficCountTool: Anthropic.Tool = {
  name: "traffic_count",
  description:
    "Počet průjezdů vozidel dopravní branou (senzorem) v Olomouci za jeden den nebo vybraný časový rozsah. " +
    "Vrací součet za den, nejrušnější hodinu a poznámky o chybějících datech. " +
    `Brány (název a v závorce přezdívky): ${gateList}.`,
  strict: true,
  input_schema: {
    type: "object",
    properties: {
      gate: { type: "string", enum: GATE_NAMES, description: "Název brány přesně ze seznamu." },
      direction: {
        type: "string",
        enum: ["in", "out", "both"],
        description: "in = dovnitř, out = ven, both = oba směry dohromady. Když otázka směr neurčuje, použij both.",
      },
      date: { type: "string", description: "Den ve formátu YYYY-MM-DD (místní datum v Praze). Nikdy ne budoucnost." },
      date_assumed: { type: "boolean", description: "true, když v otázce nebylo datum a použil jsi včerejšek." },
      hour_from: {
        type: ["integer", "null"],
        description: "Začátek hodiny 0–23 místního času. Bez omezení null.",
      },
      hour_to: {
        type: ["integer", "null"],
        description: "Konec hodiny 1–24 (nezahrnuje se). Bez omezení null.",
      },
    },
    required: ["gate", "direction", "date", "date_assumed", "hour_from", "hour_to"],
    additionalProperties: false,
  },
};

// Stejná pravidla ještě jednou v Zodu. strict hlídá tvar, Zod navíc formát data.
export const TrafficCountInput = z
  .object({
    gate: z.enum(GATE_NAMES as [string, ...string[]]),
    direction: z.enum(["in", "out", "both"]),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    date_assumed: z.boolean(),
    hour_from: z.number().int().min(0).max(23).nullable().optional().transform((value) => value ?? undefined),
    hour_to: z.number().int().min(1).max(24).nullable().optional().transform((value) => value ?? undefined),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.hour_from !== undefined && value.hour_to !== undefined && value.hour_from >= value.hour_to) {
      ctx.addIssue({
        code: "custom",
        message: "hour_from musí být menší než hour_to.",
        path: ["hour_from"],
      });
    }
  });

export type TrafficCountInput = z.infer<typeof TrafficCountInput>;
