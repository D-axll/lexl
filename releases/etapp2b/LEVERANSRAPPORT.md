# LEXL 0.11.15 – Etapp 2B Återställningstest

Status: isolerad syntetisk testleverans, **inte manuellt godkänd**. Ingen Cloudflare-deployment.

- Gren: `dev/0.11.15-etapp2b-restore-test`.
- Godkänd bas: `2b9cbc12e217963635f761618fbb42255433d772`.
- Ren källcommit som ZIP byggdes från: `9834629b4a9ea2b8d3d211ac6fae0c1b4e0e591c` (`sourceDirty: false`). Leveranscommitten tillför enbart denna rapport, testlogg och färdigbyggda leveransfiler; källcommitten kan granskas/reproduceras separat.
- ZIP: `lexl-restore-01115-2b-upload.zip`.
- Storlek: 44130 byte. Webbplatsfiler: 23.
- SHA-256: `c78c61b8d034e657a6eb10a3f4d92b16815d2b271053acfb081c1ac1fe945a0c`.
- Samtliga 23 webbfilers SHA, ZIP-CRC, exakta ZIP-medlemmar och avsaknad av överordnad `site/`-katalog verifierade.
- Full regression mot den faktiskt byggda leveransen: **157 godkända, 0 misslyckade, 0 överhoppade**, 83.860 sekunder. 128 oförändrade Etapp 1B-tester + 29 2B-tester. Full logg: `test-results.txt`.
- Endast syntetiska data, Playwright med system-Chromium och 412×915 viewport. Ingen fysisk Pixel 8, verklig kvotbrist eller strömförlust provad.

## Leverans via GitHub

Release Assets kunde inte publiceras med tillgängliga verktyg/behörighet. Enligt godkänt reservförfarande ligger ZIP och kontrollsummor därför under `releases/etapp2b/` på den nya utvecklingsgrenen. Ingen GitHub Release eller tagg skapas. Detta är inte en produktionsrelease.

Hämta filen via GitHubs filvy (**Download raw file**) eller direkt:
`https://github.com/D-axll/lexl/raw/refs/heads/dev/0.11.15-etapp2b-restore-test/releases/etapp2b/lexl-restore-01115-2b-upload.zip`

Slutrapporten ger dessutom en oföränderlig länk med leveranscommit. Den verkliga nedladdningen ska efter push kontrolleras med HTTP 200, förväntad storlek, SHA-256 och ZIP-integritet innan uppdraget avslutas.

## Testversion och gränser

Avsedd framtida adress: `https://lexl-01115-restore-2b.pages.dev/lexl-restore-01115-2b/`. Cloudflare-projektet är inte skapat eller publicerat. Publicera inte till befintliga beta-, 2A- eller produktionsorigins. Endast ZIP-innehållet ska senare användas som webbplatsrot vid separat godkänd manuell Direct Upload.

Återställningslaboratoriet använder egna databaser och markörer, inte den godkända träningsappens aktivering. Det demonstrerar återställning till en ny verifierad testyta och visar uppgifterna läsbart. Full träningsredigering och produktionsåterställning ingår inte. Alla befintliga mål blockeras mot överskrivning. Inga rensningar, databasåterställningar eller godkända appkälländringar görs. Originalkopian förblir oförändrad. Senare native data förs inte tillbaka till 0.11.14.

Simuleringar av saknad/skadad/otillgänglig aktiv källa lämnar det verkliga sparade tillståndet intakt. Kontrollerat avbrott efter staging och riktiga aborterade transaktioner verifieras. Simulerat lagringsfel är en transaktionsabort, inte fysisk full disk.

Teknisk granskning och ändrade filer: `docs/ETAPP2B-TEKNISK-RAPPORT.md`.
Manuell checklista: `docs/ETAPP2B-MANUELL-TESTCHECKLISTA.md` (samtliga manuella resultat **Ej testat**).

Ingen merge, ingen Cloudflare-deployment, ingen ändring av main/Etapp 2A/tidigare leveranser. Draft PR är endast för granskning; full diff mot main innehåller även den oförändrade Etapp 1B-basen. För avgränsad 2B-diff: jämför godkänd bascommit med leveranscommitten.
