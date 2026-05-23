# VEHICLE TASKS

Refactoring della pagina Vehicles per aggiungere:
1. Tab **Production** separato (solo veicoli di proprietà della produzione)
2. Modal **"Add Vehicle"** globale con selezione del tipo

---

## TASK V-01 — Tab Production

**Obiettivo:** Aggiungere un nuovo tab `production` che mostra solo i veicoli di proprietà della produzione (`!is_rental && !is_ncc && !is_comodato`), con possibilità di creare e modificare.

**File:** `app/dashboard/vehicles/page.js`

**Modifiche:**

1. Nel tab switcher (array di tab, ~riga 4655), aggiungere dopo `fleet`:
   ```js
   { key: 'production', label: '🏭 Production' },
   ```

2. Nella toolbar row 1 (~riga 4619), aggiungere il bottone add per production:
   ```js
   {activeTab === 'production' && (
     <button onClick={openNew} style={{ background: '#2563eb', ... }}>
       + Add Vehicle
     </button>
   )}
   ```

3. Nella toolbar row 2, aggiungere i filtri per production (search + active/inactive, senza il filtro rental-type):
   ```js
   {activeTab === 'production' && (
     <div style={{ ... }}>
       <input type="text" placeholder="Cerca ID, driver…" ... />
       <div> {/* filtri ALL/ACTIVE/INACTIVE */} </div>
       <div> {/* filtri tipo VAN/CAR/BUS... */} </div>
     </div>
   )}
   ```

4. Nel body (~riga 4761), aggiungere il render della tab production, che riutilizza la logica del fleet ma con veicoli già filtrati a production-only:
   ```js
   {activeTab === 'production' && (
     <div style={{ maxWidth: '900px', ... }}>
       {/* stessa struttura del fleet tab ma productionFiltered */}
     </div>
   )}
   ```
   dove `productionFiltered = vhcs.filter(v => !v.is_rental && !v.is_ncc && !v.is_comodato && ...search/active filters...)`

**Commit:**
```
git add app/dashboard/vehicles/page.js && git commit -m "feat(vehicles): add Production tab for production-owned vehicles" && git push
```

---

## TASK V-02 — Modal "Add Vehicle" globale

**Obiettivo:** Il bottone "+ Add Vehicle" nella toolbar (sempre visibile) apre un modal con 4 opzioni. Selezionando un'opzione, si viene portati alla tab corrispondente con il form di aggiunta già aperto.

**File:** `app/dashboard/vehicles/page.js`

**Modifiche:**

1. Aggiungere stato nel componente principale:
   ```js
   const [addVehicleModalOpen, setAddVehicleModalOpen] = useState(false)
   ```

2. Aggiungere il componente `AddVehicleModal` (inline, prima del `return`):
   ```js
   function AddVehicleModal({ open, onClose, onSelect }) {
     if (!open) return null
     const options = [
       { key: 'production', icon: '🏭', label: 'Production',
         desc: 'Veicolo di proprietà della produzione',
         color: '#0f2340', bg: '#eff6ff', border: '#bfdbfe' },
       { key: 'rental', icon: '🔑', label: 'Rental',
         desc: 'Veicolo a noleggio (contratto supplier)',
         color: '#a16207', bg: '#fefce8', border: '#fde68a' },
       { key: 'ncc', icon: '🏢', label: 'NCC',
         desc: 'Veicolo fornito da agenzia NCC esterna',
         color: '#0369a1', bg: '#f0f9ff', border: '#bae6fd' },
       { key: 'loan', icon: '🤝', label: 'Loan',
         desc: 'Veicolo personale con rimborso spese',
         color: '#15803d', bg: '#f0fdf4', border: '#86efac' },
     ]
     return (
       <>
         <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(15,35,64,0.4)' }} />
         <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', zIndex: 61,
           background: 'white', borderRadius: '14px', padding: '24px', width: '380px', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
           <div style={{ fontWeight: '800', fontSize: '16px', color: '#0f172a', marginBottom: '6px' }}>
             🚐 Aggiungi Veicolo
           </div>
           <div style={{ fontSize: '12px', color: '#94a3b8', marginBottom: '18px' }}>
             Seleziona il tipo di veicolo da aggiungere
           </div>
           <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
             {options.map(opt => (
               <button key={opt.key} onClick={() => onSelect(opt.key)}
                 style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 16px',
                   borderRadius: '10px', border: `1px solid ${opt.border}`, background: opt.bg,
                   cursor: 'pointer', textAlign: 'left', width: '100%' }}>
                 <span style={{ fontSize: '24px', flexShrink: 0 }}>{opt.icon}</span>
                 <div>
                   <div style={{ fontWeight: '800', fontSize: '13px', color: opt.color }}>{opt.label}</div>
                   <div style={{ fontSize: '11px', color: '#64748b', marginTop: '1px' }}>{opt.desc}</div>
                 </div>
                 <span style={{ marginLeft: 'auto', color: opt.color, fontSize: '16px' }}>›</span>
               </button>
             ))}
           </div>
           <button onClick={onClose} style={{ marginTop: '14px', width: '100%', padding: '8px',
             borderRadius: '8px', border: '1px solid #e2e8f0', background: 'white',
             color: '#64748b', fontSize: '12px', cursor: 'pointer', fontWeight: '600' }}>
             Cancel
           </button>
         </div>
       </>
     )
   }
   ```

3. Aggiungere funzione `handleAddVehicleSelect` nel componente principale:
   ```js
   function handleAddVehicleSelect(type) {
     setAddVehicleModalOpen(false)
     if (type === 'production') { setActiveTab('production'); openNew() }
     if (type === 'rental')     { setActiveTab('rental');     setTimeout(() => rentalSidebarTriggerRef.current && rentalSidebarTriggerRef.current(), 100) }
     if (type === 'ncc')        { setActiveTab('ncc');        setTimeout(() => nccAgencySidebarTriggerRef.current && nccAgencySidebarTriggerRef.current(), 100) }
     if (type === 'loan')       { setActiveTab('comodato');   setTimeout(() => setComodatoAddTrigger(n => n + 1), 100) }
   }
   ```

4. Nella toolbar row 1, rendere il bottone "+ Add Vehicle" sempre visibile (sostituisce la logica `activeTab === 'fleet'` esistente):
   ```js
   <button onClick={() => setAddVehicleModalOpen(true)}
     style={{ background: '#2563eb', color: 'white', ... }}>
     + Add Vehicle
   </button>
   ```

5. Prima del `</div>` finale del componente, aggiungere il modal:
   ```js
   <AddVehicleModal
     open={addVehicleModalOpen}
     onClose={() => setAddVehicleModalOpen(false)}
     onSelect={handleAddVehicleSelect}
   />
   ```

**Commit:**
```
git add app/dashboard/vehicles/page.js && git commit -m "feat(vehicles): add global Add Vehicle modal with type selection" && git push
```

---

## Note

- La tab **Fleet** rimane invariata (mostra tutti i veicoli con filtri)
- La tab **Production** mostra solo `!is_rental && !is_ncc && !is_comodato`
- Il modal è leggero (~60 righe), nessuna dipendenza esterna
- I bottoni specifici per tab (Add Agency, Add Supplier, Add Rental) rimangono per uso contestuale
