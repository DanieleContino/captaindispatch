# CAPTAIN — Context

**Aggiornato: 31 marzo 2026 | S29 Remote Crew — T1 ✅ · T2 ✅ · T3 ✅ · T4 ✅ Deploy — S29 COMPLETATA**

> 🧠 Edit chirurgici per bug isolati, riscrittura completa per problemi sistemici.
> 🚀 Avvio: `npm run dev` | Shell: **CMD** (`&&` per concatenare, non PowerShell)
> ❌ `write_to_file` su file esistenti → usare sempre `replace_in_file`

---

## ▶ PROSSIMO — S18 i18n Completamento (TASK 4)

> **S29 COMPLETATA ✅** — Riprendere **S18 i18n da TASK 4 (`bridge/page.js`)**.
> Un task per sessione. Deploy unico dopo tutti i task S18.

---

### S29 — Remote Crew "Non in Set" (un task per sessione)
Un unico deploy finale dopo T4. NON deployare tra un task e l'altro.

| Task | File/Scope | Stato |
|------|-----------|-------|
| T1 — DB Migration + crew/page.js | `scripts/migrate-on-location.sql` + `crew/page.js` (toggle, card, sidebar, filtro, sort) | ✅ |
| T2 — Dashboard + Pax Coverage | `dashboard/page.js` (banner) + `pax-coverage/page.js` (sezione Remote) | ✅ |
| T3 — Rocket | `rocket/page.js` (pre-esclusione crew remote + badge + banner) | ✅ |
| T4 — Context Update + Deploy | `CAPTAINDISPATCH_Context.md` + `git push` | ✅ |

#### Campo DB
```sql
-- scripts/migrate-on-location.sql
ALTER TABLE crew ADD COLUMN IF NOT EXISTS on_location BOOLEAN DEFAULT TRUE;
UPDATE crew SET on_location = TRUE WHERE on_location IS NULL;
```
Aggiunge `on_location BOOLEAN DEFAULT TRUE` alla tabella `crew`. `false` = persona non in set oggi (lavora da casa/albergo). Persiste fino a cambio manuale.

#### S29-T1 — DB Migration + crew/page.js
- **Script SQL**: `scripts/migrate-on-location.sql` (sopra)
- **`RemoteToggle`** (nuovo componente): bottone `🏠` inline nella card, accanto a `NTNToggle`. Salva `on_location = false/true` su Supabase.
- **Card visiva** quando `on_location = false`: sfondo `#f8fafc`, bordo sinistro `#94a3b8`, nome dimmed `#94a3b8`, badge `🏠 Remote` grigio
- **Ordinamento** gruppi dept: `on_location === false` → in fondo al gruppo (sort prima dei presenti, poi dei remoti)
- **Filtro "REMOTE"** nella toolbar: pill `🏠 Remote` accanto al pill `🚐 NTN` esistente
- **URL param `?remote=1`**: se presente al mount → auto-imposta filtro REMOTE (per link dal dashboard banner)
- **Sidebar** `CrewSidebar`: switch `🏠 Non in Set — Remoto / Lavora da casa o albergo` subito DOPO il blocco NTN. Include `on_location` in EMPTY form, sync useEffect, row salvato.
- **Stats header**: badge `🏠 N Remote` accanto al badge `🚐 N NTN` se > 0
- **`counts.remote`**: `crew.filter(c => c.on_location === false).length`

#### S29-T2 — Dashboard + Pax Coverage
**`dashboard/page.js`:**
- Query aggiuntiva nel `useEffect`: `supabase.from('crew').select('id,full_name,department').eq('production_id', PRODUCTION_ID).eq('on_location', false).order('full_name').limit(20)`
- Banner amber (stile identico ai banner departures/arrivals esistenti):
  ```
  🏠 3 crew remoti oggi — non inclusi in Rocket e Coverage     [Crew List →]
  ```
  Link: `/dashboard/crew?remote=1`. Mostrato solo se `remoteCrew.length > 0`.

**`pax-coverage/page.js`:**
- Aggiungere `on_location` al select della query crew
- Split: `remoteCrew = crew.filter(c => c.on_location === false)` (separato da regularCrew e ntnCrew)
- Nuova sezione **"🏠 Remote Today"** (dopo NTN section): stile `NTNRow` ma bordo amber `#d97706`, badge `🏠 Remote` amber
- `remoteCrew` NON conta nelle statistiche di copertura (non abbassa il %)
- `remoteFiltered` rispetta filtri dept/hotel/search ma non il filtro `showOnly` (sempre visibile in fondo)

