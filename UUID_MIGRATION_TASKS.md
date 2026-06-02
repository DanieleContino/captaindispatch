# UUID Migration — Task File Completo
> Branch: `master` (uuid-migration mergiato — commit `2c68997`) | Aggiornato: 2026-05-31 S17d

---

## 🏛️ REGOLE della migrazione (non dimenticare)

| Tabella | OLD (TEXT PK) | NEW (UUID PK) | Display (old text) |
|---------|--------------|--------------|-------------------|
| `locations` | `id` TEXT | `uuid` UUID | `id` TEXT ancora presente |
| `crew` | `id` TEXT | `uuid` UUID | `id` TEXT ancora presente |
| `vehicles` | `id` TEXT | `uuid` UUID | `id` TEXT ancora presente |

**Cosa è cambiato nelle FK:**
- `trips.vehicle_id` → ora UUID (`vehicles.uuid`)
- `trips.pickup_id`, `trips.dropoff_id` → ora UUID (`locations.uuid`)
- `trips.passenger_list` / `trip_passengers.crew_id` → ora UUID (`crew.uuid`)
- `crew.hotel_id` → ora UUID (`locations.uuid`)
- `vehicles.driver_crew_id` → ora UUID (`crew.uuid`)
- `routes.from_id`, `routes.to_id` → ora UUID (`locations.uuid`)

**Pattern del fix:** `.eq('id', x)` → `.eq('uuid', x)` per le FK, ma `.eq('id', x)` resta OK per lookup con il vecchio text display id.

**Pattern standard post-migrazione:**
```js
// SELECT — sempre includere uuid e display_id
.select('uuid, display_id, ...')

// ORDER — sempre su display_id, mai su id
.order('display_id')

// Lookup maps
locsById = Object.fromEntries(locs.map(l => [l.uuid, l.name]))

// Find in list — sempre uuid
crewList.find(c => c.uuid === cid)
vehicleList.find(v => v.uuid === vid)

// Display label — sempre display_id con fallback
{v.display_id || v.id}
```

---

## ⚠️ REGOLA CRITICA PER CLINE: SEARCH/REPLACE SU RIGHE LUNGHE

`vehicles/page.js` ha righe molto lunghe (template literals, inline queries).
Cline fallisce i SEARCH/REPLACE quando la stringa è troppo lunga.

**Strategia corretta:**
1. Fare `read_file` sulle righe specifiche PRIMA di scrivere il SEARCH
2. Usare solo una porzione CORTA e UNICA della riga come SEARCH (8-15 parole max)
3. Per template literals (backtick), cercare solo la parte interna distintiva
4. Mai incollare l'intera riga — trovare il sottostringa univoco più corto

---

## ✅ GIÀ COMPLETATO — NON RIFARE

