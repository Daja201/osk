# Backend docs – Zeptej se Olomouce

Praktický přehled datové vrstvy: co je ověřené, co je hardcoded, kde jsou nástrahy. Psáno pro agenty (AI) i pro vlastní referenci/prezentaci.

---

## 1. Architektura datové vrstvy

- `lib/citiq/client.ts` – univerzální HTTP klient na CITIQ API. Nezávislý na datasetu, jen posílá query parametry (`start`, `stop`, `window`, `measurement_keys`, `agg_func`, `group_by_tags`, `format`) a vrací JSON/CSV.
- `lib/citiq/cache.ts` – cache po dnech, nezávislá na datasetu. Funkce `getCachedDay(view, date, params)` dostane název pohledu a vrátí data za jeden den (v pražském čase), uzavřené dny se neobnovují, dnešek max 1×/hod (`REFRESH_INTERVAL_MS`).
- `lib/citiq/traffic.ts` – rozpracovaná doménová funkce `trafficCount` pro dataset `olomouc-traffic-gates`; obsahuje typy vstupu a výsledku i validaci názvu brány.
- **Napojení na model zatím není implementované:** v aplikaci není API route ani adaptér pro Haiku. CITIQ klient a doménové funkce musí zůstat na serveru.

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
- **Stav implementace:** `KNOWN_GATES` a normalizace diakritiky už jsou v `traffic.ts` aplikované. Samotná funkce ale není hotová: soubor aktuálně končí u nedokončené smyčky při skládání hodinových výsledků. Nepovažovat ji zatím za připravenou k volání ani napojení na model.

---

## 3. Dataset `olomouc-traffic` (podklad pro `sensor_status`)

- **View slug:** `olomouc-traffic`, LAST_VALUE. **Jiná datová vrstva než gates** – 37 jednotlivých IN/OUT zařízení (ne brány), jiná jména (`Aksamitova.Videňská.OUT` vs. `Aksamitova/Vídeňská`).
- JSON vrací **pole objektů přímo** (ne `{results: [...]}` jako u gates).
- Každé zařízení má `last_seen` (ISO čas poslední zprávy, nebo `null` pokud nikdy nevysílalo) a `enabled` (administrativní flag, je `true` i u zařízení co nevysílají – **nepoužívat pro stav čidla**).
- Potvrzeno na datech: `Aksamitova.Videňská.*` má `last_seen` z května 2026 (odpovídá poznámce v projektovém dokumentu), `Voskovcova.*` má `last_seen: null`.
- Pro `sensor_status` stačí porovnat `last_seen` s aktuálním časem – žádný time-series dotaz ani `group_by_tags` není potřeba. Prahová hodnota pro „neaktivní“ není schválená; 24 h je zatím jen návrh.

---

## 4. Kontrakt pro napojení na Haiku (Jáchym)

- **Model má volat doménové nástroje, ne CITIQ přímo.** Backend má vlastnit validaci, dotazy, cache a převod na stabilní výstup. Modelu nedávat volnost skládat CITIQ URL ani odvozovat směr ze znaménka.
- Navržený nástroj `traffic_count` přijímá `{ "gate": string, "direction": "in" | "out", "date": "YYYY-MM-DD" }`. Datum znamená kalendářní den v časové zóně `Europe/Prague`; názvy bran přijímají varianty bez diakritiky.
- Plánovaný úspěšný výsledek má být ve tvaru `TrafficCountOk`: `data.total`, hodinové `data.hourly` s `null` pro chybějící hodiny a `meta` s obdobím, pokrytím, zdrojem, časem načtení a poznámkami. Chyba je `TrafficCountError` s `code`, lidsky čitelnou `message` a případnými `suggestions`. Použít stabilní kódy, zejména `UNKNOWN_GATE`, `NO_DATA`, `FETCH_FAILED` a `BAD_RESPONSE`.
- Před stabilizací schématu vyřešit délku `hourly` při změně času v Praze: místní den může mít 23 nebo 25 hodin, ne vždy 24.
- Pro Haiku/Jáchyma vystavit jen ověřené nástroje se vstupním JSON Schema a po volání předat strukturovaný výsledek. Konkrétní transport/model SDK zatím není v projektu zvolený ani implementovaný; doménovou logiku nepřivazovat k jednomu SDK.
- U `sensor_status` nejdřív dohodnout práh neaktivity a tvar výstupu (stav každého zařízení, nebo souhrn). `last_seen: null` musí být odlišeno od starého data; pole `enabled` není indikátorem provozního stavu.
- Fyzický význam směru (`+`/`-` = dovnitř/ven) ověřit s p. Gieslem; současné mapování je pouze týmový předpoklad.
- Ověřit, jestli CITIQ je skutečně EnCLOD síť (formálně) – u organizátorů.

---

## 5. Další kroky před napojením

1. **Dokončit `trafficCount`** – implementovat hodinové bucketing/coverage, výpočet totalu i `meta`; vyřešit 23/25hodinové dny a doplnit testy pro neznámou bránu, bránu bez dat, chybějící hodinu a oba směry. Ověřit, že modul projde TypeScriptem.
2. **Implementovat `sensor_status`** po rozhodnutí o prahu a výstupním kontraktu; pokrýt `last_seen: null`, staré i čerstvé datum.
3. **Vystavit serverové rozhraní pro nástroje** (např. API endpoint nebo serverový tool adapter) a validovat vstup před voláním doménových funkcí. CITIQ dotazy a cache ponechat pouze na serveru.
4. **Napojit Haiku/Jáchyma** přes nástrojové definice odvozené od výše popsaných kontraktů. API klíč případného modelového poskytovatele držet jen v serverové konfiguraci, nikdy v klientovi.
5. **Teplotní dataset** (`meteorological-data-olomouc`) doplnit až po ověření jeho parametrů a odpovědi v [docs/api](./api).

---

## 6. Pro prezentaci – jedna věta ke každému bodu

- "Používáme dva datasety, kterým rozumíme do posledního bitu, ne pět, kterým nerozumíme ani jednomu."
- "Narazili jsme na nedokumentované chování API (neplatný filtr tiše vrátí prázdno) – máme ho ověřené a zdokumentované."
- "Vybrané brány, co mlčí, rozlišujeme od překlepu v názvu – to je přesně ten druh věci, co dělá odpověď důvěryhodnou."