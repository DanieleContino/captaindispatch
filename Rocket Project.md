# Rocket — Trip Generator v2
## Analisi completa del sistema di generazione automatica dei trasporti
### CaptainDispatch · Aggiornato al 28 marzo 2026

---

## Cos'è Rocket

Rocket è il cuore operativo di CaptainDispatch: un sistema di generazione automatica dei trip di trasporto pensato per la gestione dei movimenti del crew in produzioni cinematografiche, televisive o di grandi eventi. Il suo scopo è risolvere uno dei problemi più ricorrenti e dispendiosi in termini di tempo nella vita di un Transportation Captain: assegnare ogni mattina decine o centinaia di persone ai veicoli disponibili, calcolando gli orari di pickup in modo preciso e coerente per ogni hotel di partenza.

Prima di Rocket, questa operazione veniva eseguita manualmente su Google Sheets, richiedendo minuti o ore di lavoro ogni giorno. Rocket la riduce a pochi click.

---

## Il problema che risolve

In una produzione con, ad esempio, 150 persone di crew distribuite su 8 hotel diversi e 15 veicoli disponibili, il Transportation Captain deve ogni giorno rispondere a domande come:

- Chi parte da quale hotel e a che ora deve essere sul set?
- Quante persone entrano in ogni van, rispettando la capienza suggerita?
- Se ci sono persone di dipartimenti diversi che devono arrivare in luoghi o orari diversi, come si suddividono?
- Se un van non basta, chi rimane senza mezzo e come si risolve?

Fare tutto questo a mano è un processo lungo, soggetto a errori e da rifare ogni giorno. Rocket automatizza l'intera logica in pochi secondi, lasciando al Captain solo le decisioni di aggiustamento finale.

---

## Il flusso in tre step

Rocket è strutturato come un processo guidato in tre fasi successive, visualizzate nella barra superiore dell'interfaccia.

### Step 1 — Setup (Configurazione)

Il primo step è la fase di configurazione, in cui il Captain imposta tutti i parametri del "run" mattutino.

La schermata è divisa in due colonne. Nella colonna sinistra si trovano i parametri globali del trip: la data, la destinazione di default (il set, lo studio, oppure un aeroporto), l'orario di call (l'ora in cui il crew deve arrivare a destinazione) e il tipo di servizio (Hotel Run, Airport, Unit Move, Shuttle, Standard, Other).

A questi si aggiunge un pannello dedicato alle destinazioni per dipartimento. Questa è una delle funzionalità più potenti: se ad esempio il reparto GRIP deve andare su un set diverso dal resto, o deve arrivare 30 minuti prima, il Captain può configurarlo in modo indipendente senza toccare il resto. Ogni dipartimento può avere la propria destinazione e il proprio orario di call, come override rispetto al default globale.

Nella stessa colonna si trova anche il pannello della fleet, con tutti i veicoli attivi della produzione. Ogni veicolo mostra il proprio identificativo, il nome del driver, il tipo (VAN, CAR, BUS) e la capacità suggerita e massima. Il Captain può escludere con un click i veicoli che non vuole usare in questo run (perché fuori servizio, già impegnati altrove, ecc.).

Nella colonna destra si trova l'elenco completo del crew eleggibile, cioè tutte le persone con `travel_status = PRESENT` e `hotel_status = CONFIRMED`. Questo filtraggio è fondamentale: solo chi è fisicamente presente nella produzione e ha una sistemazione confermata entra nel calcolo. Il crew è organizzato in accordion per dipartimento, con indicazione dell'hotel di provenienza, dell'orario di call assegnato e di eventuali override individuali.

Il Captain può escludere singoli membri del crew, o intere sezioni di dipartimento, oppure personalizzare l'orario di call per una singola persona tramite un modal dedicato che si apre al click sul nome. Ogni modifica è visiva e immediata.

Quando tutto è impostato, il bottone "Launch Rocket" mostra il numero di persone selezionate e di veicoli inclusi. Al click, il sistema esegue l'algoritmo.

### Step 2 — Preview (Anteprima e aggiustamenti)

Il secondo step mostra il piano generato da Rocket, prima che venga scritto nel database. È la fase di revisione e correzione manuale.

I trip proposti vengono visualizzati come card, ognuna rappresentante un veicolo con il suo carico di passeggeri. Ogni card mostra il veicolo assegnato, il driver, la rotta (hotel di partenza → destinazione), gli orari calcolati (pickup time, call time, durata stimata), il numero di passeggeri rispetto alla capienza, e la lista nominativa del crew con il relativo dipartimento.

Se qualcosa non torna — ad esempio una persona è nel veicolo sbagliato, o un van è sovraccarico — il Captain può spostare singoli passeggeri da un veicolo all'altro usando il pulsante "Move" accanto a ogni nome. Si apre un modal che elenca tutti gli altri trip disponibili e permette di scegliere la destinazione del trasferimento, oppure di rimuovere la persona da tutti i trip.

