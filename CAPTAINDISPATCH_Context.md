# CAPTAINDISPATCH — Context S34 (Cline)
## Updated: 6 April 2026

---

## NEXT SESSION: S34 — Decoupling `travel_status` dalla selezione pax

### Obiettivo
Separare `travel_status` (badge visivo) dalla logica di selezione dei passeggeri nei trip.
Il filtro pax deve usare `arrival_date`/`departure_date` invece di `travel_status`.
**Motivazione**: pianificazione trip in anticipo senza blocchi, robustezza multi-stay.

### Principio
> `travel_status` rimane come badge visivo su scan/bridge/crew/hub-coverage.
> NON viene più usato come gate funzionale per filtrare i pax nei trip.

### Le 5 task (una per sessione/commit, max 1 file ciascuna)

#### S34-A · `TripSidebar` CREATE — filtro pax date-based
- **File**: `app/dashboard/trips/page.js`
- **Scope**: `useEffect` "Available crew" (~righe 559-563)
- **Da**: `eq('travel_status','IN')` / `eq('travel_status','OUT')` / `eq('travel_status','PRESENT')`
- **A**:
  - ARRIVAL: `.eq('hotel_id', form.dropoff_id).eq('arrival_date', form.date)`
  - DEPARTURE: `.eq('hotel_id', form.pickup_id).eq('departure_date', form.date)`
  - STANDARD: `.eq('hotel_id', form.pickup_id).lte('arrival_date', form.date).gte('departure_date', form.date)` + `.or('on_location.eq.true')` come fallback per crew permanente
- Mantenere `hotel_status=CONFIRMED`

#### S34-B · `EditTripSidebar` `loadPaxData` — allineare fallback
- **File**: `app/dashboard/trips/page.js`
- **Scope**: funzione `loadPaxData` nella `EditTripSidebar` (branch non-`crew_stays`)
- **Cambiamento**: rimuovere `travel_status` dal ramo fallback, allineare alla logica date-based come S34-A

#### S34-C · `hub-coverage/page.js` — query crew by date
- **File**: `app/dashboard/hub-coverage/page.js`
- **Scope**: query crew che carica "Expected at hub" (attualmente usa `travel_status IN/OUT`)
- **Da**: `.eq('travel_status','IN')` / `.eq('travel_status','OUT')`
- **A**: `.eq('arrival_date', date)` / `.eq('departure_date', date)`

#### S34-D · `rocket/page.js` — eligibility filter
- **File**: `app/dashboard/rocket/page.js`
- **Scope**: filtro `travel_status === 'PRESENT'` per navetta shuttle
- **A**: `on_location === true` oppure `arrival_date <= today AND departure_date >= today` come criterio principale

#### S34-E · Tooltip debug sidebar — aggiornare testo
- **File**: `app/dashboard/trips/page.js`
- **Scope**: 3 stringhe testo nel debug panel pax: `"status=IN"`, `"status=OUT"`, `"status=PRESENT"`
- **A**: `"arrival_date=date"`, `"departure_date=date"`, `"arrival<=date<=departure"`

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
