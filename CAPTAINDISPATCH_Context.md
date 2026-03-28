# CAPTAIN — Contesto Ridotto

**Aggiornato: 28 marzo 2026 (S10 — Rocket Complete + Multi-Production ✅ | S11 — Push PWA 🔔 TASK 1 ✅ TASK 2 ✅ TASK 3 ✅ TASK 4 ✅)**

---

> 🚀 **AZIONE IMMEDIATA: Quando leggi questo context, avvia subito `npm run dev` per testare in localhost!**

---

## Stack Tecnico

```
Next.js 16.2.1 (App Router, JavaScript)
Supabase (PostgreSQL + Auth + Realtime)
Vercel (hosting) — deploy: git push origin master → auto-deploy ~1-2 min
GitHub: DanieleContino/captaindispatch (branch: master)
```

**Credenziali:**
- GitHub: DanieleContino (danielsanuk@googlemail.com)
- Supabase: captaindispatch (Project ID: lvxtvgxyancpegvfcnsk, West EU)

> ⚠️ **REGOLA: fare deploy dopo OGNI modifica.** `git add . && git commit -m "..." && git push origin master`
> Shell default: **CMD** (non PowerShell) — usare `&&` per concatenare comandi.

---

## Pagine Completate ✅

| Pagina | Note |
|--------|------|
| `/login` | OAuth Google |
| `/dashboard` | Card + alert arrivi/partenze domani + Navbar con toggle lingua ✅ |
| `/dashboard/fleet` | Fleet Monitor realtime |
| `/dashboard/trips` | Multi-stop indicators, Assign integration, i18n |
| `/dashboard/crew` | Anagrafica + Travel_Status, i18n |
| `/dashboard/vehicles` | Fleet con pax_suggested/max, i18n |
| `/dashboard/locations` | Google Places Autocomplete + Map Picker |
| `/dashboard/rocket` | Rocket Trip Generator v2 — completo (TASK 1-7) ✅ |
| `/dashboard/lists` | Transport Lists print-optimized (A4 landscape) |
| `/dashboard/pax-coverage` | Pax Coverage + Assign integration, i18n |
| `/dashboard/hub-coverage` | Hub Coverage + Assign integration, i18n |
| `/dashboard/productions` | Multi-production switcher — CRUD + logo upload (Supabase Storage `production-logos`) + activate ✅ |
| `/dashboard/reports` | Fleet Reports Daily & Weekly — ore lavorate, pax, stampa PDF ✅ |
| `/dashboard/qr-codes` | Generazione QR per veicoli e crew, print-ready ✅ |
| `/dashboard/settings/production` | Edit dettagli produzione (header transport list, logo) ✅ |
| `/wrap-trip` | App mobile 4-step |
| `/pending` | Approvazione login con polling + box invite code ✅ |
| `/scan` | Scanner QR |
| `/dashboard/bridge` | ⚓ Captain Bridge — Pending Users + Invite Codes (solo CAPTAIN/ADMIN) ✅ |

**API completate:**
- `/api/auth/callback`, `/api/check-approval`
- `/api/route-duration`, `/api/cron/arrival-status`, `/api/cron/refresh-routes-traffic`
- `/api/places/autocomplete`, `/api/places/details`, `/api/places/map`
- `/api/bridge/pending-users` (GET) — lista utenti in attesa di approvazione
- `/api/bridge/approve-user` (POST) — approva utente con sandbox o produzione
- `/api/bridge/invites` (GET/POST/PATCH/DELETE) — CRUD invite codes
- `/api/invites/redeem` (POST) — riscatta invite code dalla pagina `/pending`
- `/api/productions` (GET/POST/PATCH) — CRUD produzioni + logo_url
- `/api/qr/resolve` (GET) — risoluzione QR code (VH:xxx / CR:xxx → dati veicolo/crew)
- `/api/routes/refresh-traffic` (POST) — trigger manuale aggiornamento traffico Google (dal Fleet Monitor)
- `/api/routes/traffic-check` (GET) — check stato rotte con traffico
- `/api/routes/refresh-location` (POST) — aggiornamento singola rotta
- `/api/rocket/templates` (GET/POST/DELETE) — CRUD template Rocket su Supabase
- `/api/rocket/suggestions` (GET) — suggerimenti statistici basati su run storici
- `/api/cron/daily-briefing` (GET/cron) — push 07:00 UTC: riepilogo arrivi+partenze domani per CAPTAIN/ADMIN di ogni produzione

---

## i18n Multilingua ✅ COMPLETA (TASK 1-4)

> 🌍 **CaptainDispatch è BILINGUE: Inglese 🇬🇧 (EN) e Italiano 🇮🇹 (IT).**
> Ogni nuova feature, label, messaggio o testo UI **deve avere la traduzione in entrambe le lingue** in `lib/i18n.js`.
> NON aggiungere mai stringhe di testo hardcoded in inglese o italiano — usare SEMPRE `useT()` con la chiave i18n corrispondente.

