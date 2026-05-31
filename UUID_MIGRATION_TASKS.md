# UUID Migration — Task File Completo
> Branch: `uuid-migration` | Aggiornato: 2026-05-31 | Audit by Cline

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

---

## ✅ GIÀ COMPLETATO — NON RIFARE

```
SQL migration DB (locations, crew, vehicles) .................. ✅
Fix A1/A2 — accommodation/page.js (syncCrewDates, removeFamilyMember) ✅
Fix B1/B2/B3 — CrewInfoModal + go/session/route.js + go/trip/start/route.js ✅
Fix N1-N6 — NccDriverSidebar.js + NccVehicleSidebar.js ......... ✅
Fix V1-V9 — dashboard/vehicles/page.js ........................ ✅
Fix C1 — lib/routeDuration.js (locations uuid) ................ ✅ (non pushato)
Fix C2-C3 — hub-coverage/page.js + pax-coverage/page.js ....... ✅ (non pushato)
```

> ✅ **Fix C1-C3 pushati** — `git push origin uuid-migration` eseguito (2026-05-31)

---

## 📋 SESSIONI DA FARE (in ordine)

---

### ~~🔧 SESSIONE 0~~ ✅ COMPLETATO — Push C1-C3
> `git push origin uuid-migration` — eseguito 2026-05-31 → commit `45416ae..ee06fe7`

---

### ~~🔧 SESSIONE 1~~ ✅ COMPLETATO — API Captain Go Data + Wrap
> File: 2 | Righe da toccare: ~8 | Costo: BASSO

**Leggi prima:**
- `app/api/go/data/route.js` (61 righe)
- `app/api/go/wrap/route.js` (136 righe)

**Fix in `app/api/go/data/route.js`:**
```
L43: locations.select('id, name, is_hub')
  → select('uuid, id, name, is_hub')
  Il campo 'id' resta per compatibilità display.

L53: crew.select('id, full_name, department, hotel_id')
  → select('uuid, id, full_name, department, hotel_id')
```

**Fix in `app/api/go/wrap/route.js`:**
```
L40: vehicles.select('id, sign_code, ...')
  → select('uuid, id, sign_code, capacity, vehicle_type, driver_name')

L49: crew.select('id, full_name, production_id')
  → select('uuid, id, full_name, production_id')

L56: vehicles.eq('driver_crew_id', crewDriver.id)
  → .eq('driver_crew_id', crewDriver.uuid)
  MOTIVO: vehicles.driver_crew_id ora è UUID

L56 anche: vehicles.select('id,...')
  → aggiungere uuid alla select

L106: vehicle_id: vehicle?.id || null
  → vehicle_id: vehicle?.uuid || null
  MOTIVO: trips.vehicle_id ora è UUID

L131: crew_id: crewId  (crewId viene da passengerIds)
  → ATTENZIONE: crewId arriverà come uuid da Captain Go UI dopo fix H
  Nessun cambio qui, ma dipende dal fix H
```

**Commit:** `Fix E: go/data + go/wrap use uuid` ✅ `[uuid-migration 97e4fe8]`

---

### 🔧 SESSIONE 2 — API QR Resolve (architetturale)
> File: 1 | Righe da toccare: ~10 | Costo: MEDIO (file delicato)

**Leggi prima:**
- `app/api/qr/resolve/route.js` (104 righe)

**Contesto importante:**  
I QR code hanno formato `CR:CR0001` o `VH:VAN-01`.  
Dopo la migrazione, `CR0001` / `VAN-01` = valore in `crew.id` / `vehicles.id` TEXT (ancora esiste!).  
Quindi il lookup `crew` per QR resta `.eq('id', crewId)` — è corretto.  
Ma `crew.hotel_id` ora è UUID, e `trips.vehicle_id` è UUID.

**Fix in `app/api/qr/resolve/route.js`:**
```
SEZIONE CREW:
L33: select('id, full_name, department, hotel_id, ...')
  → select('uuid, id, full_name, department, hotel_id, ...')
  AGGIUNGE uuid alla select, id resta per display

L34: .eq('id', crewId)
  → NESSUN CAMBIO — crewId è il vecchio text id "CR0001", ok!

L44: locations.select('name').eq('id', data.hotel_id)
  → locations.select('name').eq('uuid', data.hotel_id)
  MOTIVO: crew.hotel_id ora è UUID

L48-63 RESPONSE: aggiungere uuid nella response
  → aggiungere: uuid: data.uuid

SEZIONE VEHICLE:
L69: vehicles.select('*')
  → NESSUN CAMBIO select, * include uuid e id

L72: .eq('id', vehicleId)
  → NESSUN CAMBIO — vehicleId è il vecchio text "VAN-01", ok!

L84: trips.eq('vehicle_id', vehicleId)
  → trips.eq('vehicle_id', data.uuid)
  MOTIVO: trips.vehicle_id ora è UUID, non il vecchio text id

L90-100 RESPONSE: 
  → aggiungere: uuid: data.uuid
  → id: data.id  (TEXT, per display — lascia invariato)
```

