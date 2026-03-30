# CAPTAIN — Context

**Aggiornato: 30 marzo 2026 | S21 TASK2 — Smart Categorization pre-preview ✅ | Fix pdf-parse DOMMatrix ✅**

> 🧠 **Approccio:** Edit chirurgici per bug isolati, riscrittura completa per problemi sistemici. Spiega scelta in una riga.
> 🚀 **All'avvio: `npm run dev`**

---

## Stack

```
Next.js (App Router, JavaScript) | Supabase (PostgreSQL + Auth + Realtime) | Vercel
Deploy: git push origin master → auto ~1-2 min
GitHub: DanieleContino/captaindispatch (branch: master)
Supabase Project ID: lvxtvgxyancpegvfcnsk (West EU)
```

**Env vars:** `GMAIL_USER`, `GMAIL_APP_PASSWORD`, `ADMIN_EMAIL`, `GOOGLE_MAPS_API_KEY`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_EMAIL`, `ANTHROPIC_API_KEY`

> ⚠️ Deploy dopo OGNI modifica. Shell: **CMD** (`&&` per concatenare, non PowerShell).

---

## Pagine Completate ✅

| Pagina | Note |
|--------|------|
| `/login` | OAuth Google |
| `/dashboard` | Card + alert arrivi/partenze domani + Navbar toggle lingua |
| `/dashboard/fleet` | Fleet Monitor realtime |
| `/dashboard/trips` | Multi-stop indicators, Assign integration, i18n |
| `/dashboard/crew` | Anagrafica + Travel_Status, i18n |
| `/dashboard/vehicles` | Fleet pax_suggested/max — Delete inline + Checkbox + Bulk Delete ✅ |
| `/dashboard/locations` | Google Places Autocomplete + Map Picker |
| `/dashboard/rocket` | Rocket Trip Generator v2 — TASK 1-7 ✅ |
| `/dashboard/lists` | Transport Lists print-optimized A4 landscape |
| `/dashboard/pax-coverage` | Pax Coverage + Assign integration, i18n |
| `/dashboard/hub-coverage` | Hub Coverage + Assign integration, i18n |
| `/dashboard/productions` | Multi-production CRUD + logo upload + activate ✅ |
| `/dashboard/reports` | Fleet Reports Daily/Weekly — ore, pax, stampa PDF ✅ |
| `/dashboard/qr-codes` | QR veicoli/crew, print-ready ✅ |
| `/dashboard/settings/production` | Edit header transport list + logo ✅ |
| `/wrap-trip` | App mobile 4-step |
| `/pending` | Approvazione login polling + invite code ✅ |
| `/scan` | Scanner QR |
| `/dashboard/bridge` | Captain Bridge — Pending Users + Invite Codes (CAPTAIN/ADMIN) ✅ |

**API completate:**
- Auth: `callback`, `check-approval`
- Cron: `arrival-status`, `refresh-routes-traffic`, `daily-briefing`
- Places: `autocomplete`, `details`, `map`
- Bridge: `pending-users` (GET), `approve-user` (POST), `invites` (GET/POST/PATCH/DELETE)
- Invites: `redeem` (POST)
- Productions: GET/POST/PATCH
- QR: `resolve` (GET)
- Routes: `refresh-traffic`, `traffic-check`, `refresh-location`
- Rocket: `templates` (GET/POST/DELETE), `suggestions` (GET)
- Push: `subscribe`, `unsubscribe`, `send`
- Import: `parse` (POST multipart), `confirm` (POST JSON)

---

## i18n ✅

- `lib/i18n.js` — traduzioni EN+IT + `useT()` + `LanguageProvider`
- `app/providers.jsx` + `app/layout.tsx` — wrapping
- `lib/navbar.js` — toggle 🇬🇧/🇮🇹 + `<Navbar>` riutilizzabile

> ❌ NO stringhe hardcoded. Usare SEMPRE `useT()`.
> **Build fix:** `useSearchParams()` → wrappare in `<Suspense fallback={null}>`.
> **Pattern:** `<Navbar currentPath="/dashboard/xxx" />`

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

**Travel_Status Crew:** `IN` (ARRIVAL) | `OUT` (DEPARTURE) | `PRESENT` (default)
- ARRIVAL completato → IN → PRESENT (trigger 5min). Manuale vince sempre.

**Login Approval:** `auth/callback` → verifica `user_roles` → `/dashboard` o `/pending` (polling 3sec)

**Pattern Assign Coverage→Trips:** URL params `?assignCrewId=&assignCrewName=&assignHotelId=&assignTS=&assignDate=`
- Banner amber in trips, badge ⭐ MATCH, `suggestedBaseIds` filtra hotel+ts

**Multi-Production:** `lib/production.js` — `getProductionId()` / `switchProduction(id)` via localStorage

**Rocket v2 (TASK 1-7):**
- Input: crew PRESENT+CONFIRMED, veicoli attivi, routeMap, globalDestId, globalCallMin, overrides
- Raggruppa per (hotel_id, effectiveDest, effectiveCallMin) → greedy fino a pax_suggested
- Trip ID: `R_MMDD_NN` | multi-stop: `R_MMDD_NNA`, `R_MMDD_NNB`
- TASK 1: routing sequenziale multi-pickup (A→B→Hub invece che parallelo)
- TASK 2: durata stimata + orario arrivo in Step 2
- TASK 3: template localStorage (auto-save ultima config + banner reload)
- TASK 4: template Supabase `rocket_templates` (condivisi per produzione)
- TASK 5: suggerimenti statistici da run storici (API `rocket/suggestions`, attivo dopo 10-15 run)
- TASK 6: quick-reason esclusione veicolo (dropdown + campo libero, visibile in Step 3)
- TASK 7: service type per singola destinazione (override individuale > dipartimento > globale)

**Captain Bridge (S9):**
- Accesso: ruolo `CAPTAIN` o `ADMIN`
- Tab Pending: Sandbox ✓ | Add to prod ⊕ | Ignore ✕
- Tab Invites: codice 8-char uppercase, `role`, `max_uses`, `expires_at`, `active`, `uses_count`
- `/pending`: `POST /api/invites/redeem` → valida → insert `user_roles` → redirect dashboard

> ⚠️ Query `production_invites`: join manuale (non PostgREST) per evitare errore schema cache:
> ```js
> const { data: invites } = await supabase.from('production_invites').select('*')...
> const { data: prods } = await supabase.from('productions').select('id, name').in('id', prodIds)
> const prodMap = Object.fromEntries(prods.map(p => [p.id, p]))
> const enriched = invites.map(inv => ({ ...inv, productions: prodMap[inv.production_id] }))
> ```

---

## S11 — Push PWA 🔔 ✅ (TASK 1-4)

**Dipendenze:** TASK1 → TASK2, TASK3, TASK4

**Deploy fix:** `next.config.ts` → `serverExternalPackages: ['web-push', 'nodemailer']`
`lib/webpush.js` usa init VAPID lazy (`ensureVapidInit()`)

| Task | File | Stato |
|------|------|-------|
| TASK 1 — Infrastruttura | `web-push`, `scripts/migrate-push-subscriptions.sql`, `public/sw.js`, `lib/webpush.js`, API push (subscribe/unsubscribe/send) | ✅ |
| TASK 2 — UI Navbar | `lib/useNotifications.js` (hook), icona 🔔/🔕 in `lib/navbar.js` | ✅ |
| TASK 3 — Real-time | `auth/callback` → push CAPTAIN/ADMIN "👤 Nuovo utente"; `approve-user` → push utente "✅ Accesso approvato!" | ✅ |
| TASK 4 — Cron | `api/cron/daily-briefing` (07:00 UTC), `vercel.json` schedule, push traffico anomalo in `refresh-routes-traffic` | ✅ |

**Schema SQL push_subscriptions:**
```sql
CREATE TABLE push_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  production_id UUID REFERENCES productions(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL, p256dh TEXT NOT NULL, auth TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, endpoint)
);
```

**Hook pattern:** `const { supported, permission, subscribed, loading, subscribe, unsubscribe } = useNotifications()`

---

## S12 — Import Intelligente 📂 ✅

**Stack:** Claude API (`claude-sonnet-4-20250514`) + `xlsx` + `pdf-parse` + `mammoth`
**Deploy fix:** `serverExternalPackages` include anche `pdf-parse`, `mammoth`, `xlsx`

| Task | File | Stato |
|------|------|-------|
| TASK 1 — Backend | `api/import/parse/route.js` (POST multipart), `api/import/confirm/route.js` (POST JSON) | ✅ |
| TASK 2 — ImportModal | `lib/ImportModal.js` — drag&drop, preview editabile, color coding, banner stats | ✅ |
| TASK 3 — Integrazione | `vehicles/page.js` + `crew/page.js` — bottone `📂 Import from file` + modal montato | ✅ |

**Flusso parse:** estrazione per ext (xlsx/csv/pdf/docx) → Claude → duplicate detection → hotel matching → `{ rows, newData }`
**Flusso confirm:** newLocations insert → auto-ID → batch insert/update → `{ inserted, updated, skipped, errors }`

**System prompts (campi estratti):**
- Fleet: `driver_name, vehicle_type, license_plate, capacity, pax_suggested, pax_max, sign_code, available_from, available_to`
- Crew: `full_name, department, hotel, arrival_date, departure_date`

**ImportModal features:**
- State machine: `idle → parsing → preview → confirming → done`
- Color coding: bianco (OK) | `#fefce8` (missing) | `#fef2f2` (not recognized) | `#fff7ed` (duplicate)
- `maxWidth: 1400px`, `padding: 16px 12px`

