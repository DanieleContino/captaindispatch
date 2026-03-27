# CAPTAIN — Contesto Ridotto

**Aggiornato: 27 marzo 2026 (S7l)**

---

> 🚀 **AZIONE IMMEDIATA: Quando leggi questo context, avvia subito `npm run dev` per testare in localhost!**

---

## Stack Tecnico

```
Next.js 16.2.1 (App Router, JavaScript)
Supabase (PostgreSQL + Auth + Realtime)
Vercel (hosting)
GitHub: DanieleContino/captaindispatch
```

**Credenziali:**
- GitHub: DanieleContino (email: danielsanuk@googlemail.com)
- Vercel: danielecontino
- Supabase: captaindispatch (Project ID: lvxtvgxyancpegvfcnsk, West EU)

**Deploy:** `git add . && git commit -m "..." && git push origin main` → Vercel auto-deploy in ~1-2 min

> ⚠️ **REGOLA OBBLIGATORIA: fare deploy dopo OGNI modifica ai file.**
> Il deploy su Vercel Hobby Plan è **gratuito e illimitato**.
> Senza deploy, le modifiche esistono solo in locale e non appaiono su captaindispatch.com.

---

## Pagine Completate ✅

| Pagina | Stato |
|--------|-------|
| `/login` | OAuth Google funzionante |
| `/dashboard` | Card arrivi/partenze + alert |
| `/dashboard/fleet` | Fleet Monitor realtime |
| `/dashboard/trips` | Multi-stop indicators (S7) |
| `/dashboard/crew` | Anagrafica + Travel_Status |
| `/dashboard/vehicles` | Fleet con pax_suggested/max |
| `/dashboard/rocket` | Rocket Trip Generator v2 (LIVE) |
| `/wrap-trip` | App mobile 4-step (LIVE) |
| `/pending` | Approvazione login con polling |
| `/dashboard/lists` | Transport Lists print-optimized (S7d) |
| `/dashboard/pax-coverage` | Pax Coverage + Assign integration (S7l) ✅ |

**API completate:**
- `/api/auth/callback` — OAuth callback
- `/api/check-approval` — verifica approvazione login
- `/api/route-duration` — calcolo durata con traffico
- `/api/cron/arrival-status` — trigger 5min ARRIVAL→PRESENT
- `/api/cron/refresh-routes-traffic` — cron 5AM refresh rotte

---

## Pagine da Fare 🚧

| Pagina | Priorità | Note |
|--------|----------|-------|
| `/dashboard/locations` | P2 | Gestione locations + coordinate |
| `/dashboard/hub-coverage` | **P1** | Copertura hub — stessa Assign integration di pax-coverage |
| `/dashboard/pax-coverage` | ✅ DONE S7l | Completata con Assign integration |
| `/dashboard/reports` | P2 | Fleet reports |
| `/dashboard/qr-codes` | P2 | Generazione QR |
| `/dashboard/productions` | P2 | Multi-produzione |
| `/scan` | P3 | Scanner QR |

---

## Rocket Trip Generator v2 — Algoritmo

**Input:** crew PRESENT + CONFIRMED, veicoli attivi, routeMap, globalDestId, globalCallMin, deptDestOverrides, crewCallOverrides, excludedVehicleIds

**Logica:**
1. Per ogni crew: calcola `effectiveDest` e `effectiveCallMin` (priorità: crew override → dept override → global)
2. Raggruppa per (hotel_id, effectiveDest, effectiveCallMin)
3. Ordina crew per dept, poi nome
4. Assegna greedy fino a `pax_suggested`, overflow → CAN_ADD, no vehicle → NO_VEHICLE
5. Trip ID: `R_MMDD_NN` (singolo) / `R_MMDD_NNA`, `R_MMDD_NNB` (multi-stop)

**Bug fix S7:**
- travel_status: query crew usa solo PRESENT (non IN/OUT)
- Phantom unassigned trip cards: bordo rosso + "NO VEHICLE — use Move ›"
- TripCard null guard: vehicle null non crasha
- handleConfirm: salta trip senza veicolo
- MoveCrewModal: filtra trip unassigned

---

## Trips Page — Multi-Stop Indicators (S7)

**Problema:** Trip Rocket multi-stop (es. `R_0326_01A` + `R_0326_01B`) apparivano separati.

