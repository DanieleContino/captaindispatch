# CAPTAIN — Contesto Completo Unificato

## Per uso in Cline (VS Code) con claude-sonnet-4-6 + thinking

## Aggiornato: sessione 26 marzo 2026 (S7) + S7b navbar fix

---

## ⚠️ ISTRUZIONE PERMANENTE

**Alla fine di ogni task aggiorna questo file con quello che hai fatto.**

---

## Unifica CAPTAIN_Context_S5.md + S6.md + S7.md

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
- **GitHub:** https://github.com/DanieleContino/captaindispatch
- **Vercel:** deploy via CLI (`vercel --prod`) dalla cartella del repo
- **Stato:** login funzionante, dashboard completa, Rocket Trip Generator v2 live

---

## 3. CAPTAIN — ARCHITETTURA GOOGLE SHEETS

### Fogli FRONTEND (visibili, modificati manualmente)

| Foglio | Scopo |
|-|-|
| Trips | Foglio centrale — un trip per riga, multi-dropoff con stesso Trip_ID |
| Crew_Master | Anagrafica crew — Hotel_ID, Hotel_Status, Travel_Status, Arrival_Date, Departure_Date |
| Fleet | Veicoli — Driver_Name, Sign_Code, Capacity, Unit_Default |
| Hotels | Location NON-hub (hotel, set, basecamp) + coordinate lat/lng |
| Hubs | Aeroporti, porti, stazioni (prefisso APT_, STN_, PRT_) + coordinate |
| Routes | Durate tra location — Source: ORS/AUTO/MANUAL |
| Lists | Dropdown config: Unit(A), Service_Type(B), Status(C), Vehicle_Type(D), Locations(E) |

### Fogli BACKEND (nascosti, gestiti dagli script)

| Foglio | Scopo |
|-|-|
| Trip_Passengers | DB assegnazioni pax ↔ trip row |
| TS_PaxIndex | Indice denormalizzato per conflict detection |
| DV_Passengers | Cache dropdown per sidebar Pax Assignment |
| Trips_History | Archivio storico trip (Fleet Reports) |
| Trips_Template | Template per reset giornaliero |
| TS_Log | Log operazioni sistema |

### Fogli REPORT (nascosti, generati dagli script)

| Foglio | Scopo |
|-|-|
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

* `CFG` — configurazione globale completa
* `getHeaderMap_(sh)` — UNICA funzione header map del progetto
* `getRealLastTripRow_()`, `getRealLastCrewRow_()`, `getRealLastPaxRow_()`
* `isTripRowMeaningful_()` — esclude righe template vuote
* `toDateSafe_()`, `toTimeMinutes_()`, `combineDateAndMinutes_()`
* `isHubId_()`, `getTransferClass_()`, `sameDay_()`, `dayKey_()`
* `parseCoordinate_()` — gestisce sia punto che virgola come decimale
* `withDocLock_()` — lock documento per operazioni critiche
* `TS_log_()`, `tsHealthCheck()`

### 01_Crew.gs

* Cache crew: `TS_buildCrewCache_()`, `TS_getCrewCache_()`, `TS_refreshCrewCache_()`
* Cache TTL 10 min, invalidazione immediata su edit
* `resolveCrewFromTripPassenger_()`, `TS_resolveCrewByPassengerName_()`
* QR codes: `tsGenerateQRCodes()`, `_buildQRUrl_()` (usa `api.qrserver.com`)
* `tsPrintCrewQRSheet()` → foglio `QR_Crew_Print`
* `tsAutoUpdateTravelStatusOnArrival()` — trigger 5min ARRIVAL→PRESENT
* `tsCheckDeparturesTomorrow()` — alert onOpen partenze domani
* `tsSetupArrivalTrigger()` — installa trigger temporale
* `tsSetupCrewDateColumns()` — aggiunge Arrival_Date + Departure_Date + CF

### 02_Trips.gs

