# OSK

OSK je česká webová aplikace pro dotazy k otevřeným měřením ze sítě CITIQ v Olomouci.
Zeptáte se přirozeně, například „Kolik aut včera projelo u Billy?“, a aplikace spočítá
odpověď z dat a zobrazí ji jako větu, graf, tabulku nebo odkaz na zdroj.

V současnosti podporuje:
- průjezdovou dopravu v Olomouci,
- meteorologická měření z olomouckých stanic,
- stahování a sdílení výsledků.

## Stažení a spuštění

Požadavky: Node.js 20+, npm.

```bash
git clone https://github.com/Daja201/osk.git
cd osk
npm ci
```

Vytvořte soubor `.env.local`:

```env
ANTHROPIC_API_KEY=váš-klíč
CLAUDE_MODEL=název-modelu
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

`ANTHROPIC_API_KEY` je povinný pro dotazy. `CLAUDE_MODEL` nastavte na model dostupný
ve vašem Anthropic účtu. `NEXT_PUBLIC_SITE_URL` je volitelný pro místní vývoj.
CLI příkaz `npm run ask` načítá stejné proměnné ze souboru `.env` (nebo můžete hodnoty
exportovat v terminálu).

Spusťte aplikaci:

```bash
npm run dev
```

Otevřete <http://localhost:3000>.

Další příkazy:

```bash
npm run build
npm run lint
npm test
npm run ask -- "Kolik aut včera projelo u Billy?"
```

Pro ověření Anthropic připojení použijte
`node --env-file=.env.local --import tsx scripts/check-claude.ts`.

## Jak implementovat nový dataset

CITIQ data se načítají přes [lib/citiq/client.ts](lib/citiq/client.ts).
Přidejte nový dataset malými kroky:

1. Nastavte `view`, měřené klíče a parametry dotazu podle odpovědi CITIQ.
2. Přidejte seznam názvů a přezdívek míst/stanic do souboru [lib/citiq/gates.ts](lib/citiq/gates.ts)
   nebo vytvořte podobnou konfiguraci pro nový typ.
3. Přidejte parser a výpočet dat, například podle [lib/citiq/parse.ts](lib/citiq/parse.ts)
   a [lib/citiq/series.ts](lib/citiq/series.ts).
4. Popište nový nástroj pro Claude a jeho vstupní pole v [lib/ai/tools.ts](lib/ai/tools.ts).
5. Připojte výpočet do [app/api/ask/route.ts](app/api/ask/route.ts)
   a přidejte krátká pravidla pro nový typ dotazu do [lib/ai/systemPrompt.ts](lib/ai/systemPrompt.ts).
6. Přidejte testy parseru a výsledku.

Claude vybírá města, čas, formát a směr. Výpočty a kontrola čísel zůstávají
v našem kódu; Claude by neměl počítat vlastní data.

## Jak části kódu fungují

- `app/page.tsx` a `components/` vykreslují stránku a výsledky.
- `app/api/ask/route.ts` přijímá otázku a volá Claude i výpočet dat.
- `lib/ai/ask.ts` sestaví zadání a rozhoduje o odpovědi.
- `lib/citiq/series.ts` stáhne data po dnech a sestaví hodnoty po hodinách, dnech nebo celkem.
- `lib/citiq/cache.ts` ukládá CITIQ odpovědi do `data/cache/` na 30 dní.
- `lib/answers.ts` uloží sdílenou odpověď na 7 dní.
- `app/a/[id]/page.tsx` zobrazí uloženou odpověď; ostatní API routy poskytují JSON a CSV.

Více podrobností o užívání a datech je v [docs/usage.md](docs/usage.md)
a [docs/data-notes.md](docs/data-notes.md).
