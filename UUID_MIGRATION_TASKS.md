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

> ✅ **Ultimo commit pushato:** `2538642` su branch `uuid-migration` (2026-05-31)
> ⚠️ **Modifiche locali NON pushate (S11a):**
>   - `app/dashboard/accommodation/page.js` — fix A1-A4 applicati
>   - `app/dashboard/bridge/page.js` — fix B1-B4 applicati (B5-B13 ancora da fare)

---

## 📋 SESSIONI — STORICO E STATO

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

### 🔧 SESSIONE 11a — Static Audit + Fix Parziali (2026-05-31) ⚠️ IN CORSO
> **Audit automatico eseguito da Cline** — ricerca regex su tutto il codebase JS

#### Schema confermato da audit:
- `crew_stays.crew_id` = **UUID** (FK a `crew.uuid`) — confermato da `crew/page.js:338` e `accommodation/page.js:1413`
- `travel_movements.crew_id` = **UUID** (FK a `crew.uuid`) — confermato da `crew/page.js:608`
- `crew_stays.hotel_id` = **UUID** (FK a `locations.uuid`) — confermato da join PostgREST `hotel:hotel_id(uuid, ...)` in `accommodation/page.js:203`
- `travel_movements.rooming_hotel_id` = **TEXT** (non migrato — TEXT location id) — il dato arriva dall'import fogli Google, non è una FK a `locations`

#### File non-migrated confermati VALID (nessun fix necessario):
- `locations/page.js:136/170/437/444` — update/delete locations row per TEXT `id` → OK (colonna `id` esiste ancora)
- `productions/page.js:146/154`, `settings/production/page.js:124/132` — idem ✅
- `vehicles/page.js:3992` — update vehicles row per TEXT `id` → OK ✅
- `hotel-settings/page.js:278` — update locations per `location_id` TEXT → OK ✅
- `hotel-settings/page.js:209/315` — `hotels.location_id` ancora TEXT → OK ✅
- Tutte le tabelle non migrate (`trips.id`, `crew_stays.id`, `hotels.id`, `productions.id`, ecc.) → OK ✅

#### ✅ Fix APPLICATI in S11a — `accommodation/page.js` (codice modificato, da committare):

| # | Riga | Bug | Fix |
|---|------|-----|-----|
| A-1 | 1155 | `.select('id, full_name...')` — manca `uuid` nel select crew per insert family member | ✅ aggiunto `uuid` |
| A-2 | 1175 | `crew_id: newCrew.id` (TEXT) in `crew_stays.insert` | ✅ → `newCrew.uuid` |
| A-3 | 1212 | `.eq('crew_id', crewMember.id)` (TEXT) in `crew_stays` roommate query | ✅ → `crewMember.uuid` |
| A-4 | 1289 | `crew.update().eq('id', crewId)` — ramo early-return di `syncCrewDates` | ✅ → `.eq('uuid', crewId)` |

#### ✅ Fix APPLICATI in S11a — `bridge/page.js` (B1-B4, codice modificato, da committare):

| # | Riga | Bug | Fix |
|---|------|-----|-----|
| B-1 | 206 | crew `.select(...)` manca `uuid` — serve per calcolare `primaryCrewUuid` | ✅ aggiunto `uuid` |
| B-2 | 245/265 | `duplicate_ids` = TEXT array; `primary_id: primaryId` TEXT → API `/api/crew/merge` aspetta UUID | ✅ `primaryCrewUuid` + `duplicate_uuids` calcolati da `selCrew.find(c => c.id === id)?.uuid` |
| B-3 | 278,292 | `crew_id: primaryId` (TEXT) in `crew_stays.upsert` per multi-stay | ✅ → `primaryCrewUuid` |
| B-4 | 835 | `locations.select('id, name')` manca `uuid` — serve per resolver UUID hotel nei bug B6-B12 | ✅ → `'id, uuid, name'` |

#### ❌ Fix DA FARE — `bridge/page.js` (B5-B13 in `TravelDiscrepanciesWidget`):

