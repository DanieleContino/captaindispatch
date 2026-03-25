# CAPTAIN — Contesto Completo S6

## Per uso in Cline (VS Code) con claude-sonnet-4-6 + thinking

## Aggiornato: sessione 25 marzo 2026 (S6)

## Sostituisce CAPTAIN_Context_S5.md

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
- **GitHub:** https://github.com/DanieleContino/captaindispatch ← username CORRETTO
- **Vercel:** deploy via CLI (`vercel deploy --prod`) — connessione GitHub da ricollegare nel dashboard
- **Stato:** login funzionante, dashboard completa, Rocket Trip Generator v1 live

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

## 4. CAPTAIN — FILE APPS SCRIPT (invariato da S5 — vedi S5.md per dettagli)

File: 00_Config.gs, 01_Crew.gs, 02_Trips.gs, 03_Routes.gs, 04_Conflicts.gs,
05_Lists.gs, 06_Triggers.gs, 07_FleetReports.gs, 08_Sidebars.gs, 09_WrapTrip.gs, 10_Maps.gs

File HTML: WrapTripApp.html, FleetMonitor.html, DateRangeDialog.html,
VehicleAvailabilitySidebar.html, PaxAssignmentSidebar.html, NewPaxAssignmentSidebar.html, HubCoverageAssistant.html

---

## 5. DATI LIVE PRODUZIONE PALERMO

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

## 6. CAPTAINDISPATCH — STATO ATTUALE (25 marzo 2026)

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
   
   Per deployare: vercel deploy --prod --cwd "c:\Users\WKS\Desktop\captaindispatch"
   
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
  dashboard/trips/page.js     → lista trip con filtri data
  dashboard/crew/page.js      → anagrafica crew + Travel_Status
  dashboard/locations/page.js → gestione locations + coordinate
  dashboard/vehicles/page.js  → flotta veicoli con pax_suggested/pax_max
  dashboard/lists/page.js     → transport lists (da completare)
  dashboard/hub-coverage/page.js → copertura hub
  dashboard/pax-coverage/page.js → copertura pax
  dashboard/reports/page.js   → fleet reports
  dashboard/qr-codes/page.js  → generazione QR
  dashboard/productions/page.js → gestione produzioni
  dashboard/rocket/page.js    → 🚀 Rocket Trip Generator v1 (FUNZIONANTE)
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

## 7. ROCKET TRIP GENERATOR — v1 (implementato e live)

### Cosa fa la v1
- **Step 1 — Setup:** seleziona data, destinazione unica, call time globale, service type
- **Step 2 — Preview:** bozza trip per veicolo, drag/move crew tra veicoli
- **Step 3 — Conferma:** crea trip + trip_passengers in Supabase

### Algoritmo v1
```
Input: crew eligible (IN/PRESENT + CONFIRMED), vehicles (active), routeMap, destId, globalCallMin
Raggruppamento: per (hotel_id, callMin)
Ordinamento crew: per dipartimento, poi nome
Ordinamento veicoli: per pax_suggested DESC
Assegnazione: greedy — riempie ogni veicolo fino a pax_suggested
Overflow: suggestion "CAN_ADD" se c'è ancora posto fino a pax_max
No vehicle: suggestion "NO_VEHICLE"
```

### Variabili stato React v1
```javascript
// Step 1 inputs
const [date, setDate]
const [destId, setDestId]                          // destinazione unica
const [globalCallTime, setGlobalCallTime]
const [serviceType, setServiceType]
const [crewCallOverrides, setCrewCallOverrides]    // { crewId: callMin }
const [excludedIds, setExcludedIds]                // Set di crew esclusi

// Step 2
const [draftTrips, setDraftTrips]
const [suggestions, setSuggestions]
const [moveTarget, setMoveTarget]

// Step 3
const [createdCount, setCreatedCount]
const [createError, setCreateError]
```

---

## 8. ROCKET TRIP GENERATOR — v2 (DA IMPLEMENTARE nella prossima sessione)

### Problema da risolvere
Nella stessa mattina, crew di dipartimenti diversi vanno a destinazioni diverse:
- COSTUME, MAKEUP, ART → BaseCamp (B_1)
- CAMERA, GRIP, ELECTRIC → Set (SET_1)
- PRODUCTION → Set (SET_1), ma call time diversa

La v1 supporta solo una destinazione globale. La v2 deve supportare:
1. **Destinazione per dipartimento** — con call time per destinazione
2. **Esclusione veicoli** — toggle per rimuovere veicoli non disponibili

---

### 8a. FEATURE: Destinazione + Call Time per Dipartimento

#### UI — Nuova sezione Step 1 "Destinations by Department"

