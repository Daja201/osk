# Zadání pro Claude Code: UI „Zeptej se Olomouce“ (design A, verze 2)

Stavíš uživatelské rozhraní. Data, volání Clauda (Haiku) a kontrolu čísel dělá David ve svých souborech. Dokud nebude hotové `/api/ask`, stavíš UI proti testovacím odpovědím v `docs/design/fixtures/`.

Aplikace má dvě stránky:
- `/`: jednoduchá stránka pro běžné občany (úvod před otázkou, pak odpověď),
- `/jak-to-vime`: přehledná, ale podrobná stránka se vším, co je za odpovědí.

## Pravidla

- Jsem začátečník a chci kódu rozumět. Po každé fázi mi česky ve 3–5 bodech vysvětli, co jsi udělal a proč. Kód mi ukazuj jen v podstatných částech.
- **Po každé fázi se zastav a počkej na můj souhlas.** Commituj jen s mým souhlasem a navrhni commit message.
- Pracuj ve větvi `jachym`. Neměň Davidovy soubory (`lib/data/*`, `lib/ai/*`, `app/api/*`, `gates.json`). Když od nich něco potřebuješ, napiš mi to.
- `.env.local` nikdy nečti ani nevypisuj.
- TypeScript: žádné `any`, žádné `ignoreBuildErrors`. Typy odvozuj ze Zod přes `z.infer`.
- Nové závislosti jsou jen `@fontsource/barlow` a `@fontsource/barlow-semi-condensed`. Nic dalšího bez ptaní: žádné UI knihovny (shadcn, MUI), ikonové knihovny, knihovny na grafy ani animace. Ikony dělej jako inline SVG.
- Nikdy nepoužívej `--force`, `--legacy-peer-deps` ani `npm audit fix --force`. Žádné `next/font/google`: build musí projít bez internetu.
- **Vzhled ber z HTML návrhů v `docs/design/`.** Styly jsou v nich inline. Převeď je do Tailwindu a neměň barvy, písma, rozměry ani texty. Texty přeber doslova. Když něco nejde udělat přesně, zeptej se.
- Nepřidávej nic, co v návrhu není: žádné gradienty, stíny, emoji, animace, tmavý režim ani „AI“ ikonky.

## Soubory v `docs/design/`

- `uvod.html`: úvod před otázkou.
- `odpoved.html`: odpověď pro občany.
- `jak-to-vime.html`: podrobná stránka.
- `stav-chybejici-data.html` a `stav-mimo-tema.html`: stavy ze starší verze návrhu. Převezmi z nich jen čárkovaný a šrafovaný sloupec v grafu, varovnou dodatkovou tabulku a šedou tabuli pro „nevím“. Hlavičku, větu a velké číslo dělej jako v `odpoved.html`.
- `fixtures/ok.json`, `partial.json`, `out-of-scope.json`, `error.json`: testovací odpovědi `/api/ask`.
- `icon.svg`: favicon.

Návrhy otevřeš v prohlížeči. Odkazy mezi nimi fungují.

## Kontrakt odpovědi `/api/ask` (návrh, musí ho odsouhlasit David)

UI volá `GET /api/ask?q=<otázka>` a dostane JSON v tvaru jako `fixtures/ok.json`:

- `question`: string
- `kind`: `"answer" | "out_of_scope" | "error"`
- `sentence`: string | null. Věta, která se ukáže.
- `sentence_by`: `"ai" | "code" | "fixed" | null`. Kdo větu napsal: AI, náš kód (když AI napsala číslo, které nesedělo), nebo pevný text.
- `main_number`: `{ value: number, text: string } | null`. Velké číslo, `text` je přesně tak, jak je napsané ve větě.
- `number_checks`: pole `{ text, value, start, end, status: "verified" | "allowed" | "mismatch", explanation }`. `start` a `end` jsou pozice ve větě.
- `labels`: `{ place, scope, sensors: string[] } | null`. Lidské názvy místa (David je bere z `gates.json`).
- `tool_call`: `{ name, input } | null`. Co AI vybrala, `input` i s `date_assumed`.
- `envelope`: Davidova obálka `{ ok, data | error, meta }` | null. Když existuje `lib/contract.ts`, použij jeho schéma.
- `timings_ms`: `{ choose?, compute?, write?, check?, total }`
- `model`: string, `model_calls`: number

## Design tokeny (Tailwind 4, `app/globals.css`)

