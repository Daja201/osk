# SPEC: Zeptej se Olomouce

Verze 20. 11. 2026, sepsáno při přípravě, ještě bez kódu.

Pravidla přednosti:
- Tento SPEC má přednost před projektovým dokumentem (je novější a přesnější).
- Ověřená fakta v `docs/data-notes.md` mají přednost před hypotézami v §5.
- Obálka v §3 je návrh z 9. 11. Pokud jste se s Davidem domluvili jinak, upravte §3 **dřív**, než pustíte první prompt.

---

## 1. Cíl a jak se hodnotí

Hodnoticí formulář má 5 kritérií po 0–10 bodech, celkem max 50. Kritérium *Využití AI* zahrnuje smysluplnou integraci AI, vhodnost zvolených modelů a nástrojů a transparentnost a odpovědnost při práci s daty.

Povinné podmínky:
- použít data ze senzorů EnCLOD/CITIQ,
- projekt musí vzniknout až na hackathonu,
- popsat, jak jsme použili AI.

| Kritérium | Čím ho plníme |
| --- | --- |
| Využití AI | Claude vybírá nástroj a píše větu, ale nepočítá. Kód kontroluje čísla. Aplikace řekne „nevím“ s důvodem. Eval na odložené (held-out) sadě. Srovnání Haiku × Sonnet: přesnost, čas, cena. Panel „Jak AI postupovala“. Deník použití Claude Code. |
| Zpracování | Spolehlivé demo na reálných datech, testy, žádná vymyšlená čísla. |
| Využitelnost | Otázka česky místo API a tabulek. Stav senzorů a jejich výpadků jako informace pro město. |
| Inovativnost | „Účtenka“ (Původ odpovědi) u každé odpovědi a kontrola čísel z AI. |
| Prezentace | 3 demo otázky (běžná, s chybějícími daty, mimo téma) a čísla z evalu. |

## 2. Architektura

```
Prohlížeč (app/page.js)
  │  POST /api/ask {question}
  ▼
app/api/ask/route.js ──► lib/ai/ask.js
                           1) Claude: vyber nástroj + parametry (tools, strict)
                           2) kód: validace Zod → lib/registry.js → lib/data/* nebo lib/mock/*
                                   → obálka {ok, data | error, meta}
                           3) Claude: napiš 1 větu z výsledku
                           4) kód: kontrola čísel → při neúspěchu věta složená kódem
                           ▼
                         JSON pro stránku: answer + result (obálka) + trace

Prohlížeč ◄── GET /api/cards ◄── lib/data/* (bez AI)
lib/data/* ──► CITIQ API
```

Obě části se spojují v `lib/registry.js` a v obálce z `lib/contract.js`.
- Jáchym volá jen `getToolFunctions()` a `getDataRange()`.
- David dodává funkce se stejným podpisem jako mock.
- Přepnutí z mocku na reálná data je jen změna `DATA_SOURCE=real`, kód se nemění.

`lib/registry.js` exportuje:
- `getToolFunctions()` → `{ traffic_count, sensor_status, speed_distribution? }`. Každá funkce je `async (params) => Envelope`.
- `getDataRange()` → `{ first: "YYYY-MM-DD", last: "YYYY-MM-DD", mode: "mock" | "live" }`. `first` a `last` jsou první a poslední úplný den s daty.

## 3. Obálka (kontrakt mezi částmi)

Každý nástroj vrací buď úspěch, nebo chybu, vždy s `meta`.

```json
{ "ok": true,  "data": { ... }, "meta": { ... } }
{ "ok": false, "error": { "code": "SENSOR_OFFLINE", "message": "Senzor Aksamitova neposílá data od 6. 5. 2026." }, "meta": { ... } }
```

### 3.1 meta (vždy)
```json
{
  "tool": "traffic_count",
  "params": { "gate": "17-listopadu-jih", "date_from": "2026-11-19", "date_to": "2026-11-19", "hour_from": 0, "hour_to": 24 },
  "timezone": "Europe/Prague",
  "period": {
    "local_from": "2026-11-19T00:00:00+01:00", "local_to": "2026-11-20T00:00:00+01:00",
    "utc_from": "2026-11-18T23:00:00Z",       "utc_to": "2026-11-19T23:00:00Z"
  },
  "coverage": { "hours": 22, "of": 24 },
  "source": { "name": "CITIQ – olomouc-traffic-gates (EnCLOD)", "url": "https://iot.citiq.cloud/portal/api/v2/view/olomouc-traffic-gates/?format=json&start=...&stop=...&window=1h" },
  "fetched_at": "2026-11-20T18:42:10+01:00",
  "mode": "live",
  "notes": ["Chybí data za 04:00–09:00.", "Hodnota v 10:00 je podezřelá: nejspíš obsahuje průjezdy z výpadku."]
}
```
- `period`, `coverage` a `fetched_at` mohou být `null`, když nedávají smysl.
- `mode` je `live` nebo `mock`.
- `notes` jsou krátké české věty pro člověka. Ukazují se v „Původu odpovědi“ a dostává je i Claude.

### 3.2 Bod řady
- Hodinový: `{ "hour": 16, "start_utc": "2026-11-19T15:00:00Z", "value": 1234, "status": "ok" }`
  - `hour` je místní hodina začátku (16 znamená 16:00–17:00).
  - `start_utc` rozlišuje dvě „druhé hodiny“ v den změny času.
- Denní: `{ "date": "2026-11-16", "value": 15012, "status": "partial", "hours_with_data": 20, "hours_total": 24 }`

