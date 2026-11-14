# Etapp 2B – svensk manuell testchecklista

**Acceptansstatus: EJ TESTAT.** Automatiserade kontroller är inte manuell acceptans.
Ingen Cloudflare-publicering har gjorts av Codex. Följ checklistan först efter separat godkänd manuell publicering på:
`https://lexl-01115-restore-2b.pages.dev/lexl-restore-01115-2b/`.

Använd endast medföljande syntetiska kopior. Registrera eller importera inga verkliga uppgifter. Alla tidigare testytor bevaras. Du behöver inte utvecklarverktyg, ändra JavaScript eller rensa lagring.

Skriv vid varje steg **Godkänt / Underkänt / Ej testat** och eventuell skärmtext. Vid oväntad datakälla, ändrat original eller framgång trots fel: avbryt och rapportera. Om alla testkontroller är avstängda ska felmeddelandet rapporteras; försök inte radera data för att komma vidare.

## T0 – isolering och start

Förutsättning: rätt separata testadress, vanlig Chrome på Pixel 8. Produktion och 2A ska inte öppnas i denna origin.

| Steg | En instruktion | Förväntat resultat och diagnostik | Resultat |
|---|---|---|---|
| T0.1 | Öppna testadressen. | Namn **LEXL ÅTERSTÄLLNINGSTEST 2B – 0.11.15**. Meddelande om syntetiska data. `source: no-target` vid första start. | Ej testat |
| T0.2 | Tryck **Skapa ny tom testyta (bevara alla tidigare)**. | `database` börjar `lexl-test-01115-2b-restore-target-`; `activationPresent:false`, `stagingPresent:false`, `originalUnchanged:true`. | Ej testat |

## R1 – giltig senare JSON-kopia

Förutsättning: tom testyta från T0.2. Felläge **Inget avbrott**.

| Steg | En instruktion | Förväntat resultat och diagnostik | Resultat |
|---|---|---|---|
| R1.1 | Välj **Giltig senare IndexedDB-export**. | Valet anger revision 7 och 6 pass. | Ej testat |
| R1.2 | Tryck **Granska kopian**. | SHA visas; revision 7, 6 pass, 1 program, utkast finns. Ingen staging/aktivering har skrivits. | Ej testat |
| R1.3 | Markera godkännanderutan för återställning. | Återställningsknappen blir tillgänglig. | Ej testat |
| R1.4 | Tryck **Återställ och verifiera före aktivering**. | Framgång först efter återläsning. `source:restored-indexeddb`, `activeVerified:true`, `stagingVerified:true`, `activationPresent:true`, revision 7, 6 pass, 1 program, `draftPresent:true`, `originalUnchanged:true`. | Ej testat |
| R1.5 | Öppna historiksektionen. | Sex pass, cirklar A, set/vikt/reps/tider/anteckningar syns. Sista påhittade passet är 2026-01-07 och första setets vikt 12.5. | Ej testat |
| R1.6 | Öppna sektionen för pågående pass. | Vikt 6.5/reps 9 respektive vikt 8/reps 7; senare påhittad utkastanteckning och cirklar kvar. | Ej testat |

## R6 – omstart efter giltig återställning

Förutsättning: R1 slutfört. Notera database, revision och stagingSha256.

| Steg | En instruktion | Förväntat resultat och diagnostik | Resultat |
|---|---|---|---|
| R6.1 | Tryck **Ladda om och verifiera**. | Samma databas, hash, revision 7 och 6 pass. Samtycke avmarkerat. Ingen automatisk ny återställning. | Ej testat |
| R6.2 | Tryck **Kontrollera lagring**. | `activeVerified:true`, `originalUnchanged:true`; oförändrade uppgifter. | Ej testat |

## R7 – upprepad återställning

Förutsättning: aktiv revision 7 från R1.

| Steg | En instruktion | Förväntat resultat och diagnostik | Resultat |
|---|---|---|---|
| R7.1 | Tryck **Granska kopian** med samma JSON vald. | Befintligt aktivt mål visas i granskningsinformationen. | Ej testat |
| R7.2 | Markera återställningsgodkännandet. | Endast ett nytt försök godkänns; ingen skrivning ännu. | Ej testat |
| R7.3 | Tryck **Återställ och verifiera före aktivering**. | STOPPAD: målet innehåller redan data. Samma hash, revision och 6 pass; inga dubbletter. | Ej testat |

