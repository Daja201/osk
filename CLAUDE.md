@AGENTS.md

# Osk: pravidla pro Claude Code

Aplikace i repo se jmenují **Osk** = **O**lomouc + a**sk** (náš název). „Zeptej se Olomouce“ ve SPEC a PROMPTY je pracovní název z přípravy.

Hackathon UPOL 20.–22. 11. 2026, tým SleepNotFound: **Jáchym** (AI vrstva + stránka), **David** (data).
Podrobná specifikace je v `docs/SPEC.md`, pořadí kroků a prompty v `docs/PROMPTY.md`. Před každým úkolem si přečti sekce, na které úkol odkazuje.
Ověřená fakta o datech jsou v `docs/data-notes.md` (vznikne v kroku D1) a mají přednost před hypotézami ve SPEC.
Když se SPEC a kód rozcházejí, zeptej se. Nic neopravuj potichu.

## Odchylky od SPEC a PROMPTY (platí tento soubor)
SPEC a PROMPTY vznikly při přípravě a nechávají se beze změny. Na místě jsme rozhodli jinak:
- **TypeScript, ne JavaScript** (pátek 20. 11., 19:42). Kde SPEC/PROMPTY píše `.js`, platí `.ts` (`.tsx` u komponent). Kde píše `.mjs` skript, platí `.ts` skript spouštěný přes tsx. Testy jsou `tests/**/*.test.ts`.
- **Git:** každý má svou větev (`jachym`, `dave`), do `main` se spojuje přes pull request. Ne „všichni přímo v main“.
- **Kostra** vznikla jinak než v kroku 0 (Davidova `create-next-app`, repo `osk`). Krok 0 je hotový, zip `hackathon-start.zip` se nepoužil.
- **Datová vrstva:** původně Davidova (`lib/citiq/traffic.ts`, jedna brána, jeden den). 21. 11. jsme ji předělali na `lib/citiq/series.ts`: víc míst, libovolný rozsah, po hodinách / dnech / celkem. Kontrakt mezi částmi jsou typy v `lib/citiq/series.ts` (`SeriesParams`, `SeriesResult`) a `lib/ai/types.ts` (`AskAnswer`), ne SPEC §3/§4.1. Kód je v `lib/citiq/`, ne v `lib/data/`.
- **Zaměření (změna 21. 11.):** z „odpověď na jednu otázku“ na **generátor grafů, tabulek a dat**, které si kdokoli (student, úředník) zkopíruje nebo pošle odkazem. Odpovědi se ukládají na 7 dní (`/a/<id>`) i s důkazem, odkud čísla jsou.
- Ověřené poznatky o CITIQ API jsou v `docs/api` (např. bez `measurement_keys` vrací prázdné `results`).

## Co stavíme
Webová aplikace, kde člověk napíše česky, co chce vědět nebo vidět o dopravě v Olomouci, např. „Porovnej sloupcovým grafem s červeným pozadím a nadpisem Stav nyní, kolik aut projelo posledních 7 hodin 17. listopadu, Kafkovou a u Billy.“
1. Claude (`claude-haiku-5-5`) vyplní **zadání** v nástroji `build_answer`: formát (věta, sloupcový / čárový / koláčový graf, tabulka, zdroj dat), nadpis, barvu z palety, místa, směr, od–do, rozlišení.
2. Náš kód (`lib/citiq/series.ts`) stáhne data z CITIQ a spočítá je.
3. Graf / tabulku vykreslí náš kód přímo z čísel (bez druhého volání modelu). Jen u formátu `text` napíše Claude větu a kód v ní zkontroluje každé číslo.
4. Odpověď se uloží na 7 dní. Odkaz `/a/<id>` ukáže stejnou grafiku a pod ní důkaz: zadání od AI, všechna čísla, přesné dotazy na API CITIQ.
5. Vzhled jde upravit v editoru (typ, nadpis, barvy, osa, QR) a uložit jako nový odkaz. Graf jde stáhnout jako PNG / SVG, data jako CSV nebo zkopírovat do tabulky.
6. Úprava vzhledu nikdy nemění čísla: kopie s vlastním vzhledem bere data ze souboru na serveru, osa nesmí uříznout sloupce a když nezačíná nulou, graf to označí.

Když data chybí nebo otázka nejde zodpovědět, aplikace řekne „nevím“ a proč. Nepotřebný text (sekce pro vývojáře apod.) se neukazuje; kdo chce data sám, zeptá se na zdroj a dostane odkaz na API.

**Hlavní princip: Claude nepočítá.** Claude jen převádí otázku na zadání (a u formátu text píše větu). Všechna čísla počítá náš kód a kód je ve větě i v nadpisu kontroluje.

Návod k použití pro lidi: `docs/usage.md`.