Statusy:
- `ok`: hodnota je v pořádku.
- `missing`: hodnota chybí, `value` je `null`. Nikdy ne 0.
- `suspect`: hodnota je podezřelá, např. první hodnota po výpadku. Počítá se do součtu, ale ne do špičky a v grafu je označená.
- `partial` (jen u denních bodů): den nemá všechny hodiny.

### 3.3 Kódy chyb
| Kód | Kdy |
| --- | --- |
| `NO_DATA` | V období nejsou žádná data nebo je mimo dostupný rozsah. |
| `SENSOR_OFFLINE` | Senzor dlouhodobě nefunguje (status_note v gates.json nebo bez dat déle než 24 h). |
| `BAD_PARAMS` | Neplatné parametry: budoucnost, rozsah > 31 dní, neznámá brána, `hour_from ≥ hour_to`, špatný formát data. |
| `SOURCE_ERROR` | CITIQ neodpovídá ani po opakování (režim `live`). |

AI vrstva má navíc vlastní důvody „nevím“, které nástroje nikdy nevrací: `OUT_OF_SCOPE` (otázka mimo naše data) a `AI_ERROR` (selhalo volání Claude).

Konvence:
- Klíče jsou anglicky v snake_case, `message` a `notes` česky.
- Počty jsou celá čísla. Procenta mají 1 desetinné místo a spočítá je kód.

## 4. Nástroje

Vstupy validuje Zod v `lib/contract.js`, ale schéma bere jen klíče uvedené níže (`.strict()`).

### 4.1 traffic_count (jádro)
Vstup:
| Parametr | Typ | Význam |
| --- | --- | --- |
| `gate` | string | `id` z `data/gates.json`, nebo `"all"` = pořadí všech funkčních bran |
| `date_from` | "YYYY-MM-DD" | první den (místní datum) |
| `date_to` | "YYYY-MM-DD" | poslední den včetně; pro jeden den stejný jako `date_from`; rozsah max 31 dní |
| `hour_from` | int 0–23 | začátek, místní čas |
| `hour_to` | int 1–24 | konec, nezahrnuje se; 24 = do půlnoci |

Výstup `data`:
```json
{
  "gate": "17-listopadu-jih",
  "gate_name": "17. listopadu – jih",
  "granularity": "hour",
  "series": [ { "hour": 0, "start_utc": "2026-11-18T23:00:00Z", "value": 41, "status": "ok" } ],
  "total": 12345,
  "peak": { "hour": 16, "value": 1234 },
  "low":  { "hour": 3,  "value": 12 },
  "by_direction": { "a": 6000, "b": 6345, "a_label": "směr A", "b_label": "směr B" },
  "ranking": null
}
```
Pravidla:
- **Jeden den** → `granularity: "hour"`, řada hodin `hour_from` až `hour_to − 1`.
- **Více dní** → `granularity: "day"`, denní body. Filtr hodin platí pro každý den, např. „rána 7–9 minulý týden“. `peak` a `low` mají tvar `{date, value}` a počítají se jen z dní se statusem `ok`.
- **`gate: "all"`** → `granularity: "ranking"`, `series: []`, `total`, `peak` a `low` jsou `null`. `ranking` obsahuje `[{gate, gate_name, total, hours_with_data, hours_total}]` seřazené sestupně. Brány bez dat jsou uvedené v `notes`. Do `notes` patří i věta „Jedno vozidlo může projet víc branami.“
- **Skupina** (`type: "group"` v gates.json, §5.5) se počítá jako součet členů po hodinách:
  - hodina je `missing`, když chybí u kteréhokoli člena (do `notes` napiš, u kterého),
  - hodina je `suspect`, když je podezřelá u kteréhokoli člena,
  - `by_direction` se sčítá,
  - pokud členové nejsou totéž místo, do `notes` patří „Jedno vozidlo může projet oběma branami.“
- `total` je součet hodnot `ok` + `suspect`. `peak` a `low` se počítají jen z `ok`. Když žádná taková hodnota není, jsou `null`.
- `by_direction` se vyplní podle verdiktu H1 (§5.3). Dokud směr není ověřený, popisky jsou „směr A“ a „směr B“ a `notes` obsahuje „Význam směrů zatím neověřen.“
- Když je pokrytí 0 hodin → chyba `NO_DATA`, nebo `SENSOR_OFFLINE`, pokud má brána `status_note` nebo dlouho neposílá data.

### 4.2 sensor_status
- Vstup: `gate` (id nebo `"all"`). Skupina vrátí stav všech svých členů.
- Výstup `data`:
```json
{
  "sensors": [ { "gate": "aksamitova-in", "gate_name": "Aksamitova (IN)", "state": "offline",
                 "last_seen": "2026-05-06T10:00:00+02:00", "hours_with_data_7d": 0, "hours_total_7d": 168,
                 "note": "Neposílá data od 6. 5. 2026." } ],
  "counts": { "ok": 5, "delayed": 1, "offline": 3 }
}
```
- Stav podle stáří posledních dat: `ok` = data za poslední 3 h, `delayed` = 3–24 h, `offline` = déle než 24 h nebo nikdy.
- Zdroj: `last_seen` a `enabled` z registru a pokrytí za 7 dní z cache.

### 4.3 speed_distribution (až bude čas)
- Vstup: `gate` (bez `"all"`), `date_from`, `date_to`.
- Výstup `data`:
```json
{ "gate": "...", "gate_name": "...", "total": 12000,
  "speed":   [ { "class": "oncoming", "label": "protisměr", "count": 120, "share_pct": 1.0 },
               { "class": "lt30", "label": "do 30 km/h", ... }, { "class": "30to60", ... }, { "class": "gt60", "label": "nad 60 km/h", ... } ],
  "vehicle": [ { "class": "car", "label": "osobní", ... }, { "class": "van", "label": "dodávky", ... },
               { "class": "truck", "label": "nákladní", ... }, { "class": "unclassified", "label": "nezařazeno", ... } ] }
```
- Procenta počítá kód na 1 desetinné místo.
- Test kontroluje, že součty sedí.

