# LEXL 0.11.15 – etapp 3B, utvecklingsleverans 2026-11-15

## Resultat och avgränsning

Utvecklingsgrenen innehåller nu appintegrerad granskning, separat staging, förhandsjämförelse, extern säkerhetskopia med återval, uttryckligt godkännande och kontrollerad återställning via befintlig CAS-skrivare. Den tidigare direkt ersättande importvägen är borttagen från gränssnitt och `importData()`.

`main` och produktionen 0.11.14 har inte ändrats. Inga riktiga träningsdata har lästs eller använts i testerna. Ingen Cloudflare-publicering har genomförts och ingen manuell testfas har påbörjats.

## Skydd

- Kopior som tar bort eller ändrar befintliga pass, program, utkast eller befintliga övriga toppnivåfält blockeras. Ingen automatisk sammanslagning eller radering.
- Osparade formulärvärden, programredigering, köade/pågående skrivningar, aktivt pass och kvarvarande recovery-nyckel blockerar återställning. Ny synkron kontroll görs inne i skrivtransaktionen.
- Kandidaten kontrolleras via SHA-256 och återläsning av staging. Aktuella data och exporterad backup måste fortfarande matcha godkänd förhandsgranskning.
- Den befintliga IndexedDB-transaktionen kontrollerar exakt `current`/revision samt verifierade aktiverings-, ursprungsbackup-, proposal- och revisionsbevis. `previous`, backupkvitto, nytt `current`, nytt revisionskvitto och `restore:<revision>` skrivs atomärt. Alla proof-kontroller köas i samma transaktion, utan asynkrona uppehåll.
- Efterkontrollfel efter commit blockerar sessionen. Ingen automatisk rollback. Ny uppstart kontrollerar aktuell revisions journal när revisionskvittot anger en återställning.
- Lyckad återställning kräver omladdning innan appen får spara igen. En annan fliks senare skrivning kan ge en försiktig efterkontrollvarning; ingen skrivning görs tillbaka för att dölja konflikten.
- Staging-granskning av en saknad databas skapar inte en tom databas. Övergivna stagingdatabaser bevaras tills separat städpolicy finns.

## Verifierat i denna körning

53 tester passerade med syntetiska data:

- 29 befintliga datamodelltester.
- 16 återställningstester i `fake-indexeddb`: bevarande av historik, nytt pass, äldre/ändrade kopior, utkast, kontrollsumma, samtycke, osparat arbete, annan session, kvot/abort, journal, ändrat aktiveringsbevis, slutlig säkerhetsgrind och fel efter commit med verifierad återstart.
- 5 DOM-flödestester i JSDOM: full appstart/inställningar, osparad redigering, blockerad äldre kopia, nedladdning/återval/samtycke/aktivering samt fel säkerhetsfil. Nedladdning simuleras här, ingen faktisk Android-filväljare.
- 3 byggtester: separat origin och namespace, grinden före lagringsåtkomst på fel adress, manifest/cache/checksummor, giltig syntetisk ZIP och filpolicy som avvisar annan kandidat.

Kommando: `npm ci` följt av `npm test`. Testberoenden är låsta i `package-lock.json`. Befintliga 2B-laboratoriebyggare har låsning mot äldre godkänt källträd och är historiska verktyg; använd den nya 3B-byggaren för denna integration.

## Inte verifierat / kvarvarande risker

- Riktiga Chromium-tester försöktes men kunde inte starta: miljön nekade Chromiums process-singleton-socket (`Operation not permitted`). Inga webbläsarregressioner får räknas som godkända i denna körning. Modelltester bevisar inte verklig IndexedDB-durabilitet eller beteende vid strömavbrott.
- Pixel 8, visuell layout, Android-filval/nedladdning, PWA, offline, verkliga samtidiga flikar och verkligt avbrott under commit återstår. Service worker-assets är byggkontrollerade men inte faktiskt provade offline.
- Export och återval verifierar filens bytes vid kontrolltillfället. Det bevisar inte att telefonen behåller filen permanent. Enheten kan rensa lokal lagring.
- Kvarvarande äldre recovery-nyckel blockerar försiktigt även när den kan avse ett redan avslutat pass. Betan raderar inte nyckeln. Separat hantering behövs senare.
- Destruktiv återställning och sammanslagning av olika versioner av samma pass/program stöds inte.
- Stagingdatabaser kan samla utrymme; automatisk städning är inte implementerad.
- Bekräftelsefras och kontrollsummor är skydd mot misstag och samtidighet, inte ett skydd mot kod som redan kan köra med samma origins behörighet.

## Cloudflare-paket

Bygg med `node scripts/build-integration.cjs /absolut/ny/mapp` från en ren utvecklingscommit. Paketera med `node scripts/package-integration.cjs /absolut/ny/mapp`. Byggaren skriver till en ny katalog och ersätter inga befintliga releaser. Paketeringen vägrar smutsigt källträd, oväntade filer och felaktiga kontrollsummor.

Paketet är avsett enbart för ett **nytt separat** Pages-projekt `lexl-01115-etapp3b`, med avsedd origin `https://lexl-01115-etapp3b.pages.dev` och appscope `/beta-3b/`. Adressen är inte publicerad/verifierad. Om namnet inte är tillgängligt behöver origin ändras i byggaren och ett nytt paket byggas. Ladda inte upp detta i produktion eller ett befintligt testprojekt med annan adress.

Zipfilens rot motsvarar publiceringskatalogen `site`: `index.html`, `_headers` och `beta-3b/`. Separat PWA-identitet, separat localStorage-nyckel och separat IndexedDB-namn. Alla applikationsskript är inaktiva tills origin/scope-grinden godkänt adressen. Endast fasta syntetiska JSON-/ZIP-kandidater accepteras. Inget reset-kommando raderar tidigare data.

Hinder: ingen tillgänglig Cloudflare-plugin eller konfigurerad API-token/kontoidentitet hittades. Extern inloggning/behörighet har inte kringgåtts. Därför är leveransen ett förberett uppladdningspaket, inte en publicerad eller fullt webbläsarverifierad beta.

Manuell checklista: `docs/ETAPP3B-MANUELL-TESTCHECKLISTA.md`. Samtliga punkter är Ej testat. Daniel startar och godkänner den manuella testfasen.