## Technologie (neměnit bez dotazu)
- Next.js 16 (App Router), **TypeScript** (strict), Tailwind 4, ESLint, npm.
- V `package.json` je `"type": "module"`.
- Balíčky: `@anthropic-ai/sdk` 1.x, `zod` 4, `vitest`, `tsx` (spouštění `.ts` skriptů), `@fontsource/barlow` a `@fontsource/barlow-semi-condensed` (písma hostujeme sami), `qrcode-generator` (MIT, QR kód na odkaz). Další balíčky nepřidávej bez mého souhlasu.
- Žádné `any`, žádné `ignoreBuildErrors`. Typy odvozuj ze Zod schémat v `lib/contract.ts` (`z.infer`). Pro data z Claude API používej typy z SDK (`Anthropic.MessageParam`, `Anthropic.Tool`…).
- Model je `claude-haiku-5-5` (bere se z env `CLAUDE_MODEL`). Toto ID je správné, ověřené 20. 11. přes `scripts/check-claude.ts`. Neměň ho na starší model, i když ho neznáš. Pro srovnání v evalu `claude-sonnet-5-5`.
- Next.js 16 se liší od toho, co znáš z tréninku. Před psaním route handlerů a stránek se podívej do `node_modules/next/dist/docs/` (viz AGENTS.md).
- `next/font/google` nepoužívat, bez internetu shodí build.
- Nepoužíváme databázi, přihlašování, chat ani streaming.

## Struktura a kdo co vlastní
```
app/layout.tsx, app/page.tsx      Jáchym (úvod → odpověď → podrobnosti na jedné adrese)
app/a/[id]/page.tsx               Jáchym: uložená odpověď (7 dní) i s důkazem
app/api/ask/route.ts              Jáchym: otázka → odpověď (a uložení)
app/api/answers/[id]/…            Jáchym: uložená odpověď jako JSON, /csv jako CSV, POST /variant = kopie s upraveným vzhledem
components/                       Jáchym (charts/Chart.tsx = SVG grafy bez knihovny, ChartEditor = editor vzhledu)
lib/ai/                           Jáchym  (tools = build_answer, systemPrompt, ask, checkNumbers, palette, dates)
lib/citiq/                        David + Jáchym (client, cache, parse, gates, series)
lib/answers.ts                    ukládání odpovědí do data/answers/ (gitignored, 7 dní)
lib/csv.ts                        CSV z výsledku (sdílí server i prohlížeč)
lib/view.ts                       vzhled grafu z editoru (ChartView + Zod schéma, kontrola vlastní osy)
lib/ui/                           čisté funkce pro stránku (chart, answer, format, sentence, export, theme, fixtures)
data/cache/                       cache odpovědí CITIQ (gitignored, 30 dní)
scripts/ask.ts                    `npm run ask -- "otázka"`: stejná cesta jako /api/ask, vypíše zadání a data
scripts/check-claude.ts           test API klíče a modelu
tests/                            testy vitest (bez sítě: falešný Claude a falešná cache)
docs/                             SPEC, PROMPTY (příprava), usage, data-notes, backend-todo, design/
```
Do cizích složek nesahej. Když je to nutné, napiš proč a počkej na OK.

## Pravidla pro kód
- Identifikátory, klíče v JSON a názvy souborů jsou anglicky (v JSON snake_case, v TS camelCase). Texty pro uživatele a komentáře česky.
- V `lib/` a `scripts/` používej jen relativní importy bez přípony, např. `import { now } from "../time"`. Alias `@/` jen v `app/` a `components/`. Skripty totiž běží přes tsx mimo Next.
- JSON soubory čti přes `fs.readFileSync` + `JSON.parse` s cestou od `process.cwd()` a zvaliduj je Zodem, ne přes `import`.
- Čas: data jsou v UTC, uživatel myslí v Europe/Prague. Všechny převody dělej jen přes `lib/time.ts` (luxon). Nikdy nepočítej s pevným posunem +1 h a nepoužívej `new Date().getHours()`.
- Výpočet vrací vždy obálku `{ ok, data | error, meta }` podle typů v `lib/citiq/series.ts`.
- Chybějící hodnota je `null` se statusem `"missing"`, nikdy 0.
- Funkce v `lib/citiq/` jsou async. Aplikace volá vždy reálná data (mock jsme 20. 11. zrušili); testy si podstrkují falešnou funkci se stejným podpisem nebo falešnou cache (`vi.mock`).
- Kód, který se dostane do prohlížeče (`lib/ui/`, `lib/ai/tools.ts`, `lib/ai/palette.ts`), nesmí importovat nic s `fs` (cache, `lib/answers.ts`). Typy (`import type`) jsou v pořádku.
- Tajné klíče nesmí být v kódu, v logu ani v commitu. Klíč je jen v `.env.local`. **`.env.local` nečti a nevypisuj.**
- Nepiš kód „pro budoucnost“. Stačí nejjednodušší řešení, které splní úkol a projde testy.
- Testy nesmí volat síť (CITIQ ani Claude). Použij fixtures nebo falešného klienta.