### 4.4 meteo (volitelné, škrtá se jako druhé)
Denní min/max/průměr teploty z view `meteorological-data-olomouc`, max 7 dní na dotaz. Dělat jen když zbyde čas.

## 5. Data CITIQ

### 5.1 Endpointy (veřejné, bez klíče)
`https://iot.citiq.cloud/portal/api/v2/view/<view>/?format=json&start=...&stop=...&window=1h`

| View | Obsah | Limit |
| --- | --- | --- |
| `olomouc-traffic-gates` | průjezdy bran | max 30 dní na dotaz |
| `olomouc-traffic` | registr senzorů: uuid, name, location, enabled, last_seen | |
| `meteorological-data-olomouc` | meteo | max 7 dní |

- Další viděné parametry: `measurement_keys`, `agg_func` (výchozí `sum`), `group_by_tags`.
- `start=-1d` funguje. Absolutní ISO čas je třeba ověřit v D1.
- API umí vrátit 429. Limity nejsou zveřejněné.

### 5.2 Pozorovaná struktura (8. 11. 2026)
```json
{
  "query_params": { "start": "...", "stop": "...", "window": "1h", "agg_func": "sum", "measurement_keys": [] },
  "results": [ {
    "source_identifier": "...",
    "object_name": "17.listopadu JIH",
    "measurements": [
      { "key": "gate_increment_value_sum", "name": "...", "unit": "",
        "values": [ { "point": { "time": "2026-11-08T18:00:00+00:00", "value": -287 }, "tags": {} },
                    { "point": { "time": "2026-11-08T18:00:00+00:00", "value": 301 },  "tags": {} } ] },
      { "key": "gate_len0_speed2_increment_sum", "values": [] },
      { "key": "gate_len3_increment_sum", "values": [] }
    ]
  } ]
}
```
- Viděné `object_name`: „17.listopadu JIH“, „17.listopadu Sever“, „Billa (Hynaisova)“ a další.
- Klíče: `gate_increment_value_sum` (celkem), `gate_len{0-2}_speed{0-3}_increment_sum` a `gate_len3_increment_sum`.
- Kódování tříd podle naší analýzy, potvrdit u CITIQ:
  - délka: len0 = osobní, len1 = dodávky, len2 = nákladní, len3 = nezařazeno,
  - rychlost: speed0 = protisměr, speed1 = < 30 km/h, speed2 = 30–60 km/h, speed3 = > 60 km/h.

### 5.3 Hypotézy (D1 je ověří a výsledek zapíše do data-notes)
| | Hypotéza | Proč si to myslíme | Důsledek |
| --- | --- | --- | --- |
| H1 | Každý čas je ve `values` dvakrát: záporně a kladně, tedy dva směry. | Každý čas byl ve `values` dvakrát. | Celkem = \|záporné\| + kladné. Který směr je který, zatím **nevíme**. |
| H2 | Čas bodu je **konec** okna (jako `aggregateWindow` v InfluxDB). | Poslední bod měl čas ≈ okamžik dotazu, první okno bylo částečné. | Bod „18:00Z“ = provoz 17:00–18:00 UTC = 18:00–19:00 v Praze (v zimě). Chyba tady posune celý graf o hodinu. |
| H3 | Po noční mezeře (cca 03–09 UTC) přijde velká hodnota (1846, 2284) = dohnané průjezdy z výpadku. | Pozorováno. | Taková hodnota dostane `suspect`. |
| H4 | S relativním `start=-1d` je první okno částečné. | Pozorováno. | Vždy se ptát zarovnanými absolutními `start`/`stop` na celé hodiny (půlnoc v Praze převedená na UTC). |
| H5 | Součet tříd (len×speed + len3) = `gate_increment_value_sum`. | Neověřeno. | Když nesedí, speed_distribution musí počítat z tříd a napsat to do `notes`. |
| H6 | `tags` jsou prázdné a `group_by_tags` nic nedělá. | Pozorováno. | Ignorovat. |

Výchozí pravidlo pro `suspect` (D1 ho může upravit): první hodnota po mezeře ≥ 2 h, pokud je větší než 3× medián `ok` hodnot téhož dne.

### 5.4 Známé problémy senzorů (stav k 2. 11. 2026, D1 aktualizuje)
- Aksamitova IN i OUT: bez dat od 6. 5. 2026.
- Voskovcova: neposílá data.
- Flora.2OUT: vypnutý.
- Flora.IN: 28 % hodnot v opačném směru.

### 5.5 data/gates.json (kurátorovaný seznam, vlastní David)
```json
[
  { "id": "17-listopadu-jih", "object_name": "17.listopadu JIH", "source_identifier": null,
    "name": "17. listopadu – jih", "aliases": ["17. listopadu jih", "jižní brána na 17. listopadu"],
    "location": null, "direction_labels": { "a": "směr A", "b": "směr B" }, "direction_verified": false,
    "status_note": null, "verified": false }
]
```
- `id` je kebab-case a jde do enumu nástroje.
- `aliases` jsou přezdívky, jak to říkají lidé („u Billy“, „Hynaisova“). Doplňuje je David ručně.
- `status_note` je česky, např. „nefunguje od 6. 5. 2026“.