```
🎯 Destinations by Department                    [Reset all to global]

COSTUME      (3 crew)  →  [BaseCamp    ▾]  Call: [07:30]
MAKEUP       (2 crew)  →  [BaseCamp    ▾]  Call: [07:30]
ART          (1 crew)  →  [BaseCamp    ▾]  Call: [07:30]
GRIP         (4 crew)  →  [SET_1       ▾]  Call: [07:00]  ← = global
CAMERA       (3 crew)  →  [SET_1       ▾]  Call: [07:00]  ← = global
ELECTRIC     (2 crew)  →  [SET_1       ▾]  Call: [07:00]  ← = global
```

- Dipartimenti derivati automaticamente dalla crew caricata
- Righe senza dipartimento → gruppo "— No Department —" che usa sempre il global
- Dropdown destinazione: tutte le locations (stessa lista del global dest)
- Call time per destinazione: default = globalCallTime, modificabile
- Se callTime = globalCallTime → non mostrare override (oppure mostrare in grigio)
- Pulsante "Reset all to global" → azzera tutti gli override dept

#### Nuove variabili stato React
```javascript
const [deptDestOverrides, setDeptDestOverrides]
// { "COSTUME": { destId: "B_1", callMin: 450 } }
// { "GRIP": { destId: "SET_1", callMin: 420 } }  ← uguale al global
// Solo i dipartimenti con override vengono salvati (per chiarezza)

// Oppure struttura completa:
// { "COSTUME": { destId: "B_1", callMin: 450 } }
// Se dept non presente → usa globalDest e globalCallMin
```

#### LocalStorage persistence
```javascript
// Key: "rocket_dept_config"
// Salva: { [deptName]: { destId, callMin } }
// Carica all'apertura della pagina
// Reset: cancella il key dal localStorage
// Nota: destId viene validato contro le locations disponibili al carico
//       (se la location non esiste più, si usa il global)
```

#### Modifica all'algoritmo runRocket
```javascript
// Nuovi input:
function runRocket({ 
  crew, vehicles, routeMap,
  globalDestId, globalCallMin,          // ← rinominati da destId, callMin
  deptDestOverrides,                     // ← NUOVO: { dept: { destId, callMin } }
  crewCallOverrides,                     // invariato (individuale, massima priorità)
  excludedCrewIds,                       // invariato
  excludedVehicleIds,                    // ← NUOVO
})

// Per ogni crew, calcola effective values:
function getCrewEffective(crew, deptDestOverrides, globalDestId, globalCallMin, crewCallOverrides) {
  const deptCfg = deptDestOverrides[crew.department] || {}
  const effectiveDest    = deptCfg.destId  ?? globalDestId
  const effectiveCallMin = crewCallOverrides[crew.id] ?? deptCfg.callMin ?? globalCallMin
  return { effectiveDest, effectiveCallMin }
}

// Priorità call time:
// 1. crewCallOverrides[crewId]          ← individuale (massima priorità, UI tabella crew)
// 2. deptDestOverrides[dept].callMin    ← per destinazione
// 3. globalCallMin                       ← default globale

// Raggruppamento per (hotel_id, effectiveDest, effectiveCallMin)
// Ogni gruppo diventa un set di trip separati verso una destinazione specifica
```

#### Trip ID generato
```
Formato attuale: R_MMDD_NN
Nessun cambiamento necessario — ogni gruppo genera trip separati
```

---

### 8b. FEATURE: Esclusione Veicoli

#### UI — Modifica sezione Fleet

```
🚐 Fleet available — 5/6 active vehicles    [✅ All] [☐ None]

[✅] VAN-01  Marco      VAN  6/8   → incluso
[✅] CAR-01  Luca       CAR  4/4   → incluso
[☐ ] BUS-20  Giulia     BUS  20/20 → EXCLUDED  (riga grigiata, testo barrato)
[✅] CAR-02  Guglielmo  CAR  4/4   → incluso
[✅] VAN-02  Ale        VAN  6/8   → incluso
[✅] BUS-50  Massi      BUS  50/50 → incluso
```

- Checkbox per ogni veicolo (checked = incluso nel run Rocket)
- Veicoli esclusi: opacity 0.45, testo barrato, badge "EXCLUDED"
- Pulsanti [All] e [None] per select/deselect tutto
- Counter aggiornato: "5/6 active vehicles" (inclusi/totali)
- Bottone Launch mostra "X crew · Y vehicles" con Y = veicoli inclusi

#### Nuove variabili stato React
```javascript
const [excludedVehicleIds, setExcludedVehicleIds]  // Set — default: Set() vuoto (tutti inclusi)
```

#### Modifica all'algoritmo
```javascript
// Pool veicoli:
const pool = [...vehicles]
  .filter(v => v.active)
  .filter(v => !excludedVehicleIds.has(v.id))   // ← NUOVO
  .sort((a, b) => ...)
```

