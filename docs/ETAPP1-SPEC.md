# LEXL 0.11.15 – Godkännande av dataskydd och komplett specifikation för etapp 1

Vi har granskat din rapport och godkänner att du fortsätter **endast etapp 1 – Baslinje och dataintegritet**.

Vi godkänner uttryckligen dina föreslagna skydd mot de tre identifierade riskerna för dataförlust.

Detta är inte ett godkännande av etapp 2 eller senare utveckling.

## 1. Godkännande av dataskydd

### A. Oläsbara data vid uppstart

Om befintlig lagrad JSON inte kan läsas eller valideras:

- Skriv inte över den ursprungliga lagringsnyckeln.
- Skapa inte automatiskt ett nytt beständigt standardtillstånd ovanpå befintliga data.
- Bevara de ursprungliga rådata oförändrade.
- Visa ett tydligt fel och erbjud möjlighet att exportera originaldata för felsökning.
- Låt inte andra sparfunktioner oavsiktligt skriva över de oläsbara uppgifterna.
- Skilj mellan helt saknade data vid första uppstart och befintliga men skadade data.

### B. Säker import

- Validera hela importfilen innan befintligt tillstånd ändras.
- Bevara en återställningsbar kopia av tidigare data.
- Radera aldrig återställningskopian innan ersättningen har sparats och verifierats.
- Publicera inte det nya tillståndet i appens minne förrän lagringen lyckats.
- Vid skrivfel ska tidigare data förbli tillgängliga.
- Bevara okända historiska fält när det är möjligt utan att acceptera osäkra strukturer.
- Testa både lyckad import och simulerade lagringsfel.

### C. Säker hantering av `migrateCombo`

Vi godkänner inte att äldre träningsresultat eller pågående utkast försvinner genom automatisk migrering.

- Bevara ursprungliga övningsrader, set, vikter, repetitioner och kommentarer.
- Gör ingen destruktiv migrering av befintliga pass eller utkast.
- Undersök hur äldre kombinationsövningar kan läsas kompatibelt utan att originaluppgifterna skrivs om.
- Om befintligt användargränssnitt kräver en annan representation ska den härledas utan att originalet förstörs.
- Migreringen ska vara idempotent.
- Om säker hantering inte kan garanteras ska du pausa just den delen och redovisa alternativen innan implementation.

## 2. Projekt och utvecklingsmiljö

- Repository: `D-axll/lexl`
- Godkänd bascommit: `0b49f20b165bab177fc1ab583509ffab744bf46f`
- Utvecklingsbranch: `dev/0.11.15`
- Produktionsbranch: `main`
- Godkänd produktionsversion: `0.11.14`

Fortsätt på den skapade utvecklingsbranchen.

Ingen merge till `main`, ingen produktionspublicering och inga tester mot verklig träningshistorik.

## 3. Komplett teknisk specifikation för etapp 1

### 3.1 Datamodell och identiteter

Inför eller förbered:

- Stabilt `sessionId` för sparade träningspass.
- Stabilt program-ID.
- Globalt `exerciseId` för den faktiska övningen.
- Separat `slotId` för övningens placering i ett program.
- Separata övningsidentiteter för alternativ.
- Uttryckligt `workoutDate`, separat från registreringstid.
- Versionsstyrd datamodell och beräkningsmodell.
- Historiska ögonblicksbilder som inte påverkas av senare programändringar.

Samma faktiska övning ska kunna användas i flera program med samma globala identitet men olika programplats-ID:n.

Programkopior ska behålla övningsidentiteten men få nya plats-ID:n.

Cirklar och superset ska fortsätta fungera utan sammanblandning.

### 3.2 Äldre träningshistorik

- Äldre pass från 0.11.14 och tidigare ska kunna läsas.
- Äldre tider, vikter, repetitioner, volymer och kommentarer får inte räknas om.
- Historiska ögonblicksbilder ska bevaras.
- Saknade nya fält ska hanteras av ett kompatibilitetslager.
- Äldre övningsidentiteter får bara kopplas automatiskt när identiteten är entydig.
- Ingen automatisk namnmatchning.
- Osäkra kopplingar ska lämnas omappade.
- Migrationer ska vara idempotenta.
- Redovisa hur äldre pass utan pass-ID eller uttryckligt träningsdatum hanteras.

### 3.3 Säker lokal lagring

Inför en gemensam strategi för säkra state-ändringar:

- Beräkna och validera nästa tillstånd separat.
- Bevara originaldata vid misslyckad skrivning.
- Ändra inte appens aktiva state innan skrivningen lyckats.
- Skydda mot tyst överskrivning från flera öppna appfönster.
- Säkerställ att eventuella återställningskopior faktiskt går att använda.
- Rapportera lagringsfel utan att felaktigt påstå att ändringen lyckats.

### 3.4 Export och import

- Inför schemaversion för nya exporter.
- Stöd äldre exporter.
- Validera import före ersättning.
- Avvisa okända framtida schemaversioner om de inte kan hanteras säkert.
- Bevara historiska data utan omräkning.
- Säkerställ att en misslyckad import inte förstör tidigare data.
- Använd syntetiska data i samtliga tester.

## 4. Tester för etapp 1

Genomför isolerade tester av:

1. Normal uppstart med giltiga data.
2. Första uppstart utan tidigare data.
3. Uppstart med skadad JSON.
4. Uppstart med strukturellt ogiltiga data.
5. Säker återställning efter lagringsfel.
6. Import av äldre säkerhetskopior.
7. Import av felaktiga eller ofullständiga filer.
8. Upprepad migrering av samma data.
9. Äldre kombinationsövningar och `migrateCombo`.
10. Programkopior, cirklar och superset.
11. Samma övning i flera program.
12. Olika övningar med samma namn.
13. Alternativa övningars identiteter.
14. Historiska passanteckningar.
15. Ändrade eller raderade program efter sparade pass.
16. Träningsdatum och historisk sortering.
17. Export följt av import.
18. Simulerade skrivfel och lagringskvotproblem.
19. Flera öppna appfönster och samtidiga ändringar.

Tester ska använda isolerad lagring och syntetiska data.

Inga schemalagda automatiska tester ska skapas.

## 5. Funktioner som inte ska implementeras ännu

Följande tillhör senare etapper:

- Större varningsdialoger.
- Papperskorg.
- Ny förifyllningslogik.
- Tidigare passanteckningar i träningsvyn.
- Nedvarvning och ändrad tidsberäkning.
- Belastningstyper och repetitioner per sida.
- Nya alternativa övningsflöden.
- Ändrad programnavigation.
- Layoutförbättringar.
- Statistik, personliga rekord och träningskalender.

Förbered datamodellen, men inför inte dessa användarfunktioner nu.

## 6. Rapport efter etapp 1

När etappen är färdig vill vi ha:

1. Branch, commit-ID och ändrade filer.
2. Sammanfattning av implementerade dataskydd.
3. Beskrivning av den nya datamodellen.
4. Hur äldre träningshistorik bevaras.
5. Testresultat med godkända och misslyckade tester.
6. Eventuella kvarstående risker.
7. Hur vi återgår till 0.11.14.
8. Eventuella beslut inför etapp 2.

**Stanna efter etapp 1 och invänta vår granskning.**

Om ytterligare risk för dataförlust eller behov av destruktiv migrering upptäcks ska du pausa den berörda delen och fråga innan du fortsätter.

Vi prioriterar dataintegritet framför snabb implementation.