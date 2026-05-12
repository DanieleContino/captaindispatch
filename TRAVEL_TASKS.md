# Travel — Piano Implementazione: Colonne Configurabili
### CaptainDispatch · Creato: 12 Maggio 2026

> Ogni task va eseguito in una **conversazione separata** per restare entro i limiti di contesto.
> Per iniziare un task, apri una nuova chat e scrivi: *"Implementa TASK TV-N di TRAVEL_TASKS.md"*

---

## Ordine di esecuzione consigliato

```
TASK TV-1 → (esegui SQL in Supabase) → TASK TV-2 → TASK TV-3
```

---

## 🟥 TASK TV-1 — DB Migration: tabella `travel_columns`

**Priorità: Alta (prerequisito)**
**Status: [x] DONE — commit `3195194` (12 May 2026)**

### Obiettivo
Creare la tabella Supabase che persiste la configurazione delle colonne di `/dashboard/travel` per produzione.

### File da creare
- `scripts/migrate-travel-columns.sql`

### SQL da eseguire in Supabase
```sql
CREATE TABLE IF NOT EXISTS travel_columns (
  id             UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  production_id  TEXT NOT NULL,
  source_field   TEXT NOT NULL,
  header_label   TEXT NOT NULL,
  width          TEXT NOT NULL DEFAULT '110px',
  display_order  INTEGER DEFAULT 10,
  created_at     TIMESTAMPTZ DEFAULT now(),
  updated_at     TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_travel_columns_production
  ON travel_columns(production_id);

-- RLS (opzionale ma consigliato)
ALTER TABLE travel_columns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "production members can manage travel columns"
  ON travel_columns USING (true) WITH CHECK (true);
```

### Note
- `production_id` è TEXT (non UUID) per coerenza con le altre tabelle del progetto
- Una riga per colonna per produzione
- `display_order` multipli di 10 (10, 20, 30…)

---

## 🟧 TASK TV-2 — Catalog + Sidebar

**Priorità: Media (prerequisito di TV-3)**
**Status: [x] DONE — commit `3195194` · fix `95d9660` (12 May 2026)**

### Obiettivo
Creare il catalog dei campi disponibili e il sidebar editor per aggiungere/riordinare/ridimensionare le colonne di Travel — identico nel funzionamento al `ColumnsEditorSidebar` di Lists.

### File da creare

#### 1. `lib/travelColumnsCatalog.js`
Esporta:
- `TRAVEL_COLUMNS_CATALOG` — object con 13 chiavi, ogni entry ha `label` e `defaultWidth`
- `TRAVEL_DEFAULT_PRESET` — array di 13 colonne nell'ordine corretto

**I 13 campi disponibili:**
| source_field | header_label | defaultWidth |
|---|---|---|
| `direction` | Dir | 52px |
| `full_name` | Name | 130px |
| `crew_role` | Role | 80px |
| `pickup_dep` | p/up dep | 90px |
| `from_location` | From | 80px |
| `from_time` | Dep | 56px |
| `to_location` | To | 80px |
| `to_time` | Arr | 56px |
| `travel_number` | Travel # | 76px |
| `pickup_arr` | p/up arr | 90px |
| `needs_transport` | 🚐 | 38px |
| `notes` | Notes | 120px |
| `match_status` | Match | 44px |

#### 2. `lib/TravelColumnsEditorSidebar.js`
Sidebar con:
- Lista colonne attive con drag & drop (`@dnd-kit/core` + `@dnd-kit/sortable`)
- Pulsante "Reset to Default Preset"
- Form per aggiungere/modificare colonne (select campo + header label + width)
- Persistenza in Supabase tabella `travel_columns`

Deve essere molto simile a `lib/ColumnsEditorSidebar.js` (già esistente per Lists), adattato per:
- Usare `travel_columns` invece di `transport_list_columns`
- Usare `TRAVEL_COLUMNS_CATALOG` / `TRAVEL_DEFAULT_PRESET`
- Select semplice (senza categoria grouping)

### Dipendenze
- TV-1 (tabella `travel_columns` in Supabase)
- `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities` (già installati)

---

## 🟨 TASK TV-3 — Refactor `travel/page.js`

**Priorità: Media**
**Status: [x] DONE — commit `3195194` (12 May 2026)**

### Obiettivo
Rendere la tabella di `/dashboard/travel` completamente data-driven: le colonne visibili, il loro ordine e la loro larghezza sono configurati tramite `TravelColumnsEditorSidebar` e persistiti in DB.

