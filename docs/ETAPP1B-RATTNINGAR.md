# LEXL 0.11.15 – etapp 1B

Rättningsomgång efter teknisk granskning av `0c37e710b155010597feab616dbd4367a2d9556d`. Endast `dev/0.11.15`. Ingen push, merge, publicering eller etapp 2.

## Inmatning och identiteter

Den tidigare skrivkön serialiserade transaktioner men tog emot radindex från en äldre DOM. Ett inskjutet set flyttade index innan nästa kommando kördes. Dessutom ersatte `render()` pågående inmatning med tidigare sparade värden.

- Pågående set har `rowId`, uppvärmningsposter `warmupId`. Befintliga utkast får deterministiska, validerade ID:n; nya set får UUID. Historiska poster och deras snapshots tilldelas inte dessa nya utkast-ID:n i efterhand.
- Formulärens uppdateringskommandon använder dessa ID:n. Även kompatibilitetsanrop med numeriskt index översätts till ID **innan** kommandot ställs i kön. Vid körning kontrolleras både pass-ID och mål-ID. Borttagna mål avvisas i stället för att en annan rad ändras.
- En separat minnesbuffert behåller fältvärden med pass- och målidentitet. Omritning återställer värden, fokus, textmarkering och scrollposition. Omritning får inte själv skapa ett nytt ändringskommando genom fokus-/change-händelser.
- Sparningsstatus säger `Osparad inmatning` så länge värdet inte motsvarar verifierat sparat tillstånd eller dess verkliga sparkommando inte har lyckats. Ogiltig inmatning, exempelvis tomt träningsdatum, får inte godkännas genom en tidigare transaktions resultat.
- Ett rekonstruerat fält sparas vid senare fokusbyte även om webbläsaren inte själv skickar `change` efter programmatisk återställning. Under avslut/avbryt låses kontrollerna tills utfallet är känt.
- Minnesbufferten följer med export av osparat arbete och återgångspaket som `pendingInputReview`, med råvärden och en uttrycklig varning. Dessa granskningsvärden appliceras inte automatiskt på träningsdata vid import. Fullständigt sparat tillstånd ligger separat i paketet.
- Omladdning/stängning varnas vid osparat arbete. Webbläsar-/enhetskrasch före beständig sparning kan fortfarande förlora minnesbufferten. Vanlig JSON-export avser sparat tillstånd; ZIP kan även bevara osparat granskningsunderlag.

## Återställningskopior

Nya interna `original` och `previous` använder `lexl-raw-backup-v2` med råtext, källrevision, revision då kopian sparades och SHA-256 över innehåll och revisionsfält. Separata `backup-receipt:original` respektive `backup-receipt:previous` binder kontrollsumma och revision i samma transaktion som tillståndet.

Verifieringen omfattar återläsning, exakt jämförelse inom skrivtransaktionen och checksumme-/revisionskontroll före återställningsexport. Permanent original verifieras före nästa skrivning; ändring sedan verifieringen eller inom transaktionen stoppar skrivningen. Ändring av innehåll till annan giltig JSON upptäcks också.

Äldre etapp 1-kopior i v1 får ingen påhittad kontrollsumma. Permanent original kan verifieras mot den oberoende källbilden; en tidigare native revision mot dess befintliga SHA-256-kvitto. Saknas oberoende bevis avvisas exporten tydligt och kopian lämnas kvar. Nya rullande kopior skrivs i v2. Originalets råtext ersätts aldrig. Redan aktiverade äldre etapp 1-utkast utan de nya mål-ID:na testas för läsning och fortsatt sparning. Ett äldre, ännu inte kopierat förslag vars serialisering behöver nya identiteter stoppas före kopieringen och bevaras tillsammans med originalet; ingen automatisk omskrivning av dess redan verifierade underlag görs. Om ett sådant experimentellt förslag finns behövs separat granskning innan det kan ersättas/fortsättas.

Övergångens originalbackup, samtycke, aktiveringsmarkör, kontroll vid återstart och ZIP-manifest behålls. localStorage-originalet skrivs eller raderas inte. Ingen nedkonvertering till 0.11.14 införs.

## Service worker

Cacheprefixet innehåller hela registreringsscopen. Aktivering raderar enbart äldre cacheversioner med exakt detta prefix. Generiska äldre `lexl-`-cacher och andra installationers cacher lämnas kvar eftersom ägarskap inte säkert kan avgöras.

Läsning sker från den egna cachen. Offline-navigation faller tillbaka på scopets absoluta `index.html` med korrekt Cache API-anrop, även för en okachad queryadress. Cachning av nätverkssvar hanterar skrivfel utan att förstöra det lyckade nätverkssvaret.

Detta isolerar **inte** localStorage/IndexedDB mellan sökvägar. En testversion måste fortfarande använda ett annat HTTPS-värdnamn än produktionen. Inga produktionscacher eller verkliga användardata har använts i testerna.

## Prestanda och kvarstående arkitektur

Skrivning växte med hela historiken genom upprepad kopiering av snapshots, upprepade fullvalideringar och nyöppning/återläsning av samma transaktionsadapter för varje fält.

Rättningen undviker onödiga snapshotkopior och överflödiga valideringspass, återanvänder databasadaptern samt memoiserar verifierat oförändrat övergångsunderlag och permanent original. Varje återanvändning kräver exakt innehållslikhet. Ändrat underlag verifieras igen. Aktuellt tillstånd kontrolleras fortfarande med SHA-256; revisions-/rådatakontrollen ligger kvar i samma strikta skrivtransaktion. Kvitto och beständig framgång verifieras efter transaktionen. Nyare konkurrerande revision skrivs aldrig över genom återställning.

