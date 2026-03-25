# CAPTAIN_Analysis.md
## Analisi Completa Google Sheets -> CaptainDispatch Web App
### 24 marzo 2026 | Sorgente: 11 .gs + 8 .html files

---

## 1. MAPPA COMPLETA FUNZIONALITA DA REPLICARE

### TRIP
| Funzionalita | File GS | Priorita |
|---|---|---|
| CRUD trip con multi-dropoff (stesso Trip_ID) | 02_Trips.gs | ALTA |
| Calcolo Call/Pickup_Time/Start_DT/End_DT | 02_Trips.gs | ALTA |
| Auto Transfer_Class (ARRIVAL/DEPARTURE/STANDARD) | 00_Config.gs | ALTA |
| Sync Driver/Sign/Capacity da Fleet su cambio Vehicle_ID | 02_Trips.gs | ALTA |
| Propagazione Call a tutte le righe stesso Trip_ID | 02_Trips.gs | ALTA |
| Archivio trip in Trips_History | 02_Trips.gs | MEDIA |
| Wrap Trip da mobile (QR scan) | 09_WrapTrip.gs | MEDIA |

### PASSEGGERI
| Funzionalita | File GS | Priorita |
|---|---|---|
| Assegnazione pax a trip (regole hotel/status) | 01_Crew.gs | ALTA |
| Conflict detection (stesso pax su trip sovrapposti) | 04_Conflicts.gs | ALTA |
| Auto-aggiornamento Passenger_List e Pax_Count | 02_Trips.gs | ALTA |
| Rimozione assegnazioni non valide su cambio hotel/status | 02_Trips.gs | MEDIA |
| PaxIndex denormalizzato | 04_Conflicts.gs | MEDIA |

### CREW
| Funzionalita | File GS | Priorita |
|---|---|---|
| Anagrafica crew con hotel/status | 01_Crew.gs | ALTA |
| Cache crew (solo Hotel_Status=CONFIRMED) | 01_Crew.gs | ALTA |
| Travel_Status (IN/OUT/PRESENT) | 01_Crew.gs | ALTA |
| Auto IN->PRESENT su ARRIVAL completato (trigger 5min) | 01_Crew.gs | MEDIA |
| Alert partenze domani (Departure_Date) | 01_Crew.gs | MEDIA |
| QR Code generazione/stampa badge | 01_Crew.gs | BASSA |

### FLOTTA
| Funzionalita | File GS | Priorita |
|---|---|---|
| Fleet Monitor live (BUSY/FREE/IDLE/DONE) | 08_Sidebars.gs | ALTA |
| Vehicle Availability (conflict + repositioning) | 08_Sidebars.gs | ALTA |
| Fleet Status (GREEN/YELLOW/RED ore lavorate) | 08_Sidebars.gs | MEDIA |
| Fleet Report Daily e Weekly | 07_FleetReports.gs | BASSA |

### LOCATION E ROTTE
| Funzionalita | File GS | Priorita |
|---|---|---|
| Hotels + Hubs con coordinate lat/lng | 03_Routes.gs | ALTA |
| Route duration lookup (da tabella Routes) | 03_Routes.gs | ALTA |
| Haversine fallback se rotta non esiste | 03_Routes.gs | MEDIA |
| Integrazione ORS (OpenRouteService) | 10_Maps.gs | BASSA |
| Meeting_Point auto da Default_Pickup_Point | 03_Routes.gs | MEDIA |

### TRANSPORT LISTS
| Funzionalita | File GS | Priorita |
|---|---|---|
| Transport_List (MAIN+SECOND, solo STANDARD) | 05_Lists.gs | MEDIA |
| TRAVEL_AIRPORT_List (DEPARTURE+ARRIVAL) | 05_Lists.gs | MEDIA |
| Raggruppamento per Trip_ID (multi-dropoff header) | 05_Lists.gs | MEDIA |
| Export PDF via browser print | 05_Lists.gs | BASSA |

### UI TOOLS
| Tool | Priorita |
|---|---|
| Fleet Monitor (BUSY/FREE/IDLE + progress + ETA) | ALTA |
| Vehicle Availability (finestra oraria + assign) | ALTA |
| Pax Assignment (available/busy/assigned + add/remove) | ALTA |
| Hub Coverage Assistant | MEDIA |
| Pax Assignment Status overview giorno | MEDIA |

---

## 2. LOGICA ATTUALE -> EQUIVALENTE NEXT.JS/SUPABASE

### 2.1 CALCOLO TEMPI TRIP (cuore del sistema)

**Apps Script** (02_Trips.gs: calculateTripTimesSingleRow_):
~~~
ARRIVAL  (hub->hotel): Call = Arr_Time
                       Pickup_Time = Call  (FIX S4: NON Call-Duration_Min)
                       Start_DT = Date + Pickup_Time
                       End_DT = Start_DT + Duration_Min

DEPARTURE(hotel->hub): Call = Arr_Time - 120min (CHECKIN_BUFFER)
                       Pickup_Time = Call - Duration_Min
                       Start_DT = Date + Pickup_Time
                       End_DT = Start_DT + Duration_Min

STANDARD (hotel->set): Call = inserito manualmente (NON toccare)
                       Pickup_Time = Call - Duration_Min
                       Start_DT = Date + Pickup_Time
                       End_DT = Start_DT + Duration_Min
~~~

NOTA CRITICA S4: Per ARRIVAL Pickup_Time = Call (driver gia hub, non parte da altrove)