**Soluzione:**
- Helper `baseTripId(id)` — strip lettera finale
- Raggruppamento per `baseTripId + vehicle_id`
- Badge 🔀 MULTI-PKP (arancione) e 🔀 MULTI-DRP (viola)
- Route column espansa: leg-by-leg con pickup time e pax count
- TIME mostra pickup più presto del gruppo

**S7g — Rimozione colonna Trip ID (27 marzo 2026):**
- Colonna Trip ID rimossa dalla lista principale (griglia: 6→5 colonne)
- Al suo posto rimangono solo i badge classe (ARR/DEP/STD), MULTI-PKP/MULTI-DRP e status
- Trip ID ancora visibile nell'header della sidebar di edit

---

## Database Supabase — Schema

```sql
productions, user_roles, locations (is_hub bool), routes (duration_min, google_duration_min, traffic_updated_at),
crew (hotel_id, travel_status, hotel_status, arrival_date, departure_date, department),
vehicles (capacity, pax_suggested, pax_max, driver_name, sign_code, active),
trips (pickup_id, dropoff_id, call_min, pickup_min, start_dt, end_dt, service_type, status),
trip_passengers, service_types

RLS abilitato su tutte le tabelle
```

---

## Decisioni Importanti

### Transfer_Class
```
pickup = HUB → ARRIVAL
dropoff = HUB → DEPARTURE
nessun HUB → STANDARD
```

### Calcolo Tempi Trip
```
ARRIVAL:  Call = Arr_Time, Pickup_Time = Call (driver già all'hub)
DEPARTURE: Call = Arr_Time - 120min, Pickup_Time = Call - Duration
STANDARD: Call manuale, Pickup_Time = Call - Duration
ROCKET: Call = effectiveCallMin, Pickup_Time = Call - Duration
```

### Travel_Status Crew
```
IN = crew in arrivo (ARRIVAL trip)
OUT = crew in partenza (DEPARTURE trip)
PRESENT = default

Automazioni:
- Trigger 5min: ARRIVAL completato → IN → PRESENT
- onOpen: Departure_Date = domani → dialog OUT
- Manuale VINCE sempre sull'automatico
```

### Login Approval System (S7c)
- Installato `nodemailer` per Gmail SMTP
- `lib/sendLoginNotification.js` — invia email notifica
- `app/auth/callback/route.js` — verifica ruolo in `user_roles`
- Se approvato → `/dashboard`, se no → `/pending` (polling 3sec)
- Env vars: `GMAIL_USER`, `GMAIL_APP_PASSWORD`, `ADMIN_EMAIL`
- ⚠️ TODO: Aggiungere env vars su Vercel Dashboard

### Transport Lists Print-Optimized (S7e)
- Layout unificato landscape: una sola tabella compatta per tutte le pagine
- Stampa A4 landscape con `@page { size: A4 landscape; margin: 8mm; }`
- 7 colonne: TIME | CALL | VEHICLE | DRIVER | ROUTE & CREW | PAX | CAP
- Multi-stop evidenti: badge 🔀 MULTI in arancione con numero fermate
- Ogni fermata indentata con → e nomi passeggeri in font 7px
- Colori sezione: bordo sinistro su ogni riga (blu TRANSPORT, verde ARRIVALS, arancione DEPARTURES)
- Font 9px, spacing ottimizzato, tutto su un foglio singolo
- Supporta 50+ trip mantenendo leggibilità

