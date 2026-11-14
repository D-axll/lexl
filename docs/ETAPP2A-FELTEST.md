# LEXL 0.11.15 – Etapp 2A, isolerat migreringsfeltest

Utvecklingsgren: `dev/0.11.15-etapp2a-feltest`.
Godkänd bas: `2b9cbc12e217963635f761618fbb42255433d772` (etapp 1B).

## Teknisk avgränsning

Grenen skapades direkt från bascommitten i en separat worktree. `main`, `dev/0.11.15`, tidigare testleveranser och nedladdningsgrenen ändras inte. Appkällorna `index.html`, `data-layer.js`, `storage-session.js`, `storage-transition.js`, `backup-package.js`, `sw.js` och `manifest.webmanifest` är byteidentiska med den godkända basen. Byggaren kontrollerar detta före generering och stoppar vid avvikelse.

Isolerad bygginfrastruktur från tidigare testarbete återanvänds som nya filer på denna gren. Ingen av dessa filer laddas av den vanliga appen. Endast den genererade feltestprodukten får det avsiktliga avbrottet.

- Namn: **LEXL FELTEST – 0.11.15 ETAPP 2A**, röd FELTEST-markering, egna kontroller och eget PWA-ID.
- Sökväg/scope: `/lexl-feltest-01115-2a/`.
- IndexedDB: `lexl-test-01115-2a-fault-training-schema1`.
- Syntetisk originalnyckel: `lexl-test-01115-2a-fault-v1`.
- Övriga localStorage/sessionStorage-nycklar har motsvarande 2A-prefix. Worker-cache har eget `lexlfault01115-2a-scope:`-prefix. Inga gamla cacher raderas.
- Avsedd separat framtida origin: `https://lexl-01115-feltest-2a.pages.dev`. Den är inte skapad, reserverad eller publicerad. Den vanliga beta-origin och GitHub Pages accepteras inte av adresslåset. Lokala tester tillåter HTTP på localhost/127.0.0.1 och egen port.

Fixture-data är helt påhittade: fem historiska pass med set, vikter, reps, tider, kommentarer och cirkelkopplingar samt ett pågående syntetiskt utkast. Ingen faktisk export eller befintlig användarprofil används. Import och extern ZIP-inläsning är avstängda, även vid direkta funktionsanrop.

## Exakt stoppunkt och kontroll

Byggaren injicerar `LEXL2AFault.afterVerifiedCopy` i den genererade `storage-transition.js`, efter att den ordinarie koden:

1. har slutfört kopieringstransaktionen inklusive revision och kvitto,
2. har återläst och modellvaliderat kopian,
3. har jämfört hela råtexten och SHA-256 med förslaget,
4. har kontrollerat att källbilden inte ändrats.

Hooken ligger **före** skapandet/skrivningen av aktiveringsmarkören. Den kontrollerar dessutom rätt feltestkontext, backup, källidentitet, kopia och revisionskvitto. Om kontrollkomponenten saknas eller underlaget inte kan verifieras stoppas aktiveringen.

Avbrottet är armerat som standard och sparas som en separat sessionsinställning. Läget låses vid försöksstart; kontrollknapparna är spärrade under pågående migrering. Ändrat läge nollställer tidigare UI-godkännande, så att ett nytt uttryckligt godkännande faktiskt krävs även utan omladdning. Det kastar ett tydligt avsiktligt fel vid varje migreringsförsök tills testaren uttryckligen stänger av avbrottet. Inget original skrivs om eller raderas. Den beständiga kopian finns kvar, men är inaktiv utan markör.

Efter omladdning väljer den oförändrade lagringsgrinden originalkällan skrivskyddat, visar det väntande förslaget och erbjuder ny granskning. En befintlig `current`-post räcker inte för att välja IndexedDB som primär. Offline-omstart har samma säkerhetsregel.

Knappen för att stänga av avbrottet ändrar bara testets sessionsflagga. Den anropar inte migreringen och skapar ingen aktivering. Återupptagning kräver det vanliga förberedelseflödet, en omarkerad godkännanderuta som användaren själv markerar och ett nytt bekräftelseklick. Först därefter kan den befintliga verifierade kopian aktiveras. Historik eller pass-ID:n kopieras inte igen.

## Original och fel vid uppstart

En första, tom och verifierat ny 2A-miljö får sin inbyggda syntetiska originalkälla och en separat ursprungsmarkör. Senare uppstarter får inte återskapa eller ersätta källan. Finns markören eller databasen kvar men originalet saknas, stoppas uppstarten. En avvikande källa eller saknad ursprungsmarkör stoppas också.

Kontroll via `indexedDB.databases()` krävs för att skilja ny miljö från överlevande databas utan localStorage. Om kontrollen inte stöds eller lagringsåtkomst nekas stoppas testbygget. Diagnostiken använder enbart lästransaktioner i den egna databasen och får inte skapa en ny databas som ersättning vid en kapplöpning.

Inga reset-/återställnings-/raderingsknappar finns. Testerna för saknad/ändrad källäsning simulerar läsresultatet och behåller själva syntetiska originalvärdet. Ingen normal träningsdata berörs.