---

### 8c. MIGLIORAMENTI UX v2

#### Tabella Crew — mostra destinazione effettiva
Nella tabella crew Step 1, aggiungere una colonna "Destination" che mostra
la destinazione effettiva per ogni crew (basata sul dept override o global).
Questo aiuta a verificare visivamente che la configurazione sia corretta.

```
[ ] Name      | Dept    | Hotel   | Dest        | Call
    John S.   | COSTUME | H002    | BaseCamp ←  | 07:30
    Mike R.   | GRIP    | H002    | SET_1        | 07:00
```

#### Step 2 Stats Bar — mostra destinazioni distinte
```
📋 Draft Plan · 4 trips · 12 pax · 2 destinations · 2026-03-25
```

#### TripCard Step 2 — già funzionante
Le TripCard mostrano già `hotel → destination` quindi il multi-dest
è visibile naturalmente. Nessuna modifica necessaria.

---

### 8d. ORDINE DI IMPLEMENTAZIONE (prossima sessione)

```
Priorità 1 (MUST — blocca l'uso operativo):
  ✅ Esclusione veicoli — semplice, impatto alto
  ✅ Destinazione per dipartimento — core feature

Priorità 2 (SHOULD — migliora significativamente l'UX):
  ✅ Call time per destinazione — utile ogni mattina
  ✅ LocalStorage persistence — risparmio di tempo quotidiano

Priorità 3 (NICE — da fare in sessione futura):
  ⏳ Colonna "Destination" nella tabella crew
  ⏳ Quick-reason per esclusione veicolo (Maintenance/Pre-assigned/Unavailable)
  ⏳ Service type per destinazione (diverso da quello globale)
  ⏳ Export PDF della pianificazione Rocket (pre-conferma)
```

---

## 9. TODO — PRIORITÀ AGGIORNATE

### CaptainDispatch Web App — PRIORITÀ 1 (prossima sessione)

```
[ ] Rocket v2 — esclusione veicoli
[ ] Rocket v2 — destinazione + call time per dipartimento
[ ] Rocket v2 — localStorage persistence dept settings
[ ] Fix deploy automatico Vercel: ricollegare GitHub repo
    → vercel.com → progetto → Settings → Git → Reconnect → DanieleContino/captaindispatch
```

### CaptainDispatch Web App — PRIORITÀ 2

```
[ ] Trips page — creazione trip manuale dalla dashboard
[ ] Trips page — assegnazione pax e veicolo inline
[ ] Crew page — edit Travel_Status diretto
[ ] Transport Lists — generazione PDF stampabile
[ ] Script import Google Sheets → Supabase (completare)
[ ] Multi-produzione (production switcher in header)
```

### CaptainDispatch Web App — PRIORITÀ 3

```
[ ] Rocket v2 — colonna Destination in tabella crew
[ ] Rocket v2 — quick-reason esclusione veicolo
[ ] Rocket v2 — service type per destinazione
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

## 10. LOGICA CORE CAPTAIN (invariata da S5)

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
  Trip_ID     = R_MMDD_NN
```

### Travel_Status crew — logica S5
```
IN      = crew in arrivo da HUB (ARRIVAL trip)
OUT     = crew in partenza verso HUB (DEPARTURE trip / manuale)
PRESENT = tutti gli altri (default)

Automazioni:
- Trigger 5min: ARRIVAL trip completato → crew IN → PRESENT
- onOpen: crew con Departure_Date = domani → dialog conferma OUT
- Il manuale VINCE SEMPRE sull'automatico
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

### S6 (25 marzo) — CaptainDispatch build-out + Git fix
- Git: repo GitHub ricreato come DanieleContino/captaindispatch (era danielsanuk → SBAGLIATO)
- Vercel: riconnesso via CLI (`vercel deploy --prod`)
- lib/refreshRoutesWithGoogle.js: helper Google Routes API con traffic
- app/api/cron/refresh-routes-traffic: cron 5AM aggiornamento rotte
- app/api/routes/traffic-check + refresh-traffic: endpoint manuali traffico
- app/api/route-duration: calcolo durata con traffico live
- lib/routeDuration.js: refactored
- app/wrap-trip/page.js: major overhaul UI/UX
- app/dashboard/fleet: improvements
- scripts/migrate-google-routes.sql + migrate-service-type.sql
- public/manifest.json + icon.svg: PWA
- vercel.json: cron schedules
- app/dashboard/rocket/page.js: Rocket Trip Generator v1 completo
- app/dashboard/page.js: Rocket aggiunto a NAV e CARDS
- CAPTAIN_Context_S6.md: questo file
