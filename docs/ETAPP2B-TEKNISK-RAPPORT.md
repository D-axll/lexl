# LEXL 0.11.15 – Etapp 2B: isolerad säker återställning

Status: utvecklingstest, **inte manuellt godkänt**, ingen produktionsfunktion.
Gren: `dev/0.11.15-etapp2b-restore-test`.
Bas: godkänd Etapp 1B `2b9cbc12e217963635f761618fbb42255433d772`.
Etapp 2A `b2c96085641bdabfbb374df4f23a70bfb228c18e` och dess leverans är orörda.

## Teknisk granskning av befintlig kod

- `data-layer.js`: strikt JSON-/schemavalidering, stabila identiteter, bevarande av äldre ögonblicksbilder och `storageRevision`. Native JSON-export innehåller aktuellt tillstånd, inklusive pågående pass. Äldre JSON saknar schema/identiteter; den godkända `importData`/`prepare` tillför metadata utan att räkna om resultat. Enbart en intern rullande backup är inte en extern katastrofåterställning.
- `storage-transition.js`: säkerhetskopierar exakta legacy-/utkaststrängar; SHA-256 och återläsning före samtycke; kopia blir primär först med verifierad aktiveringsmarkör. En ensam `current`-rad räcker inte. Dess `verifyBundle` kontrollerar varje fil, obligatoriska medlemmar, revision, källbild och nya/ändrade/borttagna pass.
- `storage-session.js`: spärrar appskrivningar före giltig aktivering. Den är avsedd för befintligt migreringsflöde, inte fristående återställning till ett nytt mål när en gammal databas är trasig.
- `backup-package.js`: begränsad ZIP-läsare med CRC, säkra filnamn, storleksgränser och komplett fillista. Bara okomprimerad ZIP stöds för **interna säkerhetskopior**. Webbplatsens upload-ZIP komprimeras separat och ska inte importeras som träningsbackup.
- Befintlig UI-import ersätter tillstånd via den vanliga sessionens skrivflöde. Den är inte en lösning när aktivering eller primär lagring inte kan verifieras. Därför används den inte i 2B.

## Avgränsning och skillnad mellan kopior

2B är ett separat återställningslaboratorium med läsbar visning av återställda program, full historik och utkast. Det ändrar eller startar inte den godkända träningsappen och kan inte läsa externa filer. Återställda data används endast av laboratoriets egna läsare; de kopplas inte till Etapp 1B:s eller 2A:s aktiveringsmarkörer. En senare produktionsintegration kräver eget beslut.

En medföljande äldre localStorage-kopia har fem syntetiska pass och ursprungligt utkast, revision 0 efter godkänd modellvalidering. En tidigare native export har revision 1. Den senare native exporten har revision 7, sex pass, annan påhittad utkastanteckning och samma programlinje. Inga revisionsnummer sänks eller räknas om vid återställning. Den ursprungliga JSON-strängen bevaras exakt separat.

ZIP-exemplet följer befintligt `lexl-rollback-manifest-v1` och innehåller native export, originalkopia, nya pass och manifest. **Native exporten** är återställningskälla; originalet i samma paket är inte en ersättare för senare IndexedDB-uppgifter. ZIP och native JSON återställer exakt samma tillstånd. Kopiorna och deras hashvärden är byggda från påhittad fixture, aldrig från en användare.

Originalkopian kräver en extra bekräftelse om att senare uppgifter saknas. Mot varje redan aktivt mål blockeras alla återställningar, även identiska och nyare. Äldre revision/tidpunkt inom denna enda syntetiska datalinje ger särskild varning. Revisioner mellan olika verkliga installationer kan inte jämföras på detta sätt; generell provenienshantering ingår inte.

## Isolering

- Avsedd origin: `https://lexl-01115-restore-2b.pages.dev` (ej skapad/publicerad).
- App och service worker-scope: `/lexl-restore-01115-2b/`.
- PWA-id: `/lexl-restore-01115-2b/pwa`, namn **LEXL ÅTERSTÄLLNINGSTEST 2B – 0.11.15**.
- IndexedDB: `lexl-test-01115-2b-restore-target-<UUID>`. Bara detta exakta namnformat tillåts.
- localStorage: `lexl-test-01115-2b-restore-original`, `-created`, `-selected`.
- sessionStorage: `lexl-test-01115-2b-restore-simulation`.
- Cacheprefix: `lexlrestore01115-2b:`. Ingen cache raderas, inte heller äldre 2B-cache.
- GitHub Pages, beta-adressen och 2A-adressen avvisas innan träningslagring öppnas. Endast avsedd origin och lokal HTTP på localhost/127.0.0.1 accepteras.
- Granskad 2A-launcher återanvänds: fel gammal service worker måste ersättas av egen scoped worker och hela dokumentet laddas om innan appskript får köras.
- CSP tillåter inga externa datadestinationer. Inga träningsdata skickas med POST/PUT eller uppladdning. Bara statiska, medföljande testresurser hämtas via GET.
- Extern import saknar filväljare och API. Endast fasta asset-ID:n med bygginbakad SHA-256 och förväntad tillståndshash accepteras. En produktionsbackup kan inte väljas.