* `calculateTripTimesSingleRow_()` — calcola Call/Pickup_Time/Start_DT/End_DT
* ARRIVAL: `Pickup_Time = Call` (FIX S4 — driver già all'hub)
* DEPARTURE: `Call = Arr_Time - 120min`, `Pickup_Time = Call - Duration`
* STANDARD: Call manuale, `Pickup_Time = Call - Duration`
* `syncVehicleDataFromFleet_()`, `getNormalizedPassengersForTripRow_()`
* `tsCreateTripsTemplate()`, `TS_resetTripsFromTemplate_()`
* `refreshTripsAffectedByCrewChange_()` — bulk rewrite (non deleteRow)

### 03_Routes.gs

* `findCoordsInSheet_()` — usa `getValues()` NON `getDisplayValues()` (FIX S4)
* `estimateMinByIds_()` — Haversine con fattori correzione (fallback)
* `syncRoutesFromLocations_()` — auto-sync quando Hotels/Hubs cambia
* `recalculateAutoRoutes_()` — ricalcola solo Source=AUTO
* `tsFixLatLngFormat()` — riscrive coordinate come numeri puri
* `tsTestCoordinates()` — diagnostica coordinate e distanze Haversine

### 04_Conflicts.gs

* `TS_PAX_INDEX` IIFE: `rebuild()`, `rebuildForTripRow_()`
* `TS_buildPaxConflictFlagsMap_()`, `TS_recomputePaxConflicts_()`
* Conflict detection: stesso crew su due trip sovrapposti

### 05_Lists.gs

* `tsGenerateLists()` → `tsGenerateListsForRange(fromStr, toStr)`
* `_buildTransportList_()`, `_buildTravelList_()`
* `tsExportAndEmail()` — PDF su Google Drive (`CAPTAIN/Lists/`)

### 06_Triggers.gs

* `onOpen()` — chiama `tsCheckDeparturesTomorrow()` + menu CAPTAIN e CAPTAIN Tools
* `tsOnEditInstallable()` — trigger principale onEdit
* `_handleCrewMasterEdit_()` — watched: Hotel_ID, Hotel_Status, Travel_Status, Arrival_Date, Departure_Date
* `_handleTripsEdit_()` — watched: tutti i campi critici Trips
* `tsSetupEnterprise()`, `tsFullRefresh()`
* **Menu CAPTAIN:** Health Check, Vehicle Availability, Pax Assignment, New Pax Assignment, Hub Coverage, Fleet Monitor, Generate Lists, Export PDF, Archive, Reset
* **Menu CAPTAIN Tools:** QR Codes, Print QR, Wrap Trip, Setup Crew Date Columns, Setup Arrival Trigger, Refresh Routes, Rebuild Pax, Full Refresh

### 07_FleetReports.gs

* `refreshFleetDailyReportFromSheetDate()`, `refreshFleetWeeklyReportFromSheetDate()`
* `refreshHubWeeklyReportFromSheetDate()`
* Legge da `Trips_History`

### 08_Sidebars.gs

* Vehicle Availability: `openVehicleAvailabilitySidebar()`
* Pax Assignment: `openPaxAssignmentSidebar()`, `openNewPaxAssignmentSidebar()`
* Hub Coverage: `openHubCoverageAssistant()`
* Fleet Monitor: `openFleetMonitor()` — implementato (non più stub)
* `getFleetOverviewData(targetDateStr)` — dati Fleet Monitor live
* `_fleetFmtTime_()` — formatta orari per Fleet Monitor
* `assignVehicleFromSidebar()` — chiama `syncVehicleDataFromFleet_()` dopo setValue

### 09_WrapTrip.gs

* `doGet(e)` — serve WrapTripApp.html
* `resolveQR(code)` — risolve `CR:CRID` o `VH:VID` in dati completi
* `createWrapTrip(tripData)` — crea trip da mobile
* `_createWrapTripLocked_()` — ARRIVAL: Pickup_Time=Call (FIX S4)
* `getWrapTripFormData()` — legge serviceTypes da Lists!B
* Trip_ID formato: `W_HHMMSS`
* `confirmTimestamp` dal client (orario reale click Confirm)
* Pickup_Time STANDARD = Call (non Call-Duration)
* Call vuota per STANDARD
* serviceType dal payload

### 10_Maps.gs

* `getOrsRouteDuration_(lat, lng, lat, lng)` — chiamata ORS singola
* `tsTestMapsApi()` — test 4 rotte dal foglio
* `tsDebugOrsApi()` — risposta raw ORS APT_PMO→H001
* `tsRecalculateRoutesWithMaps()` — aggiorna tutte le rotte AUTO
* `_buildCoordsMap_(ss)` — mappa coordinate da Hotels+Hubs (usa `getValues()`)

---

## 5. FILE HTML

### WrapTripApp.html

* App mobile 4 step: Trip Details → Vehicle → Passengers → Confirm
* Pulsante Fleet Monitor in header
* Schermata Fleet mobile completa
* Pulsante Cancel Trip (step 2/3/4)
* Service Type selector
* Timestamp reale al click Confirm
* QR scan con ZXing (camera nativa Samsung)
* `localStorage` persiste stato tra scansioni

### FleetMonitor.html

* Modal Fleet Monitor per Google Sheets
* Carica dati via `google.script.run.getFleetOverviewData()`
* Mostra status BUSY/FREE/IDLE con ETAs e barre progresso
* Badge "IN CORSO" / "✓" per trip completati

### DateRangeDialog.html

* Dialog selezione date per generazione Transport Lists

### VehicleAvailabilitySidebar.html

* Sidebar disponibilità veicoli per finestra oraria

### PaxAssignmentSidebar.html

* Sidebar assignment passeggeri (versione legacy)

### NewPaxAssignmentSidebar.html

* Sidebar assignment passeggeri (versione nuova)
* Sezione BUSY — da completare

### HubCoverageAssistant.html

* Assistente copertura hub per ARRIVAL/DEPARTURE

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

## 7. CAPTAINDISPATCH — STATO ATTUALE (26 marzo 2026)

### Stack tecnologico

```
Next.js 16.2.1    Frontend (App Router, Turbopack, JavaScript)
Supabase          Database (PostgreSQL) + Auth + Realtime
Vercel            Hosting frontend
GitHub            https://github.com/DanieleContino/captaindispatch
```

### Account e credenziali

```
GitHub username:  DanieleContino (NON danielsanuk — quello era il prefisso email)
GitHub email:     danielsanuk@googlemail.com
Vercel account:   danielecontino (login via browser device auth)
Supabase:         progetto "captaindispatch" — org "CaptainDispatch"
                  Project ID: lvxtvgxyancpegvfcnsk
                  Region: West EU (Ireland)
```

### Deploy

```
⚠️ La connessione GitHub→Vercel è stata interrotta quando il repo è stato cancellato
   e ricreato. I deploy automatici dal push GitHub NON funzionano più.
   
   Per deployare: vercel --prod
   (eseguire dalla cartella c:\Users\WKS\Desktop\captaindispatch)
   
   Per ripristinare deploy automatici:
   - Vai su vercel.com → progetto captaindispatch → Settings → Git
   - Disconnect e riconnetti su DanieleContino/captaindispatch
```

### File progetto — stato completo

```
app/
  page.tsx                    → redirect('/login')
  layout.tsx                  → layout globale con PWA manifest
  login/page.js               → pagina login Google (FUNZIONANTE)
  dashboard/page.js           → dashboard con tutte le card + alert arrivi/partenze
  dashboard/fleet/page.js     → Fleet Monitor realtime (FUNZIONANTE)
  dashboard/trips/page.js     → lista trip — multi-stop indicators (S7)
  dashboard/crew/page.js      → anagrafica crew + Travel_Status
  dashboard/locations/page.js → gestione locations + coordinate
  dashboard/vehicles/page.js  → flotta veicoli con pax_suggested/pax_max
  dashboard/lists/page.js     → transport lists (da completare)
  dashboard/hub-coverage/page.js → copertura hub
  dashboard/pax-coverage/page.js → copertura pax
  dashboard/reports/page.js   → fleet reports
  dashboard/qr-codes/page.js  → generazione QR
  dashboard/productions/page.js → gestione produzioni
  dashboard/rocket/page.js    → 🚀 Rocket Trip Generator v2 (FUNZIONANTE) — BUG FIX S7
  wrap-trip/page.js           → app mobile wrap trip (FUNZIONANTE)
  scan/page.js                → scanner QR
  auth/callback/route.js      → OAuth callback
  api/cron/arrival-status/    → cron 5min ARRIVAL→PRESENT
  api/cron/refresh-routes-traffic/ → cron 5AM refresh rotte Google
  api/routes/traffic-check/   → endpoint manuale check traffico
  api/routes/refresh-traffic/ → endpoint manuale refresh rotte
  api/route-duration/         → calcolo durata con traffico live
  api/productions/            → CRUD produzioni
  api/qr/resolve/             → risoluzione QR codes

lib/
  supabase.js                 → createBrowserClient
  supabaseServer.js           → createServerClient
  refreshRoutesWithGoogle.js  → helper Google Routes API con traffic
  routeDuration.js            → logica durata rotte refactored
  haversine.js                → calcolo distanze Haversine
  transferClass.js            → calcolo ARRIVAL/DEPARTURE/STANDARD
  tripTimeCalculator.js       → calcolo Call/Pickup/Start/End times
  crewCache.js                → cache crew
  production.js               → helper produzione

public/
  manifest.json               → PWA manifest
  icon.svg                    → icona app

scripts/
  create-schema.sql           → schema DB completo
  migrate-google-routes.sql   → aggiunta colonne google_duration_min, traffic_updated_at
  migrate-rocket-columns.sql  → aggiunta pax_suggested, pax_max a vehicles
  migrate-service-type.sql    → aggiunta service_type a trips
  import-from-sheets.js       → import da Google Sheets (parziale)
```

### Database Supabase — schema completo

```sql
productions      -- multi-tenant
user_roles       -- CAPTAIN / MANAGER / PRODUCTION / ADMIN
locations        -- Hotels + Hubs unificati (is_hub bool)
routes           -- durate tra location (duration_min, google_duration_min, traffic_updated_at)
crew             -- anagrafica (hotel_id, travel_status, hotel_status, arrival_date, departure_date, department)
vehicles         -- fleet (capacity, pax_suggested, pax_max, driver_name, sign_code, active)
trips            -- tutti i trip (pickup_id, dropoff_id, call_min, pickup_min, start_dt, end_dt, service_type, status)
trip_passengers  -- assegnazioni pax ↔ trip
service_types    -- tipi di servizio configurabili

RLS abilitato su tutte le tabelle
```

---

## 8. ROCKET TRIP GENERATOR — v2 (LIVE)

### Feature v2 implementate

- **Destinazione per dipartimento** — ogni dept può avere dest + call time diversa
- **Esclusione veicoli** — toggle checkbox per escludere veicoli dal run
- **localStorage persistence** — configurazione dept salvata tra sessioni
- **MoveCrewModal** — sposta crew tra veicoli in Step 2
- **Trip ID con suffisso** — quando un veicolo fa multi-stop: `R_MMDD_01A`, `R_MMDD_01B`

### Bug fix S7 (su rocket/page.js)

- **travel_status PRESENT only** — la query crew ora filtra `travel_status = 'PRESENT'`
  (era sbagliato: includeva anche IN/OUT che non devono essere in trip STANDARD)
- **Phantom unassigned trip cards** — le TripCard senza veicolo assegnato mostrano
  bordo rosso + testo "NO VEHICLE — use Move ›" invece di crashare
- **Null guards** — TripCard con vehicle null non crasha, enrichSuggestions protetto
- **handleConfirm** — salta i trip unassigned (no vehicle) alla conferma
- **MoveCrewModal** — filtra i trip unassigned dalla lista destinazioni Move

### Algoritmo v2

```
Input: crew eligible (PRESENT + CONFIRMED), vehicles (active, non-excluded), routeMap,
       globalDestId, globalCallMin, deptDestOverrides, crewCallOverrides, excludedVehicleIds

Per ogni crew:
  effectiveDest    = crewCallOverrides[id].destId   ??
                     deptDestOverrides[dept].destId  ??
                     globalDestId
  effectiveCallMin = crewCallOverrides[id].callMin  ??
                     deptDestOverrides[dept].callMin ??
                     globalCallMin

Raggruppamento: per (hotel_id, effectiveDest, effectiveCallMin)
Ordinamento crew: per dipartimento, poi nome
Ordinamento veicoli: per pax_suggested DESC
Assegnazione greedy: riempie fino a pax_suggested, overflow → CAN_ADD, no vehicle → NO_VEHICLE

Trip ID: R_MMDD_NN (veicoli singoli) / R_MMDD_NNA, R_MMDD_NNB (multi-stop stesso veicolo)
```

### Priorità call time (ordine decrescente)

```
1. crewCallOverrides[crewId]          ← individuale (massima priorità)
2. deptDestOverrides[dept].callMin    ← per destinazione
3. globalCallMin                       ← default globale
```

### Variabili stato React v2

```javascript
// Step 1 inputs
const [date, setDate]
const [globalDestId, setGlobalDestId]
const [globalCallTime, setGlobalCallTime]
const [serviceType, setServiceType]
const [deptDestOverrides, setDeptDestOverrides]    // { dept: { destId, callMin } }
const [crewCallOverrides, setCrewCallOverrides]    // { crewId: callMin }
const [excludedIds, setExcludedIds]                // Set crew esclusi
const [excludedVehicleIds, setExcludedVehicleIds]  // Set veicoli esclusi

// Step 2
const [draftTrips, setDraftTrips]
const [suggestions, setSuggestions]
const [moveTarget, setMoveTarget]                  // { crewId, fromTripIdx }

// Step 3
const [createdCount, setCreatedCount]
const [createError, setCreateError]
```

---

## 9. TRIPS PAGE — MULTI-STOP INDICATORS (S7)

### Problema risolto

I trip Rocket multi-stop vengono scritti nel DB come righe separate con ID "fratelli"
(es. `R_0326_01A` e `R_0326_01B`, stesso veicolo). Prima apparivano come trip indipendenti
senza nessun collegamento visivo.

### Soluzione implementata in `app/dashboard/trips/page.js`

#### Helper `baseTripId(id)`

```javascript
function baseTripId(id) { return id ? id.replace(/[A-Z]$/, '') : id }
// R_0326_01A → R_0326_01
// T001       → T001  (trip manuali non cambiati)
```

#### Raggruppamento intelligente

```javascript
// Prima: groupBy trip_id (ogni riga separata)
// Dopo:  groupBy baseTripId(trip_id) + vehicle_id
// → R_0326_01A e R_0326_01B (stesso veicolo) vengono fusi in un TripRow
const grouped = Object.values(
  filtered.reduce((acc, t) => {
    const key = baseTripId(t.trip_id) + '::' + (t.vehicle_id || '__none__')
    if (!acc[key]) acc[key] = []
    acc[key].push(t)
    return acc
  }, {})
).sort((a, b) => {
  const aMin = Math.min(...a.map(r => r.pickup_min ?? r.call_min ?? 9999))
  const bMin = Math.min(...b.map(r => r.pickup_min ?? r.call_min ?? 9999))
  return aMin - bMin
})
```

#### Indicatori visivi TripRow

```
Multi-pickup  (pickup diversi, stesso dropoff):
  → Bordo sinistro ARANCIONE (#d97706)
  → Sfondo #fffbeb
  → Badge: 🔀 MULTI-PKP (giallo)

Multi-dropoff (stesso pickup, dropoff diversi):
  → Bordo sinistro VIOLA (#7c3aed)
  → Sfondo #fdf4ff
  → Badge: 🔀 MULTI-DRP (viola)

Entrambi:
  → Bordo ARANCIONE, sfondo viola
  → Entrambi i badge
```

#### Route column espansa per multi-stop

```
Hotel Bellevue → Set A  · 🕐06:30 · 8pax
Hotel Excelsior → Set B · 🕐06:45 · 4pax
```

(ogni sub-trip su riga separata con pickup time e pax count)

#### Colonna TIME

Mostra il **pickup più presto** del gruppo (quando il veicolo parte dal primo hotel).

---

## 10. LOGICA CORE CAPTAIN

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

ROCKET (generato automaticamente):
  Call        = effectiveCallMin (global o per-dept o per-crew)
  Pickup_Time = Call - Duration_Min
  Trip_ID     = R_MMDD_NN  (oppure R_MMDD_NNA/B per multi-stop)
```

### Travel_Status crew — logica

```
IN      = crew in arrivo da HUB (ARRIVAL trip)
OUT     = crew in partenza verso HUB (DEPARTURE trip / manuale)
PRESENT = tutti gli altri (default)

Automazioni:
- Trigger 5min: ARRIVAL trip completato → crew IN → PRESENT
- onOpen: crew con Departure_Date = domani → dialog conferma OUT
- Il manuale VINCE SEMPRE sull'automatico

ROCKET usa SOLO crew con travel_status = 'PRESENT' (fix S7)
```

---

## 11. REGOLE FONDAMENTALI — NON VIOLARE MAI

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
❌ NON usare il GitHub username "danielsanuk" → è SBAGLIATO, quello giusto è "DanieleContino"
❌ NON includere crew con travel_status IN/OUT in run Rocket STANDARD
❌ NON crashare TripCard se vehicle è null → null guard obbligatorio
```

---

## 12. ORS — OPENROUTESERVICE

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

## 13. PREFERENZE DI LAVORO CON CLINE

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

## 14. STORIA SESSIONI

### S1 (pre-22 marzo) — CAPTAIN Sheets fixes

1-7: getLastRow fix, getNormalizedPassengers, deleteRow→bulk, getHeaderMap unificato,
MAX_TRIPS_ROWS rimosso, cache crew, formule→valori diretti

### S2 (22-23 marzo) — CAPTAIN Sheets features

8-14: Transport Lists, QR api.qrserver.com, Wrap Trip, DV Show Warning,
date format, Template Trips, Trips Validation

### S3/S4 (23 marzo) — CAPTAIN Sheets ORS integration

15-22: Pickup_Time ARRIVAL fix, coordinate APT_PMO, getDisplayValues→getValues,
coordinate hardcoded→_buildCoordsMap, ORS routing, rate limit, 10_Maps.gs, pax fantasma

### S5 (24 marzo) — CAPTAIN Sheets S5 + CaptainDispatch base

23-32: Travel_Status automation, Departure alert, Fleet Monitor, WrapTripApp enhancements,
assignVehicleFromSidebar, getWrapTripFormData, _handleCrewMasterEdit,
CaptainDispatch login OAuth + dashboard base

### S6 (25 marzo) — CaptainDispatch build-out + Rocket v1

- Git: repo GitHub ricreato come DanieleContino/captaindispatch
- Vercel: riconnesso via CLI
- lib/refreshRoutesWithGoogle.js: helper Google Routes API con traffic
- api/cron/refresh-routes-traffic: cron 5AM aggiornamento rotte
- api/route-duration, lib/routeDuration.js: refactored
- wrap-trip/page.js: major overhaul UI/UX
- dashboard/fleet: improvements
- scripts/migrate-google-routes.sql + migrate-service-type.sql
- public/manifest.json + icon.svg: PWA
- vercel.json: cron schedules
- dashboard/rocket/page.js: Rocket Trip Generator v1 completo
  → poi evoluto a v2 (destinazioni per dept, esclusione veicoli, localStorage, MoveCrewModal)

### S7 (26 marzo) — Bug fix Rocket + Multi-stop Trips

- **Rocket bug fixes:**
  - travel_status: query crew ora usa solo PRESENT (non IN/OUT)
  - Phantom unassigned trip cards: bordo rosso + label "NO VEHICLE — use Move ›"
  - TripCard null guard: vehicle null non crasha
  - enrichSuggestions null guard
  - handleConfirm: salta trip senza veicolo
  - MoveCrewModal: filtra trip unassigned dalla lista destinazioni
  - Deploy
- **Trips page — multi-stop indicators:**
  - baseTripId() helper — strip lettera finale (A, B, C…)
  - Raggruppamento per baseTripId + vehicle_id
  - Badge 🔀 MULTI-PKP (arancione) e 🔀 MULTI-DRP (viola)
  - Route column espansa con leg-by-leg breakdown
  - Bordo colorato per trip multi-stop
  - TIME mostra pickup più presto del gruppo
  - Deploy

### S7b (26 marzo) — Navbar fix + Vercel webhook

47. **Navbar reordering:** Rocket link spostato dopo Vehicles (era dopo Trips)
    - Commit: 56f5ed3 "Move Rocket link after Vehicles in navbar"
    - Deploy: Vercel completato, sito live aggiornato
48. **Vercel webhook fix:** GitHub→Vercel connection era disabilitata
    - Problema: Commit Comments toggle era OFF
    - Soluzione: Riabilitato webhook in Vercel Settings → Git
    - Trigger deployment: commit vuoto 3c46ee1 per testare webhook
    - Risultato: Deploy automatici ora funzionano
49. **Cache issue:** Sito live non aggiornato subito dopo deploy
    - Causa: Session cache browser + DNS propagation
    - Soluzione: Logout/login per pulire cache sessione
    - Vercel deployment completato in 6 minuti

---

## 15. TODO — PRIORITÀ AGGIORNATE

### CaptainDispatch Web App — PRIORITÀ 1 (prossima sessione)

```
[ ] Fix deploy automatico Vercel: ricollegare GitHub repo
    → vercel.com → progetto → Settings → Git → Reconnect → DanieleContino/captaindispatch
[ ] Trips page — passeggeri multi-trip: mostrare pax_count totale del gruppo multi-stop
    (ora mostra solo i pax del primo sub-trip)
[ ] Rocket — multi-destination: call time per singolo crew override nella tabella Step 1
```

### CaptainDispatch Web App — PRIORITÀ 2

```
[ ] Trips page — creazione trip manuale migliorata (date default, auto trip_id sequenziale)
[ ] Trips page — assegnazione pax e veicolo inline (senza aprire sidebar)
[ ] Crew page — edit Travel_Status diretto in-row
[ ] Transport Lists — generazione PDF stampabile
[ ] Script import Google Sheets → Supabase (completare)
[ ] Multi-produzione (production switcher in header)
[ ] Rocket — Step 2: mostra durata stimata per ogni trip (da routeMap)
```

### CaptainDispatch Web App — PRIORITÀ 3

```
[ ] Rocket — quick-reason esclusione veicolo (Maintenance/Pre-assigned/Unavailable)
[ ] Rocket — service type per destinazione (diverso da quello globale)
[ ] Rocket — export PDF pianificazione pre-conferma
[ ] Production View (report-only per chi paga)
[ ] Notifiche push (PWA) per alert arrivi/partenze
[ ] Dark mode
```

### CAPTAIN Google Sheets — PRIORITÀ

```
[ ] Completare 21 rotte ORS rimaste (Map Recalculate Routes)
[ ] Full System Refresh dopo coordinate aggiornate
[ ] Testare trigger 5min ARRIVAL→PRESENT sul live
[ ] Distribuire QR codes alla crew
[ ] Pulizia colonne legacy da Trips (M..AF, AP, AQ, AS, AT, AX, AY, AZ, BB, BC, BF, BG)
[ ] Sezione BUSY in NewPaxAssignmentSidebar.html
[ ] Setup CLASP per lavorare da VS Code
```

---

## 16. PROBLEMI RISOLTI — STORIA COMPLETA

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
31. _handleCrewMasterEdit: watch su Arrival_Date e Departure_Date
32. CaptainDispatch: login Google OAuth funzionante, dashboard base

### S6 (25 marzo)

33. GitHub: repo ricreato come DanieleContino/captaindispatch (era danielsanuk → SBAGLIATO)
34. Vercel: deploy via CLI (`vercel --prod`)
35. Google Routes API: helper con traffic live
36. Cron 5AM: refresh rotte con traffico
37. Rocket Trip Generator v1: algoritmo greedy, Step 1/2/3 completi
38. Rocket v2: destinazioni per dipartimento, esclusione veicoli, localStorage, MoveCrewModal

### S7 (26 marzo)

39. Rocket: travel_status PRESENT only (fix crew eligibility)
40. Rocket: phantom unassigned trip cards (null guard + red border)
41. Rocket: enrichSuggestions null guard
42. Rocket: handleConfirm salta trip senza veicolo
43. Rocket: MoveCrewModal filtra trip unassigned
44. Trips page: multi-stop indicators (baseTripId, raggruppamento, badge, colori)
45. Trips page: route column espansa per leg-by-leg breakdown
46. Trips page: TIME mostra pickup più presto del gruppo
