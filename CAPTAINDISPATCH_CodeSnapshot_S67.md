# CAPTAINDISPATCH — Code Snapshot S67

---

## lib/production.js

```js
/**
 * lib/production.js
 * Gestione dinamica della production attiva.
 * Le sub-page leggono ancora process.env ma il switcher aggiorna localStorage + reload.
 */

const ENV_ID = process.env.NEXT_PUBLIC_PRODUCTION_ID

/** Legge production_id: prima localStorage, poi env var */
export function getProductionId() {
  if (typeof window === 'undefined') return ENV_ID || ''
  return localStorage.getItem('captainProductionId') || ENV_ID || ''
}

/** Imposta la production attiva (client-side) + ricarica la pagina */
export function switchProduction(id) {
  if (typeof window === 'undefined') return
  if (id) {
    localStorage.setItem('captainProductionId', id)
  } else {
    localStorage.removeItem('captainProductionId')
  }
  window.location.href = '/dashboard'
}

/** Rimuove l'override → torna all'env var */
export function clearProductionOverride() {
  if (typeof window !== 'undefined') localStorage.removeItem('captainProductionId')
}
```

---

## lib/supabase.js

```js
import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  )
}

export const supabase = createClient()
```

---

## lib/i18n.js

```js
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
    arrivalLabel:   '🏨 Arrival',
    departureLabel: '🧳 Departure',

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
    roleLabel:           'Role / Job Title',
    departmentLabel:     'Department',
    ntnExcludedHint:     'Excluded from Rocket auto-assignment',
    crewContactInfo:     'Contact Info',
    crewEmailLabel:      'Email',
    crewPhoneLabel:      'Phone',
    crewNoContact:       'No contact info',
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
    productionsLogoLabel:           'Production Logo',
    productionsDeleteBtn:             '🗑 Delete',
    productionsDeleteModalTitle:      '⚠️ Delete Production',
    productionsDeleteWarning:         'This action is permanent and cannot be undone. The following data will be permanently deleted:',
    productionsDeleteDataItems:       'All trips · All crew · All vehicles · All locations · All routes · All Rocket templates · All invite codes · Production settings and logo',
    productionsDeleteArchiveCheck:    'I have downloaded the archive backup',
    productionsDeleteNameLabel:       'Type the production name to confirm:',
    productionsDeleteNamePlaceholder: 'Type production name…',
    productionsDeleteConfirmBtn:      '🗑 Delete Production',
    productionsDeleteDeletingBtn:     'Deleting…',
    productionsDeleteDownloadFirst:   '📥 Download Archive',

    // ── Rocket page ──────────────────────────────────────────
    rocketSubtitle:           'Trip Generator v2',
    rocketStepSetup:          'Setup',
    rocketStepPreview:        'Preview',
    rocketStepDone:           'Done',
    rocketEditSetup:          '← Edit Setup',
    rocketCreating:           '⏳ Creating…',
    rocketTripConfig:         '⚙️ Trip Configuration',
    rocketTemplatesBtn:       '📋 Templates',
    rocketDateLabel:          'Date',
    rocketDefaultDest:        'Default Destination',
    rocketDefaultCall:        'Default Call Time',
    rocketPickupHint:         'Pickup = call − route duration',
    rocketServiceTypeLabel:   'Service Type',
    rocketDeptDest:           '🎯 Dept Destinations',
    rocketResetAll:           '↩ Reset all',
    rocketOverride:           'override',
    rocketOverrides:          'overrides',
    rocketCrewLabel:          '👥 Crew',
    rocketCrewSelected:       'selected',
    rocketCrewEligible:       'eligible',
    rocketResetTimes:         'Reset times',
    rocketExpandAll:          'Expand all',
    rocketCollapse:           'Collapse',
    rocketNoDept:             '— No Department —',
    rocketNoEligibleCrew:     'No eligible crew',
    rocketNoEligibleHint:     'travel_status = PRESENT + hotel_status = CONFIRMED',
    rocketNoVehicles:         'No active vehicles —',
    rocketAddVehicles:        'add vehicles',
    rocketLoadingData:        'Loading fleet and crew data…',
    rocketDraftPlan:          '📋 Draft Plan',
    rocketNoTrips:            'No trips generated',
    rocketTripsCreated:       'Trips Created!',
    rocketNewRun:             '🔄 New Rocket Run',
    rocketViewTrips:          '📋 View Trips',
    rocketFleetMonitor:       '🚦 Fleet Monitor',
    rocketWhyExcluded:        'Why excluded?',
    rocketExcludedLabel:      'excluded from this run',
    rocketNoReasonNoted:      'no reason noted',
    rocketReloadLast:         'Reload last run?',
    rocketHistoricalSugg:     'Historical Suggestions',
    rocketSameServiceType:    'same service type',
    rocketNoDriver:           'No driver',
    rocketIncluded:           '✅ Included',
    rocketExcluded:           '☐ Excluded',
    rocketIncludeInRun:       'Include in run',
    rocketCallTimeLabel:      'Call Time',
    rocketMovePassenger:      'Move passenger',
    rocketRemoveFromAll:      '↩ Remove from all trips',
    rocketAutoSplit:          'auto-split on confirm',
    rocketAllArrive:          '🏁 all arrive',
    rocketNoPassengers:       'No passengers',
    rocketMoveBtn:            'Move ›',
    rocketCancelBtn:          'Cancel',
    rocketDoneBtn:            '✓ Done',
    rocketSaveCurrentConfig:  'Save current configuration',
    rocketSaveLocally:        '💾 Save locally',
    rocketShareTeam:          '☁️ Share with team',
    rocketSharedTemplates:    '☁️ Shared with team',
    rocketLocalTemplates:     '💾 Local',
    rocketNoSharedTpl:        'No shared templates yet.',
    rocketNoLocalTpl:         'No local templates yet.',
    rocketVisibleAllCaptains: '· visible to all Captains',
    rocketStoredOnDevice:     '· stored on this device only',
    rocketDeptHint:           'Crew without dept always use the default.',
    rocketSelectedCount:      'selected',
    rocketExcludedCount:      'excluded',
    rocketCallOverrides:      'call override',
    rocketHotels:             'hotels',
    rocketDepts:              'depts',
    rocketBasedOnPast:        'hints based on past',
    rocketRuns:               'runs',
    rocketNoVehicleRow:       'NO VEHICLE — use Move ›',
    rocketIncludeBtn:         'Include',
    rocketNoCrewFound:        'No crew found',

    // ── S18 pages ────────────────────────────────────────────

    // Fleet Monitor
    fleetMonitorTitle:      '🚦 Fleet Monitor',
    fleetInProgress:        'IN PROGRESS',
    fleetNextTrip:          'NEXT TRIP',
    fleetLastTrip:          'LAST TRIP',
    fleetNoTripsToday:      'No trips scheduled today',
    fleetNoActiveVehicles:  'No active vehicles',
    fleetAddVehiclesHint:   '→ Add vehicles on the Vehicles page',
    fleetRefreshBtn:        'Refresh',
    fleetRefreshing:        'Refreshing…',
    fleetTrafficBtn:        'Traffico',
    fleetLegendTitle:       'LEGEND',
    fleetTripsWithoutVehicle: 'Trips without vehicle',
    fleetAssignLink:        'Assign →',
    fleetLoadingLabel:      'Loading Fleet Monitor…',
    fleetReturning:         'Dropoff done — returning',
    fleetTripsToday:        'trips today',
    fleetStartLabel:        'Start',
    fleetEndLabel:          'End',
    fleetTotalPax:          'total pax',
    fleetViewingDate:       'Viewing:',
    fleetStatusBasedOn:     'BUSY/FREE status based on current time',

    // Reports
    reportsTitle:           '📊 Fleet Reports',
    reportsDaily:           'Daily',
    reportsWeekly:          'Weekly',
    reportsPrintBtn:        '🖨 Print / PDF',
    reportsNoTrips:         'No trips for this period',
    reportsDailyTotal:      'DAILY TOTAL',
    reportsWeeklyVehicle:   'VEHICLE',
    reportsWeeklyTotal:     'TOTALE',
    reportsWeeklyNoVehicles: 'No vehicles with trips this week',
    reportsTotalPerDay:     'TOTAL / DAY',
    reportsPrinted:         'Printed:',
    reportsColCall:         'CALL',
    reportsColTrip:         'TRIP',
    reportsColClass:        'CLASSE',
    reportsColFrom:         'FROM',
    reportsColTo:           'TO',
    reportsColDur:          'DUR',
    reportsColPax:          'PAX',
    reportsColStatus:       'STATUS',
    reportsNoVehicle:       'No vehicle',

    // Bridge
    bridgeTitle:            '⚓ Captain Bridge',
    bridgeDesc:             'Manage who accesses CaptainDispatch — approve pending users and control invite codes.',
    bridgePendingTab:       '👥 Pending Users',
    bridgeInvitesTab:       '🔑 Invite Codes',
    bridgePendingUsers:     'Pending Users',
    bridgePendingDesc:      'Users who signed up and are waiting for access',
    bridgeInviteCodesTitle: 'Invite Codes',
    bridgeAccessDenied:     'Access Denied',
    bridgeAccessDeniedDesc: 'Captain Bridge is only available to CAPTAIN and ADMIN users.',
    bridgeBackDashboard:    '← Back to Dashboard',
    bridgeNoPending:        'No pending users',
    bridgeNoPendingDesc:    'Everyone who signed up has been handled.',
    bridgeRefreshBtn:       '↺ Refresh',
    bridgeUsersWaiting:     'users waiting',
    bridgeSignedUp:         'Signed up',
    bridgeSandboxBtn:       '✓ Sandbox',
    bridgeAddToProdBtn:     '⊕ Add to prod',
    bridgeIgnoreBtn:        '✕ Ignore',
    bridgeAddToProdTitle:   '⊕ Add to Production',
    bridgeAddToProdDesc:    'will be added with the selected role.',
    bridgeProductionLabel:  'Production',
    bridgeRoleLabel:        'Role',
    bridgeAddUserBtn:       '✓ Add User',
    bridgeAddingBtn:        'Adding…',
    bridgeNewCodeBtn:       '+ New Code',
    bridgeNewCodeTitle:     '🔑 New Invite Code',
    bridgeNoInvites:        'No invite codes yet',
    bridgeNoInvitesDesc:    'Create a code to let people join a specific production instantly.',
    bridgeCreateFirstCode:  '+ Create First Code',
    bridgeProdLabel:        'Production *',
    bridgeRoleAssignedLabel: 'Role assigned',
    bridgeCodeLabel:        'Code (blank = auto-generate)',
    bridgeLabelOptLabel:    'Label (optional)',
    bridgeMaxUsesLabel:     'Max uses (blank = unlimited)',
    bridgeExpiresLabel:     'Expires (blank = never)',
    bridgeCreatingBtn:      'Creating…',
    bridgeCreateCodeBtn:    '🔑 Create Code',
    bridgePauseBtn:         '⏸ Pause',
    bridgeEnableBtn:        '▶ Enable',
    bridgeUsesLabel:        'Uses:',
    bridgeNoExpiry:         'No expiry',
    bridgeCreatedLabel:     'Created',
    bridgeHowWorksTitle:    '⚓ How Captain Bridge works',
    bridgeDeleteConfirm:    'Delete this invite code?',

    // QR Codes
    qrCodesTitle:       '📱 QR Codes',
    qrVehicles:         '🚐 Veicoli',
    qrCrew:             '🎬 Crew',
    qrPrintBtn:         '🖨 Stampa / PDF',
    qrHowToTitle:       '📱 Come usare Wrap Trip sul mobile',
    qrNoVehicles:       'Nessun veicolo trovato. Aggiungili in',
    qrNoCrewConfirmed:  'Nessun crew CONFIRMED trovato.',
    qrLoading:          'Caricamento…',

    // Lists
    listsTitle:              '📋 Transport Lists',
    listsPrintBtn:           '🖨 Print / PDF',
    listsEditHeader:         '⚙️ Edit Header',
    listsTodayBtn:           'Today',
    listsNoTrips:            'No trips for',
    listsTripsCount:         'trips',
    listsPaxCount:           'pax',
    listsColTime:            'TIME',
    listsColCall:            'CALL',
    listsColVeh:             'VEH.',
    listsColDriver:          'DRIVER',
    listsColRoute:           'ROUTE & CREW',
    listsColPax:             'PAX',
    listsColCap:             'CAP',
    listsSectionTransport:   '🚌 TRANSPORT LIST',
    listsSectionArrivals:    '✈ 🛬 TRAVEL LIST — ARRIVALS',
    listsSectionDepartures:  '✈ 🛫 TRAVEL LIST — DEPARTURES',
    listsConfidential:       'Confidential — Not for Distribution',
    listsGeneratedBy:        'Generated by CaptainDispatch',
    listsNoActiveProd:       'No active production.',

    // Settings/Production
    settingsTitle:          '⚙️ Production Settings',
    settingsDesc:           'These details appear in the Transport List header. All fields are optional except Production Name.',
    settingsSaveBtn:        '💾 Save Production Settings',
    settingsSavingBtn:      'Saving…',
    settingsSavedMsg:       '✅ Production settings saved successfully!',
    settingsBackBtn:        '← Back to Productions',
    settingsTip:            'After saving, go to Transport Lists to see the header with all your production details.',
    settingsNoProduction:   'No active production selected. Go to Productions and activate one first.',

    // ImportModal
    importTitle:            '📂 Import from file',
    importModeLabel:        'Import mode',
    importFleetMode:        '🚗 Fleet list',
    importCrewMode:         '👥 Crew list',
    importCustomMode:       '✏️ Custom instructions…',
    importDragDrop:         'Drag & drop or click to browse',
    importAccepted:         'Accepted: .xlsx, .xls, .csv, .pdf, .docx',
    importExtracting:       'Extracting data…',
    importClaudeAnalyzing:  'Claude is analyzing your file',
    importSaving:           'Saving…',
    importDone:             'Import complete!',
    importCloseBtn:         'Close',
    importBackBtn:          '← Back',
    importCancelBtn:        'Cancel',
    importConfirmBtn:       '✓ Confirm import',
    importRowsFound:        'rows found',
    importNewLabel:         'new',
    importUpdateLabel:      'update',
    importSkipLabel:        'skip',
    importNeedReview:       'need review',
    importNotRecognized:    'not recognized',
    importRowsNotRecognized: 'rows not recognized',
    importNewHotelsTitle:   '🏨 New hotels detected — not found in Locations',
    importAddToLocations:   '+ Add to Locations',
    importSkipHotel:        'Skip',
    importInserted:         'inserted',
    importUpdated:          'updated',
    importSkipped:          'skipped',
    importLegendNew:        '✅ New',
    importLegendDup:        '🔁 Duplicate',
    importLegendMissing:    '⚠️ Missing fields',
    importLegendUnrecognized: '❌ Not recognized',

    // pending (fix residui)
    pendingInviteLabel:      '🔑 Have an invite code?',
    pendingEnterBtn:         '→ Enter',
    pendingInvitePlaceholder: 'e.g. CREW-X7K2',
    pendingJoinedMsg:        'Joined',
    pendingRedirectingMsg:   'Redirecting…',

    // scan (fix residui)
    scanHotelLabel:       'Hotel',
    scanHotelStatus:      'Hotel Status',
    scanDriverLabel:      '👤 Driver',
    scanSearchPlaceholder: 'Search…',
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
    arrivalLabel:   '🏨 Arrivo',
    departureLabel: '🧳 Partenza',

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

    // Push notifications
    notificationsEnable:   'Attiva notifiche',
    notificationsDisable:  'Disattiva notifiche',
    notificationsBlocked:  'Notifiche bloccate (controlla impostazioni browser)',
    notificationsReenable: 'Riattiva notifiche',

    // Map picker
    mapCancel:  '✕ Annulla',
    mapConfirm: '✓ Usa questo punto',
    mapNoPoint: 'Nessun punto selezionato',

    importFromFile: '📂 Importa da file',

    noTransportNeeded:  'Nessun Trasporto Necessario',
    ntnShort:           'NTN',
    ntnSection:         'Nessun trasporto necessario',
    selfDrive:          'Guida Autonoma',
    ntnCoverageNote:    'Guida Autonoma / NTN — esclusi dalla copertura',

    dangerZone:          'Zona pericolosa',

    crewIdHint:          'Auto-generato · modificabile se necessario · usato per QR code',
    fullNameLabel:       'Nome Completo',
    roleLabel:           'Ruolo / Posizione',
    departmentLabel:     'Dipartimento',
    ntnExcludedHint:     "Escluso dall'assegnazione automatica Rocket",
    crewContactInfo:     'Contatti',
    crewEmailLabel:      'Email',
    crewPhoneLabel:      'Telefono',
    crewNoContact:       'Nessun contatto',
    hotelLocationLabel:  'Hotel / Location',
    hotelStatusLabel:    'Stato Hotel',
    travelStatusLabel:   'Travel Status',
    arrivalDateLabel:    'Data Arrivo',
    departureDateLabel:  'Data Partenza',
    notesLabel:          'Note',
    notesPlaceholder:    'Note, richieste speciali…',

    vehicleTypeLabel:    'Tipo',
    vehicleClassLabel:   'Classe Veicolo',
    licensePlateLabel:   'Targa',
    driverLabel:         'Driver',
    signCodeLabel:       'Sign Code',
    unitDefaultLabel:    'Unit Default',
    vehicleIdHint:       'Formato: VAN-01, BUS-20, CAR-05 — usato in Trips e Fleet Monitor',
    vehicleActive:       '✅ Veicolo attivo — visibile in Fleet Monitor',
    vehicleInactive:     '⏸ Veicolo inattivo — nascosto da Fleet Monitor',

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

    // Productions
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
    productionsLogoLabel:           'Logo Produzione',
    productionsDeleteBtn:             '🗑 Elimina',
    productionsDeleteModalTitle:      '⚠️ Elimina Produzione',
    productionsDeleteWarning:         'Questa azione è permanente e non può essere annullata. I seguenti dati verranno eliminati definitivamente:',
    productionsDeleteDataItems:       'Tutti i trip · Tutto il crew · Tutti i veicoli · Tutte le location · Tutte le rotte · Tutti i template Rocket · Tutti i codici invito · Impostazioni e logo della produzione',
    productionsDeleteArchiveCheck:    "Ho scaricato il backup dell'archivio",
    productionsDeleteNameLabel:       'Digita il nome della produzione per confermare:',
    productionsDeleteNamePlaceholder: 'Digita il nome della produzione…',
    productionsDeleteConfirmBtn:      '🗑 Elimina Produzione',
    productionsDeleteDeletingBtn:     'Eliminando…',
    productionsDeleteDownloadFirst:   "📥 Scarica l'Archivio",

    // Rocket
    rocketSubtitle:           'Generatore Trip v2',
    rocketStepSetup:          'Configurazione',
    rocketStepPreview:        'Anteprima',
    rocketStepDone:           'Fine',
    rocketEditSetup:          '← Modifica Config',
    rocketCreating:           '⏳ Creando…',
    rocketTripConfig:         '⚙️ Configurazione Trip',
    rocketTemplatesBtn:       '📋 Template',
    rocketDateLabel:          'Data',
    rocketDefaultDest:        'Destinazione Predefinita',
    rocketDefaultCall:        'Call Time Predefinita',
    rocketPickupHint:         'Pickup = call − durata rotta',
    rocketServiceTypeLabel:   'Tipo Servizio',
    rocketDeptDest:           '🎯 Destinazioni Reparto',
    rocketResetAll:           '↩ Reset tutto',
    rocketOverride:           'override',
    rocketOverrides:          'override',
    rocketCrewLabel:          '👥 Crew',
    rocketCrewSelected:       'selezionati',
    rocketCrewEligible:       'idonei',
    rocketResetTimes:         'Reset orari',
    rocketExpandAll:          'Espandi tutti',
    rocketCollapse:           'Comprimi',
    rocketNoDept:             '— Nessun Reparto —',
    rocketNoEligibleCrew:     'Nessun crew idoneo',
    rocketNoEligibleHint:     'travel_status = PRESENT + hotel_status = CONFIRMED',
    rocketNoVehicles:         'Nessun veicolo attivo —',
    rocketAddVehicles:        'aggiungi veicoli',
    rocketLoadingData:        'Caricamento dati flotta e crew…',
    rocketDraftPlan:          '📋 Piano Bozza',
    rocketNoTrips:            'Nessun trip generato',
    rocketTripsCreated:       'Trip Creati!',
    rocketNewRun:             '🔄 Nuovo Run Rocket',
    rocketViewTrips:          '📋 Vedi Trips',
    rocketFleetMonitor:       '🚦 Fleet Monitor',
    rocketWhyExcluded:        'Perché escluso?',
    rocketExcludedLabel:      'escluso/i da questo run',
    rocketNoReasonNoted:      'nessun motivo indicato',
    rocketReloadLast:         'Ricarica ultimo run?',
    rocketHistoricalSugg:     'Suggerimenti Storici',
    rocketSameServiceType:    'stesso tipo servizio',
    rocketNoDriver:           'Nessun driver',
    rocketIncluded:           '✅ Incluso',
    rocketExcluded:           '☐ Escluso',
    rocketIncludeInRun:       'Includi nel run',
    rocketCallTimeLabel:      'Call Time',
    rocketMovePassenger:      'Sposta passeggero',
    rocketRemoveFromAll:      '↩ Rimuovi da tutti i trip',
    rocketAutoSplit:          'divisione automatica alla conferma',
    rocketAllArrive:          '🏁 tutti arrivano',
    rocketNoPassengers:       'Nessun passeggero',
    rocketMoveBtn:            'Sposta ›',
    rocketCancelBtn:          'Annulla',
    rocketDoneBtn:            '✓ Fatto',
    rocketSaveCurrentConfig:  'Salva configurazione corrente',
    rocketSaveLocally:        '💾 Salva localmente',
    rocketShareTeam:          '☁️ Condividi con il team',
    rocketSharedTemplates:    '☁️ Condivisi con il team',
    rocketLocalTemplates:     '💾 Locali',
    rocketNoSharedTpl:        'Nessun template condiviso ancora.',
    rocketNoLocalTpl:         'Nessun template locale ancora.',
    rocketVisibleAllCaptains: '· visibile a tutti i Captain',
    rocketStoredOnDevice:     '· salvato solo su questo dispositivo',
    rocketDeptHint:           'Crew senza reparto usa sempre il default.',
    rocketSelectedCount:      'selezionati',
    rocketExcludedCount:      'esclusi',
    rocketCallOverrides:      'override call',
    rocketHotels:             'hotel',
    rocketDepts:              'reparti',
    rocketBasedOnPast:        'suggerimenti basati sui',
    rocketRuns:               'run',
    rocketNoVehicleRow:       'NESSUN VEICOLO — usa Sposta ›',
    rocketIncludeBtn:         'Includi',
    rocketNoCrewFound:        'Nessun crew trovato',

    // Fleet Monitor
    fleetMonitorTitle:      '🚦 Fleet Monitor',
    fleetInProgress:        'IN CORSO',
    fleetNextTrip:          'PROSSIMO TRIP',
    fleetLastTrip:          'ULTIMO TRIP',
    fleetNoTripsToday:      'Nessun trip programmato oggi',
    fleetNoActiveVehicles:  'Nessun veicolo attivo',
    fleetAddVehiclesHint:   '→ Aggiungi veicoli nella pagina Vehicles',
    fleetRefreshBtn:        'Aggiorna',
    fleetRefreshing:        'Aggiornamento…',
    fleetTrafficBtn:        'Traffico',
    fleetLegendTitle:       'LEGENDA',
    fleetTripsWithoutVehicle: 'Trip senza veicolo',
    fleetAssignLink:        'Assegna →',
    fleetLoadingLabel:      'Caricamento Fleet Monitor…',
    fleetReturning:         'Dropoff completato — rientro',
    fleetTripsToday:        'trip oggi',
    fleetStartLabel:        'Inizio',
    fleetEndLabel:          'Fine',
    fleetTotalPax:          'pax totali',
    fleetViewingDate:       'Visualizzazione:',
    fleetStatusBasedOn:     'Stato BUSY/FREE basato sull\'orario attuale',

    // Reports
    reportsTitle:           '📊 Report Flotta',
    reportsDaily:           'Giornaliero',
    reportsWeekly:          'Settimanale',
    reportsPrintBtn:        '🖨 Stampa / PDF',
    reportsNoTrips:         'Nessun trip per questo periodo',
    reportsDailyTotal:      'TOTALE GIORNALIERO',
    reportsWeeklyVehicle:   'VEICOLO',
    reportsWeeklyTotal:     'TOTALE',
    reportsWeeklyNoVehicles: 'Nessun veicolo con trip questa settimana',
    reportsTotalPerDay:     'TOTALE / GIORNO',
    reportsPrinted:         'Stampato:',
    reportsColCall:         'CALL',
    reportsColTrip:         'TRIP',
    reportsColClass:        'CLASSE',
    reportsColFrom:         'DA',
    reportsColTo:           'A',
    reportsColDur:          'DUR',
    reportsColPax:          'PAX',
    reportsColStatus:       'STATO',
    reportsNoVehicle:       'Nessun veicolo',

    // Bridge
    bridgeTitle:            '⚓ Captain Bridge',
    bridgeDesc:             'Gestisci chi accede a CaptainDispatch — approva gli utenti in attesa e controlla i codici invito.',
    bridgePendingTab:       '👥 Utenti in Attesa',
    bridgeInvitesTab:       '🔑 Codici Invito',
    bridgePendingUsers:     'Utenti in Attesa',
    bridgePendingDesc:      'Utenti che si sono registrati e aspettano l\'accesso',
    bridgeInviteCodesTitle: 'Codici Invito',
    bridgeAccessDenied:     'Accesso Negato',
    bridgeAccessDeniedDesc: 'Captain Bridge è disponibile solo per utenti CAPTAIN e ADMIN.',
    bridgeBackDashboard:    '← Torna alla Dashboard',
    bridgeNoPending:        'Nessun utente in attesa',
    bridgeNoPendingDesc:    'Tutti gli utenti registrati sono stati gestiti.',
    bridgeRefreshBtn:       '↺ Aggiorna',
    bridgeUsersWaiting:     'utenti in attesa',
    bridgeSignedUp:         'Registrato',
    bridgeSandboxBtn:       '✓ Sandbox',
    bridgeAddToProdBtn:     '⊕ Aggiungi a produzione',
    bridgeIgnoreBtn:        '✕ Ignora',
    bridgeAddToProdTitle:   '⊕ Aggiungi a Produzione',
    bridgeAddToProdDesc:    'verrà aggiunto con il ruolo selezionato.',
    bridgeProductionLabel:  'Produzione',
    bridgeRoleLabel:        'Ruolo',
    bridgeAddUserBtn:       '✓ Aggiungi Utente',
    bridgeAddingBtn:        'Aggiungendo…',
    bridgeNewCodeBtn:       '+ Nuovo Codice',
    bridgeNewCodeTitle:     '🔑 Nuovo Codice Invito',
    bridgeNoInvites:        'Nessun codice invito ancora',
    bridgeNoInvitesDesc:    'Crea un codice per permettere alle persone di unirsi subito a una produzione.',
    bridgeCreateFirstCode:  '+ Crea Primo Codice',
    bridgeProdLabel:        'Produzione *',
    bridgeRoleAssignedLabel: 'Ruolo assegnato',
    bridgeCodeLabel:        'Codice (vuoto = auto-genera)',
    bridgeLabelOptLabel:    'Etichetta (opzionale)',
    bridgeMaxUsesLabel:     'Usi massimi (vuoto = illimitati)',
    bridgeExpiresLabel:     'Scadenza (vuoto = mai)',
    bridgeCreatingBtn:      'Creando…',
    bridgeCreateCodeBtn:    '🔑 Crea Codice',
    bridgePauseBtn:         '⏸ Pausa',
    bridgeEnableBtn:        '▶ Abilita',
    bridgeUsesLabel:        'Usi:',
    bridgeNoExpiry:         'Nessuna scadenza',
    bridgeCreatedLabel:     'Creato',
    bridgeHowWorksTitle:    '⚓ Come funziona Captain Bridge',
    bridgeDeleteConfirm:    'Eliminare questo codice invito?',

    // QR Codes
    qrCodesTitle:       '📱 QR Codes',
    qrVehicles:         '🚐 Veicoli',
    qrCrew:             '🎬 Crew',
    qrPrintBtn:         '🖨 Stampa / PDF',
    qrHowToTitle:       '📱 Come usare Wrap Trip sul mobile',
    qrNoVehicles:       'Nessun veicolo trovato. Aggiungili in',
    qrNoCrewConfirmed:  'Nessun crew CONFIRMED trovato.',
    qrLoading:          'Caricamento…',

    // Lists
    listsTitle:              '📋 Transport Lists',
    listsPrintBtn:           '🖨 Stampa / PDF',
    listsEditHeader:         '⚙️ Modifica Header',
    listsTodayBtn:           'Oggi',
    listsNoTrips:            'Nessun trip per',
    listsTripsCount:         'trip',
    listsPaxCount:           'pax',
    listsColTime:            'ORA',
    listsColCall:            'CALL',
    listsColVeh:             'VEH.',
    listsColDriver:          'AUTISTA',
    listsColRoute:           'ROTTA & CREW',
    listsColPax:             'PAX',
    listsColCap:             'CAP',
    listsSectionTransport:   '🚌 TRANSPORT LIST',
    listsSectionArrivals:    '✈ 🛬 TRAVEL LIST — ARRIVI',
    listsSectionDepartures:  '✈ 🛫 TRAVEL LIST — PARTENZE',
    listsConfidential:       'Riservato — Non per distribuzione',
    listsGeneratedBy:        'Generato da CaptainDispatch',
    listsNoActiveProd:       'Nessuna produzione attiva.',

    // Settings
    settingsTitle:          '⚙️ Impostazioni Produzione',
    settingsDesc:           "Questi dettagli appaiono nell'header del Transport List. Tutti i campi sono opzionali tranne il Nome Produzione.",
    settingsSaveBtn:        '💾 Salva Impostazioni Produzione',
    settingsSavingBtn:      'Salvataggio…',
    settingsSavedMsg:       '✅ Impostazioni produzione salvate!',
    settingsBackBtn:        '← Torna alle Produzioni',
    settingsTip:            'Dopo il salvataggio, vai alle Transport Lists per vedere l\'header con tutti i dettagli della produzione.',
    settingsNoProduction:   'Nessuna produzione attiva selezionata. Vai alle Produzioni e attivane una prima.',

    // ImportModal
    importTitle:            '📂 Importa da file',
    importModeLabel:        'Modalità importazione',
    importFleetMode:        '🚗 Lista flotta',
    importCrewMode:         '👥 Lista crew',
    importCustomMode:       '✏️ Istruzioni personalizzate…',
    importDragDrop:         'Trascina o clicca per sfogliare',
    importAccepted:         'Accettati: .xlsx, .xls, .csv, .pdf, .docx',
    importExtracting:       'Estrazione dati…',
    importClaudeAnalyzing:  'Claude sta analizzando il file',
    importSaving:           'Salvataggio…',
    importDone:             'Importazione completata!',
    importCloseBtn:         'Chiudi',
    importBackBtn:          '← Indietro',
    importCancelBtn:        'Annulla',
    importConfirmBtn:       '✓ Conferma importazione',
    importRowsFound:        'righe trovate',
    importNewLabel:         'nuovi',
    importUpdateLabel:      'aggiornamenti',
    importSkipLabel:        'saltati',
    importNeedReview:       'da rivedere',
    importNotRecognized:    'non riconosciute',
    importRowsNotRecognized: 'righe non riconosciute',
    importNewHotelsTitle:   '🏨 Nuovi hotel rilevati — non trovati nelle Location',
    importAddToLocations:   '+ Aggiungi alle Location',
    importSkipHotel:        'Salta',
    importInserted:         'inseriti',
    importUpdated:          'aggiornati',
    importSkipped:          'saltati',
    importLegendNew:        '✅ Nuovo',
    importLegendDup:        '🔁 Duplicato',
    importLegendMissing:    '⚠️ Campi mancanti',
    importLegendUnrecognized: '❌ Non riconosciuto',

    // pending (fix residui)
    pendingInviteLabel:      '🔑 Hai un codice invito?',
    pendingEnterBtn:         '→ Entra',
    pendingInvitePlaceholder: 'es. CREW-X7K2',
    pendingJoinedMsg:        'Accesso a',
    pendingRedirectingMsg:   'Reindirizzamento…',

    // scan (fix residui)
    scanHotelLabel:       'Hotel',
    scanHotelStatus:      'Stato Hotel',
    scanDriverLabel:      '👤 Autista',
    scanSearchPlaceholder: 'Cerca…',
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
```