**Next.js** (lib/tripTimeCalculator.js):
~~~javascript
export function calculateTripTimes({ date, arrTimeMin, durationMin, transferClass, callMin }) {
  const CHECKIN_BUFFER = 120
  let computedCall = null
  if (transferClass === 'ARRIVAL' && arrTimeMin !== null)
    computedCall = arrTimeMin
  else if (transferClass === 'DEPARTURE' && arrTimeMin !== null)
    computedCall = (arrTimeMin - CHECKIN_BUFFER + 1440) % 1440
  else
    computedCall = callMin  // STANDARD: manuale, non toccare
  if (computedCall === null) return null
  const pickupMin = transferClass === 'ARRIVAL' ? computedCall : computedCall - durationMin
  const startDt = new Date(date)
  startDt.setHours(Math.floor(((pickupMin%1440)+1440)%1440/60), ((pickupMin%1440)+1440)%1440%60, 0, 0)
  const endDt = new Date(startDt.getTime() + durationMin * 60000)
  return { callMin: computedCall, pickupMin, startDt, endDt }
}
~~~

**Supabase** - transfer_class come colonna GENERATED ALWAYS AS:
~~~sql
transfer_class text GENERATED ALWAYS AS (
  CASE
    WHEN pickup_id ~ '^(APT_|STN_|PRT_)' AND dropoff_id !~ '^(APT_|STN_|PRT_)' THEN 'ARRIVAL'
    WHEN pickup_id !~ '^(APT_|STN_|PRT_)' AND dropoff_id ~ '^(APT_|STN_|PRT_)'  THEN 'DEPARTURE'
    ELSE 'STANDARD'
  END
) STORED
~~~

---

### 2.2 CACHE CREW

**Apps Script** (01_Crew.gs: TS_getCrewCache_):
- Struttura: { byHotel, byCrewId, byNormName, ambiguousNames, duplicates }
- Solo Hotel_Status = CONFIRMED entra nella cache
- TTL 10 minuti in CacheService
- Invalidazione immediata su edit Hotel_ID/Status/Travel_Status

**Next.js** (lib/crewCache.js + Supabase Realtime):
~~~javascript
let _cache = null, _ts = 0
const TTL = 600_000
export async function getCrewCache(supabase) {
  if (_cache && Date.now() - _ts < TTL) return _cache
  const { data } = await supabase.from('crew')
    .select('*').eq('hotel_status', 'CONFIRMED')
  _cache = buildCache(data)
  _ts = Date.now()
  return _cache
}
// Invalida via Supabase Realtime
supabase.channel('crew').on('postgres_changes',
  { event: '*', schema: 'public', table: 'crew' },
  () => { _cache = null }
).subscribe()
~~~

---

### 2.3 REGOLE ASSEGNAZIONE PASSEGGERI

**Apps Script** (01_Crew.gs: TS_getValidPassengerNamesForTrip_):
~~~
STANDARD  (hotel->set): Travel_Status=PRESENT && Hotel_ID = Pickup_ID
DEPARTURE (hotel->hub): Travel_Status=OUT     && Hotel_ID = Pickup_ID
ARRIVAL   (hub->hotel): Travel_Status=IN      && Hotel_ID = Dropoff_ID
~~~

**Next.js** (API /api/crew/available-for-trip):
~~~javascript
const statusMap = { ARRIVAL: 'IN', DEPARTURE: 'OUT', STANDARD: 'PRESENT' }
const hotelMap  = { ARRIVAL: dropoffId, DEPARTURE: pickupId, STANDARD: pickupId }
const { data } = await supabase.from('crew')
  .select('id, full_name, department, hotel_id')
  .eq('hotel_status', 'CONFIRMED')
  .eq('travel_status', statusMap[transferClass])
  .eq('hotel_id', hotelMap[transferClass])
  .order('department').order('full_name')
~~~

---

### 2.4 CONFLICT DETECTION PASSEGGERI

**Apps Script** (04_Conflicts.gs: TS_buildPaxConflictFlagsMap_):
1. Raggruppa assegnazioni per crew_id + giorno
2. Ordina per Start_DT
3. Se b.start_dt < a.end_dt -> CONFLICT -> scrive nomePax in PaxConflict_Flag

**Supabase** - SQL query per trovare conflitti:
~~~sql
SELECT tp1.trip_row_id AS trip1, tp2.trip_row_id AS trip2, tp1.crew_id, c.full_name
FROM trip_passengers tp1
JOIN trip_passengers tp2 ON tp1.crew_id = tp2.crew_id AND tp1.trip_row_id != tp2.trip_row_id
JOIN trips t1 ON tp1.trip_row_id = t1.id
JOIN trips t2 ON tp2.trip_row_id = t2.id
JOIN crew c ON tp1.crew_id = c.id
WHERE t1.date = t2.date
  AND t1.start_dt < t2.end_dt AND t2.start_dt < t1.end_dt
  AND t1.production_id = 
~~~

Trigger PostgreSQL auto-aggiorna pax_conflict_flag su INSERT/DELETE in trip_passengers.

---

### 2.5 FLEET MONITOR

**Apps Script** (08_Sidebars.gs + FleetMonitor.html):
~~~
Per ogni veicolo:
1. Carica trip del giorno, raggruppa per trip_id (minStart/maxEnd per multi-dropoff)
2. Stato attuale: BUSY (start<=now<end) | FREE (trip futuri) | IDLE (0 trip) | DONE
3. Per BUSY: progressPct = (now-start)/(end-start)*100, ETA ritorno via Routes
4. Ordina: BUSY -> FREE -> IDLE -> DONE
5. Refresh automatico ogni 30s (setInterval nel HTML)
~~~

