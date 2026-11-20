# Data CITIQ: ověřená fakta

Ověřená fakta mají přednost před hypotézami v `docs/SPEC.md` §5.3. Ke každému faktu patří, kdo ho ověřil a jak.
Podrobnosti o API jsou v `docs/api` (David). Tenhle soubor doplní David v kroku D1.

## Znaménko hodnoty (H1, směr)
- **Platí: kladná hodnota `gate_increment_value_sum` = dovnitř, záporná = ven.** Zdroj: mentor hackathonu, 20. 11. 2026. Tým to bere jako fakt a stavíme na tom.
  Souhlasí s `POSITIVE_SIGN_MEANS_IN = true` v `lib/citiq/traffic.ts`.
- **Brány na ulicích: zatím neověřeno.** Co znamená „dovnitř“ a „ven“ u brány na ulici (např. 17. listopadu), je potřeba zjistit pro každou bránu zvlášť.

## Stav API
- 20. 11. 2026 večer: view `olomouc-traffic-gates` vracelo prázdné `results` na všechny zkoušené dotazy (HTTP 200), registr `olomouc-traffic` fungoval a senzory měly `last_seen` ten den kolem 21:00. Příčina nezjištěna.
