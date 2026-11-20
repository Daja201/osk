// Malý štítek, který říká, odkud část odpovědi pochází (AI, nebo data).
const tones = {
  ai: "bg-indigo-950 text-indigo-300",
  data: "bg-green-950 text-green-400",
  warn: "bg-amber-950 text-amber-300",
} as const;

export default function Badge({ tone, children }: { tone: keyof typeof tones; children: React.ReactNode }) {
  return <span className={`inline-block rounded px-2 py-0.5 text-sm ${tones[tone]}`}>{children}</span>;
}