**Bug fix S12 (10 fix):**

| Fix | Problema | Soluzione |
|-----|---------|-----------|
| 1 | xlsx tutti i fogli → 33MB → Claude 400 | Solo primo foglio; sheet detection da istruzioni |
| 2 | Token overflow | Truncate 100K chars prima di Claude |
| 3 | Instructions opzionali | Textarea visible per tutti i mode, obbligatoria solo custom |
| 4 | JSON parse fragile | 3 strategie: ```json block → `[...]` → parse diretto |
| 5 | Claude collassava righe identiche | System prompt: "return ALL rows, no merging" |
| 6 | `vehicles.id` mancante → insert silenzioso | Auto-gen `VAN-01`, `CAR-01`, `BUS-01` progressivi |
| 7 | `locations.id` mancante | Auto-gen `H001`, `H002`... |
| 8 | Fleet: campi mancanti vs sidebar | Aggiunto `pax_max`, `available_from`, `available_to` |
| 9 | capacity/pax_suggested null | Defaults: VAN→8/8, CAR→4/4, BUS→null (pre-fill + server safety) |
| 10 | Modal troppo stretto | maxWidth 900→1400px |

> ⚠️ **Tabelle `vehicles`, `locations`, `crew` usano `TEXT PRIMARY KEY` senza auto-increment. Ogni insert API deve includere ID generato lato server.**

---

## S13 — Vehicles Delete + Bulk Select ✅

- Delete inline: icona 🗑 → conferma 2-step inline → `supabase.delete().eq('id', id)`
- Checkbox per riga: highlight azzurro (`#eff6ff`, border `#bfdbfe`)
- Select All: supporta stato `indeterminate`
- Bulk Actions bar: `☑ N selezionati | 🗑 Elimina | ✕ Annulla` → `delete().in('id', selectedIds)`
- i18n: 5 chiavi EN+IT (`deleteSelected`, `selectedCount`, `cancelSelection`, `deleteSelectedConfirm`, `selectAll`)

---

## S14 — UI Components ✅ COMPLETO

**Componenti in `components/ui/`:**
| Componente | Props principali |
|-----------|----------------|
| `PageHeader.jsx` | `left`, `right` (ReactNode) — sticky `top:52px z-20` |
| `FilterBar.jsx` | exports: `FilterBar`, `FilterPill` (active state), `FilterInput` (select) |
| `TableHeader.jsx` | `columns [{key,label,width}]`, `style` — genera `gridTemplateColumns` |
| `DataTable.jsx` | wrapper con CSS var `--col-template` |

**Migrazione PageHeader — tutte le pagine:**
- Batch 1-2: `trips/page.js` — `TRIP_COLS` + `TableHeader` + `PageHeader`
- Batch 3: `vehicles`, `crew`, `locations`
- Batch 4: `reports` (`className="no-print"`), `fleet`, `rocket`, `dashboard/page.js`

**Pattern migrazione:**
```jsx
<PageHeader
  left={<div style={{ display:'flex', gap:'8px' }}>...</div>}
  right={<div style={{ display:'flex', gap:'8px' }}>...</div>}
/>
```

**trips sticky top:** `104px` (normale) | `144px` (con banner assignCtx)

---

## S15 — NTN / Self Drive 🚐

**Comportamento NTN:**
- Rocket: esclusi automaticamente (Step 1)
- Trips: aggiungibili come SD, badge `🚐 SD`
- Pax Coverage: sezione separata in fondo, esclusi da % coverage
- Crew list: badge `🚐 SD`, toggle sidebar, filtro pill `NTN`

**Migration:** `scripts/migrate-ntn.sql`
```sql
ALTER TABLE crew ADD COLUMN IF NOT EXISTS no_transport_needed BOOLEAN NOT NULL DEFAULT FALSE;
```

### TASK 1 ✅ (29/03/26) — commit `31645a0`
- `scripts/migrate-ntn.sql` — ALTER TABLE
- `lib/i18n.js` — 4 chiavi: `noTransportNeeded`, `ntnShort`, `ntnSection`, `selfDrive`
- `app/dashboard/crew/page.js`:
  - CrewSidebar: toggle `no_transport_needed` (sopra "Zona Pericolosa")
  - CrewCard: badge `🚐 SD` (`#f1f5f9 / #6b7280 / #cbd5e1`)
  - Filtro toolbar: pill `🚐 NTN` → `filterTravel === 'NTN'` → `c.no_transport_needed === true`
  - Counter `🚐 N NTN` nel right toolbar (se > 0)

### TASK 2 ✅ (29/03/26) — commit `08204c3`
- `app/dashboard/rocket/page.js`:
  - Query `loadData`: aggiunto `no_transport_needed` al select + `.eq('no_transport_needed', false)`
  - Filtro JS in `runRocket()`: `&& !c.no_transport_needed` nell'array `eligible`
  - Doppia protezione: DB non carica NTN, algoritmo li esclude comunque

### TASK 3 ✅ (29/03/26) — commit `e3e5717`
- `app/dashboard/trips/page.js` — EditTripSidebar:
  - `loadPaxData`: aggiunto `no_transport_needed` al select di `trip_passengers` (crew join) e `crew`
  - Pax assegnati NTN: badge `🚐 SD` grigio (`#f1f5f9 / #6b7280 / #cbd5e1`)
  - Lista addPax: `regularCrew` + `ntnCrew` separati; sezione "🚐 Self Drive / NTN" (sfondo `#f8fafc`, bordo `#e2e8f0`)
  - NTN crew cliccabili (addPax) anche nella sezione SD
  - Se solo NTN disponibili (0 regular), mostra solo sezione SD (no "noEligibleCrew")
  - i18n: riusa chiavi esistenti `t.selfDrive` + `t.ntnShort`

### TASK 4 ✅ (29/03/26) — commit `44b1400`
- `app/dashboard/pax-coverage/page.js`:
  - Query: aggiunto `no_transport_needed` al select crew
  - Split: `regularCrew` (no NTN) + `ntnCrew` — `ntnFiltered` applica dept/hotel/search ma NON showOnly
  - % coverage + totalAssigned/Unassigned: denominatore = `regularCrew.length`
  - Toolbar pill `All (N)`: conta solo `regularCrew.length`
  - Stats bar: box `🚐 NTN (N)` grigio (`#f1f5f9 / #6b7280 / #cbd5e1`), visibile se ntnCount > 0
  - Terza sezione in fondo: `🚐 No Transport Needed` — bordo grigio `#94a3b8`, `NTNRow` senza pulsante Assign
  - Condizione "no results": `filtered.length === 0 && ntnFiltered.length === 0`
- `lib/i18n.js`: chiave `ntnCoverageNote` EN + IT

---

## ✅ S16 — i18n Sidebar Labels (crew / vehicles / locations)
**Commit:** `cb77bd4`  
**File:** `lib/i18n.js`, `crew/page.js`, `vehicles/page.js`, `locations/page.js`

**Chiavi aggiunte (EN+IT):** `dangerZone` · Crew: `crewIdHint`, `fullNameLabel`, `departmentLabel`, `ntnExcludedHint`, `hotelLocationLabel`, `hotelStatusLabel`, `travelStatusLabel`, `arrivalDateLabel`, `departureDateLabel`, `notesLabel`, `notesPlaceholder` · Vehicle: `vehicleTypeLabel`, `vehicleClassLabel`, `licensePlateLabel`, `driverLabel`, `signCodeLabel`, `unitDefaultLabel`, `vehicleIdHint`, `vehicleActive`, `vehicleInactive` · Location: `locationIdLabel`, `locationNameLabel`, `locationIdHint`, `isHubLabel`, `isHotelLabel`, `isHubHint`, `isHotelHint`, `latitudeLabel`, `longitudeLabel`, `coordDecimalHint`, `defaultPickupPointLabel`, `mapPickerHint`

**Sostituzioni:** tutti i label hardcoded nelle 3 sidebar + LocationsPage body (`t.loading`, `t.noLocations`, `t.noResults`, `t.addNew`, `t.addLocationBtn`)

---

## S17 — i18n Rocket + Productions 🌍

**File coinvolti:** `lib/i18n.js`, `app/dashboard/rocket/page.js`, `app/dashboard/productions/page.js`

> ⚠️ **Deploy S17:** NON è necessario fare deploy dopo ogni singolo task R. Fare un unico deploy finale quando tutti i task R sono completati.

**Approccio:** `replace_in_file` chirurgico. Aggiungere `import { useT } from '../../../lib/i18n'` + `const t = useT()` in ogni componente principale. I sottocomponenti (`TripCard`, `TemplatesPanel`, `CrewQuickEditModal`, ecc.) usano `useT()` internamente (non props).

> ⚠️ NON tradurre: valori logici (`'PRESENT'`, `'CONFIRMED'`, `'__other__'`), chiavi localStorage, ID, costanti interne.

---

### TASK 1 — Productions i18n (productions/page.js)

**Chiavi da aggiungere in `lib/i18n.js`** (blocco `// ── Productions page ──`):

