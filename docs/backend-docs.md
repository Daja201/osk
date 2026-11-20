# Backend docs – Zeptej se Olomouce

Praktický přehled datové vrstvy: co je ověřené, co je hardcoded, kde jsou nástrahy. Psáno pro agenty (AI) i pro vlastní referenci/prezentaci.

---

## 1. Architektura datové vrstvy

- `lib/citiq/client.ts` – univerzální HTTP klient na CITIQ API. Nezávislý na datasetu, jen posílá query parametry (`start`, `stop`, `window`, `measurement_keys`, `agg_func`, `group_by_tags`, `format`) a vrací JSON/CSV.
- `lib/citiq/cache.ts` – cache po dnech, nezávislá na datasetu. Funkce `getCachedDay(view, date, params)` dostane název pohledu a vrátí data za jeden den (v pražském čase), uzavřené dny se neobnovují, dnešek max 1×/hod (`REFRESH_INTERVAL_MS`).
- `lib/citiq/traffic.ts` – **jedna nástroj-funkce pro jeden dataset** (`olomouc-traffic-gates`). Obsahuje byznys logiku: jaké measurementy se ptají, jak se čte směr, jaké jsou chybové stavy.

---

## 2. Dataset `olomouc-traffic-gates` (traffic_count)

- **View slug:** `olomouc-traffic-gates`, TIME_SERIES, max rozsah 30 dní, refresh 15 min.
- **19 bran celkem**, ale v `results` se objeví jen ty, co ve zvoleném období aktuálně vysílají — **2 brány (Aksamitova/Vídeňská, Voskovcova) dlouhodobě chybí úplně**, ne s prázdnými hodnotami. CITIQ je v odpovědi prostě vynechá.
  - Důsledek pro kód: `gateRow === undefined` neznamená automaticky "špatný název brány" – může znamenat "brána existuje, ale nevysílá". Nutné rozlišit přes vlastní seznam `KNOWN_GATES`.
- **`measurement_keys` musí být "holý" klíč** (`gate_increment_value`), **ne** s příponou agregace (`gate_increment_value_sum`). Přípona `_sum`/`_mean`/atd. se objevuje jen v **odpovědi** podle zvoleného `agg_func`, není to platný vstupní filtr. Poslání klíče s příponou → CITIQ tiše vrátí `results: []` (žádná chyba, jen prázdno).
- **Směr (`direction`)**:
  - Bez `group_by_tags=direction` CITIQ sečte oba směry do jedné hodnoty za hodinu – **nepoužitelné** pro `traffic_count`.
  - S `group_by_tags=direction` vrací dva body na hodinu, každý s `tags.direction: "1"` nebo `"-1"`.
  - Ověřeno empiricky: `direction: "1"` → hodnota vždy ≥0, `direction: "-1"` → hodnota vždy ≤0 (tag a znaménko nesou stejnou informaci u `gate_increment_value`).
  - Fyzický význam (které číslo je "dovnitř") **není CITIQ-ověřený** – je to týmové rozhodnutí (`+ = dovnitř`), potvrdit s p. Gieslem na mentoringu.
  - U dílčích measurementů podle typu/rychlosti vozidla (`gate_len0_speed0_increment` atd.) jsou hodnoty vždy nezáporné nezávisle na směru – tam funguje jen `direction` tag, ne znaménko.
- **Chyba na neplatné uuid:** plochý objekt `{"error": "Device or entity with UUID(s) 'xxx' not found in this view."}` – ne vnořený `code`/`message`, jak byl původní návrh formátu.
- **Díry v datech:** chybějící hodiny v poli `values` prostě nejsou (žádný `null` placeholder) – coverage se počítá z toho, kolik položek v poli reálně je, ne z hodnoty.

---

## 3. Dataset `olomouc-traffic` (budoucí sensor_status)

- **View slug:** `olomouc-traffic`, LAST_VALUE. **Jiná datová vrstva než gates** – 37 jednotlivých IN/OUT zařízení (ne brány), jiná jména (`Aksamitova.Videňská.OUT` vs. `Aksamitova/Vídeňská`).
- JSON vrací **pole objektů přímo** (ne `{results: [...]}` jako u gates).
- Každé zařízení má `last_seen` (ISO čas poslední zprávy, nebo `null` pokud nikdy nevysílalo) a `enabled` (administrativní flag, je `true` i u zařízení co nevysílají – **nepoužívat pro stav čidla**).
- Potvrzeno na datech: `Aksamitova.Videňská.*` má `last_seen` z května 2026 (odpovídá poznámce v projektovém dokumentu), `Voskovcova.*` má `last_seen: null`.
- Pro `sensor_status` stačí porovnat `last_seen` s aktuálním časem (např. práh 24 h) – žádný time-series dotaz, žádný `group_by_tags` není potřeba.

---

## 4. Co zatím chybí / TODO

- `sensor_status` funkce nad `olomouc-traffic` – zatím nenapsáno (viz sekce 3 výš jako podklad).
- Rozlišení `UNKNOWN_GATE` vs. `NO_DATA` v `traffic.ts` – navrženo (`KNOWN_GATES` konstanta), ale **ještě není aplikováno** v aktuálním souboru.
- Diakritika v `normalizeGateName` – navrženo přidat `.normalize("NFD").replace(/[\u0300-\u036f]/g, "")`, aby AI nemusela trefit přesně háčky/čárky – **zatím neaplikováno**.
- Fyzický význam směru (`+`/`-` = dovnitř/ven) – ověřit s p. Gieslem, zatím jen vnitřně konzistentní předpoklad.
- Ověřit, jestli CITIQ je skutečně EnCLOD síť (formálně) – u organizátorů.

---

## 5. Pro prezentaci – jedna věta ke každému bodu

- "Používáme dva datasety, kterým rozumíme do posledního bitu, ne pět, kterým nerozumíme ani jednomu."
- "Narazili jsme na nedokumentované chování API (neplatný filtr tiše vrátí prázdno) – a máme to pokryté testem, ne naslepo."
- "Vybrané brány, co mlčí, rozlišujeme od překlepu v názvu – to je přesně ten druh věci, co dělá odpověď důvěryhodnou."