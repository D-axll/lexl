# LEXL 0.11.15 – slutrapport för etapp 1

Status: **integrationen av den godkända planen och regressionstesterna är färdiga för granskning** på `dev/0.11.15`. Inga verkliga användardata har migrerats. Ingen push, merge, produktionspublicering eller etapp 2 har utförts.

Godkänd produktionsbas: `0b49f20b165bab177fc1ab583509ffab744bf46f`. Utvecklingsbranchen skapades direkt från basen; `work` användes inte som utvecklingsbas. Implementationshistoriken och slutlig commit kan granskas med `git log`.

## Filer och ansvar

| Fil | Ansvar |
| --- | --- |
| `data-layer.js` | Versionsstyrd modell, validering, kompatibilitetsmetadata, snapshots och det interna transaktionslagret. |
| `storage-transition.js` | Verifierad säkerhetskopia, källbundet samtycke, transaktionell kopiering, aktiveringsmarkör, kontroll vid återstart och exportmanifest. |
| `storage-session.js` | Appens enda lagringsingång. Förhindrar att en ofullbordad/overifierad kopia läses eller skrivs som primär. |
| `backup-package.js` | Ett nedladdningsbart, begränsat ZIP-paket med JSON-filer och manifest; säker läsning, CRC32 och efterföljande SHA-256-verifiering. Inga externa produktionsbibliotek. |
| `index.html` | Startintegration, tydligt samtyckeskort, skrivskydd, återupptagning, felhantering, export och verifiering av nedladdad ZIP. |
| `sw.js` | Separat utvecklingscache som inkluderar samtliga nya moduler för offlineanvändning. |
| `tests/data-layer.test.cjs` | Modell- och kompatibilitetsregressioner med syntetiska data. |
| `tests/browser.test.cjs` | Verklig IndexedDB, faktiska formulärhändelser, samtidiga fönster, lagringsfel, avbrott, återstart och nedladdade paket i isolerad Chromium. |
| `prototypes/one-time-transition.js` | Bevarad utredningsprototyp. Laddas inte av appen och ingår inte i service worker-cachen. |
| `docs/ETAPP1-SPEC.md` | Ursprunglig komplett etappspecifikation. |
| `docs/MIGRERING-OCH-ATERGANG.md` | Den godkända övergångs- och återgångsplanen, nu dokumenterad som integrerad. |

## Appens beteende

| Situation | Resultat |
| --- | --- |
| Helt tom första uppstart | Standardprogram finns enbart i minnet. Ingen träningspost sparas automatiskt. Första uttryckliga sparåtgärden sparar just användarens ändringsförslag, verifierar det och skapar säker aktivering med ursprung `first-start`. |
| Befintliga 0.11.14-data | Visas skrivskyddat. Användaren skapar/kontrollerar säkerhetskopian, läser sammanfattningen och markerar ett tydligt godkännande innan knappen för övergång aktiveras. Ingen manuell JSON-filrundtur krävs. |
| Endast en äldre utkaståterställningspunkt | Räknas som befintliga data, inte en tom installation. Samtycke krävs; återställningspunkten bevaras och kan återupptas. Gränssnittet förklarar att huvudlagringen saknas och standardprogram används som grund. |
| Nekad övergång, ”Inte nu – fortsätt läsa” | Ingen primär aktiveras. Äldre uppgifter är fortsatt läsbara och skrivskyddade. Valet behålls i sessionen vid omladdning. Användaren kan återuppta förberedelsen senare. |
| Säkerhetskopiering misslyckas | Inget godkännandefält visas för en overifierad kopia och ingen primär skapas. Originalet bevaras. |
| Kopiering avbryts/abortar | Tillstånd, revision och transaktionens skrivningar rullas tillbaka. En tidigare verifierad säkerhetskopia och övergångsförslag kan finnas kvar för explicit återupptagning. |
| Kopia sparad men ingen aktiveringsmarkör | Kopian förblir inaktiv även efter en faktisk sidomladdning. Appen visar den äldre källan skrivskyddat och erbjuder fortsatt verifiering med förnyat användargodkännande. Ingen andra import eller dubblering av historik görs. |
| Första sparningen avbryts | Det avsedda första ändringsförslaget bevaras i övergångsförslaget om förberedelsen hann sparas. Appen erbjuder återupptagning; den återställer inte tyst bara standardprogrammen. Ett identiskt redan sparat förslag rensas ur minnesbufferten först efter verifiering. Osäker läsning efter att aktiveringen redan sparats ger tydlig varning om att första sparningen kan vara utförd, blockerar återförsök och återläser den sparade åtgärden vid omstart. |
| IndexedDB nekas, kvotfel, request-fel eller okänd version | Tydligt fel och skrivskydd; ingen reservskrivning till localStorage. Aktiva data ändras inte före verifierad framgång. Ett misslyckat ändringsförslag hålls separat för export/återförsök. |
| Efterkontroll misslyckas efter commit | Appen förklarar att ändringen kan vara sparad, behåller tidigare aktivt state och blockerar fortsatt sparning tills omladdning/granskning. Ingen osäker rollback skriver över senare ändringar. |
| Återstart med aktiv lagring | Aktiveringsmarkör, godkännande, originalbackup, ursprunglig kopia, schema/revision och senaste skrivkvittots SHA-256 verifieras innan IndexedDB-data publiceras. En giltigt formad men förändrad träningspost avvisas om kvittot inte matchar. |
| Annan flik har sparat en ny revision | Gammal bas nekas genom revisions-/rådatakontroll i samma transaktion som annars skulle ersätta state. Osparat förslag kan exporteras. BroadcastChannel är en extra varning, inte själva låset. |
| Gammal 0.11.14-flik ändrar sin källa | Ingen IndexedDB-data skrivs över. Skillnaden stoppar fortsatta nya skrivningar och kräver granskning. Exportpaketet kan bevara både ursprunglig och senare ändrad/raderad legacy-källa. |
| Skadad JSON, backup, aktiveringsmarkör, kvitto eller okänd försökskopia | Ingen tyst nystart eller automatisk återställning över befintliga data. Appen visar felet och erbjuder råexport för granskning. Vanlig export får inte felaktigt presentera ett tomt reservstate som återvunna data. |