## Protokoll och avbrottssäkerhet

1. Kontrollera origin/scope, krypto, IndexedDB-kapacitet, syntetiskt original och ursprungsmarkör. Saknad källa efter tidigare användning leder till stopp, aldrig automatisk återskapning. Lagringsfel ger ingen fallback till äldre versioners nycklar.
2. Användaren skapar uttryckligen en ny tom testdatabas. Alla tidigare databaser bevaras. Valet återläses från localStorage; om detta misslyckas visas inte framgång.
3. Användaren granskar en medföljande backup. Kontrollera ytterfilens SHA-256, ZIP/JSON-format, manifest, modell och exakt förväntat syntetiskt tillstånd. Ingen staging skrivs vid granskning. SHA visar integritet relativt bygginbakade testvärden, inte extern avsändarautenticitet.
4. Nytt uttryckligt samtycke krävs. Ändrat val/felläge/testyta återkallar tidigare UI-samtycke. Separat legacy-samtycke krävs för originalet.
5. Transaktion med `durability: strict` gör en compare-and-swap mot tomt mål och sparar `stage`. Okända poster eller annan staging innebär stopp. Identisk staging får efter nytt samtycke återanvändas, aldrig kopieras över.
6. Transaktionen måste avslutas; staging återläses och modell, revision, proveniens och SHA verifieras innan aktivering.
7. En separat strict-transaktion kontrollerar samma staging, vald testyta, oförändrat original och frånvaro av aktivering, och lägger till aktiveringsmarkören med `add`. Konkurrerande fönster kan inte ersätta en vinnande markör eller staging.
8. Markör och staging återläses tillsammans och verifieras innan UI visar framgång. Vid osäker slutläsning visas fel; nästa uppstart verifierar sparat bevis, utan ny återställning.
9. Uppstart läser aldrig staging som primär utan giltig markör. Staging behålls efter avbrott. Ett nytt godkännande kan slutföra samma kopia. Alla nya försök mot redan aktivt mål stoppas: inga dubbletter.

`stage` innehåller rått exakt normaliserat tillstånd, dess SHA, ursprungsasset, exporttidpunkt, revision och unikt staging-ID. Markören refererar samma ID/hash/revision. Ingen originaldatabas raderas, rensas, byts version eller skrivs över. Om befintlig testyta faktiskt inte kan läsas/valideras får endast uttrycklig skapning av ett **nytt** mål ske, och bara när originalet fortfarande kan verifieras. Är IndexedDB globalt otillgängligt stoppas återställningen helt.

## Felsimuleringar och begränsningar

- `after-stage`: avbryt efter avslutad, återläst och verifierad staging, före markör.
- `abort-transaction`: avbryt stagingtransaktionen efter `add`; inget committas.
- `abort-activation`: staging bevaras, markörtransaktionen aborteras.
- `quota`: en avsiktligt aborterad stagingtransaktion modellerar ett skrivfel. Den fyller inte webbläsarens kvot och är **inte en fysisk QuotaExceededError-provning**.
- Saknad/skadad/otillgänglig aktiv källa simuleras som oläsbar ur användarflödets perspektiv. Underliggande data bevaras och dess verkliga integritet kontrolleras fortfarande. Läget sparas per flik över omladdning. Ny tom testyta stänger simuleringen, utan att röra tidigare data.
- Automatiserade tester skadar dessutom staging/aktiveringsbevis i egna nyss skapade syntetiska testprofiler och verifierar att verkliga valideringsfel stoppas. Manuella tester behöver inga utvecklarverktyg.
- Inga verkliga strömavbrott, OS-rensningar, full disk eller Pixel 8 har testats. IndexedDB-transaktioner ger webbläsarens garantier, inte skydd mot total enhetsförlust.
- Ingen lista/återställning av gamla mål och ingen städning ingår. Upprepade nya testytor/cacher tar utrymme. Avsluta experimentet om lagringsfel uppstår; radera inte andra LEXL-miljöer.
- Generell filimport, återställning till produktion, sammanslagning, nedkonvertering till 0.11.14 och full träningsredigering ingår inte. Nya native pass blir inte automatiskt läsbara i 0.11.14.