```css
@theme {
  --color-tabule: #0B4F96;
  --color-ink: #14243A;
  --color-muted: #4B5A6B;
  --color-band: #EEF2F6;
  --color-line: #D5DDE5;
  --color-grid: #DCE3EA;
  --color-bar: #7D95B0;
  --color-marking: #FFC21A;
  --color-slate: #3D4B5C;
  --color-on-sign-muted: #D6DEE7;
  --color-ok: #1E7B45;
  --color-bad: #B3261E;
  --font-sans: "Barlow", system-ui, sans-serif;
  --font-sign: "Barlow Semi Condensed", "Arial Narrow", sans-serif;
}
```

Základ: bílé pozadí, text `ink`, Barlow 18px a řádkování 1,5. Kontejner má max. 1120 px s odsazením 32 px, sloupec s odpovědí max. 880 px. Všechny prvky mají viditelný focus: `outline: 3px solid ink; outline-offset: 3px; box-shadow: 0 0 0 7px marking`.

## Klíčové prvky (přesné hodnoty najdeš v HTML)

- **Tabule s odpovědí:** vnější blok `bg-tabule`, zaoblení 18 px, padding 10 px. Vnitřní blok má bílý rámeček 3 px, zaoblení 11 px, padding 34/40/40 px a bílý text. Pro „nevím“ má vnější blok barvu `slate`.
- **Věta s velkým číslem:** větu rozděl na úseky podle `number_checks`: obyčejný text, ověřené číslo, hlavní číslo.
  - 1. řádek: všechno před hlavním číslem, 34 px.
  - 2. řádek: hlavní číslo (Semi Condensed 700, 132 px) a hned za ním první slovo, které následuje, např. „aut,“ (52 px).
  - 3. řádek: zbytek věty, 34 px.
  - Ověřená čísla (`verified`) mají žluté podtržení: barva `marking`, tloušťka 4 px, odsazení 7 px, `text-decoration-skip-ink: none`, `white-space: nowrap`. Hlavní číslo má podtržení 8 px s odsazením 14 px. Čísla `allowed` (např. 17 z názvu ulice) nepodtrhávej.
  - Když hlavní číslo ve větě nenajdeš, ukaž celou větu ve velikosti 28 px s podtrženými čísly.
  - Rozdělování dej do čisté funkce v `lib/ui/` a napiš na ni testy.
- **Dodatková tabulka:** visí pod tabulí uprostřed. Bílé pozadí, rámeček 3 px `ink`, zaoblení 8 px, Semi Condensed 600 20 px. Obsah: datum a rozsah, např. „Čtvrtek 19. 11. 2026, oba směry dohromady“. Pro každou položku `meta.notes` přidej další tabulku s ikonou trojúhelníku.
- **Řádek legendy:** malá modrá ukázka čísla se žlutým podtržením a text „Žlutě podtržená čísla ověřil náš kód v datech. Větu napsala AI.“ Když je `sentence_by` `"code"`, místo toho napiš: „Větu složil náš kód, protože AI napsala číslo, které nesedělo.“
- **Směrová tabule (odkaz):** Next `<Link>` ze tří vnořených prvků. `clip-path` dej přes `style={{ clipPath: … }}`, ne přes Tailwind.
  - „Jak to víme“ (doprava): vnější `tabule`, padding 5 px, `polygon(0 0, calc(100% - 34px) 0, 100% 50%, calc(100% - 34px) 100%, 0 100%)`. Prostřední bílý, padding 3 px, špička 29 px. Vnitřní `tabule`, výška 56 px, špička 26 px, text Semi Condensed 700 27 px bílý.
  - „Zpět na odpověď“ (doleva): vnější `ink`, padding 3 px, `polygon(26px 0, 100% 0, 100% 100%, 26px 100%, 0 50%)`. Vnitřní bílý, výška 48 px, špička 23 px, text `ink` 600 21 px.
