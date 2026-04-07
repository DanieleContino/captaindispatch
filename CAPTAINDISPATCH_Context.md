# CAPTAINDISPATCH — Context S45 (Cline)
## Updated: 7 April 2026

---

## NEXT SESSION: S45

### S44 completata ✅ — Accommodation & Travel edit nella CrewSidebar (7 Apr 2026)

> **Feature**: nella `CrewSidebar` (solo edit mode), aggiunti 2 nuovi accordion a tendina identici per stile al "📞 Contact Info" esistente:

#### 🏨 Accordion Accommodation — Stays

- Carica tutti i soggiorni dalla tabella `crew_stays` (lazy — solo alla prima apertura)
- Lista ogni stay con hotel, check-in, check-out + badge "dep today/tomorrow" in rosso
- **Add**: form inline con select hotel + date check-in/out → INSERT su `crew_stays`
- **Edit** (✎): modifica inline → UPDATE su `crew_stays`
- **Delete** (🗑 + conferma): DELETE su `crew_stays`
- **Sync automatico** dopo ogni operazione: aggiorna `crew.hotel_id`, `crew.arrival_date`, `crew.departure_date` con la stay attiva (periodo che copre oggi, altrimenti la prossima futura)
- `onCrewDatesUpdated` callback: aggiorna anche il form principale della sidebar in tempo reale

#### ✈️ Accordion Travel Movements

- Carica tutti i `travel_movements` per quel crew (lazy)
- Lista ogni movement con icona tipo (✈️/🚂/🚐), badge IN (verde) / OUT (arancio), numero, rotta, orario, badge 🚐 se needs_transport
- Movimenti passati (travel_date < oggi): opacità 0.65
- **Add**: form inline completo — Date, Direction (IN/OUT), Type, Number, From + dep time, To + arr time, needs_transport checkbox
- **Edit** (✎) + **Delete** (🗑 + conferma)

#### Componenti aggiunti

- `AccommodationAccordion({ crewId, locations, onCrewDatesUpdated })` — definito prima di `CrewCard`
- `TravelAccordion({ crewId })` — definito prima di `CrewCard`
- Iniettati in `CrewSidebar` dopo il Contact Info accordion, solo quando `mode === 'edit' && initial?.id`

#### Commit

| Hash | Descrizione |
|---|---|
| `6db9343` | `feat(crew): Accommodation & Travel accordions in CrewSidebar edit mode (S44)` |

#### Regola aggiunta

> I due nuovi accordion salvano immediatamente in DB (non aspettano "Save Changes"). Il pulsante "Save Changes" salva solo i campi principali del form (nome, dept, hotel, status, date, note). Quando `crew_stays` viene modificato, `crew.hotel_id/arrival_date/departure_date` viene sincronizzato automaticamente.

---

### Hotfix completato ✅ — travel_status: arrival_date=oggi NON switcha PRESENT prematuramente (7 Apr 2026)

> **Problema**: persone con `arrival_date = oggi` e volo nel pomeriggio venivano switchate a `PRESENT` al caricamento della pagina Crew, prima che il loro volo atterrasse.

#### Causa
Due punti del codice usavano `arrival_date <= today` (o `>=`) per calcolare il travel_status:
1. `app/dashboard/crew/page.js` — auto-update al caricamento pagina Crew
2. `app/api/import/confirm/route.js` — calcolo travel_status iniziale all'import accommodation

#### Fix — commits `931ac4b` + `742d811`

**`app/dashboard/crew/page.js`** — `loadCrew()` — nuova logica `expectedStatus(c)`:
```js
const hasInMovementToday = new Set(
  travelData.filter(tm => tm.travel_date === today && tm.direction === 'IN').map(tm => tm.crew_id)
)

function expectedStatus(c) {
  if (today > c.departure_date)       return 'OUT'
  if (today > c.arrival_date)         return 'PRESENT'       // arrivato ieri o prima
  if (today === c.arrival_date) {
    return hasInMovementToday.has(c.id) ? 'IN' : 'PRESENT'   // volo oggi→IN, hotel-only→PRESENT
  }
  if (today < c.arrival_date)         return 'IN'
  return null
}
```
- Usa `travelData` già caricato (zero query extra)
- **Retroattivo**: se qualcuno era già a PRESENT per errore → viene riportato a IN
- Cron `arrival-status` (ogni 5 min) gestisce la transizione IN→PRESENT dopo il trip ARRIVAL

**`app/api/import/confirm/route.js`** — `processAccommodation()`:
```js
// Prima (bug): arrival_date <= today → PRESENT
// Dopo (fix):
if (today > activeStay.departure_date)                                    travel_status = 'OUT'
else if (activeStay.arrival_date < today && today <= activeStay.departure_date) travel_status = 'PRESENT'
else                                                                       travel_status = 'IN'
```
- `arrival_date = oggi` → `IN` all'import (crew page correggerà a PRESENT se hotel-only)

#### Regola finale travel_status
| Condizione | Status |
|---|---|
| `arrival_date < oggi` | PRESENT |
| `arrival_date = oggi` + volo IN oggi | IN (cron gestisce) |
| `arrival_date = oggi` + nessun volo | PRESENT (hotel check-in) |
| `arrival_date > oggi` | IN |
| `departure_date = oggi` | PRESENT (lavora fino a sera) |
| `departure_date < oggi` | OUT |

---

### S43 completata ✅ (Rocket — Vehicle Preferences + Two-Pass Assignment)

> **Obiettivo**: In Rocket, i veicoli con `preferred_dept` o `preferred_crew_ids` vengono assegnati prioritariamente ai gruppi/crew corrispondenti, garantendo che il van HMU non vada mai a crew di altri dipartimenti se esiste un gruppo HMU.

#### DB migration — `scripts/migrate-vehicle-preferences.sql` (commit `18e2b5e`)
```sql
ALTER TABLE vehicles
  ADD COLUMN IF NOT EXISTS preferred_dept      text,
  ADD COLUMN IF NOT EXISTS preferred_crew_ids  uuid[] DEFAULT '{}';
```
Query SELECT in `loadData` aggiornata: `preferred_dept,preferred_crew_ids` inclusi nel fetch veicoli.

#### Algoritmo — `app/dashboard/rocket/page.js` (commits `18e2b5e` → `ad5ff87` → `b4898e4`)

**`getMajorityDept(groupCrew)`**: restituisce il dept più frequente nel gruppo.

