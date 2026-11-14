# Etapp 3B – påbörjad integration (ej godkänd)

Gren: `dev/0.11.15-etapp3b-integration`. Bas: Etapp 2B `60234e834ccefdd79760f45fd8162720f0461901`, som i sin tur innehåller Etapp 1B. `main` ändras inte.

## Implementerat hittills

`recovery-inspection.js` är en fristående **skrivskyddad** modul för granskning av användarvalda JSON- och ZIP-filer. ZIP kräver det befintliga återgångsmanifestet och valideras av `LEXLBackupPackage.decode` och `LEXLTransition.verifyBundle`. JSON valideras med `LEXLData.importData`. Granskningen ger typ, SHA-256 för det normaliserade tillståndet, revision, antal program och pass, förekomst av utkast och varning. Inga filer laddas upp till en server. Den returnerade råtexten är **inte** godkänd för aktivering enbart genom att granskningen lyckats.

Modulen är **inte kopplad till `index.html`**, `sw.js` eller `storage-session.js` och är därför ännu inte tillgänglig i appens gränssnitt. Inga lagringsdatabaser öppnas eller skrivs av modulen.

## Säkerhetsgräns och återstående arbete

1. Verifiera att appens lagringsgrind kan acceptera ett nytt, separat återställningsmål utan att förbigå aktiveringsbevis och revisionskontroller. Återanvänd inte laboratoriets syntetiska databasnamn eller dess asset-bundna verifiering i produktion.
2. Bygg ett fristående staging- och aktiveringsprotokoll för verkliga, användarvalda filer, med tydligt samtycke, atomära skrivningar, efterverifiering och förbud mot överskrivning av aktiva data.
3. Utred och testa hur återställd källa väljs i `storage-session.js` vid start och omstart, inklusive felaktig markör, felaktig backup, avbrott och flera fönster. Originalet och äldre databaser ska behållas.
4. Integrera först därefter filval, granskningssammanfattning, varningar och separata godkännanden i appens gränssnitt. Se över service worker-cache, offline och mobil vy.
5. Kör regression med enbart syntetiska filer och separat origin. Därefter svensk manuell testchecklista; inga verkliga träningsdata, ingen merge och ingen produktionspublicering utan nytt godkännande.

## Öppna granskningspunkter

- Etapp 2B:s äldre IndexedDB-kopia visade en missvisande generell text om senare data. 3B-granskningen använder en neutral varning tills faktisk proveniens och jämförelse kan göras.
- Tidigare manuella 2B-data visade möjlig skillnad mellan sjätte passets innehåll och `snapshot.record`. Detta är en testanmärkning, inte en verifierad produktionsbugg.
- Inget påstående om godkänd återställning eller full integration görs innan gränssnitt, aktivering och omstart faktiskt testats.

## Nytt steg: isolerad staging (2026-11-15)

`recovery-staging.js` har lagts till. Efter godkänd filgranskning kan en kandidat skrivas till en **ny, separat** IndexedDB-databas med slumpmässigt UUID-namn. Staging gör SHA-256-kontroll före skrivning, använder `add` (ingen överskrivning), strikt transaktion och läser tillbaka/verifierar efter commit. `inspectStaged` verifierar kvittot vid en ny läsning.

**Avgränsning:** Ingen koppling till UI eller `storage-session.js`, ingen aktivering, ingen skrivning till `lexl-training-schema1` eller localStorage. Ingen testpublicering eller manuellt testresultat ännu. Det återstår att utforma säker aktivering och granska befintlig aktiv data, flerfönstersituationer, felhantering och möjligheter att rensa övergivna staging-databaser. Ett staging-kvitto är inte en behörighet att skriva över aktiva data.

## Nytt steg: förhandsjämförelse utan aktivering

`recovery-preflight.js` tillagd. Modulen verifierar staging-kvittot igen, läser den nuvarande aktiva datakällan och jämför program, pass, revision och utkast med säkerhetskopian. Den redovisar hur många pass/program som skulle försvinna och om revisionen är äldre. Resultatet anger uttryckligen `eligibleForAutomaticActivation:false` och skriver inga data.

**Inte klart:** Jämförelsen är ännu inte kopplad till UI eller automatiskt testad. Förändrade pass jämförs för närvarande via JSON-serialisering, vilket kan markera samma innehåll med annan nyckelordning som ändrat. Kontroll av aktuellt återställningsutkast i separat recovery-nyckel, förändringar från andra flikar under granskningen, källans revisionskvitto och atomär aktivering måste hanteras innan aktivering får byggas in. Inga verkliga data får användas i detta skede.