- **Tabulky s názvy ulic („Kde senzory měří“):** bílé, rámeček 2 px `ink`, zaoblení 7 px, `box-shadow: inset 0 0 0 3px #fff, inset 0 0 0 5px ink`, Semi Condensed 600 22 px. Kliknutí položí otázku „Kolik aut včera projelo ulicí {název}?“ (u Parkoviště Flora „Kolik aut včera přijelo na parkoviště Flora?“). Seznam míst je zatím konstanta v UI s poznámkou TODO (později z `gates.json`). Tlačítko „Všechna místa měření“ zatím vynech.
- **Graf po hodinách:** vlastní komponenta z divů (žádná knihovna).
  - Výška 220 px, spodní osa 2 px `ink`. Pomocné čáry 1 px `grid` s popisky vlevo (sloupec 44 px, 13 px `muted`). Hodnoty os spočítej funkcí `niceAxis(max)`, pro maximum 1 318 vyjde osa do 1 500 s čarami 500 a 1 000.
  - 24 sloupců s mezerou 4 px. Sloupec má šířku 100 % (max. 24 px), nahoře zaoblení 4 px a barvu `bar`. Špička (`data.peak.hour`) má barvu `tabule` a nad sebou hodnotu (15 px, 600).
  - `missing`: souvislé chybějící hodiny jako jeden pruh s čárkovaným rámečkem 2 px `muted` (bez spodku), pozadím `#F3F5F8` a nápisem „chybí“.
  - `suspect`: šrafování `repeating-linear-gradient(135deg, #4B5A6B 0 2px, #FFFFFF 2px 6px)`, rámeček 2 px `muted` a nad sloupcem „nejistá“.
  - Popisky osy x jsou 0:00, 6:00, 12:00 a 18:00 (každý přes 6 sloupců).
  - Každý sloupec má `title` („7:00–8:00: 1 318 aut“) a graf jako celek `role="img"` se shrnutím v `aria-label`.
  - Pod grafem je věta „Nejvíc aut jelo mezi 7:00 a 8:00, nejméně mezi 3:00 a 4:00.“ (z `peak` a `low`). Když jsou chybějící nebo nejisté hodnoty, přidej legendu.
- **Cesta odpovědi (na `/jak-to-vime`):** schéma jako tramvajová linka. Svislá čára 6 px `tabule`, zastávky jsou markery.
  - Krok AI: kolečko 24 px s bílou výplní a rámečkem 5 px `tabule`.
  - Krok kódu: čtvereček 22 px `ink` s bílým prstencem 3 px.
  - Začátek a konec: plné kolečko 28 px `ink`.
  - Vpravo u každé zastávky je čas („0,7 s“, pod 100 ms „pod 0,1 s“).
- **Formátování (`lib/ui/format.ts` + testy):** `Intl.NumberFormat('cs-CZ')` → „15 325“ s pevnou mezerou, hodiny „7:00–8:00“, datum „čtvrtek 19. 11. 2026“, čas stažení „dnes ve 22:14“ a uvozovky „…“.

## Fáze

### Fáze 0: stav (jen čtení, nic neměň)
1. `git status`, `git branch --show-current`, `git log --oneline -5`.
2. Přečti `CLAUDE.md`, `docs/SPEC.md` (pokud existuje), `lib/contract.ts` (pokud existuje), `app/layout.tsx`, `app/page.tsx`, `app/globals.css` a `package.json`.
3. Projdi všechny soubory v `docs/design/`.
4. Napiš mi, co už v repu je (kontrakt, `/api/ask`, písma) a kde se repo rozchází s tímhle zadáním. **Stop.**

### Fáze 1: základ
1. `npm install @fontsource/barlow @fontsource/barlow-semi-condensed`.
2. `app/layout.tsx`:
   - odstraň `next/font/google`,
   - importuj řezy Barlow 400/500/600 a Barlow Semi Condensed 500/600/700 (např. `import "@fontsource/barlow/400.css"`),
   - nastav `<html lang="cs">`,
   - metadata: title „Zeptej se Olomouce“, description „Odpovědi na otázky o dopravě v Olomouci z dat městských senzorů.“
3. `app/globals.css`: tokeny výše, základní styl `body` a focus.
4. Zkopíruj `docs/design/icon.svg` do `app/icon.svg` a smaž `app/favicon.ico`. Grepem ověř, že se nepoužívají soubory šablony v `public/` (`file.svg`, `globe.svg`, `next.svg`, `vercel.svg`, `window.svg`), a smaž je.
5. Spusť `npx tsc --noEmit` a `npm run lint`. **Stop.**

### Fáze 2: kontrakt a testovací data
1. Navrhni Zod schéma `AskResponseSchema` podle kontraktu výše a `fixtures/ok.json`. Obálku převezmi z `lib/contract.ts`, pokud existuje. **Ukaž mi ho a zastav se:** musím ho odsouhlasit s Davidem.
2. Po souhlasu ho zapiš. Pokud existuje `lib/contract.ts`, patří tam, jinak do `lib/ask-contract.ts`. Přidej Vitest test, který všechny 4 fixtures projde přes `AskResponseSchema.parse`.
3. Do `lib/ui/format.ts` dej funkce na formátování, rozdělení věty a `niceAxis` a k nim testy.
4. `lib/ui/ask-client.ts`: funkce `getAnswer(question)`.
   - Když URL obsahuje `?fixture=ok|partial|out-of-scope|error`, vrátí odpovídající fixture. Čti z `window.location.search` až při odeslání otázky, ne přes `useSearchParams`, ať není potřeba Suspense.
   - Jinak zavolá `fetch('/api/ask?q=…')` a výsledek ověří přes Zod.
   - Při chybě vrátí odpověď typu `error`.
