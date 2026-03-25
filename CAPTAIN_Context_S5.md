# CAPTAIN — Contesto Completo S5
## Per uso in Cline (VS Code) con claude-sonnet-4-6 + thinking
## Aggiornato: sessione 24 marzo 2026 (S5)
## Sostituisce tutti i documenti S4

---

## 1. CHI SEI E COSA FAI

Sei **Daniele Contino**, Transportation Coordinator di una produzione americana grande (film/TV/teatro itinerante). Lavori a Palermo, Sicilia. Hai costruito da zero il sistema **CAPTAIN** su Google Sheets + Apps Script per gestire tutti i transfer del personale.

**Non sei uno sviluppatore** — sei un operativo che ha imparato a costruire il suo strumento. Lavori con max 2 utenti simultanei sul foglio. La produzione è attiva da marzo 2026.

**Google Sheets configurato in italiano** — separatore decimale = virgola. CRITICO per le coordinate lat/lng.

---

## 2. I DUE SISTEMI IN PARALLELO

### Sistema A — CAPTAIN (Google Sheets + Apps Script)
Il sistema operativo attuale — usato ogni giorno in produzione.
- **File:** 11 file `.gs` + 8 file `.html`
- **Gestione:** Apps Script Editor nel browser
- **Tool:** CLASP (da configurare) per lavorare da VS Code
- **Stato:** STABILE e in produzione

### Sistema B — CaptainDispatch (Web App)
Il prodotto commerciale in costruzione — sarà il futuro.
- **Stack:** Next.js 16.2.1 + Supabase + Vercel
- **Dominio:** captaindispatch.com (registrato su Aruba)
- **Repo:** `C:\Users\WKS\Desktop\captaindispatch`
- **Stato:** LOGIN FUNZIONANTE, dashboard base completata

---

## 3. CAPTAIN — ARCHITETTURA GOOGLE SHEETS

### Fogli FRONTEND (visibili, modificati manualmente)
| Foglio | Scopo |
|--------|-------|
| Trips | Foglio centrale — un trip per riga, multi-dropoff con stesso Trip_ID |
| Crew_Master | Anagrafica crew — Hotel_ID, Hotel_Status, Travel_Status, Arrival_Date, Departure_Date |
| Fleet | Veicoli — Driver_Name, Sign_Code, Capacity, Unit_Default |
| Hotels | Location NON-hub (hotel, set, basecamp) + coordinate lat/lng |
| Hubs | Aeroporti, porti, stazioni (prefisso APT_, STN_, PRT_) + coordinate |
| Routes | Durate tra location — Source: ORS/AUTO/MANUAL |
| Lists | Dropdown config: Unit(A), Service_Type(B), Status(C), Vehicle_Type(D), Locations(E) |

### Fogli BACKEND (nascosti, gestiti dagli script)
| Foglio | Scopo |
|--------|-------|
| Trip_Passengers | DB assegnazioni pax ↔ trip row |
| TS_PaxIndex | Indice denormalizzato per conflict detection |
| DV_Passengers | Cache dropdown per sidebar Pax Assignment |
| Trips_History | Archivio storico trip (Fleet Reports) |
| Trips_Template | Template per reset giornaliero |
| TS_Log | Log operazioni sistema |

### Fogli REPORT (nascosti, generati dagli script)
| Foglio | Scopo |
|--------|-------|
| Fleet_Report_Daily | Lavoro driver per giorno |
| Fleet_Report_Weekly | Lavoro driver per settimana |
| HUB_Report_Weekly | Hub transfers per settimana |
| Transport_List | Transport list MAIN+SECOND |
| SECOND_List | Transport list SECOND (nascosta auto) |
| TRAVEL_AIRPORT_List | Transport list aeroporti/hub |
| QR_Crew_Print | Badge QR crew per stampa (3 per riga) |

---

## 4. CAPTAIN — FILE APPS SCRIPT