---

## lib/navbar.js

```js
import { useState, useEffect } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { supabase } from './supabase'
import { useOnlinePresence, getPageLabel, getInitials, getAvatarColor, fmtOnlineSince, getRoleStyle } from './useOnlinePresence'
import { useLanguage, SUPPORTED_LOCALES, LOCALE_LABELS, useT } from './i18n'
import { useNotifications } from './useNotifications'
import { getProductionId } from './production'
import { useIsMobile } from './useIsMobile'
import { ROLE_NAV_ITEMS, ROLE_NAV_SECONDARY, ROLE_HOME_LABEL, getHomeForRole } from './roleAccess'

function useBridgeBadge(productionId) {
  const [count, setCount] = useState(0)

  useEffect(() => {
    if (!productionId) return
    async function check() {
      const { count: c } = await supabase.from('notifications')
        .select('id', { count: 'exact', head: true })
        .eq('production_id', productionId)
        .eq('read', false)

      const { data: driveFiles } = await supabase
        .from('drive_synced_files')
        .select('last_modified, last_synced_at')
        .eq('production_id', productionId)

      const driveUpdates = (driveFiles || []).filter(f =>
        !f.last_synced_at ||
        (f.last_modified && f.last_synced_at && f.last_modified > f.last_synced_at)
      ).length

      setCount((c || 0) + driveUpdates)
    }
    check()
    const interval = setInterval(check, 5 * 60 * 1000)
    return () => clearInterval(interval)
  }, [productionId])

  return count
}

// ── Load current user info for presence tracking ──────────
function useNavUser(productionId) {
  const [userId, setUserId] = useState(null)
  const [email,  setEmail]  = useState('')
  const [role,   setRole]   = useState('')

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) return
      setUserId(session.user.id)
      setEmail(session.user.email || '')
    })
  }, [])

  useEffect(() => {
    if (!productionId || !userId) return
    supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', userId)
      .eq('production_id', productionId)
      .maybeSingle()
      .then(({ data }) => { if (data?.role) setRole(data.role) })
      .catch(() => {})
  }, [productionId, userId])

  return { userId, email, role }
}

export const NAV_ITEMS = [
  { l: 'Dashboard', p: '/dashboard' },
  { l: 'Fleet', p: '/dashboard/fleet' },
  { l: 'Trips', p: '/dashboard/trips' },
  { l: 'Crew', p: '/dashboard/crew' },
  { l: 'Hub Cov.', p: '/dashboard/hub-coverage' },
  { l: 'Pax Cov.', p: '/dashboard/pax-coverage' },
  { l: '🚀 Rocket', p: '/dashboard/rocket' },
  { l: '⚓ Bridge', p: '/dashboard/bridge' },
]

export const NAV_SECONDARY = [
  { l: '📋 Lists', p: '/dashboard/lists-v2' },
  { l: '� Reports', p: '/dashboard/reports' },
  { l: '�📍 Locations', p: '/dashboard/locations' },
  { l: '🚐 Vehicles', p: '/dashboard/vehicles' },
  { l: '🔳 QR', p: '/dashboard/qr-codes' },
  { l: '🎬 Prods', p: '/dashboard/productions' },
  { l: '⚙ Settings', p: '/dashboard/settings' },
]

export function Navbar({ currentPath, className }) {
  const router = useRouter()
  const { lang, setLang } = useLanguage()
  const t = useT()
  const { supported, permission, subscribed, loading, subscribe, unsubscribe } = useNotifications()
  const isMobile = useIsMobile()
  const [productionId, setProductionId] = useState(null)
  const [moreOpen, setMoreOpen] = useState(false)
  const [modeOpen, setModeOpen] = useState(false)

  const MODES = [
    { key: 'captain',       icon: '🎬', label: 'Captain',       path: '/dashboard' },
    { key: 'travel',        icon: '✈️', label: 'Travel',        path: '/dashboard/travel' },
    { key: 'accommodation', icon: '🏨', label: 'Accommodation', path: '/dashboard/accommodation' },
  ]

  const currentMode = currentPath?.startsWith('/dashboard/travel')        ? 'travel'
                    : currentPath?.startsWith('/dashboard/accommodation')  ? 'accommodation'
                    : 'captain'
  const currentModeObj = MODES.find(m => m.key === currentMode) || MODES[0]
  useEffect(() => { setProductionId(getProductionId()) }, [])
  const bridgeCount = useBridgeBadge(productionId)
  const secondaryActive = NAV_SECONDARY.some(item => item.p === currentPath)

  // ── Online presence ──────────────────────────────────────
  const pathname = usePathname()
  const [onlineOpen, setOnlineOpen] = useState(false)
  const { userId: navUserId, email: navEmail, role: navRole } = useNavUser(productionId)

  // ── Role-based nav filtering (S61 + S62) ─────────────────
  const isRestricted     = !!(ROLE_NAV_ITEMS[navRole])
  // S62 fix: always prepend the role's home page so restricted users can always navigate back
  const filteredNavItems = isRestricted
    ? [
        { l: ROLE_HOME_LABEL[navRole] || '🏠 Home', p: getHomeForRole(navRole) },
        ...NAV_ITEMS.filter(i => ROLE_NAV_ITEMS[navRole].includes(i.p)),
      ]
    : NAV_ITEMS
  const filteredNavSecondary = isRestricted
    ? NAV_SECONDARY.filter(i => (ROLE_NAV_SECONDARY[navRole] || []).includes(i.p))
    : NAV_SECONDARY
  const logoHref = isRestricted ? getHomeForRole(navRole) : '/dashboard'

  const onlineUsers = useOnlinePresence({
    productionId,
    userId: navUserId,
    email:  navEmail,
    page:   currentPath || pathname || '',
    role:   navRole,
  })

  // Determina icona, tooltip e azione del pulsante notifiche
  let bellIcon    = '🔔'
  let bellTitle   = t.notificationsEnable
  let bellColor   = '#64748b'
  let bellActive  = false
  let bellDisabled = loading

  if (permission === 'denied') {
    bellIcon    = '🔕'
    bellTitle   = t.notificationsBlocked
    bellColor   = '#475569'
    bellDisabled = true
  } else if (subscribed) {
    bellIcon   = '🔔'
    bellTitle  = t.notificationsDisable
    bellColor  = '#38bdf8'   // azzurro = attivo
    bellActive = true
  } else if (permission === 'granted') {
    bellTitle  = t.notificationsReenable
  }

  function handleBell() {
    if (subscribed) {
      unsubscribe()
    } else {
      const productionId = getProductionId()
      subscribe(productionId)
    }
  }

  return (
    <>
      <style>{`@keyframes navbadgepulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.7;transform:scale(1.15)}}`}</style>

      {/* ── DESKTOP navbar (≥ 768px) ── */}
      <div className={className} style={{ background: '#0f2340', padding: '0 24px', height: '52px', display: isMobile ? 'none' : 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 30 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
          <div style={{ fontSize: '20px', fontWeight: '900', color: 'white', letterSpacing: '-1px', cursor: 'pointer', whiteSpace: 'nowrap' }} onClick={() => router.push(logoHref)}>
            CAPTAIN <span style={{ color: '#2563eb' }}>Dispatch</span>
          </div>

          {/* ── Mode switcher — hidden for restricted roles ── */}
          {!isRestricted && <div style={{ position: 'relative' }}>
            <button
              onClick={() => setModeOpen(o => !o)}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: '6px',
                background: modeOpen ? '#1e3a5f' : 'rgba(255,255,255,0.08)',
                border: '1px solid rgba(255,255,255,0.15)',
                borderRadius: '8px', padding: '4px 10px',
                cursor: 'pointer', color: 'white',
                fontSize: '12px', fontWeight: '700',
                whiteSpace: 'nowrap', lineHeight: 1,
              }}
            >
              <span>{currentModeObj.icon}</span>
              <span>{currentModeObj.label}</span>
              <span style={{ fontSize: '9px', opacity: 0.7, marginLeft: '2px' }}>▾</span>
            </button>
            {modeOpen && (
              <>
                <div onClick={() => setModeOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 98 }} />
                <div style={{
                  position: 'absolute', top: 'calc(100% + 6px)', left: 0,
                  background: '#1e3a5f', border: '1px solid #334155',
                  borderRadius: '10px', padding: '6px', zIndex: 99,
                  minWidth: '180px', boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
                  display: 'flex', flexDirection: 'column', gap: '2px',
                }}>
                  {MODES.map(m => (
                    <a key={m.key} href={m.path}
                      onClick={() => setModeOpen(false)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: '10px',
                        padding: '9px 12px', borderRadius: '7px',
                        fontSize: '13px', fontWeight: '600',
                        color: m.key === currentMode ? 'white' : '#94a3b8',
                        background: m.key === currentMode ? '#0f2340' : 'transparent',
                        textDecoration: 'none',
                      }}
                      onMouseEnter={e => { if (m.key !== currentMode) { e.currentTarget.style.background = '#0f2340'; e.currentTarget.style.color = 'white' }}}
                      onMouseLeave={e => { if (m.key !== currentMode) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#94a3b8' }}}
                    >
                      <span style={{ fontSize: '16px' }}>{m.icon}</span>
                      <span style={{ flex: 1 }}>{m.label}</span>
                      {m.key === currentMode && <span style={{ fontSize: '10px', color: '#22c55e' }}>✓</span>}
                    </a>
                  ))}
                </div>
              </>
            )}
          </div>}

          <nav style={{ display: 'flex', gap: '2px', alignItems: 'center' }}>
            {filteredNavItems.map(({ l, p }) => (
              <a key={p} href={p} style={{ padding: '5px 12px', borderRadius: '7px', fontSize: '13px', fontWeight: '600', color: p === currentPath ? 'white' : '#94a3b8', background: p === currentPath ? '#1e3a5f' : 'transparent', textDecoration: 'none', whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                {l}
                {p === '/dashboard/bridge' && bridgeCount > 0 && (
                  <span style={{
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    width: '18px', height: '18px', borderRadius: '50%',
                    background: '#dc2626', color: 'white',
                    fontSize: '10px', fontWeight: '900',
                    animation: 'navbadgepulse 2s infinite',
                  }}>
                    {bridgeCount > 9 ? '9+' : bridgeCount}
                  </span>
                )}
              </a>
            ))}

            {/* ⋯ More dropdown */}
            <div style={{ position: 'relative' }}>
              <button
                onClick={() => setMoreOpen(o => !o)}
                style={{
                  padding: '5px 10px', borderRadius: '7px', fontSize: '15px', fontWeight: '700',
                  color: secondaryActive ? 'white' : '#94a3b8',
                  background: moreOpen || secondaryActive ? '#1e3a5f' : 'transparent',
                  border: 'none', cursor: 'pointer', lineHeight: 1,
                  display: 'inline-flex', alignItems: 'center', gap: '3px',
                }}
                title="More"
              >
                ⋯
              </button>
              {moreOpen && (
                <>
                  <div onClick={() => setMoreOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 98 }} />
                  <div style={{
                    position: 'absolute', top: 'calc(100% + 6px)', left: 0,
                    background: '#1e3a5f', border: '1px solid #334155',
                    borderRadius: '10px', padding: '6px', zIndex: 99,
                    minWidth: '160px', boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
                    display: 'flex', flexDirection: 'column', gap: '2px',
                  }}>
                    {filteredNavSecondary.map(({ l, p }) => (
                      <a key={p} href={p} onClick={() => setMoreOpen(false)}
                        style={{
                          padding: '7px 12px', borderRadius: '7px', fontSize: '13px', fontWeight: '600',
                          color: p === currentPath ? 'white' : '#94a3b8',
                          background: p === currentPath ? '#0f2340' : 'transparent',
                          textDecoration: 'none', whiteSpace: 'nowrap', display: 'block',
                        }}
                        onMouseEnter={e => { if (p !== currentPath) e.currentTarget.style.background = '#0f2340'; e.currentTarget.style.color = 'white' }}
                        onMouseLeave={e => { if (p !== currentPath) e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = p === currentPath ? 'white' : '#94a3b8' }}
                      >
                        {l}
                      </a>
                    ))}
                  </div>
                </>
              )}
            </div>
          </nav>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {supported && (
            <button onClick={handleBell} disabled={bellDisabled} title={bellTitle} style={{ background: bellActive ? 'rgba(56,189,248,0.12)' : 'transparent', border: `1px solid ${bellActive ? '#38bdf8' : '#334155'}`, color: loading ? '#475569' : bellColor, padding: '4px 8px', borderRadius: '7px', cursor: bellDisabled ? 'not-allowed' : 'pointer', fontSize: '15px', lineHeight: 1, opacity: loading ? 0.5 : 1, transition: 'all 0.15s ease' }}>
              {loading ? '⏳' : bellIcon}
            </button>
          )}
          <div style={{ display: 'flex', gap: '3px' }}>
            {SUPPORTED_LOCALES.map(l => (
              <button key={l} onClick={() => setLang(l)} style={{ background: lang === l ? '#1e3a5f' : 'transparent', border: `1px solid ${lang === l ? '#2563eb' : '#334155'}`, color: lang === l ? 'white' : '#64748b', padding: '3px 8px', borderRadius: '5px', cursor: 'pointer', fontSize: '11px', fontWeight: '700', whiteSpace: 'nowrap', lineHeight: 1 }}>
                {LOCALE_LABELS[l]}
              </button>
            ))}
          </div>

          {/* ── Online presence badge (desktop) ── */}
          {onlineUsers.length > 0 && (
            <div style={{ position: 'relative' }}>
              <button
                onClick={() => setOnlineOpen(o => !o)}
                title="Who's online"
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: '5px',
                  background: onlineOpen ? 'rgba(34,197,94,0.15)' : 'transparent',
                  border: '1px solid rgba(34,197,94,0.45)',
                  color: '#22c55e', padding: '4px 9px', borderRadius: '7px',
                  cursor: 'pointer', fontSize: '12px', fontWeight: '700', lineHeight: 1,
                  whiteSpace: 'nowrap',
                }}
              >
                <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: '#22c55e', display: 'inline-block', flexShrink: 0, boxShadow: '0 0 0 2px rgba(34,197,94,0.3)' }} />
                {onlineUsers.length}
              </button>

              {onlineOpen && (
                <>
                  <div onClick={() => setOnlineOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 98 }} />
                  <div style={{
                    position: 'absolute', top: 'calc(100% + 8px)', right: 0,
                    background: 'white', border: '1px solid #e2e8f0',
                    borderRadius: '12px', boxShadow: '0 8px 32px rgba(0,0,0,0.14)',
                    zIndex: 99, minWidth: '270px', maxWidth: '340px', overflow: 'hidden',
                  }}>
                    <div style={{ padding: '10px 14px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span style={{ fontWeight: '800', fontSize: '13px', color: '#0f172a' }}>🟢 Online Now</span>
                      <span style={{ background: '#dcfce7', color: '#166534', border: '1px solid #bbf7d0', padding: '1px 7px', borderRadius: '999px', fontSize: '11px', fontWeight: '700' }}>
                        {onlineUsers.length}
                      </span>
                    </div>
                    {onlineUsers.map((u, i) => {
                      const rs = getRoleStyle(u.role)
                      return (
                        <div key={u.user_id || i} style={{
                          display: 'flex', alignItems: 'center', gap: '10px', padding: '9px 14px',
                          borderBottom: i < onlineUsers.length - 1 ? '1px solid #f8fafc' : 'none',
                          background: u.user_id === navUserId ? '#f0fdf4' : 'white',
                        }}>
                          <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: getAvatarColor(u.user_id), display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: '10px', fontWeight: '900', flexShrink: 0 }}>
                            {getInitials(u.email)}
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: '12px', fontWeight: '700', color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {u.email || u.user_id?.slice(0, 8)}
                              {u.user_id === navUserId && <span style={{ marginLeft: '5px', fontSize: '9px', color: '#22c55e', fontWeight: '700' }}>you</span>}
                            </div>
                            <div style={{ fontSize: '10px', color: '#64748b', display: 'flex', gap: '5px', alignItems: 'center', marginTop: '2px' }}>
                              {u.role && <span style={{ background: rs.bg, color: rs.color, padding: '0 5px', borderRadius: '3px', fontWeight: '700' }}>{u.role}</span>}
                              {u.page && <span>{getPageLabel(u.page)}</span>}
                            </div>
                          </div>
                          <div style={{ fontSize: '10px', color: '#94a3b8', flexShrink: 0 }}>{fmtOnlineSince(u.online_at)}</div>
                        </div>
                      )
                    })}
                  </div>
                </>
              )}
            </div>
          )}

          <button onClick={async () => { await supabase.auth.signOut(); router.push('/login') }} style={{ background: 'transparent', border: '1px solid #334155', color: '#94a3b8', padding: '5px 12px', borderRadius: '7px', cursor: 'pointer', fontSize: '12px' }}>
            Sign out
          </button>
        </div>
      </div>

      {/* ── MOBILE top bar (< 768px) ── */}
      {isMobile && (
        <div style={{ background: '#0f2340', padding: '0 16px', height: '52px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 30 }}>
          <div style={{ fontSize: '18px', fontWeight: '900', color: 'white', letterSpacing: '-1px', cursor: 'pointer' }} onClick={() => router.push(logoHref)}>
            CAPTAIN <span style={{ color: '#2563eb' }}>Dispatch</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            {supported && (
              <button onClick={handleBell} disabled={bellDisabled} title={bellTitle} style={{ background: bellActive ? 'rgba(56,189,248,0.12)' : 'transparent', border: `1px solid ${bellActive ? '#38bdf8' : '#334155'}`, color: loading ? '#475569' : bellColor, padding: '6px 9px', borderRadius: '8px', cursor: bellDisabled ? 'not-allowed' : 'pointer', fontSize: '16px', lineHeight: 1, opacity: loading ? 0.5 : 1 }}>
                {loading ? '⏳' : bellIcon}
              </button>
            )}
            <button
              onClick={() => setMoreOpen(o => !o)}
              style={{ background: 'transparent', border: '1px solid #334155', color: 'white', padding: '6px 10px', borderRadius: '8px', cursor: 'pointer', fontSize: '20px', lineHeight: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              title="Menu"
            >
              ☰
            </button>
          </div>
        </div>
      )}

      {/* ── MOBILE drawer fullscreen ── */}
      {isMobile && moreOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 200, background: '#0f2340', overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 16px', height: '52px', borderBottom: '1px solid #1e3a5f', flexShrink: 0 }}>
            <div style={{ fontSize: '18px', fontWeight: '900', color: 'white', letterSpacing: '-1px' }}>
              CAPTAIN <span style={{ color: '#2563eb' }}>Dispatch</span>
            </div>
            <button onClick={() => setMoreOpen(false)} style={{ background: 'transparent', border: 'none', color: '#94a3b8', fontSize: '24px', cursor: 'pointer', lineHeight: 1, padding: '4px 8px' }}>
              ✕
            </button>
          </div>

          <div style={{ padding: '12px 12px', display: 'flex', flexDirection: 'column', gap: '4px', flex: 1 }}>
            {!isRestricted && (
              <div style={{ marginBottom: '8px', paddingBottom: '8px', borderBottom: '1px solid #1e3a5f' }}>
                <div style={{ fontSize: '10px', fontWeight: '800', color: '#64748b', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '6px', paddingLeft: '4px' }}>Mode</div>
                {MODES.map(m => (
                  <a key={m.key} href={m.path} onClick={() => setMoreOpen(false)}
                    style={{
                      padding: '12px 16px', borderRadius: '10px', fontSize: '15px', fontWeight: '600',
                      color: m.key === currentMode ? 'white' : '#94a3b8',
                      background: m.key === currentMode ? '#1e3a5f' : 'transparent',
                      textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '10px',
                      marginBottom: '2px',
                    }}
                  >
                    <span style={{ fontSize: '18px' }}>{m.icon}</span>
                    <span>{m.label}</span>
                    {m.key === currentMode && <span style={{ marginLeft: 'auto', fontSize: '11px', color: '#22c55e', fontWeight: '700' }}>✓ Active</span>}
                  </a>
                ))}
              </div>
            )}
            {[...filteredNavItems, ...filteredNavSecondary].map(({ l, p }) => (
              <a key={p} href={p} onClick={() => setMoreOpen(false)}
                style={{
                  padding: '14px 16px', borderRadius: '10px', fontSize: '16px', fontWeight: '600',
                  color: p === currentPath ? 'white' : '#94a3b8',
                  background: p === currentPath ? '#1e3a5f' : 'transparent',
                  textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '8px',
                }}
              >
                <span style={{ flex: 1 }}>{l}</span>
                {p === '/dashboard/bridge' && bridgeCount > 0 && (
                  <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '20px', height: '20px', borderRadius: '50%', background: '#dc2626', color: 'white', fontSize: '11px', fontWeight: '900', animation: 'navbadgepulse 2s infinite' }}>
                    {bridgeCount > 9 ? '9+' : bridgeCount}
                  </span>
                )}
              </a>
            ))}
          </div>

          {/* Online section (mobile drawer) */}
          {onlineUsers.length > 0 && (
            <div style={{ padding: '12px 16px', borderTop: '1px solid #1e3a5f', flexShrink: 0 }}>
              <div style={{ fontSize: '11px', fontWeight: '800', color: '#22c55e', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: '#22c55e', flexShrink: 0 }} />
                {onlineUsers.length} Online Now
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {onlineUsers.map((u, i) => (
                  <div key={u.user_id || i} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{ width: '26px', height: '26px', borderRadius: '50%', background: getAvatarColor(u.user_id), display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: '9px', fontWeight: '900', flexShrink: 0 }}>
                      {getInitials(u.email)}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '12px', color: 'white', fontWeight: '600', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {u.email?.split('@')[0] || 'User'}
                        {u.user_id === navUserId && <span style={{ marginLeft: '5px', fontSize: '9px', color: '#22c55e' }}>(you)</span>}
                      </div>
                    </div>
                    {u.page && <span style={{ fontSize: '10px', color: '#64748b', flexShrink: 0 }}>{getPageLabel(u.page)}</span>}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div style={{ padding: '16px', borderTop: '1px solid #1e3a5f', display: 'flex', flexDirection: 'column', gap: '12px', flexShrink: 0 }}>
            <div style={{ display: 'flex', gap: '6px' }}>
              {SUPPORTED_LOCALES.map(l => (
                <button key={l} onClick={() => setLang(l)} style={{ background: lang === l ? '#1e3a5f' : 'transparent', border: `1px solid ${lang === l ? '#2563eb' : '#334155'}`, color: lang === l ? 'white' : '#64748b', padding: '8px 14px', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: '700', lineHeight: 1 }}>
                  {LOCALE_LABELS[l]}
                </button>
              ))}
            </div>
            <button onClick={async () => { await supabase.auth.signOut(); router.push('/login') }} style={{ background: 'transparent', border: '1px solid #334155', color: '#94a3b8', padding: '12px 16px', borderRadius: '10px', cursor: 'pointer', fontSize: '14px', textAlign: 'left' }}>
              Sign out
            </button>
          </div>
        </div>
      )}
    </>
  )
}
```

