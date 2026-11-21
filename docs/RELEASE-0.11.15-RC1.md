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
- [ ] HTML-titeln är fortfarande `LEXL – Träningslogg PWA 0.11.15 etapp 1 (utveckling)` trots RC1. GitHub-anslutningens `fetch_file` ger tomt innehåll för den stora `index.html` (Git-blobb `b519d9ec72aea36333db7cc75dc06922dd24cbf5`); ändra **inte** hela filen med en tom/trunkerad ersättning. Kräver säker fullständig filåtkomst före ändring.
- [x] `sw.js`: cacheidentifieraren uppdaterad från `01115-stage3b-v1` till `01115-rc1-v1` på RC-grenen (commit `246e50fa0173f81598aae12874f21c376a33677e`). Uppdateringsbeteendet på samma origin är **inte ännu verifierat**.
- [x] `manifest.webmanifest`: versionsfält uppdaterat från `0.11.14` till `0.11.15` på RC-grenen (commit `aa6b34f80200e0692ca9b467deed157276c9fbb5`).
- `recovery-inspection.js` begränsar JSON till 20 MiB och ZIP till 128 MiB; kontrollera felmeddelanden och att stora säkerhetskopior inte leder till databortfall.
- `recovery-activation.js` innehåller gammal kommentar `NOT WIRED TO THE APP UI` trots att den är ansluten; uppdatera dokumentation när implementationen slutverifierats.

## RC1 kontroll efter versionsjusteringar
- [x] `sw.js` omläst efter ändring: `CACHE = PREFIX + '01115-rc1-v1'`; den befintliga scope-avgränsade cachehanteringen har lämnats intakt.
- [ ] Kontrollera övergång med redan aktiv 0.11.14-service worker och bevarade användardata på samma origin (inte testat).
- [ ] Kontrollera HTML-titeln när full fil kan hanteras utan risk för förlust av innehåll.
- [ ] PWA-installation, offlineuppdatering, tillgångar, säker lagring och regression är ännu inte slutgodkända.

## Releaseprincip
Ingen automatisk merge, ingen ändring av `main` och ingen publicering på produktionsorigin innan samtliga blockerande kontroller är verifierade.