| # | Riga approx. | Blocco | Bug | Fix da applicare |
|---|-------------|--------|-----|-----------------|
| B-5 | ~1007 | `travel_date_conflict` → "Use Calendar" btn | `crew.update().eq('id', item.crew_id)` | → `.eq('uuid', item.crew_id)` |
| B-6 | ~1027 | `hotel_conflict` → calcolo `resolvedTravelHotelId` | `locations.find(...).id` ritorna TEXT | → `.uuid` (UUID) |
| B-7 | ~1030 | `hotel_conflict` → calcolo `travelHotel` display | `locations.find(l => l.id === resolvedTravelHotelId)` | → `l.uuid ===` |
| B-8 | ~1041 | `hotel_conflict` → "Use Rooming" btn, `crew.update` | `hotel_id: item.rooming_hotel_id` (TEXT su col UUID) | → `locations.find(l => l.id === item.rooming_hotel_id)?.uuid` |
| B-9 | ~1041 | `hotel_conflict` → "Use Rooming" btn, `crew.update` | `.eq('id', item.crew_id)` | → `.eq('uuid', item.crew_id)` |
| B-10 | ~1042 | `hotel_conflict` → "Use Rooming" btn, `crew_stays.update` | `hotel_id: item.rooming_hotel_id` (TEXT su col UUID) | → stesso UUID lookup di B-8 |
| B-11 | ~1052 | `hotel_conflict` → "Use Calendar" btn, `crew.update` | `.eq('id', item.crew_id)` | → `.eq('uuid', item.crew_id)` |
| B-12 | ~1080/1086 | `match_status === 'unmatched'` → sessionStorage `crewAddNewData` | `hotel_id = item.rooming_hotel_id` (TEXT) e `matchedLoc.id` (TEXT) | → UUID via `locations.find(l => l.id === ...).uuid` |
| B-13 | ~1109 | "Skip future checks" → `crew.update({ no_rooming_check })` | `.eq('id', item.crew_id)` | → `.eq('uuid', item.crew_id)` |