```
SQL migration DB (locations, crew, vehicles) .................. ✅
Fix A1/A2 — accommodation/page.js (syncCrewDates, removeFamilyMember) ✅
Fix B1/B2/B3 — CrewInfoModal + go/session/route.js + go/trip/start/route.js ✅
Fix N1-N6 — NccDriverSidebar.js + NccVehicleSidebar.js ......... ✅
Fix V1-V9 — dashboard/vehicles/page.js ........................ ✅
Fix C1 — lib/routeDuration.js (locations uuid) ................ ✅
Fix C2-C3 — hub-coverage/page.js + pax-coverage/page.js ....... ✅
Fix E — go/data/route.js + go/wrap/route.js ................... ✅ [97e4fe8]
Fix D3+D4 — qr/resolve/route.js .............................. ✅
Fix G — wrap-trip/page.js FleetMonitor + WrapTripContent ....... ✅ [26135a9]
Fix H — go/[token]/page.js locsMap + crew uuid ................ ✅ [ca92b70]
Fix D1+D2 — crew/merge + go/ping use uuid ..................... ✅ [95e966f]
Fix D5+D6 — trips/quick-create use uuid ....................... ✅ [c06facf]
S10 lib/tripUtils.js — audit: nessuna modifica necessaria ...... ✅ [S10]
S7 routes API audit — fleet/map-data, routes/compute, compute-chain,
  optimize-waypoints, refresh-all-locations, refresh-location ... ✅ [9deb3fd]
S7 trips components — TripSidebar, EditTripSidebar, ReplicaDayModal ✅ [9deb3fd]
S7 traffic+routes — traffic-check/route.js, refreshRoutesWithGoogle ✅ [1b66af0]
S7 EditTripSidebar fix — pendingPax crew_id: c.uuid ............ ✅ [1b66af0]
S7 locations/page.js — refresh-location chiama con uuid ........ ✅ [1b66af0]
S8 travel/page.js — audit: già corretto (crew uuid, .eq(uuid) ok) ✅ [S8]
S9 TripSidebar.js — getClass usa locUuidToTextId, crew_id c.uuid ✅ [2538642]
S9 EditTripSidebar.js — getClass×3 (L171/398/499) + busyMap×11 c.uuid ✅ [2538642]
uuid-migration → master merge .................................. ✅ [2c68997]
S96 vehicles T1 — VehicleRow mostra display_id || id .......... ✅
S96 vehicles T2 — load() ordina per display_id ................ ✅
S96 vehicles T3 — selectAll usa uuid .......................... ✅
S96 vehicles preferred crew — lookup usa c.uuid ............... ✅
S96 vehicles NccTab — select include uuid, display_id ......... ✅
S11a accommodation A1-A4 — uuid in crew_stays insert/update ... ✅ [mergiato]
S11a bridge B1-B4 — primaryCrewUuid + locations uuid select ... ✅ [mergiato]
S11b bridge B5-B13 — TravelDiscrepanciesWidget eq uuid ........ ✅ [confermato lettura file]
S12 vehicles T4 — ComodatoTab select uuid+display_id+order .... ✅
S12 vehicles T5 — ComodatoTab mostra display_id || id .......... ✅
S12 vehicles T6 — ComodatoTab owner lookup c.uuid ............. ✅
S12 vehicles T7 — LoanVehicleSidebar ownerCrew lookup c.uuid .. ✅
S13 vehicles T8a — rental filter productionFiltered display_id  ✅
S13 vehicles T8b — rental filter filtered display_id .............. ✅
Fix S14 F1 — fleet/page.js vehicles order by display_id ........... ✅
Fix S14 Q1 — qr-codes/page.js vehicles order by display_id ........ ✅
Fix S15 R1 — rocket loadData crew select includes uuid ............. ✅
Fix S15 R2 — rocket loadData vehicles select includes uuid ......... ✅
Fix S15 R3 — rocket handleConfirm vehicle_id uses uuid ............. ✅
Fix S15 R4 — rocket handleConfirm trip_passengers uses crew uuid ... ✅
Fix S15 R5 — rocket vehicle display label uses display_id .......... ✅
Fix S17a V10 — NccTab vehicles select uuid+display_id, order(display_id) ✅ [7b576fd]
Fix S17a V11 — VehicleSidebar preferred crew chips lookup c.uuid ... ✅ [7b576fd]
Fix S17a V12 — VehicleRow preferred crew display lookup c.uuid ..... ✅ [7b576fd]
Fix S17b W1/W2/W3 — wrap-trip SendLinksModal+page.js order display_id ✅ [fd9cccd]
Fix S17c QT-1 — QuickTripModal vehicleId usa vehicle.uuid ........... ✅ [b13624e]
Fix S17c QT-2 — QuickTripModal hotel_id lookup usa l.uuid ........... ✅ [b13624e]
Fix S17d QT-3/QT-4 — QuickTripModal resolve TEXT→UUID in createTrip . ✅ [b13624e]
Fix S17c+S17d — AIBuilderTab crew+locations select include uuid ...... ✅ [b13624e]
Fix SA3 — QuickTripModal LEGS+Standard branch vehicleId uses uuid .... ✅ [b8ae772]
Fix SA7a P1 — productions/page.js 5 uuid fixes (hub locations) ....... ✅ [8813b67]
Fix SA7a P2 — lists-v2/page.js — OK nessun fix ...................... ✅ [8813b67]
Fix SA7a P3 — reports/page.js — OK nessun fix ........................ ✅ [8813b67]
Fix SA7b SP1 — settings/production HubLocationsSection update .eq(uuid) ✅
Fix SA7b SP2-SP6 — settings/production hub key+display_id ×5 ......... ✅
Fix SA7b settings/page.js — OK nessun fix ............................. ✅
Fix SA7b cost-report/page.js — OK nessun fix .......................... ✅
```

---

## 📋 SESSIONI — STORICO E STATO

### ~~🔧 SESSIONI 0-11a~~ ✅ COMPLETATE
Vedi sezione "GIÀ COMPLETATO" sopra.

---

### ~~🔧 SESSIONE S11b~~ ✅ Fix `bridge/page.js` B5-B13 COMPLETATO
> `TravelDiscrepanciesWidget` — 9 fix su `.eq('id', ...)` → `.eq('uuid', ...)`

Vedi storico sessioni precedenti — completato.

---

### ~~🔧 SESSIONI S12-S15~~ ✅ COMPLETATE
Vedi sezione "GIÀ COMPLETATO" sopra.

---

### ~~🔧 SESSIONE S16~~ ✅ git push + test produzione
> Completato 2026-05-31 — git push eseguito

```
[x] git push origin master ............................................. ✅
[ ] Test produzione su captaindispatch.com
[ ] Test vehicles: ComodatoTab mostra display_id, search funziona
[ ] Test fleet: veicoli ordinati per display_id
[ ] Test qr-codes: veicoli ordinati per display_id
[ ] Test rocket: crea trip da rocket, verifica vehicle_id e crew_id UUID nel DB
[ ] Test bridge: risolvi hotel conflict, verifica uuid corretto
[ ] Se OK → chiudere migrazione UUID
```

---

### ~~🔧 SESSIONE S17a~~ ✅ `vehicles/page.js` V10/V11/V12 COMPLETATO
> Commit `7b576fd` — 3 fix — NccTab order display_id + preferred crew lookup uuid

#### Task V10 — NccTab: vehicles ordina per display_id (~L2950)

Righe da leggere prima: 2947-2953

SEARCH:
```
supabase.from('vehicles').select('id, vehicle_type, ncc_agency_id').eq('production_id', productionId).eq('is_ncc', true).order('id')
```
REPLACE:
```
supabase.from('vehicles').select('uuid, id, display_id, vehicle_type, ncc_agency_id').eq('production_id', productionId).eq('is_ncc', true).order('display_id')
```
Commit: `"Fix vehicles S17a V10: NccTab vehicles order by display_id"`

#### Task V11 — edit form preferred crew lookup usa uuid (~L2466)

Righe da leggere prima: 2463-2468

SEARCH (corta e univoca):
```
const cm = crewList.find(c => c.id === cid)
          if (!cm) return null
          return (
            <span key={cid} style={{ display: 'inline-flex',
```
REPLACE:
```
const cm = crewList.find(c => c.uuid === cid)
          if (!cm) return null
          return (
            <span key={cid} style={{ display: 'inline-flex',
```
Commit: `"Fix vehicles S17a V11: preferred_crew edit form lookup uses uuid"`