**Skupiny.** Jedno místo může mít víc bran, např. „17.listopadu JIH“ a „17.listopadu Sever“. Lidé se ale zeptají jen „na 17. listopadu“. Pro takové místo je v gates.json skupina:
```json
{ "id": "17-listopadu", "type": "group", "name": "17. listopadu (obě brány)", "members": ["17-listopadu-jih", "17-listopadu-sever"],
  "aliases": ["17. listopadu", "Sedmnáctého listopadu"], "same_place": null }
```
- `same_place` vyplní David po D1 a rozhovoru s Gieslem: `true` = dva směry na jednom místě, `false` = dvě různá místa, kde by se auta mohla počítat dvakrát.
- Přezdívka samotného místa patří ke skupině. Přezdívky se směrem („na jih“) patří k bráně.
- Bez skupiny by Claude volal nástroj dvakrát a čísla sčítal sám, a to kontrola čísel (správně) neprojde.

Dočasný seznam pro krok A (D1 ho přepíše):
- brány `17-listopadu-jih`, `17-listopadu-sever`, `billa-hynaisova` a `aksamitova-in` (offline, na test `SENSOR_OFFLINE`),
- skupina `17-listopadu`.

Tip do dema: Envelopa Hub i Aula PřF stojí na ulici 17. listopadu. Pokud je brána opravdu blízko (ověřit v D1 podle souřadnic), je otázka „Kolik aut včera projelo kolem budovy, kde právě jsme?“ dobrý háček. Jinak ji nepoužívejte.

### 5.6 Cache a režimy
Soubory:
- Cache obsahuje jeden soubor JSON na den.
- Dnešek se obnovuje nejvýš jednou za 15 minut.
- Uzavřené dny se ukládají trvale.
- Neúplný poslední interval se přepisuje.

| Režim | Nastavení | Chování |
| --- | --- | --- |
| `mock` | `DATA_SOURCE=mock` | vymyšlená data z `lib/mock/` |
| `live` | `DATA_SOURCE=real` | cache a když chybí, síť |

`APP_NOW` zafixuje „teď“ (pro eval a opakovatelné demo). `lib/time.js` ho respektuje všude.

### 5.7 Slušnost k API
- Max 1 požadavek za sekundu.
- Opakování při 429 a 5xx s pauzou 1, 2, 4 a 8 s (max 4×). Respektuj `Retry-After`.
- Timeout 15 s.

## 6. Čas

### 6.1 Pravidla
- Uvnitř jsou časy ISO 8601 s posunem: v datech UTC (`Z`), v UI místní čas.
- Pražský den je [00:00, 24:00) místního času. V zimě je to v UTC [23:00 předchozího dne, 23:00).
- **25. 10. 2026 má 25 hodin** (konec letního času) a 29. 3. 2026 má 23 hodin.
- Server může běžet v UTC (Vercel). Proto nikdy nepoužívej `Date#getHours()` ani pevný posun.

### 6.2 lib/time.js (krok A)
- `now()`: luxon DateTime v Europe/Prague. Respektuje `APP_NOW`.
- `pragueDay(date)` → `{ local_from, local_to, utc_from, utc_to, hours }`
- `hourWindows(date_from, date_to, hour_from, hour_to)` → `[{ date, hour, start_utc, end_utc }]`
- `daysBetween(from, to)` → `["YYYY-MM-DD", …]`
- `utcToPrague(iso)` → `{ date, hour }`
- `formatCzDate("2026-11-19")` → „19. 11. 2026“, `weekdayCz` → „čtvrtek“, `formatCzTime` → „16:00“
- `relativeDates(now)` → `{ today, yesterday, day_before_yesterday, last_monday … last_sunday, last_week_mon, last_week_sun, last_weekend_sat, last_weekend_sun }`

### 6.3 Význam relativních výrazů
Stejná pravidla platí pro systémový prompt i pro eval:
- „dnes“ = dnešek. Data jsou jen do teď.
- „včera“ = dnes − 1, „předevčírem“ = dnes − 2.
- „v pondělí“ (a jiné dny v týdnu) = poslední takový den **před** dneškem.
- „minulý týden“ = pondělí–neděle předchozího týdne.
- „o víkendu“ nebo „minulý víkend“ = poslední sobota–neděle, která skončila před dneškem.
- Části dne:
  | Výraz | Hodiny |
  | --- | --- |
  | ráno | 6–9 |
  | dopoledne | 9–12 |
  | odpoledne | 12–18 |
  | večer | 18–22 |
  | v noci | 0–6 |
  | celý den | 0–24 |
- „ve špičce“ = celý den, odpověď uvede špičku.
- Bez data → včera a `date_assumed: true`.
- Bez místa → `gate: "all"` (pořadí bran).
- Budoucnost se nikdy nepoužívá. Kód ji odmítne jako `BAD_PARAMS`.

## 7. API /api/ask

- `POST /api/ask` s tělem `{ "question": "…" }` pro stránku.
- `GET /api/ask?q=…` pro rychlé testování v prohlížeči.
- Prázdná otázka nebo otázka delší než 300 znaků → HTTP 400 s JSON chybou.
- „Nevím“ je platná odpověď, vrací se s HTTP 200.

