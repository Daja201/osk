# Prompty a postup: Zeptej se Olomouce

Tři soubory, které patří do repa:
- `CLAUDE.md`: pravidla. Claude Code ho načte sám při každém spuštění.
- `docs/SPEC.md`: co přesně stavíme.
- `docs/PROMPTY.md`: tenhle soubor, pořadí kroků.

Prompty jsou v šedých blocích. Zkopírujte je celé do Claude Code. Funguje i zkratka: „Proveď prompt D1 z docs/PROMPTY.md“.

---

## 0. Než začnete (přečtěte oba, 5 minut)

**Co od toho čekat:**
- Prompty vám ušetří odhadem 1–2 hodiny na kostře a hlavně omezí chyby v napojení obou částí.
- Výhru nezaručí. O výsledku rozhodne spolehlivé demo na **reálných** datech, čísla z evalu a prezentace.
- Nejtěžší práci prompt neudělá: pochopit data (krok D1), napsat dobré otázky do evalu a rozhodnout, co škrtnout.

**Pravidla hackathonu:**
- Nic nespouštějte před 18:00 a repo založte až na místě.
- Tyhle tři soubory jsou plán, ne kód. Commitněte je jako samostatný commit „plán z přípravy (bez kódu)“, ať je to v historii poctivě vidět.
- Na zahájení se pro jistotu zeptejte pořadatele, jestli je plán v repu v pořádku (§8).
- Použití AI se musí popsat. Proto se průběžně plní `docs/ai-usage.md` a v commitech zůstává řádek `Co-Authored-By`.
- Porota hodnotí vaši práci. Každý kus kódu musíte umět vysvětlit, a proto každý prompt končí vysvětlením. Čtěte diffy.

**Claude Code:**
- Ověřte si **ještě doma**, že `claude` v terminálu funguje a jste přihlášení.
- Spouštějte ho v kořeni repa (`claude`). CLAUDE.md se načte sám.
- Mezi velkými kroky napište `/clear` (čistý kontext). Prompty jsou psané tak, aby si Claude vše přečetl ze souborů znovu.
- Esc ho zastaví. Když dělá víc, než chcete: „Zastav. Drž se plánu, vrať změny v souboru X.“
- Příkazy schvalujte vědomě. Nepoužívejte režim, který přeskakuje schvalování.
- Klíč `ANTHROPIC_API_KEY` **nedávejte do `~/.zshrc`**. Claude Code by pak účtoval přes API klíč místo předplatného. Klíč patří jen do `.env.local`.
- Když dojde limit předplatného: pokračujte v Cursoru („Přečti CLAUDE.md a docs/SPEC.md a dodržuj je“) nebo ručně. Proto pracujeme po malých krocích s commity.

**Kdo co dělá:**
| | Jáchym | David |
| --- | --- | --- |
| prompty | 0, A, J1–J6 | 0b, D1–D5 |
| ručně | dev otázky do evalu, ladění promptu, prezentace | přezdívky a umístění bran, otázky na Giesla, held-out otázky |
| složky | `lib/ai/`, `app/` (kromě cards), `components/`, `scripts/eval.mjs` | `lib/data/`, `data/`, `scripts/explore\|snapshot.mjs`, `app/api/cards/` |

**Git:**
- Pracujeme přímo v `main`, každý jen ve svých složkách.
- Před každým promptem `git pull --rebase`, po něm push. Pushovat jen když projdou testy.
- Sdílené soubory (`lib/contract.js`, `lib/registry.js`, `package.json`, `CLAUDE.md`, `docs/SPEC.md`) mění vždy jen jeden a řekne to druhému.

---

## 1. Krok 0: Jáchym ručně (pátek 18:00, asi 20 minut)

```bash
cd ~/Development
npx create-next-app@16.4.6 zeptej-se-olomouce --js --tailwind --eslint --app --no-src-dir \
  --import-alias "@/*" --agents-md --no-agent-feedback --use-npm --no-react-compiler --no-cache-components
cd zeptej-se-olomouce
npm install @anthropic-ai/sdk zod luxon
npm install -D vitest
unzip ~/Downloads/hackathon-start.zip -d .     # cesta podle toho, kam zip stáhneš
```
- Zip obsahuje `CLAUDE.md`, `docs/SPEC.md`, `docs/PROMPTY.md` a `.claude/settings.json`.
- Příkaz create-next-app jsem 20. 11. vyzkoušel přesně v této podobě. Na nic se neptá, vytvoří JS projekt s Tailwindem, ESLintem a AGENTS.md a rovnou udělá první commit.
- Kdyby `npm install -D vitest` hlásil ERESOLVE: nejdřív `npm install -D @types/node@24`, pak znovu. Nikdy ne `--force`.
- `.claude/settings.json` zakazuje Claude Code číst `.env.local`.