#### Task V12 — VehicleRow preferred crew lookup usa uuid (~L4202)

Righe da leggere prima: 4199-4207

SEARCH (corta e univoca):
```
const cm = crewList.find(c => c.id === cid)
                    if (!cm) return null
                    return (
                      <span key={cid} style={{ padding: '2px 10px',
```
REPLACE:
```
const cm = crewList.find(c => c.uuid === cid)
                    if (!cm) return null
                    return (
                      <span key={cid} style={{ padding: '2px 10px',
```
Commit: `"Fix vehicles S17a V12: preferred_crew VehicleRow display uses uuid"`

---

### 🔧 SESSIONE S17b — `wrap-trip/` W1/W2/W3
> Audit S97: 3 fix `.order('id')` → `.order('display_id')` su vehicles

#### Task W1 — SendLinksModal.js: vehicles ordina per display_id (~L21)

File: `app/wrap-trip/components/SendLinksModal.js`

Righe da leggere prima: 15-22

SEARCH:
```
        .eq('active', true)
        .eq('in_transport', true)
        .order('id')
```
REPLACE:
```
        .eq('active', true)
        .eq('in_transport', true)
        .order('display_id')
```
Commit: `"Fix wrap-trip S17b W1: SendLinksModal vehicles order by display_id"`

#### Task W2 — wrap-trip/page.js: prima query vehicles ordina per display_id (~L206)

File: `app/wrap-trip/page.js`

Righe da leggere prima: 204-208

SEARCH (prima occorrenza — ha `id,driver_name` senza display_id nel select):
```
      supabase.from('vehicles').select('uuid,id,driver_name,sign_code,capacity,vehicle_type').eq('production_id', PRODUCTION_ID).eq('active', true).order('id'),
```
REPLACE:
```
      supabase.from('vehicles').select('uuid,id,display_id,driver_name,sign_code,capacity,vehicle_type').eq('production_id', PRODUCTION_ID).eq('active', true).order('display_id'),
```
Commit: `"Fix wrap-trip S17b W2: wrap-trip page vehicles order by display_id (first)"`

#### Task W3 — wrap-trip/page.js: seconda query vehicles ordina per display_id (~L538)

Righe da leggere prima: 536-540 (DOPO W2, il select ha già display_id — leggere righe per testo esatto aggiornato)

SEARCH (seconda occorrenza — dopo W2 avrà già `display_id` nel select):
```
      supabase.from('vehicles').select('uuid,id,display_id,driver_name,sign_code,capacity,vehicle_type').eq('production_id', PRODUCTION_ID).eq('active', true).order('id'),
```
REPLACE:
```
      supabase.from('vehicles').select('uuid,id,display_id,driver_name,sign_code,capacity,vehicle_type').eq('production_id', PRODUCTION_ID).eq('active', true).order('display_id'),
```
Commit: `"Fix wrap-trip S17b W3: wrap-trip page vehicles order by display_id (second)"`

---

### 🔧 SESSIONE S17c — `fleet/components/QuickTripModal.js` QT-1 + QT-2
> Audit S97: 2 fix semplici — vehicleId uuid + hotel_id location lookup

**IMPORTANTE:** Fare `read_file` delle righe specifiche PRIMA di ogni SEARCH.
File: `app/dashboard/fleet/components/QuickTripModal.js` (~1193 righe)

#### Task QT-1 — vehicleId usa uuid (~L418) — CRITICO

L'API `quick-create` fa `.eq('uuid', vehicleId)` ma il client invia `vehicle.id` (TEXT) → veicolo mai trovato → trip creation fallisce silenziosamente.

Righe da leggere prima: 413-427

SEARCH:
```
          vehicleId:    vehicle.id,
```
REPLACE:
```
          vehicleId:    vehicle.uuid || vehicle.id,
```
Commit: `"Fix QuickTripModal S17c QT-1: vehicleId uses uuid (CRITICAL)"`

#### Task QT-2 — handleRowPersonSelect hotel_id lookup usa l.uuid (~L642)

`person.hotel_id` è ora UUID (FK a `locations.uuid`), ma il lookup usa `l.id` (TEXT) → hotel auto-fill sempre null.

Righe da leggere prima: 639-650

SEARCH:
```
    const hotel  = person?.hotel_id ? locations.find(l => l.id === person.hotel_id) : null
```
REPLACE:
```
    const hotel  = person?.hotel_id ? locations.find(l => l.uuid === person.hotel_id) : null
```
Commit: `"Fix QuickTripModal S17c QT-2: hotel_id lookup uses l.uuid"`

---

### 🔧 SESSIONE S17d — `fleet/components/QuickTripModal.js` QT-3 + QT-4
> Audit S97: resolve TEXT→UUID per crew ids e location ids in createTrip()

**Prerequisito:** S17c completato.

**Contesto:** L'AI trip-builder restituisce TEXT ids (es. `"LOC-01"`, `"CREW-01"`) per pickup_id, dropoff_id, passenger_ids. Ma l'API `quick-create` (non-LEGS mode) si aspetta UUID:
- L195-198: `.in('uuid', passengerIds)` — vuole UUID crew
- L217-219: `.eq('from_id', pickupId)` — routes usa UUID
- L248-249: `pickup_id: pickupId` / `dropoff_id: dropoffId` — trips FK UUID

**Strategia fix in `createTrip()` (~L366-434):**

Righe da leggere prima: 392-430