| Chiave | EN | IT |
|--------|----|----|
| `productionsTitle` | `🎬 Productions` | `🎬 Produzioni` |
| `productionsDesc` | `Manage your productions and set the active one for your account.` | `Gestisci le produzioni e imposta quella attiva per il tuo account.` |
| `productionsYours` | `Your Productions` | `Le tue Produzioni` |
| `productionsNewBtn` | `+ New Production` | `+ Nuova Produzione` |
| `productionsNone` | `No productions yet` | `Nessuna produzione` |
| `productionsNoneDesc` | `Create your first production to get started` | `Crea la tua prima produzione per iniziare` |
| `productionsActiveLabel` | `ACTIVE PRODUCTION` | `PRODUZIONE ATTIVA` |
| `productionsViewTransportList` | `→ View Transport List` | `→ Vedi Transport List` |
| `productionsActivateBtn` | `↔ Activate` | `↔ Attiva` |
| `productionsEditBtn` | `✎ Edit` | `✎ Modifica` |
| `productionsSaveChanges` | `✓ Save Changes` | `✓ Salva Modifiche` |
| `productionsCreate` | `🎬 Create Production` | `🎬 Crea Produzione` |
| `productionsCreatingBtn` | `Creating…` | `Creando…` |
| `productionsChooseLogo` | `📁 Choose Logo` | `📁 Scegli Logo` |
| `productionsUploadLogo` | `📁 Upload Logo` | `📁 Carica Logo` |
| `productionsLogoHint` | `PNG, JPG, SVG — max 2 MB` | `PNG, JPG, SVG — max 2 MB` |
| `productionsNewTitle` | `🎬 New Production` | `🎬 Nuova Produzione` |
| `productionsInfoTitle` | `ℹ How multi-production works` | `ℹ Come funziona il multi-produzione` |
| `productionsInfoLine1` | `Each production has its own trips, crew, vehicles and locations — completely separate` | `Ogni produzione ha i propri trip, crew, veicoli e location — completamente separati` |
| `productionsInfoLine2` | `Click "↔ Activate" to switch to a different production — all pages will use that ID` | `Clicca "↔ Attiva" per cambiare produzione — tutte le pagine useranno quell'ID` |
| `productionsInfoLine3` | `All header fields (contacts, set, basecamp, call time) appear in the Transport List` | `Tutti i campi header (contatti, set, basecamp, call time) compaiono nel Transport List` |
| `productionsInfoLine4` | `Logos are stored in Supabase Storage bucket` | `I loghi sono salvati nel bucket Supabase Storage` |
| `productionsNameLabel` | `Production Name *` | `Nome Produzione *` |
| `productionsSlugLabel` | `Slug (URL)` | `Slug (URL)` |
| `productionsScheduleSection` | `Schedule` | `Pianificazione` |
| `productionsCallTimeLabel` | `General Call Time` | `Call Time Generale` |
| `productionsShootDayLabel` | `Shoot Day` | `Giorno di Ripresa` |
| `productionsRevisionLabel` | `Revision` | `Revisione` |
| `productionsKeyCreativesSection` | `Key Creatives` | `Creativi Chiave` |
| `productionsDirectorLabel` | `Director` | `Regista` |
| `productionsProducerLabel` | `Producer` | `Produttore` |
| `productionsProdTeamSection` | `Production Team` | `Team di Produzione` |
| `productionsPmNameLabel` | `Production Manager — Name` | `Production Manager — Nome` |
| `productionsPmPhoneLabel` | `Production Manager — Phone` | `Production Manager — Tel` |
| `productionsPcNameLabel` | `Production Coordinator — Name` | `Production Coordinator — Nome` |
| `productionsPcPhoneLabel` | `Production Coordinator — Phone` | `Production Coordinator — Tel` |
| `productionsTranspTeamSection` | `Transportation Team` | `Team Trasporti` |
| `productionsTcNameLabel` | `Transportation Coordinator — Name` | `Transportation Coordinator — Nome` |
| `productionsTcPhoneLabel` | `Transportation Coordinator — Phone` | `Transportation Coordinator — Tel` |
| `productionsCaptNameLabel` | `Transportation Captain — Name` | `Transportation Captain — Nome` |
| `productionsCaptPhoneLabel` | `Transportation Captain — Phone` | `Transportation Captain — Tel` |
| `productionsOfficePhoneLabel` | `Production Office — Phone` | `Ufficio di Produzione — Tel` |
| `productionsSetBasecampSection` | `Set & Basecamp` | `Set & Basecamp` |
| `productionsSetNameLabel` | `Set Location — Name` | `Set — Nome` |
| `productionsSetAddressLabel` | `Set Location — Address` | `Set — Indirizzo` |
| `productionsBasecampLabel` | `Basecamp` | `Basecamp` |

**Sostituzioni in `productions/page.js`:**
- Aggiungere `import { useT } from '../../../lib/i18n'`
- `const t = useT()` in `ProductionsPage()` e in `FormFields()`
- Sostituire tutti i label/testi visibili con `t.xxx`

---

### TASK 2 — Rocket i18n (rocket/page.js) — 🔄 IN CORSO

**Prerequisiti completati:**
- ✅ `lib/i18n.js` — 80+ chiavi Rocket aggiunte EN+IT (blocco `// ── Rocket page ──`)
- ✅ `import { useT }` + `const t = useT()` in tutti i 7 sottocomponenti

> ⚠️ MAX 3 `replace_in_file` SEARCH/REPLACE per task. Ogni task = un batch atomico.
> ⚠️ NON tradurre: valori logici (`'PRESENT'`, `'CONFIRMED'`), chiavi LS, ID interni, badge tecnici (es. `MULTI-PKP`).

---

#### TASK R1 ✅ — TripCard + LastRunBanner + TemplatesPanel header
- `TripCard`: `Move ›` → `t.rocketMoveBtn`
- `LastRunBanner`: `Reload last run?` → `t.rocketReloadLast`
- `TemplatesPanel`: titolo panel → `t.rocketTemplatesBtn`

#### TASK R2 ✅ — TemplatesPanel save section
- `Save current configuration` → `t.rocketSaveCurrentConfig`
- `💾 Save locally` → `t.rocketSaveLocally`
- `☁️ Share with team` → `t.rocketShareTeam`

#### TASK R3 ✅ — TemplatesPanel sezioni shared/local
- `☁️ Shared with team` section header → `t.rocketSharedTemplates` ✅
- `· visible to all Captains` → `t.rocketVisibleAllCaptains` ✅
- `No shared templates yet.` / `Save a config above…` → `t.rocketNoSharedTpl` ✅
- `💾 Local` section header → `t.rocketLocalTemplates` ✅
- `· stored on this device only` → `t.rocketStoredOnDevice` ✅
- `No local templates yet.` / `Click "Save locally"…` → `t.rocketNoLocalTpl` ✅

#### TASK R4 ✅ — SuggestionsHint + PageHeader subtitle
- `Historical Suggestions` → `t.rocketHistoricalSugg`
- `hints based on past` / `runs` → `t.rocketBasedOnPast` / `t.rocketRuns`
- `Trip Generator v2` subtitle in PageHeader → `t.rocketSubtitle`

#### TASK R5 ✅ — Config box title + Templates btn + labels (Date, Dest)
- `⚙️ Trip Configuration` → `t.rocketTripConfig`
- `📋 Templates` button → `t.rocketTemplatesBtn`
- `Date` label → `t.rocketDateLabel`
- `Default Destination` label → `t.rocketDefaultDest`

#### TASK R6 ✅ — Labels (Call Time, Pickup hint, Service Type)
- `Default Call Time` label → `t.rocketDefaultCall`
- `Pickup = call − route duration` → `t.rocketPickupHint`
- `Service Type` label → `t.rocketServiceTypeLabel`

#### TASK R7 ✅ — Dept section
- `🎯 Dept Destinations` → `t.rocketDeptDest` ✅
- `↩ Reset all` → `t.rocketResetAll` ✅
- `same service type` (option) → `t.rocketSameServiceType` ✅
- `Crew without dept always use the default.` → `t.rocketDeptHint` ✅

#### TASK R8 ✅ — Fleet section
- `Why excluded?` → `t.rocketWhyExcluded` ✅
- `No active vehicles —` / `add vehicles` link → `t.rocketNoVehicles` / `t.rocketAddVehicles` ✅
- `No driver` (fleet row span) → `t.rocketNoDriver` ✅

#### TASK R9 ✅ — Crew header + buttons
- `👥 Crew` → `t.rocketCrewLabel` ✅
- `selected` / `eligible` counters → `t.rocketCrewSelected` / `t.rocketCrewEligible` ✅
- `Reset times` → `t.rocketResetTimes` ✅
- `Expand all` → `t.rocketExpandAll` ✅
- `Collapse` → `t.rocketCollapse` ✅

#### TASK R10 ✅ — No eligible crew + NoDept var + crew footer + loading
- `'— No Department —'` var `deptLabel` → `t.rocketNoDept` ✅
- `No eligible crew` / hint `travel_status…` → `t.rocketNoEligibleCrew` / `t.rocketNoEligibleHint` ✅
- Crew footer: `selected` / `excluded` / `call override` / `hotels` / `depts` → chiavi `rocketSelectedCount`… ✅
- Loading screen `Loading fleet and crew data…` → `t.rocketLoadingData` ✅