**Next.js** (components/FleetMonitor.jsx):
~~~javascript
// Aggrega multi-dropoff per trip_id
const grouped = trips.reduce((acc, t) => {
  if (!acc[t.trip_id]) acc[t.trip_id] = { ...t, minStart: new Date(t.start_dt), maxEnd: new Date(t.end_dt) }
  else {
    if (new Date(t.start_dt) < acc[t.trip_id].minStart) acc[t.trip_id].minStart = new Date(t.start_dt)
    if (new Date(t.end_dt) > acc[t.trip_id].maxEnd) acc[t.trip_id].maxEnd = new Date(t.end_dt)
  }
  return acc
}, {})
// Supabase Realtime subscription per update in tempo reale
~~~

---

### 2.6 VEHICLE AVAILABILITY

**Apps Script** (08_Sidebars.gs + VehicleAvailabilitySidebar.html):
~~~
Per il trip target con startDt/endDt/pickupId:
Per ogni veicolo -> tutti trip stesso giorno (escluso target):
  availableAt = maxEnd_trip_corrente + repositioning_min (lastDropoff->targetPickup)
  BUSY se: start_target < availableAt
Risultato: AVAILABLE | BUSY (con tripId bloccante e minuti attesa)
~~~

**Next.js** (API /api/vehicles/availability):
~~~javascript
for (const v of vehicles) {
  let busy = false, blockingTrip = null
  const vTrips = sameDayTrips.filter(t => t.vehicle_id === v.id)
  const grouped = groupByTripId(vTrips)
  for (const trip of grouped) {
    const repoMin = routeMap[trip.last_dropoff_id + '||' + pickupId] || 0
    const availMs = new Date(trip.maxEnd).getTime() + repoMin * 60000
    if (availMs > new Date(startDt).getTime() && new Date(trip.minStart) < new Date(endDt)) {
      busy = true; blockingTrip = trip.trip_id; break
    }
  }
  results.push({ vehicle: v, status: busy ? 'BUSY' : 'AVAILABLE', blockingTrip })
}
~~~

---

### 2.7 WRAP TRIP (mobile)

**Apps Script** (09_WrapTrip.gs + WrapTripApp.html):
~~~
Input: { date, pickupId, vehicle, passengers[], confirmTimestamp, serviceType }
1. Raggruppa passeggeri per hotel di destinazione
2. Per ogni hotel -> 1 riga Trips con stesso Trip_ID = W_HHMMSS
3. Call = ora locale confirmTimestamp (NON ora server UTC!)
4. Calcola durata da Routes per ogni hotel
5. Inserisce trip + trip_passengers
6. withDocLock_() per evitare race condition
~~~

**Next.js** (app/api/trips/wrap/route.js):
~~~javascript
const callTime = new Date(body.confirmTimestamp)  // ora client reale
const tripId = 'W_' + pad(callTime.getHours()) + pad(callTime.getMinutes()) + pad(callTime.getSeconds())
const byHotel = groupByHotel(body.passengers)
for (const [hotelId, group] of Object.entries(byHotel)) {
  const duration = await getRouteDuration(supabase, body.pickupId, hotelId)
  const times = calculateTripTimes({ date: body.date, transferClass: 'STANDARD',
    callMin: callTime.getHours()*60+callTime.getMinutes(), durationMin: duration })
  // INSERT trip + passengers in transaction
}
~~~
IMPORTANTE: usare transazione Supabase o Row-level lock per evitare duplicati.

---

### 2.8 TRAVEL STATUS AUTOMATION (IN -> PRESENT)

**Apps Script** (01_Crew.gs: tsAutoUpdateTravelStatusOnArrival, trigger ogni 5min):
~~~
Cerca ARRIVAL trip con End_DT nella finestra [lastRun, now]
Per ogni passeggero di quei trip:
  Se Travel_Status = IN -> aggiorna a PRESENT
  Se Travel_Status != IN (cambiato manuale) -> NON toccare (manuale vince sempre)
~~~

**Next.js** (app/api/cron/arrival-status/route.js + Vercel Cron):
~~~javascript
// vercel.json: { crons: [{ path: /api/cron/arrival-status, schedule: */5 * * * * }] }
const now = new Date()
const fiveMinAgo = new Date(now - 5*60*1000)
const { data: arrivals } = await supabase.from('trips')
  .select('id, trip_passengers(crew_id)')
  .eq('transfer_class', 'ARRIVAL')
  .gte('end_dt', fiveMinAgo.toISOString()).lte('end_dt', now.toISOString())
const crewIds = arrivals.flatMap(t => t.trip_passengers.map(p => p.crew_id))
await supabase.from('crew')
  .update({ travel_status: 'PRESENT' })
  .in('id', crewIds)
  .eq('travel_status', 'IN')  // NON toccare chi e gia cambiato manualmente
~~~

---

### 2.9 ROUTE DURATION (lookup + Haversine fallback)

**Apps Script** (03_Routes.gs: TS_getRouteDurationMin_):
~~~
1. Cerca in Routes sheet (from_id|to_id -> duration_min)
2. Fallback Haversine se rotta non trovata:
   - HUB->Hotel o Hotel->HUB: fattore 1.8
   - Hotel->Hotel:             fattore 1.4
   - Default:                  fattore 1.6
   - Velocita media 30 km/h, arrotonda ai 5 min, minimo 5 min
3. Source=MANUAL mai toccato da script automatici
~~~

**Next.js** (lib/routeDuration.js):
~~~javascript
export async function getRouteDuration(supabase, fromId, toId) {
  const { data } = await supabase.from('routes')
    .select('duration_min').eq('from_id', fromId).eq('to_id', toId).single()
  if (data) return data.duration_min
  // Haversine fallback
  const [f, t] = await Promise.all([
    supabase.from('locations').select('lat,lng,is_hub').eq('id', fromId).single(),
    supabase.from('locations').select('lat,lng,is_hub').eq('id', toId).single()
  ])
  if (!f.data || !t.data) return null
  const km = haversineKm(f.data.lat, f.data.lng, t.data.lat, t.data.lng)
  const factor = f.data.is_hub ? 1.8 : t.data.is_hub ? 1.8 : !f.data.is_hub && !t.data.is_hub ? 1.4 : 1.6
  return Math.max(5, Math.round(km * factor / 30 * 60 / 5) * 5)
}
~~~

