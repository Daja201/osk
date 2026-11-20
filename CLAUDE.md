@AGENTS.md

# osk – Zeptej se Olomouce (tým SleepNotFound, hackathon UPOL 20.–22. 11. 2026)

Název repa `osk` = **O**lomouc + a**sk**.

Webová aplikace: člověk napíše česky otázku o dopravě v Olomouci, Claude vybere nástroj a parametry, náš kód spočítá výsledek z dat senzorů CITIQ/EnCLOD, Claude napíše jednu větu, kód zkontroluje každé číslo ve větě. Stránka ukáže větu, velké číslo, graf po hodinách, „Původ odpovědi“ (účtenku) a „Jak AI postupovala“. Když data chybí nebo je otázka mimo téma, aplikace řekne „nevím“ a důvod.

Podrobnosti: `docs/SPEC.md` (specifikace), `docs/PROMPTY.md` (kroky Prompt A, D1–D5, J1–J6). Když se tento soubor rozchází se SPEC nebo PROMPTY, nerozhoduj sám a zeptej se. Výjimka: TypeScript platí vždy (viz níže).

## Kdo co dělá
- Jáchym (větev `jachym`): `lib/ai/*`, AI smyčka a kontrola čísel, stránka, eval runner, přepnutí na real data, README a prezentace.
- David (větev `dave`): `lib/data/*`, průzkum dat CITIQ, `traffic_count` + snapshot, `sensor_status`, `/api/cards`.
- Společný základ (Prompt A: `lib/contract.ts`, `lib/registry.ts`, time, mock) patří do `main`, obě větve z něj vycházejí a často se synchronizují.

## Technologie
- **TypeScript, ne JS.** Rozhodnuto v pátek 20. 11. v 19:42. Platí, i když SPEC, PROMPTY nebo `notes` ještě počítají s JS.
- Next.js 16 (App Router, Turbopack), Tailwind 4, ESLint, npm, Vitest, Zod 4, luxon, `@anthropic-ai/sdk` 1.x.
- Žádné `any`, žádné `ignoreBuildErrors`. Typy a schémata přes Zod v `lib/contract.ts`.
- Bez složky `src/`: `app/` a `lib/` jsou v kořeni repa.
- Skripty: `node --env-file=.env.local --import tsx scripts/X.ts`. `package.json` má `"type": "module"`, takže ve skriptech funguje `await` na nejvyšší úrovni.
- Test API klíče a modelu: `node --env-file=.env.local --import tsx scripts/check-claude.ts`.
- Kontrola: `npx next typegen` (vygeneruje typy jako `LayoutProps`), pak `npx tsc --noEmit` a `npm run lint`.
- `next.config.ts` má zapnuté `cacheComponents`: data jsou dynamická, dokud je neoznačíš `use cache`. Route handlery nesmí exportovat `runtime`.
- Model: `CLAUDE_MODEL` (výchozí `claude-haiku-5-5`). TODO: doplnit model pro srovnání v evalu.

## Architektura
- Claude jen vybírá nástroj a píše větu. Čísla počítá kód a kód je i kontroluje. Když číslo ve větě nesedí, větu složí kód.
- Když Claude nevybere žádný nástroj, odpověď je „nevím“ (OUT_OF_SCOPE) pevnou větou. Claude nesmí odpovídat z hlavy.
- Spojení přes volání funkcí v jednom Next serveru: `lib/ai/ask` → `lib/registry` → funkce z `lib/data/*` → obálka. Přepínač `DATA_SOURCE=mock|real`, mock má stejný podpis jako real.

```ts
const fn = getToolFunctions()[toolUse.name];
const { date_assumed, ...params } = toolUse.input;
const envelope = await fn(params);
// registry: DATA_SOURCE === "real" ? realTools : mockTools
```

- Nástroje: `traffic_count` (jádro; gate, date_from, date_to, hour_from, hour_to bez konce, date_assumed se před voláním odstraní), `sensor_status`, `speed_distribution`. Brány mají skupiny (např. `17-listopadu` = JIH + Sever), aby Claude nesčítal sám.
- Kontrola čísel povoluje i čísla z názvů bran (17 ze „17. listopadu“), `peak.hour+1`, části dat, `notes` a `error.message`.
- `peak` a `low` počítá funkce, ne Claude.
- Snímek 30 dní v `data/raw/` se commituje. Režimy mock/live/offline. `APP_NOW` zafixuje „teď“ pro eval.