### 00_Config.gs
- `CFG` — configurazione globale completa
- `getHeaderMap_(sh)` — UNICA funzione header map del progetto
- `getRealLastTripRow_()`, `getRealLastCrewRow_()`, `getRealLastPaxRow_()`
- `isTripRowMeaningful_()` — esclude righe template vuote
- `toDateSafe_()`, `toTimeMinutes_()`, `combineDateAndMinutes_()`
- `isHubId_()`, `getTransferClass_()`, `sameDay_()`, `dayKey_()`
- `parseCoordinate_()` — gestisce sia punto che virgola come decimale
- `withDocLock_()` — lock documento per operazioni critiche
- `TS_log_()`, `tsHealthCheck()`

### 01_Crew.gs
- Cache crew: `TS_buildCrewCache_()`, `TS_getCrewCache_()`, `TS_refreshCrewCache_()`
- Cache TTL 10 min, invalidazione immediata su edit
- `resolveCrewFromTripPassenger_()`, `TS_resolveCrewByPassengerName_()`
- QR codes: `tsGenerateQRCodes()`, `_buildQRUrl_()` (usa `api.qrserver.com`)
- `tsPrintCrewQRSheet()` → foglio `QR_Crew_Print`
- **NUOVO S5:** `tsAutoUpdateTravelStatusOnArrival()` — trigger 5min ARRIVAL→PRESENT
- **NUOVO S5:** `tsCheckDeparturesTomorrow()` — alert onOpen partenze domani
- **NUOVO S5:** `tsSetupArrivalTrigger()` — installa trigger temporale
- **NUOVO S5:** `tsSetupCrewDateColumns()` — aggiunge Arrival_Date + Departure_Date + CF