Nella parte superiore dello step 2 compaiono eventuali avvisi intelligenti generati da Rocket:

- Un avviso rosso "No Vehicle" segnala che ci sono persone rimaste senza veicolo, mostrando i loro nomi, il loro hotel e la loro destinazione. Il sistema suggerisce automaticamente se ci sono veicoli con capacità residua verso quella stessa destinazione, o se ci sono hotel vicini (a meno di 15 minuti) il cui van potrebbe fare un pickup combinato.
- Un avviso giallo "Can Add" suggerisce quando un veicolo ha ancora posti disponibili oltre la capienza suggerita (ma entro il massimo assoluto) e potrebbe prendere a bordo altre persone rimaste senza mezzo.

### Step 3 — Done (Conferma e creazione)

Dopo la revisione, il Captain clicca "Confirm". In questo momento Rocket scrive tutti i trip nel database, creando le righe nella tabella `trips` e i collegamenti nella tabella `trip_passengers`. Al termine, viene mostrata una schermata riepilogativa con il numero di trip creati, i passeggeri coinvolti e i link rapidi a "Visualizza Trips" e "Fleet Monitor".

---

## L'algoritmo core: come Rocket assegna veicoli e crew

Il cuore del sistema è la funzione `runRocket()`, un algoritmo greedy che opera in tre fasi principali.

### Fase 1 — Raggruppamento

Rocket prende tutto il crew eleggibile e lo raggruppa per combinazione univoca di tre parametri: hotel di partenza, destinazione effettiva e orario di call effettivo. La "destinazione effettiva" e il "call effettivo" tengono conto di tutti gli override: prima l'override individuale sul singolo membro, poi quello di dipartimento, infine il valore globale.

Il risultato è un insieme di gruppi, ognuno rappresentante una "domanda di trasporto" precisa: "queste 12 persone si trovano all'Hotel Excelsior, devono essere in studio entro le 07:00 e vengono da destinazioni diverse rispetto a quel gruppo di 8 che prendono la navetta per l'aeroporto."

I gruppi vengono ordinati per dimensione decrescente (prima i gruppi più grandi) e, a parità di dimensione, per orario di call (prima chi deve partire prima).

### Fase 2 — Assegnazione greedy

I veicoli vengono ordinati per capienza suggerita decrescente (prima i bus grandi, poi i van, poi le auto). Rocket scorre i gruppi uno alla volta. Per ogni gruppo, prende il primo veicolo disponibile dalla "pool" e gli assegna fino a `pax_suggested` passeggeri. Se il gruppo è più grande della capienza, il veicolo viene saturato e si passa al prossimo veicolo per i passeggeri rimanenti, finché il gruppo è esaurito o la pool è vuota.

Se la pool di veicoli si esaurisce prima che tutti i passeggeri siano stati assegnati, Rocket non elimina queste persone: le raccoglie in un "phantom trip" senza veicolo, un trip virtuale marcato come `isUnassigned`. Questi phantom trip compaiono nello Step 2 con un bordo rosso e l'etichetta "NO VEHICLE — use Move ›", dando visibilità immediata al problema e permettendo al Captain di risolverlo manualmente.

### Fase 3 — Calcolo tempi

Per ogni trip, Rocket recupera la durata della rotta dall'hotel alla destinazione dalla tabella `routes`. Se la rotta non è presente, usa un valore di fallback di 30 minuti. L'orario di pickup viene calcolato come `call_time - durata_rotta`: se il crew deve essere in studio alle 07:00 e il viaggio dura 25 minuti, il pickup è alle 06:35.

---

## Il sistema di override: flessibilità a tre livelli

Uno degli aspetti più sofisticati di Rocket è la gestione degli override degli orari e delle destinazioni, strutturata su tre livelli gerarchici.

Il primo livello è il default globale: una destinazione e un orario di call che valgono per tutta la produzione se non diversamente specificato.

Il secondo livello è l'override di dipartimento: il Captain può configurare, per ciascun reparto (GRIP, ELECTRIC, CAMERA, ecc.), una destinazione diversa e/o un orario di call diverso. Questa configurazione viene salvata automaticamente nel localStorage del browser, così da sopravvivere ai reload di pagina e riproporsi il giorno successivo come punto di partenza.

Il terzo livello è l'override individuale: aprendo il modal di una singola persona, il Captain può assegnare un orario di call personalizzato, indipendente dal suo dipartimento. Questo è utile, ad esempio, per un attore protagonista che deve essere sul set un'ora prima di tutti gli altri. L'override individuale è visualizzato con un punto arancione accanto all'orario nella lista crew.

