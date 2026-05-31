# UUID Migration — Task File Completo
> Branch: `master` (uuid-migration mergiato — commit `2c68997`) | Aggiornato: 2026-05-31 S96

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
```

---

## 📋 SESSIONI — STORICO E STATO

### ~~🔧 SESSIONI 0-11a~~ ✅ COMPLETATE
Vedi sezione "GIÀ COMPLETATO" sopra.

---

### ~~🔧 SESSIONE S11b~~ ✅ Fix `bridge/page.js` B5-B13 COMPLETATO
> `TravelDiscrepanciesWidget` — 9 fix su `.eq('id', ...)` → `.eq('uuid', ...)`

**Pre-requisito:** Leggere `bridge/page.js` righe ~1000-1115 prima di ogni SEARCH.

#### Fix da applicare:

**B-5** (~L1007): `crew.update` dentro `"Use Calendar"` (personStays.length === 0):
```js
// PRIMA
.eq('id', item.crew_id).eq('production_id', productionId)
// DOPO
.eq('uuid', item.crew_id).eq('production_id', productionId)
```
Commit: `"Fix bridge B5: crew update eq uuid in Use Calendar (travel_date_conflict)"`

**B-6/B-7** (~L1022-1030): calcolo `resolvedTravelHotelId` e `travelHotel`:
```js
// PRIMA
)?.id
const travelHotel = locations.find(l => l.id === resolvedTravelHotelId)?.name || ...
// DOPO
)?.uuid
const travelHotel = locations.find(l => l.uuid === resolvedTravelHotelId)?.name || ...
```
Commit: `"Fix bridge B6-B7: resolvedTravelHotelId uses uuid"`

**B-8/B-9/B-10** (~L1039-1042): blocco `"Use Rooming"` onClick:
```js
// PRIMA
await supabase.from('crew').update({ hotel_id: item.rooming_hotel_id }).eq('id', item.crew_id)...
await supabase.from('crew_stays').update({ hotel_id: item.rooming_hotel_id }).eq('crew_id', item.crew_id)...
// DOPO
const roomingUuid = locations.find(l => l.id === item.rooming_hotel_id)?.uuid || null
await supabase.from('crew').update({ hotel_id: roomingUuid }).eq('uuid', item.crew_id)...
await supabase.from('crew_stays').update({ hotel_id: roomingUuid }).eq('crew_id', item.crew_id)...
```
Commit: `"Fix bridge B8-B10: Use Rooming converts hotel_id to uuid"`

**B-11** (~L1052): `"Use Calendar"` onClick in `hotel_conflict`:
```js
// PRIMA
.eq('id', item.crew_id)...
// DOPO
.eq('uuid', item.crew_id)...
```
Commit: `"Fix bridge B11: crew update eq uuid in Use Calendar (hotel_conflict)"`

**B-12** (~L1080-1088): blocco `match_status === 'unmatched'`, costruzione `hotel_id`:
```js
// PRIMA
let hotel_id = item.rooming_hotel_id || null
if (!hotel_id && item.hotel_raw) {
  const matchedLoc = locations.find(...)
  if (matchedLoc) hotel_id = matchedLoc.id
}
// DOPO
const rooming_hotel_uuid = item.rooming_hotel_id
  ? (locations.find(l => l.id === item.rooming_hotel_id)?.uuid || null) : null