---

### 2.10 QR CODE SYSTEM

**Apps Script** (01_Crew.gs: generateCrewQR, 07_FleetReports.gs: generateVehicleQR):
~~~
Formato: CR:CR0001 (crew) | VH:VAN-01 (veicolo)
URL QR:  webAppUrl?qr=CR:CR0001
API QR:  api.qrserver.com/v1/create-qr-code/?size=150x150&data=...
resolveQR() legge dati real-time: cambio nome/hotel NON richiede nuovo QR
Solo cambio Crew_ID o Vehicle_ID richiede rigenera QR
~~~

**Next.js**:
- URL QR: https://captaindispatch.com/scan?qr=CR:CR0001
- Pagina /scan risolve il codice via /api/qr/resolve
- QR generati con stessa API: api.qrserver.com

---

### 2.11 HUB COVERAGE ASSISTANT

**Apps Script** (08_Sidebars.gs + HubCoverageAssistant.html):
~~~
Per hub selezionato + data:
1. Expected: crew Travel_Status=IN (ARRIVAL) o OUT (DEPARTURE) per quell hotel
2. Assigned: crew gia in trip HUB del giorno
3. Status hotel: covered / partial / missing / extra
4. Raggruppa per volo (Flight_No + Arr_Time)
5. Suggerisce combo ottimale veicoli (max 4, backtracking con score minimo)
~~~

**Next.js** (components/HubCoverage.jsx + /api/hub-coverage/route.js):
Stessa logica, dati da Supabase. Algoritmo chooseBestVehicleCombo identico.

---

### 2.12 TRANSPORT LISTS

**Apps Script** (05_Lists.gs):
~~~
Transport_List:  trip STANDARD, raggruppati per Trip_ID, ordinati per Pickup_Time
Travel_List:     trip DEPARTURE+ARRIVAL, separati da sezioni, con volo/terminal/dept_time
Multi-dropoff:   intestazione gruppo con driver/sign + label dropoff multipli
Range > 1 giorno: separatori data visibili
~~~

**Next.js** (app/dashboard/lists/page.js):
Pagina HTML stampabile, CSS @media print, dati da Supabase.
Nessun PDF server-side: il browser stampa direttamente.

---

## 3. PRIORITA DI SVILUPPO

### FASE 1 — Core Operativo (settimane 1-3)
~~~
[ ] Database schema completo (tabelle + RLS + trigger passenger_list + trigger pax_conflict)
[ ] Script import Google Sheets -> Supabase (Node.js one-time)
[ ] lib/transferClass.js
[ ] lib/tripTimeCalculator.js (CRITICO — calcola Call/Start/End)
[ ] lib/routeDuration.js (lookup Routes + Haversine fallback)
[ ] /dashboard/fleet — Fleet Monitor realtime (Supabase subscriptions)
[ ] /dashboard/trips — lista trip per data, filtri, visualizzazione
[ ] /dashboard/crew — lista crew, edit Travel_Status manuale
[ ] CRUD trip completo con calcolo tempi automatico
~~~

### FASE 2 — Assignment Engine (settimane 4-5)
~~~
[ ] lib/crewCache.js con invalidazione via Supabase Realtime
[ ] /api/crew/available-for-trip — filtro hotel/status/transferClass
[ ] UI Pax Assignment — available/busy/assigned con add/remove
[ ] /api/vehicles/availability — conflict check + repositioning time
[ ] UI Vehicle Availability Sidebar — click per assegnare veicolo
[ ] Conflict detection pax (trigger SQL + Edge Function)
~~~

### FASE 3 — Automazioni (settimane 6-7)
~~~
[ ] Vercel Cron: ARRIVAL->PRESENT ogni 5 minuti
[ ] Alert partenze domani (email o notification in-app)
[ ] Hub Coverage Assistant (/api/hub-coverage + components/HubCoverage.jsx)
[ ] Transport Lists pagina stampabile (STANDARD + DEPARTURE/ARRIVAL)
[ ] System Refresh manuale (bottone ricalcolo conflitti + durate)
~~~

### FASE 4 — Mobile e Reports (settimana 8)
~~~
[ ] /scan — QR resolver mobile
[ ] /wrap-trip — Wrap Trip mobile (flusso WrapTripApp.html replicato)
[ ] Fleet Report Daily e Weekly
[ ] Export PDF via browser print (@media print CSS)
~~~

### FASE 5 — SaaS e Deploy (settimane 9-10)
~~~
[ ] Multi-produzione (production switcher in header)
[ ] User roles completi (CAPTAIN/MANAGER/PRODUCTION/ADMIN)
[ ] Deploy Vercel + captaindispatch.com
[ ] Integrazione ORS (OpenRouteService) per rotte reali
[ ] Onboarding: import Google Sheets per nuovi clienti
~~~

---

## 4. SUPABASE DATABASE SCHEMA

> Fonte: CAPTAIN_Context_S5.md §10 + logica estratta dalle sezioni §2.x di questo documento
> Stato: schema creato e funzionante su progetto Supabase "captaindispatch" (West EU - Ireland)

---

### 4.1 TABELLE PRINCIPALI

#### productions — multi-tenant root
~~~sql
CREATE TABLE productions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text NOT NULL,
  slug          text UNIQUE NOT NULL,          -- es. "palermo-2026"
  created_at    timestamptz DEFAULT now()
);
~~~