#### S29-T3 — Rocket
**`rocket/page.js`:**
- Aggiungere `on_location` al `select` della query crew (NON al filtro DB — i remoti devono essere visibili)
- Dopo `loadData()`: i crew con `on_location === false` vengono aggiunti a `excludedCrewIds` (set iniziale) → pre-esclusi automaticamente
- **Badge `🏠`** nella lista crew di Step 1 accanto al nome (grigio, dim) per i crew remoti
- **Banner avviso** in Step 1 (sopra la lista crew), se ci sono crew remoti: `🏠 N crew marcati come Remoti — pre-esclusi. Puoi includerli manualmente.`

#### Schema DB aggiornato (dopo S29-T1)
```sql
crew (id TEXT PK, full_name, role TEXT, department, hotel_id, travel_status, hotel_status,
      arrival_date, departure_date, email TEXT, phone TEXT,
      no_transport_needed bool DEFAULT false,
      on_location BOOLEAN DEFAULT TRUE)  -- S29-T1: false = remoto/non in set ✅
```

---

### S28 — Vehicle Enhancement (DA FARE — un task per sessione)
Un unico deploy finale dopo T5. NON deployare tra un task e l'altro.

| Task | File/Scope | Stato |
|------|-----------|-------|
| T1 — DB Migration + Tipi/Classi/Switch | `scripts/migrate-vehicles-v2.sql` + `vehicles/page.js` (tipi, classi, in_transport) | ✅ |
| T2 — Preferred Dept + Crew Multi-Select | `vehicles/page.js` (sezione preferred con search) | ✅ |
| T3 — Fleet + Lists Filter | `fleet/page.js` + `lists/page.js` | ✅ |
| T4 — Trips: Badge + Auto-Suggest Crew | `trips/page.js` | ✅ |
| T5 — Context Update + Deploy | `CAPTAINDISPATCH_Context.md` + `git push` | ✅ |

#### S28-T1 — DB Migration + Tipi/Classi/Switch
**Migration SQL** (`scripts/migrate-vehicles-v2.sql`):
```sql
ALTER TABLE vehicles ALTER COLUMN vehicle_class TYPE TEXT[]
  USING CASE WHEN vehicle_class IS NULL THEN NULL ELSE ARRAY[vehicle_class] END;
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS preferred_dept TEXT;
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS preferred_crew_ids TEXT[];
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS in_transport BOOLEAN DEFAULT TRUE;
```
**vehicles/page.js:**
- Tipi: VAN 🚐 · CAR 🚗 · BUS 🚌 · **TRUCK 🚛** (Pasino) · **PICKUP 🛻** (nuovi)
- Classi multi-chip (TEXT[]): CLASSIC · LUX · ECONOMY · PREMIUM · MINIBUS · **NCC** — selezione multipla, toggle chip
- Switch `in_transport` (sotto Active): ON=verde "✅ In Transport" / OFF=grigio "🚐 SD — escluso da trips/liste/fleet"
- VehicleRow: badge 🚐 SD se `in_transport=false`

#### S28-T2 — Preferred Dept + Crew Multi-Select
**vehicles/page.js (sidebar):**
- `preferred_dept` select: GRIP · CAMERA · ELECTRIC · ART · COSTUME · MAKEUP · SOUND · DIRECTING · PRODUCTION · TRANSPORT · CATERING · SECURITY
- `preferred_crew_ids TEXT[]`: multi-select con ricerca testuale, SD crew in cima (no_transport_needed=true) evidenziati 🚐, chip selezionati rimovibili
- Sidebar carica crew da Supabase all'apertura (solo production corrente)
- VehicleRow: badge dept colorato + nomi crew preferiti compatti

#### S28-T3 — Fleet + Lists Filter
- `fleet/page.js`: query vehicles aggiunge `.eq('in_transport', true)`
- `lists/page.js`: query vehicles aggiunge `.eq('in_transport', true)`