### File da modificare
`app/dashboard/travel/page.js`

### Cambiamenti richiesti

#### 1. Imports aggiuntivi
```js
import { TravelColumnsEditorSidebar } from '../../../lib/TravelColumnsEditorSidebar'
import { TRAVEL_COLUMNS_CATALOG, TRAVEL_DEFAULT_PRESET } from '../../../lib/travelColumnsCatalog'
```

#### 2. Nuovo stato nel componente principale
```js
const [columnsConfig, setColumnsConfig] = useState([])
const [columnsEditorOpen, setColumnsEditorOpen] = useState(false)
const [applyingPreset, setApplyingPreset] = useState(false)
```

#### 3. Caricamento `columnsConfig`
In un `useEffect` separato (o nella funzione `loadData`):
```js
const { data } = await supabase
  .from('travel_columns')
  .select('*')
  .eq('production_id', PRODUCTION_ID)
  .order('display_order', { ascending: true })
setColumnsConfig(data || [])
```

#### 4. Toolbar — aggiungere pulsanti
- **"Columns"** → `setColumnsEditorOpen(true)`
- **"Apply Default Preset"** (visibile solo se `columnsConfig.length === 0`) → inserisce `TRAVEL_DEFAULT_PRESET` in DB

#### 5. Content area
- Rimuovere `maxWidth: '1100px'` → lasciare `padding: '16px 24px'` senza maxWidth vincolante (o `maxWidth: '100%'`)

#### 6. Refactor `SectionTable`

**Props aggiuntive:** `columnsConfig`

**Tabella:**
- Rimuovere `overflowX: 'auto'` dal wrapper
- Aggiungere `table-layout: 'fixed'` e `width: '100%'`
- Aggiungere `<colgroup>` generato da `columnsConfig` + colonna fissa Edit (38px)

**Thead dinamico:**
```jsx
<tr>
  {columnsConfig.map(col => <th key={col.source_field}>{col.header_label}</th>)}
  <th></th> {/* Edit */}
</tr>
```

**Tbody — funzione `renderCell(col, m, ctx)`:**
Switch su `col.source_field` che restituisce la `<td>` corretta:
- `direction` → badge IN/OUT (statico)
- `full_name` → nome (statico)
- `crew_role` → ruolo (statico)
- `pickup_dep`, `from_location`, `to_location`, `travel_number`, `pickup_arr`, `notes` → `<EditableCell>` (tipi text/time/textarea)
- `from_time`, `to_time` → `<EditableCell type="time">`
- `needs_transport` → `<NeedsTransportCell>`
- `match_status` → ✅/❌ (statico)

**Colonna Edit fissa come ultima:**
```jsx
<td style={{ padding: '4px 6px', background: bgColor, width: '38px', textAlign: 'right' }}>
  <button onClick={() => onEditRow(m)}>✎</button>
</td>
```

**Celle di testo:** aggiungere `overflow: 'hidden'`, `textOverflow: 'ellipsis'`, `whiteSpace: 'nowrap'`

#### 7. Aggiungere `TravelColumnsEditorSidebar` nel render
```jsx
<TravelColumnsEditorSidebar
  open={columnsEditorOpen}
  onClose={() => setColumnsEditorOpen(false)}
  onChanged={() => loadColumnsConfig()}
/>
```

### Dipendenze
- TV-1 (tabella `travel_columns`)
- TV-2 (`TravelColumnsEditorSidebar`, `travelColumnsCatalog`)

### Note importanti
- Se `columnsConfig.length === 0` → mostrare placeholder con bottone "Apply Default Preset" invece della tabella vuota
- Il sistema di colori cella (right-click → color picker) rimane invariato
- Il sistema di sidebar Edit `MovementSidebar` rimane invariato
- La colonna Edit (`✎`) NON è parte della config: è sempre ultima e fissa

---

## Riepilogo file

| File | Task | Tipo |
|---|---|---|
| `scripts/migrate-travel-columns.sql` | TV-1 | Nuovo |
| `lib/travelColumnsCatalog.js` | TV-2 | Nuovo |
| `lib/TravelColumnsEditorSidebar.js` | TV-2 | Nuovo |
| `app/dashboard/travel/page.js` | TV-3 | Modifica |
| `CAPTAINDISPATCH_Context.md` | TV-3 | Aggiornamento |
