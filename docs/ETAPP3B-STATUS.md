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
