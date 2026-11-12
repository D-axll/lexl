# LEXL 0.11.15 – etapp 1, teknisk granskningsrapport

Transaktionsgrunden är implementerad på `dev/0.11.15`. En användarstyrd engångsövergång utreds nu inom etapp 1 som isolerad prototyp; produktintegration återstår efter planbeslut.
Aktuellt beslut: principerna om orört localStorage-original och transaktionssäker IndexedDB är godkända. Ett permanent krav på manuell JSON-export/import för normal uppgradering är inte godkänt. Ny engångsplan finns i `MIGRERING-OCH-ATERGANG.md` och inväntar slutligt godkännande. Ingen faktisk övergång av verkliga data har utförts.
Ingen merge, push, produktionspublicering eller överföring av verkliga träningsdata har gjorts. Etapp 2 är inte påbörjad.

Bas: `0b49f20b165bab177fc1ab583509ffab744bf46f`, direkt förälder till implementationscommitten `29d70d407bcc3006f497f917559ed6f3d7fa6ff3`. Den gamla `work`-branchen har inte använts som utvecklingsbas.

## Ändrade filer

- `index.html`: gemensamma asynkrona sparvägar, skrivskyddad äldre läsning, fel/export/återförsök, kompatibilitetskopplingar, säker import och utvecklingsversionsmärkning. Äldre utkastmigreringar har kopplats bort.
- `data-layer.js`: schema, identiteter, validering, snapshots och transaktionellt IndexedDB-lager.
- `sw.js`: separat utvecklingscache inklusive datalagret för offlineanvändning.
- `tests/data-layer.test.cjs`: isolerade modell- och kompatibilitetstester.
- `tests/browser.test.cjs`: isolerade Chromium-tester med verklig IndexedDB, samtidiga flikar, injicerade fel och 17 nya prototyptester för engångsövergång/export.
- `prototypes/one-time-transition.js`: isolerat övergångsprotokoll, inte laddat av appen; produktionsdatabasnamnet avvisas.
- `docs/ETAPP1-SPEC.md`: användarens kompletta ursprungliga etappspecifikation.
- `docs/ETAPP1-STATUS.md`: denna rapport, kompletterad med IndexedDB-villkoren från granskningen.
- `docs/MIGRERING-OCH-ATERGANG.md`: ny användarstyrd engångs- och återgångsplan för slutlig granskning; normal uppgradering föreslås fungera utan manuell filrundtur.

## Dataskydd och lagring

`lexl-training-schema1`, databasversion 1, objektbutik `records`, är den nya lagringen. Träningsdatalagret använder endast `getItem` mot localStorage; det har inga localStorage-skrivvägar. Även äldre utkaståterställningsdata lämnas orörda. Äldre utseendeinställningar ärvs genom läsning, medan ändrade inställningar sparas under nya versionsspecifika nycklar.

Uppstart skriver inga träningsposter. Helt saknade data ger standardprogram i minnet; oläsbar JSON eller ogiltig struktur blockerar skrivning och erbjuder råexport. En skadad IndexedDB-primär ersätts aldrig tyst med äldre localStorage-data. Även en senare ändrad primär med okänt format eller en skadad originalåterställningskopia stoppar nästa transaktion. En tom databas får skapas vid uppstart utan att innehålla träningsposter.

När äldre localStorage-data finns men ingen IndexedDB-primär finns, visas de skrivskyddat. Vanliga sparförsök nekas. Användaren måste uttryckligen importera en säkerhetskopia och bekräfta lagringsbytet. Ingen automatisk migrering vid uppstart, första ändring eller återupptagning görs. Detta beskriver den tidigare, icke publicerade arbetskoden. Kravet ska ersättas av användarstyrd engångsövergång efter slutligt plangodkännande; den isolerade prototypen är ännu inte kopplad till appens startkod. Ingen verklig övergång har utförts.

Nästa tillstånd byggs som en separat kopia, valideras och jämförs med basrevisionen. Aktivt state är djupfryst. En `readwrite`-transaktion med begärd strikt hållbarhet jämför aktuell revision och tidigare rådata, bevarar första originalet, sparar föregående tillstånd och skriver nytt tillstånd, ny revision samt ett unikt SHA-256-kvitto. Exakta data och återställningskopior läses tillbaka i transaktionen. Fel aborterar hela transaktionen.

Appen väntar på `complete` och verifierar därefter kvitto och sparat tillstånd i en ny lästransaktion innan state publiceras eller status blir Sparat. Kvitton för de senaste 32 revisionerna behålls så att en efterkontroll inte felaktigt underkänner en korrekt skrivning bara för att en annan flik redan har sparat en senare revision.

Om efterkontrollen misslyckas efter en slutförd transaktion kan ändringen redan vara sparad. Appen meddelar detta, behåller sitt tidigare aktiva state, erbjuder export av förslaget och blockerar nya skrivningar fram till omladdning. Ingen efterföljande automatisk rollback får skriva över en annan fliks senare ändring.