---

## lib/NotesPanel.js — Props e costanti chiave

```js
'use client'
/**
 * lib/NotesPanel.js — S59-A
 * Componente unificato per le note crew.
 * Usato da CrewSidebar (crew/page.js) e MovementSidebar (travel/page.js).
 *
 * Props:
 *   crewId        {string}   — id del crew member
 *   productionId  {string}   — production id
 *   currentUser   {object}   — { id, name, role }
 *   onNotesSent   {function} — callback opzionale dopo ogni invio (es. per aggiornare unreadMap nel parent)
 */

import { useState, useEffect, useCallback } from 'react'
import { supabase } from './supabase'

// ── Constants ───────────────────────────────────────────────────────────────

const ROLE_COLOR = {
  CAPTAIN:       { bg: '#eff6ff', color: '#1d4ed8', border: '#bfdbfe' },
  TRAVEL:        { bg: '#faf5ff', color: '#7c3aed', border: '#c4b5fd' },
  ACCOMMODATION: { bg: '#f0fdf4', color: '#15803d', border: '#86efac' },
}

const CTX_ICON  = { general: '🌐', captain: '🧑‍✈️', travel: '✈️', accommodation: '🏨' }
const CTX_LABEL = { general: 'General', captain: 'Captain', travel: 'Travel', accommodation: 'Accommodation' }
const CONTEXTS  = ['general', 'captain', 'travel', 'accommodation']

// Canali = destinatari. Ogni ruolo SCRIVE su tutti i canali TRANNE il proprio.
// LEGGE solo le note indirizzate al proprio canale + general + proprie.
const ROLE_CHANNEL    = { CAPTAIN: 'captain', TRAVEL: 'travel', ACCOMMODATION: 'accommodation' }
const UNRESTRICTED_R  = ['ADMIN', 'MANAGER', 'PRODUCTION']
const CTX_VISIBLE_TO  = { general: 'All roles', captain: 'Captain only', travel: 'Travel only', accommodation: 'Accommodation only' }

// ── Helper ──────────────────────────────────────────────────────────────────

function fmtRelative(ts) {
  const diff = Date.now() - new Date(ts).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 2)  return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24)  return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

// ── LinkedChip — fetches and renders linked movement or stay ─────────────

function LinkedChip({ movementId, stayId }) {
  const [data, setData] = useState(null)

  useEffect(() => {
    if (!movementId && !stayId) return
    async function fetchLinked() {
      try {
        if (movementId) {
          const res  = await fetch(`/api/crew-notes/linked?type=movement&id=${movementId}`)
          const json = await res.json()
          if (json.data) setData({ type: 'movement', ...json.data })
        } else if (stayId) {
          const res  = await fetch(`/api/crew-notes/linked?type=stay&id=${stayId}`)
          const json = await res.json()
          if (json.data) setData({ type: 'stay', ...json.data })
        }
      } catch {}
    }
    fetchLinked()
  }, [movementId, stayId])

  if (!data) return null

  if (data.type === 'movement') {
    const dirIcon  = data.direction === 'IN' ? '↓' : '↑'
    const dirColor = data.direction === 'IN' ? '#15803d' : '#b45309'
    const typeIcon = data.travel_type === 'FLIGHT' ? '✈️' : data.travel_type === 'TRAIN' ? '🚂' : '🚐'
    return (
      <div style={{
        display: 'flex', alignItems: 'center', gap: '5px', flexWrap: 'wrap',
        background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: '5px',
        padding: '4px 8px', marginBottom: '5px', fontSize: '11px',
      }}>
        <span>{typeIcon}</span>
        {data.travel_number && <span style={{ fontWeight: '700', color: '#0369a1' }}>{data.travel_number}</span>}
        {data.from_location && <span style={{ color: '#0f172a' }}>{data.from_location}</span>}
        {data.from_time     && <span style={{ color: '#475569' }}>{String(data.from_time).slice(0,5)}</span>}
        {(data.from_location || data.from_time) && (data.to_location || data.to_time) && (
          <span style={{ color: '#94a3b8' }}>→</span>
        )}
        {data.to_location   && <span style={{ color: '#0f172a' }}>{data.to_location}</span>}
        {data.to_time       && <span style={{ color: '#475569' }}>{String(data.to_time).slice(0,5)}</span>}
        {data.travel_date   && <span style={{ color: '#64748b', borderLeft: '1px solid #bae6fd', paddingLeft: '5px' }}>{data.travel_date}</span>}
        <span style={{ fontWeight: '700', color: dirColor, borderLeft: '1px solid #bae6fd', paddingLeft: '5px' }}>{dirIcon} {data.direction}</span>
      </div>
    )
  }

  if (data.type === 'stay') {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', gap: '5px', flexWrap: 'wrap',
        background: '#f0fdf4', border: '1px solid #86efac', borderRadius: '5px',
        padding: '4px 8px', marginBottom: '5px', fontSize: '11px',
      }}>
        <span>🏨</span>
        {data.hotel_name    && <span style={{ fontWeight: '700', color: '#15803d' }}>{data.hotel_name}</span>}
        {data.arrival_date  && <span style={{ color: '#475569' }}>check-in: {data.arrival_date}</span>}
        {data.departure_date && <span style={{ color: '#475569' }}>check-out: {data.departure_date}</span>}
      </div>
    )
  }

  return null
}

// ── Component ───────────────────────────────────────────────────────────────

export default function NotesPanel({ crewId, productionId, currentUser, onNotesSent, onNotesChanged, accordion = false, linkedMovementId = null }) {
  const [notes,      setNotes]      = useState([])
  const [loading,    setLoading]    = useState(true)
  const [sending,    setSending]    = useState(false)
  const [text,       setText]       = useState('')
  const [context,    setContext]    = useState('general')
  const [isPrivate,  setIsPrivate]  = useState(false)
  const [filter,     setFilter]     = useState('all')
  const [delConfirm, setDelConfirm] = useState(null)
  const [editing,    setEditing]    = useState(null)  // id della nota in edit
  const [editText,   setEditText]   = useState('')
  const [editSaving, setEditSaving] = useState(false)

  // ── Accordion state ───────────────────────────────────────────────────────
  // accOpen controlla solo la visibilità del body; le note si caricano sempre
  // al mount (eager) così i badge ✓ N / ❗ N new sono visibili anche da chiuso.
  const [accOpen, setAccOpen] = useState(false)

  // ── Load ──────────────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    if (!crewId || !productionId) return
    setLoading(true)
    try {
      const res  = await fetch(`/api/crew-notes?crew_id=${crewId}&production_id=${productionId}`)
      const json = await res.json()
      setNotes(json.notes || [])
    } catch (err) {
      console.error('NotesPanel load:', err)
    } finally {
      setLoading(false)
    }
  }, [crewId, productionId])

  // Carica sempre al mount (sia flat che accordion) — badge sempre aggiornati
  useEffect(() => {
    load()
  }, [load])

  // ── Supabase Realtime ─────────────────────────────────────────────────────
  // Si sottoscrive a INSERT / UPDATE / DELETE su crew_notes filtrato per crew_id.
  // Quando arriva un evento, ricarica le note via API (rispetta RLS private).

  useEffect(() => {
    if (!crewId || !productionId) return
    const channel = supabase
      .channel(`crew_notes:${crewId}:${productionId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'crew_notes', filter: `crew_id=eq.${crewId}` },
        () => { load() }
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [crewId, productionId, load])

  // ── Helpers ───────────────────────────────────────────────────────────────

  function isUnread(note) {
    if (!currentUser) return false
    if (note.author_id === currentUser.id) return false
    return !(note.read_by || []).includes(currentUser.id)
  }

  function canEdit(note) {
    if (!currentUser) return false
    if (note.author_id !== currentUser.id) return false
    // Edit consentito solo entro 5 minuti dalla creazione
    return (Date.now() - new Date(note.created_at).getTime()) < 5 * 60 * 1000
  }

  // ── Actions ───────────────────────────────────────────────────────────────

  async function markRead(note) {
    if (!currentUser) return
    await fetch('/api/crew-notes', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: note.id, action: 'mark_read' }),
    })
    setNotes(prev => prev.map(n =>
      n.id === note.id ? { ...n, read_by: [...(n.read_by || []), currentUser.id] } : n
    ))
    onNotesChanged?.()
  }

  async function markUnread(note) {
    if (!currentUser) return
    await fetch('/api/crew-notes', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: note.id, action: 'mark_unread' }),
    })
    setNotes(prev => prev.map(n =>
      n.id === note.id ? { ...n, read_by: (n.read_by || []).filter(id => id !== currentUser.id) } : n
    ))
    onNotesChanged?.()
  }

  async function markAllRead() {
    if (!currentUser) return
    const unread = notes.filter(n => isUnread(n))
    await Promise.all(unread.map(n =>
      fetch('/api/crew-notes', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: n.id, action: 'mark_read' }),
      })
    ))
    setNotes(prev => prev.map(n =>
      isUnread(n) ? { ...n, read_by: [...(n.read_by || []), currentUser.id] } : n
    ))
    onNotesChanged?.()
  }

  async function handleDelete(id) {
    if (delConfirm !== id) { setDelConfirm(id); return }
    await fetch(`/api/crew-notes?id=${id}`, { method: 'DELETE' })
    setNotes(prev => prev.filter(n => n.id !== id))
    setDelConfirm(null)
    onNotesSent?.()
  }

  function startEdit(note) {
    setEditing(note.id)
    setEditText(note.content)
    setDelConfirm(null)
  }

  async function saveEdit(note) {
    if (!editText.trim()) return
    setEditSaving(true)
    try {
      const res  = await fetch('/api/crew-notes', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: note.id, action: 'edit', content: editText.trim() }),
      })
      const json = await res.json()
      if (json.ok) {
        setNotes(prev => prev.map(n =>
          n.id === note.id ? { ...n, content: editText.trim() } : n
        ))
        setEditing(null)
      }
    } finally {
      setEditSaving(false)
    }
  }

  async function handleSend() {
    if (!text.trim() || !currentUser) return
    setSending(true)
    try {
      const res  = await fetch('/api/crew-notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          crew_id:             crewId,
          production_id:       productionId,
          content:             text.trim(),
          is_private:          isPrivate,
          context,
          author_name:         currentUser.name,
          author_role:         currentUser.role || 'CAPTAIN',
          linked_movement_id:  linkedMovementId || null,
        }),
      })
      const json = await res.json()
      if (json.note) {
        setNotes(prev => [json.note, ...prev])
        setText('')
        onNotesSent?.()
      }
    } finally {
      setSending(false)
    }
  }

  // ── Derived ───────────────────────────────────────────────────────────────

  const unreadCount    = notes.filter(n => isUnread(n)).length
  const filteredNotes  = filter === 'all' ? notes : notes.filter(n => n.context === filter)
  const showFilters    = notes.length >= 3

  // Contesti visibili in base al ruolo (lettura — filter pills)
  const userRole        = currentUser?.role
  const visibleContexts = (!userRole || UNRESTRICTED_R.includes(userRole))
    ? CONTEXTS
    : ['general', ROLE_CHANNEL[userRole]].filter(Boolean)

  // Contesti disponibili per la scrittura — tutti TRANNE il proprio canale
  const writeContexts = (!userRole || UNRESTRICTED_R.includes(userRole))
    ? CONTEXTS
    : CONTEXTS.filter(c => c !== ROLE_CHANNEL[userRole])

  // ... (render JSX omitted for brevity — see full file)
}
```

---

## lib/TripNotesPanel.js

```js
'use client'
/**
 * lib/TripNotesPanel.js
 * NotesPanel for trips — uses trip_notes table via /api/trip-notes.
 * Only CAPTAIN/ADMIN/MANAGER/PRODUCTION can write notes.
 * Props:
 *   tripRowId     {string}   — trips.id (UUID)
 *   productionId  {string}   — production id
 *   currentUser   {object}   — { id, name, role }
 */

