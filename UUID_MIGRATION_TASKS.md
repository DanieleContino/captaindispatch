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
```

> ✅ **Ultimo push:** commit `2538642` su branch `uuid-migration` (2026-05-31)

---

## 📋 SESSIONI DA FARE (in ordine)

---

### ~~🔧 SESSIONE 0-8~~ ✅ COMPLETATE

Vedi sezione "GIÀ COMPLETATO" sopra.

---

### ~~🔧 SESSIONE 8 — travel/page.js~~ ✅ COMPLETATA
> **Audit 2026-05-31**: file già corretto — nessuna modifica necessaria.

---

### ~~🔧 SESSIONE 9 — TripSidebar + EditTripSidebar getClass/busyMap~~ ✅ COMPLETATA
> **2026-05-31**: commit `2538642`

**Fix applicati:**
- `TripSidebar.js`: `getClass()` ora usa `locUuidToTextId[uuid] || uuid` (L291), `trip_passengers.insert` usa `crew_id: c.uuid`
- `EditTripSidebar.js`:
  - `getClass()` in `loadPaxData` (L171): `locsDisplayMap?.[effectivePickup] || effectivePickup`
  - `getClass()` in loop siblings (handleSubmit): `locsDisplayMap?.[sib.pickup_id] || sib.pickup_id`
  - `getClass()` in loop extraLegs (handleSubmit): `locsDisplayMap?.[leg.pickup_id] || leg.pickup_id`
  - `busyMap[c.id]` → `busyMap[c.uuid]` in 11 punti (freeCount, busyCount, "Add all", filtered.map×2, NTN headers×2, filteredNtn.map×4)

---

### ~~🔧 SESSIONE 10 — lib/tripUtils.js (audit)~~ ✅ COMPLETATA
> **Audit 2026-05-31**: file già corretto — nessuna modifica necessaria.

**Risultato audit:**
- `getClass(p, d)` → prende TEXT display id (controlla prefissi `APT_`, `STN_`, `PRT_`) — **by design, NON modificare**. Chiamanti (TripSidebar, EditTripSidebar) già fixati in S9.
- `isHub(id)` → idem, lavora su TEXT id — nessuna modifica.
- `checkVehicleAvail(vehicleId, ...)` → `.eq('vehicle_id', vehicleId)` su `trips` — colonna già UUID, i chiamanti passano `v.uuid` (auditati nelle sessioni precedenti) — **OK**.
- Nessuna query diretta a `locations`, `crew`, `vehicles` nel file.

---

### 🔧 SESSIONE 11 — Test finale + merge in master
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
[ ] Test Trips page: crea/modifica trip, assegna passeggeri
[ ] Test Locations page: crea/modifica location, verifica route refresh
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
| `app/api/qr/resolve/route.js` | ✅ D3+D4 | S2 |
| `app/wrap-trip/page.js` | ✅ G (26135a9) | S3 |
| `app/go/[token]/page.js` | ✅ H (ca92b70) | S4 |
| `app/api/crew/merge/route.js` | ✅ D1 (95e966f) | S5 |
| `app/api/go/ping/route.js` | ✅ D2 (95e966f) | S5 |
| `app/api/trips/quick-create/route.js` | ✅ D5+D6 (c06facf) | S6 |
| `app/api/fleet/map-data/route.js` | ✅ S7 (9deb3fd) | S7 |
| `app/api/routes/compute/route.js` | ✅ S7 (9deb3fd) | S7 |
| `app/api/routes/compute-chain/route.js` | ✅ S7 (9deb3fd) | S7 |
| `app/api/routes/optimize-waypoints/route.js` | ✅ S7 (9deb3fd) | S7 |
| `app/api/routes/refresh-all-locations/route.js` | ✅ S7 (9deb3fd) | S7 |
| `app/api/routes/refresh-location/route.js` | ✅ S7 (9deb3fd) | S7 |
| `app/api/routes/traffic-check/route.js` | ✅ S7 (1b66af0) | S7 |
| `lib/refreshRoutesWithGoogle.js` | ✅ S7 (1b66af0) | S7 |
| `app/dashboard/trips/page.js` | ✅ S7 — OK già corretto | S7 |
| `app/dashboard/trips/_components/TripSidebar.js` | ✅ S9 (2538642) getClass+crew_id fix | S9 |
| `app/dashboard/trips/_components/EditTripSidebar.js` | ✅ S9 (2538642) getClass×3+busyMap×11 | S9 |
| `app/dashboard/trips/_components/ReplicaDayModal.js` | ✅ S7 (9deb3fd) | S7 |
| `app/dashboard/trips/_components/TripRow.js` | ✅ S7 — OK già corretto | S7 |
| `app/dashboard/trips/_components/WaypointReviewModal.js` | ✅ S7 — OK già corretto | S7 |
| `app/dashboard/locations/page.js` | ✅ S7 (1b66af0) fix refresh uuid | S7 |
| `app/dashboard/travel/page.js` | ✅ S8 — OK già corretto | S8 |
| `lib/tripUtils.js` | ✅ S10 — audit: nessuna modifica necessaria | S10 |

---

## ⚡ Ordine di esecuzione ottimale

```
S0 → git push ✅
S1 → go/data + go/wrap ✅ (Captain Go sbloccato)
S2 → qr/resolve ✅ (sblocca scan QR badges)
S3 → wrap-trip/page.js ✅ (sblocca WrapTrip)
S4 → go/[token]/page.js ✅ (dipende da S1+S2)
S5 → crew/merge + go/ping ✅
S6 → quick-create ✅
S7 → audit routes API + trips components ✅ → commit 9deb3fd + 1b66af0
S8 → travel/page.js ✅ (audit: già corretto — nessuna modifica)
S9 → TripSidebar + EditTripSidebar getClass/busyMap ✅ → commit 2538642
S10 → lib/tripUtils.js audit ✅ (audit: già corretto — nessuna modifica)
S11 → test + merge master ← PROSSIMA SESSIONE
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
8. **getClass()** in `lib/tripUtils.js` prende il TEXT display id (non UUID) → i chiamanti devono fare la conversione uuid→textId prima di chiamarla. Pattern corretto: `getClass(locUuidToTextId[pickupUuid] || pickupUuid, ...)` oppure `getClass(locsDisplayMap?.[uuid] || uuid, ...)`
9. **crew_stays.hotel_id** — verificare se è già UUID come `crew.hotel_id` (probabile sì)
10. **busyMap** in EditTripSidebar è keyed per `crew_id` (UUID di Supabase) → usare `busyMap[c.uuid]` non `busyMap[c.id]` ✅ fixato in S9