**`pickBestVehicle(pool, groupCrew)`**: sostituisce `pool.shift()`. Assegna score a ogni veicolo:
- `+capacity` (tiebreaker)
- `+100` se `v.preferred_dept === dominantDept`
- `+20 × N` per ogni `preferred_crew_ids[i]` presente nel gruppo
Usa `pool.splice(bestIdx, 1)` per estrarre il veicolo migliore in qualsiasi posizione del pool.

**Two-pass preferred assignment v3 (S43 bug fix)** — `runRocket()`:

1. **`groupDepts`** — raccoglie **TUTTI** i dept presenti in qualsiasi crew di qualsiasi gruppo (non solo la maggioranza). Garantisce che anche un dept minoritario (es. 2 HMU su 6 crew) attivi la riserva.

2. **Pool partitioning**: i veicoli con `preferred_dept` che esiste in `groupDepts` vanno in `preferredPools[dept]`. Gli altri in `normalPool`.

3. **`vehiclePreferredDepts`** — Set dei dept con almeno un veicolo riservato.

4. **Re-sort gruppi**: gruppi che contengono almeno 1 crew di un dept preferito vengono processati **prima** degli altri (stesso tier per dimensione), così non possono essere "rubati" da gruppi più grandi senza preferenze.

5. **`getNextVehicle(groupCrew)`** — priorità:
   - 🥇 Itera su ogni crew del gruppo: se `c.department` ha un `preferredPool` → usa quello
   - 🥈 `normalPool`
   - 🥉 Qualsiasi `preferredPool` rimasto (last resort cross-dept)

**Fallback**: se non esiste nessun crew del dept preferito nella run → il veicolo va in `normalPool` e viene assegnato normalmente.

#### UI — `TripCard`
- Riga `⭐ Pref: [DEPT_BADGE] · N crew pref` sopra la crew list (sfondo ambra `#fffbeb`)
- Badge `★` inline accanto ai nomi crew che matchano `preferred_crew_ids`

#### Commits
| Hash | Descrizione |
|---|---|
| `18e2b5e` | S43: Migration SQL + `pickBestVehicle` + UI TripCard |
| `ad5ff87` | S43 v2: Two-pass — `preferredPools` riservato per dept |
| `b4898e4` | S43 v3: Any-dept match + gruppi preferred ordinati prima |

#### Regola aggiunta
> In `runRocket`, i veicoli con `preferred_dept` vengono partizionati PRIMA del loop principale. `getNextVehicle()` controlla ogni crew (non solo la maggioranza) per trovare il pool corretto. I gruppi con crew preferred vengono sempre processati prima degli altri.

### S42 completata ✅ (Vehicles — auto-suggest ID + DB rename)

> **S42-A**: Campo Vehicle ID nella sidebar "New Vehicle" ora si pre-popola automaticamente in base alla tipologia selezionata.
> - Helper `suggestId(type, vehicles)`: conta i veicoli con lo stesso prefisso tipo → `CARGO-01`, `VAN-03`, etc.
> - `useEffect` che ricalcola l'ID suggerito ogni volta che `form.vehicle_type` cambia (solo se `!idManuallyEdited`)
> - `idManuallyEdited = true` quando l'utente digita manualmente nel campo ID → il cambio tipo non sovrascrive più
> - In Edit mode il campo rimane `readOnly` come prima
> - Commit: `5ebff23` — `feat(vehicles): auto-suggest Vehicle ID from type — VAN-01, CAR-02, etc. (S42)`
> - File: `app/dashboard/vehicles/page.js` (+20/-5)
>
> **S42-B**: Rinominati veicoli con vecchia nomenclatura in DB tramite SQL script su Supabase.
> - Veicoli con `vehicle_type = CARGO/PICKUP/TRUCK` ma `id LIKE 'VAN-%'` rinominati in `CARGO-01`, `PICKUP-01`, `TRUCK-01`, etc.
> - Script usa INSERT+UPDATE trips+DELETE (safe con FK attive, senza ON UPDATE CASCADE)
> - Cascade automatico su `trips.vehicle_id`
> - Eseguito direttamente in Supabase SQL Editor (no migration file)

### S41 completata ✅ (Vehicles — driver crew link + auto NTN)

> **S41**: Aggiunta la possibilità di collegare un membro del crew come autista di un veicolo nella pagina Vehicles. Quando assegnato, il crew viene automaticamente marcato come NTN (no_transport_needed = true) al salvataggio → scompare da Rocket, pax-coverage e trips senza modifiche a nessun'altra pagina.
>
> **DB migration** (`scripts/migrate-vehicle-driver-crew.sql`):
> ```sql
> ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS driver_crew_id TEXT;
> ```
>
> **UI — `app/dashboard/vehicles/page.js`**:
> - Campo Driver ora è un **autocomplete ibrido**: mentre si digita il nome appare un dropdown con i crew corrispondenti (header "🔗 Collega crew come driver")
> - Selezionando un crew → il campo si trasforma in un chip verde: `🔗 Mario Rossi · 🚐 NTN` con ✕ per scollegare
> - Al salvataggio: se `driver_crew_id` è impostato → `supabase.from('crew').update({ no_transport_needed: true })`
> - Lista veicoli (VehicleRow): driver collegato mostra `🔗 Nome` in verde con badge `NTN`; driver libero mostra `👤 Nome`
> - Se si scollega il driver, `driver_crew_id` → null; NTN sul crew rimane (gestito manualmente dalla pagina Crew)
>
> Commit: `50c33af` — `S36: Vehicle driver crew link — autocomplete + auto NTN`
> File: `app/dashboard/vehicles/page.js` (+89/-6), `scripts/migrate-vehicle-driver-crew.sql` (nuovo)

### S40 completata ✅ (Rocket — TripCard layout fix: multi-pickup visuale)