#### user_roles — ruoli per produzione
~~~sql
CREATE TABLE user_roles (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES auth.users(id),
  production_id   uuid NOT NULL REFERENCES productions(id),
  role            text NOT NULL CHECK (role IN ('CAPTAIN','MANAGER','PRODUCTION','ADMIN')),
  created_at      timestamptz DEFAULT now(),
  UNIQUE (user_id, production_id)
);
~~~

#### locations — Hotels + Hubs unificati (ex fogli Hotels + Hubs)
~~~sql
CREATE TABLE locations (
  id              text PRIMARY KEY,            -- es. "H001", "APT_PMO"
  production_id   uuid NOT NULL REFERENCES productions(id),
  name            text NOT NULL,
  is_hub          boolean NOT NULL DEFAULT false, -- true = APT_/STN_/PRT_
  lat             numeric(10,6),               -- getValues() NON getDisplayValues()
  lng             numeric(10,6),
  default_pickup_point text,                   -- Meeting_Point default
  created_at      timestamptz DEFAULT now()
);
-- Indice per lookup hub veloce
CREATE INDEX idx_locations_production ON locations(production_id);
CREATE INDEX idx_locations_is_hub     ON locations(is_hub);
~~~

> CRITICO: lat/lng come `numeric` — Google Sheets in italiano usa virgola come decimale.
> Apps Script usa `getValues()` (non `getDisplayValues()`) per leggere coordinate corrette.

#### routes — durate tra location (ex foglio Routes)
~~~sql
CREATE TABLE routes (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  production_id   uuid NOT NULL REFERENCES productions(id),
  from_id         text NOT NULL REFERENCES locations(id),
  to_id           text NOT NULL REFERENCES locations(id),
  duration_min    integer NOT NULL,
  source          text NOT NULL CHECK (source IN ('ORS','AUTO','MANUAL')),
  updated_at      timestamptz DEFAULT now(),
  UNIQUE (production_id, from_id, to_id)
);
-- Indice per lookup durata (hot path)
CREATE INDEX idx_routes_lookup ON routes(from_id, to_id);
~~~

> REGOLA: rotte con `source = 'MANUAL'` NON vengono mai toccate dagli script automatici.

#### service_types — tipi servizio configurabili (ex Lists!B)
~~~sql
CREATE TABLE service_types (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  production_id   uuid NOT NULL REFERENCES productions(id),
  name            text NOT NULL,               -- es. "UNIT SHUTTLE", "GRIP"
  sort_order      integer DEFAULT 0
);
~~~

#### vehicles — fleet (ex foglio Fleet)
~~~sql
CREATE TABLE vehicles (
  id              text PRIMARY KEY,            -- es. "VAN-01", "BUS-20"
  production_id   uuid NOT NULL REFERENCES productions(id),
  vehicle_type    text,                        -- VAN / CAR / BUS
  capacity        integer,
  driver_name     text,
  sign_code       text,                        -- es. "GRIP1", "PROD2"
  unit_default    text,
  active          boolean DEFAULT true,
  created_at      timestamptz DEFAULT now()
);
~~~

#### crew — anagrafica crew (ex foglio Crew_Master)
~~~sql
CREATE TABLE crew (
  id              text PRIMARY KEY,            -- es. "CR0001"
  production_id   uuid NOT NULL REFERENCES productions(id),
  full_name       text NOT NULL,
  department      text,
  hotel_id        text REFERENCES locations(id),
  hotel_status    text NOT NULL DEFAULT 'PENDING'
                  CHECK (hotel_status IN ('CONFIRMED','PENDING','CHECKED_OUT')),
  travel_status   text NOT NULL DEFAULT 'PRESENT'
                  CHECK (travel_status IN ('IN','OUT','PRESENT')),
  arrival_date    date,
  departure_date  date,
  notes           text,
  created_at      timestamptz DEFAULT now()
);
-- Indici per filtro assegnazione passeggeri (hot path)
CREATE INDEX idx_crew_hotel_status   ON crew(hotel_id, travel_status);
CREATE INDEX idx_crew_hotel_status_s ON crew(hotel_status);
~~~

> Solo crew con `hotel_status = 'CONFIRMED'` entra nella cache e può essere assegnata.

#### trips — tutti i trip (ex foglio Trips)
~~~sql
CREATE TABLE trips (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  production_id   uuid NOT NULL REFERENCES productions(id),
  trip_id         text NOT NULL,               -- es. "T001", "W_143022" (Wrap)
  date            date NOT NULL,
  vehicle_id      text REFERENCES vehicles(id),
  driver_name     text,                        -- denorm da Fleet (sync auto)
  sign_code       text,                        -- denorm da Fleet (sync auto)
  capacity        integer,                     -- denorm da Fleet (sync auto)
  pickup_id       text NOT NULL REFERENCES locations(id),
  dropoff_id      text NOT NULL REFERENCES locations(id),
  transfer_class  text GENERATED ALWAYS AS (  -- calcolato da pickup/dropoff
    CASE
      WHEN pickup_id  ~ '^(APT_|STN_|PRT_)' AND
           dropoff_id !~ '^(APT_|STN_|PRT_)' THEN 'ARRIVAL'
      WHEN pickup_id  !~ '^(APT_|STN_|PRT_)' AND
           dropoff_id  ~ '^(APT_|STN_|PRT_)' THEN 'DEPARTURE'
      ELSE 'STANDARD'
    END
  ) STORED,
  arr_time        time,                        -- orario volo/arrivo hub
  call_min        integer,                     -- minuti dalla mezzanotte
  pickup_min      integer,
  duration_min    integer,
  start_dt        timestamptz,
  end_dt          timestamptz,
  meeting_point   text,
  service_type_id uuid REFERENCES service_types(id),
  passenger_list  text,                        -- CSV denorm (aggiornato da trigger)
  pax_count       integer DEFAULT 0,
  pax_conflict_flag text,                      -- nomi pax in conflitto
  flight_no       text,
  notes           text,
  status          text DEFAULT 'PLANNED'
                  CHECK (status IN ('PLANNED','BUSY','DONE','CANCELLED')),
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);
-- Indici per Fleet Monitor, Vehicle Availability, Transport Lists
CREATE INDEX idx_trips_date          ON trips(date, production_id);
CREATE INDEX idx_trips_vehicle_date  ON trips(vehicle_id, date);
CREATE INDEX idx_trips_start_end     ON trips(start_dt, end_dt);
CREATE INDEX idx_trips_trip_id       ON trips(trip_id);        -- multi-dropoff groupby
~~~