## R8 – äldre kopia mot senare träningsdata

Förutsättning: aktiv revision 7.

| Steg | En instruktion | Förväntat resultat och diagnostik | Resultat |
|---|---|---|---|
| R8.1 | Välj **Äldre IndexedDB-export**. | Revision 1 och 5 pass anges. | Ej testat |
| R8.2 | Tryck **Granska kopian**. | Kandidat revision 1, befintlig revision 7. | Ej testat |
| R8.3 | Markera återställningsgodkännandet. | Inget sparas ännu. | Ej testat |
| R8.4 | Tryck **Återställ och verifiera före aktivering**. | **ÄLDRE SÄKERHETSKOPIA**, stopp utan överskrivning. Aktiv revision 7 och 6 pass kvar. | Ej testat |

## R2 – fel kontrollsumma

Förutsättning: valfri aktiv testyta. Notera befintlig hash/revision.

| Steg | En instruktion | Förväntat resultat och diagnostik | Resultat |
|---|---|---|---|
| R2.1 | Välj **R2 · Fel SHA-256**. | Samtycke återkallas. | Ej testat |
| R2.2 | Tryck **Granska kopian**. | STOPPAD: SHA-256 stämmer inte. Återställningsknappen förblir spärrad. Aktiv hash/revision oförändrad. | Ej testat |

## R3 – fel format

Förutsättning: skapa en ny tom testyta. Upprepa R3.1–R3.2 separat för **Felaktig JSON**, **Saknade fält**, **Okänd schemaversion** och **Ofullständig ZIP**. Notera vilket val resultatet gäller.

| Steg | En instruktion | Förväntat resultat och diagnostik | Resultat |
|---|---|---|---|
| R3.1 | Välj ett av R3-fallen. | Samtycke avmarkerat. | Ej testat |
| R3.2 | Tryck **Granska kopian**. | Begripligt stopp. `stagingPresent:false`, `activationPresent:false`, `originalUnchanged:true`. Ingen partiell återställning. | Ej testat |

## R4 – mål med befintliga uppgifter

Förutsättning: aktivt mål från R1. R7 visar identisk kopia, R8 visar äldre. För att även prova en nyare kopia mot befintlig äldre data: skapa först ny tom testyta och återställ **Äldre IndexedDB-export** med samma gransknings-/samtyckessteg som R1. Den ska då vara revision 1, 5 pass.

| Steg | En instruktion | Förväntat resultat och diagnostik | Resultat |
|---|---|---|---|
| R4.1 | Välj **Giltig senare IndexedDB-export** i ett aktivt revision 1-mål. | Senare kopia vald, inget sparas. | Ej testat |
| R4.2 | Tryck **Granska kopian**. | Kandidat 7, befintlig 1 visas. | Ej testat |
| R4.3 | Markera godkännanderutan. | Ingen skrivning ännu. | Ej testat |
| R4.4 | Tryck återställningsknappen. | Stopp även för nyare kandidat: befintliga data får inte ersättas. Revision 1 och 5 pass kvar. | Ej testat |

## R5 – avbrott efter verifierad staging

Förutsättning: ny tom testyta, giltig senare JSON vald.

| Steg | En instruktion | Förväntat resultat och diagnostik | Resultat |
|---|---|---|---|
| R5.1 | Välj avbrott **Efter verifierad staging, före aktivering**. | Samtycke återkallas. | Ej testat |
| R5.2 | Tryck **Granska kopian**. | Kopian valideras. | Ej testat |
| R5.3 | Markera godkännanderutan. | Återställning kan provas. | Ej testat |
| R5.4 | Tryck återställningsknappen. | **AVSIKTLIGT AVBROTT**. `stagingPresent:true`, `stagingVerified:true`, `activationPresent:false`, `source:no-active-source`, `originalUnchanged:true`. | Ej testat |
| R5.5 | Tryck **Ladda om och verifiera**. | Samma staging/hash kvar, ingen aktivering eller träningsvisning. Samtycke avmarkerat. | Ej testat |
| R5.6 | Välj **Inget avbrott**. | Valet ensamt aktiverar ingenting. | Ej testat |
| R5.7 | Tryck **Granska kopian**. | Samma kopia verifieras igen. | Ej testat |
| R5.8 | Markera nytt godkännande. | Ingen aktivering ännu. | Ej testat |
| R5.9 | Tryck återställningsknappen. | Samma staging aktiveras, revision 7, 6 pass, inga dubbletter. | Ej testat |