SEARCH (righe 397-399 — leggere prima per testo esatto):
```
      const firstPickup = resolvedLegs[0].pickup_id
      const allDropoffs = [...new Set(resolvedLegs.map(l => l.dropoff_id).filter(Boolean))]
      const allPassengerIds = [...new Set(resolvedLegs.flatMap(l => l.passenger_ids || []))]
```
REPLACE:
```
      // Risolvi TEXT ids → UUID (l'AI restituisce TEXT id, l'API si aspetta UUID)
      const locTextToUuid = {}
      for (const loc of locations) { if (loc.id) locTextToUuid[loc.id] = loc.uuid }
      const crewTextToUuid = {}
      for (const c of crew) { if (c.id) crewTextToUuid[c.id] = c.uuid }
      const uuidLegs = resolvedLegs.map(leg => ({
        ...leg,
        pickup_id:     locTextToUuid[leg.pickup_id]  || leg.pickup_id,
        dropoff_id:    locTextToUuid[leg.dropoff_id] || leg.dropoff_id,
        passenger_ids: (leg.passenger_ids || []).map(id => crewTextToUuid[id] || id),
      }))
      const firstPickup = uuidLegs[0].pickup_id
      const allDropoffs = [...new Set(uuidLegs.map(l => l.dropoff_id).filter(Boolean))]
      const allPassengerIds = [...new Set(uuidLegs.flatMap(l => l.passenger_ids || []))]
```
Commit: `"Fix QuickTripModal S17d QT-3/QT-4: resolve TEXT ids to UUID before API call"`

> **Prerequisito crew/locations in scope:** verificare che `crew` e `locations` siano accessibili dentro `createTrip()`. Sono props del componente caricate da `fleet/page.js`. Se non in scope, aggiungere al destructuring dei props.

---

### 🔧 SESSIONE S19 — Captain Go API: vehicle.id → vehicle.uuid (6 fix)
> Scoperto 2026-06-02 — Bug: pulsante "End" in Captain Go dà "No active session" ma rimane connesso.
> Root cause: dopo la UUID migration, `vehicle.id` (undefined) usato al posto di `vehicle.uuid` nelle query session lookup del branch CREW. Stesso problema in branch NCC di `arrive` e `position` dove il select ncc_drivers non include `id`.

**File coinvolti:** `session/end`, `trip/start`, `trip/arrive`, `position`

#### Task GO-1 — `session/end/route.js` riga 62 — CRITICO ⚠️

```
SEARCH:
      sessionQuery = sessionQuery.eq('vehicle_id', vehicle.id)
    }
  }

  const { data: session } = await sessionQuery.single()

  if (!session) return Response.json({ error: 'No active session' }

REPLACE:
      sessionQuery = sessionQuery.eq('vehicle_id', vehicle.uuid)
    }
  }

  const { data: session } = await sessionQuery.single()

  if (!session) return Response.json({ error: 'No active session' }
```
Commit: `"Fix GO-1: session/end CREW branch vehicle.uuid (No active session bug)"`

#### Task GO-2 — `trip/start/route.js` riga 66

Branch CREW per GPS session lookup (ricerca posizione driver):
```
SEARCH:
      if (driverVehicle) sessionQ = sessionQ.eq('vehicle_id', driverVehicle.id)

REPLACE:
      if (driverVehicle) sessionQ = sessionQ.eq('vehicle_id', driverVehicle.uuid)
```
Commit: `"Fix GO-2: trip/start CREW GPS sessionQ uses vehicle.uuid"`

#### Task GO-3 — `trip/start/route.js` riga 148

Branch CREW per aggiornare la sessione a ACTIVE:
```
SEARCH:
    if (vehicle) sessionQuery = sessionQuery.eq('vehicle_id', vehicle.id)
  }

  const { data: session } = await sessionQuery.single()

  if (session) {
    await supabase
      .from('vehicle_tracking_sessions')
      .update({ status: 'ACTIVE'

REPLACE:
    if (vehicle) sessionQuery = sessionQuery.eq('vehicle_id', vehicle.uuid)
  }

  const { data: session } = await sessionQuery.single()

  if (session) {
    await supabase
      .from('vehicle_tracking_sessions')
      .update({ status: 'ACTIVE'
```
Commit: `"Fix GO-3: trip/start CREW sessionQuery uses vehicle.uuid"`

#### Task GO-4 — `trip/arrive/route.js` riga 21: aggiungi `id` al select NCC

Il select NCC usa `.select('uuid, production_id')` ma riga 57 fa `driver.id` (integer PK ncc_drivers).
```
SEARCH:
    .select('uuid, production_id')
    .eq('tracking_token', token)
    .single()

  if (nccDriver) {
    driver = nccDriver; driverType = 'NCC'

REPLACE:
    .select('id, uuid, production_id')
    .eq('tracking_token', token)
    .single()

  if (nccDriver) {
    driver = nccDriver; driverType = 'NCC'
```
Commit: `"Fix GO-4: trip/arrive NCC driver select includes id"`

#### Task GO-5 — `trip/arrive/route.js` riga 66

Branch CREW per session lookup:
```
SEARCH:
    if (vehicle) sessionQuery = sessionQuery.eq('vehicle_id', vehicle.id)
  }
  const { data: session } = await sessionQuery.single()

  // 4. Calcola actual_km

REPLACE:
    if (vehicle) sessionQuery = sessionQuery.eq('vehicle_id', vehicle.uuid)
  }
  const { data: session } = await sessionQuery.single()

  // 4. Calcola actual_km
```
Commit: `"Fix GO-5: trip/arrive CREW sessionQuery uses vehicle.uuid"`