import { useState, useEffect, useCallback } from 'react'
import { supabase } from './supabase'

const ROLE_COLOR = {
  CAPTAIN:       { bg: '#eff6ff', color: '#1d4ed8', border: '#bfdbfe' },
  ADMIN:         { bg: '#f1f5f9', color: '#475569', border: '#e2e8f0' },
  MANAGER:       { bg: '#f8fafc', color: '#475569', border: '#e2e8f0' },
  PRODUCTION:    { bg: '#fffbeb', color: '#92400e', border: '#fde68a' },
  TRAVEL:        { bg: '#faf5ff', color: '#7c3aed', border: '#c4b5fd' },
  ACCOMMODATION: { bg: '#f0fdf4', color: '#15803d', border: '#86efac' },
}

const CTX_ICON  = { general: '🌐', captain: '🧑‍✈️', travel: '✈️', accommodation: '🏨' }
const CTX_LABEL = { general: 'General', captain: 'Captain', travel: 'Travel', accommodation: 'Accommodation' }
const CONTEXTS  = ['general', 'captain', 'travel', 'accommodation']
const ALLOWED_WRITE_ROLES = ['CAPTAIN', 'ADMIN', 'MANAGER', 'PRODUCTION']

function fmtRelative(ts) {
  const diff = Date.now() - new Date(ts).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 2)  return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24)  return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