Databasen är fortfarande ett komplett tillståndsdokument. Kopiering, serialisering, hashing och skrivning av hela dokumentet kvarstår och är proportionell mot historiken. Inga separata pass-/settabeller eller annan större arkitektur införs. En sådan ombyggnad kräver separat godkännande.

## Regressioner och mätmetod

Alla körningar använder enbart syntetiska data, nya Chromium-contexts och tillfälliga localhost-origins. Ingen verklig LEXL-origin öppnas.

```sh
node --test tests/*.test.cjs
```

Nya tester styr exakt ordning mellan sparningar och formulärhändelser, kontrollerar fel mål, borttagna mål, fokus/textmarkering, ogiltiga värden, lagringsfel/återförsök, granskningsdata i verifierad ZIP, äldre backupbevis, backupkvittons abort, förändrat tidigare verifierat underlag samt främmande cache och okachad offline-navigation. Historikens ursprungliga fält, snapshots och datumproveniens kontrolleras också. Säkra JSON-värden verifieras innan kopiering; strikt importvalidering och gränser för djup/antal värden gäller även efter att metadata och snapshots har lagts till.

De tio första 1B-testerna kördes separat mot den tidigare leveransens kod: samtliga tio misslyckades. Detta var en avsiktlig negativ kontroll. Den tidigare leveransens ursprungliga 103 tester hade passerat granskningen.

Prestandaverktyget kör 0.11.14, granskad 0.11.15 och aktuell rättning sekventiellt. Underlag kan förberedas utanför repositoryt:

```sh
mkdir -p ../work/lexl-benchmark/before
git show 0b49f20b165bab177fc1ab583509ffab744bf46f:index.html > ../work/lexl-benchmark/baseline.html
git archive 0c37e710b155010597feab616dbd4367a2d9556d | tar -xf - -C ../work/lexl-benchmark/before
node tests/performance.cjs ../work/lexl-benchmark
```

Verktyget skapar syntetiska fixtures och `performance.json` med samtliga råmätningar, medianer och min/max. 0, 100 och 500 historiska pass, tolv set per pass, samma data för alla versioner. En uppvärmningsomgång och sju mätningar per kombination. Service worker blockerad i alla tre versionerna; localhost, Chromium 156, Node 24.22.1, Playwright 1.62.1, mobil vy 390×844 och Europe/Stockholm.

Uppstart mäts till DOM och tillgänglig lagring, inte visuell rendering. Passstart och setändring inkluderar beständig sparning och formuläruppdatering. Övergången sker före mätserien och användarens betänketid ingår inte. Ingen fysisk Pixel 8, mobil CPU eller mobilnätslatens har mätts.

**Slutlig regression: 128 godkända, 0 misslyckade, 0 överhoppade** (29 modelltester och 99 Chromium-tester). 25 nya tester utöver den ursprungliga sviten. Slutkörning cirka 69 sekunder.

Medianer i millisekunder (7 mätningar):

| Pass | Version | Uppstart | Programnavigation | Historik | Starta pass | Spara set |
| ---: | --- | ---: | ---: | ---: | ---: | ---: |
| 0 | 0.11.14 | 58,7 | 1,9 | 0,8 | 2,8 | 1,8 |
| 0 | 0.11.15 före (0c37e71) | 73,7 | 1,7 | 0,9 | 9,5 | 9,4 |
| 0 | 0.11.15 etapp 1B | 91,3 | 2,2 | 1,1 | 10,8 | 7,7 |
| 100 | 0.11.14 | 57,8 | 1,8 | 20,3 | 3,9 | 2,0 |
| 100 | 0.11.15 före (0c37e71) | 97,2 | 1,7 | 20,6 | 111,3 | 105,2 |
| 100 | 0.11.15 etapp 1B | 100,0 | 1,6 | 21,3 | 75,0 | 38,6 |
| 500 | 0.11.14 | 60,4 | 1,9 | 87,7 | 8,6 | 5,4 |
| 500 | 0.11.15 före (0c37e71) | 239,7 | 1,9 | 92,8 | 517,6 | 457,2 |
| 500 | 0.11.15 etapp 1B | 223,7 | 2,2 | 84,8 | 335,7 | 176,6 |

Uppstart avser omladdning efter uppvärmning i en redan aktiverad profil, inte första besöket eller visuell rendering. Uppstartens median med 500 pass minskar från 239,7 till 223,7 ms men är fortfarande långsammare än i 0.11.14. Med 0 pass ökar medianen från 73,7 till 91,3 ms. Ingen generell uppstartsförbättring över alla datamängder har visats. Skrivning och passstart växer fortfarande med historiken. Det finns ingen uppmätt garanti för Pixel 8.
Spara set, 500 pass, 0.11.15 före (0c37e71): min 428.8 ms, max 511.3 ms.
Spara set, 500 pass, 0.11.15 etapp 1B: min 171.2 ms, max 188.2 ms.
Fullständiga råmätningar, samtliga min/max och miljömetadata finns i `docs/ETAPP1B-PRESTANDA.json`. Alla nio mätserier slutfördes utan registrerade JavaScript-fel.

## Stoppunkt

Nästa steg är beställarens granskning. Separat testbygge behöver tydlig TEST-identitet, separat HTTPS-origin, endast syntetiskt underlag och separat publiceringsgodkännande. Inget sådant bygge har publicerats. main, produktion och 0.11.14 är orörda. Ingen push är utförd.