**Commit:** `Fix D3+D4: qr/resolve use uuid for hotel_id + trips.vehicle_id`

---

### 🔧 SESSIONE 3 — WrapTrip Page (FleetMonitor + WrapTripContent)
> File: 1 grande | Righe da toccare: ~20 | Costo: ALTO (file 1033 righe)
> ⚠️ Leggere in DUE parti: righe 1-480, poi 480-1033

**Leggi prima:**
- `app/wrap-trip/page.js` righe 200-215 (FleetMonitor queries)
- `app/wrap-trip/page.js` righe 525-545 (WrapTripContent queries)
- `app/wrap-trip/page.js` righe 685-715 (handleConfirm)

**Fix in FleetMonitor component:**
```
L206: vehicles.select('id,driver_name,sign_code,capacity,vehicle_type')
  → select('uuid,id,driver_name,sign_code,capacity,vehicle_type')

L208: locations.select('id,name')
  → select('uuid,id,name')

L212: lm[l.id] = l.name
  → lm[l.uuid] = l.name
  MOTIVO: trips.pickup_id/dropoff_id è UUID

L245: trips.filter(t => t.vehicle_id === vId)
  → NESSUN CAMBIO qui

L267: vstatus(v.id)
  → vstatus(v.uuid)

L344: trips.filter(t => t.vehicle_id === v.id)
  → trips.filter(t => t.vehicle_id === v.uuid)

L346: expanded[v.id]
  → expanded[v.uuid]

L357-358: trafficAlerts.find(a => a.vehicleId === v.id)
  → a.vehicleId === v.uuid

L362: [v.id]: !ex[v.id]
  → [v.uuid]: !ex[v.uuid]

L364: v.id — v.sign_code (DISPLAY)
  → v.id — v.sign_code  (LASCIA: v.id = text display, va bene)
```

**Fix in WrapTripContent component:**
```
L524: locations.map(l => [l.id, l.name])
  → locations.map(l => [l.uuid, l.name])

L537: locations.select('id,name,is_hub')
  → select('uuid,id,name,is_hub')

L538: vehicles.select('id,...').order('id')
  → select('uuid,id,driver_name,sign_code,capacity,vehicle_type').order('id')
  (ordine per 'id' TEXT per display — ok)

L539: crew.select('id,full_name,department,hotel_id')
  → select('uuid,id,full_name,department,hotel_id')

L570: vehicles.find(x => x.id === preVehicle)
  → vehicles.find(x => x.id === preVehicle || x.uuid === preVehicle)
  MOTIVO: preVehicle può arrivare come old text (/scan) o uuid

L612: v.id.toLowerCase() === qrId  (QR fallback lookup)
  → v.id.toLowerCase() === qrId  (LASCIA — cerca per text display id)

L628: c.id.toLowerCase() === qrId  (QR fallback crew)
  → c.id.toLowerCase() === qrId  (LASCIA — cerca per text display id)

L633: setSelCrew([...p, { id: found.id, full_name:..., department:..., hotel_id:... }])
  → aggiungere: uuid: found.uuid

L647: setVehicle({ id: data.id, driver_name:..., ... })  (da QR resolve)
  → aggiungere: uuid: data.uuid

L700-702: pickup_id: pickupId   (pickupId = l.id TEXT = SBAGLIATO)
  PRIMA: setPickupId(l.id) → setPickupId(l.uuid)
  Trova dove pickupId viene settato (picker locations) e usa l.uuid
  NOTA: pickupId appare in locsMap[pickupId] per display — dopo fix locsMap è keyed per uuid → OK ✓

L702: vehicle_id: vehicle?.id || null
  → vehicle?.uuid || null

L710: crew_id: c.id
  → c.uuid
  (c viene da selCrew, che ora include uuid dopo il fix L633)
```

**Commit:** `Fix G: wrap-trip/page.js FleetMonitor + WrapTripContent use uuid`

---

### 🔧 SESSIONE 4 — Captain Go UI (dipende da S1+S2)
> File: 1 | Righe da toccare: ~5 | Costo: BASSO

**Leggi prima:**
- `app/go/[token]/page.js` righe 85-150

