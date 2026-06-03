# Trip Warnings — Missing Flight/Return
### CaptainDispatch · Creato: 3 Giugno 2026

> Ogni task va eseguito in una **conversazione separata** per restare entro i limiti di contesto.
> Per iniziare un task, apri una nuova chat e scrivi:
> *"Implementa TASK TW-N di TASK_tripWarnings_missing_flight.md"*

---

## Contesto

Il sistema ha già `lib/tripWarnings.js` con `computeCrewWarnings(movements, stays)` che genera warning
`IN_BEFORE_CHECKIN` e `OUT_AFTER_CHECKOUT`. Questi warning appaiono in 4 pagine:
`crew/page.js`, `travel/page.js`, `accommodation/page.js`, `bridge/page.js` (TravelWidget + AccommodationWidget).

**Problema:** Se una crew ha uno stay in hotel ma non ha un volo/treno/OA di rientro registrato,
nessun warning viene mostrato. Stesso per arrivo mancante.

**Esclusioni:** crew con `is_local=true` o `no_transport_needed=true` vanno escluse dai nuovi warning.
Il filtro avviene **prima** di chiamare `computeCrewWarnings`, nelle singole pagine.

---

## Ordine di esecuzione

```
TASK TW-1 → TASK TW-2 → TASK TW-3 → TASK TW-4 (+ push finale)
```

---

## 🟥 TASK TW-1 — `lib/tripWarnings.js`: 2 nuovi warning types

**Status: [x] DONE — 3 Giugno 2026**

### Obiettivo
Aggiungere 2 nuovi warning types a `computeCrewWarnings`:
- `MISSING_RETURN_FLIGHT`: crew ha uno stay con `departure_date` ma ZERO movimenti `direction=OUT`
- `MISSING_ARRIVAL_FLIGHT`: crew ha uno stay con `arrival_date` ma ZERO movimenti `direction=IN`

### Logica da aggiungere (dopo il loop `for (const m of movements)`)

```js
// ── MISSING_RETURN_FLIGHT / MISSING_ARRIVAL_FLIGHT ──────────────────────────
// Per ogni crew che ha almeno uno stay, verifica se mancano movimenti IN o OUT
for (const [crewUuid, crewStays] of Object.entries(staysByCrew)) {
  const crewMovements = (movements || []).filter(m => m.crew_id === crewUuid)
  const hasOUT = crewMovements.some(m => m.direction === 'OUT')
  const hasIN  = crewMovements.some(m => m.direction === 'IN')

  // MISSING_RETURN_FLIGHT: ha stay con departure_date ma nessun OUT
  if (!hasOUT) {
    const stayWithDep = crewStays.find(s => s.departure_date)
    if (stayWithDep) {
      addWarning(crewUuid, 'MISSING_RETURN_FLIGHT',
        `Nessun rientro registrato — check-out hotel il ${stayWithDep.departure_date}. Aggiungi volo/treno/OA di rientro o verifica la data di check-out.`
      )
    }
  }

  // MISSING_ARRIVAL_FLIGHT: ha stay con arrival_date ma nessun IN
  if (!hasIN) {
    const stayWithArr = crewStays.find(s => s.arrival_date)
    if (stayWithArr) {
      addWarning(crewUuid, 'MISSING_ARRIVAL_FLIGHT',
        `Nessun arrivo registrato — check-in hotel il ${stayWithArr.arrival_date}. Aggiungi volo/treno/OA di arrivo o verifica la data di check-in.`
      )
    }
  }
}
```

### Note
- Il warning viene generato anche se la crew non ha movimenti affatto (array vuoto)
- Un solo warning per tipo per crew (il primo stay trovato con la data)
- Il filtro is_local/NTN avviene nelle pagine, NON qui
- "Va con la macchina" → il TC registra `direction=OUT, travel_type=OA` → warning sparisce

### Commit
```
feat(tripWarnings): add MISSING_RETURN_FLIGHT and MISSING_ARRIVAL_FLIGHT warnings
```

---

## 🟧 TASK TW-2 — `crew/page.js`: filtro is_local/NTN

**Status: [x] DONE — 3 Giugno 2026**

