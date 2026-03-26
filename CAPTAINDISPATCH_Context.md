# CAPTAIN — Contesto Ridotto

**Aggiornato: 26 marzo 2026 (S7d)**

---

## Stack Tecnico

```
Next.js 16.2.1 (App Router, JavaScript)
Supabase (PostgreSQL + Auth + Realtime)
Vercel (hosting)
GitHub: DanieleContino/captaindispatch
```

**Credenziali:**
- GitHub: DanieleContino (email: danielsanuk@googlemail.com)
- Vercel: danielecontino
- Supabase: captaindispatch (Project ID: lvxtvgxyancpegvfcnsk, West EU)

**Deploy:** `vercel --prod` da `c:\Users\WKS\Desktop\captaindispatch`

---

## Pagine Completate ✅

| Pagina | Stato |
|--------|-------|
| `/login` | OAuth Google funzionante |
| `/dashboard` | Card arrivi/partenze + alert |
| `/dashboard/fleet` | Fleet Monitor realtime |
| `/dashboard/trips` | Multi-stop indicators (S7) |
| `/dashboard/crew` | Anagrafica + Travel_Status |
| `/dashboard/vehicles` | Fleet con pax_suggested/max |
| `/dashboard/rocket` | Rocket Trip Generator v2 (LIVE) |
| `/wrap-trip` | App mobile 4-step (LIVE) |
| `/pending` | Approvazione login con polling |
| `/dashboard/lists` | Transport Lists print-optimized (S7d) |

**API completate:**
- `/api/auth/callback` — OAuth callback
- `/api/check-approval` — verifica approvazione login
- `/api/route-duration` — calcolo durata con traffico
- `/api/cron/arrival-status` — trigger 5min ARRIVAL→PRESENT
- `/api/cron/refresh-routes-traffic` — cron 5AM refresh rotte

---

## Pagine da Fare 🚧

| Pagina | Priorità | Note |
|--------|----------|-------|
| `/dashboard/locations` | P2 | Gestione locations + coordinate |
| `/dashboard/hub-coverage` | P2 | Copertura hub |
| `/dashboard/pax-coverage` | P2 | Copertura pax |
| `/dashboard/reports` | P2 | Fleet reports |
| `/dashboard/qr-codes` | P2 | Generazione QR |
| `/dashboard/productions` | P2 | Multi-produzione |
| `/scan` | P3 | Scanner QR |

---

## Rocket Trip Generator v2 — Algoritmo

**Input:** crew PRESENT + CONFIRMED, veicoli attivi, routeMap, globalDestId, globalCallMin, deptDestOverrides, crewCallOverrides, excludedVehicleIds

**Logica:**
1. Per ogni crew: calcola `effectiveDest` e `effectiveCallMin` (priorità: crew override → dept override → global)
2. Raggruppa per (hotel_id, effectiveDest, effectiveCallMin)
3. Ordina crew per dept, poi nome
4. Assegna greedy fino a `pax_suggested`, overflow → CAN_ADD, no vehicle → NO_VEHICLE
5. Trip ID: `R_MMDD_NN` (singolo) / `R_MMDD_NNA`, `R_MMDD_NNB` (multi-stop)

**Bug fix S7:**
- travel_status: query crew usa solo PRESENT (non IN/OUT)
- Phantom unassigned trip cards: bordo rosso + "NO VEHICLE — use Move ›"
- TripCard null guard: vehicle null non crasha
- handleConfirm: salta trip senza veicolo
- MoveCrewModal: filtra trip unassigned

---

## Trips Page — Multi-Stop Indicators (S7)

**Problema:** Trip Rocket multi-stop (es. `R_0326_01A` + `R_0326_01B`) apparivano separati.

**Soluzione:**
- Helper `baseTripId(id)` — strip lettera finale
- Raggruppamento per `baseTripId + vehicle_id`
- Badge 🔀 MULTI-PKP (arancione) e 🔀 MULTI-DRP (viola)
- Route column espansa: leg-by-leg con pickup time e pax count
- TIME mostra pickup più presto del gruppo

---

## Database Supabase — Schema

```sql
productions, user_roles, locations (is_hub bool), routes (duration_min, google_duration_min, traffic_updated_at),
crew (hotel_id, travel_status, hotel_status, arrival_date, departure_date, department),
vehicles (capacity, pax_suggested, pax_max, driver_name, sign_code, active),
trips (pickup_id, dropoff_id, call_min, pickup_min, start_dt, end_dt, service_type, status),
trip_passengers, service_types

RLS abilitato su tutte le tabelle
```