#### S28-T4 — Trips: Badge + Auto-Suggest Crew (🟡 parziale)
**Fatto:**
- `trips/page.js` query vehicles: `.eq('in_transport', true)` + `preferred_dept`,`preferred_crew_ids` nel select
- Dropdown veicolo TripSidebar + EditTripSidebar: badge `⭐ DEPT · Xp` via `hasPref`
- `suggestedCrew` in TripSidebar + `suggestedCrewEdit` in EditTripSidebar: filtra `crewList`/`availableCrew` per `preferred_crew_ids` (crew_id match) o `preferred_dept` (department match)

**Da fare (prossima sessione):**
- Aggiungere sezione "📌 Suggeriti" UI nel picker pax di entrambe le sidebar
- TripSidebar: inserire PRIMA dell'`<input type="text" placeholder="Search…">` (near `form.pickup_id && form.dropoff_id ? (`)
- EditTripSidebar: inserire PRIMA del commento `{/* AVAILABLE + BUSY */}` (`{regularCrew.length > 0 ? ...`)
- Sezione stile: `background: '#fffbeb'`, `border: '1px solid #fde68a'`, `borderRadius: '8px'`, titolo "📌 Suggeriti per {selVehicle.id}", lista compatta con quick-add `+` button, nascondere se `suggestedCrew.length === 0`

#### UI Laptop Guidelines (applicare ovunque in S28)
```
font-size body:      11px
font-size titoli:    13px max
badge padding:       2px 6px
emoji sidebar:       16-18px
gap tra elementi:    6px
chip classi:         padding 3px 8px, font 11px
```

---

### S18 — i18n Completamento (IN SOSPESO — riprendere dopo S29)
Un unico deploy finale dopo tutti i task. NON deployare tra un task e l'altro.

| Task | File | Stato |
|------|------|-------|
| TASK 1 — Chiavi i18n lib/i18n.js | `lib/i18n.js` | ✅ |
| TASK 2 — fleet/page.js | `fleet/page.js` | ✅ |
| TASK 3 | `reports/page.js` | ✅ |
| TASK 4 | `bridge/page.js` | ⬜ |
| TASK 5 | `qr-codes/page.js` | ⬜ |
| TASK 6 | `lists/page.js` | ⬜ |
| TASK 7 | `settings/production/page.js` | ⬜ |
| TASK 8 | `lib/ImportModal.js` | ⬜ |
| TASK 9 | `pending/page.js` | ⬜ |
| TASK 10 | `scan/page.js` | ⬜ |

**Pattern comune tutti i task:** `import { useT } from '[path]/lib/i18n'` + `const t = useT()` in ogni componente principale. NON tradurre: valori logici (`'BUSY'`,`'ARRIVAL'`,`'STANDARD'` ecc.), ID interni, costanti.

### TASK 4 — bridge/page.js
- `const t = useT()` in `BridgePage`, `PendingUsersTab`, `InviteCodesTabControlled`, `AddToProductionModal`
- Tutti i testi → chiavi `bridge*` (vedi `lib/i18n.js` blocco S18 pages)
- `confirm("Delete this invite code?")` → `confirm(t.bridgeDeleteConfirm)`

### TASK 5 — qr-codes/page.js
- `const t = useT()` in `QrCodesPage`
- Tutti i testi → chiavi `qr*` (vedi `lib/i18n.js`)

### TASK 6 — lists/page.js
- `const t = useT()` in `ListsPage`
- Toolbar + colonne + section headers + footer → chiavi `lists*`
- ⚠️ NON tradurre il contenuto dinamico `TransportListHeader` (dati dal DB)

### TASK 7 — settings/production/page.js
- `import { useT } from '../../../../lib/i18n'` (path con 4 livelli) + `const t = useT()`
- Label e bottoni → `t.settings*` | Campi form → riusa chiavi `t.productions*` da S17

### TASK 8 — lib/ImportModal.js
- `import { useT } from '../lib/i18n'` (da lib/) + `const t = useT()` in `ImportModal`
- Header, mode selector, drag&drop, stati loading, banner stats, bottoni → chiavi `import*`

### TASK 9 — pending/page.js
- Fix residui: invite section → `t.pendingInviteLabel`, `t.pendingEnterBtn`, `t.pendingInvitePlaceholder`, `t.pendingJoinedMsg`, `t.pendingRedirectingMsg`

