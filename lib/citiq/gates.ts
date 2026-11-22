// Brány dopravních senzorů a místa složená z víc bran.
// `objectName` jednotlivých bran = přesně `object_name` z CITIQ (view olomouc-traffic-gates, metadata).
// Přezdívky (aliases) jsou naše, doplňujeme je ručně. Skupina (members) = místo s víc branami;
// její součet počítá náš kód (lib/citiq/series.ts), ne Claude.
export type Gate = {
  objectName: string;
  aliases: string[];
  members?: string[];
  location?: { lat: number; lon: number }; // z metadat CITIQ (olomouc-traffic-gates/metadata), jen u bran ve skupinách
  label?: string; // název pro lidi, když se liší od objectName
  // Sečíst brány i tehdy, když jsou daleko od sebe (uživatel si o součet výslovně řekl).
  // Výsledek dostane poznámku, že stejné auto může být v součtu dvakrát.
  combine?: boolean;
};

export const GATES: Gate[] = [
  {
    objectName: "17. listopadu (obě brány)",
    aliases: ["17. listopadu", "ulice 17. listopadu"],
    members: ["17.listopadu JIH", "17.listopadu Sever"],
  },
  {
    objectName: "17. listopadu (součet bran)",
    aliases: ["17. listopadu dohromady", "17. listopadu sečteno"],
    members: ["17.listopadu JIH", "17.listopadu Sever"],
    label: "17. listopadu (součet bran)",
    combine: true,
  },
  { objectName: "17.listopadu JIH", aliases: ["17. listopadu, jižní brána"], label: "17. listopadu (jih)", location: { lat: 49.589588, lon: 17.26064 } },
  { objectName: "17.listopadu Sever", aliases: ["17. listopadu, severní brána"], label: "17. listopadu (sever)", location: { lat: 49.595013, lon: 17.265114 } },
  {
    objectName: "Kafkova (obě brány)",
    aliases: ["Kafkova"],
    members: ["Kafkova - levá", "Kafkova - pravá"],
  },
  { objectName: "Kafkova - levá", aliases: [], location: { lat: 49.573565, lon: 17.228505 } },
  { objectName: "Kafkova - pravá", aliases: [], location: { lat: 49.573774, lon: 17.228933 } },
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

// Brány skupiny dál od sebe než tohle neměří stejné auta jednou: auto, které projede celou ulicí,
// by se v součtu počítalo dvakrát. Takové skupiny proto nesčítáme a vracíme každou bránu zvlášť.
// 17. listopadu: jižní a severní brána jsou 684 m od sebe → zvlášť. Kafkova: 39 m (dva pruhy vedle sebe) → součet.
export const MAX_GROUP_SPREAD_M = 50;

// Vzdálenost dvou bodů v metrech (haversine, na pár set metrů je přesná dost).
export function distanceM(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLon = (b.lon - a.lon) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(h));
}

// Místa, za která se počítá samostatné číslo: brána, skupina blízkých bran (součet), nebo u vzdálené
// skupiny její jednotlivé brány. Směry IN a OUT jedné brány se sčítají vždy (to jsou jen směry).
export function placesOf(gate: Gate): Gate[] {
  if (!gate.members || gate.combine) return [gate];
  const members = gate.members.map((name) => GATES.find((g) => g.objectName === name)).filter((g): g is Gate => g !== undefined);
  const spread = members.some((a) => members.some((b) => a.location && b.location && distanceM(a.location, b.location) > MAX_GROUP_SPREAD_M));
  return spread ? members : [gate];
}

// Název místa pro lidi: skupina „17. listopadu (obě brány)“ → „17. listopadu“, brána „17.listopadu JIH“ → „17. listopadu (jih)“.
export function placeName(gate: string): string {
  return GATES.find((g) => g.objectName === gate)?.label ?? gate.replace(/\s*\(obě brány\)$/, "");
}

// Popis datasetu pro lidi (panel „Co za data mám“ pod polem pro otázku). Zdroj: metadata CITIQ olomouc-traffic-gates.
export const TRAFFIC_DATASET = {
  title: "Doprava",
  description: "Počty vozidel, která projela dopravními branami, po hodinách, zhruba od září 2024. Vjezdy i výjezdy.",
  // Místa tak, jak je počítáme: brány mimo skupiny a skupiny (vzdálená skupina rozdělená na brány).
  places: GATES.filter((gate) => !gate.combine && !GATES.some((group) => group.members?.includes(gate.objectName)))
    .flatMap(placesOf)
    .map((gate) => placeName(gate.objectName)),
};

// Největší vzdálenost mezi branami skupiny v metrech (null = nejde o skupinu nebo chybí souřadnice).
export function groupSpreadM(gate: Gate): number | null {
  const members = (gate.members ?? []).map((name) => GATES.find((g) => g.objectName === name)?.location).filter((l) => l !== undefined);
  if (members.length < 2) return null;
  return Math.max(...members.flatMap((a) => members.map((b) => distanceM(a, b))));
}
