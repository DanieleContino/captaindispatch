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
    deleteSelected:         '🗑 Delete selected',
    selectedCount:          'selected',
    cancelSelection:        '✕ Cancel selection',
    deleteSelectedConfirm:  '⚠ Are you sure? This will permanently delete {n} vehicle(s).',
    selectAll:              'Select all',
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

    // ── Import from file — S12 ──────────────────────────────────
    importFromFile: '📂 Import from file',

    // ── NTN / Self Drive — S15 ──────────────────────────────────
    noTransportNeeded:  'No Transport Needed',
    ntnShort:           'NTN',
    ntnSection:         'No Transport Needed',
    selfDrive:          'Self Drive',
    ntnCoverageNote:    'Self Drive / NTN — excluded from coverage',

    // ── Sidebar shared ───────────────────────────────────────────
    dangerZone:          'Danger Zone',

    // ── Crew sidebar ─────────────────────────────────────────────
    crewIdHint:          'Auto-generated · editable if needed · used for QR code',
    fullNameLabel:       'Full Name',
    departmentLabel:     'Department',
    ntnExcludedHint:     'Excluded from Rocket auto-assignment',
    hotelLocationLabel:  'Hotel / Location',
    hotelStatusLabel:    'Hotel Status',
    travelStatusLabel:   'Travel Status',
    arrivalDateLabel:    'Arrival Date',
    departureDateLabel:  'Departure Date',
    notesLabel:          'Notes',
    notesPlaceholder:    'Notes, special requests…',

    // ── Vehicle sidebar ──────────────────────────────────────────
    vehicleTypeLabel:    'Type',
    vehicleClassLabel:   'Vehicle Class',
    licensePlateLabel:   'License Plate',
    driverLabel:         'Driver',
    signCodeLabel:       'Sign Code',
    unitDefaultLabel:    'Unit Default',
    vehicleIdHint:       'Format: VAN-01, BUS-20, CAR-05 — used in Trips and Fleet Monitor',
    vehicleActive:       '✅ Vehicle active — visible in Fleet Monitor',
    vehicleInactive:     '⏸ Vehicle inactive — hidden from Fleet Monitor',

    // ── Location sidebar ─────────────────────────────────────────
    locationIdLabel:         'Location ID',
    locationNameLabel:       'Name',
    locationIdHint:          'Hotels: H001, H002… · Airports: APT_XXX · Stations: STN_XXX · Ports: PRT_XXX',
    isHubLabel:              '✈ Hub (Airport / Station / Port)',
    isHotelLabel:            '🏨 Hotel / Normal Location',
    isHubHint:               'ID starts with APT_ STN_ PRT_ — Transfer class calculated automatically',
    isHotelHint:             'Pickup/dropoff location for crew',
    latitudeLabel:           'Latitude',
    longitudeLabel:          'Longitude',
    coordDecimalHint:        '⚠ Use a dot as decimal separator (not comma). Coordinates used for Haversine fallback.',
    defaultPickupPointLabel: 'Default Pickup Point',
    mapPickerHint:           'Click on the desired point, then "✓ Use this point"',

    // ── Productions page ──────────────────────────────────────
    productionsTitle:               '🎬 Productions',
    productionsDesc:                'Manage your productions and set the active one for your account.',
    productionsYours:               'Your Productions',
    productionsNewBtn:              '+ New Production',
    productionsNone:                'No productions yet',
    productionsNoneDesc:            'Create your first production to get started',
    productionsActiveLabel:         'ACTIVE PRODUCTION',
    productionsViewTransportList:   '→ View Transport List',
    productionsActivateBtn:         '↔ Activate',
    productionsEditBtn:             '✎ Edit',
    productionsSaveChanges:         '✓ Save Changes',
    productionsCreate:              '🎬 Create Production',
    productionsCreatingBtn:         'Creating…',
    productionsChooseLogo:          '📁 Choose Logo',
    productionsUploadLogo:          '📁 Upload Logo',
    productionsLogoHint:            'PNG, JPG, SVG — max 2 MB',
    productionsNewTitle:            '🎬 New Production',
    productionsInfoTitle:           'ℹ How multi-production works',
    productionsInfoLine1:           'Each production has its own trips, crew, vehicles and locations — completely separate',
    productionsInfoLine2:           'Click "↔ Activate" to switch to a different production — all pages will use that ID',
    productionsInfoLine3:           'All header fields (contacts, set, basecamp, call time) appear in the Transport List',
    productionsInfoLine4:           'Logos are stored in Supabase Storage bucket',
    productionsNameLabel:           'Production Name *',
    productionsSlugLabel:           'Slug (URL)',
    productionsScheduleSection:     'Schedule',
    productionsCallTimeLabel:       'General Call Time',
    productionsShootDayLabel:       'Shoot Day',
    productionsRevisionLabel:       'Revision',
    productionsKeyCreativesSection: 'Key Creatives',
    productionsDirectorLabel:       'Director',
    productionsProducerLabel:       'Producer',
    productionsProdTeamSection:     'Production Team',
    productionsPmNameLabel:         'Production Manager — Name',
    productionsPmPhoneLabel:        'Production Manager — Phone',
    productionsPcNameLabel:         'Production Coordinator — Name',
    productionsPcPhoneLabel:        'Production Coordinator — Phone',
    productionsTranspTeamSection:   'Transportation Team',
    productionsTcNameLabel:         'Transportation Coordinator — Name',
    productionsTcPhoneLabel:        'Transportation Coordinator — Phone',
    productionsCaptNameLabel:       'Transportation Captain — Name',
    productionsCaptPhoneLabel:      'Transportation Captain — Phone',
    productionsOfficePhoneLabel:    'Production Office — Phone',
    productionsSetBasecampSection:  'Set & Basecamp',
    productionsSetNameLabel:        'Set Location — Name',
    productionsSetAddressLabel:     'Set Location — Address',
    productionsBasecampLabel:       'Basecamp',
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
    deleteSelected:         '🗑 Elimina selezionati',
    selectedCount:          'selezionati',
    cancelSelection:        '✕ Annulla selezione',
    deleteSelectedConfirm:  '⚠ Sicuro? Verranno eliminati {n} veicolo/i definitivamente.',
    selectAll:              'Seleziona tutti',
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

    // ── Import from file — S12 ──────────────────────────────────
    importFromFile: '📂 Importa da file',

    // ── NTN / Self Drive — S15 ──────────────────────────────────
    noTransportNeeded:  'Nessun Trasporto Necessario',
    ntnShort:           'NTN',
    ntnSection:         'Nessun trasporto necessario',
    selfDrive:          'Guida Autonoma',
    ntnCoverageNote:    'Guida Autonoma / NTN — esclusi dalla copertura',

    // ── Sidebar shared ───────────────────────────────────────────
    dangerZone:          'Zona pericolosa',

    // ── Crew sidebar ─────────────────────────────────────────────
    crewIdHint:          'Auto-generato · modificabile se necessario · usato per QR code',
    fullNameLabel:       'Nome Completo',
    departmentLabel:     'Dipartimento',
    ntnExcludedHint:     "Escluso dall'assegnazione automatica Rocket",
    hotelLocationLabel:  'Hotel / Location',
    hotelStatusLabel:    'Stato Hotel',
    travelStatusLabel:   'Travel Status',
    arrivalDateLabel:    'Data Arrivo',
    departureDateLabel:  'Data Partenza',
    notesLabel:          'Note',
    notesPlaceholder:    'Note, richieste speciali…',

    // ── Vehicle sidebar ──────────────────────────────────────────
    vehicleTypeLabel:    'Tipo',
    vehicleClassLabel:   'Classe Veicolo',
    licensePlateLabel:   'Targa',
    driverLabel:         'Driver',
    signCodeLabel:       'Sign Code',
    unitDefaultLabel:    'Unit Default',
    vehicleIdHint:       'Formato: VAN-01, BUS-20, CAR-05 — usato in Trips e Fleet Monitor',
    vehicleActive:       '✅ Veicolo attivo — visibile in Fleet Monitor',
    vehicleInactive:     '⏸ Veicolo inattivo — nascosto da Fleet Monitor',

    // ── Location sidebar ─────────────────────────────────────────
    locationIdLabel:         'Location ID',
    locationNameLabel:       'Nome',
    locationIdHint:          'Hotels: H001, H002… · Aeroporti: APT_XXX · Stazioni: STN_XXX · Porti: PRT_XXX',
    isHubLabel:              '✈ Hub (Aeroporto / Stazione / Porto)',
    isHotelLabel:            '🏨 Hotel / Location normale',
    isHubHint:               'ID inizia con APT_ STN_ PRT_ — Transfer class calcolato automaticamente',
    isHotelHint:             'Luogo di pickup/dropoff per crew',
    latitudeLabel:           'Latitudine',
    longitudeLabel:          'Longitudine',
    coordDecimalHint:        '⚠ Usa il punto come separatore decimale (non la virgola). Coordinate usate per Haversine fallback.',
    defaultPickupPointLabel: 'Punto di Raccolta Predefinito',
    mapPickerHint:           'Clicca sul punto desiderato, poi "✓ Usa questo punto"',

    // ── Productions page ──────────────────────────────────────
    productionsTitle:               '🎬 Produzioni',
    productionsDesc:                'Gestisci le produzioni e imposta quella attiva per il tuo account.',
    productionsYours:               'Le tue Produzioni',
    productionsNewBtn:              '+ Nuova Produzione',
    productionsNone:                'Nessuna produzione',
    productionsNoneDesc:            'Crea la tua prima produzione per iniziare',
    productionsActiveLabel:         'PRODUZIONE ATTIVA',
    productionsViewTransportList:   '→ Vedi Transport List',
    productionsActivateBtn:         '↔ Attiva',
    productionsEditBtn:             '✎ Modifica',
    productionsSaveChanges:         '✓ Salva Modifiche',
    productionsCreate:              '🎬 Crea Produzione',
    productionsCreatingBtn:         'Creando…',
    productionsChooseLogo:          '📁 Scegli Logo',
    productionsUploadLogo:          '📁 Carica Logo',
    productionsLogoHint:            'PNG, JPG, SVG — max 2 MB',
    productionsNewTitle:            '🎬 Nuova Produzione',
    productionsInfoTitle:           'ℹ Come funziona il multi-produzione',
    productionsInfoLine1:           'Ogni produzione ha i propri trip, crew, veicoli e location — completamente separati',
    productionsInfoLine2:           'Clicca "↔ Attiva" per cambiare produzione — tutte le pagine useranno quell\'ID',
    productionsInfoLine3:           'Tutti i campi header (contatti, set, basecamp, call time) compaiono nel Transport List',
    productionsInfoLine4:           'I loghi sono salvati nel bucket Supabase Storage',
    productionsNameLabel:           'Nome Produzione *',
    productionsSlugLabel:           'Slug (URL)',
    productionsScheduleSection:     'Pianificazione',
    productionsCallTimeLabel:       'Call Time Generale',
    productionsShootDayLabel:       'Giorno di Ripresa',
    productionsRevisionLabel:       'Revisione',
    productionsKeyCreativesSection: 'Creativi Chiave',
    productionsDirectorLabel:       'Regista',
    productionsProducerLabel:       'Produttore',
    productionsProdTeamSection:     'Team di Produzione',
    productionsPmNameLabel:         'Production Manager — Nome',
    productionsPmPhoneLabel:        'Production Manager — Tel',
    productionsPcNameLabel:         'Production Coordinator — Nome',
    productionsPcPhoneLabel:        'Production Coordinator — Tel',
    productionsTranspTeamSection:   'Team Trasporti',
    productionsTcNameLabel:         'Transportation Coordinator — Nome',
    productionsTcPhoneLabel:        'Transportation Coordinator — Tel',
    productionsCaptNameLabel:       'Transportation Captain — Nome',
    productionsCaptPhoneLabel:      'Transportation Captain — Tel',
    productionsOfficePhoneLabel:    'Ufficio di Produzione — Tel',
    productionsSetBasecampSection:  'Set & Basecamp',
    productionsSetNameLabel:        'Set — Nome',
    productionsSetAddressLabel:     'Set — Indirizzo',
    productionsBasecampLabel:       'Basecamp',
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
