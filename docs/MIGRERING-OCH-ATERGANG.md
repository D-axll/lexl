# Etapp 1 – användarstyrd engångsövergång och säker återgång

**Etapp 1B:** Se [rättningsrapporten](ETAPP1B-RATTNINGAR.md) för starkare rullande backupkontroller, stabila uppdateringsmål, bevarad inmatning och aktuell testning. Övergångs- och återgångsprinciperna nedan gäller fortsatt. Osparade formulärvärden kan dessutom bevaras som uttryckligt granskningsunderlag i `unsaved-work.json`; de appliceras inte automatiskt på träningsdata.

Status: **planen är slutligt godkänd av beställaren och integrerad inom etapp 1**. Implementation och regressionstester är färdiga för teknisk granskning. Ingen övergång av verkliga användardata, merge, push eller publicering har utförts.

Principerna att bevara localStorage-originalet och använda transaktionssäker IndexedDB är godkända. Normal uppgradering kräver ingen manuell JSON-export/import. Denna plan ersätter därför den tidigare manuella planen som föreslagen normal uppgraderingsväg. Ingen merge, push, publicering eller etapp 2 ingår.

## Integrerad normal uppgradering

1. **Identifiera och validera.** Läs exakt råtext från `min-traning-v1` samt eventuell äldre utkaståterställningsnyckel. Skilj saknade data från oläsbara eller strukturellt ogiltiga data. Visa antal program, historiska pass och om ett pågående pass/återställningspunkt finns. Vid ogiltiga data: skrivskydd, tydligt fel och möjlighet till råexport; ingen standarddata får ersätta originalet.
2. **Skapa säkerhetskopia före samtycke.** Spara en separat versionsmärkt kopia av båda råtexterna och SHA-256-kontrollsumma. Bekräfta transaktionens slutförande, läs tillbaka kopian, kontrollera kontrollsumman och validera innehållet. Originalens formatering och okända säkra fält bevaras. En intern kopia är inte en extern katastrofbackup. Gränssnittet erbjuder därför frivillig nedladdning av den exakt verifierade originalkopian före samtycket; någon manuell filrundtur krävs inte för normal uppgradering.
3. **Begär uttryckligt användargodkännande.** Visa vad som kopieras, att originalet behålls och att framtida pass inte automatiskt blir läsbara i 0.11.14. Gränssnittet visar en godkännanderuta och knapparna ”Fortsätt med säker övergång” respektive ”Inte nu – fortsätt läsa”. Ett klick ska avse just den verifierade källbilden, inte ett allmänt framtida migrationsmedgivande. Det här individuella samtycket är separat från beställarens godkännande av planen.
4. **Reservera övergången och kopiera.** Kontrollera åter källbilden och att inget annat appfönster har reserverat/aktiverat målet. Bevara samtycke och övergångs-ID. Kopiera till IndexedDB med befintligt transaktionslager, revision 1 och skrivkvitto. Äldre värden, rader, kommentarer, tider och cirkelkopplingar räknas inte om eller raderas. localStorage skrivs aldrig av övergången.
5. **Verifiera före aktivering.** Vänta på `complete`, läs tillbaka kopian och jämför hela innehållet och SHA-256 mot förslaget. Validera schema, identiteter och revisionsnummer. Kontrollera att källan inte ändrats. En kopia som endast finns på disk är fortfarande **inaktiv**.
6. **Aktivera först efter verifieringen.** Spara en aktiveringsmarkör i en transaktion som åter kontrollerar kopia, reservägare, samtycke och säkerhetskopia. Läs tillbaka markör och data. Först efter lyckad kontroll får appen välja IndexedDB som primär lagring. Varje senare uppstart måste också verifiera markör och tillstånd innan dessa används. Om slutlig läsning misslyckas får appen inte hävda att övergången lyckats; nästa start måste kontrollera på nytt.
7. **Fortsätt transaktionssäkert.** Nya pass och ändringar använder IndexedDB med jämförelse av basrevision, återställningspunkt och verifierat skrivkvitto. Inget dubbelkommando eller andra appfönster får tyst ersätta en nyare revision.
8. **Informera om återgång.** 0.11.14 läser fortfarande det bevarade localStorage-originalet. Nya IndexedDB-pass syns inte automatiskt där. Erbjud därför säker export före återgång enligt nedan.