#### TASK R11 ✅ — Step 2 labels (toolbar + stats + empty)
- `← Edit Setup` → `t.rocketEditSetup` ✅
- `⏳ Creating…` → `t.rocketCreating` ✅
- `📋 Draft Plan` stats bar → `t.rocketDraftPlan` ✅
- `No trips generated` → `t.rocketNoTrips` ✅

#### TASK R12 ✅ — Step 3 labels
- `Trips Created!` → `t.rocketTripsCreated` ✅
- `📋 View Trips` → `t.rocketViewTrips` ✅
- `🚦 Fleet Monitor` → `t.rocketFleetMonitor` ✅
- `🔄 New Rocket Run` → `t.rocketNewRun` ✅
- `excluded from this run` → `t.rocketExcludedLabel` ✅
- `no reason noted` → `t.rocketNoReasonNoted` ✅
- `No driver` (Step 3 excluded list) → `t.rocketNoDriver` ✅

---

**Chiavi di riferimento in `lib/i18n.js`** (blocco `// ── Rocket page ──`):

| Chiave | EN | IT |
|--------|----|----|
| `rocketSubtitle` | `Trip Generator v2` | `Generatore Trip v2` |
| `rocketStepSetup` | `Setup` | `Configurazione` |
| `rocketStepPreview` | `Preview` | `Anteprima` |
| `rocketStepDone` | `Done` | `Fine` |
| `rocketEditSetup` | `← Edit Setup` | `← Modifica Config` |
| `rocketCreating` | `⏳ Creating…` | `⏳ Creando…` |
| `rocketTripConfig` | `⚙️ Trip Configuration` | `⚙️ Configurazione Trip` |
| `rocketTemplatesBtn` | `📋 Templates` | `📋 Template` |
| `rocketDateLabel` | `Date` | `Data` |
| `rocketDefaultDest` | `Default Destination` | `Destinazione Predefinita` |
| `rocketDefaultCall` | `Default Call Time` | `Call Time Predefinita` |
| `rocketPickupHint` | `Pickup = call − route duration` | `Pickup = call − durata rotta` |
| `rocketServiceTypeLabel` | `Service Type` | `Tipo Servizio` |
| `rocketDeptDest` | `🎯 Dept Destinations` | `🎯 Destinazioni Reparto` |
| `rocketResetAll` | `↩ Reset all` | `↩ Reset tutto` |
| `rocketOverride` | `override` | `override` |
| `rocketOverrides` | `overrides` | `override` |
| `rocketCrewLabel` | `👥 Crew` | `👥 Crew` |
| `rocketCrewSelected` | `selected` | `selezionati` |
| `rocketCrewEligible` | `eligible` | `idonei` |
| `rocketResetTimes` | `Reset times` | `Reset orari` |
| `rocketExpandAll` | `Expand all` | `Espandi tutti` |
| `rocketCollapse` | `Collapse` | `Comprimi` |
| `rocketNoDept` | `— No Department —` | `— Nessun Reparto —` |
| `rocketNoEligibleCrew` | `No eligible crew` | `Nessun crew idoneo` |
| `rocketNoEligibleHint` | `travel_status = PRESENT + hotel_status = CONFIRMED` | `travel_status = PRESENT + hotel_status = CONFIRMED` |
| `rocketNoVehicles` | `No active vehicles —` | `Nessun veicolo attivo —` |
| `rocketAddVehicles` | `add vehicles` | `aggiungi veicoli` |
| `rocketLoadingData` | `Loading fleet and crew data…` | `Caricamento dati flotta e crew…` |
| `rocketDraftPlan` | `📋 Draft Plan` | `📋 Piano Bozza` |
| `rocketNoTrips` | `No trips generated` | `Nessun trip generato` |
| `rocketTripsCreated` | `Trips Created!` | `Trip Creati!` |
| `rocketNewRun` | `🔄 New Rocket Run` | `🔄 Nuovo Run Rocket` |
| `rocketViewTrips` | `📋 View Trips` | `📋 Vedi Trips` |
| `rocketFleetMonitor` | `🚦 Fleet Monitor` | `🚦 Fleet Monitor` |
| `rocketWhyExcluded` | `Why excluded?` | `Perché escluso?` |
| `rocketExcludedLabel` | `excluded from this run` | `escluso/i da questo run` |
| `rocketNoReasonNoted` | `no reason noted` | `nessun motivo indicato` |
| `rocketReloadLast` | `Reload last run?` | `Ricarica ultimo run?` |
| `rocketHistoricalSugg` | `Historical Suggestions` | `Suggerimenti Storici` |
| `rocketSameServiceType` | `same service type` | `stesso tipo servizio` |
| `rocketNoDriver` | `No driver` | `Nessun driver` |
| `rocketIncluded` | `✅ Included` | `✅ Incluso` |
| `rocketExcluded` | `☐ Excluded` | `☐ Escluso` |
| `rocketIncludeInRun` | `Include in run` | `Includi nel run` |
| `rocketCallTimeLabel` | `Call Time` | `Call Time` |
| `rocketMovePassenger` | `Move passenger` | `Sposta passeggero` |
| `rocketRemoveFromAll` | `↩ Remove from all trips` | `↩ Rimuovi da tutti i trip` |
| `rocketAutoSplit` | `auto-split on confirm` | `divisione automatica alla conferma` |
| `rocketAllArrive` | `🏁 all arrive` | `🏁 tutti arrivano` |
| `rocketNoPassengers` | `No passengers` | `Nessun passeggero` |
| `rocketMoveBtn` | `Move ›` | `Sposta ›` |
| `rocketCancelBtn` | `Cancel` | `Annulla` |
| `rocketDoneBtn` | `✓ Done` | `✓ Fatto` |
| `rocketSaveCurrentConfig` | `Save current configuration` | `Salva configurazione corrente` |
| `rocketSaveLocally` | `💾 Save locally` | `💾 Salva localmente` |
| `rocketShareTeam` | `☁️ Share with team` | `☁️ Condividi con il team` |
| `rocketSharedTemplates` | `☁️ Shared with team` | `☁️ Condivisi con il team` |
| `rocketLocalTemplates` | `💾 Local` | `💾 Locali` |
| `rocketNoSharedTpl` | `No shared templates yet.` | `Nessun template condiviso ancora.` |
| `rocketNoLocalTpl` | `No local templates yet.` | `Nessun template locale ancora.` |
| `rocketVisibleAllCaptains` | `· visible to all Captains` | `· visibile a tutti i Captain` |
| `rocketStoredOnDevice` | `· stored on this device only` | `· salvato solo su questo dispositivo` |
| `rocketDeptHint` | `Crew without dept always use the default.` | `Crew senza reparto usa sempre il default.` |
| `rocketSelectedCount` | `selected` | `selezionati` |
| `rocketExcludedCount` | `excluded` | `esclusi` |
| `rocketCallOverrides` | `call override` | `override call` |
| `rocketHotels` | `hotels` | `hotel` |
| `rocketDepts` | `depts` | `reparti` |
| `rocketBasedOnPast` | `hints based on past` | `suggerimenti basati sui` |
| `rocketRuns` | `runs` | `run` |

**Sostituzioni in `rocket/page.js`:**
- Aggiungere `import { useT } from '../../../lib/i18n'` (già presente se aggiunto nella sessione)
- `const t = useT()` in: `RocketPage`, `TripCard`, `CrewQuickEditModal`, `MoveCrewModal`, `TemplatesPanel`, `SuggestionsHint`, `LastRunBanner`
- Sostituire stringhe visibili mantenendo la logica invariata

---

## Database Schema

```sql
productions (id, name, slug, logo_url,
  director, producer,
  production_manager, production_manager_phone,
  production_coordinator, production_coordinator_phone,
  transportation_coordinator, transportation_coordinator_phone,
  transportation_captain, transportation_captain_phone,
  production_office_phone, set_location, set_address, basecamp,
  general_call_time, shoot_day, revision)

user_roles
locations (is_hub bool)
routes (duration_min, google_duration_min, traffic_updated_at)
crew (hotel_id, travel_status, hotel_status, arrival_date, departure_date,
      department, role TEXT, no_transport_needed bool DEFAULT false,
      email TEXT, phone TEXT)
vehicles (capacity, pax_suggested, pax_max, driver_name, sign_code,
          active, available_from, available_to)
trips (pickup_id, dropoff_id, call_min, pickup_min, start_dt, end_dt,
       service_type, status, terminal)
trip_passengers
service_types
production_invites (code, label, role, max_uses, uses_count, expires_at, active, created_by)
  → FK: production_id → productions(id) ON DELETE CASCADE
  → UNIQUE INDEX su UPPER(code)
rocket_templates (id, production_id, name, config_json, created_by, created_at)
  → FK: production_id → productions(id) ON DELETE CASCADE
push_subscriptions (user_id, production_id, endpoint, p256dh, auth)
  → UNIQUE(user_id, endpoint)

RLS abilitato su tutte le tabelle
```

---

## S19 — Crew Role Field 🎬 ✅ (30/03/26) — commit `719ed19`

**Problema:** nella pagina Crew mancava il campo "ruolo/posizione" (es. "Director of Photography", "Gaffer", "1st AC"), distinto dal dipartimento.