Pak v Cursoru vytvořte `.env.local` (ne přes Claude Code):
```
ANTHROPIC_API_KEY=sk-ant-…            # nový klíč; starý z cvičení (byl na screenshotu) smažte
CLAUDE_MODEL=claude-haiku-5-5
DATA_SOURCE=mock
OFFLINE=0
APP_NOW=
```
V konzoli platform.claude.com si nastavte limit útraty, třeba 10 USD.

Ověření a první push:
```bash
git check-ignore -v .env.local        # musí vypsat pravidlo .env* – jinak NEcommitovat
git add -A
git commit -m "Plán z přípravy (CLAUDE.md, SPEC, prompty) – bez kódu aplikace"
# na GitHubu založ prázdné repo zeptej-se-olomouce (bez README), přidej Davida jako collaboratora
git remote add origin https://github.com/<ucet>/zeptej-se-olomouce.git
git push -u origin main
```

## 2. Krok 0b: David (pátek asi 18:20)
```bash
git clone https://github.com/<ucet>/zeptej-se-olomouce.git
cd zeptej-se-olomouce
npm install
```
- `.env.local` má stejný obsah, ale `DATA_SOURCE=real`. Klíč si buď vytvoř vlastní, nebo ho dostaneš soukromou zprávou. Nikdy ho nedávej do skupinového chatu ani do gitu.
- Pak spusť `claude` a pusť D1. D1 na kroku A nezávisí.

---

## 3. Prompt A: společný základ (Jáchym, asi 30 minut)

```text
Přečti CLAUDE.md a docs/SPEC.md (§2, §3, §4, §5.5, §5.6, §6). Úkol: společný základ projektu, na kterém budeme oba stavět. Zatím bez CITIQ a bez volání Claude. Nejdřív krátký plán, po mém OK implementuj.

1. package.json: přidej "type": "module" a skripty
   "test": "vitest run", "test:watch": "vitest",
   "tool": "node --env-file=.env.local scripts/tool.mjs",
   "explore": "node --env-file=.env.local scripts/explore.mjs",
   "snapshot": "node --env-file=.env.local scripts/snapshot.mjs",
   "eval": "node --env-file=.env.local scripts/eval.mjs"
   (explore, snapshot a eval zatím neexistují, to je v pořádku. .env.local existuje, jen ho nečti.)
2. vitest.config.mjs: environment node, testy v tests/**/*.test.js.
3. lib/config.js: všechny proměnné prostředí z CLAUDE.md na jednom místě, s výchozími hodnotami.
4. lib/time.js podle SPEC §6.2 (luxon, Europe/Prague, respektuje APP_NOW) + tests/time.test.js:
   25. 10. 2026 má 25 hodin, 29. 3. 2026 má 23 hodin, 19. 11. 2026 začíná v 2026-11-18T23:00:00Z,
   relativeDates pro pevné „teď“ pátek 20. 11. 2026 19:00 podle §6.3 (včetně minulého týdne a víkendu).
5. lib/contract.js: Zod schémata podle SPEC §3 a §4 (Meta, hodinový a denní bod řady, OkEnvelope,
   ErrorEnvelope, Envelope, ERROR_CODES, vstupy TrafficCountParams, SensorStatusParams a
   SpeedDistributionParams se .strict() a bez date_assumed) + helpery okEnvelope(data, meta)
   a errorEnvelope(code, message, meta), které výsledek zvalidují. Testy.
6. data/gates.json: dočasný seznam 4 bran a skupiny 17-listopadu podle SPEC §5.5 (verified: false), David ho přepíše.
   lib/data/gates.js: loadGates(), getGate(id), gateIds() (brány i skupiny), membersOf(id).
7. lib/mock/trafficCount.js, lib/mock/sensorStatus.js, lib/mock/index.js: stejný podpis jako budoucí
   lib/data/ (async, objekt params → obálka). Realistická vymyšlená data:
   - jedna hodina missing, jedna suspect (velká hodnota po mezeře),
   - aksamitova-in → SENSOR_OFFLINE,
   - granularity hour, day i ranking ("all"),
   - budoucnost → BAD_PARAMS,
   - meta.mode "mock", meta.source.name "vymyšlená data (mock)".
   Test: každý výstup mocku projde schématem Envelope.
8. lib/registry.js: getToolFunctions() a getDataRange() podle SPEC §2, přepínané DATA_SOURCE.
   lib/data/index.js zatím jen reexportuje mock (David ho nahradí skutečnými funkcemi).
9. scripts/tool.mjs: `npm run tool -- traffic_count '{"gate":"…"}'` vypíše obálku jako zformátovaný JSON a čas běhu.
10. app/layout.js: odstraň next/font/google (build nesmí potřebovat internet), nastav lang="cs",
    metadata „Zeptej se Olomouce“. app/page.js: jen nadpis a text „Kostra běží“.
11. .env.example se všemi proměnnými (bez klíče). Do .gitignore přidej !.env.example, logs/ a data/cache/.
12. docs/ai-usage.md: šablona deníku (tabulka: čas | krok | co udělala AI | rozhodnutí a úpravy týmu)
    a první řádek za tento krok.

Hotovo, když projde npm test, npm run lint i npm run build a příkaz
npm run tool -- traffic_count '{"gate":"17-listopadu-jih","date_from":"2026-11-19","date_to":"2026-11-19","hour_from":0,"hour_to":24}'
vypíše obálku s 24 hodinami. Pak shrnutí podle CLAUDE.md a commit „Společný základ: kontrakt, čas, mock“.
```
Po pushi napiš Davidovi, ať si udělá `git pull --rebase`.