let hotel_id = rooming_hotel_uuid || null
if (!hotel_id && item.hotel_raw) {
  const matchedLoc = locations.find(...)
  if (matchedLoc) hotel_id = matchedLoc.uuid
}
```
Commit: `"Fix bridge B12: sessionStorage hotel_id uses uuid"`

**B-13** (~L1109): `"Skip future checks"` onClick:
```js
// PRIMA
.eq('id', item.crew_id)...
// DOPO
.eq('uuid', item.crew_id)...
```
Commit: `"Fix bridge B13: no_rooming_check update uses uuid"`

> **Nota B-8/B-10/B-12:** `item.rooming_hotel_id` è TEXT (dall'import Google Sheets), ma `crew.hotel_id` e `crew_stays.hotel_id` sono UUID. Serve lookup `locations.find(l => l.id === item.rooming_hotel_id)?.uuid`. La `locations` array ha già `uuid` nel select grazie al fix B-4.

---

### ~~🔧 SESSIONE S12~~ ✅ `vehicles/page.js` T4+T5+T6+T7 COMPLETATO
> ComodatoTab + LoanVehicleSidebar — 4 fix

**IMPORTANTE:** `vehicles/page.js` è ~5000 righe. Fare `read_file` delle righe specifiche PRIMA di ogni SEARCH.

#### Task T4 — ComodatoTab: select aggiunge uuid, display_id, ordina per display_id

Righe da leggere prima: 3760-3780

SEARCH (sottostringa corta — solo la parte finale):
```
comodato_fuel_reimbursement, comodato_notes').eq('production_id', productionId).eq('is_comodato', true).order('id'),
```
REPLACE:
```
comodato_fuel_reimbursement, comodato_notes').eq('production_id', productionId).eq('is_comodato', true).order('display_id'),
```

Poi secondo SEARCH/REPLACE (file separato o seconda operazione):
SEARCH:
```
vehicles').select('id, vehicle_type, license_plate, driver_name, active, is_comodato, comodato_owner_crew_id,
```
REPLACE:
```
vehicles').select('uuid, id, display_id, vehicle_type, license_plate, driver_name, active, is_comodato, comodato_owner_crew_id,
```
Commit: `"Fix vehicles: ComodatoTab select includes uuid display_id orders by display_id"`

#### Task T5 — ComodatoTab: mostra display_id nel render

Righe da leggere prima: 3830-3845

SEARCH:
```
fontWeight: '800', color: '#0f172a', fontFamily: 'monospace' }}>{v.id}</span>
```
REPLACE:
```
fontWeight: '800', color: '#0f172a', fontFamily: 'monospace' }}>{v.display_id || v.id}</span>
```
Commit: `"Fix vehicles: ComodatoTab shows display_id"`

#### Task T6 — ComodatoTab: owner lookup usa uuid

Righe da leggere prima: 3840-3852

SEARCH:
```
                      const owner = crewList.find(c => c.id === v.comodato_owner_crew_id)
```
REPLACE:
```
                      const owner = crewList.find(c => c.uuid === v.comodato_owner_crew_id)
```
Commit: `"Fix vehicles: ComodatoTab owner lookup uses uuid"`

#### Task T7 — LoanVehicleSidebar: ownerCrew lookup usa uuid

Righe da leggere prima: 4010-4020

SEARCH:
```
  const ownerCrew = crewList.find(c => c.id === form.comodato_owner_crew_id)
```
REPLACE:
```
  const ownerCrew = crewList.find(c => c.uuid === form.comodato_owner_crew_id)
```
Commit: `"Fix vehicles: LoanVehicleSidebar ownerCrew lookup uses uuid"`

---

### ~~🔧 SESSIONE S13~~ ✅ `vehicles/page.js` T8a+T8b COMPLETATO
> ✅ T8a completato — ✅ T8b completato
> Rental filter search — 2 occorrenze identiche

**IMPORTANTE:** Le due righe (4459 e 4475) sono **identiche**. Disambiguare con il contesto circostante.

#### Task T8a — prima occorrenza (~riga 4459, dentro `productionFiltered`)

Righe da leggere prima: 4455-4465

SEARCH (usa contesto `// Reset selezione` che segue solo la prima):
```
      if (!(v.id || '').toLowerCase().includes(q) && !(v.driver_name || '').toLowerCase().includes(q) && !(v.sign_code || '').toLowerCase().includes(q) && !(v.license_plate || '').toLowerCase().includes(q)) return false
    }
    return true
  })

  // Reset selezione quando cambiano i filtri
```
REPLACE:
```
      if (!((v.display_id || v.id) || '').toLowerCase().includes(q) && !(v.driver_name || '').toLowerCase().includes(q) && !(v.sign_code || '').toLowerCase().includes(q) && !(v.license_plate || '').toLowerCase().includes(q)) return false
    }
    return true
  })

  // Reset selezione quando cambiano i filtri
```
Commit: `"Fix vehicles: rental filter search uses display_id (first)"`

#### Task T8b — seconda occorrenza (~riga 4475, dentro `filtered`)

Righe da leggere prima: 4472-4482

SEARCH (usa contesto `const counts` che segue solo la seconda):
```
      if (!(v.id || '').toLowerCase().includes(q) && !(v.driver_name || '').toLowerCase().includes(q) && !(v.sign_code || '').toLowerCase().includes(q) && !(v.license_plate || '').toLowerCase().includes(q)) return false
    }
    return true
  })

  const counts = {
```
REPLACE:
```
      if (!((v.display_id || v.id) || '').toLowerCase().includes(q) && !(v.driver_name || '').toLowerCase().includes(q) && !(v.sign_code || '').toLowerCase().includes(q) && !(v.license_plate || '').toLowerCase().includes(q)) return false
    }
    return true
  })

  const counts = {
```
Commit: `"Fix vehicles: rental filter search uses display_id (second)"`

---

