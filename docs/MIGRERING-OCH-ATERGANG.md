# Etapp 1 – separat plan för dataövergång och återgång

Status: för uttryckligt godkännande innan befintliga användare aktiverar den nya lagringen. Ingen övergång av verkliga data, merge eller publicering har utförts.

## Vad som förblir läsbart i 0.11.14

0.11.14 läser `min-traning-v1` i localStorage. Den nyckeln och den äldre utkaståterställningsnyckeln skrivs eller raderas aldrig av det nya träningsdatalagret. 0.11.14 kan därför fortfarande läsa det oförändrade originalet.

0.11.14 kan **inte direkt läsa IndexedDB**. Nya pass och ändringar efter aktivering blir inte synliga i den gamla appen. Att köra 0.11.14 igen innebär inte att nytillkomna pass automatiskt följer med. En nedgradering med alla nya uppgifter kan inte utlovas utan en separat, verifierad konvertering. Den gamla importören innehåller dessutom de tidigare identifierade destruktiva migreringarna för vissa äldre utkast.

## Aktivering, utan automatisk migrering

1. Användaren stänger andra appfönster och sparar en extern JSON-säkerhetskopia från 0.11.14. Bekräfta att filen finns och behåll originalet.
2. Den nya appen öppnar IndexedDB-databasen `lexl-training-schema1`, version 1, och skapar vid behov en tom objektbutik `records`. Detta skriver inga träningsposter.
3. Finns ingen IndexedDB-post `current` men äldre localStorage-data, läses äldre data endast för visning/export. Vanliga sparförsök nekas. Ingen bakgrundsmigrering och ingen kopiering vid uppstart eller första ändring görs.
4. Användaren väljer uttryckligen den befintliga funktionen Importera säkerhetskopia. Bekräftelsen anger att IndexedDB aktiveras och att gamla localStorage-data lämnas orörda.
5. Hela filen valideras. Nästa tillstånd beräknas utan att aktiva data ändras. Historiska träningsvärden räknas inte om.
6. Samma IndexedDB-transaktion läser och kontrollerar basrevisionen, bevarar första originalkopian, skapar föregående återställningspunkt samt skriver nytt tillstånd, revision och kvitto. Fel eller abort rullar tillbaka alla dessa skrivningar.
7. Efter transaktionens `complete` verifieras skrivkvittot och tillståndet i en ny lästransaktion. Först efter den kontrollen betraktas IndexedDB som primär lagringskälla och det nya state visas som sparat. Vid en senare uppstart väljs den validerade `current`-posten direkt.
8. Vid en helt tom installation krävs ingen överföring. Standarddata finns endast i minnet vid uppstart; första uttryckliga sparåtgärden aktiverar IndexedDB med samma transaktions- och verifieringskrav.

En explicit import ersätter endast det nya tillståndet. Den ersätter inte den gamla localStorage-nyckeln. Första originalkopian sparas permanent; föregående tillstånd sparas vid varje lyckad skrivning. Båda kan exporteras som rå JSON och återställas genom uttrycklig import till den nya appen, som en ny revision.

## Fel och parallella appfönster

- Otillgänglig IndexedDB, nekad åtkomst, okänd databas-/schemaversion, kvotfel eller transaktionsabort ger ett tydligt fel. Ingen fallback skriver träningsdata till localStorage.
- Två IndexedDB-skrivare måste jämföra basrevision och föregående rådata i samma `readwrite`-transaktion. Bara den som har aktuell bas får spara. Den andra behåller sitt aktiva state och kan exportera förslaget som osparat arbete.
- En ändring från en gammal 0.11.14-flik kan inte skriva över IndexedDB. Den upptäcks genom jämförelse med den bevarade localStorage-källan och blockerar fortsatt sparning; ingen automatisk sammanslagning görs.
- Om efterkontrollen misslyckas efter en slutförd transaktion kan ändringen redan vara sparad. Då blockeras nya skrivningar, osparat arbete kan exporteras och användaren måste ladda om. Ingen automatisk rollback får skriva över en annan fliks senare ändring.
- En skadad IndexedDB-post ersätts inte tyst med äldre localStorage-data.

## Säker återgång

1. Stoppa nya registreringar och stäng alla appfönster.
2. Exportera det senaste nya tillståndet, första originalkopian, föregående återställningspunkt och eventuellt osparat arbete. Behåll filerna utanför webbläsaren. Om IndexedDB inte går att läsa: radera den inte och påbörja ingen nedgradering som ersätter data.
3. Återställ appkoden till godkänd 0.11.14 och säkerställ att rätt service worker/appversion används. Själva kodbytet rör inga träningsposter.
4. 0.11.14 läser sitt oförändrade localStorage-original. Alla nya IndexedDB-data och exporter ska behållas. Radera inte databasen, localStorage eller webbläsarens webbplatsdata.
5. Om gamla localStorage-data har ändrats av en äldre app efter aktivering finns två självständiga datakällor. Exportera båda och granska skillnaderna innan någon manuell återställning eller sammanslagning.
6. Att även ta med nya pass tillbaka till 0.11.14 kräver en separat konverteringsplan och tester mot exakt 0.11.14. Ingen sådan konvertering, automatisk synkning eller destruktiv nedgradering ingår i etapp 1.

## Beslut som efterfrågas

Godkänn eller avvisa den manuella aktiveringen och återgången till det bevarade originalet enligt ovan, med uttrycklig förståelse att nya IndexedDB-uppgifter bevaras separat och inte automatiskt följer med till 0.11.14. Detta godkänner varken produktionspublicering, merge eller etapp 2.
