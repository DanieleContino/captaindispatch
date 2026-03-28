'use client'

/**
 * Captain Dispatch — i18n (Internationalisation)
 *
 * HOW TO USE:
 *   import { useT } from '../../lib/i18n'
 *   const t = useT()
 *   // then: t.cancel, t.save, t.newVehicle, etc.
 *
 * HOW TO ADD A NEW LANGUAGE:
 *   1. Add a new entry in `translations` below (e.g. `es: { cancel: 'Cancelar', ... }`)
 *   2. Add it to SUPPORTED_LOCALES array
 *   3. Add a label in LOCALE_LABELS
 *   That's it — all pages update automatically.
 */

import { createContext, useContext, useState, useEffect } from 'react'

// ─── Locale config ─────────────────────────────────────────
export const SUPPORTED_LOCALES = ['en', 'it']
export const DEFAULT_LOCALE    = 'en'
export const LOCALE_LABELS     = { en: '🇬🇧 EN', it: '🇮🇹 IT' }
const STORAGE_KEY              = 'captain_lang'

// ─── Translations ───────────────────────────────────────────
const translations = {

  // ── ENGLISH (default) ──────────────────────────────────────
  en: {
    // Common actions
    cancel:            'Cancel',
    save:              'Save',
    saving:            'Saving…',
    add:               'Add',
    delete:            'Delete',
    edit:              'Edit',
    confirm:           '⚠ Confirm',
    deleting:          'Deleting…',
    search:            'Search…',
    noResults:         'No results',
    noResultsFiltered: 'No results with selected filters',
    areYouSure:        'Are you sure?',
    signOut:           'Sign out',
    error:             'Error',
    networkError:      'Network error',
    loading:           'Loading…',

    // Common buttons with icons
    addNew:       '+ Add',
    saveChanges:  '✓ Save',

    // ── Crew page ──────────────────────────────────────────────
    addCrew:           '+ Add Crew',
    newCrew:           'New Crew',
    editCrew:          'Edit Crew',
    noCrew:            'No crew in database',
    noCrewConfirmed:   'No CONFIRMED crew in database',
    goToCrew:          '→ Go to Crew',
    deleteCrew:        '🗑 Delete Crew',
    deleteCrewConfirm: '⚠ Are you sure? The crew member will be removed.',

    // ── Vehicles page ──────────────────────────────────────────
    newVehicle:           'New Vehicle',
    editVehicle:          'Edit Vehicle',
    addVehicleBtn:        '+ New Vehicle',
    addVehicleBtnAlt:     '+ Add Vehicle',
    noVehicles:           'No vehicles',
    deleteVehicle:        '🗑 Delete Vehicle',
    deleteVehicleConfirm: '⚠ Are you sure? The vehicle will be removed from the fleet.',
    physicalCapacity:     'Physical capacity (pax)',
    rocketCapacity:       '🚀 Rocket — Trip Capacity',
    noClassLabel:         'None',
    availabilityDates:    '📅 Availability Dates',
    availableFrom:        'Available from',
    availableTo:          'Available to',
    availabilityHint:     'Leave empty = always available',
    vehicleNotAvailable:  '⚠ not available on this date',

    // ── Locations page ─────────────────────────────────────────
    newLocation:           '📍 New Location',
    editLocation:          '📍 Edit Location',
    addLocationBtn:        '+ New Location',
    noLocations:           'No locations',
    deleteLocation:        '🗑 Delete Location',
    deleteLocationConfirm: '⚠ Are you sure? This will also remove all associated routes.',
    searchGoogleMaps:      '🔍 Search on Google Maps',
    chooseOnMap:           '🗺 Choose on map',
    recalculating:         '🔄 Recalculating routes…',
    searchError:           'Search error',
    routeNetworkError:     '⚠ Network error in route recalculation',

    // ── Trips page ─────────────────────────────────────────────
    errorSiblingTrip:    'Error creating sibling trip',
    differentRoute:      '⚠ Different route — will become MULTI-STOP',
    newTrip:             'New Trip',
    editTrip:            'Edit Trip',
    saveTrip:            '✓ Save Trip',
    noVehicle:           'No vehicle',
    noPaxAssigned:       'No passengers assigned',
    noTripsDate:         'No trips for this date',
    loadingPax:          'Loading passengers…',
    assignedSection:     '✓ ASSIGNED',
    availableSection:    'AVAILABLE',
    noEligibleCrew:      'No eligible crew (check hotel and Travel_Status)',
    selectPickupFirst:   'Select pickup & dropoff first',
    noCrewStatus:        'No crew — check Travel_Status',
    addToExistingTrip:   '📋 ADD TO EXISTING TRIP',
    compatible:          '⭐ Compatible',
    otherMultiStop:      '⚠ Other (multi-stop)',
    orCreateBelow:       '— or create a new trip below —',
    deleteTripConfirm:   'Confirm delete?',
    yesDelete:           'Yes, delete',
    assigningLabel:      'Assigning:',
    noCompatibleTrips:   'No compatible trips — New Trip sidebar opened',
    dismiss:             '✕ dismiss',
    today:               'Today',
    allVehicles:         'All vehicles',
    passengers:          'Passengers',

    // ── Pax Coverage page ──────────────────────────────────────
    noCrewConfirmedDb:       'No CONFIRMED crew in database',
    goToCrewLink:            '→ Go to Crew',
    allDepts:                'All depts',
    allHotels:               'All hotels',
    transferCoverage:        'Transfer coverage',
    totalCrewLabel:          'Total crew',
    withTransfer:            'With transfer',
    withoutTransfer:         'Without transfer',
    withoutTransferSection:  'WITHOUT TRANSFER',
    withAssignedTransfer:    'WITH ASSIGNED TRANSFER',
    assignBtn:               '+ Assign',
    goToTrips:               'Go to Trips →',

    // ── Hub Coverage page ──────────────────────────────────────
    noCrewInOut:      'No crew with travel_status IN or OUT',
    hubCoverageDesc:  'Hub Coverage shows crew with travel_status IN (arriving) or OUT (departing) and checks if they have an assigned ARRIVAL/DEPARTURE trip for the selected date',
    hubCoverageLabel: 'Hub coverage',
    expectedLabel:    'Expected',
    coveredLabel:     'Covered',
    missingLabel:     'Missing',
    missingSection:   'MISSING',
    coveredSection:   'COVERED',
    noTripAssignedFor: 'no trip assigned for',

    // ── QR Codes page ──────────────────────────────────────────
    noVehiclesQr:      'No vehicles found. Add them in',
    noCrewConfirmedQr: 'No CONFIRMED crew found.',
    qrStep1: 'Select date / call time / pickup location (current location)',
    qrStep2: 'Select the passengers in the vehicle',
    qrStep3: 'Confirm → the system automatically creates a trip for each destination hotel',

    // ── Pending page ───────────────────────────────────────────
    pendingAccessTitle:  'Pending Access',
    pendingTitle:        '⚠️ Your access is pending approval',
    pendingDesc:         'The administrator has received a notification of your access request.',
    pendingChecking:     '🔄 Checking every 3 seconds…',
    pendingBackToLogin:  'Back to Login',
    pendingApproved:     'Approved!',
    pendingRedirecting:  'Redirecting…',

    // ── Scan page ──────────────────────────────────────────────
    capacity:    'Capacity',
    noQrCode:    'No QR code provided. Use ?qr=CR:xxx or ?qr=VH:xxx',
    tsIn:        'ARRIVING',
    tsOut:       'DEPARTING',
    tsPresent:   'PRESENT',
    resolvingQr: 'Resolving QR…',
    qrInvalid:   'Invalid QR',
    currentTrip: 'CURRENT TRIP',
    inService:   '🟡 IN SERVICE',
    freeStatus:  '🟢 FREE',
    arrivalLabel:   '🛬 Arrival',
    departureLabel: '🛫 Departure',

    // ── Dashboard cards ────────────────────────────────────────
    tripsDesc:         'Manage daily transfers: create, edit, assign passengers and vehicles',
    fleetMonitorDesc:  'Live status of all vehicles: BUSY, FREE, IDLE, DONE with progress bar and ETA',
    crewDesc:          'Crew registry: hotel, Travel_Status (IN / PRESENT / OUT) and departures',
    listsDesc:         'Printable driver lists: TRANSPORT LIST, TRAVEL ARRIVAL, TRAVEL DEPARTURE',
    hubCoverageCardDesc: 'Airport/station coverage: expected vs assigned per hotel, status ✅⚠❌',
    locationsDesc:     'Hotels and hubs: coordinates, meeting point and type',
    qrCodesDesc:       'Generate and print QR codes for vehicles and crew. Driver scans → live card + Wrap Trip.',
    reportsDesc:       'Daily and weekly report: hours worked, pax, trips per vehicle. PDF printable.',
    vehiclesDesc:      'Vehicle fleet: type, capacity, driver and sign code',
    rocketCardDesc:    'Automatically generate all trips for the day: assign crew to vehicles by hotel and department, preview and confirm with one click.',
    systemTitle:       'Transport management system for film productions',
    departuresTomorrow:'departures tomorrow',
    arrivalsTomorrow:  'arrivals tomorrow',
    workflowTitle:     'Workflow:',
    workflowText:      'Add Locations → Vehicles → Crew, then create daily Trips and assign passengers. Transfer Class (ARRIVAL/DEPARTURE/STANDARD) calculated automatically. Use Transport Lists to print driver lists and Hub Coverage to check airport/station coverage. The ARRIVAL→PRESENT cron runs every 5 minutes on Vercel. Drivers use Wrap Trip (/wrap-trip) via vehicle QR to create return trips from set.',

    // ── Push notifications (Navbar toggle — S11 TASK 2) ────────
    notificationsEnable:   'Enable notifications',
    notificationsDisable:  'Disable notifications',
    notificationsBlocked:  'Notifications blocked (check browser settings)',
    notificationsReenable: 'Re-enable notifications',

    // ── Map picker (served from API HTML) ──────────────────────
    mapCancel:  '✕ Cancel',
    mapConfirm: '✓ Use this point',
    mapNoPoint: 'No point selected',
  },

  // ── ITALIAN ────────────────────────────────────────────────
  it: {
    // Common actions
    cancel:            'Annulla',
    save:              'Salva',
    saving:            'Salvataggio…',
    add:               'Aggiungi',
    delete:            'Elimina',
    edit:              'Modifica',
    confirm:           '⚠ Conferma',
    deleting:          'Eliminando…',
    search:            'Cerca…',
    noResults:         'Nessun risultato',
    noResultsFiltered: 'Nessun risultato con i filtri selezionati',
    areYouSure:        'Sicuro?',
    signOut:           'Esci',
    error:             'Errore',
    networkError:      'Errore di rete',
    loading:           'Caricamento…',

    addNew:      '+ Aggiungi',
    saveChanges: '✓ Salva',

    // Crew
    addCrew:           '+ Aggiungi Crew',
    newCrew:           'Nuovo Crew',
    editCrew:          'Modifica Crew',
    noCrew:            'Nessun crew nel database',
    noCrewConfirmed:   'Nessun crew CONFIRMED nel database',
    goToCrew:          '→ Vai a Crew',
    deleteCrew:        '🗑 Elimina Crew',
    deleteCrewConfirm: '⚠ Sicuro? Il membro del crew verrà rimosso.',

    // Vehicles
    newVehicle:           'Nuovo Veicolo',
    editVehicle:          'Modifica Veicolo',
    addVehicleBtn:        '+ Nuovo Veicolo',
    addVehicleBtnAlt:     '+ Aggiungi Veicolo',
    noVehicles:           'Nessun veicolo',
    deleteVehicle:        '🗑 Elimina Veicolo',
    deleteVehicleConfirm: '⚠ Sicuro? Il veicolo verrà rimosso dalla flotta.',
    physicalCapacity:     'Capacità fisica (pax)',
    rocketCapacity:       '🚀 Rocket — Capacità Viaggio',
    noClassLabel:         'Nessuna',
    availabilityDates:    '📅 Date Disponibilità',
    availableFrom:        'Disponibile dal',
    availableTo:          'Disponibile fino al',
    availabilityHint:     'Lascia vuoto = sempre disponibile',
    vehicleNotAvailable:  '⚠ non disponibile in questa data',

    // Locations
    newLocation:           '📍 Nuova Location',
    editLocation:          '📍 Modifica Location',
    addLocationBtn:        '+ Nuova Location',
    noLocations:           'Nessuna location',
    deleteLocation:        '🗑 Elimina Location',
    deleteLocationConfirm: '⚠ Sicuro? Rimuoverà anche tutte le rotte associate.',
    searchGoogleMaps:      '🔍 Cerca su Google Maps',
    chooseOnMap:           '🗺 Scegli posizione su mappa',
    recalculating:         '🔄 Ricalcolo rotte…',
    searchError:           'Errore ricerca',
    routeNetworkError:     '⚠ Errore di rete nel ricalcolo rotte',

    // Trips
    errorSiblingTrip:    'Errore creazione trip sibling',
    differentRoute:      '⚠ Route diversa — diventerà MULTI-STOP',
    newTrip:             'Nuovo Trip',
    editTrip:            'Modifica Trip',
    saveTrip:            '✓ Salva Trip',
    noVehicle:           'Nessun veicolo',
    noPaxAssigned:       'Nessun passeggero assegnato',
    noTripsDate:         'Nessun trip per questa data',
    loadingPax:          'Caricamento passeggeri…',
    assignedSection:     '✓ ASSEGNATI',
    availableSection:    'DISPONIBILI',
    noEligibleCrew:      'Nessun crew compatibile (controlla hotel e Travel_Status)',
    selectPickupFirst:   'Seleziona pickup e dropoff prima',
    noCrewStatus:        'Nessun crew — controlla Travel_Status',
    addToExistingTrip:   '📋 AGGIUNGI A TRIP ESISTENTE',
    compatible:          '⭐ Compatibile',
    otherMultiStop:      '⚠ Altro (multi-stop)',
    orCreateBelow:       '— oppure crea un nuovo trip qui sotto —',
    deleteTripConfirm:   'Conferma eliminazione?',
    yesDelete:           'Sì, elimina',
    assigningLabel:      'Assegnazione:',
    noCompatibleTrips:   'Nessun trip compatibile — Sidebar Nuovo Trip aperta',
    dismiss:             '✕ chiudi',
    today:               'Oggi',
    allVehicles:         'Tutti i veicoli',
    passengers:          'Passeggeri',

    // Pax Coverage
    noCrewConfirmedDb:       'Nessun crew CONFIRMED nel database',
    goToCrewLink:            '→ Vai a Crew',
    allDepts:                'Tutti i reparti',
    allHotels:               'Tutti gli hotel',
    transferCoverage:        'Copertura transfer',
    totalCrewLabel:          'Crew totale',
    withTransfer:            'Con transfer',
    withoutTransfer:         'Senza transfer',
    withoutTransferSection:  'SENZA TRANSFER',
    withAssignedTransfer:    'CON TRANSFER ASSEGNATO',
    assignBtn:               '+ Assegna',
    goToTrips:               'Vai a Trips →',

    // Hub Coverage
    noCrewInOut:       'Nessun crew con travel_status IN o OUT',
    hubCoverageDesc:   'Hub Coverage mostra i crew con travel_status IN (in arrivo) o OUT (in partenza) e verifica se hanno un trip ARRIVAL/DEPARTURE assegnato per la data selezionata',
    hubCoverageLabel:  'Copertura hub',
    expectedLabel:     'Attesi',
    coveredLabel:      'Coperti',
    missingLabel:      'Mancanti',
    missingSection:    'MANCANTI',
    coveredSection:    'COPERTI',
    noTripAssignedFor: 'nessun trip assegnato per',

    // QR Codes
    noVehiclesQr:      'Nessun veicolo trovato. Aggiungili in',
    noCrewConfirmedQr: 'Nessun crew CONFIRMED trovato.',
    qrStep1: 'Seleziona data / call time / pickup location (dove si trova adesso)',
    qrStep2: 'Seleziona i passeggeri che sono in macchina',
    qrStep3: 'Conferma → il sistema crea automaticamente un trip per ogni hotel di destinazione',

    // Pending
    pendingAccessTitle:  'Accesso in Attesa',
    pendingTitle:        '⚠️ Il tuo accesso è in attesa di approvazione',
    pendingDesc:         "L'amministratore ha ricevuto una notifica della tua richiesta di accesso.",
    pendingChecking:     '🔄 Verifico ogni 3 secondi…',
    pendingBackToLogin:  'Torna al Login',
    pendingApproved:     'Approvato!',
    pendingRedirecting:  'Reindirizzamento in corso…',

    // Scan
    capacity:    'Capacità',
    noQrCode:    'Nessun codice QR fornito. Usa ?qr=CR:xxx o ?qr=VH:xxx',
    tsIn:        'IN ARRIVO',
    tsOut:       'IN PARTENZA',
    tsPresent:   'PRESENTE',
    resolvingQr: 'Risoluzione QR…',
    qrInvalid:   'QR non valido',
    currentTrip: 'TRIP CORRENTE',
    inService:   '🟡 IN SERVIZIO',
    freeStatus:  '🟢 LIBERO',
    arrivalLabel:   '🛬 Arrivo',
    departureLabel: '🛫 Partenza',

    // Dashboard cards
    tripsDesc:           'Gestione transfer giornalieri: crea, modifica, assegna passeggeri e veicoli',
    fleetMonitorDesc:    'Stato live di tutti i veicoli: BUSY, FREE, IDLE, DONE con progress bar e ETA',
    crewDesc:            'Anagrafica crew: hotel, Travel_Status (IN / PRESENT / OUT) e partenze',
    listsDesc:           'Liste stampabili per driver: TRANSPORT LIST, TRAVEL ARRIVAL, TRAVEL DEPARTURE',
    hubCoverageCardDesc: 'Copertura aeroporto/stazione: expected vs assigned per hotel, status ✅⚠❌',
    locationsDesc:       'Hotels e hub: coordinate, meeting point e tipo',
    qrCodesDesc:         'Genera e stampa QR per veicoli e crew. Driver scansiona → scheda live + Wrap Trip.',
    reportsDesc:         'Report giornaliero e settimanale: ore lavorate, pax, trip per veicolo. Stampabile PDF.',
    vehiclesDesc:        'Flotta veicoli: tipo, capacità, driver e sign code',
    rocketCardDesc:      'Genera automaticamente tutti i trip del giorno: assegna crew ai veicoli per hotel e dipartimento, anteprima e conferma con un click.',
    systemTitle:         'Sistema di gestione transfer per produzioni cinematografiche',
    departuresTomorrow:  'partenze domani',
    arrivalsTomorrow:    'arrivi domani',
    workflowTitle:       'Workflow:',
    workflowText:        'Aggiungi Locations → Vehicles → Crew, poi crea i Trips del giorno e assegna passeggeri. Transfer Class (ARRIVAL/DEPARTURE/STANDARD) calcolato automaticamente. Usa Transport Lists per stampare le liste driver e Hub Coverage per verificare la copertura aeroporto/stazione. Il cron ARRIVAL→PRESENT gira ogni 5 minuti su Vercel. I driver usano Wrap Trip (/wrap-trip) via QR veicolo per creare trip di rientro dal set.',

    // ── Push notifications (Navbar toggle — S11 TASK 2) ────────
    notificationsEnable:   'Attiva notifiche',
    notificationsDisable:  'Disattiva notifiche',
    notificationsBlocked:  'Notifiche bloccate (controlla impostazioni browser)',
    notificationsReenable: 'Riattiva notifiche',

    // Map picker
    mapCancel:  '✕ Annulla',
    mapConfirm: '✓ Usa questo punto',
    mapNoPoint: 'Nessun punto selezionato',
  },
}