### TASK 10 — scan/page.js
- Fix residui in `CrewCard` e `VehicleCard`: `"Hotel"→t.scanHotelLabel`, `"Hotel Status"→t.scanHotelStatus`, `"👤 Driver"→t.scanDriverLabel`, `"Search…"→t.scanSearchPlaceholder`

---

## Stack

```
Next.js (App Router, JavaScript) | Supabase (PostgreSQL + Auth + Realtime) | Vercel
Deploy: git push origin master → auto ~1-2 min
GitHub: DanieleContino/captaindispatch (branch: master)
Supabase Project ID: lvxtvgxyancpegvfcnsk (West EU)
```

**Env vars:** `GMAIL_USER`, `GMAIL_APP_PASSWORD`, `ADMIN_EMAIL`, `GOOGLE_MAPS_API_KEY`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_EMAIL`, `ANTHROPIC_API_KEY`

---

## Pagine & API Completate ✅

**Pagine:** `/login` | `/dashboard` | `/dashboard/fleet` | `/dashboard/trips` | `/dashboard/crew` | `/dashboard/vehicles` | `/dashboard/locations` | `/dashboard/rocket` | `/dashboard/lists` | `/dashboard/pax-coverage` | `/dashboard/hub-coverage` | `/dashboard/productions` | `/dashboard/reports` | `/dashboard/qr-codes` | `/dashboard/settings/production` | `/wrap-trip` | `/pending` | `/scan` | `/dashboard/bridge`

**API:** auth `callback/check-approval` | cron `arrival-status/refresh-routes-traffic/daily-briefing` | places `autocomplete/details/map` | bridge `pending-users/approve-user/invites` | invites `redeem` | productions `CRUD/upload-logo` | qr `resolve` | routes `refresh-traffic/traffic-check/refresh-location` | rocket `templates/suggestions` | push `subscribe/unsubscribe/send` | import `parse/confirm`

---

## Logiche Core

**Transfer_Class:** `pickup HUB→ARRIVAL | dropoff HUB→DEPARTURE | nessun HUB→STANDARD`

**Calcolo Tempi Trip:**
| Tipo | Call | Pickup |
|------|------|--------|
| ARRIVAL | = Arr_Time | = Call |
| DEPARTURE | = Arr_Time - 120min | = Call - Duration |
| STANDARD | manuale | = Call - Duration |
| ROCKET | = effectiveCallMin | = Call - Duration |

**Travel_Status Crew:** `IN` (ARRIVAL) | `OUT` (DEPARTURE) | `PRESENT` (default). ARRIVAL completato → IN → PRESENT (trigger 5min). Manuale vince sempre.

**Login Approval:** `auth/callback` → verifica `user_roles` → `/dashboard` o `/pending` (polling 3sec)

**Pattern Assign Coverage→Trips:** URL params `?assignCrewId=&assignCrewName=&assignHotelId=&assignTS=&assignDate=`
Banner amber in trips, badge ⭐ MATCH, `suggestedBaseIds` filtra hotel+ts

**Multi-Production:** `lib/production.js` — `getProductionId()` / `switchProduction(id)` via localStorage

**Rocket v2:** crew PRESENT+CONFIRMED+!NTN, veicoli attivi, raggruppa per (hotel_id, effectiveDest, effectiveCallMin) → greedy fino a pax_suggested. Trip ID: `R_MMDD_NN`. Multi-stop routing sequenziale A→B→Hub. Templates localStorage + Supabase `rocket_templates`. Suggerimenti statistici dopo 10-15 run. Service type per singola destinazione. Crew con `on_location=false` pre-esclusi automaticamente.

**NTN/Self Drive:** `crew.no_transport_needed = true` → esclusi da Rocket + coperture, badge `🚐 SD`, sezione separata in Pax Coverage, aggiungibili come SD nei Trips.

**Remote Crew (on_location):** `crew.on_location = false` → non in set (lavora da casa/albergo). Rocket: pre-esclusi automaticamente al caricamento (badge 🏠, banner avviso, riattivabili manualmente). Pax Coverage: sezione "🏠 Remote Today" separata, non contano nelle stats %. Dashboard: banner amber con link `/dashboard/crew?remote=1`. Crew page: card dimmed+bordo grigio+badge, filtro pill 🏠 Remote, URL `?remote=1`, sort in fondo al gruppo.

**Captain Bridge:** ruolo `CAPTAIN`/`ADMIN`. Tab Pending (Sandbox/Add to prod/Ignore) + Tab Invites (8-char, role, max_uses, expires_at).
> ⚠️ Query `production_invites`: join manuale (non PostgREST) per evitare errore schema cache.

**Push PWA:** `web-push` + SW + VAPID. Hook `useNotifications()`. Cron `daily-briefing` 07:00 UTC. `lib/webpush.js` usa `ensureVapidInit()` lazy. `next.config.ts` → `serverExternalPackages: ['web-push','nodemailer','pdf-parse','mammoth','xlsx']`

**Import Intelligente:** Claude `claude-sonnet-4-20250514`. Mode: HAL (auto-detect) | crew | fleet | custom. Flusso: `parse` (multipart) → `categorizing` (4 sezioni) → `preview` → `confirm`. Row shape crew: `first_name, last_name, role, department, phone, email, active, hotel_id, arrival_date, departure_date`. Row shape fleet: `driver_name, vehicle_type, plate, sign_code, capacity, pax_suggested, pax_max`. ⚠️ `plate`→`license_plate` nel confirm. ⚠️ Tabelle `vehicles/locations/crew` usano TEXT PK senza auto-increment → ID generato lato server.

**normalizeDept:** `lib/normalizeDept.js` — 150+ alias EN+IT, `normalizeDept()` usata in `parse/route.js` e `crew/page.js`. EXCEPTION: ruolo `"Director"` standalone → sempre `DIRECTING`.

**i18n:** `lib/i18n.js` — `useT()` + `LanguageProvider`. `app/providers.jsx` + `app/layout.tsx`. `lib/navbar.js` — toggle 🇬🇧/🇮🇹. ❌ NO stringhe hardcoded. `useSearchParams()` → wrappare in `<Suspense fallback={null}>`.

**UI Components** (`components/ui/`): `PageHeader` (sticky `top:52px z-20`, props `left/right`), `FilterBar`+`FilterPill`+`FilterInput`, `TableHeader` (genera `gridTemplateColumns`), `DataTable`.

**Crew:** campo `role TEXT` (titolo es. "Director of Photography"). Campi `email TEXT`, `phone TEXT`. `ContactPopover` su card (view+edit, click-outside). Select multipla + delete inline + bulk delete (pattern identico Vehicles).

---

## Database Schema

```sql
productions (id, name, slug, logo_url, director, producer,
  production_manager, production_manager_phone, production_coordinator, production_coordinator_phone,
  transportation_coordinator, transportation_coordinator_phone, transportation_captain, transportation_captain_phone,
  production_office_phone, set_location, set_address, basecamp, general_call_time, shoot_day, revision)
