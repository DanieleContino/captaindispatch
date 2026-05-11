# 🔍 Code Audit Report — CaptainDispatch
**Data:** 11/05/2026 | **Strumento:** ESLint + analisi manuale  
**Totale:** 79 ERRORI · 126 WARNING · 43 file con problemi

---

## 🔴 ERRORI CRITICI (rompono il codice o il comportamento)

### 1. Componenti React definiti durante il render — `crew/page.js`
**Regola:** `react-hooks/static-components`  
**Righe:** L463 (`StayForm`), L729 (`MovForm`)

I componenti `StayForm` e `MovForm` sono funzioni definite **dentro** la funzione `AccommodationAccordion` e `TravelAccordion`. React li ricrea ad ogni render → perdono il proprio stato locale ad ogni aggiornamento.  
**Fix:** spostare le definizioni fuori dai componenti padre, a livello di modulo.

---

### 2. Variabile usata prima della dichiarazione — `lists/page.js`
**Regola:** `react-hooks/immutability`  
**Riga:** L463

```js
// L463: usa una variabile non ancora dichiarata (hoisting temporale)
```
Può causare `ReferenceError` a runtime in certi percorsi di esecuzione.

---

### 3. `setState` sincrono dentro `useEffect` — multipli file
**Regola:** `react-hooks/set-state-in-effect`  
**File colpiti:** `bridge/page.js` (×9), `crew/page.js` (×6), `trips/page.js` (×5), `vehicles/page.js`, `locations/page.js`, `hub-coverage/page.js`, `pax-coverage/page.js`, `reports/page.js`, `settings/page.js`, `qr-codes/page.js`, `scan/page.js`, `navbar.js`, `i18n.js`, `SectionsManagerSidebar.js`

Chiamare `setState` direttamente nel corpo di un effect (non in un callback) innesca **render a cascata**. Esempio tipico:

```js
// ❌ SBAGLIATO
useEffect(() => {
  setProductionId(getProductionId())   // setState sincrono nel body
}, [])

// ✅ CORRETTO — usare un inizializzatore di stato o lo stesso argomento
const [productionId] = useState(() => getProductionId())
```

---

### 4. Funzione impura chiamata durante il render — `bridge/page.js`
**Regola:** `react-hooks/purity`  
**Riga:** L1024

```js
// ❌ SBAGLIATO — Date.now() è impuro, dà risultati diversi ad ogni render
const rocketUrl = `/dashboard/rocket?date=${new Date(Date.now() + 86400000)...}`

// ✅ CORRETTO — spostare in useMemo o useCallback
const rocketUrl = useMemo(() => `/dashboard/rocket?date=...`, [])
```

---

### 5. `require()` nelle API routes (App Router) — multipli file
**Regola:** `@typescript-eslint/no-require-imports`  
**File + righe:**
- `api/import/parse/route.js` → L267, L273, L279, L446, L1178
- `api/import/sheets/route.js` → L42
- `scripts/import-from-sheets.js` → L23-L26
- `scripts/migrate-productions-v2.js` → L5
- `scripts/migrate-tl-header-footer.js` → L5
- `scripts/refresh-all-routes.js` → L14-L15
- `scripts/run-migration-v2.js` → L5
- `scripts/setup-productions.js` → L5

Le API routes Next.js (App Router) usano ES Modules. I `require()` dinamici per `xlsx`, `pdf-parse`, `mammoth` possono causare errori di bundling in certi ambienti (Vercel Edge, turbopack). I file script Node vanno bene con `require`, ma gli API routes andrebbero migrati a `import` dinamico:
```js
// ✅ CORRETTO
const XLSX = await import('xlsx').then(m => m.default || m)
```

---

### 6. Espressioni inutilizzate (no-op silenzioso) — multipli file
**Regola:** `@typescript-eslint/no-unused-expressions`  
**File + righe:**
- `bridge/page.js` → L181
- `crew/page.js` → L299
- `rocket/page.js` → L1573, L1609, L2176

```js
// Esempio da bridge/page.js L181 — espressione valutata ma risultato scartato
s.has(crewId) ? s.delete(crewId) : s.add(crewId)
// (probabilmente manca `return` o `setChecked(...)`)
```
Questi no-op silenziosi **non fanno nulla**: il codice appare corretto ma non ha effetto.

---

## 🟡 WARNING IMPORTANTI (code smell / potenziali bug)

### 7. Dipendenze mancanti in `useEffect`/`useCallback`
**Regola:** `react-hooks/exhaustive-deps`  
**Occorrenze:** ~25 warning in tutti i file dashboard

La mancanza di dipendenze nel dependency array causa **stale closures**: il hook cattura valori vecchi di variabili come `PRODUCTION_ID`, `router`, `loadData`.  

File più colpiti:
| File | Dipendenze mancanti |
|------|---------------------|
| `trips/page.js` | `EMPTY`, `PRODUCTION_ID`, `assignCtx.*`, `group`, `initial`, `loadPaxData` |
| `crew/page.js` | `PRODUCTION_ID`, `router`, `initial?.id`, `mode` |
| `fleet/page.js` | `PRODUCTION_ID`, `router` |
| `hub-coverage/page.js` | `PRODUCTION_ID`, `router`, `days` |
| `pax-coverage/page.js` | `PRODUCTION_ID`, `router`, `days` |
| `vehicles/page.js` | `PRODUCTION_ID`, `router`, `EMPTY`, `vehicles` |
| `reports/page.js` | `PRODUCTION_ID`, `weekDays` |

