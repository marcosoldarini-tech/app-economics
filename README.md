# Economics

Web app personale (PWA) per guadagni, spese e investimenti mensili.
I dati restano solo sul dispositivo. Il file Excel esportato, da aprire con Numbers, serve sia per lo storico sia come backup.

## Pubblicazione su GitHub Pages (gratuita)

1. Crea un account su <https://github.com> se non ce l'hai.
2. Crea un nuovo repository **pubblico** (questo è `app-economics`). Pages è gratuito solo per i repository pubblici; il codice sarà visibile, i tuoi dati no.
3. Nel repository: **Add file → Upload files** e carica tutto il contenuto di questa cartella:
   `index.html`, `app.js`, `styles.css`, `sw.js`, `manifest.webmanifest` e la cartella `icons/`.
4. **Settings → Pages → Build and deployment**: Source = *Deploy from a branch*, Branch = `main`, cartella `/ (root)` → **Save**.
5. Dopo un paio di minuti l'app è su <https://marcosoldarini-tech.github.io/app-economics/>.

## Installazione sul telefono

1. Apri l'indirizzo nel **browser** del telefono.
2. iPhone: **Condividi → Aggiungi alla schermata Home**. Android: menu **⋮ → Installa app** (o **Aggiungi a schermata Home**).
3. Usa sempre l'icona sulla Home: i dati della scheda del browser sono separati da quelli dell'app installata.

I dati restano sul telefono di chi usa l'app: ogni persona ha i propri.

## Flusso mensile consigliato

- **Inizio anno**: nella sezione *Piano* crea stipendio, spese fisse e investimenti, scegliendo i mesi: tutti, alterni o a mano. Per gli anni successivi usa "Copia le voci dall'anno precedente" e scegli quali voci copiare: quelle con importi variabili, come le bollette, partono senza spunta.
- **Durante il mese**: aggiungi spese e altri introiti con il pulsante **+**.
- **Bollette e voci con importi variabili** (es. Enel): crea la voce una volta nel *Piano*, poi a ogni bolletta tocca il mese vuoto (**+**) nel suo blocco e inserisci l'importo. Vale solo per quel mese.
- **Fine mese**: premi **Mese concluso** ed esporta `Economics <anno>.xlsx` su iCloud Drive, sostituendo il precedente. Aprilo con Numbers.

L'app è l'originale; il file Numbers è l'archivio storico. I dati si inseriscono e si correggono solo nell'app.

## Il file di archivio (uno per anno)

| Foglio | Colonne |
|---|---|
| Stipendio | Mese, Importo, Descrizione |
| Altri introiti | Data, Importo, Descrizione |
| Spese | Data, Importo, Categoria, Descrizione |
| Spese fisse | Mese, Importo, Categoria, Descrizione |
| Investimenti | Mese, Importo, Descrizione |
| Prospetto | Mese, Entrate, Uscite, Gain/Loss, Investimenti, Gain/Loss liquido, Mese chiuso. Il Gain/Loss compare solo per i mesi chiusi |
| Prospetto categorie | Gruppo, Categoria, Gen…Dic, Totale anno, % uscite |
| Categorie | impostazioni dell'app, servono per il ripristino |

Il grafico c'è solo nell'app.

## Import

**Importa** accetta sia i file esportati dall'app sia il file Numbers storico, esportato da Numbers con *File → Esporta in → Excel*.

- Le tabelle vengono trovate in base alle intestazioni (*Data* o *Mese* + *Importo*), anche con più tabelle nello stesso foglio o con un titolo sopra.
- Ogni tabella viene riconosciuta dal nome del foglio o dal titolo: *Stipendio*, *Altri introiti*, *Spese*, *Spese fisse*, *Investimenti*.
- Dal *Prospetto* si leggono i mesi chiusi, nella colonna *Chiuso*, *Mese chiuso* o *Concluso*. Se nel file manca la tabella Investimenti, gli investimenti vengono presi dalla colonna *Investimenti* del Prospetto.
- Le voci fisse con la stessa descrizione e categoria vengono ricostruite come voci del Piano.
- L'import sostituisce solo gli anni contenuti nel file. Prima di procedere mostra cosa ha riconosciuto e chiede conferma.

## Regole di calcolo

- Gain/Loss = Entrate (stipendio + altri introiti) − Uscite (spese + spese fisse)
- Gain/Loss liquido = Gain/Loss − Investimenti
- Le categorie "fuori calcolo", come *Spesa con buoni pasto*, compaiono solo nei report.
- Un mese è *provvisorio* finché non lo concludi. Un mese concluso è bloccato, ma si può riaprire.

## Aggiornare l'app

Dopo aver modificato i file, aumenta `VERSION` in `sw.js`, ad esempio `economics-v2`, poi fai commit e push su GitHub. L'app si aggiorna alla successiva apertura con la connessione attiva.