**Fix:**
```
L91: locsMap = Object.fromEntries(locations.map(l => [l.id, l.name]))
  → locations.map(l => [l.uuid, l.name])
  MOTIVO: locations ora ritorna uuid (dopo fix S1), trip.pickup_id è UUID

L125: selCrew.find(c => c.id === data.id)
  → selCrew.find(c => c.uuid === data.uuid)
  MOTIVO: dopo fix S1+S2, data.uuid è disponibile e crew ha uuid

L126: setSelCrew([...p, { id: data.id, full_name:..., department:..., hotel_id:... }])
  → aggiungere: uuid: data.uuid

L141: passengerIds: selCrew.map(c => c.id)
  → selCrew.map(c => c.uuid)
  MOTIVO: go/wrap.L131 usa crew_id che deve essere UUID
```

**Commit:** `Fix H: go/[token]/page.js locsMap + crew use uuid`

---

### 🔧 SESSIONE 5 — API crew/merge + go/ping
> File: 2 | Righe da toccare: ~6 | Costo: BASSO

**Leggi prima:**
- `app/api/crew/merge/route.js` (146 righe)
- `app/api/go/ping/route.js` (80 righe)

**Fix in `app/api/crew/merge/route.js`:**
```
L55: crew.select('id')
  → select('uuid')

L56: .in('id', allIds)
  → .in('uuid', allIds)

L124: crew.update(...).eq('id', primary_id)
  → .eq('uuid', primary_id)

L131: crew.delete().in('id', duplicate_ids)
  → .in('uuid', duplicate_ids)

NOTA: primary_id e duplicate_ids vengono dal body request.
  Il frontend che chiama questo endpoint (dashboard crew page) 
  deve passare gli UUID — verifica che lo faccia già dopo i fix V.
```

**Fix in `app/api/go/ping/route.js`:**
```
L47: vehicles.eq('id', vehicle_id)
  → .eq('uuid', vehicle_id)
  NOTA: vehicle_id nel body deve essere UUID (inviato dal dispatcher)

L54: crew.eq('id', vehicle.driver_crew_id)
  → .eq('uuid', vehicle.driver_crew_id)
  MOTIVO: driver_crew_id è già UUID dopo migrazione
```

**Commit:** `Fix D1+D2: crew/merge + go/ping use uuid`

---

### 🔧 SESSIONE 6 — API trips/quick-create
> File: 1 grande | Righe da toccare: ~12 | Costo: MEDIO

**Leggi prima:**
- `app/api/trips/quick-create/route.js` righe 1-70 (vehicle + crew selects)
- `app/api/trips/quick-create/route.js` righe 160-200 (legs notify)
- `app/api/trips/quick-create/route.js` righe 295-330 (standard notify)

**Fix:**
```
L50: vehicles.select('id, sign_code, ...')
  → select('uuid, id, sign_code, ...')

L51: vehicles.eq('id', vehicleId)
  → .eq('uuid', vehicleId)

L62: crew.select('id, full_name').in('id', allPassengerIds)
  → select('uuid, full_name').in('uuid', allPassengerIds)

L63: crewMap[c.id] = c.full_name
  → crewMap[c.uuid] = c.full_name

L113: vehicle_id: vehicle.id
  → vehicle.uuid

L167: crew.eq('id', vehicle.driver_crew_id)
  → .eq('uuid', vehicle.driver_crew_id)

L173: locations.select('id, name').in('id', [...])
  → select('uuid, name').in('uuid', [...])

L174: locsMap[l.id] = l.name
  → locsMap[l.uuid] = l.name

L196: crew.select('id, full_name').in('id', passengerIds)
  → select('uuid, full_name').in('uuid', passengerIds)

L250: vehicle_id: vehicle.id
  → vehicle.uuid

L314: crew.eq('id', vehicle.driver_crew_id)
  → .eq('uuid', vehicle.driver_crew_id)

L320: locations.select('id, name').in('id', [...])
  → select('uuid, name').in('uuid', [...])

L324: locsMap[l.id] = l.name
  → locsMap[l.uuid] = l.name
```

**Commit:** `Fix D5+D6: trips/quick-create use uuid`

---

### 🔧 SESSIONE 7 — Audit file non ancora letti (solo lettura + fix se serve)
> File: ~6 | Costo: MEDIO — leggere solo le parti delle query Supabase

**File da leggere e verificare:**
```
app/api/fleet/route.js (o cartella fleet/)
  → Cerca: vehicles.select('id'), trips.eq('vehicle_id')

app/api/routes/route.js (o file in routes/)
  → Cerca: locations.eq('id'), vehicles.eq('id')

app/dashboard/trips/_components/*.js e page.js
  → Cerca: crew.eq('id'), vehicles.eq('id'), locations.eq('id')

app/dashboard/locations/page.js
  → Cerca: locations.eq('id')

app/dashboard/travel/*.js
  → Cerca: crew.eq('id'), locations.eq('id')

lib/tripUtils.js
  → Cerca: crew.eq('id'), vehicles.eq('id'), locations.eq('id')
```