---

### 8. Variabili/funzioni assegnate ma mai usate
**Regola:** `@typescript-eslint/no-unused-vars`  

| File | Simbolo inutilizzato | Riga |
|------|----------------------|------|
| `bridge/page.js` | `EasyAccessShortcuts` (componente definito ma mai renderizzato!) | L474 |
| `bridge/page.js` | `InviteCodesTab` (componente duplicato → rimpiazzato da `InviteCodesTabControlled`) | L1737 |
| `bridge/page.js` | `user`, `inviteCount`, `setInviteCount`, `pendingCount`, `setPendingCount`, `editingId`, `editSaving`, `editErr`, `setEF`, `openEdit`, `handleSaveEdit` | varie |
| `rocket/page.js` | `locMap`, `allTrips`, `getCrewEffectiveDest` | L559, L688, L1616 |
| `import/parse/route.js` | `SYSTEM_PROMPT_TRAVEL` (prompt definito ma non usato — dead code) | L209 |
| `lists-v2/page.js` | `minToHHMM`, `formatCrewName`, `sectionColor` | L17, L34, L87 |
| `fleet/page.js` | `dtFromPickup` (funzione definita ma mai chiamata) | L79 |
| `HeaderFooterEditorSidebar.js` | `BLOCKS_CATALOG` importato ma non usato | L14 |
| `tlTemplatesDb.js` | `nextOrderInZone`, `_` | L14, L420 |
| `api/routes/compute-chain/route.js` | `firstDropoffId`, `callMin` | L180, L385 |
| `api/places/map/route.js` | `NextResponse` importato ma non usato | L1 |
| `api/auth/google/connect/route.js` | `response` (creato poi non usato) | L80 |
| `wrap-trip/page.js` | `icon`, `tick` | L99, L193 |

---

### 9. `<img>` HTML invece di `<Image />` Next.js
**Regola:** `@next/next/no-img-element`  
**File + righe:**
- `bridge/page.js` → L1644
- `lists/page.js` → L321
- `productions/page.js` → L441, L493, L558, L605
- `settings/production/page.js` → L205
- `BlockConfigForms.js` → L477
- `tlBlocksCatalog.js` → L110

Next.js ottimizza le immagini solo via `<Image />`. L'uso di `<img>` puro rallenta il LCP e non sfrutta la CDN di Vercel.

---

### 10. Entità HTML non escaped nel JSX
**Regola:** `react/no-unescaped-entities`  
**File:** `crew/page.js`, `settings/page.js`, `qr-codes/page.js`, `lists-v2/page.js`, `BlockConfigForms.js`, `ImportModal.js`

Usare `"` e `'` dentro il testo JSX può causare warning e ambiguità. Sostituire con `&quot;`, `&apos;`, `&ldquo;`, `&rdquo;`.

---

## 🟠 DEAD CODE — Codice mai utilizzato

### 11. `SYSTEM_PROMPT_TRAVEL` — `api/import/parse/route.js` L209
Un prompt Claude completo (50+ righe) definito ma **mai passato a `callClaude()`**. Il mode `travel` usa `parseTravelCalendarDIG()` direttamente senza Claude. Può essere rimosso.

### 12. `EasyAccessShortcuts` — `bridge/page.js` L474
Componente completo definito ma **mai renderizzato** nel JSX della pagina Bridge.

### 13. `InviteCodesTab` — `bridge/page.js` L1737
Componente rimpiazzato da `InviteCodesTabControlled` + `InviteCodesTabWrapper`. La versione originale esiste ancora nel file ma non è mai usata.

### 14. `dtFromPickup` — `fleet/page.js` L79
Funzione helper definita ma mai invocata nel codice.

### 15. `getCrewEffectiveDest` — `rocket/page.js` L1616
Funzione definita ma mai chiamata.

---

## 📋 RIEPILOGO PER PRIORITÀ

| Priorità | Problema | File | Impatto |
|----------|----------|------|---------|
| 🔴 CRITICO | Componenti in render (`StayForm`, `MovForm`) | `crew/page.js` | Perdita stato UI |
| 🔴 CRITICO | Variabile prima della dichiarazione | `lists/page.js` L463 | Potenziale crash |
| 🔴 CRITICO | Espressioni no-op silenzioso | `bridge`, `crew`, `rocket` | Bug logici nascosti |
| 🟡 ALTO | `setState` sincrono in `useEffect` (×30+) | 14 file | Render a cascata |
| 🟡 ALTO | Dep. mancanti `useEffect`/`useCallback` (×25) | 8 file | Stale closures |
| 🟡 ALTO | `require()` in API routes App Router | 6 API file | Errori build/deploy |
| 🟠 MEDIO | Variabili/funzioni inutilizzate (×40+) | 15+ file | Dead code / confusione |
| 🟠 MEDIO | `<img>` invece di `<Image />` | 8 file | LCP lento |
| 🟢 BASSO | Entità JSX non escaped | 6 file | Warning cosmetic |

---

## 🧹 SCRIPT CLEANUP (rimozione file di analisi)

```bash
# Rimuovi il file di analisi temporaneo
del eslint_report.json
```