Vid ”Inte nu” förblir äldre data läsbara och skrivskyddade i den nya versionen. Ingen kopiering till primärt tillstånd görs. Originalet och en redan skapad säkerhetskopia bevaras. För en helt tom installation behövs ingen överföring av äldre data; första uttryckliga sparåtgärden hanteras som första uppstart. Den integrerade lösningen ska markera detta ursprung separat så att frånvaro av äldre data inte blandas ihop med en ofullbordad uppgradering.

## Fel och avbrott

- Fel under validering/säkerhetskopiering: ingen primär skapas och inget samtycke tas för en overifierad kopia.
- Avböjt eller felaktigt samtycke: ingen aktivering. Samtycke bundet till en annan kontrollsumma accepteras inte.
- Kvotfel eller abort under kopiering: transaktionens ändringar rullas tillbaka. Originalet och den tidigare verifierade säkerhetskopian finns kvar.
- Kopiering klar men avbrott före aktivering: kopian finns kvar som inaktiv. Vid omstart väljs inte den kopian. Användaren kan uttryckligen återuppta verifieringen av samma övergång; den ska inte importeras igen eller få nya pass-ID:n/revisioner.
- Aktiveringsmarkör sparad men slutlig läskontroll misslyckas: appen ska visa osäkert utfall och blockera fortsatt registrering. Vid nästa start måste markör, samtycke, originalkopia och aktuella data verifieras innan någon primär används. Ingen osäker automatisk rollback görs.
- Två appfönster med olika godkännanden: en transaktion reserverar målet; det andra godkännandet nekas. Ingen annan kopia skrivs över.
- Källan ändrad efter säkerhetskopiering: övergången stoppas. Inga gamla och nya data slås ihop automatiskt. Ett ofullbordat förslag och dess säkerhetskopia får inte raderas som automatisk ”städning”.
- En äldre 0.11.14-flik följer inte det nya låsprotokollet. Stäng därför andra LEXL-fönster under övergången. Separata lagringskällor skyddar mot överskrivning, och kontroll av källan upptäcker avvikelser; detta är inte ett atomiskt lås över en gammal app och IndexedDB.

## Säker export av nya pass före återgång

Stoppa nya registreringar och stäng andra LEXL-fönster före den slutliga exporten. Läs tillstånd, revision, aktiveringsmarkör och övergångskopia i en sammanhängande IndexedDB-läsbild. Exporten ska ange exakt vilken revision den avser.

Föreslaget återgångspaket innehåller:

| Fil | Syfte |
| --- | --- |
| `indexeddb-01115.json` | Fullständig versionsstyrd kopia av nya tillståndet, inklusive historik, pågående pass, program och snapshots. Detta är den auktoritativa kopian för senare återställning i 0.11.15. |
| `new-sessions-review.json` | Separat granskningsfil över pass-ID:n som tillkommit efter övergången och deras fullständiga historiska poster. Ingen konvertering till gammalt format. |
| `localstorage-original-01114.json` | Exakt original från övergången. Den befintliga localStorage-nyckeln lämnas fortsatt orörd. |
| `draft-recovery-original.json` | Äldre utkaståterställningspunkt om sådan fanns. Den ersätter inte automatiskt ett pågående pass. |
| Manifest | Formatversion, revisionsnummer, övergångs-ID, filnamn, UTF-8-storlekar och SHA-256 för varje fil. Anger också ändrade och raderade äldre pass, så att de inte felaktigt räknas som nya. |

