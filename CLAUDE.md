@AGENTS.md

# osk – Zeptej se Olomouce: pravidla pro Claude Code

Název repa `osk` = **O**lomouc + a**sk**.

Hackathon UPOL 20.–22. 11. 2026, tým SleepNotFound: **Jáchym** (AI vrstva + stránka), **David** (data).
Podrobná specifikace je v `docs/SPEC.md`, pořadí kroků a prompty v `docs/PROMPTY.md`. Před každým úkolem si přečti sekce, na které úkol odkazuje.
Ověřená fakta o datech jsou v `docs/data-notes.md` (vznikne v kroku D1) a mají přednost před hypotézami ve SPEC.
Když se SPEC a kód rozcházejí, zeptej se. Nic neopravuj potichu.

## Odchylky od SPEC a PROMPTY (platí tento soubor)
SPEC a PROMPTY vznikly při přípravě a nechávají se beze změny. Na místě jsme rozhodli jinak:
- **TypeScript, ne JavaScript** (pátek 20. 11., 19:42). Kde SPEC/PROMPTY píše `.js`, platí `.ts` (`.tsx` u komponent). Kde píše `.mjs` skript, platí `.ts` skript spouštěný přes tsx. Testy jsou `tests/**/*.test.ts`.
- **Git:** každý má svou větev (`jachym`, `dave`), do `main` se spojuje přes pull request. Ne „všichni přímo v main“.
- **Kostra** vznikla jinak než v kroku 0 (Davidova `create-next-app`, repo `osk`). Krok 0 je hotový, zip `hackathon-start.zip` se nepoužil.
- **Datová vrstva je Davidova a její rozhraní platí** (rozhodnuto v pátek 20. 11. večer). David ji psal podle projektového dokumentu (`docs/main-docs`), ne podle SPEC. Kontrakt mezi částmi jsou typy v `lib/citiq/traffic.ts` (`TrafficCountParams = { gate, direction: "in" | "out", date }`, `TrafficCountResult`), ne SPEC §3/§4.1. Kód je v `lib/citiq/`, ne v `lib/data/`. AI vrstva (`lib/ai/`) se přizpůsobuje jemu. Když něco v jeho rozhraní chybí, navrhni to Davidovi, neměň jeho soubory.
- Ověřené poznatky o CITIQ API jsou v `docs/api` (např. bez `measurement_keys` vrací prázdné `results`).

## Co stavíme
Webová aplikace, kde člověk napíše česky otázku o dopravě v Olomouci (např. „Kolik aut projelo včera ulicí 17. listopadu?“).
1. Claude (`claude-haiku-5-5`) vybere nástroj a parametry.
2. Náš kód spočítá výsledek z dat dopravních senzorů (CITIQ / EnCLOD).
3. Claude z výsledku napíše jednu větu.
4. Kód zkontroluje každé číslo v té větě.
5. Stránka ukáže větu, velké číslo, graf po hodinách, „Původ odpovědi“ a „Jak AI postupovala“.

Když data chybí nebo otázka nejde zodpovědět, aplikace řekne „nevím“ a proč.

**Hlavní princip: Claude nepočítá.** Claude vybírá nástroj a formuluje větu. Všechna čísla počítá náš kód a kód je ve větě kontroluje.

## Technologie (neměnit bez dotazu)
- Next.js 16 (App Router), **TypeScript** (strict), Tailwind 4, ESLint, npm.
- V `package.json` je `"type": "module"`.
- Balíčky: `@anthropic-ai/sdk` 1.x, `zod` 4, `luxon` (časové zóny), `vitest`, `tsx` (spouštění `.ts` skriptů). Další balíčky nepřidávej bez mého souhlasu.
- Žádné `any`, žádné `ignoreBuildErrors`. Typy odvozuj ze Zod schémat v `lib/contract.ts` (`z.infer`). Pro data z Claude API používej typy z SDK (`Anthropic.MessageParam`, `Anthropic.Tool`…).
- Model je `claude-haiku-5-5` (bere se z env `CLAUDE_MODEL`). Toto ID je správné, ověřené 20. 11. přes `scripts/check-claude.ts`. Neměň ho na starší model, i když ho neznáš. Pro srovnání v evalu `claude-sonnet-5-5`.
- Next.js 16 se liší od toho, co znáš z tréninku. Před psaním route handlerů a stránek se podívej do `node_modules/next/dist/docs/` (viz AGENTS.md).
- `next/font/google` nepoužívat, bez internetu shodí build.
- Nepoužíváme databázi, přihlašování, chat ani streaming.