---

## 4. Davidova část: data

### Pro Davida: o co jde (2 minuty)
- Uživatel napíše česky otázku. Claude z ní vybere **nástroj a parametry**, třeba `traffic_count` s bránou 17. listopadu a včerejším dnem.
- Nástroj je tvoje funkce: spočítá výsledek z dat CITIQ a vrátí ho v obálce (SPEC §3).
- Claude pak napíše větu a můj kód zkontroluje, že každé číslo ve větě je z tvé obálky.
- Takže **tvoje čísla jsou jediný zdroj pravdy v celé aplikaci.** Když se v datech splete hodina (H2 v SPEC §5.3), splete se celá aplikace.
- Do té doby jedu na mocku se stejným tvarem. Až budou tvoje funkce hotové, přepne se `DATA_SOURCE=real` a nic dalšího se nemění.
- Proto je důležité dodržet tvar obálky. Když ho potřebuješ změnit, řekni mi to a uděláme to spolu v `lib/contract.js`.

Co je tvoje ručně (tohle je „naše práce“ před porotou):
- přezdívky bran (jak tomu lidi v Olomouci říkají),
- kde brány fyzicky jsou (mapy.cz),
- rozhovor s Gieslem (§8),
- held-out otázky do evalu.

### D1: průzkum dat (asi 60 minut)
```text
Přečti CLAUDE.md a docs/SPEC.md §5 a §6. Úkol: zjistit, jak data CITIQ doopravdy vypadají, DŘÍV než nad nimi postavíme výpočty. Žádný kód aplikace, jen průzkum. Nedělej změny v package.json.

1. Napiš scripts/explore.mjs (čistý Node, fetch, žádné nové balíčky). Max 1 požadavek za sekundu, celkem max asi 40 požadavků, při 429 počkej a zkus znovu (max 3×). Surové odpovědi ukládej do data/samples/ (název souboru = view + parametry).
2. Stáhni:
   a) registr senzorů: view olomouc-traffic,
   b) olomouc-traffic-gates za jeden celý pražský den se zarovnaným absolutním start/stop v UTC
      (start=2026-11-18T23:00:00Z, stop=2026-11-19T23:00:00Z, window=1h),
   c) totéž s relativním start=-1d (srovnání částečných oken),
   d) den změny času: start=2026-10-24T22:00:00Z, stop=2026-10-25T23:00:00Z,
   e) 7 celých dní (statistika mezer a „dohánění“),
   f) meteorological-data-olomouc za 1 den (jen struktura),
   g) jestli v odpovědích nebo registru najdeš odkaz na další views (např. parkování), zkus je; naslepo nic nehádej víc než 3 pokusy.
3. Ověř hypotézy H1–H6 ze SPEC §5.3. Ke každé napiš verdikt POTVRZENO / VYVRÁCENO / NEJASNÉ a důkaz (konkrétní časy a čísla z odpovědí). Hlavně:
   - H2: při zarovnaném dotazu b) je první bod start+1h (konec okna), nebo start? Kolik bodů má den? Kolik den d)?
   - H1: jsou v každém čase přesně dvě hodnoty se zápornou a kladnou hodnotou?
   - H5: sedí součet tříd na gate_increment_value_sum?
   Navíc zjisti:
   - jestli API bere absolutní ISO start/stop,
   - co vrací pro budoucnost a pro neexistující view,
   - velikost odpovědí v kB,
   - hlavičky rate limitu, pokud nějaké jsou.
4. Pro každou bránu (object_name / source_identifier) spočítej za 7 dní:
   - hodiny s daty / 168,
   - poslední čas s daty,
   - průměr za den,
   - podíl záporných a kladných hodnot,
   - počet hodnot, které by byly suspect podle pravidla v SPEC §5.3.
   Porovnej to se seznamem v SPEC §5.4.
   Zjisti z registru (souřadnice) i z dat, jestli jsou „17.listopadu JIH“ a „17.listopadu Sever“ dva směry na jednom místě, nebo dvě různá místa. To samé pro další dvojice bran (IN/OUT apod.).
5. Napiš docs/data-notes.md:
   - verdikty H1–H6 s důkazy,
   - tabulka bran,
   - doporučená pravidla pro výpočty (missing, suspect, převod času bodu na hodinu),
   - otevřené otázky pro Giesla z CITIQ.
6. Navrhni nový data/gates.json pro všechny brány podle SPEC §5.5: id v kebab-case, object_name, source_identifier, hezký český název, location z registru, status_note u rozbitých, verified. Přidej skupiny pro místa s víc branami (same_place podle zjištění z bodu 4, jinak null). Přezdívky (aliases) nech prázdné, doplním je ručně.

Hotovo, když data/samples/ obsahuje odpovědi, docs/data-notes.md má všechny verdikty a tabulku a data/gates.json je validní JSON. Napiš mi 5 nejdůležitějších zjištění a co z nich plyne pro výpočty. Commitni (vzorky do 5 MB celkem, větší ne). Záznam do docs/ai-usage.md.
```
Ručně po D1:
- doplň v `data/gates.json` přezdívky a ověř umístění,
- se zjištěními a otázkami jdi za Gieslem,
- dej vědět Jáchymovi, co se změnilo (hlavně H1 a H2).

