# Osk: jak ho používat

Osk (Olomouc + ask) je generátor grafů, tabulek a čísel z dat dopravních senzorů v Olomouci.
Napíšete česky, co chcete vidět, a dostanete graf, tabulku nebo větu, kterou můžete zkopírovat,
stáhnout, nebo poslat odkazem. Ke každé odpovědi je důkaz, odkud čísla jsou.

## Jak to funguje
1. Napíšete otázku nebo zadání.
2. AI (Claude Haiku 5.5) z něj vyplní **zadání**: co ukázat (graf, tabulka, věta…), která místa, jaký čas.
   AI nic nepočítá.
3. Náš kód stáhne hodinová data ze senzorové sítě CITIQ a spočítá je.
4. Graf nebo tabulku nakreslí náš kód přímo z čísel. Jen u odpovědi větou napíše větu AI a náš kód
   v ní zkontroluje každé číslo. Když nesedí, větu složí sám.
5. Odpověď se uloží na 7 dní a dostane odkaz `/a/<id>`.

## Na co se ptát

| Chci… | Napište třeba | Dostanu |
| --- | --- | --- |
| jedno číslo | „Kolik aut včera projelo ulicí 17. listopadu?“ | větu s velkým číslem |
| špičku | „Kdy byla v pondělí největší špička u Billy?“ | větu s hodinou |
| porovnat místa | „Porovnej sloupcovým grafem 17. listopadu, Kafkovu a Billu za včerejšek“ | sloupcový graf |
| vývoj v čase | „Jak se měnil provoz na Floře posledních 7 dní?“ | čárový graf po dnech |
| podíl na celku | „Koláčový graf: podíl aut na 17. listopadu a Kafkově za poslední týden“ | koláčový graf |
| čísla do Excelu | „Tabulka vjezdů na parkoviště Flora včera po hodinách“ | tabulku |
| data sám | „Odkud berete data? Dej mi odkaz na API“ | přesné odkazy na API CITIQ |

Když napíšete „kruhový nebo sloupcový“, AI vybere ten, který se k datům hodí víc
(koláč jen pro podíl 2–6 míst na celku).

### Čas
- „včera“, „dnes“ (do poslední celé hodiny), „v pondělí“ (poslední pondělí), „předevčírem“
- „posledních 7 hodin“, „posledních 7 hodin do 15:00“, „od 15:00“, „ráno“ (6–10), „odpoledne“ (12–18), „večer“ (18–22)
- „posledních 7 dní“, „poslední týden“ (7 celých dní do včerejška), „minulý týden“ (pondělí až neděle)
- Bez času se ukáže celý včerejšek a u odpovědi to je napsané.
- Data jsou za posledních ~30 dní, najednou nejvýš 31 dní. Budoucnost ne.

### Místa
17. listopadu (obě brány nebo jen Jih / Sever), Kafkova (obě brány), Billa (Hynaisova), Fisherova, Fugnerova,
Parkoviště Flora, Peškova, Trnkova/Rooseveltova, Trnkova/Zítkova, Tržnice/Polská, U Letadla, Voskovcova, Zikova,
Aksamitova/Vídeňská, Šmeralova (IN, OUT/17. listopadu, OUT/Blahoslavova). Najednou až 12 míst.
Směr: „vjelo / přijelo“ = dovnitř, „vyjelo / odjelo“ = ven, jinak oba směry dohromady.

### Vzhled
- **Nadpis:** „…s nadpisem Stav nyní“. Bez něj nadpis složí kód (místa a období).
- **Pozadí:** modrá, červená, zelená, oranžová, fialová, šedá, tmavá, bílá. Jiné barvy nejsou; ke každé
  jsme vybrali čitelné barvy textu a řad, aby graf šel rovnou do prezentace.
- Graf zatím nejde upravovat (editor grafu přijde později). Stačí otázku napsat znovu jinak.

## Co s odpovědí
- **Kopírovat odkaz**: odkaz `/a/<id>` platí 7 dní. Ukáže stejný graf a pod ním důkaz:
  zadání, které AI vyplnila, všechna čísla a přesné dotazy na API CITIQ (dají se otevřít v prohlížeči).
- **Stáhnout PNG**: obrázek grafu i s nadpisem a zdrojem, ve dvojnásobném rozlišení.
- **Stáhnout CSV**: data pro Excel (středník, UTF-8). Chybějící hodina je prázdná buňka, ne 0.
- **Kopírovat tabulku**: u tabulky, vloží se do Excelu nebo Google Tabulek rovnou do buněk.
- **Podrobnosti** (tlačítko vpravo pod odpovědí): totéž co důkaz na odkazu. Čísla ve větě jdou
  rozkliknout: plné žluté podtržení = spočítal náš kód, čárkované = z vaší otázky (vybrala AI).

## Pro ty, kdo chtějí data sami
- `GET /api/ask?q=<otázka>`: odpověď jako JSON (stejná jako na stránce, včetně `id`).
- `GET /api/answers/<id>`: uložená odpověď jako JSON (7 dní).
- `GET /api/answers/<id>/csv`: data uložené odpovědi jako CSV.
- Zdroj všech čísel: `https://iot.citiq.cloud/portal/api/v2/view/olomouc-traffic-gates/` s parametry
  `measurement_keys=gate_increment_value&window=1h&agg_func=sum&group_by_tags=direction&format=json&start=…&stop=…`
  (přesné adresy pro každou odpověď jsou v důkazu).

## Co data neumí
- Jen počty vozidel po hodinách (přesnější čas průjezdu neznáme).
- Když senzor nevysílá, hodina chybí a součet je neúplný (u odpovědi je to napsané).
- U bran na ulicích jsme neověřili, který směr je „dovnitř“ a který „ven“.
- Odpovědi jsou uložené na našem serveru 7 dní, pak se smažou.