> **Nota B-8/B-10:** `item.rooming_hotel_id` è TEXT (dall'import fogli Google), ma `crew.hotel_id` e `crew_stays.hotel_id` sono colonne UUID. Serve il lookup `locations.find(l => l.id === item.rooming_hotel_id)?.uuid`. La `locations` array ha già `uuid` nel select dopo il fix B-4.
>
> **Nota B-12:** `item.rooming_hotel_id` e `matchedLoc.id` sono entrambi TEXT → convertire in UUID prima di mettere in sessionStorage, che poi viene letto da `crew/page.js` per pre-popolare il form con `hotel_id`.

---

### 🔧 SESSIONE 11b — Fix `bridge/page.js` B5-B13 (DA FARE)
> Applicare i 9 fix rimanenti in `TravelDiscrepanciesWidget`, tutti nel componente `bridge/page.js`.

**Cambio netto da fare nel codice:**

1. **B-5** (~L1007): ramo `personStays.length === 0`, dentro `"Use Calendar"` button onClick:
   ```js
   // PRIMA
   await supabase.from('crew').update({ [field]: item.travel_date }).eq('id', item.crew_id).eq('production_id', productionId)
   // DOPO
   await supabase.from('crew').update({ [field]: item.travel_date }).eq('uuid', item.crew_id).eq('production_id', productionId)
   ```

2. **B-6/B-7** (~L1022-1030): calcolo `resolvedTravelHotelId` e `travelHotel`:
   ```js
   // PRIMA
   )?.id
   const travelHotel = locations.find(l => l.id === resolvedTravelHotelId)?.name || ...
   // DOPO
   )?.uuid
   const travelHotel = locations.find(l => l.uuid === resolvedTravelHotelId)?.name || ...
   ```

3. **B-8/B-9/B-10** (~L1039-1042): blocco `"Use Rooming"` button onClick:
   ```js
   // PRIMA
   if (!item.crew_id || !item.rooming_hotel_id) return
   await supabase.from('crew').update({ hotel_id: item.rooming_hotel_id }).eq('id', item.crew_id)...
   await supabase.from('crew_stays').update({ hotel_id: item.rooming_hotel_id }).eq('crew_id', item.crew_id)...
   // DOPO
   if (!item.crew_id || !item.rooming_hotel_id) return
   const roomingUuid = locations.find(l => l.id === item.rooming_hotel_id)?.uuid || null
   await supabase.from('crew').update({ hotel_id: roomingUuid }).eq('uuid', item.crew_id)...
   await supabase.from('crew_stays').update({ hotel_id: roomingUuid }).eq('crew_id', item.crew_id)...
   ```

4. **B-11** (~L1052): blocco `"Use Calendar"` button onClick (hotel_conflict):
   ```js
   // PRIMA
   await supabase.from('crew').update({ hotel_id: resolvedTravelHotelId }).eq('id', item.crew_id)...
   // DOPO
   await supabase.from('crew').update({ hotel_id: resolvedTravelHotelId }).eq('uuid', item.crew_id)...
   ```

5. **B-12** (~L1080-1088): blocco `match_status === 'unmatched'`, costruzione `hotel_id` per sessionStorage:
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

6. **B-13** (~L1109): blocco `"Skip future checks"` onClick:
   ```js
   // PRIMA
   await supabase.from('crew').update({ no_rooming_check: true }).eq('id', item.crew_id)...
   // DOPO
   await supabase.from('crew').update({ no_rooming_check: true }).eq('uuid', item.crew_id)...
   ```

---

### 🔧 SESSIONE 11c — Commit + Push + Test + Merge Master (DA FARE)
> Solo verifica e git operations

**Checklist pre-merge:**
```
[ ] git add app/dashboard/accommodation/page.js app/dashboard/bridge/page.js
[ ] git commit -m "S11a: UUID fix accommodation A1-A4 + bridge B1-B4 (merge, locations select)"
[ ] git add app/dashboard/bridge/page.js
[ ] git commit -m "S11b: UUID fix bridge TravelDiscrepanciesWidget B5-B13"
[ ] git push origin uuid-migration
[ ] Deploy Vercel su preview uuid-migration branch
[ ] Test Captain Go: captaindispatch.com/go/[token]
    - Sessione start/stop
    - Visualizza trips con pickup/dropoff location names
    - Wrap trip da Captain Go
[ ] Test WrapTrip: /wrap-trip
    - FleetMonitor mostra vehicle status correttamente
    - Crea wrap trip con vehicle + crew
[ ] Test Scan QR: /scan?qr=CR:xxx e /scan?qr=VH:xxx
[ ] Test Quick-Create trip dal dashboard
[ ] Test Trips page: crea/modifica trip, assegna passeggeri
[ ] Test Locations page: crea/modifica location, verifica route refresh
[ ] Test Bridge → Duplicate crew: merge due crew → verifica crew_stays create con UUID corretto
[ ] Test Bridge → Travel Discrepancy: risolvi hotel conflict con "Use Rooming" e "Use Calendar"
[ ] Test Bridge → Unmatched: crea nuovo crew da discrepancy, verifica hotel_id in sessionStorage
[ ] Test Accommodation: aggiungi family member → stay creata con crew.uuid
[ ] Test Accommodation: aggiungi roommate → crew_stays.crew_id = crewMember.uuid
[ ] Se tutto ok → git checkout master && git merge uuid-migration && git push
```

---

## 🗂️ File con status UUID

| File | Status | Sessione |
|------|--------|---------|
| `scripts/create-schema.sql` | ✅ SQL done | — |
| `app/dashboard/accommodation/page.js` | ✅ A1/A2 vecchi + **S11a A1-A4** ⚠️ non pushato | S11a |
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
| `app/dashboard/bridge/page.js` | ⚠️ **S11a B1-B4** applicati (non pushato) — **B5-B13 DA FARE** | S11a/S11b |

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
S11a → static audit + fix accommodation A1-A4 + bridge B1-B4 ✅ (locale, NON pushato)
S11b → fix bridge TravelDiscrepanciesWidget B5-B13 ← DA FARE
S11c → commit + push + test + merge master ← DOPO S11b
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
9. **crew_stays.hotel_id** — **CONFERMATO UUID** (FK a `locations.uuid`) — join PostgREST `hotel:hotel_id(uuid, ...)` in accommodation/page.js:203
10. **busyMap** in EditTripSidebar è keyed per `crew_id` (UUID di Supabase) → usare `busyMap[c.uuid]` non `busyMap[c.id]` ✅ fixato in S9
11. **travel_movements.rooming_hotel_id** → è **TEXT** (non migrato, viene dall'import Google Sheets) — non è una FK UUID. Serve lookup `locations.find(l => l.id === item.rooming_hotel_id)?.uuid` per ottenere l'UUID da usare nelle colonne crew/crew_stays.