### Obiettivo
Filtrare gli stays passati a `computeCrewWarnings` escludendo i crew_id di crew con
`is_local=true` o `no_transport_needed=true`.

### File da modificare
`app/dashboard/crew/page.js`

### Dove
In `loadCrew()` (circa riga 1786), sostituire:
```js
setWarningsMap(computeCrewWarnings(travelData || [], staysData || []))
```

Con:
```js
// Escludi stays di crew is_local o no_transport_needed dai nuovi warning
const excludedCrewIds = new Set(
  (vData || [])
    .filter(c => c.is_local || c.no_transport_needed)
    .map(c => c.uuid)
)
const filteredStaysForWarnings = (staysData || []).filter(s => !excludedCrewIds.has(s.crew_id))
setWarningsMap(computeCrewWarnings(travelData || [], filteredStaysForWarnings))
```

### Note
- `vData` è già disponibile in `loadCrew()` (contiene tutti i campi crew inclusi `is_local` e `no_transport_needed`)
- I warning `IN_BEFORE_CHECKIN` e `OUT_AFTER_CHECKOUT` esistenti non sono influenzati (si basano sui movimenti, non sugli stays)

### Commit
```
feat(crew/page): filter is_local/NTN stays before computeCrewWarnings
```

---

## 🟨 TASK TW-3 — `travel/page.js` e `accommodation/page.js`: filtro is_local/NTN

**Status: [x] DONE — 3 Giugno 2026**

### Obiettivo
Filtrare gli stays passati a `computeCrewWarnings` in entrambe le pagine.

### File 1: `app/dashboard/travel/page.js`

In `loadData()` (circa riga 1440-1450), sostituire:
```js
const crewIds = [...new Set(movData.filter(m => m.crew_id).map(m => m.crew_id))]
if (crewIds.length > 0) {
  const { data: staysData } = await supabase
    .from('crew_stays')
    .select('crew_id, arrival_date, departure_date')
    .eq('production_id', PRODUCTION_ID)
    .in('crew_id', crewIds)
  setWarningsMap(computeCrewWarnings(movData, staysData || []))
} else {
  setWarningsMap({})
}
```

Con:
```js
const crewIds = [...new Set(movData.filter(m => m.crew_id).map(m => m.crew_id))]
if (crewIds.length > 0) {
  const [{ data: staysData }, { data: crewFlagsData }] = await Promise.all([
    supabase
      .from('crew_stays')
      .select('crew_id, arrival_date, departure_date')
      .eq('production_id', PRODUCTION_ID)
      .in('crew_id', crewIds),
    supabase
      .from('crew')
      .select('uuid, is_local, no_transport_needed')
      .eq('production_id', PRODUCTION_ID)
      .in('uuid', crewIds),
  ])
  const excludedIds = new Set(
    (crewFlagsData || []).filter(c => c.is_local || c.no_transport_needed).map(c => c.uuid)
  )
  const filteredStays = (staysData || []).filter(s => !excludedIds.has(s.crew_id))
  setWarningsMap(computeCrewWarnings(movData, filteredStays))
} else {
  setWarningsMap({})
}
```

### File 2: `app/dashboard/accommodation/page.js`

In `loadData()` (circa riga 1985-1995), sostituire:
```js
const crewIds = [...new Set(staysData.filter(s => s.crew_id).map(s => s.crew_id))]
if (crewIds.length > 0) {
  const { data: movData } = await supabase
    .from('travel_movements')
    .select('crew_id, travel_date, direction')
    .eq('production_id', PRODUCTION_ID)
    .in('crew_id', crewIds)
  setWarningsMap(computeCrewWarnings(movData || [], staysData))
} else {
  setWarningsMap({})
}
```