## F1 – avbrutna skrivtransaktioner och lagringsfel

Förutsättning: **ny tom testyta för varje felläge**, giltig senare JSON vald. Följ gransknings-/samtyckesstegen i R5 för respektive val nedan.

| Testnummer | Felläge att välja | Förväntat efter försök och omladdning | Resultat |
|---|---|---|---|
| F1.1 | **Avbryt skrivtransaktionen** | STOPPAD; staging=false, activation=false; original oförändrat. | Ej testat |
| F1.2 | **Avbryt aktiveringstransaktionen** | STOPPAD; staging=true/verified=true, activation=false; original oförändrat. | Ej testat |
| F1.3 | **Simulerat lagringsfel** | STOPPAD; staging=false, activation=false. Inget verkligt lagringsutrymme fylls. | Ej testat |

För varje rad: välj felläge → granska → godkänn → återställ → ladda om. Utför en åtgärd åt gången. Kontrollen simulerar transaktionsfel; fysisk kvotbrist/strömförlust är inte verifierad.

## S1 – saknad, skadad eller otillgänglig aktiv källa

Förutsättning: aktivt revision 7-mål. Upprepa för varje val. Notera database/hash innan start.

| Steg | En instruktion | Förväntat resultat och diagnostik | Resultat |
|---|---|---|---|
| S1.1 | Välj **Aktiv källa saknas**, **Aktiv källa skadad** eller **IndexedDB kan inte användas**. | `simulatedSourceUnavailable:true`, `source:no-active-source`; inga träningsuppgifter visas. Underliggande aktivering finns kvar och verifieras fortfarande; inget raderas. | Ej testat |
| S1.2 | Tryck **Ladda om och verifiera**. | Samma simulering kvar, ingen automatisk återställning. | Ej testat |
| S1.3 | Välj **Ingen simulering**. | Ursprunglig aktivering, hash och träningsdata visas igen. | Ej testat |
| S1.4 | Välj önskad källfelsimulering igen. | Ingen aktiv träningsvisning. | Ej testat |
| S1.5 | Tryck **Skapa ny tom testyta (bevara alla tidigare)**. | Annat databasnamn; tom staging/aktivering. Simulering stängs för det nya målet. Den gamla databasen bevaras. | Ej testat |
| S1.6 | Följ R1:s steg på det nya målet. | Giltig säkerhetskopia återställs till det nya målet utan att den tidigare databasens innehåll ändras. | Ej testat |

## Z1 – giltigt ZIP-paket

Förutsättning: ny tom testyta, Inget avbrott.

| Steg | En instruktion | Förväntat resultat och diagnostik | Resultat |
|---|---|---|---|
| Z1.1 | Välj **Giltigt återgångspaket ZIP**. | ZIP-kopian vald. | Ej testat |
| Z1.2 | Följ R1:s gransknings-, samtyckes- och återställningssteg, en åtgärd i taget. | Samma native tillstånd och stagingSha256 som JSON: revision 7, 6 pass, program och utkast kvar. `backupAsset:native-zip`. | Ej testat |

## O1 – ursprunglig localStorage-kopia

Förutsättning: ny tom testyta, Inget avbrott.

| Steg | En instruktion | Förväntat resultat och diagnostik | Resultat |
|---|---|---|---|
| O1.1 | Välj **Ursprunglig localStorage-kopia**. | Fem pass, senare uppgifter saknas. | Ej testat |
| O1.2 | Tryck **Granska kopian**. | Originalvarning, revision 0 och 5 pass visas. | Ej testat |
| O1.3 | Markera enbart återställningsgodkännandet. | Återställningsknappen fortfarande spärrad. | Ej testat |
| O1.4 | Markera extra rutan om saknade senare IndexedDB-uppgifter. | Knappen blir tillgänglig. | Ej testat |
| O1.5 | Tryck återställningsknappen. | Revision 0 och 5 pass återställs med ursprungligt utkast. `originalUnchanged:true`. Ingen påhittad synkning till 0.11.14. | Ej testat |

## Avslut

Rapportera resultat per testnummer och eventuella meddelanden. Markera inte Etapp 2B som godkänd enbart för att ett huvudscenario passerar. Stäng fliken när du är klar. Radera inga databaser eller original för att starta om testet; använd ny tom testyta eller separat testprofil. Ingen merge eller driftsättning ingår i acceptanstestet.
