# Backend docs – Zeptej se Olomouce

Praktický přehled datové vrstvy: co je ověřené, co je hardcoded, kde jsou nástrahy. Psáno pro agenty (AI) i pro vlastní referenci/prezentaci.

---

## 1. Architektura datové vrstvy

- `lib/citiq/client.ts` – univerzální HTTP klient na CITIQ API. Nezávislý na datasetu, jen posílá query parametry (`start`, `stop`, `window`, `measurement_keys`, `agg_func`, `group_by_tags`, `format`) a vrací JSON/CSV.
- `lib/citiq/cache.ts` – cache po dnech, nezávislá na datasetu. Funkce `getCachedDay(view, date, params)` dostane název pohledu a vrátí data za jeden den (v pražském čase), uzavřené dny se neobnovují, dnešek max 1×/hod (`REFRESH_INTERVAL_MS`).
- `lib/citiq/traffic.ts` – doménová funkce `trafficCount` pro dataset `olomouc-traffic-gates`; validuje vstup, používá denní cache a vrací stabilní výsledek nebo strukturovanou chybu.
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
  - Fyzický význam mapování `"1" = in`, `"-1" = out` **není CITIQ-ověřený** – jde o týmový předpoklad, potvrdit s p. Gieslem. Výstupní počty jsou nezáporné (absolutní hodnota measurementu); směr určuje tag.
  - U dílčích measurementů podle typu/rychlosti vozidla (`gate_len0_speed0_increment` atd.) jsou hodnoty vždy nezáporné nezávisle na směru – tam funguje jen `direction` tag, ne znaménko.
- **Chyba na neplatné uuid:** plochý objekt `{"error": "Device or entity with UUID(s) 'xxx' not found in this view."}` – ne vnořený `code`/`message`, jak byl původní návrh formátu.
- **Díry v datech:** chybějící hodiny v poli `values` prostě nejsou (žádný `null` placeholder) – coverage se počítá z toho, kolik položek v poli reálně je, ne z hodnoty.
- **Stav implementace:** `trafficCount` je dokončená doménová funkce. Rozlišuje `UNKNOWN_GATE` a `NO_DATA`, normalizuje diakritiku, filtruje podle směrového tagu a vrací hodinové hodnoty, total, coverage i metadata. Chybějící hodiny jsou `null`; lokální den má podle změny času 23, 24 nebo 25 chronologicky seřazených intervalů. Na změně času a základním chování jsou testy v `lib/citiq/traffic.test.ts`.

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
- `traffic_count` vrací `TrafficCountOk`: `data.total`, chronologické `data.hourly` s `null` pro chybějící intervaly a `meta` s obdobím, coverage, zdrojem, časem načtení a poznámkami. Délka `hourly` i `coverage.of` je 23, 24 nebo 25 podle místního dne. Chyba je `TrafficCountError` s `code`, lidsky čitelnou `message` a případnými `suggestions`; kódy zahrnují `UNKNOWN_GATE`, `NO_DATA`, `FETCH_FAILED`, `BAD_RESPONSE`, `INVALID_DATE`, `INVALID_DIRECTION` a `INVALID_PARAMS`.
- Pro Haiku/Jáchyma vystavit jen ověřené nástroje se vstupním JSON Schema a po volání předat strukturovaný výsledek. Konkrétní transport/model SDK zatím není v projektu zvolený ani implementovaný; doménovou logiku nepřivazovat k jednomu SDK.
- U `sensor_status` nejdřív dohodnout práh neaktivity a tvar výstupu (stav každého zařízení, nebo souhrn). `last_seen: null` musí být odlišeno od starého data; pole `enabled` není indikátorem provozního stavu.
- Fyzický význam směru (`+`/`-` = dovnitř/ven) ověřit s p. Gieslem; současné mapování je pouze týmový předpoklad.
- Ověřit, jestli CITIQ je skutečně EnCLOD síť (formálně) – u organizátorů.

---

## 5. Další kroky před napojením

1. **Implementovat `sensor_status`** po rozhodnutí o prahu a výstupním kontraktu; pokrýt `last_seen: null`, staré i čerstvé datum.
2. **Vystavit serverové rozhraní pro nástroje** (např. API endpoint nebo serverový tool adapter) a validovat vstup před voláním doménových funkcí. CITIQ dotazy a cache ponechat pouze na serveru.
3. **Napojit Haiku/Jáchyma** přes nástrojové definice odvozené od výše popsaných kontraktů. API klíč případného modelového poskytovatele držet jen v serverové konfiguraci, nikdy v klientovi.
4. **Teplotní dataset** (`meteorological-data-olomouc`) doplnit až po ověření jeho parametrů a odpovědi v [docs/api](./api).

---

## 6. Pro prezentaci – jedna věta ke každému bodu

- "Používáme dva datasety, kterým rozumíme do posledního bitu, ne pět, kterým nerozumíme ani jednomu."
- "Narazili jsme na nedokumentované chování API (neplatný filtr tiše vrátí prázdno) – máme ho ověřené a zdokumentované."
- "Vybrané brány, co mlčí, rozlišujeme od překlepu v názvu – to je přesně ten druh věci, co dělá odpověď důvěryhodnou."