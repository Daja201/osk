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
- Dopad na `lib/citiq/traffic.ts` (k 20. 11. večer): index `floor((T − půlnoc) / 1 h)` posouvá všechny hodiny o jednu později (hodina 0 je vždy `null`) a body `22:00Z` a `22:59:59Z` padnou oba do posledního indexu. Součet za den sedí, nejrušnější hodina a graf jsou o hodinu posunuté. Opravu dělá David.

## Stav API
- 20. 11. 2026 večer se zdálo, že view `olomouc-traffic-gates` nevrací data. Příčina: `measurement_keys` musí být holý klíč `gate_increment_value`, ne `gate_increment_value_sum` (viz `docs/backend-docs.md`).
