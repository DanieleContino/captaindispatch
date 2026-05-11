# 📋 Valutazione di Spesa — Manuale di CaptainDispatch
## Analisi completa del progetto e stima costi di documentazione
### Generato: 11 Maggio 2026

---

## 1. DESCRIZIONE DELL'APPLICAZIONE

### Cos'è CaptainDispatch

CaptainDispatch è una web app professionale SaaS sviluppata con **Next.js + Supabase + Vercel**, progettata per i Transportation Captain nel settore delle produzioni cinematografiche e televisive. Il sistema gestisce l'intera logistica dei trasporti di un'unità di produzione: dai movimenti giornalieri del crew agli aeroporti, dalla generazione automatica dei trip alla stampa delle liste di trasporto.

L'applicazione è il risultato di **oltre 54 sessioni di sviluppo** (da marzo 2025 a maggio 2026) ed è un sistema maturo, multi-tenant, con funzionalità avanzate di automazione, integrazione Google, notifiche push e gestione mobile.

### Stack tecnologico

| Tecnologia | Utilizzo |
|---|---|
| Next.js (App Router) | Frontend + API Routes |
| Supabase | Database PostgreSQL + Auth + Storage + Realtime |
| Vercel | Hosting + Cron Jobs |
| Google OAuth 2.0 | Autenticazione utenti |
| Google Drive API | Sincronizzazione file import |
| Google Routes API | Calcolo durate con traffico reale |
| Google Places API | Autocomplete indirizzi |
| Web Push (VAPID) | Notifiche push browser |
| @dnd-kit/sortable | Drag-and-drop colonne |

---

## 2. MAPPA COMPLETA DELLE FUNZIONALITÀ DA DOCUMENTARE

### 2.1 Pagine del Dashboard

| # | Sezione | URL | Complessità | Descrizione |
|---|---|---|---|---|
| 1 | **Login / Auth** | `/login` | 🟢 Bassa | Login Google OAuth, redirect pending/dashboard |
| 2 | **Pending** | `/pending` | 🟢 Bassa | Schermata attesa approvazione per nuovi utenti |
| 3 | **Dashboard Home** | `/dashboard` | 🟢 Bassa | Overview con widget Fleet/Crew/Hub, shortcuts |
| 4 | **Bridge** | `/dashboard/bridge` | 🔴 Alta | Centro di controllo: Drive sync, duplicati crew, inviti, approvazioni, activity log, ArrivalsDepartures chart |
| 5 | **Trips** | `/dashboard/trips` | 🔴 Alta | Lista trip per data, filtri class/status/vehicle, sidebar edit, multi-dropoff, conflict detection, mobile timeline card, FAB |
| 6 | **Crew** | `/dashboard/crew` | 🔴 Alta | Anagrafica crew, travel status (IN/OUT/PRESENT), accordion soggiorni, accordion movimenti, importazione, contatti |
| 7 | **Fleet / Vehicles** | `/dashboard/vehicles` | 🟡 Media | Gestione flotta, autocomplete driver-crew, auto NTN, preferenze per dipartimento |
| 8 | **🚀 Rocket** | `/dashboard/rocket` | 🔴 Molto Alta | Generatore automatico trip: 3 step (Setup → Preview → Done), algoritmo greedy, override a 3 livelli, multi-pickup/dropoff, template, suggerimenti storici |
| 9 | **Transport List v1** | `/dashboard/lists` | 🟡 Media | Liste di trasporto classiche, sezioni, stampa/PDF |
| 10 | **Transport List v2** | `/dashboard/lists-v2` | 🔴 Alta | Liste data-driven: editor colonne drag-and-drop, ~30 renderer disponibili, header produzione, preset Captain, stampa |
| 11 | **Locations** | `/dashboard/locations` | 🟡 Media | Hotel + hub, coordinate, default pickup point, calcolo rotte |
| 12 | **Hub Coverage** | `/dashboard/hub-coverage` | 🟡 Media | Analisi copertura per hub, suggerimento combo ottimale veicoli, filtri |
| 13 | **Pax Coverage** | `/dashboard/pax-coverage` | 🟡 Media | Copertura passeggeri, DayStrip 7 giorni, sezioni NTN/Remote, statistiche |
| 14 | **Reports** | `/dashboard/reports` | 🟢 Bassa | Report produzione |
| 15 | **QR Codes** | `/dashboard/qr-codes` | 🟢 Bassa | Generazione e stampa badge QR per crew e veicoli |
| 16 | **Productions** | `/dashboard/productions` | 🟢 Bassa | Gestione multi-produzione, switch produzione attiva |
| 17 | **Settings** | `/dashboard/settings` | 🟡 Media | Connessione Google Drive per-utente (OAuth), disconnect, stato token |
| 18 | **Settings / Produzione** | `/dashboard/settings/production` | 🟡 Media | Logo produzione, team contatti, set location, basecamp, call time, shoot day |
| 19 | **Scan (mobile)** | `/scan` | 🟢 Bassa | Risoluzione QR code da mobile, vista crew/vehicle |
| 20 | **Wrap Trip (mobile)** | `/wrap-trip` | 🟡 Media | Flusso guidato 4 step per driver da mobile, creazione trip on-the-go |