> `transfer_class` è GENERATED ALWAYS AS STORED — mai scrivere questo campo direttamente.
> `passenger_list`, `pax_count`, `pax_conflict_flag` sono aggiornati da trigger PostgreSQL.
> Multi-dropoff: stesso `trip_id`, righe separate con `dropoff_id` diversi.

#### trip_passengers — assegnazioni pax ↔ trip (ex foglio Trip_Passengers)
~~~sql
CREATE TABLE trip_passengers (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  production_id   uuid NOT NULL REFERENCES productions(id),
  trip_row_id     uuid NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  crew_id         text NOT NULL REFERENCES crew(id),
  assigned_at     timestamptz DEFAULT now(),
  UNIQUE (trip_row_id, crew_id)
);
-- Indici per conflict detection e lookup
CREATE INDEX idx_tp_trip_row  ON trip_passengers(trip_row_id);
CREATE INDEX idx_tp_crew      ON trip_passengers(crew_id);
~~~

---

### 4.2 ROW LEVEL SECURITY (RLS)

RLS abilitato su tutte le tabelle. Schema base:

~~~sql
-- Esempio su trips (stesso pattern per tutte le tabelle)
ALTER TABLE trips ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own production"
  ON trips FOR ALL
  USING (
    production_id IN (
      SELECT production_id FROM user_roles
      WHERE user_id = auth.uid()
    )
  );
~~~

Ruoli e permessi:
| Ruolo | Lettura | Scrittura trip | Edit crew | Admin |
|---|---|---|---|---|
| CAPTAIN | ✅ | ✅ | ✅ | ❌ |
| MANAGER | ✅ | ✅ | ✅ | ❌ |
| PRODUCTION | ✅ | ❌ | ❌ | ❌ |
| ADMIN | ✅ | ✅ | ✅ | ✅ |

---

### 4.3 TRIGGER POSTGRESQL

#### Trigger 1 — aggiorna passenger_list e pax_count
~~~sql
-- Si attiva su INSERT/DELETE in trip_passengers
CREATE OR REPLACE FUNCTION update_trip_passenger_list()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE trips SET
    passenger_list = (
      SELECT string_agg(c.full_name, ', ' ORDER BY c.department, c.full_name)
      FROM trip_passengers tp JOIN crew c ON tp.crew_id = c.id
      WHERE tp.trip_row_id = COALESCE(NEW.trip_row_id, OLD.trip_row_id)
    ),
    pax_count = (
      SELECT COUNT(*) FROM trip_passengers
      WHERE trip_row_id = COALESCE(NEW.trip_row_id, OLD.trip_row_id)
    )
  WHERE id = COALESCE(NEW.trip_row_id, OLD.trip_row_id);
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_update_passenger_list
AFTER INSERT OR DELETE ON trip_passengers
FOR EACH ROW EXECUTE FUNCTION update_trip_passenger_list();
~~~

#### Trigger 2 — conflict detection passeggeri
~~~sql
-- Aggiorna pax_conflict_flag su INSERT/DELETE in trip_passengers
CREATE OR REPLACE FUNCTION update_pax_conflict_flags()
RETURNS TRIGGER AS $$
DECLARE
  affected_crew_id text := COALESCE(NEW.crew_id, OLD.crew_id);
BEGIN
  -- Ricalcola conflitti per tutte le righe trip che coinvolgono questo crew oggi
  WITH conflicts AS (
    SELECT tp1.trip_row_id AS trip1, tp2.trip_row_id AS trip2,
           c.full_name
    FROM trip_passengers tp1
    JOIN trip_passengers tp2
      ON tp1.crew_id = tp2.crew_id
     AND tp1.trip_row_id != tp2.trip_row_id
    JOIN trips t1 ON tp1.trip_row_id = t1.id
    JOIN trips t2 ON tp2.trip_row_id = t2.id
    JOIN crew c   ON tp1.crew_id = c.id
    WHERE tp1.crew_id = affected_crew_id
      AND t1.date = t2.date
      AND t1.start_dt < t2.end_dt
      AND t2.start_dt < t1.end_dt
  )
  UPDATE trips SET pax_conflict_flag = (
    SELECT string_agg(DISTINCT c2.full_name, ', ')
    FROM conflicts cf2
    JOIN crew c2 ON cf2.trip1 = trips.id
    WHERE cf2.trip1 = trips.id
  )
  WHERE id IN (SELECT trip1 FROM conflicts UNION SELECT trip2 FROM conflicts);
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_pax_conflict
AFTER INSERT OR DELETE ON trip_passengers
FOR EACH ROW EXECUTE FUNCTION update_pax_conflict_flags();
~~~

> Equivalente di `TS_buildPaxConflictFlagsMap_()` in 04_Conflicts.gs.
> Query diretta per conflict detection (senza rebuild completo):