**Istruzioni per questa sessione:**
Per ogni file, leggi SOLO le righe dove ci sono query Supabase.
Se trovi `.eq('id', x)` su tables migrate → fix al volo.
Se tutto ok → scrivi "✅ VERIFIED" accanto al file.

**Commit:** `Fix I: audit remaining files (fleet/routes/trips/locations/travel/tripUtils)`

---

### 🔧 SESSIONE 8 — Test finale + merge in master
> Solo verifica e git operations

**Checklist pre-merge:**
```
[ ] git push origin uuid-migration (dopo tutte le sessioni)
[ ] Deploy Vercel su preview uuid-migration branch
[ ] Test Captain Go: go a captaindispatch.com/go/[token]
    - Sessione start/stop
    - Visualizza trips con pickup/dropoff location names
    - Wrap trip da Captain Go
[ ] Test WrapTrip: go a /wrap-trip
    - FleetMonitor mostra vehicle status correttamente  
    - Crea wrap trip con vehicle + crew
[ ] Test Scan QR: go a /scan?qr=CR:xxx e /scan?qr=VH:xxx
[ ] Test Quick-Create trip dal dashboard
[ ] Se tutto ok → git checkout master && git merge uuid-migration && git push
```

---

## 🗂️ File con status UUID

| File | Status | Sessione |
|------|--------|---------|
| `scripts/create-schema.sql` | ✅ SQL done | — |
| `app/dashboard/accommodation/page.js` | ✅ A1/A2 | — |
| `app/dashboard/trips/_components/CrewInfoModal.js` | ✅ B | — |
| `app/api/go/session/route.js` | ✅ B | — |
| `app/api/go/trip/start/route.js` | ✅ B | — |
| `app/dashboard/vehicles/components/NccDriverSidebar.js` | ✅ N | — |
| `app/dashboard/vehicles/components/NccVehicleSidebar.js` | ✅ N | — |
| `app/dashboard/vehicles/page.js` | ✅ V | — |
| `lib/routeDuration.js` | ✅ C1 | — |
| `app/dashboard/hub-coverage/page.js` | ✅ C2 | — |
| `app/dashboard/pax-coverage/page.js` | ✅ C3 | — |
| `app/api/go/data/route.js` | ✅ E (97e4fe8) | S1 |
| `app/api/go/wrap/route.js` | ✅ E (97e4fe8) | S1 |
| `app/api/qr/resolve/route.js` | ❌ UUID parziale | S2 |
| `app/wrap-trip/page.js` | ❌ UUID rotto | S3 |
| `app/go/[token]/page.js` | ❌ UUID parziale | S4 |
| `app/api/crew/merge/route.js` | ❌ UUID rotto | S5 |
| `app/api/go/ping/route.js` | ❌ UUID rotto | S5 |
| `app/api/trips/quick-create/route.js` | ❌ UUID rotto | S6 |
| `app/api/fleet/*` | 🔍 NON CONTROLLATO | S7 |
| `app/api/routes/*` | 🔍 NON CONTROLLATO | S7 |
| `app/dashboard/trips/*` | 🔍 NON CONTROLLATO | S7 |
| `app/dashboard/locations/page.js` | 🔍 NON CONTROLLATO | S7 |
| `app/dashboard/travel/*` | 🔍 NON CONTROLLATO | S7 |
| `lib/tripUtils.js` | 🔍 NON CONTROLLATO | S7 |

---

## ⚡ Ordine di esecuzione ottimale

```
S0 → git push ✅
S1 → go/data + go/wrap ✅ (Captain Go sbloccato)
S2 → qr/resolve (sblocca scan QR badges)
S3 → wrap-trip/page.js (sblocca WrapTrip)
S4 → go/[token]/page.js (dipende da S1+S2)
S5 → crew/merge + go/ping
S6 → quick-create
S7 → audit finale
S8 → test + merge master
```

---

## 📌 Note importanti per Claude

1. **NON rileggere file già fixati** — usa questa lista come riferimento
2. **Ogni sessione leggi SOLO i file elencati** per quella sessione
3. **id TEXT esiste ancora** — è il vecchio valore visivo (es. "VAN-01"), NON eliminarlo
4. **uuid UUID** è il nuovo PK — usalo per tutte le FK
5. **QR codes** contengono il vecchio TEXT id → lookup per `.eq('id', ...)` è CORRETTO per i QR
6. **hotel_id in crew** → è già UUID dopo migrazione → lookup locations per `.eq('uuid', ...)`
7. **driver_crew_id in vehicles** → è già UUID dopo migrazione → lookup crew per `.eq('uuid', ...)`