> **S40**: Fix layout dell'header `TripCard` in Rocket fase 2 (Preview) quando il trip diventa multi-pickup o multi-dropoff.
>
> **Problema**: Nella fase 2 di Rocket, spostando passeggeri da trip diversi, quando un trip diventava MULTI-PKP/MULTI-DRP:
> 1. I badge (`🔀 MULTI-PKP`, `🔀 MULTI-DRP`, `📋 serviceType`) si sovrapponevano ai chip a destra (`⏱`, `arr. HH:MM`, pax count) — badge troncati (es. `MULTI-PK` invece di `MULTI-PKP`)
> 2. Nel breakdown aperto, le righe multi-pickup mostravano solo `→ Masseria Torre Maizza...` senza il nome dell'hotel di partenza (compresso a 0px da `flex:1 + overflow:hidden`)
>
> **Fix A — Header right side a 2 righe** (commit `8490bdf`):
> - Lato destro ora usa `flexDirection: 'column'` invece di una singola riga
> - Row 1: `⏱30m  arr. 07:00`
> - Row 2: `4/8  ▼`
> - `flexShrink: 0` garantisce che il lato destro non venga mai compresso
> - Left side: `flex: '1 1 0'` + `overflow: 'hidden'` propagato correttamente + badge row con `flexWrap: 'wrap'`
>
> **Fix B — Breakdown multi-pickup a 2 righe per hotel** (commit `38b862f`):
> - Ogni hotel nel breakdown è ora un mini-card con sfondo `#f8fafc` e bordo `#e2e8f0`
> - **Row 1**: `🏨 Nome Hotel` — sempre visibile, `overflow:hidden` + `textOverflow:ellipsis` solo se il nome è davvero lungo
> - **Row 2**: `→ Destinazione  🕐 HH:MM  N pax` — destinazione con `flex:1` + ellipsis, orario e pax sempre visibili
> - Stesso layout applicato al breakdown multi-dropoff
>
> File: `app/dashboard/rocket/page.js`
> Commits: `8490bdf`, `38b862f`

### S39 completata ✅ (Trips — CrewInfoModal: pulsante "i" + overlay non blocca sidebar)

> **S39**: Migliorata l'accessibilità al `CrewInfoModal` in `app/dashboard/trips/page.js`.
>
> **Feature A — Pulsante "i" nel banner Assigning (TripsPageInner)**
> - Aggiunto stato `showAssignInfo` in `TripsPageInner`
> - Pulsante circolare `i` accanto al nome crew nel banner giallo → apre `CrewInfoModal`
> - `CrewInfoModal` renderizzato nel JSX di `TripsPageInner` con `{showAssignInfo && assignCtx && ...}`
> - Commit: `3133bd5`
>
> **Feature B — Pulsante "i" nell'header della TripSidebar**
> - Aggiunto pulsante `i` (cerchio 16px, border ambra) accanto a 👤 nome crew nel dark header
> - Click → `setCrewInfoCrew({ id: assignCtx.id, full_name: assignCtx.name })`
> - Commit: `604f89d`
>
> **Feature C — Overlay non copre la sidebar + chiude solo con X**
> - Aggiunto prop `overlayRight = 0` a `CrewInfoModal`
> - Overlay: `right: overlayRight` invece di `inset: 0` — si ferma prima della sidebar
> - Rimosso `onClick={onClose}` dall'overlay (il modal chiude SOLO con il pulsante ✕)
> - `TripSidebar`: passa `overlayRight={SIDEBAR_W}` → sidebar rimane interattiva col modal aperto
> - `EditTripSidebar`: idem
> - `TripsPageInner` (banner): `overlayRight` non passato → default 0 (copre tutto)
> - Commit: `6e87659`
>
> File: `app/dashboard/trips/page.js`

### S38 completata ✅ (Trips — pickup_time manual override)

> **S38**: Aggiunto campo **Pickup Time (override — optional)** sia in `TripSidebar` (CREATE) che in `EditTripSidebar` (EDIT).
>
> **Cosa fa**: permette al coordinatore di forzare manualmente l'orario di pickup sovrascrivendo il calcolo automatico (`call - duration`). Quando valorizzato, il campo si colora in ambra con badge `⚡ Pickup time overridden — automatic calculation ignored` e bottone `✕ clear`.
>
> **Campi form aggiornati**:
> - `EMPTY` (TripSidebar): aggiunto `pickup_time: ''`
> - `EDIT_EMPTY` (EditTripSidebar): aggiunto `pickup_time: ''`
>
> **UI**: campo `<input type="time">` sotto il grid Duration/Arrival-Time, con bordo ambra e sfondo giallo pallido quando valorizzato.
>
> **Logic handleSubmit TripSidebar**:
> ```js
> pickup_min: form.pickup_time ? timeStrToMin(form.pickup_time) : (computed?.pickupMin ?? null),
> start_dt: // calcolato da pickup_time se presente, altrimenti computed?.startDt
> end_dt:   // calcolato da pickup_time + durMin se presenti, altrimenti computed?.endDt
> ```
>
> **Logic handleSubmit EditTripSidebar** (solo `!isMulti` — i MULTI usano compute-chain):
> ```js
> pickup_min: form.pickup_time ? timeStrToMin(form.pickup_time) : mainPickupMin,
> start_dt / end_dt: // stesso override pattern con form.date per costruire ISO string
> ```
>
> Commit: `83b1d27` — `feat(trips): pickup_time manual override in TripSidebar + EditTripSidebar`
> File: `app/dashboard/trips/page.js` (+55/-8)

### S37 completata ✅ (Rocket — crew ineligibili + date-first eligibility)

> **S37-A**: Rocket Step 1 — crew NTN e assenti visibili ma greyed-out.
> La query `loadData` ora carica **tutti** i crew CONFIRMED (rimosso il filtro `.or('on_location...')`).
> La funzione `getCrewIneligibleReason(c, runDate)` classifica ogni crew:
>   - `'NTN'` se `no_transport_needed = true`
>   - `'ABSENT'` se fuori range `arrival_date`/`departure_date` (o nessuna data + `on_location ≠ true`)
>   - `null` = eligible
> I crew ineligibili appaiono in lista con opacity 0.38, nessun checkbox, badge `🚫 NTN` o `🏠 Absent`.
> Commit: `10612ce` — `feat(rocket): show ineligible crew (NTN/Absent) greyed-out with icons in Step 1 (S37)`
>
> **S37-B**: Fix root cause — `on_location = true` non deve sovrascrivere `arrival_date` futuro.
> Root cause: `getCrewIneligibleReason` usava `on_location === true` come OR cortocircuitante → crew con `on_location=true` ma `arrival_date` nel futuro venivano considerati presenti.
> Fix: **date-first** — se `arrival_date` + `departure_date` sono impostati, si usano **sempre** le date; `on_location` è solo un fallback per chi non ha date.
> Commit: `af6e548` — `fix(rocket): date-first eligibility check — on_location no longer overrides future arrival_date (S37)`
>
> **S37-C**: Stesso fix applicato a `runRocket()` (Step 2 usava ancora la vecchia logica con `on_location || date range`).
> Commit: `42d383c` — `fix(rocket): align runRocket eligible filter to date-first logic (S37)`
>
> **Regola aggiunta**: In Rocket, l'eligibilità di un crew si calcola con **date-first**:
> ```js
> if (c.arrival_date && c.departure_date) {
>   present = c.arrival_date <= runDate && c.departure_date >= runDate
> } else {
>   present = c.on_location === true  // fallback
> }
> ```
> `on_location` è un badge visivo, NON un gate funzionale. La stessa logica vale sia in Step 1 (`getCrewIneligibleReason`) sia in `runRocket()`.