```json
{
  "ok": true,
  "question": "Kolik aut projelo včera ulicí 17. listopadu?",
  "answer": {
    "kind": "answer",
    "sentence": "Včera (čt 19. 11. 2026) projelo branou 17. listopadu – jih 12 345 vozidel, nejvíc mezi 16:00 a 17:00 (1 234).",
    "sentence_source": "ai",
    "big_number": { "value": 12345, "label": "vozidel za celý den" },
    "reason": null,
    "assumptions": [],
    "suggestions": []
  },
  "result": { "ok": true, "data": { }, "meta": { } },
  "trace": {
    "model": "claude-haiku-5-5",
    "now": "2026-11-20T19:03:00+01:00",
    "mode": "live",
    "steps": [
      { "type": "model", "ms": 1210, "input_tokens": 1834, "output_tokens": 212, "stop_reason": "tool_use" },
      { "type": "tool",  "name": "traffic_count", "input": { }, "ms": 35, "ok": true },
      { "type": "model", "ms": 980,  "input_tokens": 2410, "output_tokens": 81,  "stop_reason": "end_turn" },
      { "type": "check", "passed": true, "numbers": [19, 11, 2026, 12345, 16, 17, 1234], "not_allowed": [] }
    ],
    "total_ms": 2260,
    "cost_usd": 0.0004
  }
}
```
Hodnoty polí:
- `kind`: `answer` | `unknown`.
- `sentence_source`:
  - `ai`: věta prošla kontrolou,
  - `fallback`: neprošla a větu složil kód,
  - `fixed`: pevná věta, např. u `OUT_OF_SCOPE`.
- `reason`: `null` | `{ code, message }`, kde `code` je kód z §3.3, `OUT_OF_SCOPE` nebo `AI_ERROR`.
- `result`: obálka hlavního nástroje (poslední úspěšná, jinak poslední), nebo `null`.

## 8. AI vrstva (Jáchym)

### 8.1 Systémový prompt (návrh, ladí se v evalu)
Šablona v `lib/ai/systemPrompt.js`. Hodnoty ve složených závorkách doplní kód.
```
Jsi asistent aplikace „Zeptej se Olomouce“. Odpovídáš na otázky o dopravě v Olomouci výhradně z výsledků nástrojů.

Dnes je {den v týdnu} {d. m. rrrr}, {HH:MM}, časové pásmo Europe/Prague.
Data jsou k dispozici od {first} do {last}.

Postup:
1. Když se otázka týká průjezdů vozidel, dopravních špiček, rychlostí nebo stavu dopravních senzorů v Olomouci, zavolej vhodný nástroj.
2. Když se otázka netýká těchto dat (sport, politika, jiné město, obecné znalosti, počasí jinde), nástroj nevolej a jednou větou řekni, že na to aplikace nemá data.
3. Data: {pravidla z SPEC §6.3 – vložit doslova}
4. Místo vyber podle názvu nebo přezdívky v popisu nástroje. Když otázka neurčuje směr a místo má skupinu, použij skupinu. Když místo v otázce není, použij "all". Na jednu otázku stačí jedno volání nástroje.

Po výsledku nástroje napiš odpověď:
- jedna věta česky, nejvýš dvě; bez markdownu, odrážek, emoji a zalomení řádků;
- čísla piš číslicemi a přesně tak, jak jsou ve výsledku (tisíce můžeš oddělit mezerou);
- nepočítej nová čísla: žádné součty, rozdíly, průměry ani procenta, která ve výsledku nejsou;
- vždy uveď místo a období (datum, případně hodiny); hodinu špičky piš jako rozsah, např. „mezi 16:00 a 17:00“;
- když výsledek obsahuje notes o chybějících nebo podezřelých hodnotách, krátce to zmiň;
- když nástroj vrátí ok: false, jednou větou vysvětli proč (podle error.message) a nic nedopočítávej.
```

### 8.2 Definice nástrojů (`lib/ai/tools.js`)
- Enum bran se generuje z `data/gates.json`.
- Do `description` patří seznam bran (`id – název (přezdívky)`). Brány se `status_note` tam mají poznámku „(nefunguje)“.

```js
{
  name: "traffic_count",
  description: "Počet průjezdů vozidel branou (dopravním senzorem) nebo místem (skupinou bran) v Olomouci za období. Vrací součet, řadu po hodinách nebo dnech, špičku a poznámky o chybějících datech. gate='all' vrátí pořadí všech funkčních bran. Hodiny jsou v místním čase. Místa (skupiny): {seznam skupin}. Brány: {seznam bran}",
  strict: true,
  input_schema: {
    type: "object",
    properties: {
      gate:      { type: "string", enum: [/* id z gates.json */, "all"], description: "ID brány ze seznamu, nebo 'all'." },
      date_from: { type: "string", description: "První den, YYYY-MM-DD (místní datum)." },
      date_to:   { type: "string", description: "Poslední den včetně, YYYY-MM-DD. Pro jeden den stejné jako date_from. Max 31 dní." },
      hour_from: { type: "integer", description: "Začátek 0–23 (místní čas). Celý den = 0." },
      hour_to:   { type: "integer", description: "Konec 1–24, nezahrnuje se. Celý den = 24. Např. 7–9 h → 7 a 9." },
      date_assumed: { type: "boolean", description: "true, když v otázce nebylo datum a použil jsi včerejšek." }
    },
    required: ["gate", "date_from", "date_to", "hour_from", "hour_to", "date_assumed"],
    additionalProperties: false
  }
}
```
- `sensor_status`: jediný parametr `gate`, enum bran + `"all"`. Popis: „Stav dopravních senzorů: zda posílají data, kdy naposledy, pokrytí za 7 dní. Na otázky typu ‚funguje senzor…‘, ‚které senzory nefungují‘.“
- `speed_distribution`: parametry `gate`, `date_from`, `date_to`. Přidá se, až bude hotová datová funkce.
- `date_assumed` se před voláním datové funkce **odstraní** a uloží do `trace` a `assumptions`.
- Pokud API odmítne schéma (HTTP 400), zjednoduš ho a hlídej to Zodem. Validace Zodem je povinná vždy.