user_roles
locations (id TEXT PK, name, is_hub bool, is_hotel bool, lat, lng, default_pickup_point)
routes (duration_min, google_duration_min, traffic_updated_at)
crew (id TEXT PK, full_name, role TEXT, department, hotel_id, travel_status, hotel_status,
      arrival_date, departure_date, email TEXT, phone TEXT, no_transport_needed bool DEFAULT false,
      on_location BOOLEAN DEFAULT TRUE)  -- S29: false = remoto/non in set
vehicles (id TEXT PK, capacity, pax_suggested, pax_max, driver_name, sign_code,
          active, available_from, available_to, vehicle_type TEXT, license_plate,
          vehicle_class TEXT[],         -- S28: multi-class (CLASSIC/LUX/ECONOMY/PREMIUM/MINIBUS/NCC)
          preferred_dept TEXT,          -- S28: dept preferito (GRIP/CAMERA/ecc.)
          preferred_crew_ids TEXT[],    -- S28: array di crew.id preferiti
          in_transport BOOLEAN DEFAULT TRUE) -- S28: false = veicolo SD, escluso da trips/liste/fleet
trips (pickup_id, dropoff_id, call_min, pickup_min, start_dt, end_dt, service_type, status, terminal)
trip_passengers
service_types
production_invites (code, label, role, max_uses, uses_count, expires_at, active, created_by, production_id)
rocket_templates (id, production_id, name, config_json, created_by, created_at)
push_subscriptions (user_id, production_id, endpoint, p256dh, auth) UNIQUE(user_id, endpoint)
-- RLS abilitato su tutte le tabelle
```

**Migrations da eseguire in Supabase SQL Editor se non ancora fatto:**
- `scripts/migrate-crew-role.sql` — `ALTER TABLE crew ADD COLUMN IF NOT EXISTS role TEXT`
- `scripts/migrate-crew-contacts.sql` — aggiunge `email TEXT`, `phone TEXT`
- `scripts/migrate-ntn.sql` — aggiunge `no_transport_needed BOOLEAN DEFAULT FALSE`
- `scripts/migrate-dept-uppercase.sql` — bonifica dept storici (opzionale)
- `scripts/fix-productions-rls-duplicate.sql` — ✅ fix policy RLS productions (drop `productions_own`+`productions_insert` → `productions_select/update/delete`)
- `scripts/fix-functions-search-path.sql` — ✅ fix `SET search_path = public` su 3 funzioni
- `scripts/fix-trips-rls-delete.sql` — ✅ fix BUG-2: drop `"own_production"` FOR ALL su `trips`, ricrea policy esplicite trips_select/insert/update/delete
- `scripts/migrate-vehicles-v2.sql` — ✅ **S28**: vehicle_class TEXT[], preferred_dept, preferred_crew_ids TEXT[], in_transport BOOLEAN
- `scripts/migrate-on-location.sql` — ✅ **S29-T1**: on_location BOOLEAN DEFAULT TRUE (false = remoto/non in set)

**RLS productions (stato attuale dopo fix):**
- `productions_select` FOR SELECT USING user_production_ids()
- `productions_update` FOR UPDATE USING user_production_ids()
- `productions_delete` FOR DELETE USING user_production_ids()
- ⚠️ Nessuna policy INSERT per `authenticated` — tutti gli INSERT passano da service client (API server)

---

## Bug Aperti

| Bug | Stato | Note |
|-----|-------|------|
| BUG-2: Sibling non eliminato a rimozione ultimo pax | ✅ Fix | RLS `FOR ALL` su `trips` non propagava DELETE lato client (0 rows, no error). **Fix codice**: `removePax()` ora chiama `POST /api/trips/delete-sibling` (service client, bypassa RLS). **Fix DB opzionale**: `fix-trips-rls-delete.sql` (policy esplicite). |
| BUG-4: Trip non diventa MULTI-PKP/MULTI-DRP | 🟡 PARZIALE | **Fix applicato**: (1) Guard su `assignCtx.hotel` vuoto nell'else-sibling di `handleAddToExisting` → ora mostra errore chiaro invece di fallire silenziosamente. (2) `console.log('[handleAddToExisting]')` aggiunto per debug runtime con `{assignCtx, allGroupLegs, compatibleLeg, sibDropoff}`. (3) UI MIXED: selettore "🎯 Destination for [name]" per trip STANDARD con hotel diverso (bordo rosso se vuoto, badge viola `🔀 MIXED: HotelB → Loc2` se destinazione diversa, bottone disabled con `Select destination first ↑`). Testare in locale con browser console aperta. |

---

## TODO

- [ ] Rocket → export PDF piano generato
- [ ] Dark mode

---

## Sessioni Completate (storia compatta)

| Sessione | Descrizione | Commit |
|----------|-------------|--------|
| S9 | Captain Bridge (pending users + invite codes) | — |
| S11 | Push PWA — web-push, SW, cron daily-briefing | — |
| S12 | Import Intelligente — Claude HAL+crew+fleet, parse/confirm API, ImportModal | — |
| S13 | Vehicles delete inline + bulk select | — |
| S14 | UI Components (PageHeader, FilterBar, TableHeader, DataTable) | — |
| S15 | NTN/Self Drive — crew.no_transport_needed, Rocket/Trips/PaxCoverage/Crew | — |
| S16 | i18n sidebar labels crew/vehicles/locations | `cb77bd4` |
| S17 | i18n Productions ✅ + Rocket R1-R12 ✅ (chiavi in lib/i18n.js) | — |
| S18 | i18n completamento — TASK 1 chiavi ✅, TASK 2 fleet ✅, TASK 3-10 ⬜ | — |
| S19 | Crew role field (`role TEXT`) | `719ed19` |
| S20 | Crew contact info (email, phone, ContactPopover) | — |
| S21 | Import: HAL mode + Smart Categorization 4 sezioni | `46d94ce`+`1b0915b` |
| S22 | Fix import dept duplicato + DIRECTORS→DIRECTING (inline) | `5bfa0a0` |
| S23 | Crew select multipla + delete inline + bulk delete | `603ad61` |
| S24 | normalizeDept shared lib (lib/normalizeDept.js) + DEPT_MAP 150+ alias EN+IT | `9de1527` |
| **S24b** | **Fix RLS productions INSERT (chicken-and-egg) — POST usa service client** | `3cf2935` |
| **S25** | **Fix multi-production: `getProductionId()` dentro ogni componente (11 pagine)** | `63b1601` |
| **S26** | **Export/Archive Produzione — `GET /api/productions/export` + pulsante 📥 in productions/page** | — |
| **S27** | **Delete Production — `DELETE /api/productions` (CAPTAIN/ADMIN, CASCADE) + modal confirm con archive check + input nome** | — |
| **Logo fix** | **Upload logo via `/api/productions/upload-logo` (service client, bypassa RLS Storage). `productions/page.js` aggiornato + feedback visivo errori upload** | `abd737b` |
| **Logo lists fix** | **Fix: logo non compariva in `TransportListHeader` (lists/page). Aggiunto `<img>` con flex layout affianco al nome produzione** | `0b70d5e` |
| **Security fix** | **Fix Supabase security warnings: RLS productions (drop `productions_own`+`productions_insert` → policy granulari select/update/delete) + `SET search_path = public` su 3 funzioni. Scripts: `fix-productions-rls-duplicate.sql`, `fix-functions-search-path.sql`** | — |
| **BUG-2 fix** | **Fix sibling trip non eliminato: `removePax()` ora usa `POST /api/trips/delete-sibling` (service client, bypassa RLS). Creata `app/api/trips/delete-sibling/route.js`. DB fix opzionale: `fix-trips-rls-delete.sql`** | — |
| **BUG-3 fix** | **Fix dropdown "Add to existing trip" mostrava sibling (T001B/T001C) come voci separate. Ora dedup per `baseTripId`: una sola entry per gruppo. `isCompatibleGroup` controlla tutti i leg. `handleAddToExisting` trova il leg compatibile esistente prima di creare nuovi sibling.** | — |
| **UX trips** | **Edit Trip sidebar: (1) hotel badge `🏨` su ogni passeggero ASSIGNED (single trip); (2) MULTI trip: sezione ASSIGNED raggruppa pax per leg con sub-header `[TripID] · 🏨 Hotel · 🕐 pickup`. Query `loadPaxData` ora include `hotel_id` dal crew.** | `ce03a13` |
| **MULTI chain fix** | **Fix discrepanza PICKUP sidebar vs lista nei trip MULTI (es. 06:20 vs 06:10). Root cause: sidebar mostrava `call - duration_questo_leg` (naïve), ma DB aveva valore chain-computed da `compute-chain` (hotel più lontano parte prima). Fix: (1) box `PICKUP ⚡` e `START ⚡` in `EditTripSidebar` ora leggono `initial.pickup_min`/`initial.start_dt` dal DB per trip MULTI (sfondo giallo = chain-managed); (2) `handleSubmit` non scrive più `pickup_min`/`start_dt`/`end_dt` per i trip MULTI sul leg principale né sui sibling — `compute-chain` li ricalcola sempre come passaggio finale.** | `c09f617` |
| **sibDropoff fix** | **Fix internal state in `TripSidebar`: aggiunto `sibDropoff`/`setSibDropoff` useState. `sibDropoffId` e `siblingRow.dropoff_id` ora usano `(sibDropoff \|\| selExistingTrip.dropoff_id)` per DEPARTURE multi-PKP. `onChange` del select inizializza `sibDropoff` al `dropoff_id` del trip selezionato. Fix solo logica interna, nessun cambio UI visibile. BUG-4 ancora aperto (il sibling non viene creato).** | `6ad0bb8` |
| **MIXED + BUG-4 fix** | **`trips/page.js`: (1) Guard `!assignCtx.hotel` nell'else-sibling branch → errore esplicito. (2) `console.log('[handleAddToExisting]'` con contesto completo per debug. (3) Selector UI `🎯 Destination for [name]` per STANDARD + hotel diverso → permette di creare sibling con dropoff diverso (MIXED). Bottone disabilitato se destinazione non scelta. Badge `🔀 MIXED` quando dropoff è diverso dal trip principale. `compute-chain` riconosce MIXED quando `uniquePickups.size>1 && uniqueDropoffs.size>1`.** | — |
| **S28-T1** | **Vehicle Enhancement T1: `scripts/migrate-vehicles-v2.sql` (vehicle_class TEXT[], preferred_dept, preferred_crew_ids, in_transport). `vehicles/page.js`: tipi TRUCK 🚛+PICKUP 🛻, classi multi-chip TEXT[]+NCC 🔑, switch in_transport (blu), badge 🚐 SD in VehicleRow. ⚠️ Migration SQL da eseguire in Supabase.** | — |
| **S28-T2** | **Vehicle Enhancement T2: `vehicles/page.js` — sezione "⭐ Preferenze Assegnazione" in sidebar: `preferred_dept` select (12 dept, DEPT_COLOR) + `preferred_crew_ids` multi-select con ricerca (SD 🚐 in cima, chips rimovibili). VehicleRow: badge dept colorato + nomi crew compatti (max 3+overflow). `load()` usa `Promise.all` vehicles+crew. Sidebar carica crew all'apertura.** | — |
| **S28-T3** | **Vehicle Enhancement T3: `fleet/page.js` + `lists/page.js` — `.eq('in_transport', true)` sulla query vehicles.** | — |
| **S28-T4 ✅** | **Vehicle Enhancement T4 (completo): `trips/page.js` — query vehicles `.eq('in_transport', true)` + campi preferred. Badge `⭐` nel dropdown veicolo (TripSidebar + EditTripSidebar). Variabili `suggestedCrew`/`suggestedCrewEdit` calcolate. Sezione UI "📌 Suggeriti per {veicolo}" aggiunta nel picker pax di entrambe le sidebar (sfondo `#fffbeb`, bordo `#fde68a`, quick-add `+`, nascosta se lista vuota).** | — |
| **S28-T5 ✅** | **Vehicle Enhancement T5: Aggiornamento `CAPTAINDISPATCH_Context.md` (S28 completato, prossimo S18 T4) + `git push origin master` deploy.** | — |
| **S29-T1 ✅** | **Remote Crew T1: `scripts/migrate-on-location.sql` (on_location BOOLEAN). `crew/page.js`: RemoteToggle inline 🏠, card visiva dimmed+bordo grigio+badge Remote, filtro pill 🏠 Remote, URL param ?remote=1, sort remoti in fondo ai gruppi, counts.remote, badge stats, sidebar switch "Non in Set".** | — |
| **S29-T2 ✅** | **Remote Crew T2: `dashboard/page.js` — banner amber 🏠 N crew remoti con link `/dashboard/crew?remote=1`. `pax-coverage/page.js` — `on_location` nel select, split `remoteCrew`, sezione "🏠 Remote Today" (bordo amber, badge), remoti esclusi dalle stats copertura, `remoteFiltered` rispetta filtri dept/hotel/search.** | — |
| **S29-T3 ✅** | **Remote Crew T3: `rocket/page.js` — `on_location` nel select query, pre-esclusione automatica in `loadData()` (`excludedCrewIds`), `remoteEligibleCount`, badge 🏠 inline nella riga crew accordion, banner "N crew marcati come Remoti — pre-esclusi. Puoi includerli manualmente."** | — |
| **S29-T4 ✅** | **Remote Crew T4: Aggiornamento `CAPTAINDISPATCH_Context.md` (S29 completata, prossimo S18 T4) + `git push origin master` deploy.** | — |

---

## Regole Fondamentali

```
❌ write_to_file su file esistenti → replace_in_file chirurgico
❌ Hardcodare stringhe UI → usare sempre useT()
❌ Riscrivere interi file per aggiustamenti
❌ Modificare rotte Source=MANUAL negli script
❌ Sovrascrivere Travel_Status manuale con automazioni
✅ Leggere codice esistente prima di modificarlo
✅ JavaScript (non TypeScript), App Router
✅ Testare su localhost prima del deploy
✅ Deploy dopo OGNI sessione completata (non tra un task e l'altro in S18)
```