### 02_Trips.gs
- `calculateTripTimesSingleRow_()` — calcola Call/Pickup_Time/Start_DT/End_DT
- ARRIVAL: `Pickup_Time = Call` (FIX S4 — driver già all'hub)
- DEPARTURE: `Call = Arr_Time - 120min`, `Pickup_Time = Call - Duration`
- STANDARD: Call manuale, `Pickup_Time = Call - Duration`
- `syncVehicleDataFromFleet_()`, `getNormalizedPassengersForTripRow_()`
- `tsCreateTripsTemplate()`, `TS_resetTripsFromTemplate_()`
- `refreshTripsAffectedByCrewChange_()` — bulk rewrite (non deleteRow)

### 03_Routes.gs
- `findCoordsInSheet_()` — usa `getValues()` NON `getDisplayValues()` (FIX S4)
- `estimateMinByIds_()` — Haversine con fattori correzione (fallback)
- `syncRoutesFromLocations_()` — auto-sync quando Hotels/Hubs cambia
- `recalculateAutoRoutes_()` — ricalcola solo Source=AUTO
- `tsFixLatLngFormat()` — riscrive coordinate come numeri puri
- `tsTestCoordinates()` — diagnostica coordinate e distanze Haversine

### 04_Conflicts.gs
- `TS_PAX_INDEX` IIFE: `rebuild()`, `rebuildForTripRow_()`
- `TS_buildPaxConflictFlagsMap_()`, `TS_recomputePaxConflicts_()`
- Conflict detection: stesso crew su due trip sovrapposti

### 05_Lists.gs
- `tsGenerateLists()` → `tsGenerateListsForRange(fromStr, toStr)`
- `_buildTransportList_()`, `_buildTravelList_()`
- `tsExportAndEmail()` — PDF su Google Drive (`CAPTAIN/Lists/`)

### 06_Triggers.gs
- `onOpen()` — chiama `tsCheckDeparturesTomorrow()` + menu CAPTAIN e CAPTAIN Tools
- `tsOnEditInstallable()` — trigger principale onEdit
- `_handleCrewMasterEdit_()` — watched: Hotel_ID, Hotel_Status, Travel_Status, **Arrival_Date, Departure_Date** (NUOVO S5)
- `_handleTripsEdit_()` — watched: tutti i campi critici Trips
- `tsSetupEnterprise()`, `tsFullRefresh()`
- **Menu CAPTAIN:** Health Check, Vehicle Availability, Pax Assignment, New Pax Assignment, Hub Coverage, Fleet Monitor, Generate Lists, Export PDF, Archive, Reset
- **Menu CAPTAIN Tools:** QR Codes, Print QR, Wrap Trip, **Setup Crew Date Columns (NUOVO S5)**, **Setup Arrival Trigger (NUOVO S5)**, Refresh Routes, Rebuild Pax, Full Refresh

### 07_FleetReports.gs
- `refreshFleetDailyReportFromSheetDate()`, `refreshFleetWeeklyReportFromSheetDate()`
- `refreshHubWeeklyReportFromSheetDate()`
- Legge da `Trips_History`

### 08_Sidebars.gs
- Vehicle Availability: `openVehicleAvailabilitySidebar()`
- Pax Assignment: `openPaxAssignmentSidebar()`, `openNewPaxAssignmentSidebar()`
- Hub Coverage: `openHubCoverageAssistant()`
- Fleet Monitor: `openFleetMonitor()` — **NUOVO S5: implementato (non più stub)**
- **NUOVO S5:** `getFleetOverviewData(targetDateStr)` — dati Fleet Monitor live
- **NUOVO S5:** `_fleetFmtTime_()` — formatta orari per Fleet Monitor
- **NUOVO S5:** `assignVehicleFromSidebar()` — chiama `syncVehicleDataFromFleet_()` dopo setValue

### 09_WrapTrip.gs
- `doGet(e)` — serve WrapTripApp.html
- `resolveQR(code)` — risolve `CR:CRID` o `VH:VID` in dati completi
- `createWrapTrip(tripData)` — crea trip da mobile
- `_createWrapTripLocked_()` — ARRIVAL: Pickup_Time=Call (FIX S4)
- `getWrapTripFormData()` — **NUOVO S5: legge serviceTypes da Lists!B**
- Trip_ID formato: `W_HHMMSS`
- **NUOVO S5:** `confirmTimestamp` dal client (orario reale click Confirm)
- **NUOVO S5:** Pickup_Time STANDARD = Call (non Call-Duration)
- **NUOVO S5:** Call vuota per STANDARD
- **NUOVO S5:** serviceType dal payload

### 10_Maps.gs
- `getOrsRouteDuration_(lat, lng, lat, lng)` — chiamata ORS singola
- `tsTestMapsApi()` — test 4 rotte dal foglio
- `tsDebugOrsApi()` — risposta raw ORS APT_PMO→H001
- `tsRecalculateRoutesWithMaps()` — aggiorna tutte le rotte AUTO
- `_buildCoordsMap_(ss)` — mappa coordinate da Hotels+Hubs (usa `getValues()`)

---

## 5. FILE HTML

### WrapTripApp.html
- App mobile 4 step: Trip Details → Vehicle → Passengers → Confirm
- **NUOVO S5:** pulsante Fleet Monitor in header
- **NUOVO S5:** schermata Fleet mobile completa
- **NUOVO S5:** pulsante Cancel Trip (step 2/3/4)
- **NUOVO S5:** Service Type selector
- **NUOVO S5:** timestamp reale al click Confirm
- **NUOVO S5:** fix script tag zxing (era dentro tag src)
- QR scan con ZXing (camera nativa Samsung)
- `localStorage` persiste stato tra scansioni

### FleetMonitor.html — **NUOVO S5 (file creato da zero)**
- Modal Fleet Monitor per Google Sheets
- Carica dati via `google.script.run.getFleetOverviewData()`
- NO payload inline (evita SyntaxError)
- Mostra status BUSY/FREE/IDLE con ETAs e barre progresso
- Badge "IN CORSO" / "✓" per trip completati

### DateRangeDialog.html
- Dialog selezione date per generazione Transport Lists

### VehicleAvailabilitySidebar.html
- Sidebar disponibilità veicoli per finestra oraria

### PaxAssignmentSidebar.html
- Sidebar assignment passeggeri (versione legacy)

### NewPaxAssignmentSidebar.html
- Sidebar assignment passeggeri (versione nuova)
- Sezione BUSY — da completare

### HubCoverageAssistant.html
- Assistente copertura hub per ARRIVAL/DEPARTURE

---

## 6. DATI LIVE PRODUZIONE PALERMO

### Crew (14 crew, tutti CONFIRMED)
```
CR0001-CR0014
Hotel H002 NH Hotel: 9 crew
Hotel H004 Hotel Borsa: 2 crew
Hotel H005 Astoria: 2 crew
Hotel H001 Palme Hotel: 1 crew
```

### Fleet
```
VAN-01  Van  6 pax   Marco      GRIP1
CAR-01  Car  4 pax   Luca       PROD1
BUS-20  Bus  20 pax  Giulia     UNITSHUTTLE 1
CAR-02  Car  4 pax   Guglielmo  PROD2
VAN-02  Van  6 pax   Ale        GRIP2
BUS-50  Bus  50 pax  Massi      UNITSHUTTLE 2
```

### Hotels — coordinate verificate
```
H001  Palme Hotel   38.124084  13.359350
H002  NH Hotel      38.115723  13.374999
H003  Politeama     38.125128  13.356576
H004  Hotel Borsa   38.116827  13.365295
H005  Astoria       38.139609  13.357491
H006  Excelsior     38.125128  13.356576
B_1   BaseCamp      38.125128  13.356576
SET_1 SET_1         38.139609  13.357491
```

### Hubs — coordinate verificate
```
APT_PMO  Aeroporto Palermo  38.185000  13.110000
         ← punto A29 allo svincolo (NON coordinate terminal)
         Verificato ORS: APT_PMO→H001 = 31 min, 30.1 km
```

---

## 7. LOGICA CORE CAPTAIN

### Transfer_Class — come viene calcolata
```javascript
getTransferClass_(pickupId, dropoffId):
  pickup = HUB → ARRIVAL
  dropoff = HUB → DEPARTURE
  nessun HUB → STANDARD
```

### Calcolo tempi trip
```
ARRIVAL (pickup = hub):
  Call        = Arr_Time
  Pickup_Time = Call  ← driver già all'hub
  Start_DT    = Date + Pickup_Time
  End_DT      = Start_DT + Duration_Min

DEPARTURE (dropoff = hub):
  Call        = Arr_Time - 120min (CFG.HUB.CHECKIN_BUFFER_MIN)
  Pickup_Time = Call - Duration_Min
  Start_DT    = Date + Pickup_Time
  End_DT      = Start_DT + Duration_Min

STANDARD (hotel → set, ecc.):
  Call        = inserito manualmente
  Pickup_Time = Call - Duration_Min
  Start_DT    = Date + Pickup_Time
  End_DT      = Start_DT + Duration_Min

WRAP (da mobile):
  Call        = ora reale al click Confirm (confirmTimestamp)
  Pickup_Time = Call (se ARRIVAL) o Call-Duration (altrimenti)
  Trip_ID     = W_HHMMSS
```

### Travel_Status crew — logica S5
```
IN      = crew in arrivo da HUB (ARRIVAL trip)
OUT     = crew in partenza verso HUB (DEPARTURE trip / manuale)
PRESENT = tutti gli altri (default)

Automazioni:
- Trigger 5min: ARRIVAL trip completato → crew IN → PRESENT
  (solo se Travel_Status è ancora IN — il manuale ha SEMPRE priorità)
- onOpen: crew con Departure_Date = domani → dialog conferma OUT
  (se accetti → imposta OUT per tutti i confermati)
- Il manuale VINCE SEMPRE sull'automatico
```

### Regole assegnazione passeggeri
```
STANDARD  (hotel → set):   crew con Travel_Status=PRESENT nell'hotel di Pickup
DEPARTURE (hotel → hub):   crew con Travel_Status=OUT nell'hotel di Pickup
ARRIVAL   (hub → hotel):   crew con Travel_Status=IN nell'hotel di Dropoff
```

### QR Code system
```
Crew:    QR contiene solo "CR:CR0002"
Vehicle: QR contiene solo "VH:VAN-01"
→ resolveQR() legge dati in tempo reale al momento della scansione
→ Cambiare nome/hotel/status NON richiede di rigenerare i QR
→ Solo cambiare Crew_ID o Vehicle_ID richiede nuovi QR
```

---

## 8. ORS — OPENROUTESERVICE

```
Endpoint: https://api.openrouteservice.org/v2/directions/driving-car
Auth:     "Authorization": apiKey (NON "Bearer apiKey")
Coords:   [[lng, lat], [lng, lat]] — ordine INVERTITO rispetto a Google
Param:    "preference": "fastest" — OBBLIGATORIO per usare autostrade
Rate:     ~40 req/min → BATCH_PAUSE: 1600ms
Fallback: mantiene valore precedente se ORS fallisce (non sovrascrive con Haversine)
API Key:  ScriptProperties → "MAPS_API_KEY"
Stato:    51/72 rotte aggiornate — 21 ancora da completare
```

---

## 9. REGOLE FONDAMENTALI — NON VIOLARE MAI

```
❌ NON usare getDisplayValues() per leggere coordinate → getValues()
❌ NON hardcodare coordinate nelle funzioni Maps → _buildCoordsMap_(ss)
❌ NON usare deleteRow() in loop → bulk rewrite
❌ NON modificare rotte con Source=MANUAL negli script
❌ NON impostare "Reject input" su Service_Type → "Show warning"
❌ NON copiare conditional formatting nel template → errori cross-sheet
❌ NON fare rebuild completo nel trigger onEdit → troppo lento
❌ NON hardcodare numeri di colonna → getHeaderMap_()
❌ NON usare coordinate del terminal aeroportuale per ORS
❌ NON sovrascrivere Travel_Status manuale con automazioni
```

---

## 10. CAPTAINDISPATCH — WEB APP COMMERCIALE

### Visione prodotto
- **Nome:** CaptainDispatch
- **Dominio:** captaindispatch.com (registrato su Aruba, ~€4.99/anno)
- **Modello:** SaaS per produzioni — €150-300/mese per produzione
- **Target:** Captain (operativo), Transport Manager (strategico), Production (report)
- **Mercato:** Film, TV, teatro in tour — produzioni medio-grandi internazionali

### Stack tecnologico
```
Next.js 16.2.1    Frontend (App Router, Turbopack, JavaScript)
Supabase          Database (PostgreSQL) + Auth + Realtime
Vercel            Hosting frontend (deploy automatico da GitHub)
GitHub            Repository codice
```

### Account e credenziali
```
GitHub:   connesso con account Google (danielsanuk@googlemail.com)
Supabase: progetto "captaindispatch" — org "CaptainDispatch"
          Project ID: lvxtvgxyancpegvfcnsk
          Region: West EU (Ireland)
Vercel:   connesso con GitHub
Google Cloud Console: progetto "CaptainDispatch"
          OAuth Client Web configurato
          Authorized redirect URI: http://localhost:3000/auth/callback
```

### File progetto (C:\Users\WKS\Desktop\captaindispatch)
```
app/
  page.js              → redirect('/login')
  login/page.js        → pagina login Google (FUNZIONANTE)
  dashboard/page.js    → dashboard con 3 card (FUNZIONANTE)
  auth/callback/route.js → OAuth callback (FUNZIONANTE)
lib/
  supabase.js          → createBrowserClient
.env.local             → SUPABASE_URL + ANON_KEY
```

### Database Supabase — schema creato e funzionante
```sql
productions      -- multi-tenant (production_id su ogni tabella)
user_roles       -- CAPTAIN / MANAGER / PRODUCTION / ADMIN
locations        -- Hotels + Hubs unificati
routes           -- durate tra location
crew             -- anagrafica crew
vehicles         -- fleet
trips            -- tutti i trip
trip_passengers  -- assegnazioni pax ↔ trip
service_types    -- tipi di servizio configurabili

RLS abilitato su tutte le tabelle
Indici su: trips(date, vehicle_id, start_dt/end_dt),
           trip_passengers(trip_id, crew_id),
           crew(hotel_id, travel_status),
           routes(from_id, to_id)
```

### Stato attuale (24 marzo 2026)
```
✅ Login Google OAuth funzionante
✅ Sessione autenticata e persistente
✅ Dashboard con Fleet Monitor, Trips, Crew card
✅ Sign out
⏳ Fleet Monitor realtime — da costruire
⏳ Pagina Trips — da costruire
⏳ Pagina Crew — da costruire
⏳ Import dati da Google Sheets — da costruire
⏳ Deploy Vercel con dominio captaindispatch.com — da fare
```

### Prossimi step CaptainDispatch
1. **Fleet Monitor** — pagina `/dashboard/fleet` con Supabase realtime
2. **Pagina Trips** — lista e creazione trip
3. **Pagina Crew** — gestione crew e Travel_Status
4. **Script import** — legge Google Sheets e popola Supabase
5. **Deploy Vercel** — configurare dominio captaindispatch.com

---

## 11. CLASP — DA CONFIGURARE

CLASP permette di lavorare con Apps Script direttamente da VS Code.

### Installazione (da fare una volta)
```bash
npm install -g @google/clasp
clasp login
```

### Setup per CAPTAIN
```bash
# Nella cartella del progetto Google Apps Script
clasp clone <SCRIPT_ID>
# Script ID si trova in Apps Script → Project Settings → IDs

# Poi lavorare normalmente:
clasp pull   # scarica file aggiornati da Apps Script
clasp push   # carica modifiche su Apps Script
```

### Struttura file con CLASP
```
captain-sheets/
  .clasp.json          → Script ID
  appsscript.json      → manifest
  00_Config.gs
  01_Crew.gs
  ...tutti i .gs
  WrapTripApp.html
  FleetMonitor.html
  ...tutti gli .html
```

---

## 12. FLUSSO OPERATIVO GIORNALIERO

### La mattina
1. Apri Google Sheets → CAPTAIN è pronto
2. Alert automatico se ci sono crew con Departure_Date = domani
3. Controlla Crew_Master — Travel_Status aggiornato automaticamente nella notte
4. Pianifica i trip del giorno in Trips
5. Assegna veicoli e passeggeri

### Durante il giorno
1. Vehicle Availability sidebar — trova veicoli liberi per una finestra
2. New Pax Assignment sidebar — assegna passeggeri con conflict check
3. Fleet Monitor — vedi status live di tutti i veicoli
4. Il sistema flagga automaticamente conflitti pax e veicoli

### A fine set (Wrap Trip da mobile)
1. Apri WrapTripApp su Samsung
2. Scansiona QR driver
3. Scansiona QR passeggeri
4. Confirm → trip creato in Trips + Trip_Passengers

### Fine giornata
1. Generate Transport Lists → PDF su Google Drive
2. Archive Trips Day → sposta in Trips_History
3. Reset Trips From Template → foglio pulito per domani

---

## 13. PROBLEMI RISOLTI — STORIA COMPLETA

### S1 (pre-22 marzo)
1. `getLastRow()` su Trips → `getRealLastTripRow_()`
2. `getNormalizedPassengersForTripRow_()` mancante → ricostruita
3. `deleteRow()` in loop → bulk rewrite
4. 7 funzioni `getHeaderMap` duplicate → una sola in 00_Config.gs
5. `MAX_TRIPS_ROWS` hardcoded → rimosso, tutto dinamico
6. Cache crew non invalidata → invalidazione immediata
7. Formule pre-caricate su 989 righe → script scrive valori diretti

### S2 (22-23 marzo)
8. Transport Lists: MAIN_List → Transport_List
9. QR: Google Charts (deprecata) → api.qrserver.com
10. Wrap Trip Web App completa (09_WrapTrip.gs + WrapTripApp.html)
11. DV "Reject input" → "Show warning"
12. Formato date Wrap Trip → setNumberFormat fix
13. Create/Reset Trips Template
14. Setup Trips Validation (DV + conditional formatting)

### S3/S4 (23 marzo)
15. Pickup_Time ARRIVAL: era Call-Duration → ora Call (driver già all'hub)
16. Coordinate APT_PMO: erano del terminal (non routable ORS) → punto A29
17. `getDisplayValues()` su coordinate con locale IT → `getValues()`
18. Coordinate hardcoded nelle funzioni Maps → `_buildCoordsMap_(ss)`
19. ORS 404 "routable point not found" → punto sulla A29 allo svincolo
20. ORS rate limit (BATCH_PAUSE 350ms) → 1600ms + fallback mantiene precedente
21. 10_Maps.gs creato da zero con integrazione ORS completa
22. Riga fantasma in Trip_Passengers (T001 con Crew_ID vuoto) → eliminata

### S5 (24 marzo)
23. Travel_Status automation: trigger 5min ARRIVAL→PRESENT
24. Departure alert: onOpen check partenze domani
25. Crew date columns: Arrival_Date + Departure_Date + CF colorato
26. Fleet Monitor: da stub a implementazione completa (getFleetOverviewData)
27. WrapTripApp: Fleet button, Cancel Trip, Service Type selector, timestamp reale
28. FleetMonitor.html: nuovo file HTML per Google Sheets
29. assignVehicleFromSidebar: aggiunto sync vehicle dopo assignment
30. getWrapTripFormData: legge serviceTypes dinamicamente da Lists!B
31. _handleCrewMasterEdit_: watch su Arrival_Date e Departure_Date
32. CaptainDispatch: login Google OAuth funzionante, dashboard base

---

## 14. PREFERENZE DI LAVORO CON CLINE

- Vai avanti senza chiedere conferma a ogni passo
- Fermati solo se trovi qualcosa di genuinamente strano o rotto
- Leggi SEMPRE il codice esistente prima di modificarlo
- Analizza i dati reali prima di scrivere codice
- Spiega le decisioni importanti ma sii conciso
- Il sistema deve essere comprensibile anche a chi non sa programmare
- Google Sheets in italiano — coordinate con virgola, script con getValues()
- Per CaptainDispatch: usa JavaScript (non TypeScript), Tailwind CSS, App Router
- Usa `claude-sonnet-4-6` con thinking per i problemi complessi
- Il manuale VINCE sempre sull'automatico per Travel_Status

---

## 15. TODO — PRIORITÀ AGGIORNATE

### CAPTAIN Google Sheets (da fare)
- [ ] Completare 21 rotte ORS rimaste (Map Recalculate Routes)
- [ ] Full System Refresh dopo coordinate aggiornate
- [ ] Testare trigger 5min ARRIVAL→PRESENT sul live
- [ ] Distribuire QR codes alla crew
- [ ] Pulizia colonne legacy da Trips (M..AF, AP, AQ, AS, AT, AX, AY, AZ, BB, BC, BF, BG)
- [ ] Sezione BUSY in NewPaxAssignmentSidebar.html
- [ ] Setup CLASP per lavorare da VS Code

### CaptainDispatch Web App (prossimi step)
- [ ] Fleet Monitor realtime (Supabase subscriptions)
- [ ] Pagina Trips — lista, filtri, creazione
- [ ] Pagina Crew — Travel_Status, hotel, arrivi/partenze
- [ ] Script import Google Sheets → Supabase
- [ ] Deploy Vercel + dominio captaindispatch.com
- [ ] Multi-produzione (production switcher)
- [ ] Production View (report-only per chi paga)