## Obálka (návrh, potvrdit s Davidem)
- `{ ok, data | error, meta }`, klíče snake_case anglicky, texty česky.
- Chybějící hodnota je `null`, nikdy 0.
- Statusy hodnot: `ok`, `missing`, `suspect` (počítá se do součtu, ne do špičky), `partial`.
- Kódy chyb: `NO_DATA`, `SENSOR_OFFLINE`, `BAD_PARAMS`, `SOURCE_ERROR`, `OUT_OF_SCOPE`, `AI_ERROR`.
- `meta`: tool, params, timezone (`Europe/Prague`), period (local/utc from/to), coverage, source, fetched_at, mode, notes.

## Claude API (při pochybnosti platí typy v `node_modules/@anthropic-ai/sdk`)
- Nástroje se `strict: true` a `additionalProperties: false`.
- `tool_choice: { type: "auto", disable_parallel_tool_use: true }`.
- Obsah odpovědi asistenta posílej zpět beze změny, včetně thinking bloků. `max_tokens` aspoň 2048.
- `tool_result` patří do zprávy `user` a v obsahu jde jako první.

## Data CITIQ
- `https://iot.citiq.cloud/portal/api/v2/view/<view>/?format=json&start=…&stop=…&window=1h`, veřejné, umí vrátit 429.
- Views: `olomouc-traffic-gates` (max 30 dní), `olomouc-traffic` (registr senzorů), `meteorological-data-olomouc` (max 7 dní).
- Klíče: `gate_increment_value_sum`, `gate_len{0-2}_speed{0-3}_increment_sum`, `gate_len3_increment_sum`. len0–3 = osobní, dodávky, nákladní, nezařazeno; speed0–3 = protisměr, <30, 30–60, >60 km/h (jen pásma).
- Neověřené hypotézy H1–H6 (čas bodu = konec okna, noční dohánění → `suspect`, zarovnané absolutní časy…) ověřuje Davidův krok D1. Dokud nejsou ověřené, nestav na nich.
- 25. 10. 2026 má 25 hodin (změna času). Vždy počítej přes luxon v `Europe/Prague`.

## Slepé uličky
- Vitest: nejdřív `npm install -D @types/node@24`, jinak ERESOLVE. Nikdy `--force`, `--legacy-peer-deps` ani `npm audit fix --force`.
- `next/font/google` shodí build bez internetu, nepoužívat.
- Prompt sám nestačí: Claude odpovídal z hlavy, doplňoval dnešní datum, odvozoval hodiny z pozic v poli a psal markdown. Proto kontrola v kódu.
- Přesná data CITIQ dá jen skript, ne WebFetch (vynechává části).

## Priority
- Škrtat v pořadí: mapa → meteo → nasazení → živé stahování → karty → speed_distribution → ranking „all“.
- Nikdy neškrtat: traffic_count na reálných datech, smyčku, účtenku, kontrolu čísel, „nevím“, eval, srovnání modelů, panel AI, snímek a OFFLINE, slide o AI.

## Eval
- Dev sada ~25 otázek (Jáchym), ladí se max 3 kola. Held-out ~15 otázek (David) je mimo repo do soboty 22:00.
- Srovnání Haiku × druhý model patří do jádra.

## Využití AI
- Rozhodnutí a úpravy týmu zapisuj průběžně do `docs/ai-usage.md` (sekce „rozhodnutí a úpravy týmu“). V prezentaci se musí poctivě popsat, co dělala AI a co tým.

## Bezpečnost
- `.env.local` nikdy nečti ani nevypisuj. Proměnné: `ANTHROPIC_API_KEY`, `CLAUDE_MODEL`, `DATA_SOURCE=mock|real`, `OFFLINE=0|1`, `APP_NOW`.
- API klíč nikdy do kódu, gitu, logů ani výstupu.

## Git
- Bez souhlasu člověka necommituj, nemerguj a nepushuj.