### ~~🔧 SESSIONE S14~~ ✅ `fleet/page.js` F1 + `qr-codes/page.js` Q1 COMPLETATO
> Due piccole modifiche su file diversi

#### Task F1 — fleet: ordina vehicles per display_id

Righe da leggere prima: `fleet/page.js` 775-785

SEARCH:
```
        .order('vehicle_type').order('id'),
```
REPLACE:
```
        .order('vehicle_type').order('display_id'),
```
Commit: `"Fix fleet: vehicles order by display_id"`

#### Task Q1 — qr-codes: ordina vehicles per display_id

Righe da leggere prima: `qr-codes/page.js` 50-62

SEARCH:
```
          .eq('production_id', PRODUCTION_ID).order('id'),
```
REPLACE:
```
          .eq('production_id', PRODUCTION_ID).order('display_id'),
```
Commit: `"Fix qr-codes: vehicles order by display_id"`

---

### ~~🔧 SESSIONE S15~~ ✅ `rocket/page.js` R1+R2+R3+R4+R5 COMPLETATO
> loadData select + handleConfirm + display label

**IMPORTANTE:** Leggere le righe specifiche PRIMA di ogni SEARCH.

#### Task R1 — rocket: loadData crew select include uuid

Righe da leggere prima: 1490-1510

SEARCH:
```
      supabase.from('crew').select('id,full_name,department,hotel_id,hotel_status,no_transport_needed,on_location,arrival_date,departure_date')
```
REPLACE:
```
      supabase.from('crew').select('id,uuid,full_name,department,hotel_id,hotel_status,no_transport_needed,on_location,arrival_date,departure_date')
```
Commit: `"Fix rocket: loadData crew select includes uuid"`

#### Task R2 — rocket: loadData vehicles select include uuid

Righe da leggere prima: 1495-1510

SEARCH:
```
      supabase.from('vehicles').select('id,vehicle_type,capacity,pax_suggested,pax_max,driver_name,sign_code,active,preferred_dept,preferred_crew_ids')
```
REPLACE:
```
      supabase.from('vehicles').select('id,uuid,vehicle_type,capacity,pax_suggested,pax_max,driver_name,sign_code,active,preferred_dept,preferred_crew_ids')
```
Commit: `"Fix rocket: loadData vehicles select includes uuid"`

#### Task R3 — rocket: handleConfirm vehicle_id usa uuid

Righe da leggere prima: 1730-1745

SEARCH:
```
          vehicle_id: t.vehicleId, driver_name: t.vehicle.driver_name || null,
```
REPLACE:
```
          vehicle_id: t.vehicle?.uuid || t.vehicleId, driver_name: t.vehicle.driver_name || null,
```
Commit: `"Fix rocket: handleConfirm vehicle_id uses uuid"`

#### Task R4 — rocket: handleConfirm trip_passengers usa crew uuid

Righe da leggere prima: 1750-1760

SEARCH:
```
            g.crew.map(c => ({ production_id: PRODUCTION_ID, trip_row_id: ins.id, crew_id: c.id }))
```
REPLACE:
```
            g.crew.map(c => ({ production_id: PRODUCTION_ID, trip_row_id: ins.id, crew_id: c.uuid || c.id }))
```
Commit: `"Fix rocket: handleConfirm trip_passengers uses crew uuid"`

#### Task R5 — rocket: display label usa display_id (~riga 349)

Righe da leggere prima: 345-355

> ⚠️ Leggere le righe prima di scrivere il SEARCH — riga 349 contiene `v.id can carry` (label display veicolo).

SEARCH (leggere riga esatta prima):
```
{v.id} can carry
```
REPLACE:
```
{v.display_id || v.id} can carry
```
Commit: `"Fix rocket: vehicle display label uses display_id"`

---

### ~~🔧 SESSIONE S16~~ ✅ git push + test produzione
> Completato 2026-05-31

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
| `app/dashboard/vehicles/page.js` | ✅ V1-V9 + S96 T1-T3 + NccTab + T4-T8b | S13 |
| `lib/routeDuration.js` | ✅ C1 | — |
| `app/dashboard/hub-coverage/page.js` | ✅ C2 | — |
| `app/dashboard/pax-coverage/page.js` | ✅ C3 | — |
| `app/api/go/data/route.js` | ✅ E [97e4fe8] | S1 |
| `app/api/go/wrap/route.js` | ✅ E [97e4fe8] | S1 |
| `app/api/qr/resolve/route.js` | ✅ D3+D4 | S2 |
| `app/wrap-trip/page.js` | ✅ G [26135a9] | S3 |
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
S16     ← PROSSIMA: git push + test produzione
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
14. **NO git push automatico** — push manuale a fine sessione (S16)