Con:
```js
const crewIds = [...new Set(staysData.filter(s => s.crew_id).map(s => s.crew_id))]
if (crewIds.length > 0) {
  const [{ data: movData }, { data: crewFlagsData }] = await Promise.all([
    supabase
      .from('travel_movements')
      .select('crew_id, travel_date, direction')
      .eq('production_id', PRODUCTION_ID)
      .in('crew_id', crewIds),
    supabase
      .from('crew')
      .select('uuid, is_local, no_transport_needed')
      .eq('production_id', PRODUCTION_ID)
      .in('uuid', crewIds),
  ])
  const excludedIds = new Set(
    (crewFlagsData || []).filter(c => c.is_local || c.no_transport_needed).map(c => c.uuid)
  )
  const filteredStays = staysData.filter(s => !excludedIds.has(s.crew_id))
  setWarningsMap(computeCrewWarnings(movData || [], filteredStays))
} else {
  setWarningsMap({})
}
```

### Commit
```
feat(travel,accommodation): filter is_local/NTN before computeCrewWarnings
```

---

## 🟩 TASK TW-4 — `bridge/page.js`: filtro is_local/NTN + Push finale

**Status: [x] DONE — 3 Giugno 2026**

### Obiettivo
Filtrare gli stays in TravelWidget e AccommodationWidget prima di `computeCrewWarnings`.

### File da modificare
`app/dashboard/bridge/page.js`

### TravelWidget (circa riga 795-848)

Nel `.then(async ([...])` di `Promise.all`, dopo aver ottenuto `staysData` e `allMatchedMovs`,
aggiungere query crew flags e filtrare prima di `computeCrewWarnings`:

Sostituire:
```js
const wMap = computeCrewWarnings(allMatched, staysData || [])
setWarningsMap(wMap)
```

Con:
```js
// Filtra stays per is_local/NTN
const allCrewIds = [...new Set(allMatched.filter(m => m.crew_id).map(m => m.crew_id))]
let filteredStaysForWarnings = staysData || []
if (allCrewIds.length > 0) {
  const { data: crewFlagsData } = await supabase
    .from('crew')
    .select('uuid, is_local, no_transport_needed')
    .eq('production_id', productionId)
    .in('uuid', allCrewIds)
  const excludedIds = new Set(
    (crewFlagsData || []).filter(c => c.is_local || c.no_transport_needed).map(c => c.uuid)
  )
  filteredStaysForWarnings = (staysData || []).filter(s => !excludedIds.has(s.crew_id))
}
const wMap = computeCrewWarnings(allMatched, filteredStaysForWarnings)
setWarningsMap(wMap)
```

### AccommodationWidget (circa riga 1122-1135)

Nel `.then(([...])`, dopo aver ottenuto `staysData` e `allMatchedMovs`,
aggiungere query crew flags e filtrare prima di `computeCrewWarnings`:

Sostituire:
```js
const wMap = computeCrewWarnings(allMatched, staysData || [])
setWarningsMap(wMap)
```

Con:
```js
// Filtra stays per is_local/NTN
const allCrewIds = [...new Set(allMatched.filter(m => m.crew_id).map(m => m.crew_id))]
let filteredStaysForWarnings = staysData || []
if (allCrewIds.length > 0) {
  const { data: crewFlagsData } = await supabase
    .from('crew')
    .select('uuid, is_local, no_transport_needed')
    .eq('production_id', productionId)
    .in('uuid', allCrewIds)
  const excludedIds = new Set(
    (crewFlagsData || []).filter(c => c.is_local || c.no_transport_needed).map(c => c.uuid)
  )
  filteredStaysForWarnings = (staysData || []).filter(s => !excludedIds.has(s.crew_id))
}
const wMap = computeCrewWarnings(allMatched, filteredStaysForWarnings)
setWarningsMap(wMap)
```

### Commit
```
feat(bridge): filter is_local/NTN before computeCrewWarnings in TravelWidget and AccommodationWidget
```

### Push finale
```
git push
```

---

## Riepilogo file modificati

| File | Task | Tipo |
|---|---|---|
| `lib/tripWarnings.js` | TW-1 | Modifica |
| `app/dashboard/crew/page.js` | TW-2 | Modifica |
| `app/dashboard/travel/page.js` | TW-3 | Modifica |
| `app/dashboard/accommodation/page.js` | TW-3 | Modifica |
| `app/dashboard/bridge/page.js` | TW-4 | Modifica |
| `TASK_tripWarnings_missing_flight.md` | — | Nuovo |
