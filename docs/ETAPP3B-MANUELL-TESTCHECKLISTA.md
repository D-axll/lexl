# LEXL 0.11.15 – manuell testchecklista, etapp 3B

Status 2026-11-15: **Inget manuellt test utfört eller godkänt.** Publicering är inte genomförd. Börja först när den separata betan har publicerats och du väljer att påbörja testningen.

Miljö: Google Pixel 8, Chrome, därefter installerad separat PWA **LEXL TEST 3B**. Endast syntetiska data. Produktion 0.11.14 ska inte användas i dessa tester.

Avsedd adress efter publicering: `https://lexl-01115-etapp3b.pages.dev/beta-3b/`. Adressen är en bygginställning, inte ett bevis på publicering.

För varje rad antecknas **Ej testat / OK / Fel**, gärna med skärmbild och exakt vad som hände. Alla rader nedan är **Ej testat**.

## Förberedelser

- [ ] Kontrollera adress, den röda TEST 3B-markeringen och versionsnumret 0.11.15.
- [ ] Produktionsappen har kvar sina tidigare program och pass. Ingen data importeras från den.
- [ ] Betan visar 1 syntetiskt program, 5 syntetiska pass och inget pågående pass.
- [ ] Genomför betans tydligt separata engångsövergång till IndexedDB. Ladda om och kontrollera samma 5 pass.
- [ ] Öppna **Hämta testfiler** i testmarkeringen. Spara de medföljande JSON- och ZIP-filerna på telefonen. Använd inga egna träningsfiler.

## Inställningar och granskning

| Nr | Gör så här | Förväntat resultat |
|---|---|---|
| 1 | Öppna Inställningar i ljust och mörkt tema. | Text, knappar och filval är läsbara och ryms utan horisontell scroll. |
| 2 | Välj `synthetic-same.json` under Säker återställning. | Kopian och nuvarande data visar 1 program och 5 pass. Ingenting återställs automatiskt. |
| 3 | Avbryt telefonens filval. | Ingen ändring och ingen automatisk återställning. |
| 4 | Välj `fault-json.json`. | Begripligt fel. Samma program och pass finns kvar. |
| 5 | Välj `fault-incomplete.zip`. | Paketet avvisas. Aktiva data är oförändrade. |
| 6 | Välj `synthetic-older.json`. | Ett pass skulle försvinna. Återställningen blockeras. |
| 7 | Välj `synthetic-changed.json`. | Ett befintligt pass skulle ändras. Återställningen blockeras. |
| 8 | Välj `synthetic-draft.json`. | Kopian med pågående utkast blockeras. |

## Säkerhetskopia och uttryckligt godkännande

Utgångsläge: 5 pass. Välj `synthetic-newer.json`.

| Nr | Gör så här | Förväntat resultat |
|---|---|---|
| 9 | Granska den nyare kopian. | 6 pass i kopian, 5 nuvarande, 1 tillkommer, 0 försvinner/ändras. |
| 10 | Tryck Spara säkerhetskopia av nuvarande data. | Telefonen erbjuder nedladdning av en separat JSON-fil. Återställning har inte skett. |
| 11 | Välj en annan fil än den nyss sparade. | Verifieringen misslyckas. Återställningsknappen kan inte aktiveras. |
| 12 | Välj tillbaka rätt nedladdad `lexl-before-restore-…json`. | Filen verifieras. Separat bekräftelse visas. |
| 13 | Skriv fel fras eller lämna samtycket omarkerat. | Återställningsknappen förblir inaktiv. |
| 14 | Skriv **ÅTERSTÄLL MIN TRÄNING** och markera samtycket. Tryck återställ. | Återställningen bekräftas först efter sparning och efterkontroll. Omladdning krävs. |
| 15 | Försök registrera något före omladdning. | Ingen ny skrivning tillåts. |
| 16 | Ladda om med knappen. | 6 pass, 1 program, inget utkast. De ursprungliga 5 passen är kvar med samma värden/anteckningar. |
| 17 | Granska `synthetic-newer.zip`. | ZIP-kopian med 6 pass kan granskas. Upprepa backup och godkännande om du vill verifiera ZIP-aktivering. |
| 18 | Exportera vanlig säkerhetskopia. | Den kan laddas ned och innehåller alla 6 pass. Den syntetiska betans filpolicy tillåter bara medföljande kandidater; egen export kan därför inte alltid väljas som återställningskandidat. |

## Avbrott, flikar och pågående arbete

| Nr | Gör så här | Förväntat resultat |
|---|---|---|
| 19 | Granska en fil och ladda om före godkännandet. | Aktiva data är kvar. Ny granskning och nytt godkännande krävs. |
| 20 | Gör programändringar utan att spara. Försök nå återställningen utan att kasta ändringarna. | Navigation varnar för ändringarna. Ingen återställning får tyst kasta dem. |
| 21 | Starta ett syntetiskt träningspass och försök återställa. | Återställningen blockeras. Pågående pass och inmatning är kvar. Avsluta eller avbryt testpasset själv därefter. |
| 22 | Öppna två betaflikar. Granska och verifiera backup i A. Spara en ändring i B. Försök återställa i A. | Konflikt eller uppmaning att börja om. B:s sparning finns kvar. |
| 23 | Ladda om båda flikarna efter konflikten. | Samma verifierade data visas. Ingen automatisk återgång eller dubbel återställning. |
| 24 | Stäng fliken efter sparad återställning men före omladdningsknappen. Öppna betan igen. | Sparad återställning verifieras vid start; rätt antal pass. |
| 25 | Öppna betan online, låt sidan ladda färdigt. Slå på flygplansläge och öppna appen igen. | Betan öppnas offline. Program, historik och återställningsgränssnitt finns kvar. |
| 26 | Installera PWA:n och kontrollera start, bakåtsvep och teman. | Den heter LEXL TEST 3B, öppnar betaadressen och fungerar utan påverkan på produktionsappen. |

Kvotfel, transaktionsabort och skadad journal har testats i en IndexedDB-modell, men behöver även verifieras i riktig webbläsare av utvecklare. Försök inte fylla telefonens lagring eller ändra databasposter manuellt.

Godkännande lämnas av Daniel efter testningen. Ingen rad blir automatiskt godkänd av att paketet byggts.