### D2: datová vrstva traffic_count (asi 2 hodiny)
```text
Přečti CLAUDE.md, docs/SPEC.md §3–§6 a docs/data-notes.md (ověřená fakta mají přednost před SPEC). Nejdřív plán, počkej na OK.

Úkol: skutečná datová vrstva pro traffic_count se stejným podpisem jako lib/mock/trafficCount.js.
1. lib/data/citiq.js: fetchView(view, {start, stop, window}) → JSON. Timeout 15 s, opakování při 429 a 5xx s pauzou 1-2-4-8 s (max 4×, respektuj Retry-After), max 1 požadavek za sekundu. Selhání po opakováních → trafficCount z něj udělá SOURCE_ERROR.
2. lib/data/store.js: getGatesDay(date) vrátí surová data pražského dne. Pořadí: data/raw/gates/<date>.json, pak (není-li OFFLINE) stažení. Při OFFLINE=1 nikdy nesahej na síť: den mimo snímek → trafficCount vrátí NO_DATA „Offline režim: data jsou k dispozici do …“ (SPEC §5.6). Na disk ukládej jen úplné dny. Neúplný dnešek drž jen v paměti max 10 minut.
3. lib/data/parse.js: ze surové odpovědi a brány udělá hodinovou řadu podle SPEC §3.2 a §4.1:
   - hodina v místním čase přes lib/time.js podle verdiktu H2 z data-notes (konec nebo začátek okna!),
   - value podle verdiktu H1,
   - status ok/missing/suspect podle pravidla v data-notes,
   - součty by_direction.
   Den změny času (25 hodin) musí fungovat.
4. lib/data/trafficCount.js: trafficCount(params):
   - validace Zodem (TrafficCountParams) → BAD_PARAMS, také pro budoucnost, rozsah nad 31 dní, hour_from ≥ hour_to a neznámou bránu,
   - jeden den → granularity "hour", více dní → "day" (filtr hodin platí pro každý den), "all" → "ranking",
   - skupina (type "group") → součet členů po hodinách podle SPEC §4.1,
   - total, peak, low a coverage podle §4.1, notes česky,
   - meta podle §3.1 včetně period v místním čase i UTC a source.url = přesná URL dotazu,
   - brána se status_note nebo bez dat v celém období → SENSOR_OFFLINE nebo NO_DATA se srozumitelnou zprávou.
5. scripts/snapshot.mjs: stáhne chybějící úplné dny za posledních 30 dní (podle now()) a registr do data/raw/. Postupně, s pauzou, vypisuje průběh a na konci souhrn (počet dní, velikost).
6. lib/data/index.js: exportuj skutečné funkce. Pro nástroje, které ještě nejsou hotové, nech mock. Doplň getDataRange() podle SPEC §2 (z data/raw/ a režimu).
7. Testy (vitest) s fixtures z data/samples/ (zkopíruj potřebné do tests/fixtures/), bez sítě:
   - převod času včetně 25. 10. 2026,
   - missing místo nuly,
   - suspect po mezeře,
   - peak bez suspect,
   - coverage,
   - všechny BAD_PARAMS,
   - SENSOR_OFFLINE,
   - "all",
   - skupina (součet, missing u jednoho člena),
   - výstup projde schématem Envelope.

Hotovo, když:
- projde npm test,
- npm run snapshot stáhne 30 dní,
- OFFLINE=1 npm run tool -- traffic_count '<včerejšek pro 17-listopadu-jih>' vrátí obálku s reálnými čísly,
- ukážeš mi jednu konkrétní hodinu v surovém JSON a jak se z ní stala hodnota v řadě, abych to porovnal ručně.
Commit a záznam do docs/ai-usage.md.
```
Po D2: commitni snímek `data/raw/` a napiš Jáchymovi „snapshot je v main, můžeš na real“.