### 8.3 Smyčka (`lib/ai/ask.js`)
`ask(question, deps)`. `deps` obsahuje `{ client, tools, now, model }` a všechno jde podstrčit kvůli testům a evalu.

1. `messages = [{ role: "user", content: question }]`.
2. Opakuj max 3×:
   - zavolej `client.messages.create({ model, max_tokens: 2048, system, messages, tools, tool_choice: { type: "auto", disable_parallel_tool_use: true } })`,
   - zapiš krok do `trace`.
3. Když je `stop_reason === "tool_use"`:
   1. najdi blok `tool_use`;
   2. ověř, že nástroj existuje. Když ne, výsledek je `unknown`;
   3. zvaliduj vstup Zodem. Při chybě vytvoř obálku `BAD_PARAMS`;
   4. odstraň `date_assumed`;
   5. zavolej funkci v try/catch. Výjimka se změní na obálku `SOURCE_ERROR`;
   6. pushni `{ role: "assistant", content: response.content }` **beze změny**, včetně thinking bloků;
   7. pushni `{ role: "user", content: [{ type: "tool_result", tool_use_id, content: JSON.stringify(obálka), is_error: !obálka.ok }] }`;
   8. pokračuj další iterací.
4. Jinak (`end_turn`): finální text = spojené bloky `text`. Konec smyčky.
5. `max_tokens`, `refusal`, vyčerpané kroky nebo chyba API → `unknown`, `AI_ERROR`.
6. Rozhodnutí:
   - **Žádný nástroj se nezavolal** → `unknown` + `OUT_OF_SCOPE`, pevná věta (§8.6). Claudův text jen do `trace`, uživateli se neukazuje. Je to poučení z cvičení: Claude jinak odpovídá z hlavy.
   - **Hlavní obálka `ok: false`** → `unknown` + `reason = error`. Věta od Claude, pokud projde kontrolou čísel, jinak `error.message`.
   - **`ok: true`** → kontrola čísel. Když projde, `sentence_source: "ai"`. Když neprojde, `fallback` a v `trace` jsou nepovolená čísla.
7. Sanitizace: odstraň `**`, `#`, odrážky a nahraď zalomení mezerou. Zapiš to do `trace`.
8. `big_number`:
   - `traffic_count`: `total`, u pořadí první brána,
   - `sensor_status`: počet nefunkčních,
   - `speed_distribution`: podíl nad 60 km/h.

### 8.4 Kontrola čísel (`lib/ai/checkNumbers.js`)
`extractNumbers(text)` postupuje v tomto pořadí:
1. Normalizuj mezery: U+00A0, U+202F a U+2009 nahraď obyčejnou mezerou. `Intl.NumberFormat("cs-CZ")` dělá tisíce právě NBSP.
2. Data „19. 11. 2026“ a „19.11.2026“ → 19, 11, 2026.
3. „19. listopadu“ → 19.
4. Časy „16:00“ → 16. Minuty jiné než 00 se berou jako další číslo.
5. Tisíce „12 345“ → 12345.
6. Desetinná čísla „12,3“ nebo „12.3“ → 12.3. „12,3 %“ → 12.3.
7. Zbylá celá čísla.

`allowedNumbers(envelope, params)`:
- všechna čísla v `envelope.data` (rekurzivně) a v `meta.coverage`,
- čísla z `error.message` a z `meta.notes` (Claude je smí zopakovat),
- **čísla z názvů a přezdívek všech bran a skupin** (17 z „17. listopadu“). Jinak by kontrola padala na názvu ulice,
- `peak.hour + 1` a `low.hour + 1` (konec rozsahu „16:00–17:00“),
- `hour_from` a `hour_to`,
- den, měsíc a rok každého data v rozsahu `date_from`–`date_to`.

`checkNumbers(text, allowed)` → `{ passed, numbers, not_allowed }`. Celá čísla se porovnávají přesně, desetinná po zaokrouhlení na 1 místo.

Volitelně, až bude čas: věta obsahuje „nejvíc“ nebo „špička“, ale uvedená hodina není `peak.hour` → neprojde.

Testy musí pokrýt: tisíce (mezera, NBSP, úzká NBSP), čárku, %, oba formáty data, časy, rozsahy „16–17 h“, `peak.hour + 1`, název ulice „17. listopadu“, když 17 není v datech (projde), číslo navíc (neprojde), zaokrouhlené „asi 12 300“ (neprojde).

### 8.5 Věta složená kódem (`lib/ai/fallback.js`)
- hodiny: „{brána}, {datum}: {total} vozidel (oba směry), nejvíc mezi {h}:00 a {h+1}:00 ({peak}).“ + „Data chybí za {n} h.“, pokud je `coverage < of`.
- dny: „{brána}, {od}–{do}: {total} vozidel, nejvíc {datum} ({peak}).“
- pořadí: „{datum}: nejvíc průjezdů měla brána {1.} ({n}), dále {2.} ({n}) a {3.} ({n}).“
- senzory: „{brána}: {stav česky}, poslední data {čas}.“ nebo „Nefunguje {n} z {m} senzorů: {seznam}.“

Čísla formátuje `Intl.NumberFormat("cs-CZ")`, data `formatCzDate`.