### S36 completata ✅ (2 fix: S36-A + S36-B)
> **S36-A**: `EditTripSidebar` "+ Add Leg" — tab duplicate nel leg selector.
> Root cause: il `useEffect` di inizializzazione caricava i sibling del trip da DB in `extraLegs`, ma quei sibling erano già presenti nel prop `group` passato dal parent. Il tab bar renderizzava `[...group, ...extraLegs]` → T001B appariva due volte con lo stesso `id`, causando doppia evidenziazione al click su qualsiasi tab.
> Fix: rimosso il blocco DB load in `extraLegs` all'open. `extraLegs` contiene **solo** i nuovi leg aggiunti via "+ Add Leg" (non ancora in DB).
> Commit: `65413c9` — `fix(trips): EditTripSidebar + Add Leg — remove duplicate extraLegs load, fix trip_id on save (S36)`
>
> **S36-B**: `handleSubmit` salvava il nuovo leg con lettera sbagliata.
> Root cause: `baseId + suffixes[i]` usava `i=0 → 'B'` indipendentemente dai sibling già esistenti in `group` (es. con group=[T001, T001B], il nuovo leg T001C veniva salvato come T001B).
> Fix: usato `leg.trip_id` (già calcolato correttamente nel "+ Add Leg" onClick che conta i letters usate in `group`).
>
> **Regola aggiunta**: `extraLegs` in `EditTripSidebar` deve contenere SOLO i nuovi leg aggiunti via UI (non ancora in DB). I sibling esistenti sono gestiti esclusivamente dal prop `group`. NON caricare i sibling da DB in `extraLegs` all'open.

### S35 completata ✅ (2 fix: S35 + S35-B)
> **S35**: fix regressione S34-B — `tripDate` per new leg usava `isoToday()` invece di `form.date`.
> Commit: `524dd4c` — `fix(trips): use form.date in loadPaxData for new legs (S35)`
>
> **S35-B (root cause reale)**: `.eq('crew.hotel_status', 'CONFIRMED')` e `.order('crew.department').order('crew.full_name')` sulla query `crew_stays` causavano **400 Bad Request** da PostgREST perché sono filtri/ordinamenti su embedded resource non supportati da questa istanza Supabase. La query falliva silenziosamente → `crewRes.data = null` → lista pax SEMPRE vuota, per tutti i leg (nuovi e esistenti).
> Fix: rimossi entrambi dalla chain PostgREST, applicati client-side dopo il risultato.
> Commit: `c2bf2c0` — `fix(trips): remove PostgREST embedded filter, apply hotel_status+sort client-side (S35-B)`
> File modificato: `app/dashboard/trips/page.js` — ~10 righe in `loadPaxData`.
>
> **Regola aggiunta**: NON usare `.eq('joined_table.column', value)` o `.order('joined_table.column')` su query Supabase con `!inner` join — causa 400. Filtrare/ordinare sempre client-side dopo il fetch.

### S34 completata interamente (A–E) ✅
> S34-E completata in sessione S35 (commit `5b67e47`).
> Tutti e 5 i task di S34 sono chiusi. Prossima priorità: bug aperti (vedi sezione OPEN BUGS).

---

## WHAT CHANGED IN SESSION S34

### Obiettivo S34 (COMPLETATO A–D, manca solo E)
Separare `travel_status` (badge visivo) dalla logica di selezione dei passeggeri nei trip.
Il filtro pax usa `arrival_date`/`departure_date` invece di `travel_status`.
**Motivazione**: pianificazione trip in anticipo senza blocchi, robustezza multi-stay.

### Principio
> `travel_status` rimane come badge visivo su scan/bridge/crew/hub-coverage.
> NON viene più usato come gate funzionale per filtrare i pax nei trip.

### Le 5 task S34

#### ✅ S34-A · `TripSidebar` CREATE — filtro pax date-based (commit `3a80138`)
- **File**: `app/dashboard/trips/page.js`
- **Scope**: `useEffect` "Available crew" — 3 righe + dipendenza `form.date`
- **Fatto**:
  - ARRIVAL: `.eq('hotel_id', form.dropoff_id).eq('arrival_date', form.date)`
  - DEPARTURE: `.eq('hotel_id', form.pickup_id).eq('departure_date', form.date)`
  - STANDARD: `.or('and(hotel_id.eq.${pickup},arrival_date.lte.${date},departure_date.gte.${date}),on_location.eq.true')`
  - Aggiunto `form.date` alle dipendenze del `useEffect`

#### ✅ S34-B · `EditTripSidebar` `loadPaxData` — differenziare per transfer class (commit `07c9889`)
- **File**: `app/dashboard/trips/page.js`
- **Scope**: query `crewRes` dentro `loadPaxData` — da STANDARD universale a 3-branch
- **Fatto**: la query `crew_stays` ora differenzia ARRIVAL/DEPARTURE/STANDARD:
  - ARRIVAL: `.eq('hotel_id', legHotelDropoff).eq('arrival_date', tripDate)`
  - DEPARTURE: `.eq('hotel_id', legHotelPickup).eq('departure_date', tripDate)`
  - STANDARD: `.eq('hotel_id', legHotelPickup).lte('arrival_date').gte('departure_date')`

#### ✅ S34-C · `hub-coverage/page.js` — query crew by date (commit `2b4b02e`)
- **File**: `app/dashboard/hub-coverage/page.js`
- **Scope**: commento in cima + `assignTS` nelle callback `onAssign`
- **Fatto**:
  - Commento aggiornato: rimossa menzione `travel_status IN/OUT`
  - `assignTS: c.travel_status` → `c.arrival_date === date ? 'IN' : 'OUT'` (x2)
  - Query crew già usava `.or('arrival_date.eq.${d},departure_date.eq.${d}')` — invariata