## Byggning och lokal körning

Från denna gren med Node.js, Git och Python 3:

```sh
node scripts/build-test.cjs --out /workspace/work/lexl-etapp2a-fault-release
node scripts/package-test.cjs /workspace/work/lexl-etapp2a-fault-release
python3 -m http.server 8115 --bind 127.0.0.1 --directory /workspace/work/lexl-etapp2a-fault-release/site
```

Öppna `http://localhost:8115/lexl-feltest-01115-2a/` på samma dator som servern. localhost i molnmiljön är inte automatiskt åtkomligt från en annan dator. Ingen extern server eller publicering startas av byggaren.

Leveranskatalogen innehåller `site/` med 17 statiska filer, `release-manifest.json`, `SHA256SUMS` och en återläst CRC-/SHA-verifierad `lexl-feltest-01115-2a-upload.zip` med separat kontrollsumma. ZIP innehåller webbplatsens rot, utan ett extra `site/`-led. Publicera inte en byggprodukt med `sourceDirty: true`.

## Enkel manuell testchecklista

1. **Kontrollera rätt miljö.** Röd FELTEST ETAPP 2A-markering, egen adress/scope, fem påhittade pass och ett påhittat pågående pass. Felavbrottet ska vara **ARMERAT**. Använd inte den vanliga beta- eller produktionsadressen.
2. **Förbered kopian.** Välj ”Skapa och kontrollera säkerhetskopia”. Granska syntetisk källa, verifierad SHA-256 och sammanfattning. Markera godkännanderutan och fortsätt.
3. **Se avbrottet.** Ett meddelande om **AVSIKTLIGT FELTEST 2A** ska visas. Start/ändringar ska fortfarande vara spärrade; originalets pass och utkast ska gå att läsa.
4. **Kontrollera status.** Välj ”Kontrollera kopia och aktivering”. Förväntat: `copyPresent: true`, `copyVerified: true`, `backupVerified: true`, `originalAvailable: true`, `originalUnchanged: true`, `activationPresent: false`, `appSource: legacy-readonly`.
5. **Starta om.** Ladda om sidan. Original och utkast ska fortfarande visas skrivskyddat, kopian ska fortfarande vara inaktiv och godkännandet ska krävas igen. Ett nytt försök med avbrottet armerat får inte skapa markör eller dubbletter. Offline-omstart kan prövas efter att worker-cachen installerats online.
6. **Valfri manuell återhämtning.** Stäng av avbrottet med den särskilda knappen. Kontrollera att detta ensamt inte aktiverar något. Granska förslaget igen, markera nytt godkännande och bekräfta. Nu ska markören finnas och IndexedDB bli primär, med samma historik och samma kopia/revision 1. Originalet ska fortfarande vara oförändrat.
7. **Bevara underlaget.** Radera inte localStorage, databas, kopia eller backup. För ett helt nytt försök används en ny isolerad webbläsarprofil eller en annan lokal origin/port. Återarmering rullar inte tillbaka en redan korrekt aktiverad kopia.

## Tekniska kontroller och risker

```sh
node --test tests/*.test.cjs
LEXL_FAULT_RELEASE_DIR=/workspace/work/lexl-etapp2a-fault-release node --test tests/fault-build.test.cjs
```

13 feltestfall omfattar isolering/kontrollsummor, exakt stoppunkt, bevarad historik/utkast, upprepade försök och omstart, spärr mot vanlig skrivning/import, manuell återhämtning med nytt godkännande, skadad inaktiv kopia, saknad/avvikande källa, fel origin, offline-omstart, felaktigt kontrolläge, ZIP-innehåll samt kapplöpning vid ändring av testläge. **Resultat: 141 godkända tester, 0 misslyckade och 0 överhoppade** (128 befintliga etapp 1B-tester och 13 separata feltestfall). De befintliga etapp 1B-testerna och appkällorna är oförändrade.

Begränsningar:

- Detta simulerar ett kontrollerat avbrott vid en exakt protokollpunkt, inte strömavbrott, hårdvarufel eller fysisk korruption av webbläsarens databasfiler.
- Fysisk Pixel 8 och extern hosting har inte använts. Chromium med mobil vy och riktig IndexedDB används automatiserat.
- Testläget är per flik/session och startar armerat i en ny session. Stäng andra testflikar under det manuella scenariot. Att slå av läget är inte ett migrationsgodkännande.
- Webbläsarens externa rensning/eviktion av all webbplatsdata kan inte förhindras av appkod. Använd en dedikerad testprofil och radera inte bevismaterial.
- Diagnostik utan verifierad backup visar `originalUnchanged: null` (ännu inte verifierat), inte att originalet har ändrats.

Ingen sammanslagning eller app-publicering ingår. En eventuell draft PR är endast för kodgranskning. Eftersom GitHubs `main` fortfarande utgår från 0.11.14 kan PR-diffen mot `main` även visa den oförändrade, tidigare godkända etapp 1B-basen. Den isolerade 2A-diffen ska granskas mot committen `2b9cbc12e217963635f761618fbb42255433d772`.