### D3: sensor_status a /api/cards (asi 1 hodina)
```text
Přečti CLAUDE.md, docs/SPEC.md §4.2 a §9 (bod 7) a docs/data-notes.md.
1. lib/data/sensorStatus.js: sensorStatus({gate}) podle §4.2:
   - stav ok/delayed/offline z registru (last_seen, enabled) a z pokrytí za 7 dní z cache,
   - v režimu offline vztaženo ke konci snímku (napiš to do notes),
   - validace Zodem a obálka.
2. Zaregistruj ji v lib/data/index.js.
3. app/api/cards/route.js: GET vrátí { ok, data: { sensors, speed: null }, meta }. Výsledek drž v paměti 10 minut, žádná AI.
4. Testy.
Hotovo, když /api/cards v prohlížeči (npm run dev) vrací JSON a projdou testy. Commit a záznam do docs/ai-usage.md.
```

### D4: speed_distribution (asi 1 hodina, jen když je D2 v pořádku)
```text
Přečti docs/SPEC.md §4.3 a docs/data-notes.md (hlavně H5 a kódování tříd).
1. lib/data/speedDistribution.js: podíly rychlostních tříd a typů vozidel za období z klíčů gate_len*_speed*. Procenta počítá kód na 1 desetinné místo. Součty musí sedět (test). Když nesedí H5, napiš to do notes.
2. Zaregistruj ji v lib/data/index.js.
3. V /api/cards doplň data.speed: pro každou funkční bránu podíl vozidel nad 60 km/h za posledních 7 dní.
4. Testy.
Commit a záznam do docs/ai-usage.md. Napiš Jáchymovi, ať přidá nástroj do lib/ai/tools.js.
```

### D5: volitelné (jen když je všechno ostatní hotové)
- Meteo (SPEC §4.4) nebo mapa bran (Leaflet). Obojí se škrtá jako první.

---

## 5. Jáchymova část: AI a stránka

### J1: AI smyčka a kontrola čísel (asi 2 hodiny)
```text
Přečti CLAUDE.md a docs/SPEC.md §7, §8 a §12. Tahák v §12 jsou ověřená fakta o Claude API, mají přednost před tvou pamětí. Nejdřív plán, počkej na OK. Pracuj s mockem (DATA_SOURCE=mock), skutečná data přijdou později bez změny kódu.

1. lib/ai/tools.js podle §8.2:
   - traffic_count a sensor_status se "strict": true a additionalProperties: false,
   - enum generuj z data/gates.json (brány i skupiny, + "all"),
   - do description dej seznam skupin a bran s přezdívkami a pravidla parametrů.
2. lib/ai/systemPrompt.js: buildSystemPrompt({ now, dataRange, gates }) podle §8.1. Pravidla z §6.3 vlož doslova.
3. lib/ai/checkNumbers.js: extractNumbers, allowedNumbers a checkNumbers podle §8.4 + důkladné testy (všechny případy vyjmenované v §8.4).
4. lib/ai/fallback.js podle §8.5 + testy (formát čísel přes Intl.NumberFormat("cs-CZ") s NBSP).
5. lib/ai/pricing.js podle §8.7.
6. lib/ai/ask.js: ask(question, deps) přesně podle §8.3. Vstupní body:
   - smyčka max 3 kroky, tool_choice auto + disable_parallel_tool_use,
   - obsah odpovědi asistenta vracej beze změny (i thinking bloky),
   - validace vstupu Zodem, odstranění date_assumed,
   - cesty „nevím“: OUT_OF_SCOPE s pevnou větou, ok:false, AI_ERROR,
   - kontrola čísel, při neúspěchu fallback,
   - sanitizace, trace, assumptions, suggestions,
   - log do logs/answers.jsonl (chyba zápisu nesmí shodit odpověď).
   Klient Anthropic a funkce nástrojů jdou podstrčit v deps.
7. app/api/ask/route.js: POST {question} i GET ?q=, odpověď přesně podle §7, 400 pro prázdnou nebo moc dlouhou otázku.
8. tests/ask.test.js s falešným klientem (žádná síť). Případy:
   - nástroj → answer,
   - bez nástroje → OUT_OF_SCOPE,
   - ok:false → reason,
   - číslo navíc ve větě → fallback,
   - neznámý nástroj → unknown,
   - vyčerpané kroky,
   - markdown → sanitizace,
   - date_assumed → assumptions.

Hotovo, když projde npm test i npm run build a se skutečným Claude (npm run dev na pozadí):
- /api/ask?q=Kolik aut projelo včera na 17. listopadu? vrátí kind "answer", trace se 4 kroky a check.passed true,
- /api/ask?q=Kdo vyhraje fotbalovou ligu? vrátí OUT_OF_SCOPE,
- /api/ask?q=Kolik aut projede zítra? vrátí unknown s rozumným důvodem.
Ukaž mi zkrácené JSONy a vysvětli mi, kudy v kódu tekla první otázka. Commit a záznam do docs/ai-usage.md.
```