La gerarchia è: override individuale > override dipartimento > default globale. Il sistema mostra sempre quale livello è attivo e permette il reset a qualsiasi livello con un click.

---

## Multi-pickup e multi-dropoff

Rocket gestisce automaticamente situazioni in cui un singolo veicolo serve più hotel di partenza (multi-pickup) o più destinazioni (multi-dropoff). Questo accade quando, dopo la fase di revisione in Step 2, il Captain sposta manualmente persone da hotel diversi nello stesso trip, o quando persone dello stesso trip hanno destinazioni diverse per via degli override di dipartimento.

La detection è automatica: se il crewList di un trip contiene persone con `hotel_id` diversi, il trip viene marcato come MULTI-PKP. Se contiene persone con `_effectiveDest` diversi, viene marcato come MULTI-DRP. Entrambe le condizioni vengono segnalate con badge colorati sulla card del trip in Step 2.

All'atto della conferma (Step 3), Rocket esegue un auto-split: ogni combinazione unica di (hotel_di_partenza, destinazione) diventa un trip separato nel database, con il proprio trip ID suffissato da una lettera progressiva (ad esempio `R_0328_01A`, `R_0328_01B`). Questo garantisce che ogni riga nella tabella `trips` rappresenti sempre una singola tratta con un solo pickup e un solo dropoff, come richiede il modello dati del sistema.

---

## La nomenclatura dei Trip ID

I trip generati da Rocket seguono una convenzione di naming precisa e riconoscibile che li distingue dai trip creati manualmente o da altri processi.

Il formato base è `R_MMDD_NN`: la lettera R identifica l'origine Rocket, seguita dalla data nel formato mese-giorno (es. `0328` per il 28 marzo), e da un numero sequenziale a due cifre. Il contatore riparte da 01 ad ogni nuovo run.

Per i trip multi-stop risultanti dall'auto-split, al numero sequenziale viene aggiunta una lettera: `R_0328_01A` e `R_0328_01B` sono le due tratte dello stesso veicolo, che parte dal primo hotel (A), carica altri passeggeri al secondo hotel (B) e prosegue verso la destinazione finale.

Questo naming permette di identificare a colpo d'occhio, nella vista trips, quali corse sono state generate automaticamente e qual è la loro sequenza operativa.

---

## Calcolo degli orari: pickup, call, start, end