#### Task GO-6 — `position/route.js` riga 22: aggiungi `id` al select NCC

Branch CREW usa già `session_id` dal frontend, ma branch NCC usa `driver.id` (undefined).
```
SEARCH:
    .select('uuid, production_id')
    .eq('tracking_token', token)
    .single()

  if (nccDriver) {
    driver = nccDriver
    driverType = 'NCC'

REPLACE:
    .select('id, uuid, production_id')
    .eq('tracking_token', token)
    .single()

  if (nccDriver) {
    driver = nccDriver
    driverType = 'NCC'
```
Commit: `"Fix GO-6: position/route NCC driver select includes id"`

---

## 🗂️ File con status UUID

| File | Status | Sessione |
|------|--------|---------|
| `scripts/create-schema.sql` | ✅ SQL done | — |
| `app/dashboard/accommodation/page.js` | ✅ A1/A2 + S11a A1-A4 | S11a |
| `app/dashboard/trips/_components/CrewInfoModal.js` | ✅ B | — |
| `app/api/go/session/route.js` | ✅ B | — |
| `app/api/go/trip/start/route.js` | ✅ B | — |
| `app/dashboard/vehicles/components/NccDriverSidebar.js` | ✅ N | — |
| `app/dashboard/vehicles/components/NccVehicleSidebar.js` | ✅ N | — |
| `app/dashboard/vehicles/page.js` | ✅ V1-V9+S96+T4-T8b+S17a V10-V12 [7b576fd] | S13→S17a |
| `lib/routeDuration.js` | ✅ C1 | — |
| `app/dashboard/hub-coverage/page.js` | ✅ C2 | — |
| `app/dashboard/pax-coverage/page.js` | ✅ C3 | — |
| `app/api/go/data/route.js` | ✅ E [97e4fe8] | S1 |
| `app/api/go/wrap/route.js` | ✅ E [97e4fe8] | S1 |
| `app/api/qr/resolve/route.js` | ✅ D3+D4 | S2 |
| `app/wrap-trip/page.js` | ✅ G [26135a9] + S17b W2/W3 [fd9cccd] | S3→S17b |
| `app/wrap-trip/components/SendLinksModal.js` | ✅ S17b W1 [fd9cccd] | S17b |
| `app/go/[token]/page.js` | ✅ H [ca92b70] | S4 |
| `app/api/crew/merge/route.js` | ✅ D1 [95e966f] | S5 |
| `app/api/go/ping/route.js` | ✅ D2 [95e966f] | S5 |
| `app/api/trips/quick-create/route.js` | ✅ D5+D6 [c06facf] | S6 |
| `app/api/fleet/map-data/route.js` | ✅ S7 [9deb3fd] | S7 |
| `app/api/routes/compute/route.js` | ✅ S7 [9deb3fd] | S7 |
| `app/api/routes/compute-chain/route.js` | ✅ S7 [9deb3fd] | S7 |
| `app/api/routes/optimize-waypoints/route.js` | ✅ S7 [9deb3fd] | S7 |
| `app/api/routes/refresh-all-locations/route.js` | ✅ S7 [9deb3fd] | S7 |
| `app/api/routes/refresh-location/route.js` | ✅ S7 [9deb3fd] | S7 |
| `app/api/routes/traffic-check/route.js` | ✅ S7 [1b66af0] | S7 |
| `lib/refreshRoutesWithGoogle.js` | ✅ S7 [1b66af0] | S7 |
| `app/dashboard/trips/page.js` | ✅ S7 — OK già corretto | S7 |
| `app/dashboard/trips/_components/TripSidebar.js` | ✅ S9 [2538642] | S9 |
| `app/dashboard/trips/_components/EditTripSidebar.js` | ✅ S9 [2538642] | S9 |
| `app/dashboard/trips/_components/ReplicaDayModal.js` | ✅ S7 [9deb3fd] | S7 |
| `app/dashboard/trips/_components/TripRow.js` | ✅ S7 — OK già corretto | S7 |
| `app/dashboard/trips/_components/WaypointReviewModal.js` | ✅ S7 — OK già corretto | S7 |
| `app/dashboard/locations/page.js` | ✅ S7 [1b66af0] | S7 |
| `app/dashboard/travel/page.js` | ✅ S8 — OK già corretto | S8 |
| `lib/tripUtils.js` | ✅ S10 — nessuna modifica necessaria | S10 |
| `app/dashboard/bridge/page.js` | ✅ S11a B1-B4 + S11b B5-B13 | S11b |
| `app/dashboard/fleet/page.js` | ✅ F1 | S14 |
| `app/dashboard/qr-codes/page.js` | ✅ Q1 | S14 |
| `app/dashboard/rocket/page.js` | ✅ R1-R5 | S15 |
| `app/dashboard/fleet/components/QuickTripModal.js` | ✅ QT-1/QT-2/QT-3/QT-4 [b13624e] + SA3 [b8ae772] | S17c+S17d+SA3 |
| `app/dashboard/hotel-settings/page.js` | ✅ H1-H4 — uuid insert+lookup+map | S18a |
| `app/api/go/session/end/route.js` | ✅ GO-1 — vehicle.uuid [3de2b7d] | S19 |
| `app/api/go/trip/start/route.js` | ✅ GO-2/GO-3 — vehicle.uuid ×2 [3de2b7d] | S19 |
| `app/api/go/trip/arrive/route.js` | ✅ GO-4/GO-5 — ncc select include id + vehicle.uuid [3de2b7d] | S19 |
| `app/api/go/position/route.js` | ✅ GO-6 — ncc select include id [3de2b7d] | S19 |
| `app/api/cron/arrival-status/route.js` | ✅ SA4 — OK già corretto | SA4 |
| `app/api/cron/daily-briefing/route.js` | ✅ SA4 — OK già corretto | SA4 |
| `app/api/cron/drive-sync/route.js` | ✅ SA4 — OK già corretto | SA4 |
| `app/api/cron/refresh-routes-traffic/route.js` | ✅ SA4 — OK già corretto | SA4 |
| `app/api/bridge/approve-user/route.js` | ✅ SA5a — OK già corretto (no FK migrate) | SA5a |
| `app/api/bridge/invites/route.js` | ✅ SA5a — OK già corretto (no FK migrate) | SA5a |
| `app/api/bridge/members/route.js` | ✅ SA5a — OK già corretto (no FK migrate) | SA5a |
| `app/api/bridge/pending-users/route.js` | ✅ SA5a — OK già corretto (no FK migrate) | SA5a |
| `app/api/import/confirm/route.js` | ✅ SA5b — OK già corretto | SA5b |
| `app/api/import/parse/route.js` | ✅ SA5b — OK già corretto | SA5b |
| `app/api/import/save-location/route.js` | ✅ SA5b — FIX maxLocNum l.display_id [93a0efd] | SA5b |
| `app/api/import/sheets/route.js` | ✅ SA5b — OK già corretto (no FK) | SA5b |
| `app/api/ai/trip-builder/route.js` | ✅ SA5b — OK già corretto (no DB queries) | SA5b |
| `app/api/route-duration/route.js` | ✅ SA6 — FIX L63/L64 locs.find uuid [97586dd] | SA6 |
| `lib/ImportModal.js` | ✅ SA6 — FIX ×3 hotel_id lookup l.uuid [97586dd] | SA6 |
| `app/dashboard/productions/page.js` | ✅ SA7a — 5 fix: eq(uuid), key(uuid), display_id [8813b67] | SA7a |
| `app/dashboard/lists-v2/page.js` | ✅ SA7a — OK: .eq('id') su tabelle non migrate | SA7a |
| `app/dashboard/reports/page.js` | ✅ SA7a — OK: nessun pattern da fixare | SA7a |