**File modificati:**
| File | Modifica |
|------|---------|
| `scripts/migrate-crew-role.sql` | `ALTER TABLE crew ADD COLUMN IF NOT EXISTS role TEXT` |
| `lib/i18n.js` | chiave `roleLabel` EN (`Role / Job Title`) + IT (`Ruolo / Posizione`) nel blocco crew sidebar |
| `app/dashboard/crew/page.js` | EMPTY state + form state + handleSubmit row + CrewSidebar form field + CrewCard badge |
| `app/api/import/parse/route.js` | SYSTEM_PROMPT_CREW: aggiunto campo `role` (titolo specifico dal documento) |

**Dettagli implementazione:**
- **CrewCard:** badge `member.role` tra nome e dipartimento — grigio scuro `#374151/f1f5f9`, fontWeight 600; dipartimento ora su sfondo `#e2e8f0`
- **CrewSidebar form:** campo "Ruolo / Posizione" tra Nome e Dipartimento, placeholder: `Director of Photography, Gaffer, 1st AC…`
- **import/parse:** Claude ora estrae `role` come titolo esatto dal documento; `department` inferito dal ruolo se non esplicito

**Migration:** eseguire `scripts/migrate-crew-role.sql` nel Supabase SQL Editor

---

## S20 — Crew Contact Info 📞 ✅ (30/03/26)

**Migration:** eseguire `scripts/migrate-crew-contacts.sql` nel Supabase SQL Editor
```sql
ALTER TABLE crew ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE crew ADD COLUMN IF NOT EXISTS phone TEXT;
```

**File modificati:**
| File | Modifica |
|------|---------|
| `scripts/migrate-crew-contacts.sql` | `ALTER TABLE crew ADD COLUMN email TEXT; ADD COLUMN phone TEXT` |
| `lib/i18n.js` | 4 chiavi EN+IT: `crewContactInfo`, `crewEmailLabel`, `crewPhoneLabel`, `crewNoContact` |
| `app/dashboard/crew/page.js` | `ContactPopover` + accordion sidebar + `useRef` import + state + `handleContactSaved` |

**`ContactPopover` (su ogni CrewCard):**
- Pulsante `📞+` grigio (nessun contatto) o `📞` blu `#eff6ff` (contatto presente)
- Click → popover absolute (width 240px, z-index 100), click-outside via `useRef` + `mousedown`
- **View mode:** email come `<a href="mailto:">`, phone come `<a href="tel:">` o `—`
- **Edit mode** (pulsante `✎ Edit`): input email + phone → `supabase.update` → `onSaved(id, {email,phone})`
- Nessun reload necessario: `handleContactSaved` aggiorna state locale

**Accordion `📞 Contact Info` nella `CrewSidebar`:**
- Collapsible tra Notes e Danger Zone, badge `✓` blu se già compilato
- Sfondo `#f0f9ff` quando aperto; valori salvati insieme al resto del form in `handleSubmit`
- Funziona in `mode='new'` e `mode='edit'`

---

## S21 TASK 2 — Smart Categorization 🗂️ ✅ (30/03/26) — commit `1b0915b`

**File modificati:** `app/api/import/parse/route.js`, `lib/ImportModal.js`

### Obiettivo
Aggiungere una fase intermedia `categorizing` tra `parsing` e `preview` che mostra 4 sezioni smart PRIMA della tabella editable, permettendo all'utente di prendere decisioni rapide senza dover scorrere centinaia di righe.

### Modifiche parse/route.js
- **`processFleetRows`**: select espansa a tutti i campi rilevanti (`vehicle_type, capacity, pax_suggested, pax_max, sign_code, available_from, available_to`); ogni riga matched include:
  - `existingData: { driver_name, vehicle_type, license_plate, … }` — valori attuali nel DB
  - `newFields: ['capacity', 'sign_code', …]` — campi presenti nel file ma null nel DB
- **`processCrewRows`**: select espansa (`role, department, phone, email, hotel_id, arrival_date, departure_date`); stessa logica `existingData` + `newFields` calcolati dopo hotel matching

### Modifiche ImportModal.js
**State machine:** `idle → parsing → categorizing → preview → confirming → done`

**Nuovo stato:** `reviewMode: { active: bool, idx: number }` — gestisce review one by one

**Fase `categorizing`** (4 sezioni):

| Sezione | Trigger | Azioni |
|---------|---------|--------|
| 🟡 New info for existing | `existingId && newFields.length > 0` | Accept all / Review one by one / Skip per riga |
| 🔴 Unknown records | `!existingId` | Add / Skip per riga |
| 🔵 New locations | `newHotels.length > 0` | Add / Skip per hotel |
| 🚗 Non-standard vehicle types | tipo non in VAN/CAR/BUS | Skip all / Include all per tipo |

**Review one by one:** side-by-side "Current in database" (grigio) vs "From file" (verde), pulsanti Accept / Skip / Back to summary. Progress counter `1/N`.

**Footer categorizing:** "Back" (→ idle) + "Preview & Confirm" (→ preview)
**Footer preview aggiornato:** "Back" ora torna a `categorizing` invece di `idle`

**Helper functions aggiunte:**
- `getCatRowName(row)` — nome display per crew/fleet/mixed
- `getCatRowSub(row)` — info secondaria (dept·role oppure type·plate)
- `getCatFieldValue(row, field)` — normalizza accesso a `plate`→`license_plate` e `hotel`→`hotel_id`
- `advanceReview(skipCurrent)` — avanza review, gestisce skip/accept, chiude modal review al termine

**If nessuna sezione:** mostra "✅ All records ready — No conflicts to review" e footer con solo "Preview & Confirm".

---

## S21 TASK 1 — Import base (HAL + revamp) 📂 ✅ (30/03/26) — commit `46d94ce`

**File modificati:** `app/api/import/parse/route.js`, `app/api/import/confirm/route.js`, `lib/ImportModal.js`

### Modifiche parse/route.js
- **`SYSTEM_PROMPT_HAL`** (nuovo): Claude auto-rileva tipo documento → ritorna `{ type: "crew"|"fleet"|"accommodation"|"mixed", crew: [...], vehicles: [...], accommodation: [...] }`
- **`SYSTEM_PROMPT_CREW`** (aggiornato): estrae `first_name`, `last_name`, `role`, `department`, `phone`, `email`, `active` (false se "not started")
- **`SYSTEM_PROMPT_FLEET`** (aggiornato): campo `plate` invece di `license_plate`; mapping vehicle_type da modello auto
- **`callClaude`**: aggiunto parametro `returnType: 'array'|'object'`; strategia 3-step per entrambi i tipi
- **Handler `hal`**: chiama Claude con HAL prompt → dispatch su crew/fleet/mixed → `detectedMode` in risposta
  - `mixed`: rows taggiate con `_subMode: 'crew'|'fleet'`
- **Normalizzatori**: `normalizeCrew()` + `normalizeFleet()` + helper `processCrewRows()` + `processFleetRows()`
- **Crew dup detection**: confronto su `first_name + last_name` → `full_name` (case insensitive)
- **Fleet dup detection**: confronto su `plate` (case insensitive) poi `driver_name`
- **Risposta API**: aggiunto campo `detectedMode` in tutti i mode

### Modifiche confirm/route.js
- **Crew insert**: `full_name = first_name + ' ' + last_name`; aggiunge `role`, `phone`, `email` all'insert
- **Fleet insert**: `row.plate → license_plate` (mapping esplicito)
- **Update "null-only"**: fetch existing da Supabase prima di ogni update; sovrascrive SOLO campi null nel DB
- **Supporto `mode='hal'`**: routing su `detectedMode` (`crew`/`fleet`/`mixed`)
- **Mixed**: split crew/fleet su `_subMode`, processa separatamente
- Helper estratti: `insertNewLocations()`, `getMaxVehicleNums()`, `getMaxCrewNum()`, `processFleet()`, `processCrew()`

### Modifiche ImportModal.js
- **Selector**: 4 opzioni — `🔴 HAL` (Let me figure it out) | `👥 Crew list` | `🚗 Fleet list` | `✏️ Custom instructions…`
- **State**: aggiunto `detectedMode` (null → popolato dopo HAL parse)
- **`effectiveDisplayMode`**: `(selMode === 'hal' && detectedMode) ? detectedMode : selMode`
- **Header badge**: `🔴 HAL detected: crew/fleet/mixed` in preview se mode=HAL
- **`CrewTable`** (aggiornata): colonne First Name | Last Name | Role | Dept | Phone | Email | Hotel | Arrival | Departure | Status; badge `🕐 Not yet active` grigio per `active === false`
- **`FleetTable`** (aggiornata): campo `plate` (era `license_plate`); `available_from`/`available_to` mantenuti
- **`rowBg`**: aggiunto grigio `#f1f5f9` per `active === false`
- **`isUnrecognized` crew**: `!row.first_name && !row.last_name`
- **`hasNullFields` crew**: `!row.department || !row.role`
- **`renderPreviewTable()`**: gestisce `mixed` → due sezioni separate 👥 Crew + 🚗 Fleet
- **Banner stats**: aggiunto `🕐 X not yet active`
- **Confirm body**: invia `detectedMode` a `/api/import/confirm`

### Row shape aggiornato

| Mode | Campi row |
|------|----------|
| crew | `first_name, last_name, role, department, phone, email, active, hotel, hotel_id, hotelNotFound, arrival_date, departure_date, action, existingId` |
| fleet | `driver_name, vehicle_type, plate, sign_code, capacity, pax_suggested, pax_max, available_from, available_to, action, existingId` |
| mixed | come sopra + `_subMode: 'crew'|'fleet'` |

