# CAPTAIN — Contesto Ridotto

**Aggiornato: 27 marzo 2026 (S7n — i18n TASK 2 ✅)**

---

> 🚀 **AZIONE IMMEDIATA: Quando leggi questo context, avvia subito `npm run dev` per testare in localhost!**

---

## 🎯 NEXT TASK — Multilingua i18n TASK 3

**Stato i18n:**
- ✅ TASK 1 COMPLETATA — Infrastruttura pronta
  - `lib/i18n.js` — traduzioni EN+IT + hook `useT()` + `LanguageProvider`
  - `app/providers.jsx` — client wrapper
  - `app/layout.tsx` — wrappa `{children}` con `<Providers>`
  - `lib/navbar.js` — toggle 🇬🇧 EN / 🇮🇹 IT funzionante
- ✅ TASK 2 COMPLETATA — Pagine CRUD principali (commit 202dec3)
  - `app/dashboard/crew/page.js` — `useT()` su `CrewSidebar` + `CrewPage` ✅
  - `app/dashboard/vehicles/page.js` — `useT()` su `VehicleSidebar` + `VehiclesPage` ✅
  - `app/dashboard/locations/page.js` — `useT()` su `LocationSidebar` + `LocationsPage` ✅
- 🔄 TASK 3 DA FARE — Trips + Coverage pages
- ⏳ TASK 4 — Pagine minori + deploy finale

**Da fare in TASK 3:**
Applica `useT()` su queste pagine — leggi ogni file prima di modificarlo:
1. `app/dashboard/trips/page.js` — TripSidebar, EditTripSidebar, TripsPage
2. `app/dashboard/pax-coverage/page.js` — label copertura, filtri, stati
3. `app/dashboard/hub-coverage/page.js` — stessa struttura di pax-coverage

**Pattern da seguire (uguale per tutti):**
```js
// 1. Import in cima al file:
import { useT } from '../../lib/i18n'  // (aggiusta il path relativo)

// 2. Dentro ogni componente che ha stringhe:
const t = useT()

// 3. Sostituisci stringhe hardcoded con chiavi t.*
// (vedi lib/i18n.js per tutte le chiavi disponibili)
```

**Regola IMPORTANTE:** Usa `replace_in_file` chirurgico. NON riscrivere interi file.

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

**Deploy:** `git add . && git commit -m "..." && git push origin master` → Vercel auto-deploy in ~1-2 min

> ⚠️ Il branch è **`master`** (non `main`)

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
| `/dashboard/locations` | Gestione locations + Google Places + Map Picker (S7n) ✅ |

**API completate:**
- `/api/auth/callback` — OAuth callback
- `/api/check-approval` — verifica approvazione login
- `/api/route-duration` — calcolo durata con traffico
- `/api/cron/arrival-status` — trigger 5min ARRIVAL→PRESENT
- `/api/cron/refresh-routes-traffic` — cron 5AM refresh rotte
- `/api/places/autocomplete` — proxy server-side → Google Places Autocomplete API
- `/api/places/details` — proxy server-side → Google Place Details API (ritorna lat/lng/address)
- `/api/places/map` — serve HTML page con Google Maps JS API (map picker interattivo)

---

## Pagine da Fare 🚧

| Pagina | Priorità | Note |
|--------|----------|-------|
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

## S7n — Google Places Autocomplete + Map Picker (27 marzo 2026)

### Locations Page — Nuove Feature

**`app/api/places/autocomplete/route.js`**
- Proxy server-side verso Google Places Autocomplete API (classic, NON "Places API New")
- Usa `GOOGLE_MAPS_API_KEY` da env — la chiave non appare mai nel client bundle
- Ritorna `[{ place_id, description, main_text, secondary_text }]`

**`app/api/places/details/route.js`**
- Proxy server-side verso Google Place Details API (`fields: geometry,formatted_address,name`)
- Ritorna `{ lat, lng, address, name }` dato un `place_id`

**`app/api/places/map/route.js`**
- Serve una pagina HTML completa con Google Maps JavaScript API (chiave iniettata server-side)
- Click su qualunque punto della mappa → pin animato (DROP) → reverse geocoding automatico
- `window.parent.postMessage({ type: 'MAP_PICK', lat, lng, address }, '*')` → invia dati alla sidebar
- `gestureHandling: 'greedy'` — necessario per scroll/zoom dentro `<iframe>` (altrimenti scroll intercettato dalla pagina parent)
- Switcher mappa/satellite/hybrid/terrain
- Query params: `?lat=XX&lng=YY` — se presenti, la mappa si apre centrata su quel punto (zoom 14)