- `lib/i18n.js` — traduzioni EN+IT + hook `useT()` + `LanguageProvider`
- `app/providers.jsx` + `app/layout.tsx` — wrapping
- `lib/navbar.js` — toggle 🇬🇧 EN / 🇮🇹 IT + componente `<Navbar>` riutilizzabile
- Tutte le pagine dashboard usano `<Navbar currentPath="..." />` e `useT()`

**Pattern Navbar:** `<Navbar currentPath="/dashboard/xxx" />` — include nav links + toggle lingua + sign out

**Build fix:** Qualsiasi pagina che usa `useSearchParams()` deve wrappare il componente principale in `<Suspense fallback={null}>`.

---

## Logiche Core

### Transfer_Class
```
pickup = HUB → ARRIVAL | dropoff = HUB → DEPARTURE | nessun HUB → STANDARD
```

### Calcolo Tempi Trip
```
ARRIVAL:   Call = Arr_Time, Pickup_Time = Call
DEPARTURE: Call = Arr_Time - 120min, Pickup_Time = Call - Duration
STANDARD:  Call manuale, Pickup_Time = Call - Duration
ROCKET:    Call = effectiveCallMin, Pickup_Time = Call - Duration
```

### Travel_Status Crew
```
IN = in arrivo (ARRIVAL trip) | OUT = in partenza (DEPARTURE trip) | PRESENT = default
Automazione: ARRIVAL completato → IN → PRESENT (trigger 5min)
Manuale VINCE sempre sull'automatico
```

### Login Approval (S7c)
- `app/auth/callback/route.js` → verifica `user_roles` → `/dashboard` o `/pending` (polling 3sec)
- `lib/sendLoginNotification.js` — Gmail SMTP via nodemailer
- Env vars: `GMAIL_USER`, `GMAIL_APP_PASSWORD`, `ADMIN_EMAIL`, `GOOGLE_MAPS_API_KEY`

### Pattern Assign: Coverage → Trips (S7l)
URL params da pax/hub-coverage verso trips: `?assignCrewId=&assignCrewName=&assignHotelId=&assignTS=&assignDate=`
- Banner amber in trips, highlight trip compatibili con badge ⭐ MATCH
- `suggestedBaseIds` filtra per hotel + ts (IN→ARRIVAL dropoff, OUT→DEPARTURE pickup, PRESENT→STANDARD pickup)

### Multi-Production Switcher
- `lib/production.js` — `getProductionId()` e `switchProduction(id)` — leggono/scrivono active production in localStorage
- Ogni pagina dashboard usa `getProductionId()` per filtrare i dati della produzione attiva
- `/dashboard/productions` — lista produzioni + activate + create + edit + logo upload
- `/dashboard/settings/production` — edit dettagli produzione (header transport list)

### Rocket Trip Generator v2 — Completo (TASK 1-7)
- Input: crew PRESENT+CONFIRMED, veicoli attivi, routeMap, globalDestId, globalCallMin, overrides
- Raggruppa per (hotel_id, effectiveDest, effectiveCallMin) → assegna greedy fino a pax_suggested
- Trip ID: `R_MMDD_NN` (singolo) / `R_MMDD_NNA`, `R_MMDD_NNB` (multi-stop)

**Feature completate:**
- **TASK 1 (28/03/26)** — Routing sequenziale multi-pickup DEPARTURE: pickup in cascata Hotel A → Hotel B → Hub invece che in parallelo
- **TASK 2 (28/03/26)** — Durata stimata trip in Step 2: durata in minuti + orario previsto arrivo a destinazione
- **TASK 3 (28/03/26)** — Template localStorage: salvataggio automatico ultima config, banner "reload last run", gestione template con nome
- **TASK 4 (28/03/26)** — Template Supabase (`rocket_templates`): condivisibili tra Transportation Captain della stessa produzione; separazione visiva template locali vs condivisi
- **TASK 5 (28/03/26)** — Memoria storica/suggerimenti: API `rocket/suggestions`, hint statistici Step 1 basati su pattern run storici (no AI, solo frequenze); attivo dopo 10-15 run storici
- **TASK 6 (28/03/26)** — Quick-reason esclusione veicolo: dropdown motivazioni predefinite + campo libero; reason visibile nel riepilogo Step 3
- **TASK 7 (28/03/26)** — Service type per singola destinazione: override per dest nel pannello destinazioni Step 1; gerarchia individuale > dipartimento > globale

