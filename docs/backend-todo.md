# Co frontend potřebuje od backendu

Sepsal Jáchym (s Claude Code) 21. 11. 2026. Frontend jede jen na tom, co vrací `/api/ask`
(`lib/citiq/series.ts` → `lib/ai/ask.ts`). Nic z tohohle není nutné pro demo, je to seřazené podle užitku.

## Předěláno 21. 11. (generátor grafů)
- `lib/citiq/traffic.ts` nahradil `lib/citiq/series.ts`: víc míst, libovolný rozsah, po hodinách / dnech / celkem,
  odkazy na zdroj. Parsování CITIQ je v `parse.ts`, seznam bran a skupin v `gates.ts` (export `KNOWN_GATES` je hotový).
- Den se změnou času (23/25 h) `series.ts` zvládá: hodiny se počítají ze skutečné délky dne a popisky jsou v pražském čase.

## Už opraveno (21. 11.)
- **Posun hodin:** `floor(…) - 1` → `ceil(…) - 1` (teď `hourIndexOf` v `parse.ts`). Poslední bod dne má čas `22:59:59Z`
  (= stop dotazu) a s `floor` padal do hodiny 22 (dvakrát), hodina 23 zůstala `null`. Test: `tests/series.test.ts`.

## Chyby, které zůstaly
1. **`npm run ask` čte `.env`, ale klíč je v `.env.local`.** Web to nerozbije (Next načítá oba), skript v terminálu
   klíč nenajde. Buď vrátit `--env-file-if-exists=.env.local`, nebo dát obě.
2. **Smazaný `lib/citiq/traffic.test.ts`.** `npm test` pořád spouští `node --test lib/citiq/*.test.ts` (teď 0 testů).
   Testy backendu jsou teď ve vitestu (`tests/series.test.ts`), tu část skriptu jde smazat.

## Data, která frontend potřebuje
1. ~~**Export seznamu bran.**~~ Hotovo: `lib/citiq/gates.ts`.
2. **Lidské názvy a skupiny bran (`data/gates.json`).**
   - Pro každou bránu: název pro lidi („17. listopadu, jih“), přezdívky, ke kterému místu patří.
   - Které brány tvoří jedno místo: 17. listopadu (2), Kafkova (2), Šmeralova (3), Trnkova (2).
     Šmeralovu a Trnkovu dnes UI vůbec nenabízí, protože skupina chybí.
   - UI z toho vezme seznam míst v nápovědě „?“ (teď je natvrdo v `components/InfoButton.tsx`).
   - Skupiny jsou zatím v `lib/citiq/gates.ts` (`members`); Šmeralova a Trnkova tam chybí, protože jsme neověřili,
     jestli se jejich brány smí sčítat (IN/OUT brány na Šmeralově by mohly počítat stejná auta dvakrát).
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