### 2.2 Funzionalità Trasversali (capitoli dedicati)

| # | Funzionalità | Complessità | Descrizione |
|---|---|---|---|
| 21 | **Sistema di Inviti** | 🟡 Media | Creazione invito, link redeem, approvazione via Bridge |
| 22 | **Ruoli e Permessi** | 🟡 Media | CAPTAIN, MANAGER, PRODUCTION, ADMIN — cosa può fare ognuno |
| 23 | **Import da Google Sheets** | 🔴 Alta | Flusso import crew, accommodation, travel calendar da Sheets |
| 24 | **Import da Google Drive** | 🔴 Alta | Sincronizzazione file da Drive, check aggiornamenti, modalità auto/manual |
| 25 | **Push Notifications** | 🟢 Bassa | Abbonamento notifiche browser, daily briefing mattutino |
| 26 | **Calcolo Rotte e Traffico** | 🟡 Media | Google Routes API, aggiornamento automatico, rotte manuali protette |
| 27 | **Sistema QR Code** | 🟢 Bassa | Formato CR:ID / VH:ID, generazione, risoluzione live |
| 28 | **Cron Jobs automatici** | 🟢 Bassa | arrival-status, daily-briefing, drive-sync, refresh-routes-traffic |

---

## 3. VOLUME STIMATO DEL MANUALE

| Elemento | Quantità stimata |
|---|---|
| Capitoli principali | 28 |
| **Pagine totali (A4 / formato web)** | **90 – 130 pagine** |
| Screenshot / annotazioni necessari | 65 – 95 |
| Diagrammi di flusso (Rocket, Import, Auth, Inviti) | 6 – 10 |
| Tabelle di riferimento (permessi, status, tipi servizio) | 12 – 18 |
| GIF / video walkthrough (opzionale) | 5 – 10 |

### Ripartizione per complessità

| Livello | Sezioni | Pagine stimate |
|---|---|---|
| 🔴 Molto Alta (Rocket) | 1 | 12 – 18 pag |
| 🔴 Alta (Bridge, Trips, Crew, Lists-v2, Import) | 6 | 30 – 48 pag |
| 🟡 Media (Fleet, Lists-v1, Locations, Coverage, Settings…) | 12 | 36 – 48 pag |
| 🟢 Bassa (Login, Dashboard, QR, Reports, Scan…) | 9 | 12 – 18 pag |
| **TOTALE** | **28** | **90 – 130 pag** |

---

## 4. STIMA DELLE ORE DI LAVORO

### Per attività

| Attività | Ore minime | Ore massime |
|---|---|---|
| Analisi e strutturazione del manuale | 8 | 12 |
| Redazione testi — sezioni basse (9 sezioni × 2-3h) | 18 | 27 |
| Redazione testi — sezioni medie (12 sezioni × 4-6h) | 48 | 72 |
| Redazione testi — sezioni alte (6 sezioni × 8-12h) | 48 | 72 |
| Redazione testi — Rocket (1 sezione × 14-18h) | 14 | 18 |
| Realizzazione screenshot e annotazioni visive | 20 | 30 |
| Diagrammi di flusso / infografiche | 8 | 12 |
| Revisione tecnica (verifica accuratezza con il codice) | 10 | 16 |
| Editing, impaginazione, formattazione finale | 10 | 16 |
| **TOTALE ORE** | **184** | **275** |