> ⚠️ Il campo `active` (crew) NON è persistito nel DB (tabella crew non ha colonna `active`) — è solo un flag visivo nella preview.
> ⚠️ Fleet: `plate` è il campo nelle rows; il DB usa `license_plate` → mapping nel confirm route.

---

## S18 — i18n Completamento 🌍

**File coinvolti:** `lib/i18n.js`, `fleet/page.js`, `reports/page.js`, `bridge/page.js`, `qr-codes/page.js`, `lists/page.js`, `settings/production/page.js`, `lib/ImportModal.js`, `pending/page.js` (fix residui), `scan/page.js` (fix residui)

> ⚠️ **Deploy S18:** UN SOLO deploy finale quando tutti i task sono completati. NON deployare tra un task e l'altro.
> ⚠️ Pattern identico a S17: `replace_in_file` chirurgico, `import { useT }` + `const t = useT()` in ogni componente.
> ⚠️ NON tradurre: valori logici (`'BUSY'`, `'FREE'`, `'ARRIVAL'`, `'STANDARD'`), status badge tecnici, ID interni.

**Stato audit (30/03/26):**

| File | Navbar | useT | Note |
|------|--------|------|------|
| `fleet/page.js` | ✅ | ✅ | TASK 2 ✅ completato 30/03/26 |
| `reports/page.js` | ✅ | ❌ | ~15 stringhe EN hardcoded |
| `bridge/page.js` | ✅ | ❌ | ~40 stringhe EN hardcoded |
| `qr-codes/page.js` | ✅ | ❌ | mix IT/EN hardcoded |
| `lists/page.js` | ✅ | ❌ | mix IT/EN hardcoded (print page) |
| `settings/production/page.js` | ✅ | ❌ | riusa chiavi S17 `productions*` |
| `lib/ImportModal.js` | n/a | ❌ | helper condiviso, EN hardcoded |
| `pending/page.js` | n/a | ⚠️ | invite section ancora hardcoded |
| `scan/page.js` | n/a | ⚠️ | "Hotel", "Hotel Status", "Driver" hardcoded |

---

### TASK 1 ✅ (30/03/26) — Chiavi i18n (lib/i18n.js) — blocco `// ── S18 pages ──`

**File:** `lib/i18n.js`

