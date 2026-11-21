# Co frontend potřebuje od backendu

Sepsal Jáchym (s Claude Code) 21. 11. 2026. Frontend dnes jede jen na tom, co vrací `/api/ask`
(`lib/citiq/traffic.ts` → `lib/ai/ask.ts`). Nic z tohohle není nutné pro demo, je to seřazené podle užitku.

## Už opraveno (21. 11.)
- **Posun hodin v `traffic.ts`:** `floor(…) - 1` → `ceil(…) - 1`. Poslední bod dne má čas `22:59:59Z` (= stop dotazu)
  a s `floor` padal do hodiny 22 (dvakrát), hodina 23 zůstala `null`. Test: `tests/traffic-hours.test.ts`.

## Chyby, které zůstaly
1. **Dny se změnou času a rozsah hodin.** V `trafficCount` je `rangeTo = hour_to ?? 24`. Den se změnou času má
   25 hodin, takže bez `hour_to` se poslední hodina zahodí (stejné je to v `sumResults` v `lib/ai/ask.ts`).
   Výchozí hodnota by měla být `expectedHours`. U 23/25hodinových dnů navíc index ≠ hodina na hodinách.
2. **`npm run ask` čte `.env`, ale klíč je v `.env.local`.** Web to nerozbije (Next načítá oba), skript v terminálu
   klíč nenajde. Buď vrátit `--env-file-if-exists=.env.local`, nebo dát obě.
3. **Smazaný `lib/citiq/traffic.test.ts`.** `npm test` pořád spouští `node --test lib/citiq/*.test.ts` (teď 0 testů).
   Buď testy vrátit, nebo tu část skriptu smazat.

## Data, která frontend potřebuje
1. **Export seznamu bran.** `lib/ai/gates.ts` má kopii `KNOWN_GATES`. Stačí `export const KNOWN_GATES` v `traffic.ts`.
2. **Lidské názvy a skupiny bran (`data/gates.json`).**
   - Pro každou bránu: název pro lidi („17. listopadu, jih“), přezdívky, ke kterému místu patří.
   - Které brány tvoří jedno místo: 17. listopadu (2), Kafkova (2), Šmeralova (3), Trnkova (2).
     Šmeralovu a Trnkovu dnes UI vůbec nenabízí, protože skupina chybí.
   - UI z toho vezme seznam míst v nápovědě „?“ (teď je natvrdo v `components/InfoButton.tsx`).
3. **Souřadnice bran** (z registru CITIQ `olomouc-traffic`, případně OpenStreetMap), pokud budeme chtít mapu.
   Získávání patří do backendu, frontendu stačí `{ name, lat, lon }`.
4. **Stav senzorů** (`last_seen` z view `olomouc-traffic`): které brány teď nevysílají. Hodí se jako další nástroj
   pro AI („Které senzory teď nevysílají?“) a jako varování v odpovědi.
5. **Podezřelé hodnoty.** Po výpadku senzoru někdy přijde neobvykle vysoké číslo. Kdyby `hourly` mělo vedle hodnoty
   i stav (`ok` / `missing` / `suspect`), UI ho umí vyšrafovat (návrh v `docs/design/stav-chybejici-data.html`).
6. **Poznámky pro lidi.** `meta.notes` jsou technické („tags.direction=…“), UI je ukazuje jen v sekci „Pro vývojáře“.
   Poznámky určené lidem (např. „senzor mezi 3:00 a 5:00 nevysílal“) by se hodily jako zvláštní pole.

## Ověřit v datech
- Co znamená „dovnitř“ a „ven“ u bran na ulicích (u parkoviště je to jasné). Viz `docs/data-notes.md`.