---

## ⚡ Ordine di esecuzione ottimale

```
S0-S10  ✅ completati
S11a    ✅ completato (B1-B4 + accommodation A1-A4)
S11b    ✅ completato (bridge B5-B13)
S12     ✅ completato (vehicles T4-T7)
S13     ✅ completato (vehicles T8a+T8b)
S14     ✅ completato (fleet F1 + qr-codes Q1)
S15     ✅ completato (rocket R1-R5)
S16     ✅ git push eseguito (test produzione pendente)
S17a    ✅ completato (vehicles V10/V11/V12) [7b576fd]
S17b    ✅ completato (wrap-trip W1/W2/W3) [fd9cccd]
S17c    ✅ completato (QuickTripModal QT-1/QT-2) [b13624e]
S17d    ✅ completato (QuickTripModal QT-3/QT-4) [b13624e]
S18a    ✅ completato (hotel-settings H1-H4) — fix uuid in Hotel Settings
S18     ← PROSSIMA: test produzione + verifica migrazione UUID completa
S19     ✅ completato (Captain Go API GO-1/GO-6) [3de2b7d]
SA1     ✅ completato (Captain Go nuove route — nessun fix)
SA2     ✅ completato (crew/page.js 10 uuid fixes) [c2f1a2c]
SA3     ✅ completato (QuickTripModal LEGS+Standard vehicleId uuid) [b8ae772]
SA4     ✅ completato (cron API — nessun fix necessario)
SA5a    ✅ completato (Bridge API — nessun fix necessario)
SA5b    ✅ completato (import/save-location l.display_id fix) [93a0efd]
SA6     ✅ completato (route-duration L63/L64 + ImportModal ×3) [97586dd]
SA7a    ✅ completato (productions 5 fix + lists-v2 OK + reports OK) [8813b67]
SA7b    ✅ completato (settings/production 6 fix + settings OK + cost-report OK)
SA8a    ✅ completato (lib files piccoli — nessun fix necessario)
SA8b    ✅ completato (lib files medi — nessun fix necessario)
SA9     ← PROSSIMA: Drive API + Push API
```

---

---

## 🔍 AUDIT COMPLETO SA — Piano sessioni (avviato 2026-06-02)

> **Workflow per ogni sessione:**
> 1. Nuova chat → "leggi UUID_MIGRATION_TASKS.md"
> 2. Cline legge il file → vede `PROSSIMA →` e la esegue
> 3. Cline: read file → analizza → fix se necessario
> 4. Cline: aggiorna questo file (marca ✅) → sposta `PROSSIMA →`
> 5. Cline: `git commit` (NO push)
> 6. Fine chat → nuova chat per la sessione successiva
>
> **Push unico** solo alla fine di tutte le sessioni SA (SA-FINAL).
>
> **Regole audit:**
> - Pattern sospetti da cercare: `.eq('id', x)` su FK migrate, `.order('id')` su vehicles/crew/locations, `.find(x => x.id === uuid_var)`, `vehicle.id` come FK value
> - Tabelle migrate (usare uuid): `locations`, `crew`, `vehicles`
> - Tabelle NON migrate (id è OK): `trips`, `productions`, `crew_stays` PK, `notifications`, `travel_movements` PK, `ncc_drivers` (integer PK), `hotel_room_types`, `hotel_extra_costs`, `tl_templates`, `transport_list_sections`, `hotel_subgroups`, `rental_*`, `drive_*`, `trip_notes`, `crew_notes`, `production_invites`