Om en gammal app därefter ändrat localStorage inkluderas även den aktuella råkällan separat, tydligt skild från originalbilden. Automatisk sammanslagning görs inte. Om legacy-källan ändras under exporten ska exportförsöket göras om.

Filerna samlas nu till **en ZIP-nedladdning** med manifest. ZIP-transporten kontrollerar gränser, filnamn och CRC32; därefter verifieras SHA-256, schema och innehåll. Användaren väljer den faktiskt sparade ZIP-filen i appens kontrollfunktion för återverifiering. Python-standardbiblioteket verifierar också den faktiska nedladdningen i regressionstesterna. Ett intakt paket som avviker från appens aktuella data varnas som inaktuellt. Osparat arbete och en senare ändrad eller saknad äldre källa särredovisas. Ingen verifiering importerar eller skriver träningsdata.

Varningen före återgång ska uttryckligen säga:

> 0.11.14 visar endast sina tidigare localStorage-data. Nya pass finns i IndexedDB och din 0.11.15-säkerhetskopia. De förs inte tillbaka automatiskt. Importera inte 0.11.15-filerna i 0.11.14 och radera inte någon lagringskälla.

Om den aktuella legacy-källan har ändrats sedan övergången eller inte validerar ska själva återgången pausas för granskning av båda källorna. Planen skriver inte automatiskt tillbaka originalkopian över senare legacy-ändringar. En verifierad export är inte ett godkännande att förlora eller ignorera sådana ändringar.

Efter verifierad extern export och klarlagd legacy-källa kan appkoden återgå till godkänd 0.11.14 genom separat godkänd versionshantering. Rätt service worker/version måste användas. Inga träningsposter, databaser eller webbplatsdata ska raderas. Nya IndexedDB-pass behålls både lokalt och externt. Att senare föra in dessa i 0.11.14 kräver en separat, verifierad konverteringsplan; det görs inte i etapp 1.

## Integration och evidens

`prototypes/one-time-transition.js` laddas inte av `index.html` och ingår inte i service worker-cachen. Den kräver en uttrycklig läsadapter och tillåter endast databaser med prefixet `lexl-prototype-`. Produktionsdatabasens namn avvisas. Alla körningar använder syntetiska data i nya headless Chromium-contexts på en tillfällig localhost-origin.

Prototypen demonstrerar förberedelse, verifierad råbackup före samtycke, källbunden bekräftelse, transaktionssäker kopiering, separat aktivering, återupptagning, nya skrivningar och export/verifiering av filuppsättningen. Den kan inte i sig aktivera den riktiga appens lagring.

Den bevarade prototypen är fortfarande separat. Den integrerade lösningen använder `storage-transition.js`, `storage-session.js` och `backup-package.js`, vilka laddas av appen och ingår i offline-cachen. Appens start, ordinarie sparvägar och import går genom aktiveringskontrollen. Enbart förekomst av en `current`-post kan inte aktivera en kopia. Senaste skrivkvittots SHA-256 kontrolleras även efter senare sparningar vid återstart.

Slutlig körning: **103 tester godkända, 0 misslyckade**, inklusive 20 integrerade acceptanstester utöver tidigare 83 grund- och prototyptester. Fullständig matris och beteende vid första uppstart, nekande, avbrott, lagringsfel och återstart finns i `ETAPP1-STATUS.md`. Alla tester använder isolerade syntetiska data.

## Leverans och separat produktionsbeslut

Planens integration inom etapp 1 är genomförd. Ingen ytterligare planbekräftelse behövs för det redan godkända arbetet. Beställaren granskar nu slutrapport och kod. Målwebbläsare utöver den verifierade Chromium-miljön behöver kontrolleras inför produktion. Intern backup och externa ZIP-filer ska behållas enligt ovan; ingen datakälla raderas som del av aktivering eller återgång.

Ingen merge, produktionspublicering, automatisk nedkonvertering, återimport till 0.11.14 eller etapp 2 har utförts eller är godkänd genom denna leverans.