## Ändrade filer och byggning

Alla ändringar är **nya** filer, inga godkända applikationsfiler modifieras:

- `test-build/restore-engine.js`: isolerat lagrings-/återställningsprotokoll.
- `test-build/restore-ui.js`: testkontroller, samtycke, diagnostik och läsvy.
- `test-build/synthetic-fixture.cjs`, `launcher.cjs`, `test-icon.cjs`: granskad testinfrastruktur från 2A.
- `scripts/build-restore.cjs`: endast offlinebyggning; kontrollerar godkända källfiler byte för byte mot bascommitten, skapar syntetiska backuper och separat PWA.
- `scripts/package-restore.cjs`: verifierar exakt fillista, SHA, ZIP/CRC och deterministisk struktur utan överordnad `site/`-mapp.
- `tests/restore-build.test.cjs`: automatiserad webbläsar-/leveransregression.
- Denna rapport och `docs/ETAPP2B-MANUELL-TESTCHECKLISTA.md`.
- `releases/etapp2b/`: verifierad ZIP, ZIP-SHA, webbfilernas SHA, release-manifest och leveransrapport. Ingen applikationsdeployment.

```sh
node scripts/build-restore.cjs /workspace/work/lexl-etapp2b-restore-release
node scripts/package-restore.cjs /workspace/work/lexl-etapp2b-restore-release
LEXL_RESTORE_RELEASE_DIR=/workspace/work/lexl-etapp2b-restore-release node --test tests/*.test.cjs
```

Byggaren vägrar skriva över en befintlig leveranskatalog. `release-manifest.json` anger exakt källcommit, arbetskatalogens renhet, bascommit, origin och SHA för alla 23 webbplatsfiler.

## Leverans, granskning och publiceringsgräns

Filen `lexl-restore-01115-2b-upload.zip` publiceras som nedladdningsfil på **den separata utvecklingsgrenen** under `releases/etapp2b/`. Release Asset-verktyg saknas och GitHub CLI:s Release-API kunde inte användas med tillgänglig behörighet; detta använder användarens uttryckligen godkända alternativ. Ingen Release eller tagg skapas och inget märks som produktionsrelease. ZIP återhämtas från GitHub och dess SHA/CRC kontrolleras före slutrapport.

Cloudflare-struktur inne i ZIP:

```text
index.html
_headers
lexl-restore-01115-2b/
  index.html
  manifest.webmanifest
  sw.js
  data-layer.js, storage-transition.js, backup-package.js
  restore-engine.js, restore-ui.js
  build-info.json
  icon.svg, icon-192.png, icon-512.png
  synthetic-original.json, synthetic-native.json, synthetic-older.json
  synthetic-native.zip
  fault-sha.json, fault-json.json, fault-fields.json, fault-schema.json
  fault-incomplete.zip
```

Senare eventuell manuell Direct Upload ska använda ZIP-innehållet som webbplatsrot på enbart `lexl-01115-restore-2b.pages.dev`. Ingen Cloudflare-resurs skapas eller ändras nu. Ingen Git-integration behövs eller ska kopplas till grenen. Testet avvecklas genom att det separata Pages-projektet tas bort; andra origins/data/cacher ska lämnas kvar. Godkända appkällor, `main`, 2A och tidigare ZIP-grenar förblir oförändrade.

Draft PR skapas mot `main` eftersom den godkända 1B-basen inte finns som separat fjärrgren. Den fulla PR-diffen innehåller därför även den oförändrade 1B-basen. Granska endast 2B via jämförelse från `2b9cbc12e217963635f761618fbb42255433d772` till nya leveranscommitten. PR ska förbli draft; ingen merge är godkänd.

Automatiserade slutresultat, källcommit, leveranscommit och checksumma anges i `releases/etapp2b/LEVERANSRAPPORT.md`. Manuell acceptans återstår alltid.

## Automatiserad utvecklingsregression

Hela sviten: **157 godkända, 0 misslyckade, 0 överhoppade** (128 oförändrade Etapp 1B-tester och 29 nya 2B-tester). Separat 2B-körning: 29/29. Playwright med system-Chromium, 412×915 viewport, isolerade nya profiler och enbart syntetiska data. Testkällorna täcker R1–R8, två fönster, avbruten staging/aktivering, skadat verkligt testbevis, otillgänglig IndexedDB, okända poster, fel origin, bevarande av andra installationers syntetiska nycklar/DB/cacher samt offlineomstart och ZIP-medlemmarnas SHA. Slutlig oförändrad byggd leverans provas dessutom med samma svit; resultatet dokumenteras i leveransrapporten.