---

### ~~🔧 SESSIONE SA1~~ ✅ Captain Go: route nuove — NESSUN FIX NECESSARIO
> File: `app/api/go/session/start/route.js`, `go/trip/pickup/route.js`, `go/messages/route.js`, `go/traffic/route.js`
> Status: ✅ COMPLETATO — tutti e 4 i file già corretti (uuid usato ovunque necessario)

```
[x] app/api/go/session/start/route.js — OK: driver.uuid, vehicle?.uuid corretto
[x] app/api/go/trip/pickup/route.js   — OK: trips.id è integer PK non migrato
[x] app/api/go/messages/route.js      — OK: nessuna FK migrata
[x] app/api/go/traffic/route.js       — OK: locations .in('uuid'), .find(l => l.uuid ===)
```

---

### ~~🔧 SESSIONE SA2~~ ✅ `crew/page.js` — 10 uuid fixes COMPLETATO
> Commit `c2f1a2c` — File: `app/dashboard/crew/page.js`
> Status: ✅ COMPLETATO

```
[x] Fix L269: StayForm hotel option value={l.uuid} (inseriva TEXT in UUID column)
[x] Fix L424: locations.find(l => l.uuid === s.hotel_id) in AccommodationAccordion
[x] Fix L1114-1116: NTNToggle/RemoteToggle/ContactPopover crewId={member.uuid}
[x] Fix L1389-1390: linked_crew_id search dropdown usa c.uuid
[x] Fix L1540/1551/1552/1553: AccommodationAccordion/TravelAccordion/FamilyAccordion/NotesPanel crewId={initial.uuid}
[x] Fix L1747: hasInMovementToday.has(c.uuid)
[x] Fix L1814-1817: state handlers c.uuid === id
[x] Fix L1860: selectAll usa m.uuid
[x] Fix L2182: crew.find(c => c.uuid === m.linked_crew_id) in Family section
```

---

### ~~🔧 SESSIONE SA3~~ ✅ `QuickTripModal.js` — LEGS+Standard vehicleId COMPLETATO
> Commit `b8ae772` — File: `app/dashboard/fleet/components/QuickTripModal.js`
> Status: ✅ COMPLETATO

```
[x] Fix handleConfirmStandard: vehicleId: vehicle.uuid || vehicle.id
[x] Fix handleConfirmMulti: vehicleId: vehicle.uuid || vehicle.id
```

---

### ~~🔧 SESSIONE SA4~~ ✅ Cron API — NESSUN FIX NECESSARIO
> File: 4 route cron
> Status: ✅ COMPLETATO — tutti e 4 i file già corretti

```
[x] app/api/cron/arrival-status/route.js       — OK: locations.uuid, hubUuids, crew.in('uuid')
[x] app/api/cron/daily-briefing/route.js        — OK: crew select uuid+display_id, nessuna FK migrata
[x] app/api/cron/drive-sync/route.js            — OK: solo drive_synced_files (tabella non migrata)
[x] app/api/cron/refresh-routes-traffic/route.js — OK: pickup_id/dropoff_id/from_id/to_id già UUID keys
```

---

### ~~🔧 SESSIONE SA5a~~ ✅ Bridge API — NESSUN FIX NECESSARIO
> File: 4 route bridge
> Status: ✅ COMPLETATO — nessuna FK a tabelle migrate (locations/crew/vehicles)

```
[x] app/api/bridge/approve-user/route.js — OK: solo user_roles + productions (non migrare)
[x] app/api/bridge/invites/route.js      — OK: solo production_invites + productions (non migrare)
[x] app/api/bridge/members/route.js      — OK: solo user_roles + auth.users (non migrare)
[x] app/api/bridge/pending-users/route.js — OK: solo user_roles + auth.users (non migrare)
```

---

### ~~🔧 SESSIONE SA5b~~ ✅ Import + AI Trip Builder — 1 FIX
> File: 4 route import + 1 ai
> Commit `93a0efd` — Status: ✅ COMPLETATO

```
[x] app/api/import/confirm/route.js    — OK: usa uuid ovunque
[x] app/api/import/parse/route.js      — OK: existingId=match.uuid, locMatch.uuid ovunque
[x] app/api/import/save-location/route.js — FIX: maxLocNum usava l.id → l.display_id [93a0efd]
[x] app/api/import/sheets/route.js     — OK: nessuna FK migrata
[x] app/api/ai/trip-builder/route.js   — OK: nessuna query DB
```

---

### ~~🔧 SESSIONE SA6~~ ✅ route-duration + ImportModal — 4 FIX
> Commit `97586dd` — Status: ✅ COMPLETATO

```
[x] app/api/route-duration/route.js — FIX L63/L64: locs.find(l => l.uuid === from_id/to_id)
[x] lib/ImportModal.js — FIX ×3: locations.find(l => l.uuid === row.hotel_id)
    (CrewTable + AccommodationTable + TravelTable)
```

---

### ~~🔧 SESSIONE SA7a~~ ✅ Dashboard pages gruppo A — COMPLETATO
> Commit `8813b67` — Status: ✅ COMPLETATO

```
[x] app/dashboard/productions/page.js — 5 fix: eq(uuid), key(uuid), display_id ×3
[x] app/dashboard/lists-v2/page.js   — OK: .eq('id') su tabelle non migrate
[x] app/dashboard/reports/page.js    — OK: nessun pattern da fixare
```

---

