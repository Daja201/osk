// Brány pro AI. `objectName` jsou přesně názvy z KNOWN_GATES v lib/citiq/traffic.ts (Davidův
// ověřený seznam z metadat CITIQ). Když David seznam změní, je potřeba změnit i tady.
// TODO: požádat Davida o export KNOWN_GATES, ať seznam není na dvou místech.
// Přezdívky (aliases) jsou naše, doplňujeme je ručně.
export type Gate = {
  objectName: string;
  aliases: string[];
  // Skupina = místo s víc branami. Součet členů počítá náš kód (lib/ai/ask.ts), ne Claude.
  members?: string[];
};

export const GATES: Gate[] = [
  {
    objectName: "17. listopadu (obě brány)",
    aliases: ["17. listopadu", "ulice 17. listopadu"],
    members: ["17.listopadu JIH", "17.listopadu Sever"],
  },
  { objectName: "17.listopadu JIH", aliases: ["17. listopadu, jižní brána"] },
  { objectName: "17.listopadu Sever", aliases: ["17. listopadu, severní brána"] },
  {
    objectName: "Kafkova (obě brány)",
    aliases: ["Kafkova"],
    members: ["Kafkova - levá", "Kafkova - pravá"],
  },
  { objectName: "Kafkova - levá", aliases: [] },
  { objectName: "Kafkova - pravá", aliases: [] },
  { objectName: "Aksamitova/Vídeňská", aliases: ["Aksamitova", "Vídeňská"] },
  { objectName: "Billa (Hynaisova)", aliases: ["u Billy", "Hynaisova"] },
  { objectName: "Fisherova", aliases: [] },
  { objectName: "Fugnerova", aliases: [] },
  { objectName: "Parkoviště Flora", aliases: ["Flora", "parkoviště u Flory"] },
  { objectName: "Peškova", aliases: [] },
  { objectName: "Trnkova/Rooseveltova", aliases: ["Rooseveltova"] },
  { objectName: "Trnkova/Zítkova", aliases: ["Trnkova", "Zítkova"] },
  { objectName: "Tržnice/Polská", aliases: ["tržnice", "Polská"] },
  { objectName: "U Letadla", aliases: ["Letadlo"] },
  { objectName: "Voskovcova", aliases: [] },
  { objectName: "Zikova", aliases: [] },
  { objectName: "Šmeralova IN", aliases: ["Šmeralova dovnitř"] },
  { objectName: "Šmeralova OUT/17.listopadu", aliases: ["Šmeralova ven na 17. listopadu"] },
  { objectName: "Šmeralova OUT/Blahoslavova", aliases: ["Šmeralova ven na Blahoslavovu"] },
];

export const GATE_NAMES = GATES.map((gate) => gate.objectName);
