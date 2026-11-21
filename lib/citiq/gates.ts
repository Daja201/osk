// Brány dopravních senzorů a místa složená z víc bran.
// `objectName` jednotlivých bran = přesně `object_name` z CITIQ (view olomouc-traffic-gates, metadata).
// Přezdívky (aliases) jsou naše, doplňujeme je ručně. Skupina (members) = místo s víc branami;
// její součet počítá náš kód (lib/citiq/series.ts), ne Claude.
export type Gate = {
  objectName: string;
  aliases: string[];
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

// Kolik míst nejvýš v jedné odpovědi (víc už se do grafu nevejde čitelně).
export const MAX_GATES = 12;

// Jednotlivé brány z CITIQ (bez skupin), včetně těch, které teď nevysílají.
export const KNOWN_GATES = GATES.filter((gate) => !gate.members).map((gate) => gate.objectName);

export function normalizeGateName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // bez diakritiky, aby se nemuselo trefit do háčků a čárek
    .replace(/\s+/g, " ");
}

// Najde bránu nebo skupinu podle názvu či přezdívky (bez ohledu na velikost písmen a diakritiku).
export function resolveGate(name: string): Gate | null {
  const wanted = normalizeGateName(name);
  return (
    GATES.find((gate) => normalizeGateName(gate.objectName) === wanted) ??
    GATES.find((gate) => gate.aliases.some((alias) => normalizeGateName(alias) === wanted)) ??
    null
  );
}

// Senzory (jednotlivé brány), ze kterých se místo počítá.
export function sensorsOf(gate: Gate): string[] {
  return gate.members ?? [gate.objectName];
}