En konkurrerande skrivare nekas i samma transaktion som annars skulle ersätta state. BroadcastChannel ger en extra synlig varning, men är inte själva samtidighetsskyddet. En ändring från en äldre app upptäcks genom jämförelse med den bevarade localStorage-källan; båda datakällorna bevaras och ingen automatisk sammanslagning görs.

## Modell och historik

| Fält | Hantering |
| --- | --- |
| `schemaVersion` | 1 för nya tillstånd/exporter. Framtida okända rotversioner avvisas. |
| `calculationVersion` | `legacy-unknown` för äldre pass; `0.11.14` för nya pass. Inga nya beräkningsregler införs. |
| `programId` | Befintligt stabilt program-ID; `id` behålls som kompatibilitetsalias. |
| `slotId` | Identitet för placeringen inom ett program. Programkopior får nya plats-ID:n. |
| `exerciseId` | Global övningsidentitet. Uttryckligen gemensamma ID:n kan användas i flera program. Programkopior behåller dessa ID:n. |
| Äldre övningar | Deterministisk, provisorisk identitet från program-ID och äldre plats-ID; inget anspråk på automatisk global sammanföring. |
| `alternatives[]` | Eget `alternativeId` och separat `exerciseId`. Identiteter och kopiering är förberedda; inget nytt användarflöde införs. |
| `sessionId` | Nya pass får UUID vid start, som behålls vid avslut. Äldre pass får deterministiskt postindex/fingeravtryck och skilda ID:n även för identiska poster. |
| `workoutDate` | Uttryckligt kalenderdatum för nya pass. Äldre uttryckliga datum och datumvärden utan tid behålls. Saknas ett säkert datum förblir det `null`/`unknown`; en tidsstämpels datumdel gissas inte vara träningsdatum. |
| `recordedAt` | Separat registreringstid för nya pass. Äldre okänd registreringstid förblir `null`. |
| `snapshot` | Äldre poster bevaras före metadata-komplettering; nya pass bevarar utkastet vid avslut. |
| `programSnapshot` | Programbild vid start. Den påverkas inte av senare programredigering eller radering. |
| `storageRevision` | Kontrolleras i IndexedDB-transaktionen och ökas vid varje lyckad skrivning, även återställning. |

Äldre pass utan uttryckligt program-ID lämnas omappade. Koppling görs endast med uttryckligt program-ID/äldre programreferens och entydigt plats-ID; ingen automatisk namnmatchning används. Redan omappade rader kopplas inte senare för att ett program tillkommer. Detta kan innebära att historik som tidigare namnmatchades inte används som förifyllningsreferens; ingen ny ranking- eller förifyllningsalgoritm har införts.

Träningsrader, set, vikter, repetitioner, tider, kommentarer, cirkelkopplingar och okända säkra historiska fält bevaras. Äldre `date` skrivs inte om. Visning av historiska tidsstämplar behåller tidigare lokal datumtolkning om uttryckligt träningsdatum saknas, även nära midnatt.

`migrateCombo`, `migrateAntiRotation`, `migrateGroups` och den tidigare uppvärmningsmigreringen skriver inte om befintliga pass/utkast. Separata äldre sidböjnings- och axelpressrader förblir separata, med båda resultat- och kommentarsuppsättningarna kvar. Tider och summeringar räknas inte om vid import/migrering. Upprepade metadata-kompletteringar är idempotenta.

Cirklar/superset som uttrycks via befintliga programlokala grupper bevaras. Gruppnamn återanvänds inte som global identitet. Någon separat superset-redigerare eller ny supersetmodell finns inte i basversionen och införs inte nu. Fria textalternativ i äldre anteckningar kopplas inte automatiskt till övnings-ID:n.

## Export, import och återställning

Nya exporter innehåller schema- och beräkningsversion. Äldre exporter stöds genom kompatibilitetslagret. Import validerar hela JSON-strukturen och kända fälttyper före ersättning. Osäkra objektnycklar, ogiltiga/dubbla identiteter och okända framtida versioner avvisas. Gränser: 20 MiB UTF-8, 32 nivåers djup och 500 000 JSON-värden. Överdimensionerade nya exporter/sparförslag stoppas innan en fil eller ett tillstånd som inte kan återimporteras produceras.

Första originalkopian och föregående tillstånd finns i samma IndexedDB som state, men i separata poster. De sparas atomiskt med ersättningen, kan exporteras som rå JSON och återimporteras som en ny revision. Den första originalkopian skrivs aldrig över. Vid första uppstart utan tidigare data är originalet uttryckligen tomt (`null`).