## Jak pracovat (učíme se a musíme kód umět vysvětlit porotě)
1. U většího úkolu nejdřív napiš krátký plán: které soubory a jaké kroky. Počkej na OK.
2. Pracuj po malých krocích. Po každém kroku spusť `npm test`, `npx tsc --noEmit` a `npm run lint`. Když se měnilo něco v `app/` nebo `components/`, spusť i `npm run build`.
3. Když test padá, neupravuj test jen kvůli tomu, aby prošel. Nejdřív mi vysvětli, jestli je špatně kód, nebo test.
4. Na konci úkolu napiš česky:
   - co jsi udělal (max 8 odrážek),
   - co mám ručně zkontrolovat (konkrétní příkazy nebo kroky),
   <!-- TODO: zbytek bodu 4 a body 5–6 se při kopírování originálu ztratily, doplnit. Zachovaný konec: „… jak jsme AI použili.“ -->
   - zápis do `docs/ai-usage.md`: co udělala AI a jaká rozhodnutí a úpravy udělal tým, jak jsme AI použili.
7. Nespouštěj interaktivní příkazy, které čekají na vstup (create-next-app, `npm init` bez `-y` apod.). Dev server spouštěj jen když o to požádám, a pak na pozadí.
8. Když si nejsi jistý API (Anthropic, CITIQ, Next.js), ověř to v dokumentaci nebo v typech v `node_modules`. Nehádej. Tahák k Claude API je v SPEC §12.
9. Nikdy nespouštěj `npm audit fix --force`, `--legacy-peer-deps`, `--force`, `git push --force` ani `rm -rf` mimo `.next/`.
10. Před začátkem úkolu stáhni změny z `main` (`git pull`, případně merge `main` do své větve). Pushuj, jen když projdou testy a build. Bez souhlasu člověka necommituj, nemerguj a nepushuj.

## Příkazy
- `npm run dev`: vývojový server
- `npm test`: testy (vitest)
- `npm run lint`, `npm run build`, `npx tsc --noEmit` (na čistém klonu nejdřív `npx next typegen`)
- `node --env-file-if-exists=.env.local --import tsx scripts/ask.ts "otázka"`: položí otázku skutečnému Haiku a vypíše zadání a data (stojí pár haléřů)
- CITIQ data se automaticky ukládají do `data/cache/`; cache uchovává posledních 30 kalendářních dnů.
- `node --env-file=.env.local --import tsx scripts/check-claude.ts`: test API klíče a modelu

## Proměnné prostředí (`.env.local`, vzor v `.env.example`)
| Proměnná | Význam |
| --- | --- |
| `ANTHROPIC_API_KEY` | klíč k Claude API |
| `CLAUDE_MODEL` | výchozí `claude-haiku-5-5` |
| `DATA_SOURCE` | zatím se nepoužívá (aplikace jede vždy na reálných datech) |
| `NEXT_PUBLIC_SITE_URL` | veřejná adresa aplikace pro QR kódy a odkazy, např. `http://192.168.1.20:3000`; bez ní se použije adresa, ze které je stránka otevřená (na `localhost` QR z telefonu nefunguje) |
| `APP_NOW` | pevné „teď“ pro eval a demo, např. `2026-11-20T18:00:00+01:00` |
| `CITIQ_BASE_URL` | výchozí `https://iot.citiq.cloud/portal/api/v2/view` |

## Slepé uličky (už jsme na ně narazili)
- `npm install -D vitest` v TS šabloně → ERESOLVE kvůli `@types/node` ^20. Nejdřív `npm install -D @types/node@24`.
- `next/font/google` shodí build bez internetu.
- Top-level `await` ve skriptu padal, dokud `package.json` neměl `"type": "module"`.
- `tsc` hlásí „Cannot find name 'LayoutProps'“ → chybí vygenerované typy, spusť `npx next typegen`.
- Prompt sám jako pojistka nestačí: Claude odpovídal z hlavy, doplňoval dnešní datum, odvozoval hodiny z pozic v poli a psal markdown. Proto čísla kontroluje kód.
- Přesná data CITIQ dá jen skript (D1), ne WebFetch (vynechává části).
- Ve strict tool schématu nejde `enum` spojit s `type: ["string", "null"]` (API vrátí 400 „Enum value … does not match declared type“). Použij `anyOf: [{ type: "string", enum: [...] }, { type: "null" }]`. Testy bez sítě to neodhalí, ověř přes `npm run ask`.
- Dev server (Turbopack + `@tailwindcss/turbopack`) občas nezaregistruje změnu `app/globals.css` a dál posílá starou verzi (černý / rozbitý vzhled, staré rámečky). Po úpravě `globals.css` ověř servírované CSS (`curl` na `/_next/static/chunks/*.css`) a když je staré, `touch app/globals.css`; jinak restart `npm run dev` (případně `rm -rf .next`).
- Čas bodu z CITIQ je konec hodinového okna, poslední bod dne má čas `stop` (23:59:59). Hodina = `ceil((T − půlnoc) / 1 h) − 1`, ne `floor`.