---

## Decisioni Importanti

### Transfer_Class
```
pickup = HUB → ARRIVAL
dropoff = HUB → DEPARTURE
nessun HUB → STANDARD
```

### Calcolo Tempi Trip
```
ARRIVAL:  Call = Arr_Time, Pickup_Time = Call (driver già all'hub)
DEPARTURE: Call = Arr_Time - 120min, Pickup_Time = Call - Duration
STANDARD: Call manuale, Pickup_Time = Call - Duration
ROCKET: Call = effectiveCallMin, Pickup_Time = Call - Duration
```

### Travel_Status Crew
```
IN = crew in arrivo (ARRIVAL trip)
OUT = crew in partenza (DEPARTURE trip)
PRESENT = default

Automazioni:
- Trigger 5min: ARRIVAL completato → IN → PRESENT
- onOpen: Departure_Date = domani → dialog OUT
- Manuale VINCE sempre sull'automatico
```

### Login Approval System (S7c)
- Installato `nodemailer` per Gmail SMTP
- `lib/sendLoginNotification.js` — invia email notifica
- `app/auth/callback/route.js` — verifica ruolo in `user_roles`
- Se approvato → `/dashboard`, se no → `/pending` (polling 3sec)
- Env vars: `GMAIL_USER`, `GMAIL_APP_PASSWORD`, `ADMIN_EMAIL`
- ⚠️ TODO: Aggiungere env vars su Vercel Dashboard

### Transport Lists Print-Optimized (S7d)
- Layout adattivo: ≤20 trip → card dettagliate | >20 trip → tabella compatta
- Stampa A4 landscape con `@page { size: A4 landscape; margin: 10mm; }`
- Compact layout: 7 colonne (TIME | TRIP ID | VEHICLE | DRIVER | DROPOFF(S) | PAX | CAP)
- Dropoff multipli concatenati con " + " per trip multi-stop
- Pax totali = somma di tutti i dropoff per trip
- Font 10px, spacing ottimizzato, colori mantenuti per sezioni
- Supporta 50+ trip su poche pagine mantenendo leggibilità

---

## TODO — Priorità

### P1 (Prossima sessione)
```
[ ] Aggiungere env vars su Vercel (GMAIL_USER, GMAIL_APP_PASSWORD, ADMIN_EMAIL)
[ ] Trips page — pax_count totale per gruppo multi-stop (ora mostra solo primo sub-trip)
[ ] Rocket — crew call time override nella tabella Step 1
```

### P2
```
[ ] Trips page — creazione trip manuale (date default, auto trip_id)
[ ] Trips page — assegnazione pax/veicolo inline
[ ] Crew page — edit Travel_Status in-row
[ ] Multi-produzione (production switcher)
[ ] Rocket — Step 2: durata stimata per ogni trip
```

### P3
```
[ ] Rocket — quick-reason esclusione veicolo
[ ] Rocket — service type per destinazione
[ ] Rocket — export PDF pianificazione
[ ] Production View (report-only)
[ ] Notifiche push PWA
[ ] Dark mode
```

---

## Regole Fondamentali

```
❌ NON usare getDisplayValues() per coordinate → getValues()
❌ NON hardcodare coordinate nelle funzioni Maps
❌ NON usare deleteRow() in loop → bulk rewrite
❌ NON modificare rotte Source=MANUAL negli script
❌ NON impostare "Reject input" su Service_Type → "Show warning"
❌ NON copiare conditional formatting nel template
❌ NON fare rebuild completo nel trigger onEdit
❌ NON hardcodare numeri di colonna → getHeaderMap_()
❌ NON usare coordinate terminal aeroportuale per ORS
❌ NON sovrascrivere Travel_Status manuale con automazioni
❌ NON includere crew IN/OUT in run Rocket STANDARD
❌ NON crashare TripCard se vehicle è null → null guard obbligatorio
```

---

## Preferenze Lavoro con Cline

- Vai avanti senza chiedere conferma a ogni passo
- Fermati solo se trovi qualcosa di genuinamente strano
- Leggi SEMPRE il codice esistente prima di modificarlo
- Analizza i dati reali prima di scrivere codice
- Spiega decisioni importanti ma sii conciso
- JavaScript (non TypeScript), Tailwind CSS, App Router
- Usa `claude-sonnet-4-6` con thinking per problemi complessi
- Manuale VINCE sempre sull'automatico per Travel_Status
