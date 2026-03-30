# CAPTAIN — Context

**Aggiornato: 30 marzo 2026 | S25 ✅ completato — tutte 11 pagine migrate a getProductionId()**

> 🧠 Edit chirurgici per bug isolati, riscrittura completa per problemi sistemici.
> 🚀 Avvio: `npm run dev` | Shell: **CMD** (`&&` per concatenare, non PowerShell)
> ❌ `write_to_file` su file esistenti → usare sempre `replace_in_file`

---

## ▶ PROSSIMO — S26: Export/Archive Produzione

### S26 — Export/Archive Produzione
- API `GET /api/productions/export?id=...`
- Scarica JSON completo: production + crew + vehicles + locations + routes + trips + trip_passengers + service_types + rocket_templates
- Nome file: `captaindispatch-{slug}-{YYYY-MM-DD}.json`
- Solo CAPTAIN/ADMIN
- Pulsante `📥 Export` su ogni production card in `productions/page.js`

---

### S27 — Delete Production (dopo S26)
- API `DELETE /api/productions` — verifica ruolo CAPTAIN/ADMIN, service client, CASCADE elimina tutto
- Modal confirm in `productions/page.js`:
  - Warning dettagliato dati che verranno eliminati
  - Link/pulsante download archive (S26)
  - Checkbox "ho scaricato l'archivio"
  - Input: digita il nome per confermare
  - Bottone rosso Delete abilitato solo se nome corretto
- Dopo delete: se era produzione attiva → `clearProductionOverride()` → redirect `/dashboard/productions`

---

### S18 — i18n Completamento (IN SOSPESO — riprendere dopo S25-S27)
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

**API:** auth `callback/check-approval` | cron `arrival-status/refresh-routes-traffic/daily-briefing` | places `autocomplete/details/map` | bridge `pending-users/approve-user/invites` | invites `redeem` | productions CRUD | qr `resolve` | routes `refresh-traffic/traffic-check/refresh-location` | rocket `templates/suggestions` | push `subscribe/unsubscribe/send` | import `parse/confirm`

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

**Rocket v2:** crew PRESENT+CONFIRMED+!NTN, veicoli attivi, raggruppa per (hotel_id, effectiveDest, effectiveCallMin) → greedy fino a pax_suggested. Trip ID: `R_MMDD_NN`. Multi-stop routing sequenziale A→B→Hub. Templates localStorage + Supabase `rocket_templates`. Suggerimenti statistici dopo 10-15 run. Service type per singola destinazione.

**NTN/Self Drive:** `crew.no_transport_needed = true` → esclusi da Rocket + coperture, badge `🚐 SD`, sezione separata in Pax Coverage, aggiungibili come SD nei Trips.

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
      arrival_date, departure_date, email TEXT, phone TEXT, no_transport_needed bool DEFAULT false)
vehicles (id TEXT PK, capacity, pax_suggested, pax_max, driver_name, sign_code,
          active, available_from, available_to, vehicle_type, license_plate)
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

---

## Bug Aperti

| Bug | Stato | Note |
|-----|-------|------|
| BUG-2: Sibling non eliminato a rimozione ultimo pax | 🔍 Debug | Ipotesi RLS blocca DELETE. Fix: aggiungere policy `FOR DELETE` su `trips`. |

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