~~~sql
SELECT tp1.trip_row_id AS trip1, tp2.trip_row_id AS trip2,
       tp1.crew_id, c.full_name
FROM trip_passengers tp1
JOIN trip_passengers tp2
  ON tp1.crew_id = tp2.crew_id AND tp1.trip_row_id != tp2.trip_row_id
JOIN trips t1 ON tp1.trip_row_id = t1.id
JOIN trips t2 ON tp2.trip_row_id = t2.id
JOIN crew c   ON tp1.crew_id = c.id
WHERE t1.date = t2.date
  AND t1.start_dt < t2.end_dt
  AND t2.start_dt < t1.end_dt
  AND t1.production_id = $1;
~~~

---

### 4.4 INDICI — RIEPILOGO
~~~
trips(date, production_id)         → Transport Lists, Fleet Monitor
trips(vehicle_id, date)            → Vehicle Availability
trips(start_dt, end_dt)            → conflict detection
trips(trip_id)                     → raggruppamento multi-dropoff
trip_passengers(trip_row_id)       → load pax per trip
trip_passengers(crew_id)           → conflict detection per crew
crew(hotel_id, travel_status)      → filtro assegnazione passeggeri
crew(hotel_status)                 → crew cache (solo CONFIRMED)
routes(from_id, to_id)             → route duration lookup (hot path)
locations(is_hub)                  → Haversine fallback, transfer_class
~~~

---

### 4.5 NOTE IMPORTANTI
~~~
- production_id su OGNI tabella — isolamento completo multi-tenant
- transfer_class: GENERATED ALWAYS AS STORED — non scrivere mai direttamente
- Source=MANUAL in routes: mai sovrascrivere con script automatici
- Coordinate lat/lng: usare numeric(10,6), NON float — evitare problemi decimale IT
- Wrap Trip (Trip_ID "W_HHMMSS"): usa transazione o lock per evitare duplicati
- Travel_Status: il manuale vince SEMPRE sull'automatico (trigger Vercel Cron)
~~~

---

## 5. ARCHITETTURA FILE NEXT.JS

> Stack: Next.js 16.2.1 (App Router) + Supabase + Vercel
> Linguaggio: JavaScript (NON TypeScript, eccetto file di config generati da Next.js)
> CSS: Tailwind CSS
> Repo: `C:\Users\WKS\Desktop\captaindispatch`

---

### 5.1 STRUTTURA ATTUALE (funzionante al 24 marzo 2026)

~~~
captaindispatch/
├── app/
│   ├── page.tsx                    → redirect('/login')
│   ├── layout.tsx                  → root layout (font, metadata)
│   ├── globals.css                 → Tailwind base styles
│   ├── favicon.ico
│   ├── login/
│   │   └── page.js                 → ✅ Login Google OAuth (FUNZIONANTE)
│   ├── auth/
│   │   └── callback/
│   │       └── route.js            → ✅ OAuth callback handler (FUNZIONANTE)
│   └── dashboard/
│       └── page.js                 → ✅ Dashboard con 3 card (FUNZIONANTE)
├── lib/
│   └── supabase.js                 → createBrowserClient
├── public/
│   ├── file.svg
│   ├── globe.svg
│   ├── next.svg
│   ├── vercel.svg
│   └── window.svg
├── captain-sheets/                 → Google Apps Script (sistema legacy)
│   ├── 00_Config.gs  … 10_Maps.gs
│   └── *.html
├── .env.local                      → SUPABASE_URL + ANON_KEY
├── next.config.ts
├── tsconfig.json
├── package.json
└── AGENTS.md / CAPTAIN_Analysis.md / CAPTAIN_Context_S5.md
~~~

---

### 5.2 STRUTTURA TARGET (architettura completa da costruire)