// ─── Context ────────────────────────────────────────────────
const LanguageContext = createContext({
  lang:    DEFAULT_LOCALE,
  setLang: () => {},
})

// ─── Provider ───────────────────────────────────────────────
export function LanguageProvider({ children }) {
  const [lang, setLangState] = useState(DEFAULT_LOCALE)

  // Read saved preference from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored && SUPPORTED_LOCALES.includes(stored)) {
        setLangState(stored)
      }
    } catch { /* localStorage not available (SSR) */ }
  }, [])

  function setLang(newLang) {
    if (!SUPPORTED_LOCALES.includes(newLang)) return
    setLangState(newLang)
    try { localStorage.setItem(STORAGE_KEY, newLang) } catch { /* ignore */ }
  }

  return (
    <LanguageContext.Provider value={{ lang, setLang }}>
      {children}
    </LanguageContext.Provider>
  )
}

// ─── Hooks ──────────────────────────────────────────────────

/** Returns { lang, setLang } — use in Navbar for the toggle */
export function useLanguage() {
  return useContext(LanguageContext)
}

/**
 * Returns the translation object for the current language.
 * Usage: const t = useT()  →  t.cancel, t.newVehicle, ...
 * Falls back to English for any missing key.
 */
export function useT() {
  const { lang } = useLanguage()
  const base = translations[DEFAULT_LOCALE]
  const locale = translations[lang] || {}
  // Merge so missing keys always fall back to English
  return { ...base, ...locale }
}