### 8.6 Texty pro „nevím“
| Důvod | Text |
| --- | --- |
| `OUT_OF_SCOPE` | „Na tohle odpovědět neumím – mám jen data o průjezdech vozidel a stavu dopravních senzorů v Olomouci.“ |
| `NO_DATA`, `SENSOR_OFFLINE` | `error.message` z obálky |
| `BAD_PARAMS` | např. „Na budoucnost data nemám – zkuste se zeptat na včerejšek.“ |
| `SOURCE_ERROR` | „Zdroj dat teď neodpovídá. Zkuste to prosím za chvíli.“ |
| `AI_ERROR` | „Teď se nepodařilo spojit s AI. Zkuste to prosím znovu.“ |

Ke každému „nevím“ patří 2–3 návrhy otázek. Generuje je kód z funkčních bran a včerejška.

### 8.7 Log a cena
- `logs/answers.jsonl` (gitignored), jeden řádek na otázku: čas, otázka, nástroj a vstup, `kind`, `reason`, kontrola čísel, model, ms, tokeny.
- Chyba zápisu nesmí shodit odpověď (na Vercelu se zapsat nedá).
- Otázky, které zkoušeli mentoři, jsou dobré kandidátky do dev sady.
- `lib/ai/pricing.js` obsahuje ceny za 1M tokenů. Haiku 5.5 = 0,10 USD vstup a 0,50 USD výstup, **ověřit na ceníku** platform.claude.com. Neznámý model → `cost_usd: null`.

## 9. Stránka (Jáchym)

Styl: klidný a věcný, ne startupový. Jedna akcentová barva. Funguje na mobilu i na projektoru (velké písmo odpovědi). Česky.

1. **Hlavička**: „Zeptej se Olomouce“ a podtitul „Odpovědi z dat dopravních senzorů (CITIQ / EnCLOD)“. Vpravo štítek režimu (ŽIVÁ DATA / MOCK) a „Data staženo: …“.
2. **Otázka**: pole s labelem, Enter odešle, tlačítko „Zeptat se“.
3. **Návrhy (3)**, upravit podle skutečných bran:
   - „Kolik aut projelo včera ulicí 17. listopadu?“
   - „Kdy byla včera největší špička u Billy na Hynaisově?“
   - „Které dopravní senzory teď nefungují?“

   Do dema navíc: „Kde bylo minulý týden nejvíc aut?“ a „Kdo vyhraje fotbalovou ligu?“ (ukáže „nevím“).
4. **Odpověď**: věta velkým písmem, pod ní velké číslo s popiskem a graf.
   - `HourChart` je vlastní komponenta bez knihovny:
     - sloupce po hodinách nebo dnech,
     - `missing` = čárkovaný obrys a „?“,
     - `suspect` = šrafa a vysvětlivka,
     - pořadí bran = vodorovné pruhy.
   - U `kind: "unknown"`: karta „Nevím“, důvod a návrhy otázek jako klikací tlačítka.
5. **Původ odpovědi** (vždy pod odpovědí):
   - zdroj (název + odkaz na přesný dotaz do API),
   - brána,
   - období v místním čase (UTC menším písmem),
   - pokrytí („22 z 24 hodin“),
   - kdy staženo,
   - režim,
   - poznámky (`notes`),
   - předpoklady (`assumptions`).
6. **Jak AI postupovala** (rozbalovací, v demu otevřené):
   - model,
   - kroky (Claude vybral nástroj → parametry → náš kód spočítal → Claude napsal větu → kontrola čísel prošla / neprošla, větu složil kód),
   - časy a tokeny,
   - cena dotazu.
7. **Přehled města** (karty z `/api/cards`, bez AI): Stav senzorů (x funguje, y nefunguje + seznam s `status_note`), Rychlost (podíl nad 60 km/h za 7 dní, až bude D4).
8. **Patička**: „AI (Claude Haiku 5.5) vybírá nástroj a píše větu. Čísla počítá a kontroluje náš kód.“

Stavy stránky:
- prázdný (návrhy),
- načítání (tlačítko zakázané, „Hledám v datech…“),
- odpověď,
- nevím,
- chyba sítě nebo serveru (česky + „Zkusit znovu“).

## 10. Eval (Jáchym runner, otázky oba ručně)

### 10.1 Soubory
- `eval/questions.dev.json`: asi 25 otázek, na nich se ladí.
- `eval/questions.holdout.json`: asi 15 otázek. Píše je **David** a drží je **mimo repo až do soboty 22:00**, aby se na nich nic neladilo.
- `eval/results/`: výstupy běhů (commitovat, jsou to důkazy pro prezentaci).

```json
[
  { "id": "d01", "category": "count_day",
    "question": "Kolik aut projelo včera ulicí 17. listopadu na jih?",
    "expect": { "kind": "answer", "tool": "traffic_count",
                "params": { "gate": "17-listopadu-jih", "date_from": "{yesterday}", "date_to": "{yesterday}", "hour_from": 0, "hour_to": 24 } } },
  { "id": "d17", "category": "out_of_scope",
    "question": "Kdo vyhraje fotbalovou ligu?",
    "expect": { "kind": "unknown", "reason": "OUT_OF_SCOPE" } }
]
```
- V `expect.params` stačí uvést klíče, které chceme kontrolovat.
- Kategorie: `count_day`, `count_hours`, `count_range`, `peak`, `ranking`, `sensor_status`, `missing_data`, `sensor_offline`, `future`, `out_of_scope`, `no_date`.

### 10.2 Zástupné hodnoty
`{today}`, `{yesterday}`, `{day_before_yesterday}`, `{days_ago:N}`, `{last_monday}` až `{last_sunday}`, `{last_week_mon}`, `{last_week_sun}`, `{last_weekend_sat}`, `{last_weekend_sun}`.
- Řeší se při běhu z `now()` přes `relativeDates` z `lib/time.js`.
- Eval se pouští s `DATA_SOURCE=real` a `APP_NOW`, aby byl opakovatelný.