~~~
captaindispatch/
│
├── app/                            → Next.js App Router
│   │
│   ├── layout.tsx                  → root layout
│   ├── page.tsx                    → redirect('/dashboard') se autenticato
│   ├── globals.css
│   │
│   ├── login/
│   │   └── page.js                 → ✅ Login Google OAuth
│   │
│   ├── auth/
│   │   └── callback/
│   │       └── route.js            → ✅ OAuth callback
│   │
│   ├── dashboard/
│   │   ├── layout.js               → sidebar nav + header produzione
│   │   ├── page.js                 → ✅ overview card (Fleet/Trips/Crew)
│   │   │
│   │   ├── fleet/
│   │   │   └── page.js             → ⏳ Fleet Monitor realtime
│   │   │
│   │   ├── trips/
│   │   │   ├── page.js             → ⏳ Lista trip per data + filtri
│   │   │   └── [id]/
│   │   │       └── page.js         → ⏳ Dettaglio/edit singolo trip
│   │   │
│   │   ├── crew/
│   │   │   ├── page.js             → ⏳ Lista crew + edit Travel_Status
│   │   │   └── [id]/
│   │   │       └── page.js         → ⏳ Dettaglio crew
│   │   │
│   │   ├── vehicles/
│   │   │   └── page.js             → ⏳ Gestione fleet
│   │   │
│   │   └── lists/
│   │       └── page.js             → ⏳ Transport Lists stampabili
│   │
│   ├── scan/
│   │   └── page.js                 → ⏳ QR resolver mobile (?qr=CR:CR0001)
│   │
│   ├── wrap-trip/
│   │   └── page.js                 → ⏳ Wrap Trip mobile (flusso 4 step)
│   │
│   └── api/
│       │
│       ├── trips/
│       │   ├── route.js            → ⏳ GET lista trip, POST crea trip
│       │   ├── [id]/
│       │   │   └── route.js        → ⏳ GET/PATCH/DELETE singolo trip
│       │   └── wrap/
│       │       └── route.js        → ⏳ POST Wrap Trip da mobile
│       │
│       ├── crew/
│       │   ├── route.js            → ⏳ GET lista crew, POST crea crew
│       │   └── available-for-trip/
│       │       └── route.js        → ⏳ GET crew disponibile (hotel/status/class)
│       │
│       ├── vehicles/
│       │   └── availability/
│       │       └── route.js        → ⏳ GET vehicle availability check
│       │
│       ├── hub-coverage/
│       │   └── route.js            → ⏳ GET analisi copertura hub
│       │
│       ├── qr/
│       │   └── resolve/
│       │       └── route.js        → ⏳ GET resolve QR (CR:xxx / VH:xxx)
│       │
│       └── cron/
│           └── arrival-status/
│               └── route.js        → ⏳ Vercel Cron: ARRIVAL→PRESENT ogni 5min
│
├── components/
│   ├── FleetMonitor.jsx            → ⏳ Fleet Monitor (Supabase Realtime)
│   ├── VehicleAvailability.jsx     → ⏳ Vehicle Availability sidebar
│   ├── PaxAssignment.jsx           → ⏳ Pax Assignment (available/busy/assigned)
│   ├── HubCoverage.jsx             → ⏳ Hub Coverage Assistant
│   ├── TripForm.jsx                → ⏳ Form creazione/edit trip
│   ├── TripTimeDisplay.jsx         → ⏳ Visualizza Call/Pickup/Start/End
│   └── ui/
│       ├── Badge.jsx               → ⏳ BUSY/FREE/IDLE/DONE badges
│       ├── ProgressBar.jsx         → ⏳ barra progresso trip in corso
│       └── DatePicker.jsx          → ⏳ selettore data
│
├── lib/
│   ├── supabase.js                 → ✅ createBrowserClient
│   ├── supabaseServer.js           → ⏳ createServerClient (Route Handlers)
│   ├── tripTimeCalculator.js       → ⏳ calcola Call/Pickup/Start/End_DT
│   ├── routeDuration.js            → ⏳ lookup Routes + Haversine fallback
│   ├── crewCache.js                → ⏳ cache crew CONFIRMED + Realtime invalidate
│   ├── transferClass.js            → ⏳ ARRIVAL/DEPARTURE/STANDARD logic
│   └── haversine.js                → ⏳ Haversine distance km
│
├── scripts/
│   └── importFromSheets.js         → ⏳ import one-time Google Sheets → Supabase
│
├── vercel.json                     → ⏳ Cron: /api/cron/arrival-status */5 * * * *
│
├── .env.local                      → ✅ SUPABASE_URL + ANON_KEY
├── next.config.ts
├── tsconfig.json
└── package.json
~~~

---

### 5.3 FILE LIB — DIPENDENZE E ORDINE DI BUILD

~~~
Ordine consigliato (ogni file dipende dai precedenti):

1. lib/haversine.js           → utility pura, zero dipendenze
2. lib/transferClass.js       → utility pura, zero dipendenze
3. lib/supabase.js            → ✅ già presente
4. lib/supabaseServer.js      → dipende da @supabase/ssr
5. lib/routeDuration.js       → dipende da haversine + supabaseServer
6. lib/tripTimeCalculator.js  → dipende da transferClass (logica ARRIVAL/DEP/STD)
7. lib/crewCache.js           → dipende da supabase + Realtime subscription
~~~

---

### 5.4 API ROUTES — CONTRATTI

| Route | Metodo | Input | Output |
|---|---|---|---|
| /api/trips | GET | `?date=&production_id=` | array trips con pax |
| /api/trips | POST | `{ trip_id, date, pickup_id, dropoff_id, vehicle_id, arr_time, call_min, ... }` | trip creato |
| /api/trips/[id] | PATCH | campi da aggiornare | trip aggiornato |
| /api/trips/wrap | POST | `{ date, pickupId, vehicleId, passengers[], confirmTimestamp, serviceType }` | trip/s creati |
| /api/crew/available-for-trip | GET | `?trip_id=&transfer_class=&pickup_id=&dropoff_id=` | crew disponibile |
| /api/vehicles/availability | GET | `?date=&start_dt=&end_dt=&pickup_id=` | veicoli AVAILABLE/BUSY |
| /api/qr/resolve | GET | `?qr=CR:CR0001` | `{ type:'crew', data:{...} }` |
| /api/cron/arrival-status | GET | — (Vercel Cron, autenticato) | `{ updated: n }` |

---

### 5.5 VARIABILI D'AMBIENTE

~~~bash
# .env.local (sviluppo)
NEXT_PUBLIC_SUPABASE_URL=https://lvxtvgxyancpegvfcnsk.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=...

# .env.production (Vercel → Environment Variables)
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
CRON_SECRET=...                    # per autenticare /api/cron/*
~~~

---

### 5.6 CONFIGURAZIONE VERCEL CRON

~~~json
// vercel.json
{
  "crons": [
    {
      "path": "/api/cron/arrival-status",
      "schedule": "*/5 * * * *"
    }
  ]
}
~~~

Equivalente di `tsSetupArrivalTrigger()` in Apps Script (06_Triggers.gs).

---

### 5.7 SUPABASE REALTIME — CANALI USATI

| Canale | Tabella | Evento | Usato da |
|---|---|---|---|
| `fleet-monitor` | trips | INSERT/UPDATE/DELETE | FleetMonitor.jsx |
| `crew-cache` | crew | * | lib/crewCache.js (invalida cache) |
| `trip-passengers` | trip_passengers | INSERT/DELETE | PaxAssignment.jsx |
| `conflicts` | trips | UPDATE (pax_conflict_flag) | TripForm.jsx |

---

