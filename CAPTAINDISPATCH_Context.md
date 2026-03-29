# CAPTAIN — Context

**Aggiornato: 29 marzo 2026 | S17 — i18n Rocket + Productions (in corso) | commit 2352e4f**

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

### TASK 2 — Rocket i18n (rocket/page.js) — 🔄 IN CORSO (commit 2352e4f)

**Stato:**
- ✅ `lib/i18n.js` — 80+ chiavi Rocket aggiunte EN+IT (blocco `// ── Rocket page ──`)
- ✅ `app/dashboard/rocket/page.js` — `import { useT } from '../../../lib/i18n'` aggiunto
- ❌ Wiring `const t = useT()` + `t.xxx` nei sottocomponenti → **prossima sessione**

**Sottocomponenti da aggiornare (in ordine):**
1. `CrewQuickEditModal` — `const t = useT()` + sostituire: `Include in run`, `✅ Included`, `☐ Excluded`, `Call Time`, `↩ Reset`, `✓ Done`
2. `MoveCrewModal` — `Move passenger`, `↩ Remove from all trips`, `Cancel`, `Move →`
3. `TripCard` — `NO VEHICLE — use Move ›`, `No driver`, `auto-split on confirm`, `🏁 all arrive`, `No passengers`, `Move ›`
4. `LastRunBanner` — `Reload last run?`, `↩ Load`, `Dismiss`
5. `TemplatesPanel` — `📋 Templates`, `Save current configuration`, `💾 Save locally`, `☁️ Share with team`, `☁️ Shared with team`, `💾 Local`, `No shared templates yet.`, `No local templates yet.`, `· visible to all Captains`, `· stored on this device only`
6. `SuggestionsHint` — `Historical Suggestions`, `hints based on past`, `runs`, `Apply`, `Include`
7. `RocketPage` — tutti i label: config, fleet, crew, step buttons, stats bar, Step 3 summary

> ⚠️ Fare max 3 replace_in_file SEARCH/REPLACE per chiamata. Ogni sottocomponente richiede `const t = useT()` come prima riga del body.

**Chiavi già presenti in `lib/i18n.js`** (blocco `// ── Rocket page ──`):

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
      department, no_transport_needed bool DEFAULT false)
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
