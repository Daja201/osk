# Data CITIQ: ověřená fakta

Ověřená fakta mají přednost před hypotézami v `docs/SPEC.md` §5.3. Ke každému faktu patří, kdo ho ověřil a jak.
Podrobnosti o API jsou v `docs/api` (David). Tenhle soubor doplní David v kroku D1.

## Znaménko hodnoty (H1, směr)
- **Platí: kladná hodnota `gate_increment_value_sum` = dovnitř, záporná = ven.** Zdroj: mentor hackathonu, 20. 11. 2026. Tým to bere jako fakt a stavíme na tom.
  V `lib/citiq/traffic.ts` se směr bere z `tags.direction` ("1" = dovnitř, "-1" = ven), což znaménku odpovídá.
- **Brány na ulicích: zatím neověřeno.** Co znamená „dovnitř“ a „ven“ u brány na ulici (např. 17. listopadu), je potřeba zjistit pro každou bránu zvlášť.

## Čas bodu (H2): čas = KONEC hodinového okna (potvrzeno 20. 11. 2026, Jáchym)
- Důkaz: dotaz na 19. 11. se `start=2026-11-18T23:00:00.000Z`, `stop=2026-11-19T22:59:59.000Z` vrátil u brány Billa (Hynaisova) jako poslední časy `2026-11-19T22:00:00+00:00` a `2026-11-19T22:59:59+00:00`. Čas rovný `stop` může být jen konec okna (styl InfluxDB `aggregateWindow`).
- Důsledek: bod s časem `T` = provoz za `[T − 1 h, T)`. Hodina v místním čase = hodina z `T − 1 h`.
- Opraveno 21. 11. 2026 v `lib/citiq/traffic.ts`: index hodiny = `ceil((T − půlnoc) / 1 h) − 1`. Bod `22:59:59Z` (konec posledního okna) tak patří do hodiny 23. Test: `tests/traffic-hours.test.ts`.

## Stav API
- 20. 11. 2026 večer se zdálo, že view `olomouc-traffic-gates` nevrací data. Příčina: `measurement_keys` musí být holý klíč `gate_increment_value`, ne `gate_increment_value_sum` (viz `docs/backend-docs.md`).