**`app/dashboard/locations/page.js`**
- Campo "🔍 Cerca su Google Maps": debounce 400ms, dropdown con suggerimenti, auto-fill lat/lng/indirizzo al click
- Pulsante "🗺 Scegli posizione su mappa": apre modal fullscreen con iframe → map picker
- `postMessage` listener: quando `MAP_PICK` arriva → compila lat, lng, default_pickup_point nella sidebar
- Reset `mapOpen` all'apertura/chiusura sidebar
- Il campo **Nome** NON viene mai sovrascritto (utente mantiene controllo)

### ⚠️ Google Cloud Console — API da abilitare
Per il corretto funzionamento serve abilitare queste API nella Google Cloud Console:
- **Places API** (quella CLASSICA, NON "Places API (New)") → per autocomplete
- **Maps JavaScript API** → per map picker + zoom interattivo
- **Geocoding API** → per reverse geocoding (click su mappa → indirizzo)

**Env var richiesta:** `GOOGLE_MAPS_API_KEY` (su Vercel e `.env.local`)

### Build Fix S7n — useSearchParams senza Suspense
**Problema:** `useSearchParams()` in `app/dashboard/trips/page.js` senza `<Suspense>` causava build failure su Next.js 16, bloccando tutti i deploy.

**Fix applicato:**
- Rinominato componente principale in `TripsPageInner`
- Nuovo `export default function TripsPage()` wrappa `<TripsPageInner>` in `<Suspense fallback={null}>`
- Pattern da replicare su QUALSIASI pagina che usa `useSearchParams()`

---

## S7m — Multi-stop Bug Fixes (27 marzo 2026)

### BUG-1 FIX ✅ — Sibling pickup time mancante + editabile in sidebar

**Cosa è stato fatto:**

1. **`TripRow` multi-stop** — ogni leg ora mostra:
   - `🕐 HH:MM` se `pickup_min` è valorizzato
   - `⚠ no route` (badge arancione) se `pickup_min` è null (rotta non in DB)
   
2. **`EditTripSidebar`** — nuova sezione "🔀 SIBLING LEGS — PICKUP TIME":
   - Compare solo quando il trip è multi-stop (group.length > 1)
   - Per ogni sibling: mostra il percorso (Hotel X → Hub), input `duration_min` editabile
   - Preview PICKUP calcolato in real-time mentre si digita la durata
   - Badge `⚠ no route — duration unknown` se `pickup_min` è null e duration vuota
   - `sibDurations` state: `{[sib.id]: string}` — inizializzato dai valori DB, modificabile
   - Al salvataggio: `handleSubmit` usa `sibDurations[sib.id]` invece di `sib.duration_min`

**Workflow per fixare un sibling senza route in DB:**
1. Aprire EditTripSidebar sul trip multi-stop (badge 🔀 MULTI)
2. Sezione "SIBLING LEGS" mostra `⚠ no route` sul leg con pickup mancante
3. Inserire la durata manualmente nel campo "Duration (min)"
4. Preview PICKUP si aggiorna live
5. Cliccare "Save Changes" → `pickup_min` calcolato e salvato

**File:** `app/dashboard/trips/page.js`

---

### BUG-2 DEBUG ✅ — removePax: console.log + error handling esplicito

**Cosa è stato fatto:**

`removePax` ora:
1. **console.log** all'inizio: `[removePax] crew: ... | crew.trip_row_id: ... | initial.id: ... → targetTripId: ...`
2. **Error handling** sul primo DELETE (`trip_passengers`): se fallisce → `setError(msg)` + return
3. **console.log sibling check**: `[removePax] sibling check | siblingStillHasPax: ... | targetTripId: ...`
4. **Error handling esplicito** sul DELETE sibling trip: cattura `delTripErr` → `setError(...)` + return
5. **console.log** su sibling eliminato con successo

