// Karty, které jsou na stránce vždycky a fungují bez AI. Zatím jen zástupné texty,
// data do nich doplníme z Davidových funkcí (stav senzorů, rychlost, Flora).
const cards = [
  { title: "Rychlost", subtitle: "Jak rychle se jezdí na 17. listopadu", placeholder: "[podíl aut nad 60 km/h]" },
  { title: "Parkování", subtitle: "Kdy na Floru přijíždí nejvíc aut", placeholder: "[nejrušnější hodina]" },
  { title: "Stav senzorů", subtitle: "Která čidla fungují a která ne", placeholder: "[kolik vysílá, která ne]" },
];

export default function CityOverview() {
  return (
    <section className="space-y-4 border-t border-neutral-700 pt-6">
      <div>
        <h2 className="text-2xl font-semibold">Přehled města</h2>
        <p className="text-neutral-300">
          Tyhle karty jsou na stránce vždycky, ať se zeptáte na cokoli. Ukazují pár příkladů, co se dá z dat města
          zjistit, a fungují i bez AI.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {cards.map((card) => (
          <article key={card.title} className="rounded-lg border border-neutral-700 p-5">
            <h3 className="text-lg">{card.title}</h3>
            <p className="mb-3 text-neutral-300">{card.subtitle}</p>
            <div className="rounded bg-neutral-800/60 p-4 text-center text-neutral-500">{card.placeholder}</div>
          </article>
        ))}
      </div>

      <article className="rounded-lg border border-dashed border-neutral-700 p-5">
        <h3 className="mb-3 text-lg">Mapa senzorů – volitelně</h3>
        <div className="rounded bg-neutral-800/60 p-10 text-center text-neutral-500">
          [body čidel na OpenStreetMap, zelená vysílá, červená ne]
        </div>
      </article>
    </section>
  );
}