### J2: stránka (asi 1,5 hodiny)
```text
Přečti CLAUDE.md a docs/SPEC.md §7 a §9. Nejdřív mi slovy popiš rozložení stránky a komponenty, počkej na OK.

Úkol: stránka podle §9 (Tailwind, česky, funguje i na mobilu a na projektoru).
- components/:
  - AskForm,
  - AnswerCard,
  - HourChart: vlastní graf bez knihovny; missing = čárkovaný obrys a „?“, suspect = šrafa a vysvětlivka; popisky hodin; varianty pro day a pro ranking (vodorovné pruhy),
  - Receipt („Původ odpovědi“),
  - TracePanel („Jak AI postupovala“),
  - UnknownCard („Nevím“ + důvod + klikací návrhy),
  - CityCards (z /api/cards; když endpoint ještě neexistuje, karta to slušně řekne).
- app/page.js stránku složí. Klientské části mají "use client".
- Stavy: prázdný (3 návrhy podle §9), načítání (zakázané tlačítko, „Hledám v datech…“), odpověď, nevím, chyba (česky + „Zkusit znovu“).
- Přístupnost: label u pole, Enter odešle, viditelný focus, dostatečný kontrast.

Hotovo, když projde npm run build a v prohlížeči:
- fungují 3 návrhy,
- otázka mimo téma ukáže „Nevím“,
- graf z mocku ukazuje chybějící a podezřelou hodinu,
- Původ odpovědi i panel AI jsou vyplněné.
Napiš mi, co přesně mám proklikat. Commit a záznam do docs/ai-usage.md.
```

### J3: eval runner (asi 1 hodina; otázky píšete sami)
```text
Přečti CLAUDE.md a docs/SPEC.md §10. Úkol: nástroj na měření přesnosti. Otázky NEPIŠ, napíšeme je sami. Vytvoř jen eval/questions.example.json se 3 ukázkami formátu.

1. scripts/eval.mjs:
   - argumenty --set dev|holdout|example, --model (víc modelů oddělených čárkou), --limit N, --concurrency (výchozí 2),
   - volá ask() přímo (ne přes HTTP) a vyhodnotí kontroly podle §10.3,
   - zapíše eval/results/<čas>-<set>-<model>.json,
   - vypíše tabulku v Markdownu: přesnost celkem a po kategoriích, rozpad chyb, průměrný a nejhorší čas, tokeny a cena na otázku,
   - při víc modelech srovnávací tabulka vedle sebe,
   - na konci seznam chybných otázek: co se čekalo a co přišlo.
2. Zástupné hodnoty dat podle §10.2 přes relativeDates z lib/time.js.
3. Varování, když neběží OFFLINE=1 nebo chybí APP_NOW (výsledky pak nejsou opakovatelné).
4. Testy vyhodnocovací logiky a zástupných hodnot.

Hotovo, když `OFFLINE=1 APP_NOW=2026-11-20T18:00:00+01:00 npm run eval -- --set example --model claude-haiku-5-5` vypíše tabulku. Commit a záznam do docs/ai-usage.md.
```
Ručně (sobota dopoledne):
- napište `eval/questions.dev.json`, asi 25 otázek přes všechny kategorie z §10.1, s reálnými názvy bran a přezdívkami,
- David píše `questions.holdout.json` (15 otázek) a drží ho mimo repo do soboty 22:00.

### J4: přepnutí na reálná data (spolu, cíl sobota 14:00)
```text
Přečti docs/SPEC.md §11 a docs/data-notes.md. Všechno spouštěj s proměnnými na příkazové řádce: DATA_SOURCE=real OFFLINE=1 APP_NOW=<konec snímku>. Proměnné z příkazové řádky mají přednost před .env.local, a do .env.local nesahej.
1. Ověř, že lib/ai/tools.js a systémový prompt berou aktuální data/gates.json (včetně přezdívek) a getDataRange().
2. Pusť prvních 10 otázek z eval/questions.dev.json a projdi chyby. Opravuj jen integrační chyby (tvar dat, časy, chybějící pole), na prompt nesahej.
3. V prohlížeči zkontroluj graf s reálnými daty, Původ odpovědi (odkaz na zdroj musí fungovat) a kartu Stav senzorů.
Napiš mi seznam nalezených problémů a co jsi opravil. Commit a záznam do docs/ai-usage.md.
```