## Exakt när IndexedDB blir primär

1. Exakt råtext från äldre huvudlagring och eventuell utkaståterställning identifieras och valideras. Saknad nyckel skiljs från skadade data.
2. En separat versionsmärkt backup sparas, transaktionen slutförs och backupen återläses. SHA-256 och hela innehållet verifieras **före** användarens godkännande. Den exakt verifierade originalkopian kan också laddas ned frivilligt före godkännandet; detta är inget krav för övergången.
3. Ett övergångs-ID och backupens kontrollsumma binder godkännandet till den granskade källbilden. Om källan förändrats accepteras inte det tidigare godkännandet.
4. Kopieringen använder IndexedDB-transaktion, basrevision, tidigare rådata och ett unikt SHA-256-kvitto. Därefter återläses och jämförs hela kopian. Historiska resultat räknas inte om.
5. En aktiveringsmarkör sparas i en separat transaktion som åter kontrollerar kopia, reservägare, samtycke, backup och oförändrad källa.
6. Markör och data återläses. Först efter lyckad verifiering publicerar `storage-session.js` IndexedDB som primär datakälla i appen. Varje senare uppstart har samma kontroll; förekomst av `current` räcker inte.

Alla normala sparvägar, import och återställning går genom denna lagringsingång. Den interna transaktionsadaptern kan därför inte användas som genväg av appens importgränssnitt. Träningsdatalagret har enbart läsadapter mot localStorage. Äldre tränings-/utkastnycklar skrivs eller raderas inte; ändrade utseendeinställningar använder separata 0.11.15-nycklar.

## Modell och bevarad historik

- `schemaVersion: 1` för tillstånd och nya vanliga JSON-exporter. Okända framtida versioner avvisas.
- `calculationVersion: legacy-unknown` för äldre pass och `0.11.14` för nya pass. Inga nya beräkningsregler har införts.
- Stabilt `programId`, separat `slotId` för placering och globalt `exerciseId`. Programkopior behåller övningsidentiteter men får nya program-/plats-ID:n. Alternativ har eget `alternativeId` och separat övningsidentitet; inget nytt alternativflöde införs.
- Nya pass får UUID vid start och behåller samma `sessionId` vid avslut. Äldre ID-lösa poster får deterministiska metadata-ID:n som materialiseras i den nya kopian och exporter, aldrig i localStorage-originalet.
- Äldre historikrader kopplas bara med uttrycklig programreferens och entydig placering. Ingen automatisk namnmatchning eller senare automatisk sammanföring av omappade poster görs.
- Nya `workoutDate` hålls separat från `recordedAt`. Äldre uttryckliga datum och rena datumvärden behålls. Om säkert träningsdatum saknas lämnas det okänt; gamla tidsstämplar skrivs inte om och byter inte tyst kalenderdag nära midnatt.
- Historiska snapshots bevaras. Nya pass har programbild vid start och utkastbild vid avslut. Senare programändring eller radering ändrar inte sparade historiska poster.
- Rader, set, vikter, repetitioner, tider, summeringar, kommentarer, cirkelkopplingar och okända säkra historiska fält bevaras utan migreringsberäkning. Äldre separata sidböjnings-/axelpressrader förblir separata.
- De tidigare destruktiva combo-/grupp-/uppvärmningsmigreringarna körs inte på befintliga pass eller utkast. Äldre utkaståterställning raderas inte, och ett redan avslutat återställt pass erbjuds inte igen efter omstart.
- Cirklar/superset som representeras med befintliga programlokala grupper bevaras. En separat ny supersetmodell eller redigerare införs inte.