export default function TripNotesPanel({ tripRowId, productionId, currentUser }) {
  const [notes,      setNotes]      = useState([])
  const [loading,    setLoading]    = useState(true)
  const [sending,    setSending]    = useState(false)
  const [text,       setText]       = useState('')
  const [context,    setContext]    = useState('general')
  const [isPrivate,  setIsPrivate]  = useState(false)
  const [filter,     setFilter]     = useState('all')
  const [delConfirm, setDelConfirm] = useState(null)
  const [editing,    setEditing]    = useState(null)
  const [editText,   setEditText]   = useState('')
  const [editSaving, setEditSaving] = useState(false)
  const [accOpen,    setAccOpen]    = useState(false)

  const canWrite = ALLOWED_WRITE_ROLES.includes(currentUser?.role)

  const load = useCallback(async () => {
    if (!tripRowId || !productionId) return
    setLoading(true)
    try {
      const res  = await fetch(`/api/trip-notes?trip_row_id=${tripRowId}&production_id=${productionId}`)
      const json = await res.json()
      setNotes(json.notes || [])
    } catch (err) {
      console.error('TripNotesPanel load:', err)
    } finally {
      setLoading(false)
    }
  }, [tripRowId, productionId])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (!tripRowId || !productionId) return
    const channel = supabase
      .channel(`trip_notes:${tripRowId}:${productionId}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'trip_notes', filter: `trip_row_id=eq.${tripRowId}` },
        () => { load() }
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [tripRowId, productionId, load])

  function isUnread(note) {
    if (!currentUser) return false
    if (note.author_id === currentUser.id) return false
    return !(note.read_by || []).includes(currentUser.id)
  }

  function canEdit(note) {
    if (!currentUser) return false
    if (note.author_id !== currentUser.id) return false
    return (Date.now() - new Date(note.created_at).getTime()) < 5 * 60 * 1000
  }

  async function markRead(note) {
    if (!currentUser) return
    await fetch('/api/trip-notes', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: note.id, action: 'mark_read' }),
    })
    setNotes(prev => prev.map(n =>
      n.id === note.id ? { ...n, read_by: [...(n.read_by || []), currentUser.id] } : n
    ))
  }

  async function markUnread(note) {
    if (!currentUser) return
    await fetch('/api/trip-notes', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: note.id, action: 'mark_unread' }),
    })
    setNotes(prev => prev.map(n =>
      n.id === note.id ? { ...n, read_by: (n.read_by || []).filter(id => id !== currentUser.id) } : n
    ))
  }

  async function markAllRead() {
    if (!currentUser) return
    const unread = notes.filter(n => isUnread(n))
    await Promise.all(unread.map(n =>
      fetch('/api/trip-notes', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: n.id, action: 'mark_read' }),
      })
    ))
    setNotes(prev => prev.map(n =>
      isUnread(n) ? { ...n, read_by: [...(n.read_by || []), currentUser.id] } : n
    ))
  }

  async function handleDelete(id) {
    if (delConfirm !== id) { setDelConfirm(id); return }
    await fetch(`/api/trip-notes?id=${id}`, { method: 'DELETE' })
    setNotes(prev => prev.filter(n => n.id !== id))
    setDelConfirm(null)
  }

  function startEdit(note) {
    setEditing(note.id)
    setEditText(note.content)
    setDelConfirm(null)
  }

  async function saveEdit(note) {
    if (!editText.trim()) return
    setEditSaving(true)
    try {
      const res  = await fetch('/api/trip-notes', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: note.id, action: 'edit', content: editText.trim() }),
      })
      const json = await res.json()
      if (json.ok) {
        setNotes(prev => prev.map(n =>
          n.id === note.id ? { ...n, content: editText.trim() } : n
        ))
        setEditing(null)
      }
    } finally {
      setEditSaving(false)
    }
  }

  async function handleSend() {
    if (!text.trim() || !currentUser || !canWrite) return
    setSending(true)
    try {
      const res  = await fetch('/api/trip-notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          trip_row_id:  tripRowId,
          production_id: productionId,
          content:      text.trim(),
          is_private:   isPrivate,
          context,
          author_name:  currentUser.name,
        }),
      })
      const json = await res.json()
      if (json.note) {
        setNotes(prev => [json.note, ...prev])
        setText('')
      }
    } finally {
      setSending(false)
    }
  }

  const unreadCount   = notes.filter(n => isUnread(n)).length
  const filteredNotes = filter === 'all' ? notes : notes.filter(n => n.context === filter)
  const showFilters   = notes.length >= 3

  // ... accordion + panelContent JSX (see full file for render)
  // Accordion always rendered — accOpen toggled by header button
  // canWrite gates the send form; read-only message shown if not authorized
}
```

---

## lib/useIsMobile.js

```js
import { useState, useEffect } from 'react'

export function useIsMobile(breakpoint = 768) {
  const [isMobile, setIsMobile] = useState(false)
  useEffect(() => {
    function check() { setIsMobile(window.innerWidth < breakpoint) }
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [breakpoint])
  return isMobile
}
```