### J5: kolo ladění (max 3×, sobota 14–22)
```text
Pusť OFFLINE=1 APP_NOW=<konec snímku> npm run eval -- --set dev --model claude-haiku-5-5 a přečti výsledek.
Seskup chyby podle typu a ke každé skupině navrhni nejmenší změnu (popis nástroje, systémový prompt, přezdívky v gates.json, nebo kód). Zatím nic neměň, počkej, kterou změnu vyberu.
Po změně pusť dev sadu znovu, porovnej s minulým během (co se zlepšilo, co zhoršilo) a zapiš kolo do docs/ai-usage.md (přesnost před a po, co se změnilo).
```
Sobota 22:00, held-out (už se neladí):
```text
Zkopíroval jsem eval/questions.holdout.json. Pusť OFFLINE=1 APP_NOW=<konec snímku> npm run eval -- --set holdout --model claude-haiku-5-5,claude-sonnet-5-5 a nic neměň. Shrň výsledky do docs/eval-vysledky.md: tabulka modelů, rozpad chyb, 3 typické chyby s vysvětlením a poctivý závěr, který model a proč.
```

### J6: README a podklady k prezentaci (sobota večer / neděle ráno)
```text
Z docs/ai-usage.md, docs/eval-vysledky.md, docs/data-notes.md a kódu připrav:
1. README.md:
   - co aplikace dělá,
   - jak ji spustit (npm install, .env.local podle .env.example, režimy mock/live/offline, npm run snapshot),
   - architektura (schéma z SPEC §2),
   - jak používáme AI a jak ji hlídáme,
   - výsledky evalu,
   - omezení dat,
   - kdo co dělal.
2. docs/prezentace.md: osnova podle §10 v docs/PROMPTY.md s konkrétními čísly. Používej jen čísla, která jsou v eval výsledcích nebo data-notes, nic nedopočítávej.
Nic dalšího neměň. Commit.
```

---

## 6. Neděle ráno: příprava dema
```text
Je neděle ráno, demo je ve 13:00. Projdi se mnou kontrolu:
1. npm run snapshot, aby ve snímku byl pátek i sobota (v demu znamená „včera“ sobotu). Ověř, že nejsou nové díry.
2. npm test, npm run lint, npm run build.
3. Spusť dev server s DATA_SOURCE=real OFFLINE=1 na příkazové řádce (APP_NOW nenastavuj, do .env.local nesahej). Projdi demo otázky z docs/prezentace.md přes /api/ask a u každé ukaž větu, kontrolu čísel a čas.
4. Pak totéž s OFFLINE=0 (živá data), abychom věděli, jestli na místě funguje síť.
Nic nového nepřidávej, jen hlas problémy.
```
Pak ručně:
- natočte záložní video dema (nahrávání obrazovky),
- otestujte projektor a velikost písma,
- odevzdejte podle pokynů (čas ověřte, loni 12:00).

---

## 7. Harmonogram

| Kdy | Jáchym | David |
| --- | --- | --- |
| pá 15:00–18:00 | registrace, zahájení, přednáška; otázky pro pořadatele (§8) | po zahájení odchytit Giesla (§8) |
| 18:00 | Krok 0 | Claude Code přihlášený, čte SPEC §5 |
| 18:20 | Prompt A | Krok 0b → D1 |
| 19:00 | J1 | dokončit D1, ručně přezdívky a umístění bran |
| 21:00 | J2 | D2 |
| ~23:00 | ✔ jedna otázka projde celou cestou (mock) | ✔ snímek 30 dní v main |
| noc | spát aspoň 5 h | spát aspoň 5 h |
| so dopoledne | dev otázky (ručně), J3 | D3, held-out otázky (mimo repo) |
| **so 14:00** | ✔ **J4: reálná data s Původem odpovědi**, jinak škrtat podle SPEC §11 | |
| so 14–20 | J5 (max 3 kola), srovnání modelů | D4, opravy, karty |
| **so 20:00** | ✔ feature freeze, dál jen opravy | |
| **so 22:00** | ✔ held-out Haiku + Sonnet → čísla do prezentace | |
| so večer | J6, slidy | demo scénář, záložní plán |
| ne 9:00 | kap. 6 (snapshot, kontrola) | záložní video |
| **ne 11:00** | ✔ hotovo, odevzdání | |
| ne 13–15 | prezentace | |