### Captain Bridge (S9)
- Accesso esclusivo a utenti con ruolo `CAPTAIN` o `ADMIN` (verificato lato API)
- **Tab Pending Users** — lista utenti che hanno fatto login ma non hanno ancora `user_roles`
  - ✓ Sandbox: crea produzione isolata per l'utente
  - ⊕ Add to prod: aggiunge l'utente a una produzione esistente con ruolo scelto
  - ✕ Ignore: nasconde dalla lista (senza azione DB)
- **Tab Invite Codes** — CRUD codici invito per produzione
  - Codice uppercase 8 char (es. `ABCD-1234`), unico case-insensitive
  - Parametri: `role`, `max_uses` (null=illimitato), `expires_at` (null=mai), `active`
  - Counter `uses_count` incrementato ad ogni riscatto
- **Pending page** — box "Have an invite code?" → `POST /api/invites/redeem`
  - Riscatto: valida codice, verifica expiry+max_uses, inserisce `user_roles`, redirect dashboard

> ⚠️ **IMPORTANTE:** Le query su `production_invites` usano **join manuale** (non PostgREST relationship)
> per evitare l'errore `schema cache` di Supabase. Pattern:
> ```js
> const { data: invites } = await supabase.from('production_invites').select('*')...
> const { data: prods }   = await supabase.from('productions').select('id, name').in('id', prodIds)
> const prodMap = Object.fromEntries(prods.map(p => [p.id, p]))
> const enriched = invites.map(inv => ({ ...inv, productions: prodMap[inv.production_id] }))
> ```

---

## Notifiche Push PWA — S11 (in progress 🔔)

### Panoramica
Web Push API + Service Worker + Supabase. Affianca (non sostituisce) il sistema email Gmail SMTP.

**Env vars da aggiungere** (`.env.local` + Vercel):
```
VAPID_PUBLIC_KEY=...    ← generare con: npx web-push generate-vapid-keys
VAPID_PRIVATE_KEY=...
VAPID_EMAIL=mailto:danielsanuk@googlemail.com
```

**Compatibilità:**
- Chrome/Edge/Firefox desktop ✅ | Android Chrome ✅ | iOS Safari 16.4+ (solo PWA installata) ✅

### Dipendenze tra TASK
```
TASK 1 (infrastruttura) ──▶ TASK 2 (UI Navbar)
                        ──▶ TASK 3 (eventi real-time)
                        ──▶ TASK 4 (cron daily)
```

### TASK 1 — Infrastruttura Base [ ]
> *Fondamenta: SW, subscription API, utility server*

**File da creare:**
- `npm install web-push` — pacchetto server
- `scripts/migrate-push-subscriptions.sql` — tabella Supabase
- `public/sw.js` — Service Worker: gestisce `push` event + `notificationclick`
- `lib/webpush.js` — utility server: `sendPushToProduction(productionId, payload)`
- `app/api/push/subscribe/route.js` — POST: salva subscription `{ endpoint, p256dh, auth }`
- `app/api/push/unsubscribe/route.js` — DELETE: rimuove subscription per endpoint
- `app/api/push/send/route.js` — POST interno: invia push a tutti device di una produzione

**Schema SQL:**
```sql
CREATE TABLE push_subscriptions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  production_id UUID REFERENCES productions(id) ON DELETE CASCADE,
  endpoint      TEXT NOT NULL,
  p256dh        TEXT NOT NULL,
  auth          TEXT NOT NULL,
  created_at    TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, endpoint)
);
-- RLS: ogni utente gestisce solo le proprie subscription
CREATE POLICY "Users manage own push subscriptions" ON push_subscriptions
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
```

**Output verificabile:** dal browser console si può iscrivere e ricevere un push di test via `/api/push/send`.

---

### TASK 2 — UI Toggle Notifiche in Navbar [ ]
> *L'utente abilita/disabilita le notifiche con 🔔/🔕 in Navbar*

**File da creare/modificare:**
- `lib/useNotifications.js` — hook React: stato permesso, `subscribe()`, `unsubscribe()`
- `lib/navbar.js` — aggiungere icona 🔔/🔕 accanto al toggle lingua

**Pattern hook:**
```js
const { supported, permission, subscribed, subscribe, unsubscribe } = useNotifications()
// permission: 'default' | 'granted' | 'denied'
// subscribed: bool (subscription salvata su Supabase)
```

**Output verificabile:** click 🔔 in Navbar → browser chiede permesso → subscription salvata su Supabase.

---

### TASK 3 — Notifiche Real-Time (eventi utente) ✅
> *Push istantanei su eventi già esistenti nel sistema*

**File da modificare:**
- `app/auth/callback/route.js` → dopo `sendLoginNotification()`, push a CAPTAIN/ADMIN: `"👤 Nuovo utente in attesa: email@..."`
- `app/api/bridge/approve-user/route.js` → push all'utente approvato: `"✅ Il tuo accesso a CaptainDispatch è stato approvato!"`

**Notifiche:**