Tidigare utkaståterställningsnyckel läses och valideras för kompatibilitet, men raderas inte när ett pass avslutas. Ett redan avslutat återställt pass erbjuds inte igen efter omladdning. En misslyckad import ändrar inte aktivt state och en aborterad transaktion ändrar inga beständiga poster. Ett misslyckat ändringsförslag hålls separat och kan exporteras eller återförsökas; nya vanliga ändringar får inte tyst ersätta det.

## Regressionstester

Manuellt körda kommandon:

```sh
node --test tests/data-layer.test.cjs
node --test tests/browser.test.cjs
```

Senaste slutkontroll: **83 godkända, 0 misslyckade** (24 modelltester och 59 Chromium-tester, varav 17 nya prototyptester). Inga schemalagda tester har skapats. Samtliga använder syntetiska data och isolerade lagringsobjekt eller nya webbläsar-contexts med en tillfällig localhost-origin. Testerna skriver aldrig till en verklig LEXL-origin eller verklig träningshistorik.

| Specifikationens testområde | Verifierat |
| --- | --- |
| Giltig, första, skadad och strukturellt ogiltig uppstart | Läsning utan automatisk träningsskrivning; fel blockerar sparning; råexport fungerar. |
| Uppgradering och äldre exporter | Manuell import aktiverar IndexedDB; omstart väljer primären; gamla nycklar är oförändrade. |
| Felaktig/ofullständig/framtida import | Avvisas utan dataersättning; även osäkra objekt och stora UTF-8-filer prövas. |
| Idempotens, äldre kombinationsövningar och kommentarer | Alla ursprungliga värden och rader bevaras genom import, uppstart och passavslut. |
| Programkopior, grupper, globala/alternativa identiteter och lika namn | Nya platser, bevarade övningsidentiteter och inga namnkopplingar. |
| Historiska snapshots efter programändring/radering | Oförändrade historiska resultat, anteckningar och ögonblicksbilder. |
| Träningsdatum och sortering | Uttryckligt datum styr ny historik; äldre tidsstämplar skiftar inte tyst kalenderdag. |
| Export/import/återställning | Filer laddas ned, läses tillbaka och återställs med ny revision; permanent original bevaras. |
| Kvotfel, request-fel, transaktionsabort och verifieringsfel | Fel injiceras före/efter lyckad `put`, på olika poster och efter commit. Ingen tyst framgång eller osäker rollback. |
| Otillgänglig IndexedDB och framtida databasversion | Skrivning nekas utan localStorage-fallback eller radering. |
| Samtidiga fönster | 20 konkurrerande transaktioner accepterar exakt en skrivare på samma bas. Tio omgångar med två verkliga appflikar ger exakt en godkänd ändring per omgång. |
| Formulär, offline och äldre inställningar | Faktiska formulärhändelser sparas korrekt; service worker/offline fungerar; gamla tränings- och inställningsnycklar bevaras. |

Det tidigare underkända localStorage/Web Locks-skyddet är borttaget och ersatt med IndexedDB-transaktioner. Det nya samtidighetsskyddet använder inte Web Locks.

Webbläsartester kräver Node.js, Playwright och Chromium (`CHROMIUM_PATH`, standard `/usr/bin/chromium`). Modelltesterna kräver endast Node.js. Testmiljö: Node.js 24.22.1, Playwright 1.62.1 och Chromium 156.0.8078.79 på Linux. Ingen ny produktionsdependency behövs.

## Begränsningar, återgång och beslut

- 0.11.14 kan läsa sitt bevarade localStorage-original men inte direkt läsa nya IndexedDB-poster. Nya pass får inte förväntas följa med tillbaka automatiskt. Följ den separata planen; radera inte någon datakälla.
- Automatisk migrering, nedgradering, konvertering och synkning av gamla/nya datakällor ingår inte. Ett permanent manuellt export/importkrav är inte godkänt. Den nya användarstyrda engångsplanen inväntar slutlig granskning; ingen verklig dataövergång har utförts.
- Skadad källa eller skillnader mellan gamla och nya datakällor kräver export/granskning före reparation. Ingen destruktiv självreparation finns.
- Enhetsverifieringen omfattar Chromium. Andra webbläsare måste verifieras före produktionsbeslut; otillräckligt databas-/kryptostöd ska blockera sparning.
- Snapshots och återställningskopior tar plats. Kvotfel får aldrig lösas genom automatisk radering av äldre historik.
- Äldre omappade identiteter och fria textalternativ kräver uttryckliga mappningsbeslut inför senare etapper.
- Etapp 2, merge till main och produktion kräver separata godkännanden.

Den nya prototypen visar också att en kopia som hunnit sparas men saknar verifierad aktiveringsmarkör inte får bli primär vid omstart. Denna kontroll måste integreras i alla riktiga startvägar innan prototypen kan ersätta den tidigare arbetskodens importkrav. Se den separata planens avsnitt om kvarstående integration och exportpaketering.