| Chiave | EN | IT |
|--------|----|----|
| **Fleet Monitor** | | |
| `fleetMonitorTitle` | `🚦 Fleet Monitor` | `🚦 Fleet Monitor` |
| `fleetInProgress` | `IN PROGRESS` | `IN CORSO` |
| `fleetNextTrip` | `NEXT TRIP` | `PROSSIMO TRIP` |
| `fleetLastTrip` | `LAST TRIP` | `ULTIMO TRIP` |
| `fleetNoTripsToday` | `No trips scheduled today` | `Nessun trip programmato oggi` |
| `fleetNoActiveVehicles` | `No active vehicles` | `Nessun veicolo attivo` |
| `fleetAddVehiclesHint` | `→ Add vehicles on the Vehicles page` | `→ Aggiungi veicoli nella pagina Vehicles` |
| `fleetRefreshBtn` | `Refresh` | `Aggiorna` |
| `fleetRefreshing` | `Refreshing…` | `Aggiornamento…` |
| `fleetTrafficBtn` | `Traffico` | `Traffico` |
| `fleetLegendTitle` | `LEGEND` | `LEGENDA` |
| `fleetTripsWithoutVehicle` | `Trips without vehicle` | `Trip senza veicolo` |
| `fleetAssignLink` | `Assign →` | `Assegna →` |
| `fleetLoadingLabel` | `Loading Fleet Monitor…` | `Caricamento Fleet Monitor…` |
| `fleetReturning` | `Dropoff done — returning` | `Dropoff completato — rientro` |
| `fleetTripsToday` | `trips today` | `trip oggi` |
| `fleetStartLabel` | `Start` | `Inizio` |
| `fleetEndLabel` | `End` | `Fine` |
| `fleetTotalPax` | `total pax` | `pax totali` |
| `fleetViewingDate` | `Viewing:` | `Visualizzazione:` |
| `fleetStatusBasedOn` | `BUSY/FREE status based on current time` | `Stato BUSY/FREE basato sull'orario attuale` |
| **Reports** | | |
| `reportsTitle` | `📊 Fleet Reports` | `📊 Report Flotta` |
| `reportsDaily` | `Daily` | `Giornaliero` |
| `reportsWeekly` | `Weekly` | `Settimanale` |
| `reportsPrintBtn` | `🖨 Print / PDF` | `🖨 Stampa / PDF` |
| `reportsNoTrips` | `No trips for this period` | `Nessun trip per questo periodo` |
| `reportsDailyTotal` | `DAILY TOTAL` | `TOTALE GIORNALIERO` |
| `reportsWeeklyVehicle` | `VEHICLE` | `VEICOLO` |
| `reportsWeeklyTotal` | `TOTALE` | `TOTALE` |
| `reportsWeeklyNoVehicles` | `No vehicles with trips this week` | `Nessun veicolo con trip questa settimana` |
| `reportsTotalPerDay` | `TOTAL / DAY` | `TOTALE / GIORNO` |
| `reportsPrinted` | `Printed:` | `Stampato:` |
| `reportsColCall` | `CALL` | `CALL` |
| `reportsColTrip` | `TRIP` | `TRIP` |
| `reportsColClass` | `CLASSE` | `CLASSE` |
| `reportsColFrom` | `FROM` | `DA` |
| `reportsColTo` | `TO` | `A` |
| `reportsColDur` | `DUR` | `DUR` |
| `reportsColPax` | `PAX` | `PAX` |
| `reportsColStatus` | `STATUS` | `STATO` |
| `reportsNoVehicle` | `No vehicle` | `Nessun veicolo` |
| **Bridge** | | |
| `bridgeTitle` | `⚓ Captain Bridge` | `⚓ Captain Bridge` |
| `bridgeDesc` | `Manage who accesses CaptainDispatch — approve pending users and control invite codes.` | `Gestisci chi accede a CaptainDispatch — approva gli utenti in attesa e controlla i codici invito.` |
| `bridgePendingTab` | `👥 Pending Users` | `👥 Utenti in Attesa` |
| `bridgeInvitesTab` | `🔑 Invite Codes` | `🔑 Codici Invito` |
| `bridgePendingUsers` | `Pending Users` | `Utenti in Attesa` |
| `bridgePendingDesc` | `Users who signed up and are waiting for access` | `Utenti che si sono registrati e aspettano l'accesso` |
| `bridgeInviteCodesTitle` | `Invite Codes` | `Codici Invito` |
| `bridgeAccessDenied` | `Access Denied` | `Accesso Negato` |
| `bridgeAccessDeniedDesc` | `Captain Bridge is only available to CAPTAIN and ADMIN users.` | `Captain Bridge è disponibile solo per utenti CAPTAIN e ADMIN.` |
| `bridgeBackDashboard` | `← Back to Dashboard` | `← Torna alla Dashboard` |
| `bridgeNoPending` | `No pending users` | `Nessun utente in attesa` |
| `bridgeNoPendingDesc` | `Everyone who signed up has been handled.` | `Tutti gli utenti registrati sono stati gestiti.` |
| `bridgeRefreshBtn` | `↺ Refresh` | `↺ Aggiorna` |
| `bridgeUsersWaiting` | `users waiting` | `utenti in attesa` |
| `bridgeSignedUp` | `Signed up` | `Registrato` |
| `bridgeSandboxBtn` | `✓ Sandbox` | `✓ Sandbox` |
| `bridgeAddToProdBtn` | `⊕ Add to prod` | `⊕ Aggiungi a produzione` |
| `bridgeIgnoreBtn` | `✕ Ignore` | `✕ Ignora` |
| `bridgeAddToProdTitle` | `⊕ Add to Production` | `⊕ Aggiungi a Produzione` |
| `bridgeAddToProdDesc` | `will be added with the selected role.` | `verrà aggiunto con il ruolo selezionato.` |
| `bridgeProductionLabel` | `Production` | `Produzione` |
| `bridgeRoleLabel` | `Role` | `Ruolo` |
| `bridgeAddUserBtn` | `✓ Add User` | `✓ Aggiungi Utente` |
| `bridgeAddingBtn` | `Adding…` | `Aggiungendo…` |
| `bridgeNewCodeBtn` | `+ New Code` | `+ Nuovo Codice` |
| `bridgeNewCodeTitle` | `🔑 New Invite Code` | `🔑 Nuovo Codice Invito` |
| `bridgeNoInvites` | `No invite codes yet` | `Nessun codice invito ancora` |
| `bridgeNoInvitesDesc` | `Create a code to let people join a specific production instantly.` | `Crea un codice per permettere alle persone di unirsi subito a una produzione.` |
| `bridgeCreateFirstCode` | `+ Create First Code` | `+ Crea Primo Codice` |
| `bridgeProdLabel` | `Production *` | `Produzione *` |
| `bridgeRoleAssignedLabel` | `Role assigned` | `Ruolo assegnato` |
| `bridgeCodeLabel` | `Code (blank = auto-generate)` | `Codice (vuoto = auto-genera)` |
| `bridgeLabelOptLabel` | `Label (optional)` | `Etichetta (opzionale)` |
| `bridgeMaxUsesLabel` | `Max uses (blank = unlimited)` | `Usi massimi (vuoto = illimitati)` |
| `bridgeExpiresLabel` | `Expires (blank = never)` | `Scadenza (vuoto = mai)` |
| `bridgeCreatingBtn` | `Creating…` | `Creando…` |
| `bridgeCreateCodeBtn` | `🔑 Create Code` | `🔑 Crea Codice` |
| `bridgePauseBtn` | `⏸ Pause` | `⏸ Pausa` |
| `bridgeEnableBtn` | `▶ Enable` | `▶ Abilita` |
| `bridgeUsesLabel` | `Uses:` | `Usi:` |
| `bridgeNoExpiry` | `No expiry` | `Nessuna scadenza` |
| `bridgeCreatedLabel` | `Created` | `Creato` |
| `bridgeHowWorksTitle` | `⚓ How Captain Bridge works` | `⚓ Come funziona Captain Bridge` |
| `bridgeDeleteConfirm` | `Delete this invite code?` | `Eliminare questo codice invito?` |
| **QR Codes** | | |
| `qrCodesTitle` | `📱 QR Codes` | `📱 QR Codes` |
| `qrVehicles` | `🚐 Veicoli` | `🚐 Veicoli` |
| `qrCrew` | `🎬 Crew` | `🎬 Crew` |
| `qrPrintBtn` | `🖨 Stampa / PDF` | `🖨 Stampa / PDF` |
| `qrHowToTitle` | `📱 Come usare Wrap Trip sul mobile` | `📱 Come usare Wrap Trip sul mobile` |
| `qrNoVehicles` | `Nessun veicolo trovato. Aggiungili in` | `Nessun veicolo trovato. Aggiungili in` |
| `qrNoCrewConfirmed` | `Nessun crew CONFIRMED trovato.` | `Nessun crew CONFIRMED trovato.` |
| `qrLoading` | `Caricamento…` | `Caricamento…` |
| **Lists** | | |
| `listsTitle` | `📋 Transport Lists` | `📋 Transport Lists` |
| `listsPrintBtn` | `🖨 Print / PDF` | `🖨 Stampa / PDF` |
| `listsEditHeader` | `⚙️ Edit Header` | `⚙️ Modifica Header` |
| `listsTodayBtn` | `Today` | `Oggi` |
| `listsNoTrips` | `No trips for` | `Nessun trip per` |
| `listsTripsCount` | `trips` | `trip` |
| `listsPaxCount` | `pax` | `pax` |
| `listsColTime` | `TIME` | `ORA` |
| `listsColCall` | `CALL` | `CALL` |
| `listsColVeh` | `VEH.` | `VEH.` |
| `listsColDriver` | `DRIVER` | `AUTISTA` |
| `listsColRoute` | `ROUTE & CREW` | `ROTTA & CREW` |
| `listsColPax` | `PAX` | `PAX` |
| `listsColCap` | `CAP` | `CAP` |
| `listsSectionTransport` | `🚌 TRANSPORT LIST` | `🚌 TRANSPORT LIST` |
| `listsSectionArrivals` | `✈ 🛬 TRAVEL LIST — ARRIVALS` | `✈ 🛬 TRAVEL LIST — ARRIVI` |
| `listsSectionDepartures` | `✈ 🛫 TRAVEL LIST — DEPARTURES` | `✈ 🛫 TRAVEL LIST — PARTENZE` |
| `listsConfidential` | `Confidential — Not for Distribution` | `Riservato — Non per distribuzione` |
| `listsGeneratedBy` | `Generated by CaptainDispatch` | `Generato da CaptainDispatch` |
| `listsNoActiveProd` | `No active production.` | `Nessuna produzione attiva.` |
| **Settings/Production** | | |
| `settingsTitle` | `⚙️ Production Settings` | `⚙️ Impostazioni Produzione` |
| `settingsDesc` | `These details appear in the Transport List header. All fields are optional except Production Name.` | `Questi dettagli appaiono nell'header del Transport List. Tutti i campi sono opzionali tranne il Nome Produzione.` |
| `settingsSaveBtn` | `💾 Save Production Settings` | `💾 Salva Impostazioni Produzione` |
| `settingsSavingBtn` | `Saving…` | `Salvataggio…` |
| `settingsSavedMsg` | `✅ Production settings saved successfully!` | `✅ Impostazioni produzione salvate!` |
| `settingsBackBtn` | `← Back to Productions` | `← Torna alle Produzioni` |
| `settingsTip` | `After saving, go to Transport Lists to see the header with all your production details.` | `Dopo il salvataggio, vai alle Transport Lists per vedere l'header con tutti i dettagli della produzione.` |
| `settingsNoProduction` | `No active production selected. Go to Productions and activate one first.` | `Nessuna produzione attiva selezionata. Vai alle Produzioni e attivane una prima.` |
| **ImportModal** | | |
| `importTitle` | `📂 Import from file` | `📂 Importa da file` |
| `importModeLabel` | `Import mode` | `Modalità importazione` |
| `importFleetMode` | `🚗 Fleet list` | `🚗 Lista flotta` |
| `importCrewMode` | `👥 Crew list` | `👥 Lista crew` |
| `importCustomMode` | `✏️ Custom instructions…` | `✏️ Istruzioni personalizzate…` |
| `importDragDrop` | `Drag & drop or click to browse` | `Trascina o clicca per sfogliare` |
| `importAccepted` | `Accepted: .xlsx, .xls, .csv, .pdf, .docx` | `Accettati: .xlsx, .xls, .csv, .pdf, .docx` |
| `importExtracting` | `Extracting data…` | `Estrazione dati…` |
| `importClaudeAnalyzing` | `Claude is analyzing your file` | `Claude sta analizzando il file` |
| `importSaving` | `Saving…` | `Salvataggio…` |
| `importDone` | `Import complete!` | `Importazione completata!` |
| `importCloseBtn` | `Close` | `Chiudi` |
| `importBackBtn` | `← Back` | `← Indietro` |
| `importCancelBtn` | `Cancel` | `Annulla` |
| `importConfirmBtn` | `✓ Confirm import` | `✓ Conferma importazione` |
| `importRowsFound` | `rows found` | `righe trovate` |
| `importNewLabel` | `new` | `nuovi` |
| `importUpdateLabel` | `update` | `aggiornamenti` |
| `importSkipLabel` | `skip` | `saltati` |
| `importNeedReview` | `need review` | `da rivedere` |
| `importNotRecognized` | `not recognized` | `non riconosciute` |
| `importRowsNotRecognized` | `rows not recognized` | `righe non riconosciute` |
| `importNewHotelsTitle` | `🏨 New hotels detected — not found in Locations` | `🏨 Nuovi hotel rilevati — non trovati nelle Location` |
| `importAddToLocations` | `+ Add to Locations` | `+ Aggiungi alle Location` |
| `importSkipHotel` | `Skip` | `Salta` |
| `importInserted` | `inserted` | `inseriti` |
| `importUpdated` | `updated` | `aggiornati` |
| `importSkipped` | `skipped` | `saltati` |
| `importLegendNew` | `✅ New` | `✅ Nuovo` |
| `importLegendDup` | `🔁 Duplicate` | `🔁 Duplicato` |
| `importLegendMissing` | `⚠️ Missing fields` | `⚠️ Campi mancanti` |
| `importLegendUnrecognized` | `❌ Not recognized` | `❌ Non riconosciuto` |
| **pending (fix residui)** | | |
| `pendingInviteLabel` | `🔑 Have an invite code?` | `🔑 Hai un codice invito?` |
| `pendingEnterBtn` | `→ Enter` | `→ Entra` |
| `pendingInvitePlaceholder` | `e.g. CREW-X7K2` | `es. CREW-X7K2` |
| `pendingJoinedMsg` | `Joined` | `Accesso a` |
| `pendingRedirectingMsg` | `Redirecting…` | `Reindirizzamento…` |
| **scan (fix residui)** | | |
| `scanHotelLabel` | `Hotel` | `Hotel` |
| `scanHotelStatus` | `Hotel Status` | `Stato Hotel` |
| `scanDriverLabel` | `👤 Driver` | `👤 Autista` |
| `scanSearchPlaceholder` | `Search…` | `Cerca…` |

---

### TASK 2 ✅ (30/03/26) — fleet/page.js

**Sostituzioni principali:**
- `import { useT } from '../../../lib/i18n'` + `const t = useT()` in `FleetPage` e `VehicleCard`
- `"Fleet Monitor"` → `t.fleetMonitorTitle`
- `"IN PROGRESS"` → `t.fleetInProgress`, `"NEXT TRIP"` → `t.fleetNextTrip`, `"LAST TRIP"` → `t.fleetLastTrip`
- `"No trips scheduled today"` → `t.fleetNoTripsToday`
- `"No active vehicles"` → `t.fleetNoActiveVehicles`
- `"→ Add vehicles on the Vehicles page"` → `t.fleetAddVehiclesHint`
- `"Loading Fleet Monitor…"` → `t.fleetLoadingLabel`
- `"Refresh"` → `t.fleetRefreshBtn`, `"Traffico"` → `t.fleetTrafficBtn`
- `"Today"` → `t.todayBtn` (chiave comune già esistente)
- `"LEGEND"` → `t.fleetLegendTitle`
- `"Trips without vehicle"` → `t.fleetTripsWithoutVehicle`
- `"Assign →"` → `t.fleetAssignLink`
- `"Dropoff done — returning"` → `t.fleetReturning`
- `"trips today"` → `t.fleetTripsToday`
- `"Start"`, `"End"` → `t.fleetStartLabel`, `t.fleetEndLabel`
- `"total pax"` → `t.fleetTotalPax`
- `"Viewing:"` → `t.fleetViewingDate`