## Export, import och återgångspaket

Vanlig JSON-export/import är fortsatt tillgänglig för säkerhetskopiering och uttrycklig återställning efter aktivering. Hela importen valideras före ersättning; föregående tillstånd och permanent första originalkopia bevaras transaktionellt. En framtida schemaversion, osäkra strukturer eller misslyckad skrivning ersätter inte befintliga data.

Inför återgång skapas **en ZIP-nedladdning** med fullständiga 0.11.15-data, exakt localStorage-original, eventuell äldre utkaståterställning, nya pass för granskning och `manifest.json`. Ändrade/raderade äldre pass särredovisas. Ändrad aktuell legacy-källa och eventuellt osparat arbete tas med separat. Saknad original-/återställningskälla representeras uttryckligt i manifestet, inte som påhittade gamla data.

ZIP-filerna är okomprimerade och UTF-8-kodade; filnamn, antal filer, storlekar, gränser, filhuvuden och CRC32 kontrolleras. Manifestet innehåller SHA-256 och UTF-8-storlek för varje fil. Paketet verifieras före nedladdning och användaren kan välja den faktiskt sparade ZIP-filen för ny kontroll. Ett intakt men äldre/avvikande paket märks som sådant vid jämförelse med appens aktuella rådata, inte bara revisionsnumret. Verifiering importerar eller konverterar ingenting.

Gränser: vanliga tillstånd/importer 20 MiB UTF-8, 32 JSON-nivåer och 500 000 värden. Pakettransporten begränsas till 128 MiB och högst 9 filer. Stora eller osäkra data ger fel; historik raderas aldrig automatiskt för att skapa plats.

Återgång: stoppa registreringar, stäng andra appfönster, spara ZIP utanför webbläsaren och verifiera den sparade filen. Behåll både IndexedDB och localStorage. 0.11.14 läser endast sin tidigare localStorage-källa; nya IndexedDB-pass följer inte automatiskt med. Om legacy-källan ändrats eller inte validerar krävs granskning före återgång. Ingen nedkonvertering, återimport till 0.11.14 eller automatisk versionspublicering ingår.

## Testresultat och reproduktion

**103 godkända tester, 0 misslyckade:** 24 modelltester och 79 Chromium-tester. Detta omfattar tidigare grund-/prototypregressioner och 20 nya integrerade acceptanstester.

```sh
node --test tests/*.test.cjs
```

Miljö: Node.js 24.22.1, Playwright 1.62.1 och systemets Chromium 156.0.8078.79. Python 3:s standardbibliotek `zipfile` används för oberoende kontroll av den faktiska ZIP-nedladdningen. Inga nya produktionsberoenden eller schemalagda tester har skapats.

Samtliga tester använder syntetiska data, isolerade lagringsobjekt eller nya headless browser-contexts med en tillfällig localhost-origin. Inga verkliga träningsdata eller riktiga LEXL-origin används.

Särskilt verifierat: första uppstart och första sparning; normal godkänd övergång utan filrundtur; nekad övergång och omladdning; backup före samtycke; abort efter lyckad `put`; kvotfel i flera skeden; faktisk sidomladdning före aktivering; återupptagning utan dubblering; saknad/skadad markör, backup eller kvitto; återställningspunkt utan huvudlagring; 20 konkurrerande transaktioner; tio omgångar med två riktiga appflikar; dubbla övergångsgodkännanden; historik, kommentarer, cirklar och kombinationsrader; datum nära midnatt; import/export och snapshots; offline-cache; mobil samtyckesvy; faktisk ZIP-nedladdning och återläsning; frivillig verifierad originalnedladdning före samtycke; skadat/ofullständigt/gammalt paket; osparat arbete och saknad senare legacy-källa.

## Begränsningar och stoppunkt

- Webbläsarverifieringen omfattar Chromium, inklusive mobil vy. Firefox/WebKit har inte körts; målwebbläsare behöver verifieras inför ett separat produktionsbeslut.
- Intern backup finns på samma enhet/origin. Ett verifierat externt ZIP-paket behövs för skydd om användaren raderar webbplatsdata eller enheten går förlorad.
- Vid ett skrivfel före all beständig lagring kan osparat arbete enbart finnas i minnet. Appen visar felet och erbjuder export; stängning av sidan kan inte garanterat bevara sådana uppgifter.
- En gammal 0.11.14-flik deltar inte i det nya protokollet. Källorna bevaras separat och skillnader stoppar nya skrivningar; ingen automatisk sammanslagning/reparation görs.
- Äldre omappade identiteter och fria textalternativ kräver uttryckliga beslut i senare etapper. Ingen ny förifyllning, statistik, papperskorg, belastningsmodell, nedvarvning eller programnavigation har införts.
- Etapp 1 stannar här för teknisk granskning. Merge till main, produktionspublicering och etapp 2 kräver separata godkännanden.