**S7h — Flight Info Display (27 marzo 2026):**
- Badge ✈️ con numero volo e orario arrivo nella colonna ROUTE & CREW
- Mostrato SOLO per trip ARRIVAL/DEPARTURE con dati `flight_no` o `arr_time`
- Colori distintivi: blu (#dbeafe) per ARRIVAL, arancione (#fed7aa) per DEPARTURE
- Formato: `✈️ LH456 @14:30` — compatto e leggibile
- Posizionato sopra le info route, non aggiunge colonne extra
- Compatibile con stampa A4 landscape

**S7h — Bug Fix: Object Rendering Error (27 marzo 2026):**
- **Problema:** Runtime error "Objects are not valid as a React child" in Transport Lists
- **Causa:** `locsMap` memorizza oggetti `{name, pickup_point}` ma il codice tentava di renderizzarli direttamente come children React
- **Fix:** Aggiunto type checking `typeof loc === 'object'` prima di accedere alle proprietà
- **Aree corrette:**
  - `pickupName` — estrae `.name` da oggetto location
  - `hubTerminal` — estrae `.pickup_point` da oggetto location
  - `fromName`/`toName` in multi-stop — gestisce oggetti location
  - Passenger list location names — estrae `.name` da oggetti
  - Single-stop dropoff — gestisce oggetti location
- **Pattern:** `const loc = locsMap[id]; const name = typeof loc === 'object' ? loc.name : loc || id || '–'`

**S7i — Terminal Display Fix (27 marzo 2026):**
- **Problema:** Il campo `terminal` inserito nei trip ARRIVAL/DEPARTURE non appariva nelle Transport Lists stampabili
- **Causa:** La funzione `groupByTripId` non preservava il campo `terminal` dal database e `TripTableRow` cercava erroneamente `meeting_point` o `pickup_point` invece di usare `trips.terminal`
- **Fix:** 
  - Aggiunto campo `terminal` nel mapping della funzione `groupByTripId`
  - Cambiato `const hubTerminal = group.terminal` per usare direttamente il valore dal database
  - Accumulazione del campo terminal nei trip multi-stop
- **Risultato:** Il terminal ora appare correttamente con icona 📍 dopo il badge volo nei trip hub (es. "T1", "T2", "Arrivi Nord")

**S7j — Header Compatto 2 Colonne + Footer Fisso (27 marzo 2026):**
- **Problema:** Header occupava troppo spazio verticale (120px) con info contatti su 2 righe separate, priorità visiva sbagliata
- **Soluzione:** Layout a 2 colonne (60-40 split)
  - Colonna SX (60%): Logo + nome produzione + info documento + General Call in grande (priorità alta)
  - Colonna DX (40%): Box contatti compatto grigio chiaro con 7 ruoli (font 9px, leggibile su A4 landscape)
  - Set bar in fondo con icone 🎬 Set e 🏕 Basecamp
- **Footer fisso:** `position: sticky; bottom: 0` + `marginTop: auto` per restare sempre in fondo alla pagina
- **Risultato:** Header ridotto a ~70px (-42% spazio) = 10-15 trip extra visibili per schermo
- **Formato stampa:** Rimasto A4 landscape (mai cambiato)

**S7k — Transport Lists Refinement: Layout Preciso + Compattezza (27 marzo 2026):**
- **Problemi identificati:**
  1. Imprecisione calcoli grid: 60/40 usato invece di 70/30 richiesto
  2. Abbreviazioni ruoli (Dir:, Pro:, PM:, TC:, Cap:) riducevano leggibilità
  3. Ruoli vuoti mostrati con "–" occupavano spazio inutilmente
  4. Single-stop trip: route e passengers su righe separate = spreco spazio verticale
- **Soluzioni implementate:**
  1. **Header 70/30 PRECISO**: `gridTemplateColumns: '7fr 3fr'` invece di `2.33fr 1fr` (errore)
  2. **Ruoli completi**: Director, Producer, Production Manager, Production Coordinator, Transport Coordinator, Captain, Office
  3. **Logica condizionale**: `{prod.director && <div>Director: {prod.director}</div>}` — mostra SOLO ruoli compilati
  4. **Single-stop compatto**: route + passengers inline su 1 riga (`Hotel NH → Airport · Crew1, Crew2, Crew3`)
  5. **Multi-stop invariato**: rimane su 2 righe (legs + passengers per hub)
- **Lessons learned:**
  - **Precisione nei calcoli CSS**: Usare unità `fr` esatte (es. `7fr 3fr` per 70/30) invece di calcoli decimali approssimati
  - **Verificare SEMPRE i valori numerici esatti** richiesti dall'utente prima di implementare
  - **Conditional rendering**: Non mostrare campi vuoti con placeholder "–" se occupano spazio prezioso
  - **Compattezza orizzontale**: Inline layout (`flexWrap: 'wrap'`) per informazioni correlate riduce altezza totale
- **Risultato:** Layout preciso, ruoli leggibili, spazio verticale ottimizzato per massima densità informativa su A4 landscape

### S7l — Pax Coverage + Assign Integration (27 marzo 2026) ✅

**Pagina:** `/dashboard/pax-coverage`

**Funzione:** Per una data selezionata, mostra TUTTI i crew CONFIRMED divisi in:
- ✅ WITH ASSIGNED TRANSFER — hanno almeno un trip in `trip_passengers`
- ❌ WITHOUT TRANSFER — non hanno nessun trasferimento quella data

**Filtri:** Travel Status (IN/PRESENT/OUT), Department, Hotel, search bar, toggle ASSIGNED/UNASSIGNED/ALL

**Summary bar:** Progress bar copertura % + contatori totale / con transfer / senza transfer

**Pulsante `+ Assign`** su ogni crew senza transfer → naviga a `/dashboard/trips` con params:
```
?assignCrewId=<uuid>
&assignCrewName=<nome>
&assignHotelId=<location_id>
&assignTS=<IN|OUT|PRESENT>
&assignDate=<YYYY-MM-DD>
```

---

### Pattern Assign: Coverage → Trips (S7l)

**Implementato in trips/page.js — da replicare su hub-coverage:**

1. **`useSearchParams`** legge i 5 parametri URL all'apertura
2. **`assignCtx` state** `{id, name, hotel, ts}` attivo finché l'utente non clicca "dismiss"
3. **`suggestedBaseIds` useMemo** — filtra trips compatibili per hotel + ts:
   - `ts === 'IN'` → `transfer_class === 'ARRIVAL' && dropoff_id === hotel`
   - `ts === 'OUT'` → `transfer_class === 'DEPARTURE' && pickup_id === hotel`
   - `ts === 'PRESENT'` → `transfer_class === 'STANDARD' && pickup_id === hotel`
4. **Banner amber** in cima al contenuto — mostra nome, status, n° trip suggeriti o "No compatible trips"
5. **TripRow highlight** — `isSuggested` prop: sfondo `#fffbeb`, bordo `#f59e0b`, badge ⭐ MATCH
6. **Auto-open TripSidebar** se `suggestedBaseIds.size === 0` (nessun trip compatibile)
7. **TripSidebar contestuale** riceve `assignCtx`:
   - Header mostra `👤 {assignCtx.name}` in giallo
   - Pre-popola pickup/dropoff con `hotel` in base a `ts` (IN→dropoff, OUT/PRESENT→pickup)
   - Auto-seleziona il crew nella lista passengers quando pickup+dropoff matchano

**File:** `app/dashboard/trips/page.js` — tutto self-contained, zero API aggiuntive

---

### Navbar Unificata (S7f) ✅ COMPLETA
- Componente `Navbar` in `lib/navbar.js` riutilizzabile su tutte le pagine
- NAV_ITEMS esportato per coerenza globale
- ✅ Migrata su tutte le pagine
- Pattern: `<Navbar currentPath="/dashboard/xxx" />` sostituisce hardcoded nav header

---

## BUG APERTI — Da fixare nella prossima task

### BUG-1: Multi-stop DEPARTURE — pickup times uguali tra i leg
**Flusso:** hub-coverage → Assign → Trips → "Add to Existing Trip" (hotel diverso) → crea sibling T001B

**Sintomo:** T001A (Hotel NH → Aeroporto) e T001B (Hotel Marriott → Aeroporto) mostrano lo stesso orario di pickup nella colonna ROUTE della lista trips.

**Root cause già indagato:**
- `sibRoute` lookup in `handleAddToExisting` cerca `routes WHERE from_id=Hotel_B AND to_id=Hub`
- Se la rotta NON esiste in `routes` → `sibDurationMin = null` → `sibCalc = null` → `pickup_min = null`
- In `TripRow` multi-stop: `r.pickup_min ?? r.call_min` → cade back su `call_min` (uguale per tutti i leg) → stesso orario

**Fix da implementare:**
1. Verificare se la rotta Hotel B → Hub esiste in `routes` (è il check principale)
2. Se non esiste: mostrare warning nella UI "⚠ Route not found — duration unknown" con badge arancione sul leg nel display TripRow
3. Aggiungere campo `duration_min` editabile nel multi-stop leg della EditTripSidebar per i sibling (attualmente il form edita solo `initial` = primo leg)
4. Quando si salva la duration dal form del sibling → ricalcola `pickup_min` del sibling

**File:** `app/dashboard/trips/page.js`
- `handleAddToExisting` (TripSidebar) — creazione sibling
- `TripRow` — display multi-stop legs con pickup time
- `EditTripSidebar` — allow editing sibling leg's duration_min

---

### BUG-2: Multi-stop — eliminare passeggero non rimuove il sibling/badge
**Flusso:** Apri EditTripSidebar su un trip multi-stop → rimuovi l'unico passeggero del sibling leg → sibling rimane visibile con hotel e badge MULTI-PKP

**Sintomo verificato:** Dopo removePax, `loadTrips` ricarica, ma il sibling trip T001B persiste nella lista (il badge MULTI-PKP e l'hotel rimangono).

**Tentativo di fix già applicato (non ha funzionato):**
- Aggiunto `useEffect([trips])` in TripsPage che ricalcola `editTripGroup`
- La logica di cleanup in `removePax` dovrebbe già eliminare il sibling se 0 pax

**Ipotesi ancora da verificare:**
1. La RLS policy su `trips` potrebbe bloccare il DELETE del sibling
2. `targetTripId` potrebbe essere uguale a `initial.id` per qualche motivo (crew.trip_row_id non impostato correttamente)
3. Il sibling potrebbe avere altri trip_passengers non visibili nel gruppo corrente

**Debug suggerito:** Aggiungere `console.log('removePax targetTripId:', targetTripId, 'initial.id:', initial.id)` per verificare che il sibling venga identificato correttamente prima del delete.

**File:** `app/dashboard/trips/page.js` — funzione `removePax` in `EditTripSidebar`

---

## TODO — Priorità

### P1
```
[ ] /dashboard/hub-coverage — Copertura hub per data
    Stessa struttura di pax-coverage ma per HUB (aeroporti/stazioni):
    - Mostra tutti i trip ARRIVAL/DEPARTURE per hub + data
    - Per ogni trip: quanti pax assegnati vs capacità veicolo
    - Trip under-capacity (posti vuoti) evidenziati
    - Pulsante "+ Assign" su pax non assegnati → stesso pattern Assign → trips/page.js
    - Eventuale "Add more crew" su trip con posti disponibili
    NOTA: riusa esattamente lo stesso pattern assignCtx già funzionante in trips/page.js
```

### P2
```
[ ] Crew page — edit Travel_Status in-row
[ ] Multi-produzione (production switcher)
[ ] Rocket — Step 2: durata stimata per ogni trip
```

### P3
```
[ ] Rocket — quick-reason esclusione veicolo
[ ] Rocket — service type per destinazione
[ ] Rocket — export PDF pianificazione
[ ] Production View (report-only)
[ ] Notifiche push PWA
[ ] Dark mode
```

---

## Regole Fondamentali

```
❌ NON usare getDisplayValues() per coordinate → getValues()
❌ NON hardcodare coordinate nelle funzioni Maps
❌ NON usare deleteRow() in loop → bulk rewrite
❌ NON modificare rotte Source=MANUAL negli script
❌ NON impostare "Reject input" su Service_Type → "Show warning"
❌ NON copiare conditional formatting nel template
❌ NON fare rebuild completo nel trigger onEdit
❌ NON hardcodare numeri di colonna → getHeaderMap_()
❌ NON usare coordinate terminal aeroportuale per ORS
❌ NON sovrascrivere Travel_Status manuale con automazioni
❌ NON includere crew IN/OUT in run Rocket STANDARD
❌ NON crashare TripCard se vehicle è null → null guard obbligatorio
❌ NON riscrivere interi file per aggiustamenti o variazioni → chirurgia con replace_in_file
✅ Agire SEMPRE chirurgicamente: modifica SOLO le righe/sezioni necessarie
✅ Usare replace_in_file con blocchi SEARCH/REPLACE precisi, mai write_to_file su file esistenti
```

---

## Preferenze Lavoro con Cline

- Vai avanti senza chiedere conferma a ogni passo
- Fermati solo se trovi qualcosa di genuinamente strano
- Leggi SEMPRE il codice esistente prima di modificarlo
- Analizza i dati reali prima di scrivere codice
- Spiega decisioni importanti ma sii conciso
- JavaScript (non TypeScript), Tailwind CSS, App Router
- Usa `claude-sonnet-4-6` con thinking per problemi complessi
- Manuale VINCE sempre sull'automatico per Travel_Status

### Workflow Localhost (27 marzo 2026)
- **All'inizio di ogni task**: avviare `npm run dev` per testare modifiche in tempo reale
- Server locale su `http://localhost:3000` con hot reload automatico
- Testare sempre le modifiche su localhost prima del deploy
- Comando: `npm run dev` → attende in background, aggiorna automaticamente al salvataggio file