### ~~🔧 SESSIONE SA7b~~ ✅ Dashboard pages gruppo B — COMPLETATO
> Status: ✅ COMPLETATO

```
[x] app/dashboard/settings/page.js — OK: locations select uuid+display_id già corretto
[x] app/dashboard/settings/production/page.js — 6 FIX SP-1..SP-6: update .eq(uuid), key uuid, openEdit display_id, display label display_id, results key uuid, results display_id
[x] app/dashboard/accommodation/cost-report/page.js — OK: crew_stays join, nessuna FK migrata diretta
```

---

### ~~🔧 SESSIONE SA8a~~ ✅ lib files piccoli — NESSUN FIX NECESSARIO
> Status: ✅ COMPLETATO

```
[x] lib/crewCache.js          — OK: byCrewId[c.uuid], select uuid, order dept/full_name
[x] lib/production.js         — OK: nessuna query DB (localStorage/env)
[x] lib/tripWarnings.js       — OK: puro calcolo, usa crew_id come UUID correttamente
[x] lib/tripTimeCalculator.js — OK: nessuna query DB (calcolo tempi puro)
[x] lib/normalizeDept.js      — OK: nessuna query DB (string mapping)
[x] lib/roleAccess.js         — OK: nessuna query DB (config ruoli/path)
[x] lib/sendLoginNotification.js — OK: nessuna query DB (email SMTP)
```

---

### ~~🔧 SESSIONE SA8b~~ ✅ lib files medi — NESSUN FIX NECESSARIO
> Status: ✅ COMPLETATO

```
[x] lib/TripNotesPanel.js      — OK: solo fetch() API, nessuna FK migrata
[x] lib/transferClass.js       — OK: calcolo puro, zero DB
[x] lib/BlockConfigForms.js    — OK: usa crew.uuid come key (L801)
[x] lib/NotesPanel.js          — OK: solo fetch() API
[x] lib/tlBlocksCatalog.js     — OK: render puro, zero DB
[x] lib/TLHeaderFooterRenderer.js  — OK: usa helper da tlTemplatesDb
[x] lib/HeaderFooterEditorSidebar.js — OK: usa helper da tlTemplatesDb
[x] lib/generateDisplayId.js   — OK: solo display_id, nessuna FK migrata
```

---

### 🔧 SESSIONE SA9 — Drive API + Push API (mai auditati)
> Nota: `drive/check-updates` ha `.select('id, vehicle_id')` → verificare se vehicle_id viene usato come UUID downstream
> Status: ⏳ PENDING

```
[ ] app/api/drive/check-updates/route.js  ← ha vehicle_id nel select ⚠️
[ ] app/api/drive/sync/route.js
[ ] app/api/drive/download/route.js
[ ] app/api/drive/preview/route.js
[ ] app/api/push/send/route.js
[ ] app/api/push/subscribe/route.js
[ ] app/api/push/unsubscribe/route.js
```

---

### 🔧 SESSIONE SA10 — Misc API (mai auditati)
> Status: ⏳ PENDING

```
[ ] app/api/rocket/suggestions/route.js
[ ] app/api/routes/refresh-traffic/route.js
[ ] app/api/invites/redeem/route.js        ← già apparso nei search (non-migrated id) — da confermare
[ ] app/api/check-approval/route.js
[ ] app/api/maps-config/route.js
[ ] app/api/google/status/route.js
```

---

### 🏁 SESSIONE SA-FINAL — Push unico finale
> Solo dopo che SA1-SA10 sono tutte ✅
> Status: ⏳ PENDING

```
[ ] git push origin master
[ ] Aggiornare sezione "GIÀ COMPLETATO" con tutti i fix SA
[ ] Chiudere audit UUID migration
```

---

## 📌 Note importanti per Cline

1. **NON rileggere file già fixati** — usa questa lista come riferimento
2. **Ogni sessione leggi SOLO i file elencati** per quella sessione
3. **id TEXT esiste ancora** — è il vecchio valore visivo (es. "VAN-01"), NON eliminarlo
4. **uuid UUID** è il nuovo PK — usalo per tutte le FK
5. **QR codes** contengono il vecchio TEXT id → lookup per `.eq('id', ...)` è CORRETTO per i QR
6. **hotel_id in crew** → è già UUID dopo migrazione → lookup locations per `.eq('uuid', ...)`
7. **driver_crew_id in vehicles** → è già UUID dopo migrazione → lookup crew per `.eq('uuid', ...)`
8. **getClass()** in `lib/tripUtils.js` prende il TEXT display id (non UUID) → i chiamanti devono fare la conversione uuid→textId prima di chiamarla.
9. **crew_stays.hotel_id** — CONFERMATO UUID (FK a `locations.uuid`)
10. **busyMap** in EditTripSidebar è keyed per `crew_id` (UUID) → `busyMap[c.uuid]` ✅ fixato in S9
11. **travel_movements.rooming_hotel_id** → è TEXT (non migrato, viene dall'import Google Sheets) — non è una FK UUID. Serve lookup `locations.find(l => l.id === item.rooming_hotel_id)?.uuid`
12. **vehicles/page.js ~5000 righe** — SEMPRE fare `read_file` delle righe specifiche prima del SEARCH
13. **Shell CMD** — usare `&&` tra comandi, non PowerShell syntax
14. **NO git push automatico** — push manuale a fine sessione
15. **preferred_crew_ids in vehicles** → ora contiene UUID (non TEXT id) → lookup deve usare `c.uuid`
16. **QuickTripModal** — `crew` e `locations` sono props del componente da `fleet/page.js`, disponibili in scope dentro `createTrip()`