### 10.3 Kontroly a chyby
U každé otázky se kontroluje:
- `kind`,
- nástroj,
- parametry z `expect.params`,
- `reason`,
- kontrola čísel (`sentence_source === "ai"`; když větu složil kód, uživatel dostal správnou odpověď, ale model chyboval),
- formát (bez markdownu, max 2 věty).

Typy chyb: `wrong_kind`, `wrong_tool`, `wrong_gate`, `wrong_date`, `wrong_hours`, `wrong_reason`, `check_failed`, `format`, `api_error`.

Výstup:
- přesnost celkem a po kategoriích,
- rozpad chyb,
- průměrná a nejhorší doba,
- tokeny a cena na otázku,
- při víc modelech srovnávací tabulka.

### 10.4 Postup
1. Dev sada: max **3 kola ladění**. Každé kolo: běh → rozbor chyb → nejmenší změna (popis nástroje, prompt, přezdívky bran, kód) → nový běh. Kolo zapsat do `docs/ai-usage.md` (přesnost před a po).
2. **Sobota 22:00**: prompt zamrznout a jednou pustit held-out pro `claude-haiku-5-5` a `claude-sonnet-5-5`. Tato čísla jdou do prezentace. Když se potom ještě ladí, musí se to v prezentaci poctivě říct.
3. Proč Haiku obhájíme tabulkou: přesnost, čas a cena Haiku proti Sonnetu na held-out sadě.

## 11. Priority a škrtání

Nikdy neškrtat:
- `traffic_count` na reálných datech,
- smyčka s Claude,
- Původ odpovědi,
- kontrola čísel,
- „nevím“ s důvodem,
- eval s rozpadem chyb,
- **srovnání modelů** (je to jeden parametr evalu a pokrývá „vhodnost modelů“),
- panel „Jak AI postupovala“,
- slide o AI.

Škrtá se v tomto pořadí (první jde pryč první):
1. mapa,
2. meteo,
3. nasazení na Vercel,
5. karty bez AI,
6. speed_distribution,
7. pořadí `"all"`.

Rozhodovací body:
| Kdy | Musí platit |
| --- | --- |
| pátek večer | jedna otázka projde celou cestou (aspoň na mocku) |
| sobota 14:00 | `traffic_count` na reálných datech s Původem odpovědi ve stránce, jinak se škrtá |
| sobota 20:00 | feature freeze, dál jen opravy |
| sobota 22:00 | konec ladění a held-out |
| neděle 11:00 | hotovo: README, odevzdání (čas ověřit, loni bylo 12:00) |

## 12. Tahák Claude API (ověřeno 20. 11. 2026 v typech `@anthropic-ai/sdk` 1.11.0)

Klient:
```js
import Anthropic from "@anthropic-ai/sdk";
const client = new Anthropic({ maxRetries: 3, timeout: 30_000 }); // čte ANTHROPIC_API_KEY z env
const res = await client.messages.create({ model, max_tokens, system, messages, tools, tool_choice });
```
Modely (jsou v typu `Model` v SDK): `claude-haiku-5-5`, `claude-sonnet-5-5`, `claude-opus-5-5`.

Nástroje:
- Nástroj: `{ name, description, input_schema: { type: "object", properties, required, additionalProperties: false }, strict: true }`. `strict: true` zaručí, že vstup sedí na schéma (typy, enum, required).
- Číselné meze (min/max) a délky řetězců ve strict schématech nejspíš podporované nejsou. Napiš je do `description` a hlídej Zodem.
- `tool_choice: { type: "auto", disable_parallel_tool_use: true }` → max jeden nástroj na tah. S thinkingem nelze vynutit konkrétní nástroj, proto `auto`.

Odpověď:
- `res.content` je pole bloků:
  - `thinking` (`thinking`, `signature`),
  - `text` (`text`),
  - `tool_use` (`id`, `name`, `input`, `caller`).
- `res.stop_reason`: `end_turn` | `tool_use` | `max_tokens` | `refusal` | `pause_turn` | `stop_sequence` | `model_context_window_exceeded`.

Pokračování po nástroji:
- `messages.push({ role: "assistant", content: res.content })` **beze změny**. Upravený nebo vynechaný thinking blok skončí chybou 400.
- `messages.push({ role: "user", content: [{ type: "tool_result", tool_use_id, content: "<JSON string>", is_error }] })`. Bloky `tool_result` jsou v obsahu první.

Thinking:
- Haiku 5.5 přemýšlí ve výchozím stavu. Tokeny přemýšlení se počítají do `max_tokens`, proto `max_tokens` ≥ 2048.
- Možné přepínače, jen jako varianta v evalu: `thinking: { type: "disabled" | "adaptive" }` a `output_config: { effort: "low" | "medium" | "high" }`.

Ostatní:
- Spotřeba: `res.usage.input_tokens`, `res.usage.output_tokens` (včetně thinkingu) a `res.usage.output_tokens_details.thinking_tokens`.
- Chyby: SDK samo opakuje 429 a 5xx (`maxRetries`). Zbytek chytat jako `Anthropic.APIError` → `AI_ERROR`.
- Nástroj má i `input_examples` (příklady vstupů). Je to páka pro ladění, ne pro start.
- Nepoužíváme beta `toolRunner`. Vlastní smyčka dává kontrolu nad validací, kontrolou čísel a trace.
- Dokumentace: platform.claude.com/docs (tool use, strict tool use, thinking, pricing).