> **Nota**: Le ore variano significativamente in base al livello di dettaglio richiesto (manuale utente base vs. guida tecnica completa con tutti i casi d'uso edge) e alla necessità di aggiornamenti futuri.

---

## 5. STIMA ECONOMICA PER TIPOLOGIA DI MANUALE

---

### 📄 OPZIONE A — Manuale PDF / Word (formato classico)

> Documento statico esportabile, stampabile, distribuibile via email o link.
> **Adatto a**: clienti tradizionali, onboarding singolo utente, distribuzione offline.

| Profilo redattore | Tariffa oraria | Costo totale MIN | Costo totale MAX |
|---|---|---|---|
| Technical writer junior (freelance) | 25 – 35 €/h | **4.600 €** | **9.600 €** |
| Technical writer senior (freelance) | 45 – 65 €/h | **8.300 €** | **17.900 €** |
| Agenzia documentazione tecnica | 80 – 120 €/h | **14.700 €** | **33.000 €** |
| **AI-assistito + revisione umana** | — | **1.800 €** | **4.000 €** |

> 💡 L'opzione AI-assistito prevede la generazione della bozza con strumenti come questo (Cline/Claude), revisione e correzione da parte del team, screenshot manuali. È la scelta con il miglior ROI per progetti con budget contenuto.

---

### 🌐 OPZIONE B — Documentazione Web (Docusaurus / GitBook / Notion)

> Sito dedicato alla documentazione, navigabile, con ricerca full-text e versioning.
> **Adatto a**: SaaS con più utenti, documentazione sempre aggiornata, self-service onboarding.

| Voce | Costo aggiuntivo rispetto a Opzione A |
|---|---|
| Setup tecnico piattaforma (Docusaurus / GitBook) | + 600 – 1.200 € |
| Struttura navigazione, sidebar, tagging | + 400 – 800 € |
| Integrazione screenshot interattivi / GIF animati | + 600 – 1.500 € |
| Deploy e dominio dedicato (es. `docs.captaindispatch.com`) | + 200 – 500 €/anno |
| **Costo aggiuntivo totale** | **+ 1.800 – 4.000 €** |

**Costo totale Opzione B** (AI-assistito + web): **3.600 – 8.000 €**

---

### 🖥️ OPZIONE C — Help integrato in-app (tooltip, onboarding, guided tour)

> Aiuto contestuale direttamente nell'interfaccia, walkthrough guidati per nuovi utenti.
> **Adatto a**: SaaS con onboarding self-service, riduzione ticket di supporto.

| Voce | Costo stimato |
|---|---|
| Design UX tooltip e walkthrough (Figma) | 2.000 – 4.000 € |
| Sviluppo React (Shepherd.js / custom) | 3.500 – 7.000 € |
| Testi per tutti i tooltip e step | 1.500 – 3.000 € |
| **Totale Opzione C** | **7.000 – 14.000 €** |

---

### 📊 RIEPILOGO COMPARATIVO

| Opzione | Formato | Manutenzione | Costo (AI-assisted) | Costo (professionista) |
|---|---|---|---|---|
| **A — PDF/Word** | Statico | Manuale | 1.800 – 4.000 € | 8.300 – 17.900 € |
| **B — Web Docs** | Dinamico | Facile | 3.600 – 8.000 € | 10.100 – 21.900 € |
| **C — In-app Help** | Integrato | Dev richiesto | N/A | 7.000 – 14.000 € |

---

## 6. PERCORSO CONSIGLIATO (rapporto qualità/costo ottimale)

Per un'applicazione verticale e professionale come CaptainDispatch, con un target di utenti esperti (Transportation Captain, Production Manager), il percorso più efficiente è:

```
FASE 1 — Bozza AI (0 – 200 €)
  → Generazione completa della prima bozza con Cline/Claude
  → Struttura capitoli, testi, tabelle di riferimento
  → Durata: 1-2 giorni di lavoro AI

FASE 2 — Screenshot e Visual (500 – 1.000 €)
  → Cattura manuale degli screenshot per ogni sezione
  → Annotazioni visive (frecce, highlight, callout)
  → Strumenti: Cleanshot, Snagit, Figma (200-400€ licenza annua)

FASE 3 — Revisione tecnica (800 – 1.500 €)
  → Revisione da parte del Transportation Captain / sviluppatore
  → Verifica accuratezza dei testi rispetto al comportamento reale
  → 15-25 ore × 40-60€/h

FASE 4 — Pubblicazione (500 – 1.000 €)
  → Setup GitBook gratuito (piano free) o Docusaurus su Vercel (gratis)
  → Dominio docs.captaindispatch.com: ~15€/anno (se non già incluso)
  → Formattazione finale e deploy

──────────────────────────────────────────
TOTALE PERCORSO OTTIMIZZATO: 1.800 – 3.700 €
──────────────────────────────────────────
```

---

## 7. FATTORI CHE INFLUENZANO IL COSTO FINALE

### Aumentano il costo
- Manuale **bilingue** (IT + EN): +50-60% del costo redazione
- Richiesta di **video tutorial** per ogni sezione: +3.000 – 8.000 €
- Documentazione **tecnica completa** (API, DB schema, RLS): +30-40%
- **Aggiornamenti automatici** a ogni release: richiede processo di CI/CD docs
- **Localizzazione** in più lingue (FR, DE, ES): +40-60% per lingua

### Riducono il costo
- Utilizzo di **AI per la prima bozza** (risparmio 60-70%)
- Documentazione solo per **utenti finali** (esclude tecnici/admin): -30%
- **Formato PDF semplice** senza design grafico elaborato: -20%
- Il team ha già screenshot e registrazioni dello schermo disponibili: -15%
- Documentazione solo delle **funzionalità core** (Rocket, Trips, Crew): -40%

---

## 8. INDICE PROPOSTO DEL MANUALE

```
CAPTAINDISPATCH — Manuale Utente
Versione 1.0 | Maggio 2026

PARTE I — INTRODUZIONE
  1. Panoramica di CaptainDispatch
  2. Terminologia e concetti base
  3. Ruoli utente e permessi
  4. Accesso e autenticazione

PARTE II — GESTIONE DEL CREW
  5. Anagrafica Crew
  6. Travel Status (IN / OUT / PRESENT)
  7. Soggiorni (Accommodation)
  8. Movimenti di viaggio
  9. Pax Coverage

PARTE III — GESTIONE DEI TRIP
  10. Lista Trip (vista giornaliera)
  11. Creazione e modifica di un trip
  12. Multi-dropoff e trip concatenati
  13. Conflict detection

PARTE IV — 🚀 ROCKET (Trip Generator)
  14. Cos'è Rocket e quando usarlo
  15. Step 1 — Setup (configurazione run)
  16. Step 2 — Preview (revisione e aggiustamenti)
  17. Step 3 — Done (conferma e creazione)
  18. Override a 3 livelli (individuale / dipartimento / globale)
  19. Multi-pickup e multi-dropoff automatico
  20. Template e memoria storica

PARTE V — FLOTTA E VEICOLI
  21. Gestione fleet
  22. Collegamento driver-crew
  23. Preferenze veicolo per dipartimento
  24. Fleet Monitor

PARTE VI — LISTE DI TRASPORTO
  25. Transport List classica (v1)
  26. Transport List data-driven (v2)
  27. Editor colonne (aggiunta, modifica, riordino)
  28. Stampa e PDF

PARTE VII — LOCATIONS E ROTTE
  29. Gestione Location (Hotel + Hub)
  30. Calcolo rotte e durate
  31. Hub Coverage
  32. Google Places (autocomplete indirizzi)

PARTE VIII — BRIDGE (Centro di Controllo)
  33. Panoramica Bridge
  34. Drive Sync (sincronizzazione file)
  35. Gestione duplicati crew
  36. Sistema inviti
  37. Approvazione nuovi utenti

PARTE IX — IMPORT DATI
  38. Import da Google Sheets
  39. Import da Google Drive
  40. Travel Calendar e discrepanze

PARTE X — MOBILE
  41. Scan QR Code
  42. Wrap Trip da mobile

PARTE XI — IMPOSTAZIONI
  43. Settings account e Google Drive
  44. Impostazioni produzione (logo, team, set)
  45. Notifiche push

PARTE XII — REFERENCE
  46. Tabella permessi completa
  47. Glossario terminologia cinematografica/operativa
  48. FAQ e risoluzione problemi comuni
```

---

## 9. DECISIONI DA PRENDERE PRIMA DI AVVIARE

Prima di commissionare o avviare la redazione del manuale, rispondere a queste domande definirà con precisione scope, costi e tempi:

| Domanda | Impatto sul costo |
|---|---|
| **Lingua**: italiano, inglese, o bilingue? | Bilingue = +50-60% |
| **Target**: solo utenti finali, o anche tecnici/admin? | Tecnico = +30-40% |
| **Formato**: PDF, web (GitBook/Docusaurus), o in-app help? | Vedi Opzione A/B/C |
| **Chi redige**: AI + revisione interna, freelance, o agenzia? | Varia da 1.800€ a 33.000€ |
| **Profondità**: manuale base (cosa fa ogni pulsante) o guida avanzata (workflow completi, casi d'uso edge)? | +30-50% per guida avanzata |
| **Screenshot**: chi li cattura (team interno o redattore)? | Interno = risparmio ~1.000€ |
| **Aggiornamenti**: manuale statico o aggiornato a ogni release? | Manutenzione ongoing = +20-30%/anno |

---

*Documento generato il 11 Maggio 2026 tramite analisi automatica del codebase CaptainDispatch (commit `67ac756`)*
*Analisi basata su: CAPTAINDISPATCH_Context.md, CAPTAIN_Analysis.md, Rocket Project.md, struttura file app/ e api/*