V sobotu je od 9 do 17 program (přednášky a mentoři). Kolik času reálně zbyde, závisí na tom, co je povinné. Ověřte to v pátek. Mentorská kola využijte k ukázce dema a sběru otázek do evalu.

Upřímně ke spánku: kód psaný po druhé ráno se v neděli opravuje dvakrát. Feature freeze v sobotu ve 20:00 je důležitější než jedna funkce navíc.

---

## 8. Otázky na místě (pátek)

**Giesl (CITIQ):**
1. Je čas bodu začátek, nebo konec agregačního okna?
2. Co znamená znaménko hodnoty? Který směr je který u jednotlivých bran?
3. Proč jsou v noci mezery a po nich velká hodnota? Je to dohnání výpadku?
4. Platí kódování tříd len0–3 (osobní, dodávky, nákladní, nezařazeno) a speed0–3 (protisměr, do 30, 30–60, nad 60 km/h)?
5. Jaké jsou limity API? Smíme si stáhnout 30 dní do cache?
6. Víte o nefunkčních senzorech (Aksamitova, Voskovcova, Flora)? Byl by pro vás užitečný přehled výpadků?
7. Jsou k dispozici další datové sady (parkování apod.)?

**Pořadatelé (Koníček):**
1. Kdy přesně je odevzdání a co se odevzdává (repo, video, slidy)? Jak dlouhá je prezentace?
2. Smí být v repu plán připravený předem (SPEC a prompty, bez kódu)?
3. Dáváte API klíče nebo kredity na AI?
4. Které sobotní přednášky jsou povinné?
5. Musí být repo veřejné?

---

## 9. Když se něco pokazí

| Problém | Co dělat |
| --- | --- |
| Claude Code dělá víc, než chcete | Esc → „Zastav. Drž se plánu.“ Změny zobrazí `git diff`, jeden soubor vrátí `git restore <soubor>` (zahodí jeho změny). |
| Testy padají | „Testy padají: {sem vlož výpis}. Najdi příčinu a vysvětli mi ji. Test neupravuj, dokud neřeknu.“ |
| API 400 kvůli schématu nástroje | Zjednodušte schéma (bez `format`, číselných mezí). Hlídá to Zod. |
| API 401 | Špatný klíč v `.env.local`, nebo neběží restart dev serveru (env se načítá při startu). |
| CITIQ 429 nebo nefunguje síť | `OFFLINE=1` + snímek. Nezvyšovat počet požadavků. |
| Build padá na Google Fonts | Krok A je odstraňuje. Kdyby se vrátily, smazat `next/font/google` z layoutu. |
| Graf je posunutý o hodinu | Verdikt H2 v data-notes a převod v `parse.js`. Porovnat jednu hodinu ručně se surovým JSON. |
| Claude ve větě zaokrouhluje nebo počítá | Kontrola čísel to chytí (fallback). Do promptu přidat příklad, víc v J5. |
| Merge konflikt | `git pull --rebase`. V cizím souboru vezměte jejich verzi. Claude: „Vyřeš konflikt v X, zachovej obě změny a vysvětli mi to.“ |
| Claude Code bloudí, opakuje chyby | `/clear` a znovu prompt s odkazem na soubory. |
| Došel limit Claude Code | Cursor agent s CLAUDE.md, nebo ručně. Zbytek dne menší kroky. |

---

## 10. Prezentace (osnova, délku ověřit)

1. **Problém (20 s):** data ze senzorů existují, ale běžný člověk nebo úředník se k nim přes API a tabulky nedostane.
2. **Demo (2 min), tři otázky:**
   - běžná („Kolik aut projelo včera ulicí 17. listopadu?“) → věta, číslo, graf, Původ odpovědi,
   - s chybějícími daty nebo rozbitým senzorem → poctivé „nevím“ nebo „chybí 5 hodin“,
   - mimo téma („Kdo vyhraje ligu?“) → „nevím“. Na cvičení nám AI na tohle odpovídala z hlavy, tady ne.
3. **Jak používáme AI (1 min):**
   - schéma: otázka → Claude vybere nástroj → náš kód spočítá → kontrola čísel → věta a Původ,
   - Claude nepočítá,
   - held-out eval: přesnost Haiku × Sonnet, čas a cena → proč Haiku,
   - proč tool use, a ne „pošli AI celá data“: přesnost, kontrolovatelnost, cena.
4. **Co jsme zjistili o datech (30 s):** nefunkční senzory a noční výpadky = doporučení pro město a CITIQ.
5. **Transparentnost (20 s):** jak jsme použili Claude Code (deník `docs/ai-usage.md`, commity) a co jsme dělali sami (data, otázky, pravidla kontroly, rozhodnutí).
6. **Co dál (10 s):** další senzory, upozornění na výpadky, nasazení pro město.

Záloha: video dema a režim OFFLINE se snímkem.
