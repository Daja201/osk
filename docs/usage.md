# OSK: jak ho používat
# AI-Generated-Overview

OSK je generátor grafů, tabulek a čísel z dat dopravních senzorů v Olomouci.
Napíšete česky, co chcete vidět, a dostanete graf, tabulku nebo větu, kterou můžete zkopírovat,
stáhnout, nebo poslat odkazem. Ke každé odpovědi je důkaz, odkud čísla jsou.

## Jak to funguje
1. Napíšete otázku nebo zadání.
2. AI (Claude Haiku 5.5) z něj vyplní **zadání**: co ukázat (graf, tabulka, věta…), která místa, jaký čas.
   AI nic nepočítá.
3. Náš kód stáhne hodinová data ze senzorové sítě CITIQ a spočítá je.
4. Graf nebo tabulku nakreslí náš kód přímo z čísel. Jen u odpovědi větou napíše větu AI a náš kód
   v ní zkontroluje každé číslo. Když nesedí, větu složí sám.
5. Odpověď se uloží na 7 dní do konverzace s odkazem `/c/<id>`.
6. Pod odpovědí jde navázat další otázkou („a předevčírem?“, „ukaž to grafem“). AI dostane kontext
   z posledních 2 otázek (otázku, zadání a odpověď, ne čísla k počítání). Jedna konverzace má nejvýš 10 otázek.

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
- **Měřítko:** když jsou hodnoty blízko sebe (např. 21 500 a 23 000), osa sloupcového a čárového grafu nezačne na nule,
  ale na hezkém čísle pod nimi (19 000), aby byl rozdíl vidět. Přiblížení je mírné (nejmenší sloupec zabere aspoň
  ~40 % výšky) a vždy označené: přerušení osy a poznámka „Osa začíná na 19 000, ne na nule“ přímo v grafu.
  Při velkých rozdílech osa začíná na nule.
- **Editor** (jen na počítači, na telefonu není, byl by nepřehledný): tlačítko „Upravit vzhled“ pod odpovědí otevře panel vedle grafu. Změny se ukazují hned:
  - typ: sloupcový, čárový, koláčový, tabulka (nevhodný typ je vypnutý a po najetí myší řekne proč),
  - nadpis, pozadí (paleta), barva každého místa (vzorník nebo libovolná barva),
  - osa: automaticky, od nuly, nebo vlastní „od–do“. Vlastní rozsah musí obsáhnout všechny hodnoty
    (žádný sloupec se neuřízne); když nezačíná nulou, graf to označí,
  - QR kód zapnout / vypnout (výchozí: zapnutý).
  - „Uložit vzhled do odkazu“ uloží kopii odpovědi s tímhle vzhledem a v konverzaci jí nahradí původní.
    Čísla se zkopírují na serveru z původní odpovědi, takže úpravou vzhledu nejde změnit data.
  - Stahuje se přesně to, co vidíte, i bez uložení.

## Co s odpovědí
- **QR kód**: je přímo v grafu vpravo nahoře (i ve staženém PNG), takže kdo vyfotí slajd, dostane se k důkazu.
  Tlačítko „QR kód“ ho ukáže velký (i u tabulky a věty) a dá se stáhnout. Vede na stejný odkaz `/c/<id>`.
  Učitel tak může zpětně (7 dní) ověřit, jak student k číslům došel.
- **Kopírovat odkaz**: odkaz `/c/<id>` na celou konverzaci platí 7 dní od poslední otázky. Ukáže všechny
  otázky s odpověďmi a u každé rozbalitelné „Jak to víme“:
  zadání, které AI vyplnila, všechna čísla a přesné dotazy na API CITIQ (dají se otevřít v prohlížeči).
- **Stáhnout ▾**:
  - **Obrázek PNG**: graf i s nadpisem, QR a zdrojem, ve dvojnásobném rozlišení (do prezentace, dokumentu).
  - **Obrázek SVG**: ostrý v jakékoli velikosti; v PowerPointu ho jde „Převést na obrazec“ a dál upravit.
  - **Data CSV**: pro Excel a Google Tabulky (středník, UTF-8). Chybějící hodina je prázdná buňka, ne 0.
  - **Kopírovat do tabulky**: vloží se do Excelu nebo Google Tabulek (Ctrl+V) rovnou do buněk.
  - Graf jako upravitelný graf Excelu export neumí. Do Excelu vložte PNG, nebo z vložených dat
    vytvořte graf (Vložit → Graf).
- **Jak to víme** (první tlačítko pod odpovědí, u starších otázek konverzace pod každou): totéž co důkaz na odkazu. Čísla ve větě jdou
  rozkliknout: plné žluté podtržení = spočítal náš kód, čárkované = z vaší otázky (vybrala AI).

## Pro ty, kdo chtějí data sami
- `GET /api/ask?q=<otázka>&c=<konverzace>`: odpověď jako JSON (stejná jako na stránce, včetně `id`
  a `conversation_id`). `c` je nepovinné; s ním otázka navazuje na konverzaci. Plná konverzace vrátí `409`.
- Požadavky na Haiku mají limit 1 za minutu a 10 za klouzavých 24 hodin na IP. Při překročení API vrátí `429`
  a hlavičku `Retry-After`. IP a časy požadavků držíme jen dočasně v RAM procesu; po restartu se limit vynuluje
  a při více instancích se počítá zvlášť. Proxy před aplikací musí předat správné `X-Real-IP` nebo `X-Forwarded-For`.
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