> ⚠️ NON tradurre: `'BUSY'`, `'FREE'`, `'IDLE'`, `'DONE'`, `'ARRIVAL'`, `'DEPARTURE'`, `'STANDARD'`, `'Wrap'`, `'Charter'`, valori numerici, ID veicoli.

---

### TASK 3 — reports/page.js  🔄 PROSSIMO

**Sostituzioni principali:**
- `import { useT } from '../../../lib/i18n'` + `const t = useT()` in `ReportsPage`
- `"Fleet Reports"` → `t.reportsTitle`
- `"Daily"` / `"Weekly"` → `t.reportsDaily` / `t.reportsWeekly`
- `"Print / PDF"` → `t.reportsPrintBtn`
- `"No trips for this period"` → `t.reportsNoTrips`
- `"DAILY TOTAL"` → `t.reportsDailyTotal`
- `"VEHICLE"` → `t.reportsWeeklyVehicle`
- `"No vehicles with trips this week"` → `t.reportsWeeklyNoVehicles`
- `"TOTAL / DAY"` → `t.reportsTotalPerDay`
- `"Printed:"` → `t.reportsPrinted`
- Colonne `"CALL"`, `"TRIP"`, `"CLASSE"`, `"FROM"`, `"TO"`, `"DUR"`, `"PAX"`, `"STATUS"` → rispettive chiavi
- `"Today"` → `t.todayBtn`
- `"No vehicle"` → `t.reportsNoVehicle`
- `"trip count"` → `t.reportsColTrip`

---

### TASK 4 — bridge/page.js

**Sostituzioni principali:**
- `import { useT } from '../../../lib/i18n'` + `const t = useT()` in `BridgePage`, `PendingUsersTab`, `InviteCodesTabControlled`, `AddToProductionModal`
- `"⚓ Captain Bridge"` → `t.bridgeTitle`
- `"Manage who accesses…"` → `t.bridgeDesc`
- Tab labels, section headers, stati, bottoni → rispettive chiavi `bridge*`
- `"No pending users"` → `t.bridgeNoPending`
- `"No invite codes yet"` → `t.bridgeNoInvites`
- `"Delete this invite code?"` → `t.bridgeDeleteConfirm` (nella `confirm()`)

---

### TASK 5 — qr-codes/page.js

**Sostituzioni principali:**
- `import { useT } from '../../../lib/i18n'` + `const t = useT()` in `QrCodesPage`
- `"📱 QR Codes"` → `t.qrCodesTitle`
- Tab labels veicoli/crew → `t.qrVehicles` / `t.qrCrew`
- `"🖨 Stampa / PDF"` → `t.qrPrintBtn`
- `"📱 Come usare Wrap Trip…"` → `t.qrHowToTitle`
- `"Caricamento…"` → `t.loading` (chiave comune)
- `"Nessun veicolo trovato…"` → `t.qrNoVehicles`
- `"Nessun crew CONFIRMED trovato."` → `t.qrNoCrewConfirmed`

---

### TASK 6 — lists/page.js

**Sostituzioni principali:**
- `import { useT } from '../../../lib/i18n'` + `const t = useT()` in `ListsPage`
- `"📋 Transport Lists"` → `t.listsTitle`
- `"🖨 Print / PDF"` → `t.listsPrintBtn`
- `"⚙️ Edit Header"` → `t.listsEditHeader`
- `"Today"` → `t.todayBtn`
- `"No trips for"` → `t.listsNoTrips`
- Colonne TIME, CALL, VEH., DRIVER, ROUTE & CREW, PAX, CAP → chiavi `listsCols*`
- Section headers TRANSPORT LIST, ARRIVALS, DEPARTURES → `t.listsSectionTransport` ecc.
- Footer: `"Confidential"`, `"Generated by CaptainDispatch"` → chiavi `listsConfidential`, `listsGeneratedBy`
- `"No active production."` → `t.listsNoActiveProd`
- `"Loading…"` → `t.loading`

> ⚠️ Il contenuto della `TransportListHeader` (Director, Producer, ecc.) usa dati dal DB, non stringhe UI — non tradurre. Tradurre solo label interfaccia toolbar e footer.

---

### TASK 7 — settings/production/page.js

**Sostituzioni principali:**
- `import { useT } from '../../../../lib/i18n'` + `const t = useT()` in `ProductionSettingsPage`
- `"⚙️ Production Settings"` → `t.settingsTitle`
- `"These details appear in…"` → `t.settingsDesc`
- `"💾 Save Production Settings"` → `t.settingsSaveBtn`
- `"Saving…"` → `t.settingsSavingBtn`
- `"✅ Production settings saved successfully!"` → `t.settingsSavedMsg`
- `"← Back to Productions"` → `t.settingsBackBtn`
- `"💡 Tip: After saving…"` → `t.settingsTip`
- `"⚠️ No active production selected…"` → `t.settingsNoProduction`
- Label sezioni e campi form → riusa chiavi già presenti in S17 (`productionsNameLabel`, `productionsDirectorLabel`, ecc.)
- `"📁 Upload Logo"` → `t.productionsUploadLogo`
- `"PNG, JPG, SVG — max 2 MB"` → `t.productionsLogoHint`

---

### TASK 8 — lib/ImportModal.js

**Sostituzioni principali:**
- `import { useT } from '../lib/i18n'` (path relativo da lib/) + `const t = useT()` in `ImportModal`
- Header `"📂 Import from file"` → `t.importTitle`
- `"Import mode"` → `t.importModeLabel`
- Mode buttons `"🚗 Fleet list"`, `"👥 Crew list"`, `"✏️ Custom instructions…"` → chiavi `importFleetMode`, ecc.
- `"Drag & drop or click to browse"` → `t.importDragDrop`
- `"Accepted: .xlsx…"` → `t.importAccepted`
- `"Extracting data…"` → `t.importExtracting`
- `"Claude is analyzing your file"` → `t.importClaudeAnalyzing`
- `"Saving…"` → `t.importSaving`
- `"Import complete!"` → `t.importDone`
- Bottoni Close, ← Back, Cancel, Confirm → chiavi `import*Btn`
- Banner stats e legenda → chiavi `import*`
- `"New hotels detected"` → `t.importNewHotelsTitle`

> ⚠️ `useT()` è un hook React — `ImportModal` è già `'use client'` quindi ok.

---

### TASK 9 — pending/page.js (fix residui invite section)

**Sostituzioni:**
- `"🔑 Have an invite code?"` → `t.pendingInviteLabel`
- `placeholder="e.g. CREW-X7K2"` → `placeholder={t.pendingInvitePlaceholder}`
- `"→ Enter"` (button) → `t.pendingEnterBtn`
- `` `✅ Joined **${inviteSuccess}**! Redirecting…` `` → `` `✅ ${t.pendingJoinedMsg} **${inviteSuccess}**! ${t.pendingRedirectingMsg}` ``

---

### TASK 10 — scan/page.js (fix residui label hardcoded)

**Sostituzioni in `CrewCard` e `VehicleCard`:**
- `"Hotel"` label → `t.scanHotelLabel`
- `"Hotel Status"` label → `t.scanHotelStatus`
- `"👤 Driver"` label → `t.scanDriverLabel`
- `"Search…"` placeholder in `PickerModal` → `t.scanSearchPlaceholder`

---

> ⚠️ **wrap-trip/page.js** — mobile app, BASSA PRIORITÀ. Non incluso in S18. Da fare come S19 separato se necessario.

---

## Bug Aperti

| Bug | Stato | Note |
|-----|-------|------|
| BUG-1: Multi-stop DEPARTURE pickup times uguali | ✅ Fix S15 TASK 1 | Routing sequenziale A→B→Hub |
| BUG-2: Sibling non eliminato a rimozione ultimo pax | 🔍 Debug | Log `[removePax]` in console. Ipotesi: RLS blocca DELETE. Fix potenziale: `CREATE POLICY "Allow delete own production trips" ON trips FOR DELETE USING (production_id = current_setting('app.production_id', true)::uuid)` |

---

## TODO

- [ ] Rocket → export PDF piano generato
- [ ] Dark mode

---

## Regole Fondamentali

```
❌ write_to_file su file esistenti → replace_in_file chirurgico
❌ Hardcodare coordinate/colonne/numeri magici
❌ Riscrivere interi file per aggiustamenti
❌ Modificare rotte Source=MANUAL negli script
❌ Sovrascrivere Travel_Status manuale con automazioni
❌ Crashare TripCard se vehicle è null → null guard obbligatorio
✅ Leggere codice esistente prima di modificarlo
✅ JavaScript (non TypeScript), Tailwind CSS, App Router
✅ Testare su localhost (npm run dev) prima del deploy
✅ Deploy dopo OGNI modifica
```
