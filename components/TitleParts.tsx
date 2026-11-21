// Nadpis „Počet vozidel · 17. listopadu · 20. 11. 2026“: řádek se zalomí jen mezi částmi, ne uvnitř nich
// (žádné „20. 11.“ na jednom řádku a „2026“ na dalším). Dlouhá část se zalomí sama (max-w-full + wrap).
export default function TitleParts({ title }: { title: string }) {
  const parts = title.split(" · ");
  return parts.map((part, i) => (
    <span key={i}>
      <span className={part.length <= 28 ? "whitespace-nowrap" : undefined}>
        {part}
        {i < parts.length - 1 && " ·"}
      </span>
      {i < parts.length - 1 && " "}
    </span>
  ));
}