5. `npm test`. **Stop.**

### Fáze 3: stránka pro občany `/`
1. `app/ask-context.tsx` (`"use client"`): provider v `layout.tsx`, drží `{ question, response, status }` a funkci `ask(q)`. Layout se při navigaci nepřekresluje, takže odpověď přežije přechod na `/jak-to-vime` a zpět.
2. Komponenty do `app/components/`: Brand, QuestionForm, SensorPlates, AnswerSign, SupplementaryPlate, NumberMark, HourlyChart, DirectionSign, Footer.
3. Před otázkou se ukazuje `uvod.html`, po odpovědi `odpoved.html`. Při odeslání má tlačítko text „Počítám…“ a je vypnuté. Pod polem je text „Počítám z dat senzorů…“ (`aria-live="polite"`). Žádné falešné animace kroků.
4. Mobil (šířka 390 px):
   - tabule: padding 6 px, rámeček 2 px,
   - velikosti věty: 22 px / číslo 76 px / slovo za ním 30 px / zbytek 22 px,
   - graf: výška 150 px, mezery mezi sloupci 2 px,
   - pole pro otázku a tlačítko pod sebou. **Stop.**

### Fáze 4: `/jak-to-vime`
1. Stránka čte odpověď z contextu. Když žádná není, ukáž „Nejdřív se zeptejte.“ a směrovou tabuli zpět na `/`.
2. Sekce podle `jak-to-vime.html`: tabule zpět, nadpis, otázka a odpověď, Cesta odpovědi, Data po hodinách (3 sloupce po 8 řádcích, `tabular-nums`, špička tučně, chybějící hodina „chybí“, nejistá hodnota „nejistá“), tlačítko „Stáhnout data jako CSV“ (Blob v prohlížeči), Zdroj dat, Co data neumí a Pro vývojáře (`tool_call` v `<pre>`).
3. Zastávky Cesty odpovědi:
   - Vaše otázka.
   - AI vybrala, co spočítat: výpočet, místo, den, a když je `date_assumed`, štítek „předpoklad AI“. Pak hodiny a model.
   - Náš kód spočítal výsledek z dat: úplnost, celkem, nejvíc, nejméně.
   - AI napsala větu. Když je `sentence_by` `"code"`, zastávka je „Náš kód složil větu sám“ a má marker kódu.
   - Náš kód zkontroloval každé číslo ve větě: tabulka z `number_checks` se stavy „✓ sedí“, „povoleno“ a „✗ nesedí“.
   - Odpověď zobrazena: celkový čas a kolikrát jsme volali model.
   
   Pro `out_of_scope`: Vaše otázka → AI nenašla vhodný výpočet → Aplikace odpověděla pevnou větou → konec. Pro `error`: zastávka kódu „Data se nepodařilo stáhnout“ s `error.message`. **Stop.**

### Fáze 5: stavy
1. `partial`: pruh „chybí“, šrafovaný nejistý sloupec, legenda a varovné dodatkové tabulky z `meta.notes`.
2. `out_of_scope`: šedá tabule s nadpisem „Na tohle odpověď nemám.“ (52 px) a vysvětlujícím textem, dodatková tabulka „Pevná odpověď aplikace, AI ji nepsala“, pak „Zkuste se zeptat třeba“ a 3 tlačítka s otázkami.
3. `error`: bílý panel s rámečkem 3 px `ink`, text „Data se teď nepodařilo stáhnout.“ a tlačítko „Zkusit znovu“.
4. Všechny 4 stavy ověř přes `?fixture=…`. **Stop.**

### Fáze 6: kontrola
1. `npx tsc --noEmit`, `npm run lint`, `npm test`, `npm run build`. Build zkus i s vypnutou Wi-Fi.
2. Projdi stránky v šířce 1280 a 390 px a celé je proklikej klávesou Tab.
3. Napiš mi, co zbývá a co potřebuju od Davida.

## Hotovo, když
- stránky vypadají jako HTML v `docs/design/` (barvy, písma, velikosti, texty),
- všechny 4 fixtures se zobrazí bez chyb v konzoli,
- žádné `any`, build projde bez internetu,
- všude je české formátování (15 325, 7:00–8:00, „…“),
- funguje ovládání klávesnicí a focus je vidět.
