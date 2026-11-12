# Etapp 1 – förslag till användarstyrd engångsövergång och säker återgång

Status: **för slutlig granskning och godkännande; ingen aktivering för verkliga användare**.

Principerna att bevara localStorage-originalet och använda transaktionssäker IndexedDB är godkända. Ett permanent krav på manuell JSON-export/import för normal uppgradering är inte godkänt. Denna plan ersätter därför den tidigare manuella planen som föreslagen normal uppgraderingsväg. Ingen merge, push, publicering eller etapp 2 ingår.

## Föreslagen normal uppgradering

1. **Identifiera och validera.** Läs exakt råtext från `min-traning-v1` samt eventuell äldre utkaståterställningsnyckel. Skilj saknade data från oläsbara eller strukturellt ogiltiga data. Visa antal program, historiska pass och om ett pågående pass/återställningspunkt finns. Vid ogiltiga data: skrivskydd, tydligt fel och möjlighet till råexport; ingen standarddata får ersätta originalet.
2. **Skapa säkerhetskopia före samtycke.** Spara en separat versionsmärkt kopia av båda råtexterna och SHA-256-kontrollsumma. Bekräfta transaktionens slutförande, läs tillbaka kopian, kontrollera kontrollsumman och validera innehållet. Originalens formatering och okända säkra fält bevaras. En intern kopia är inte en extern katastrofbackup; extern export ska erbjudas, men någon manuell filrundtur ska inte krävas för normal uppgradering.
3. **Begär uttryckligt användargodkännande.** Visa vad som kopieras, att originalet behålls och att framtida pass inte automatiskt blir läsbara i 0.11.14. Knapparna kan vara ”Fortsätt med säker övergång” och ”Inte nu”. Ett klick ska avse just den verifierade källbilden, inte ett allmänt framtida migrationsmedgivande. Det här individuella samtycket är separat från beställarens godkännande av planen.
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

För användaren bör filerna samlas till en nedladdning med manifest, så att flera automatiska nedladdningar inte kan blockeras delvis av webbläsaren. Prototypen verifierar filuppsättningen och manifestet; slutlig paketering och användarflöde är ännu inte implementerade. Filernas kontrollsummor och struktur ska kunna kontrolleras igen efter att de sparats, genom att användaren väljer den sparade kopian. En lyckad generering/nedladdning ensam bevisar inte att alla filer finns kvar utanför webbläsaren.

Varningen före återgång ska uttryckligen säga:

> 0.11.14 visar endast sina tidigare localStorage-data. Nya pass finns i IndexedDB och din 0.11.15-säkerhetskopia. De förs inte tillbaka automatiskt. Importera inte 0.11.15-filerna i 0.11.14 och radera inte någon lagringskälla.

Om den aktuella legacy-källan har ändrats sedan övergången eller inte validerar ska själva återgången pausas för granskning av båda källorna. Planen skriver inte automatiskt tillbaka originalkopian över senare legacy-ändringar. En verifierad export är inte ett godkännande att förlora eller ignorera sådana ändringar.

Efter verifierad extern export och klarlagd legacy-källa kan appkoden återgå till godkänd 0.11.14 genom separat godkänd versionshantering. Rätt service worker/version måste användas. Inga träningsposter, databaser eller webbplatsdata ska raderas. Nya IndexedDB-pass behålls både lokalt och externt. Att senare föra in dessa i 0.11.14 kräver en separat, verifierad konverteringsplan; det görs inte i etapp 1.

## Isolerad prototyp och evidens

`prototypes/one-time-transition.js` laddas inte av `index.html` och ingår inte i service worker-cachen. Den kräver en uttrycklig läsadapter och tillåter endast databaser med prefixet `lexl-prototype-`. Produktionsdatabasens namn avvisas. Alla körningar använder syntetiska data i nya headless Chromium-contexts på en tillfällig localhost-origin.

Prototypen demonstrerar förberedelse, verifierad råbackup före samtycke, källbunden bekräftelse, transaktionssäker kopiering, separat aktivering, återupptagning, nya skrivningar och export/verifiering av filuppsättningen. Den kan inte i sig aktivera den riktiga appens lagring.

Slutlig körning: **83 tester godkända, 0 misslyckade**. Det omfattar tidigare 66 tester samt 17 nya tester för:

- frånvaro i normal app och avvisning av produktionsdatabasnamn;
- råbackup av både träningsdata och återställningspunkt före samtycke;
- lyckad engångsövergång utan manuell filrundtur;
- ändrad primärkälla respektive återställningskälla efter förberedelsen;
- kvotfel vid säkerhetskopia, abort efter lyckad `put`, avbrott före aktivering och explicit återupptagning;
- skadad säkerhetskopia, ogiltig källa och ändrad inaktiv kopia;
- två samtidiga godkännanden mot samma mål samt skadat samtyckesunderlag vid omstart efter senare sparningar;
- nya pass, ändrade/raderade äldre pass, kontrollsummor och saknade/förändrade filer;
- faktisk filnedladdning, läsning från testdisk och återverifiering;
- bevarande av både den ursprungliga och den senare ändrade legacy-källan.

## Arbete som återstår före verklig aktivering

1. Beställaren granskar och godkänner den slutliga planen, inklusive vad återgång faktiskt kan visa.
2. Integrera användarsamtycke och uppstartens källval inom etapp 1. **Alla läs- och skrivvägar måste gå genom aktiveringskontrollen.** Den befintliga appens `createStore` väljer annars en `current`-post direkt. Det är därför inte säkert att bara koppla in prototypen eller byta databasnamn; en inaktiv kopia får aldrig kringgå fasgränsen.
3. Hantera gamla försöksdata, avböjande, ofullbordad reservation och återupptagning i den riktiga startkoden utan att skriva över någon källa. En redan aktiv ny installation ska inte uppgraderas igen.
4. Implementera och testa slutlig exportpaketering och kontroll av sparade filer. Behåll skydd vid stora dataset/lagringskvot; ingen automatisk radering för att skapa plats.
5. Testa den integrerade versionen, inklusive avbruten sida/omstart, flera riktiga appfönster, offline och fler målwebbläsare. Den nuvarande prototypen verifierar protokollet i Chromium, inte ett färdigt produktionsflöde eller alla hårdvarufel.
6. Lämna etapp 1 för slutlig teknisk granskning. Ingen merge eller produktionspublicering utan separat godkännande; ingen etapp 2.