## Struktura a kdo co vlastní
```
app/layout.tsx, app/page.tsx      Jáchym
app/api/ask/route.ts              Jáchym
app/api/cards/route.ts            David
components/                       Jáchym
lib/config.ts time.ts contract.ts registry.ts    společné (krok A); mění se jen po domluvě
lib/ai/                           Jáchym  (tools, systemPrompt, ask, checkNumbers, fallback, pricing)
lib/citiq/                        David   (client, cache, traffic, …)
lib/mock/                         mock se stejným podpisem jako lib/citiq/ (pro testy bez sítě)
data/gates.json                   David (přezdívky bran doplňuje ručně)
data/raw/                         snímek dat (commituje se)
data/samples/                     vzorky z průzkumu D1
scripts/tool.ts                   společné: ruční spuštění nástroje
scripts/check-claude.ts           společné: test API klíče a modelu
scripts/explore.ts snapshot.ts    David
scripts/eval.ts                   Jáchym
eval/                             otázky + výsledky evalu
tests/                            testy vitest (+ tests/fixtures/)
docs/                             SPEC, PROMPTY, data-notes, ai-usage, prezentace
logs/                             log odpovědí (gitignored)
```
Do cizích složek nesahej. Když je to nutné, napiš proč a počkej na OK.

## Pravidla pro kód
- Identifikátory, klíče v JSON a názvy souborů jsou anglicky (v JSON snake_case, v TS camelCase). Texty pro uživatele a komentáře česky.
- V `lib/` a `scripts/` používej jen relativní importy bez přípony, např. `import { now } from "../time"`. Alias `@/` jen v `app/` a `components/`. Skripty totiž běží přes tsx mimo Next.
- JSON soubory čti přes `fs.readFileSync` + `JSON.parse` s cestou od `process.cwd()` a zvaliduj je Zodem, ne přes `import`.
- Čas: data jsou v UTC, uživatel myslí v Europe/Prague. Všechny převody dělej jen přes `lib/time.ts` (luxon). Nikdy nepočítej s pevným posunem +1 h a nepoužívej `new Date().getHours()`.
- Nástroje vrací vždy obálku `{ ok, data | error, meta }` podle typů v `lib/citiq/traffic.ts`.
- Chybějící hodnota je `null` se statusem `"missing"`, nikdy 0.
- Funkce v `lib/citiq/` jsou async; mock v `lib/mock/` má stejný podpis.
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
- `npm run tool -- <nástroj> '<json params>'`: spustí nástroj a vypíše obálku
- `npm run explore`: průzkum dat (D1)
- `npm run snapshot`: stáhne snímek 30 dní do `data/raw/`
- `npm run eval -- --set dev --model claude-haiku-5-5`: eval
- `node --env-file=.env.local --import tsx scripts/check-claude.ts`: test API klíče a modelu

## Proměnné prostředí (`.env.local`, vzor v `.env.example`)
| Proměnná | Význam |
| --- | --- |
| `ANTHROPIC_API_KEY` | klíč k Claude API |
| `CLAUDE_MODEL` | výchozí `claude-haiku-5-5` |
| `DATA_SOURCE` | `mock` nebo `real` |
| `OFFLINE` | `1` = žádná síť, jen `data/raw/` |
| `APP_NOW` | pevné „teď“ pro eval a demo, např. `2026-11-20T18:00:00+01:00` |
| `CITIQ_BASE_URL` | výchozí `https://iot.citiq.cloud/portal/api/v2/view` |

## Slepé uličky (už jsme na ně narazili)
- `npm install -D vitest` v TS šabloně → ERESOLVE kvůli `@types/node` ^20. Nejdřív `npm install -D @types/node@24`.
- `next/font/google` shodí build bez internetu.
- Top-level `await` ve skriptu padal, dokud `package.json` neměl `"type": "module"`.
- `tsc` hlásí „Cannot find name 'LayoutProps'“ → chybí vygenerované typy, spusť `npx next typegen`.
- Prompt sám jako pojistka nestačí: Claude odpovídal z hlavy, doplňoval dnešní datum, odvozoval hodiny z pozic v poli a psal markdown. Proto čísla kontroluje kód.
- Přesná data CITIQ dá jen skript (D1), ne WebFetch (vynechává části).
