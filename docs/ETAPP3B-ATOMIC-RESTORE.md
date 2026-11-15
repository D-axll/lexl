> Uppdatering 2026-11-15: den försiktiga, bevarande återställningen är nu implementerad med befintlig CAS-transaktion, proof-kontroll och journal. 53 modell-/DOM-/byggtester har passerat; verklig Chromium-/Pixel-verifiering återstår. Se [leveransrapport](ETAPP3B-LEVERANS.md) för exakt implementerad omfattning och begränsningar. Nedanstående är det ursprungliga designunderlaget, inte aktuell leveransstatus.

# LEXL 0.11.15 – Etapp 3B: krav för atomär återställning

Status: **designgranskning, inte implementerad eller testad**. Ingen aktivering tillåten i appen ännu.

## Befintlig arkitektur

- `storage-session.js` väljer primär källa först efter att `storage-transition.js.inspect()` har verifierat den ursprungliga aktiveringsmarkören och dess backup.
- `data-layer.js.createStore().commit()` gör CAS-kontroll av `current` i samma IndexedDB-readwrite-transaktion, skriver `previous` samt kvitto och verifierar efter commit.
- `storage-transition.js.confirm()` är **enbart** för första migreringen; återanvänd inte den vid återställning.
- `recovery-inspection.js`, `recovery-staging.js` och `recovery-preflight.js` granskar och förbereder, men aktiverar ingenting.

## Föreslagen aktiveringsordning (måste kodgranskas före implementering)

1. Kräv att lagringssessionen är verifierad, aktiv och oblockerad i IndexedDB. Avvisa legacy-readonly och first-start tills deras migrering är separat godkänd.
2. Läs om staging-databasen och verifiera rådata, SHA-256, schema, revision och explicit användargodkännande kopplat till exakt kandidat och exakt aktivt tillstånd.
3. Exportera aktuell aktiv data till en **separat, verifierad återställningsbackup** innan någon aktivering. Kräv att exporten faktiskt sparats utanför den databas som ska ändras; enbart en in-memory-kopia är otillräcklig.
4. Kontrollera osparat arbete, recovery-nyckeln i localStorage, andra öppna fönster och eventuella pågående pass. Blockera aktivering tills dessa hanterats.
5. Beräkna ny revision från **aktuell** revision, inte säkerhetskopians. Återställning är en ny skrivning och ska inte återställa revisionsräknaren bakåt.
6. I **en och samma** IndexedDB-readwrite-transaktion: kontrollera `current` exakt mot den tidigare godkända snapshoten och dess revisionskvitto; kontrollera ursprunglig `activation` och koppling till legacy-källan; kontrollera att säkerhetsbackupens referens och godkännandet är oförändrade; skriv `previous`, `backup-receipt:previous`, nytt `current`, `receipt:<newRevision>` samt återställningsjournal. Abortera hela transaktionen vid minsta konflikt. Inga `await` eller nätverksanrop inne i transaktionen.
7. Efter `oncomplete`: verifiera den nya revisionens kvitto och rådata genom en ny readonly-transaktion. Om verifieringen misslyckas: **ingen automatisk rollback** som kan skriva över en senare giltig ändring; blockera appen och begär omstart/granskning.
8. Säkerställ att lagringssessionens minnescache och övriga flikar inte fortsätter använda gamla data; återöppna och verifiera appen innan ny sparning tillåts.

## Blockerande frågor

- En separat återställningsbackup måste överleva krasch och vara användaråtkomlig innan aktivering.
- `storage-transition.inspect()` och `data-layer.createStore()` måste fortsatt acceptera verifierad primär efter återställning, inklusive originalmarkör och revisionskvitton.
- Återställning får inte återinföra historiska pass-ID:n på ett sätt som tyst tar bort nyare pass utan en begriplig förhandsrapport och uttryckligt godkännande.
- Två samtidiga flikar, avbruten transaktion, kvitto-fel, saknad staging, korrupt ZIP och lagringskvot måste testas med syntetiska data.
- Uttryckligt godkännande får inte kunna återanvändas för en annan kandidat eller ett senare aktivt tillstånd.

## Manuell testmatris – ej körd

- [ ] Återställningsfil med samma innehåll
- [ ] Äldre kopia med färre pass
- [ ] Nyare kopia med fler pass
- [ ] Ändrat pass med samma ID
- [ ] Pågående träningsutkast
- [ ] Andra fliken sparar före aktivering → avbryt
- [ ] Andra fliken sparar efter aktivering → konflikt/omladdning
- [ ] Avbrott före transaktionsstart → original kvar
- [ ] Abort inne i transaktion → original kvar
- [ ] Avbrott efter commit före kvitto-verifiering → ingen dubbelaktivering
- [ ] Korrupt staging eller SHA-256 → avbryt
- [ ] Kvotfel → ingen förlorad aktiv data
- [ ] Omladdning efter lyckad aktivering → rätt pass och program
- [ ] Export av backup före återställning kan öppnas och verifieras

**Beslut:** Ingen automatisk aktivering eller UI-koppling förrän punkterna ovan är implementerade och testade i isolerad beta.
