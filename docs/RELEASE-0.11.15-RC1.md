# LEXL 0.11.15 – RC1 releasegranskning

Status: **under arbete, ej godkänd för main**. Releasegren: `release/0.11.15-rc1`, skapad från `dev/0.11.15-etapp3b-integration` (bascommit `8fa16bbefe1354103265243a696e612602436298`). Produktionsgren `main` lämnas orörd.

## Beslutad omfattning för RC1
- Engångsövergång från äldre lagring till verifierad IndexedDB.
- Export, granskning, staging, förhandsjämförelse och verifierad säkerhetskopia.
- Uttryckligen godkänd, konservativ återställning via befintlig CAS-transaktion.
- **Begränsning:** återställning som tar bort/ändrar befintliga pass eller program blockeras. Full rollback/sammanslagning ingår inte.
- Nya funktioner för träning, program och statistik skjuts till senare version.

## Bekräftat under granskningen
- `main` är bas för utvecklingshistoriken; `dev` ligger 26 commits före `main`.
- `test/0.11.15-etapp3d-restore` ligger 6 commits före `dev`; dessa är testbyggare och syntetisk filpolicy, inte produktionskod att mergea som helhet.
- Manuell testserie 14–25 är rapporterad godkänd i isolerad syntetisk beta, inklusive återläsning efter återställning av 5 pass och 1 program.
- `recovery-ui.js` och övriga återställningsmoduler finns på utvecklingsgrenen.

## Öppna releasegrindar
- [ ] Verifiera att ordinarie `index.html` laddar alla återställningsmoduler och kopplar UI-kontrollerna korrekt (stor HTML-fil gick inte att hämta komplett i första GitHub-granskningen).
- [ ] Granska att ingen syntetisk testpolicy, test-origin, testnamespace eller testseed följer med i den vanliga appen.
- [ ] Kontrollera service worker/PWA-cache, versionsbeteende och migrering från befintlig 0.11.14 på samma origin.
- [ ] Granska skydd för pågående pass, osparat arbete, samtidiga flikar, felaktiga filer och avbrutna transaktioner i den riktiga releasekandidaten.
- [ ] Bygg reproducerbar RC från ren commit och dokumentera käll-SHA, filhashar och resultat. Tidigare syntetisk Cloudflare-beta är inte en produktions-RC.
- [ ] Kort manuellt regressionstest av vanlig träning, program, historik, statistik, export och återställningsgrind.
- [ ] Uttryckligt användargodkännande innan någon merge/publicering till `main`.

## Releaseprincip
Ingen automatisk merge, ingen ändring av `main` och ingen publicering på produktionsorigin innan samtliga blockerande kontroller är verifierade.