Ogni trip in CaptainDispatch ha quattro timestamp fondamentali: Call (l'ora di arrivo a destinazione), Pickup (l'ora in cui il driver parte dall'hotel), Start_DT (timestamp completo di partenza) e End_DT (timestamp completo di arrivo).

Per i trip Rocket, il calcolo è semplice e diretto: il Call è l'orario impostato nella configurazione (globale o override). Il Pickup è il Call meno la durata della rotta. Start_DT e End_DT sono costruiti combinando la data selezionata con rispettivamente Pickup e Call.

Questo schema vale per i trip STANDARD, che sono la tipologia tipica dei trip di Rocket (hotel verso set o destinazione operativa). Se invece la destinazione è un hub di trasporto (aeroporto, stazione ferroviaria, porto), il sistema riconosce automaticamente la tipologia come DEPARTURE, e il calcolo aggiunge un buffer di check-in di 120 minuti: il Call diventa `arrivo_volo - 120 minuti`, e il Pickup `Call - durata_rotta`.

---

## Integrazione con il database

Al momento della conferma, Rocket scrive su due tabelle Supabase.

Nella tabella `trips` inserisce una riga per ogni tratta, con tutti i dati del veicolo (driver, sign code, capacità) denormalizzati al momento dell'inserimento, gli ID di pickup e dropoff, i timestamp calcolati, il tipo di servizio, il numero di passeggeri e lo stato iniziale `PLANNED`.

Nella tabella `trip_passengers` inserisce una riga per ogni abbinamento crew-trip. Un trigger PostgreSQL aggiorna automaticamente il campo `passenger_list` (lista nomi in formato CSV) e `pax_count` sulla tabella trips a ogni inserimento.

Se si verifica un errore durante la scrittura, il processo si interrompe e mostra un messaggio di errore dettagliato senza lasciare dati parzialmente scritti. L'utente può ritentare la conferma senza creare duplicati, poiché i trip ID sono generati al momento della conferma e non durante il run.

---

## Le rotte: aggiornamento con Google Traffic

Le durate delle rotte usate da Rocket provengono dalla tabella `routes` del database. Questa tabella viene aggiornata quotidianamente da un cron job automatico che interroga la Google Routes API con il parametro `TRAFFIC_AWARE_OPTIMAL`: le durate riflettono quindi le condizioni di traffico reali, non solo le distanze geografiche.

Il sistema gestisce con attenzione le rotte inserite manualmente (segnate con `source = MANUAL`): queste non vengono mai sovrascritte dagli aggiornamenti automatici, per preservare la conoscenza operativa che solo il Transportation Captain possiede (ad esempio, sapere che un certo percorso ha un cancello che apre tardi e richiede sempre 10 minuti in più).

Se una rotta non esiste nel database, Rocket usa un valore di fallback di 30 minuti, che viene poi aggiornato al prossimo ciclo del cron o su richiesta manuale dal Fleet Monitor.

---

## Cosa Rocket non fa (ancora): sviluppi futuri

Il sistema nella sua versione attuale (v2.1, marzo 2026) è funzionale e completo per il caso d'uso principale, ma ci sono alcune funzionalità ancora in lavorazione o pianificate per versioni future.

La visualizzazione della durata stimata di ogni trip — in minuti e come orario di fine corsa — è prevista per la versione 2 dello Step 2, ma non ancora implementata. Al momento il Captain deve calcolarla mentalmente o consultare la tabella routes separatamente.

Il routing sequenziale per i trip multi-pickup DEPARTURE rappresenta il bug aperto più significativo: quando un van deve raccogliere persone da due hotel diversi prima di andare in aeroporto, il sistema calcola i pickup di ogni hotel in modo indipendente (ognuno come `call - durata_rotta_hotel_hub`), anziché in modo sequenziale (Hotel A → Hotel B → Hub, con i pickup sfasati di conseguenza). Questo può portare a orari di pickup identici per hotel diversi, che nella pratica è impossibile.

Tra le funzionalità desiderate ci sono anche un quick-reason per l'esclusione di un veicolo (per spiegare perché è OUT), la possibilità di impostare il tipo di servizio per singola destinazione, e l'export in PDF del piano generato da Rocket per la distribuzione ai driver.

Un'altra funzionalità pianificata è quella dei **Template salvati**. L'idea è permettere al Captain di salvare l'intera configurazione di un run — destinazione di default, orario di call, tutti gli override di dipartimento, e la lista dei veicoli inclusi o esclusi — e richiamarla nei giorni successivi senza doverla reimpostare da zero. Questa funzionalità è particolarmente utile nelle produzioni con settimane di riprese che seguono schemi ricorrenti: la configurazione del lunedì è quasi sempre uguale a quella del lunedì precedente.

Il sistema è pensato su due livelli di persistenza. I template recenti vengono salvati automaticamente nel localStorage del browser: sono veloci da accedere, non richiedono autenticazione e bastano per il 90% dei casi d'uso quotidiani. I template permanenti, invece, vengono salvati su Supabase, rendendoli condivisibili tra dispositivi e utenti della stessa produzione, e sopravvivono alla pulizia della cache del browser. Allo Step 1, quando è presente almeno un template salvato, comparirà un banner in cima alla pagina che propone di ricaricare l'ultimo run usato con un click — accelerando ulteriormente il flusso mattutino.

Un'ulteriore funzionalità in prospettiva è la **Memoria storica**. Dopo alcune settimane di utilizzo reale, Rocket dispone di un archivio di run confermati che contiene pattern preziosi: quali dipartimenti viaggiano sempre insieme verso la stessa destinazione, quali veicoli vengono tipicamente associati a certi hotel, quali orari di call sono i più ricorrenti per ogni giorno della settimana. L'idea è che Rocket analizzi questi dati storici — direttamente da Supabase, senza nessun componente di intelligenza artificiale — e proponga allo Step 1 dei suggerimenti visivi basati su frequenza e media statistica: "Il lunedì, i reparti GRIP e ELECTRIC vanno sempre allo stesso orario — vuoi applicare la configurazione tipica?" oppure "VAN-03 è stato assegnato all'Hotel Meridian nelle ultime 8 settimane — includerlo di default?".

I suggerimenti sono deliberatamente non automatici: compaiono come hint visivi che il Captain può confermare o ignorare con un click, senza che nulla venga modificato senza il suo consenso esplicito. Questa scelta progettuale riflette il principio generale di Rocket, in cui l'automazione supporta il giudizio umano senza sostituirlo. La funzionalità diventa utile dopo almeno due o tre settimane di run reali, necessarie per costruire un campione statistico significativo.

---

## Perché si chiama Rocket

Il nome non è casuale. Nella terminologia interna del sistema, "lanciare Rocket" descrive l'azione di avviare il run mattutino: il bottone "🚀 Launch Rocket" segnala visivamente che si sta per mettere in moto un processo rapido e potente. L'emoji del razzo compare anche nella schermata di completamento, a confermare che tutto è andato a buon fine.

È anche un riferimento alla velocità: quello che prima richiedeva decine di minuti di lavoro manuale su un foglio di calcolo, Rocket lo fa in meno di un secondo.

---

*Documento generato il 28 marzo 2026 — basato sull'analisi del codice sorgente di CaptainDispatch (commit d87c3c2)*
