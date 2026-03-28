# Rocket — Piano di Implementazione Task
### CaptainDispatch · Aggiornato al 28 marzo 2026

> Ogni task va eseguito in una **conversazione separata** per restare entro i limiti di contesto.
> Per iniziare un task, apri una nuova chat e scrivi: *"Implementa TASK N di ROCKET_TASKS.md"*

---

## Ordine consigliato di esecuzione

```
TASK 1 (bug fix) → TASK 2 → TASK 3 → TASK 4 → TASK 6 → TASK 7 → TASK 8 → TASK 5
```

---

## 🟥 TASK 1 — Fix Bug: Routing Sequenziale Multi-Pickup DEPARTURE

**Priorità: Alta (bug aperto)**
**Status: [x] Completato — 28 marzo 2026**

### Problema
Quando un van raccoglie persone da più hotel prima di andare in aeroporto/hub, i pickup vengono calcolati in **parallelo** invece che in **sequenza**. Ogni hotel calcola il proprio pickup come `call - durata_rotta_hotel_hub`, il che genera orari di pickup identici per hotel diversi — impossibile nella pratica.

### Soluzione attesa
Calcolare i pickup in cascata: Hotel A → Hotel B → Hub.
- Pickup Hotel B = `call - durata(Hotel_B → Hub)`
- Pickup Hotel A = `Pickup Hotel B - durata(Hotel_A → Hotel_B)`

### File da esaminare
- `app/dashboard/rocket/page.js` (o dove vive `runRocket()`)
- `lib/routeDuration.js`
- Tabella Supabase: `routes`

---

## 🟧 TASK 2 — Feature: Durata Stimata Trip nello Step 2

**Priorità: Media**
**Status: [x] Completato — 28 marzo 2026**

### Problema
La card del trip in Step 2 non mostra la durata stimata in minuti né l'orario di fine corsa (arrivo a destinazione). Il Captain deve calcolarla mentalmente.

### Soluzione attesa
Aggiungere alla card del trip in Step 2:
- Durata viaggio in minuti (es. "25 min")
- Orario previsto di arrivo a destinazione (es. "arr. 06:55")

I dati sono già disponibili da `routes.duration_minutes`.

### File da esaminare
- `app/dashboard/rocket/page.js` (componente card Step 2)
- `lib/routeDuration.js`

---

## 🟨 TASK 3 — Feature: Template Salvati (localStorage)

**Priorità: Media**
**Status: [x] Completato — 28 marzo 2026**

### Problema
Ogni mattina il Captain deve reimpostare da zero tutta la configurazione dello Step 1 (destinazione, call time, override dipartimento, fleet inclusa/esclusa), anche quando è identica al giorno precedente.

### Soluzione attesa — Fase 1 (solo localStorage)
- Salvataggio **automatico** dell'ultima configurazione usata nel localStorage
- Possibilità di salvare configurazioni con nome (es. "Lunedì Standard", "Airport Run")
- Banner in cima allo Step 1 che propone di ricaricare l'ultimo run con un click
- UI per visualizzare, caricare ed eliminare i template salvati

### File da esaminare
- `app/dashboard/rocket/page.js` (Step 1)

---

## 🟨 TASK 4 — Feature: Template Salvati (Supabase)

**Priorità: Bassa-Media**
**Status: [x] Completato — 28 marzo 2026**

### Problema
I template in localStorage sono legati al dispositivo e alla cache del browser. In una produzione con più Transportation Captain, i template non sono condivisibili.

### Soluzione attesa
- Nuova tabella Supabase: `rocket_templates` (id, production_id, name, config_json, created_by, created_at)
- API route per CRUD: `app/api/rocket/templates/route.js`
- UI nello Step 1 per gestire template permanenti (salva, carica, elimina)
- Separazione visiva tra template "locali" (localStorage) e "condivisi" (Supabase)

### File da creare/modificare
- `scripts/migrate-rocket-templates.sql` (nuova tabella)
- `app/api/rocket/templates/route.js` (nuova API)
- `app/dashboard/rocket/page.js` (integrazione UI)

---

## 🟩 TASK 5 — Feature: Memoria Storica & Suggerimenti

**Priorità: Bassa**
**Status: [x] Completato — 28 marzo 2026**

### Problema
Dopo settimane di utilizzo, Rocket dispone di pattern preziosi nei run storici che non vengono sfruttati.

### Soluzione attesa
- Query statistiche su `trips` + `trip_passengers` storici (nessuna AI, solo frequenze e medie)
- Componente hint non-invasivo nello Step 1 con suggerimenti tipo:
  - "Il lunedì, GRIP e ELECTRIC vanno sempre allo stesso orario — vuoi applicare la config tipica?"
  - "VAN-03 è stato assegnato all'Hotel Meridian nelle ultime 8 settimane — includerlo di default?"
- I suggerimenti sono **solo visivi**: il Captain li conferma o ignora con un click, nulla cambia automaticamente
- La funzionalità si attiva solo dopo almeno 10-15 run storici (sample significativo)

### File da esaminare/creare
- `app/api/rocket/suggestions/route.js` (nuova API)
- `app/dashboard/rocket/page.js` (componente hint Step 1)

---

## 🟦 TASK 6 — Feature: Quick-Reason Esclusione Veicolo

**Priorità: Bassa**
**Status: [x] Completato — 28 marzo 2026**


### Problema
Quando il Captain esclude un veicolo dal run, non c'è modo di registrare il motivo (fuori servizio, già impegnato, guasto, ecc.).

### Soluzione attesa
- Dropdown o modal inline sulla card veicolo in Step 1 con motivazioni predefinite + campo libero
- Il reason viene salvato nel run e visibile nel riepilogo Step 3
- Opzionale: log del reason su Supabase per reportistica fleet

### File da esaminare
- `app/dashboard/rocket/page.js` (pannello fleet Step 1)

---

## 🟦 TASK 7 — Feature: Tipo Servizio per Singola Destinazione

**Priorità: Bassa**
**Status: [x] Completato — 28 marzo 2026**

### Problema
Il service type è impostabile solo a livello globale del run. Se in uno stesso run ci sono destinazioni di tipo diverso (es. set principale = HOTEL_RUN, aeroporto = AIRPORT), non è possibile differenziarli.

### Soluzione attesa
- Override del service type nel pannello "destinazioni per dipartimento" dello Step 1
- Il service type effettivo per ogni trip viene calcolato con la stessa gerarchia degli altri override: individuale > dipartimento > globale

### File da esaminare
- `app/dashboard/rocket/page.js` (pannello destinazioni Step 1)

---



*Piano generato il 28 marzo 2026 — basato su Rocket Project.md*