#### ✅ S34-D · `rocket/page.js` — eligibility filter (commit `082bc75`)
- **File**: `app/dashboard/rocket/page.js`
- **Scope**: `loadData` DB query + `runRocket` eligible filter
- **Fatto**:
  - SELECT: rimosso `travel_status`, aggiunto `arrival_date,departure_date`
  - `.eq('travel_status','PRESENT')` → `.or('on_location.eq.true,and(arrival_date.lte.${isoToday()},departure_date.gte.${isoToday()})')`
  - `runRocket` eligible: `c.travel_status === 'PRESENT'` → `(c.on_location === true || (c.arrival_date && c.departure_date))`

#### ✅ S34-E · Tooltip debug sidebar — aggiornare testo (commit `5b67e47`)
- **File**: `app/dashboard/trips/page.js`
- **Scope**: 3 stringhe testo nel debug panel pax
- **Fatto**: `"status=IN"` → `"arrival_date=date"`, `"status=OUT"` → `"departure_date=date"`, `"status=PRESENT"` → `"arrival<=date<=departure"`

### Regola operativa S34
> Ogni task = 1 commit separato. Ordine: A → B → C → D → E.
> Non fare più di una task per sessione. Max ~20 righe modificate per commit.

---

## WHAT CHANGED IN SESSION S33

### Captain Bridge Upgrade — `app/dashboard/bridge/page.js`

**Componenti aggiunti** sopra il tab bar esistente (Pending Users / Invite Codes):
1. **`EasyAccessShortcuts`** — barra link rapidi verso tutte le pagine dashboard
2. **`NotificationsPanel`** — alert unread dalla nuova tabella `notifications`
3. **`TomorrowPanel`** — crew in arrivo/partenza domani da `crew.arrival_date`/`departure_date` + link "Launch Rocket for tomorrow"
4. **`ArrivalsDeparturesChart`** — grafico Recharts 30 giorni (arrivi/partenze), con highlight today/tomorrow
5. **`MiniWidgets`** — 3 box: Fleet count, Crew status (PRESENT/IN/OUT), Crew confirmed
6. **`ActivityLog`** — ultimi 50 log dalla tabella `activity_log`

**Nuove tabelle DB** (migrate-s33-bridge-upgrade.sql):
- `notifications` (id, production_id, type, message, read, created_at)
- `activity_log` (id, production_id, user_id, action_type, description, created_at)

**Badge navbar**: `useBridgeBadge()` hook in `lib/navbar.js` — badge rosso pulsante se ci sono notifications non lette.

---

## WHAT CHANGED IN SESSION S15

### Multi-stay cross-check: `processTravelRows` usa `crew_stays` (commit `0eee410`) — `app/api/import/parse/route.js`

**Problema**: `processTravelRows` calcolava `travel_date_conflict` e `rooming_date` leggendo solo `crew.arrival_date`/`departure_date` (campo singolo). Per persone con soggiorni multipli (multi-stay), il secondo viaggio veniva segnalato come falso positivo.

**Fix**:
- Aggiunta query `crew_stays` al `Promise.all` esistente: `supabase.from('crew_stays').select('crew_id, hotel_id, arrival_date, departure_date').eq('production_id', productionId)`
- Nuovo branch `if (personStays.length > 0)`:
  - `travel_date_conflict = !coveringStay` — falso positivo solo se NESSUNA stay copre la travel_date
  - `rooming_date` dalla stay più vicina alla travel_date
  - `hotel_conflict`: vero solo se hotel del travel non corrisponde ad ALCUNA stay
  - `rooming_hotel_id` / `rooming_date` dalla stay più vicina
- Fallback ai campi diretti `crew.arrival_date`/`departure_date` se la persona non ha stays

---

### Bridge — `TravelDiscrepanciesWidget` live re-check vs `crew_stays` (commit `9fe75fc`) — `app/dashboard/bridge/page.js`

**Problema**: I valori `travel_date_conflict`, `rooming_date`, `rooming_hotel_id` in `travel_movements` erano calcolati all'import e salvati staticamente. Record già in DB avevano ancora i vecchi valori (falsi positivi).

**Fix**:
- `useEffect` carica `travel_movements` + `locations` + `crew_stays` in parallelo (live)
- Re-evalua ogni item con stays reali prima di `setItems`:
  - Se `travel_date_conflict=true` ma una stay copre la travel_date → **falso positivo**: rimosso dall'UI + marcato `discrepancy_resolved=true` nel DB (background silenzioso)
  - Se `hotel_conflict=true` ma una stay ha l'hotel corretto → stesso trattamento
- `item._personStays` — stays arricchite sull'item per uso nel render
- `liveRoomingDate` — calcolata runtime dalla stay più vicina (sovrascrive valore stale)
- Badge "(N stays)" mostrato quando la persona ha più di una stay
- **"Use Calendar" button** — aggiorna la `crew_stay` più vicina alla travel_date (`.eq('arrival_date', closestStay.arrival_date)`), non più `crew.arrival_date`/`departure_date`

---

## WHAT CHANGED IN SESSION S14

### EditTripSidebar — Add Leg: pax selezionabili e trip diventa multi (commits b0c5d1d → 61ad85b) — `app/dashboard/trips/page.js`

#### Bug risolti

**Bug A — pax non selezionabili nel nuovo leg** (continuazione S13)
- Root cause: `addPax()` tentava `INSERT trip_passengers` con `trip_row_id = activeLeg.id` (intero `Date.now()`, non UUID) → FK violation silenziosa → `setAssignedPax` mai chiamato → crew non aggiungibile.
- Fix: branch `activeLeg?.isNew` che skippa il DB insert e salva la selezione localmente in `extraLegs[leg].pendingPax`. I pax vengono scritti nel DB solo al save (dopo `INSERT trips` per il nuovo leg).
- Anche `removePax` gestisce la rimozione locale per i new leg (`isNewLegPax = extraLegs.some(l => l.isNew === true && l.id === crew.trip_row_id)`).