| Evento | Destinatari | Testo |
|--------|------------|-------|
| Nuovo login pending | CAPTAIN + ADMIN della produzione | 👤 Nuovo utente in attesa: `email` |
| Utente approvato | L'utente stesso | ✅ Accesso approvato! Vai al dashboard |

**Output verificabile:** approvare utente da Bridge → utente riceve push sul suo device.

---

### TASK 4 — Notifiche Cron (daily briefing) ✅
> *Push schedulate ogni mattina + alert traffico*

**File da creare/modificare:**
- `app/api/cron/daily-briefing/route.js` — legge arrivi/partenze di domani per ogni produzione → invia push a CAPTAIN+ADMIN
- `vercel.json` → aggiungere: `{ "path": "/api/cron/daily-briefing", "schedule": "0 7 * * *" }`
- `app/api/cron/refresh-routes-traffic/route.js` → aggiungere push se rotte con traffico > soglia

**Notifiche:**

| Evento | Orario | Testo |
|--------|--------|-------|
| Daily briefing | 07:00 ogni giorno | 🛬 3 arrivi + 🛫 2 partenze domani |
| Traffico anomalo | 05:00 (cron esistente) | ⚠️ Traffico su `N` rotte — verifica Fleet Monitor |

**Output verificabile:** cron trigger manuale → push ricevuto con lista crew.

---

## Database Schema (Supabase)

```sql
productions (id, name, slug, logo_url,
  director, producer,
  production_manager, production_manager_phone,
  production_coordinator, production_coordinator_phone,
  transportation_coordinator, transportation_coordinator_phone,
  transportation_captain, transportation_captain_phone,
  production_office_phone,
  set_location, set_address, basecamp,
  general_call_time, shoot_day, revision),
user_roles,
locations (is_hub bool),
routes (duration_min, google_duration_min, traffic_updated_at),
crew (hotel_id, travel_status, hotel_status, arrival_date, departure_date, department),
vehicles (capacity, pax_suggested, pax_max, driver_name, sign_code, active),
trips (pickup_id, dropoff_id, call_min, pickup_min, start_dt, end_dt, service_type, status, terminal),
trip_passengers, service_types,
production_invites (code, label, role, max_uses, uses_count, expires_at, active, created_by)
  → FK: production_id → productions(id) ON DELETE CASCADE
  → UNIQUE INDEX su UPPER(code)
  → RLS: solo CAPTAIN/ADMIN della produzione possono gestire i propri invite
rocket_templates (id, production_id, name, config_json, created_by, created_at)
  → FK: production_id → productions(id) ON DELETE CASCADE
  → RLS: tutti i membri della produzione possono gestire i template condivisi
RLS abilitato su tutte le tabelle
```

---

## BUG APERTI

### BUG-1 — Multi-stop DEPARTURE: pickup times uguali tra leg ✅ Fix completo — TASK 1 — 28 marzo 2026
- **Fix implementato:** routing sequenziale in cascata (Hotel A → Hotel B → Hub) invece che parallelo
- **Fix UI precedente:** badge `⚠ no route` in TripRow + sezione "SIBLING LEGS" con input duration in EditTripSidebar (rimane come fallback)
- **Root cause risolta:** calcolo pickup ora è `Pickup B = call - dur(B→Hub)`, `Pickup A = Pickup B - dur(A→B)`

### BUG-2 — Sibling non eliminato quando si rimuove l'ultimo pax
- **Stato:** Debug aggiunto (`console.log` + error handling in `removePax`), causa non confermata da test
- **Ipotesi:** RLS blocca DELETE su `trips`, oppure `crew.trip_row_id` non impostato
- **Debug:** DevTools → Console → osservare log `[removePax]`
- **Fix RLS potenziale:**
```sql
CREATE POLICY "Allow delete own production trips" ON trips
  FOR DELETE USING (production_id = current_setting('app.production_id', true)::uuid);
```

---

## TODO — Priorità

### P3
- [ ] Rocket — export PDF del piano generato
- [ ] ~~Notifiche push PWA~~ → **S11 in progress** — vedi sezione "Notifiche Push PWA — S11" sopra (TASK 1-4)
- [ ] Dark mode

---

## Regole Fondamentali

```
❌ NON usare write_to_file su file esistenti → replace_in_file chirurgico
❌ NON hardcodare coordinate/colonne/numeri magici
❌ NON riscrivere interi file per aggiustamenti
❌ NON modificare rotte Source=MANUAL negli script
❌ NON sovrascrivere Travel_Status manuale con automazioni
❌ NON crashare TripCard se vehicle è null → null guard obbligatorio
✅ Leggere SEMPRE il codice esistente prima di modificarlo
✅ JavaScript (non TypeScript), Tailwind CSS, App Router
✅ Testare su localhost (npm run dev) prima del deploy
✅ Deploy dopo OGNI modifica
```