**Come usare il debug:**
- Aprire DevTools → Console
- Rimuovere un passeggero da un trip multi-stop
- Osservare i log per capire:
  - Se `targetTripId === initial.id` → il sibling non viene identificato correttamente (problema crew.trip_row_id)
  - Se `siblingStillHasPax: true` → altri pax rimasti (non dovrebbe succedere se era l'unico)
  - Se appare un errore → è RLS che blocca il DELETE → verificare policy su `trips`

**File:** `app/dashboard/trips/page.js` — funzione `removePax` in `EditTripSidebar`

---

## BUG ANCORA APERTI — Da verificare dopo test

### BUG-2 (parziale): Sibling non eliminato — causa ancora incerta
**Stato:** Debug aggiunto, causa non ancora confermata da test reale.

**Ipotesi principale (da verificare con i log):**
1. RLS su `trips` blocca il DELETE del sibling → verificare policy `trips` in Supabase
2. `crew.trip_row_id` non impostato → `targetTripId === initial.id` → la branch sibling non viene mai eseguita

**Se RLS blocca il DELETE:** Aggiungere policy su Supabase:
```sql
CREATE POLICY "Allow delete own production trips" ON trips
  FOR DELETE USING (production_id = current_setting('app.production_id', true)::uuid);
```
O in alternativa usare la service role key per le operazioni di delete.
## BUG APERTI — Da fixare nella prossima task

### BUG-1: Multi-stop DEPARTURE — pickup times uguali tra i leg
**Stato S7m:** ✅ Fix UI implementato. Nella lista trips ora appare `⚠ no route` badge sui leg senza pickup_min. Nella EditTripSidebar esiste la sezione "SIBLING LEGS" con input duration_min editabile e preview pickup live.

**Workflow per fixare un sibling senza rotta in DB:**
1. Aprire EditTripSidebar sul trip multi-stop
2. Sezione "🔀 SIBLING LEGS" mostra il leg con `⚠ no route — duration unknown`
3. Inserire la durata nel campo → preview PICKUP si aggiorna live
4. "Save Changes" → `pickup_min` calcolato e salvato su DB

**Root cause originale ancora aperta (a monte, in DB):**
- Se la rotta Hotel B → Hub non esiste in `routes`, il sibling viene creato con `pickup_min = null`
- Fix definitivo: aggiungere la rotta mancante in `routes` + editare la duration nel sidebar

---

### BUG-2: Sibling non eliminato — causa ancora incerta dopo debug
**Stato S7m:** Console.log e error handling aggiunti. Causa non ancora confermata da test reale.

**Come debuggare:**
1. Aprire DevTools → Console
2. Aprire EditTripSidebar su un trip multi-stop
3. Rimuovere l'unico passeggero del sibling leg
4. Osservare i log `[removePax]`:
   - `targetTripId === initial.id` → `crew.trip_row_id` non impostato → bug in loadPaxData
   - `siblingStillHasPax: true` → ci sono altri pax (inatteso)
   - Errore visibile in UI → è RLS che blocca il DELETE trips

**Se RLS blocca il DELETE:** In Supabase SQL Editor:
```sql
CREATE POLICY "Allow delete own production trips" ON trips
  FOR DELETE USING (production_id = current_setting('app.production_id', true)::uuid);
```
(sostituire con la policy corretta per il progetto)

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
[ ] SIBLING SEQUENTIAL ROUTING — calcolo pickup sequenziale per DEPARTURE multi-PKP
    Problema: il sistema calcola i pickup dei sibling in modo INDIPENDENTE (ogni hotel→hub
    diretta), NON sequenziale (Hotel A → Hotel B → Hub). Questo causa pickup identici quando
    due hotel sono equidistanti dall'hub ma separati da qualche minuto tra loro.
    
    Esempio: Hotel A = 30 min da APT, Hotel B = 30 min da APT, ma A→B = 5 min.
    - Sistema attuale: A pickup = call-30, B pickup = call-30 → UGUALI ❌
    - Corretto: B pickup = call-30 = 07:30, A pickup = 07:30 - 5 = 07:25 ✓
    
    Soluzioni possibili:
    1. Routes OPERATIVE: popolare routes con durations che includono le deviazioni tipiche
       (es. Hotel A → APT = 35 min perché include fermata a Hotel B lungo il percorso)
    2. Override manuale: ri-aggiungere SIBLING LEGS UI nell'EditTripSidebar con input
       duration_min per ogni leg (state sibDurations rimosso in S7m — va rimesso)
    3. Routing sequenziale auto: quando si crea un sibling DEPARTURE, query la rotta
       Hotel A → Hotel B + stagger i pickup in sequenza (richiede inter-hotel routes in DB)
    
    File: app/dashboard/trips/page.js — handleAddToExisting + EditTripSidebar
    Nota: attualmente se hotels equidistanti → pickup identici è matematicamente CORRETTO
    per i dati in DB. Nessun bug nel codice, solo limitazione architetturale.
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