**Bug B — albergo di Leg A sovrascritto da Leg B**
- Root cause: `handleSubmit` usava `form.pickup_id/dropoff_id` (che appartengono al nuovo Leg B, impostati dall'utente) per fare `UPDATE trips SET pickup_id=form.pickup_id WHERE id=initial.id` → sovrascriveva la rotta di Leg A.
- Fix: quando `activeLeg?.isNew`, `mainPickupId/mainDropoffId` e tutti i campi di timing vengono letti da `initial` (valori originali di Leg A). Il form è usato solo per i campi condivisi (vehicle, notes, status, date).

#### Stato attuale ✅ RISOLTO
- "+ Add Leg" in EditTripSidebar: la crew disponibile appare correttamente in base a pickup/dropoff del nuovo leg
- I pax selezionati nel nuovo leg vengono salvati nel DB al click "Save Changes"
- Leg A non viene modificato quando si configura Leg B
- Il trip diventa correttamente MULTI (Leg A + Leg B) al salvataggio

---

## WHAT CHANGED IN SESSION S13

### EditTripSidebar — "Add Leg" crew list fix attempts (commits 0ba1f93 → 4240a2d) — `app/dashboard/trips/page.js`

#### Problema
Quando si apre un trip esistente nella `EditTripSidebar`, si preme "+ Add Leg" e si seleziona Pickup + Dropoff sul nuovo leg, la sezione Passengers non mostra alcun crew disponibile.

#### Fix applicati (parziali — BUG ANCORA APERTO)

1. **commit 0ba1f93** — `onChange` Pickup e Dropoff: aggiunto `setExtraLegs(prev => prev.map(...))` per sincronizzare `extraLegs` quando `activeLeg?.isNew` è true. **PROBLEMA**: il replace era finito su `TripSidebar` (prima nel file) invece di `EditTripSidebar` → il Pickup di EditTripSidebar non veniva sincronizzato.

2. **commit ff0d751** — `loadPaxData`: quando `isNewLeg === true`, la terza promise del `Promise.all` (query day trips) ora usa `Promise.resolve({ data: [] })` invece di `supabase.from('trips')...not('id','in','()')` (stringa vuota = PostgREST error = Promise.all reject = crew non caricata).

3. **commit 4240a2d** — Applica correttamente `setExtraLegs` pickup_id al select Pickup dentro `EditTripSidebar` (usando `{/* Pickup / Dropoff */}` come contesto univoco per `replace_in_file`).

#### Stato attuale del codice
- `EditTripSidebar` Pickup onChange: ✅ sync a `extraLegs`
- `EditTripSidebar` Dropoff onChange: ✅ sync a `extraLegs`
- `loadPaxData` dayTrips query per `isNewLeg`: ✅ skippata (no crash)
- Il `useEffect` che triggera `loadPaxData` sulle dep `extraLegs.find(...)?.pickup_id` e `...?.dropoff_id`: ✅ presente
- **ANCORA NON FUNZIONA** — la crew non appare dopo il fix. Il bug potrebbe essere in un'altra parte del flusso non ancora identificata. Non invertire i fix sopra.

#### Prossimi passi per il debug
- Verificare se `loadPaxData` viene effettivamente chiamata dopo il cambio di pickup/dropoff (aggiungere `console.log` temporanei)
- Verificare se `crewRes.data` contiene risultati (il filtro per `hotel_id` + `travel_status` potrebbe essere troppo restrittivo per i new legs)
- Verificare se il `useEffect` dipendente da `extraLegs.find(...)?.pickup_id` scatta correttamente (React batching potrebbe non triggerare il re-run se le due `setState` avvengono nello stesso frame)
- Considerare approccio alternativo: usare `form.pickup_id` e `form.dropoff_id` direttamente come dipendenze del `useEffect` invece di leggere da `extraLegs`

---

## WHAT CHANGED IN SESSION S12

### Multi-trip bug fixes (commits bad38cd → 53852ad) — `app/dashboard/trips/page.js`

#### Bug 1 — Available crew dropdown stale (race condition)
- `useEffect` crew in `TripSidebar`: aggiunto flag `cancelled` + cleanup `return () => { cancelled = true }`
- Le query async della leg precedente vengono ignorate se la leg è cambiata nel frattempo (stale result ignored)

#### Bug 2 — Leg extra creata (leg C non richiesta)
- **Causa radice**: in ARRIVAL mode `pickup_id` veniva mantenuto dopo "+ Add Leg" (keephub logic), quindi `form.pickup_id && form.dropoff_id` poteva essere `true` anche dopo il reset → auto-include indesiderato
- **Fix**: `handleAddLeg` ora resetta SEMPRE **entrambi** `pickup_id` e `dropoff_id` per tutti i mode (rimossa logica keephub ARRIVAL/DEPARTURE)
- `handleMultiSubmit` auto-include del form corrente **ripristinato**: scatta solo se l'utente ha esplicitamente compilato entrambi i campi (form sempre vuoto dopo "+ Add Leg" → bug impossibile)
- Contatore bottone ripristinato: `totalLegs = savedLegs.length + (form.pickup_id && form.dropoff_id ? 1 : 0)`

#### Bug 3 — EditTripSidebar: available pax non cambia cambiando tab Leg A/B/C
- `loadPaxData` usava `allDropoffIds`/`allPickupIds` di TUTTI i leg del gruppo → lista identica per ogni tab
- **Fix**: query usa `trip.dropoff_id`/`trip.pickup_id` del leg attivo (singolo `eq()` invece di `in()`)
- Aggiunto `loadPaxReqRef = useRef(0)` con `reqId !== loadPaxReqRef.current` check dopo `Promise.all` per evitare stale updates

#### Bug 4 — Crash: useRef non importato
- Aggiunto `useRef` agli import React (era mancante dopo l'introduzione di `loadPaxReqRef`)

#### Feature — Veicolo condiviso e bloccato in multi-trip
- In `handleAddLeg`: `sharedVehicle` calcolato dal primo leg (o dal leg appena salvato se è il primo)
- `vehicle_id` viene forzato a `sharedVehicle` nel form reset di ogni leg successivo
- Nel render, quando `multiMode && savedLegs.length > 0`: campo Vehicle sostituito da badge read-only `🚐 VAN01 🔒 shared`
- **Risultato**: tutti i leg del multi-trip condividono automaticamente lo stesso mezzo

---

## WHAT CHANGED IN SESSION S11

### Multi-trip creation in TripSidebar (commit 354eb33)
- **Nuovo "🔀 MULTI" toggle button** nell'header della `TripSidebar` (create new trip):
  - Attiva/disattiva la modalità multi-trip; al click resetta `savedLegs` e `editingLegLocalId`
  - In multi mode l'header mostra `🔀 Multi-trip` + badge verde con numero di legs salvati e range trip_id
- **3 tipologie** selezionabili con pill buttons: `🛬 ARR` (ARRIVAL), `🛫 DEP` (DEPARTURE), `🔀 STD` (STANDARD/MIXED)
  - Mostrano hint informativo sotto (quale campo viene mantenuto tra i leg)
- **Leg Builder UX** — step sequenziale:
  1. Compilare il form normalmente (pickup, dropoff, veicolo, orario, passeggeri)
  2. `+ Add Leg (T004B)` — salva il leg corrente in `savedLegs`, resetta il form per il leg successivo:
     - ARRIVAL: mantiene `pickup_id` (hub); reset `dropoff_id`
     - DEPARTURE: mantiene `dropoff_id` (hub); reset `pickup_id`
     - STANDARD: reset entrambi
  3. Legs salvati appaiono in lista verde con `✏️` (edit) e `🗑` (delete)
  4. `✏️ Aggiorna Leg` — ricarica un leg salvato nel form per modificarlo
  5. `💾 Salva Multi-trip (N legs)` — verde, abilitato solo con ≥ 2 legs totali
- **`handleMultiSubmit`**: crea tutti i trip in DB (T004 → T004B → T004C…), inserisce passeggeri per ogni leg, chiama `/api/routes/compute-chain` per calcolare pickup_min sequenziali
- **Nuovo stato multi-trip** in `TripSidebar`:
  - `multiMode`, `multiType`, `savedLegs`, `editingLegLocalId`, `multiSaving`
  - Tutti resettati al close della sidebar (`useEffect` on `open`)
- **Nuove funzioni**: `getLegTripId(idx)`, `handleAddLeg()`, `handleEditLeg(leg)`, `handleDeleteLeg(localId)`, `handleMultiSubmit()`
- Il form `handleSubmit` (single trip) rimane invariato — multi mode usa bottoni `type="button"` separati
- **File modificato**: `app/dashboard/trips/page.js` (+242/-9)

---

## WHAT CHANGED IN SESSION S10

### Drive Sync — accommodation multi-sheet path (commits 4353404 → 198eb64)
- `drive/sync`: aggiunta branch accommodation separata che:
  1. Chiama `/api/import/sheets` per ottenere la lista fogli
  2. Filtra fogli validi (esclude `COST REPORT` e fogli con `OLD`)
  3. Itera su ogni foglio, chiama `/api/import/parse` con `selectedSheet`
  4. Aggrega tutti i rows e tutti gli hotel (dedup per nome)
  5. Chiama `/api/import/confirm` **una sola volta** con tutto aggregato
- Fix: `String(h)` cast nell'headerMap per gestire header numerici
- Debug log dettagliati: `[drive/sync] ACCOMMODATION BRANCH ENTERED`, sheet count, per-sheet rows

### Import accommodation fixes (commits 2c6fe47 → f7a301f)
- `ImportModal.js`: `isUnrecognized()` ora ignora righe accommodation con `existingId` (non le marca come non riconosciute)
- `ImportModal.js`: per mode `accommodation`, la fase `categorizing` viene saltata → va diretto a `preview`
- Extraction fixes nel parser accommodation (headerMap robustness)

### DriveSyncWidget auto-reload + last_synced_at (commits b873949, d1511de)
- `DriveSyncWidget` si ricarica automaticamente dopo che un confirm import è completato con successo
- `last_synced_at` in `drive_synced_files` viene aggiornato anche dopo confirm dal preview Drive (non solo dal sync diretto)

### `/api/drive/preview` — multi-sheet (commit 153ebb0)
- Stesso path multi-sheet dell'accommodation aggiunto in `drive/preview`
- Per `accommodation` + Excel: itera su tutti i fogli validi, aggrega rows e `newData.hotels`, riassegna `_idx` sequenziali
- Risposta finale: `{ hasChanges, file_id, file_name, modifiedTime, rows, newData, detectedMode }`

### `/api/drive/download` + ImportModal `initialFile` (commit 4eabbf9)
- **Nuovo route**: `POST /api/drive/download { production_id, file_id }`
  - Scarica il file da Google Drive e lo restituisce come blob binario
  - Headers: `Content-Type`, `Content-Disposition`, `X-File-Name`
  - Supporta Google Workspace export (Sheets → xlsx, Docs → docx)
- `ImportModal.js`: nuova prop `initialFile` (oggetto `File`)
  - Se presente quando il modal si apre → resetta lo state e chiama `parseFile(initialFile)` immediatamente
  - Permette a `DriveSyncWidget` di scaricare il file lato server e aprire l'ImportModal direttamente nella fase `sheet-select`

### CrewInfoModal + Crew Lookup in TripSidebar e EditTripSidebar (commit 20f068e)
- **`CrewInfoModal`** — nuovo componente modale in `trips/page.js`:
  - Carica in parallelo: dati crew (telefono, email, hotel_id, checkin/checkout) + travel_movements
  - Mostra: contatti (tel + email cliccabili), hotel + date check-in/out, lista travel movements con direzione/tipo/numero/rotta
  - Props: `{ crew, productionId, locations, onClose }`
- **Crew Lookup** aggiunto in `TripSidebar` (create) e `EditTripSidebar` (edit):
  - Sezione `🔍 Crew Lookup` nella sidebar
  - Ricerca per `full_name` o `department` con ilike, min 2 caratteri, limit 8
  - Click su un risultato → apre `CrewInfoModal`
  - Stati: `crewLookupQ`, `crewLookupResults`, `crewInfoCrew`

---

## WHAT CHANGED IN SESSION S9

### New table: travel_movements
```sql
CREATE TABLE travel_movements (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  production_id uuid REFERENCES productions(id) ON DELETE CASCADE,
  crew_id TEXT REFERENCES crew(id) ON DELETE SET NULL,
  travel_date DATE,
  direction TEXT,              -- 'IN' | 'OUT'
  from_location TEXT,
  from_time TIME,
  to_location TEXT,
  to_time TIME,
  travel_number TEXT,
  travel_type TEXT,            -- 'FLIGHT' | 'TRAIN' | 'GROUND' | 'OA'
  pickup_dep TEXT,
  pickup_arr TEXT,
  needs_transport BOOLEAN DEFAULT false,
  hub_location_id TEXT,
  hotel_raw TEXT,
  hotel_id TEXT,
  rooming_date DATE,
  rooming_hotel_id TEXT,
  travel_date_conflict BOOLEAN DEFAULT false,
  hotel_conflict BOOLEAN DEFAULT false,
  discrepancy_resolved BOOLEAN DEFAULT false,
  discrepancy_note TEXT,
  full_name_raw TEXT,
  match_status TEXT,           -- 'matched' | 'unmatched' | 'ambiguous'
  created_at TIMESTAMPTZ DEFAULT now()
);
-- RLS: Authenticated users can manage travel_movements (USING true, WITH CHECK true)
```

### New import mode: Travel Calendar
- File: /app/api/import/parse/route.js
  - parseTravelCalendarDIG(buffer) — JS parser for DIG format Excel
  - processTravelRows(rawRows, supabase, productionId) — hub matching + name matching + cross-check
  - MODE: travel handler added
- File: /app/api/import/confirm/route.js
  - processTravelConfirm() — inserts into travel_movements, updates no_transport_needed on crew
- File: /lib/ImportModal.js
  - TravelTable component added
  - '✈️ Travel Calendar' mode selector added
  - initialPhase/initialRows/initialNewHotels/initialDetectedMode/initialSelMode props added

### New API: /api/drive/preview
- POST { production_id, file_id }
- Downloads and parses without confirming
- Returns { hasChanges, rows, newData, detectedMode }
- **S10 update**: added multi-sheet accommodation path

### Bridge updates (bridge/page.js)
- DriveSyncWidget — shows Drive files with pending updates; auto-reloads after confirm
- TravelDiscrepanciesWidget — shows rooming vs travel discrepancies with resolve button
- TomorrowPanel — now uses travel_movements (travel_date) instead of crew dates
- ArrivalsDeparturesChart — uses travel_movements, range selector 30/45/60/90 days, tooltip shows flights+trains breakdown
- navbar badge counts Drive files with last_modified > last_synced_at

### Crew page updates (crew/page.js)
- travelMap state — crewId → [travel_movements], loaded once for all crew
- CrewCard shows upcoming travel movements (icon ✈️/🚂/🚐, direction, number, from→to, time, 🚐 badge)
- dept filter uses raw department value without normalizeDept()
- toolbar split into 2 rows (title+actions row 1, filters row 2), sticky top:52px zIndex:29
- addNewRawName + addNewBanner state for flow from Travel Discrepancies
- handleSaved updates travel_movements when coming from addNew flow
- ⚠️ OPEN BUG: addNewBanner not showing — useSearchParams() causes Vercel build failure. Need alternative approach (sessionStorage or router state)

### Hub Coverage (hub-coverage/page.js)
- travelMap loaded from travel_movements for selected date
- CoveredRow and MissingRow show flight/train info with icon ✈️/🚂/🚐
- **DayStrip** added (commits 9fac6e4 → db8b567): week strip with ↓N/↑N badges from travel_movements (separate lightweight fetch)
  - Positioned **below** the toolbar (not above)
  - Two independent date states: `date` (toolbar, drives content) + `stripDate` (centers the strip)
  - `activeStripDate` state (null = inactive): click a day → activates (orange/amber), re-click → deactivates
  - When active: `effectiveDate = activeStripDate` drives `loadData`, amber banner shown, `+Assign` uses `effectiveDate`
  - Arrows (◀▶) in DayStrip only move the strip center (setStripDate ±7), do NOT affect content
  - ⚠️ **OPEN BUG (S9-fix1)**: The toggle activator does NOT work correctly — clicking a day in the DayStrip does not visibly change the content. Root cause unknown; `effectiveDate` derivation via `activeStripDate ?? date` is in place but `useEffect` dependency on derived value may not trigger reliably. Needs investigation.

### Vehicles page (vehicles/page.js)
- toolbar split into 2 rows (same pattern as crew)
- preferred_dept uses dynamic select from crew departments

### Date timezone fix
- All date calculations use toLocaleDateString('en-CA', {timeZone:'Europe/Rome'}) instead of toISOString()
- Prevents day-shift bug between midnight and 02:00 CEST

---

## ACTIVE PRODUCTION DATA

- Name: 360 Degrees Film
- Production ID: 0b4553e1-dd49-46af-aa9d-54ca5346796d
- Crew: ~211 people imported
- travel_movements: imported from DIG Travel Calendar Excel
- Hub locations: APT_BARI (Bari Airport), STN_BARI (Bari Centrale)

---

## OPEN BUGS TO FIX

1. **⚠️ DA VERIFICARE — TravelDiscrepanciesWidget badge "(2 stays)"**: quando un item mostra badge "(2 stays)", significa che la persona HA 2 stays in DB ma la `travel_date` non è coperta da nessuna (range non sovrapposto = conflitto reale). Verificare che le opzioni di risoluzione siano corrette e comprensibili. Considerare se mostrare le date delle stays nell'UI per aiutare il coordinatore a scegliere quale stay aggiornare.

2. **addNewBanner in crew page** — Banner does not appear when navigating from Bridge TravelDiscrepanciesWidget with ?addNew= URL param. useSearchParams() with Suspense causes Vercel build failure. Solution: use sessionStorage to pass the name instead of URL params.

3. **ArrivalsDeparturesChart** — Verify key={PRODUCTION_ID} fix is working correctly.

4. **DayStrip toggle activator** (hub-coverage) — Clicking a day in the DayStrip should activate it (set `activeStripDate`, show amber banner, reload content for that date). Visual changes (orange day button, amber banner) were implemented in commit db8b567 but user reports the feature does not work — content does not change when a strip day is clicked. Suspect: `useEffect([user, effectiveDate, loadData])` may not fire because derived value `activeStripDate ?? date` is not a state variable itself. Fix: move `effectiveDate` into `useMemo` or directly inline `activeStripDate ?? date` inside the `useEffect` callback.

5. ~~**EditTripSidebar — Add Leg: crew list vuota**~~ — ✅ RISOLTO in S14 (vedi sopra).

---

## FUNDAMENTAL RULES

```
❌ Never use useSearchParams() without Suspense — causes Vercel build failure
❌ Never use toISOString() for date calculations — use toLocaleDateString('en-CA', {timeZone:'Europe/Rome'})
❌ write_to_file on existing files → use replace_in_file surgical edits
❌ Never rewrite entire files for small changes
✅ Read existing code before modifying
✅ JavaScript only (no TypeScript), App Router
✅ Deploy after every completed task: git add . && git commit -m "..." && git push
✅ CMD shell: use && not ; between commands (this is cmd.exe, not PowerShell)
✅ Always explain approach in one line before proceeding
```
