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
- [x] Verifierat direkt från Git-blobb `b519d9ec72aea36333db7cc75dc06922dd24cbf5`: `index.html` laddar samtliga 10 externa lagrings-/återställningsskript och anropar `LEXLRecoveryUI.create` med `assertSafe`, `assertNoRecoveryDraft`, `onLock` och `onComplete`. Detta är statisk granskning, inte en körd webbläsarverifiering.
- [x] Statisk kontroll av ordinarie `index.html`: ingen `LEXLRecoveryFilePolicy`, `synthetic-export-policy` eller 3D-origin finns där; den använder `min-traning-v1`. De separata 3C/3D-byggskripten finns endast på testgrenen. Fortsatt kontroll av hela releasepaketet behövs.
- [ ] Kontrollera service worker/PWA-cache, versionsbeteende och migrering från befintlig 0.11.14 på samma origin.
- [ ] Granska skydd för pågående pass, osparat arbete, samtidiga flikar, felaktiga filer och avbrutna transaktioner i den riktiga releasekandidaten.
- [ ] Bygg reproducerbar RC från ren commit och dokumentera käll-SHA, filhashar och resultat. Tidigare syntetisk Cloudflare-beta är inte en produktions-RC.
- [ ] Kort manuellt regressionstest av vanlig träning, program, historik, statistik, export och återställningsgrind.
- [ ] Uttryckligt användargodkännande innan någon merge/publicering till `main`.

## Nyupptäckta releasepunkter (2026-11-21)
- HTML-titeln är fortfarande `LEXL – Träningslogg PWA 0.11.15 etapp 1 (utveckling)` trots RC1; uppdatera innan release.
- `sw.js` har cacheidentifieraren `01115-stage3b-v1`; byt till unik RC-version vid produktionspaketering och verifiera uppdateringsbeteendet på samma origin.
- `recovery-inspection.js` begränsar JSON till 20 MiB och ZIP till 128 MiB; kontrollera felmeddelanden och att stora säkerhetskopior inte leder till databortfall.
- `recovery-activation.js` innehåller gammal kommentar `NOT WIRED TO THE APP UI` trots att den är ansluten; uppdatera dokumentation när implementationen slutverifierats.

## Releaseprincip
Ingen automatisk merge, ingen ändring av `main` och ingen publicering på produktionsorigin innan samtliga blockerande kontroller är verifierade.
