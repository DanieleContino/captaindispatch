# CAPTAIN — Contesto Ridotto

**Aggiornato: 28 marzo 2026 (S9 — Captain Bridge ✅)**

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
| `/dashboard/rocket` | Rocket Trip Generator v2 |
| `/dashboard/lists` | Transport Lists print-optimized (A4 landscape) |
| `/dashboard/pax-coverage` | Pax Coverage + Assign integration, i18n |
| `/dashboard/hub-coverage` | Hub Coverage + Assign integration, i18n |
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

---

## i18n Multilingua ✅ COMPLETA (TASK 1-4)

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

### Rocket Trip Generator v2
- Input: crew PRESENT+CONFIRMED, veicoli attivi, routeMap, globalDestId, globalCallMin, overrides
- Raggruppa per (hotel_id, effectiveDest, effectiveCallMin) → assegna greedy fino a pax_suggested
- Trip ID: `R_MMDD_NN` (singolo) / `R_MMDD_NNA`, `R_MMDD_NNB` (multi-stop)

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

## Database Schema (Supabase)

```sql
productions, user_roles,
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
RLS abilitato su tutte le tabelle
```

---

## BUG APERTI

### BUG-1 — Multi-stop DEPARTURE: pickup times uguali tra leg
- **Fix UI fatto:** badge `⚠ no route` in TripRow + sezione "SIBLING LEGS" con input duration in EditTripSidebar
- **Root cause a monte:** rotta Hotel B → Hub mancante in `routes` → sibling creato con `pickup_min = null`
- **Workflow fix:** EditTripSidebar → sezione SIBLING LEGS → inserire duration manuale → Save

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

### P1
- [ ] **SIBLING SEQUENTIAL ROUTING** — pickup sequenziale per DEPARTURE multi-PKP
  - Attuale: ogni hotel calcola `pickup = call - duration_to_hub` indipendentemente → pickup identici se equidistanti
  - Corretto: Hotel A → Hotel B → Hub in sequenza (stagger pickup)
  - Soluzioni: (1) route operative con deviazioni incluse, (2) UI input duration sibling (rimesso in EditTripSidebar), (3) routing sequenziale auto con inter-hotel routes

### P2
- [ ] Crew page — edit Travel_Status in-row
- [ ] Multi-produzione (production switcher)
- [ ] Rocket — durata stimata per ogni trip (Step 2)
- [ ] `/dashboard/reports` — Fleet reports
- [ ] `/dashboard/qr-codes` — Generazione QR
- [ ] `/dashboard/productions` — Multi-produzione UI

### P3
- [ ] Rocket — quick-reason esclusione veicolo, service type per dest, export PDF
- [ ] Notifiche push PWA
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
