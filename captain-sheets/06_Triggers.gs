/**
 * 06_Triggers.gs
 * Trigger onOpen, onEdit installabile, menu CAPTAIN,
 * setup, full refresh
 * Captain — Transport Management System
 */

/* =========================================
   ON OPEN — Menu CAPTAIN
   ========================================= */

function onOpen() {
  const ui = SpreadsheetApp.getUi();

  // -----------------------------------------------
  // Check partenze domani — alert se ci sono crew
  // con Departure_Date = domani non ancora OUT
  // Silenzioso se la colonna non esiste
  // -----------------------------------------------
  try { tsCheckDeparturesTomorrow(); } catch(e) {}

  // -----------------------------------------------
  // CAPTAIN — menu operativo (uso quotidiano)
  // -----------------------------------------------
  ui.createMenu("CAPTAIN")
    .addItem("+ Health Check",              "tsHealthCheck")
    .addSeparator()
    .addItem("Vehicle Availability",         "openVehicleAvailabilitySidebar")
    .addItem("Pax Assignment Status",        "openPaxAssignmentSidebar")
    .addItem("Pax Assignment",               "openNewPaxAssignmentSidebar")
    .addItem("Hub Coverage Assistant",       "openHubCoverageAssistant")
    .addItem(" Fleet Monitor",             "openFleetMonitor")
    .addSeparator()
    .addItem("Generate Transport Lists",     "tsGenerateLists")
    .addItem("Export PDF to Drive",          "tsExportAndEmail")
    .addSeparator()
    .addItem("Archive Trips Day",            "archiveTripsDay")
    .addItem("Reset Trips From Template",    "resetTripsFromTemplate")
    .addItem("Archive + Reset Trips",        "archiveAndResetTrips")
    .addToUi();

  // -----------------------------------------------
  // CAPTAIN Tools — manutenzione e setup (uso raro)
  // -----------------------------------------------
  ui.createMenu("CAPTAIN Tools")
    .addItem("⚙ Generate QR Codes",         "tsGenerateQRCodes")
    .addItem("⚙ Print Crew QR Sheet",        "tsPrintCrewQRSheet")
    .addItem("⚙ Open Wrap Trip App",         "tsOpenWrapTripApp")
    .addSeparator()
    .addItem("Setup Crew Date Columns",      "tsSetupCrewDateColumns")
    .addItem("Setup Arrival Trigger",        "tsSetupArrivalTrigger")
    .addSeparator()
    .addItem("Refresh Trips Durations",      "refreshTripsDurations")
    .addItem("Rebuild Trip_Passengers",      "tsRebuildTripPassengers")
    .addItem("Clean Trip_Passengers",        "tsCleanTripPassengers")
    .addItem("Hard Repair Pax System",       "tsHardRepairPaxSystem")
    .addSeparator()
    .addItem("Full System Refresh",          "tsFullRefresh")
    .addItem("Rebuild Pax Index",            "tsRebuildPaxIndex")
    .addItem("Recompute Pax Conflicts",      "tsRecomputePaxConflicts")
    .addItem("Refresh Routes",               "tsRefreshRoutes")
    .addItem("Rebuild DV Passengers",        "tsRebuildDV")
    .addItem("Clear TS Log",                 "tsClearLog")
    .addSeparator()
    .addItem("Create Trips Template",        "tsCreateTripsTemplate")
    .addSeparator()
    .addItem(" Setup (installa trigger)",   "tsSetupEnterprise")
    .addItem(" Setup Trips Validation",     "tsSetupTripsValidation")
    .addItem(" Clear Formulas from Trips",  "tsClearFormulasFromTrips")
    .addSeparator()
    .addItem("Map Set API Key (ORS)",        "tsSetMapsApiKey")
    .addItem("Map Test API",                 "tsTestMapsApi")
    .addItem("Test Coordinate (Haversine)",   "tsTestCoordinates")
    .addItem("Map Debug API Response",       "tsDebugOrsApi")
    .addItem("Map Recalculate Routes",       "tsRecalculateRoutesWithMaps")
    .addItem("Map Fix Lat/Lng Format",       "tsFixLatLngFormat")
    .addToUi();
}

/* =========================================
   ON EDIT INSTALLABILE — trigger principale
   ========================================= */

/**
 * Trigger installabile onEdit.
 * Chiamato da GAS ogni volta che l'utente modifica
 * una cella nei fogli monitorati.
 *
 * Principio: fa SOLO quello che serve per la cella
 * modificata — nessun rebuild globale nel trigger.
 */
function tsOnEditInstallable(e) {
  if (!e || !e.range) return;

  const sh        = e.range.getSheet();
  const sheetName = sh.getName();
  const editedCol = e.range.getColumn();
  const editedRow = e.range.getRow();

  try {

    /* -----------------------------------------------
       FLEET_REPORT_DAILY — cambio data in B2
    ----------------------------------------------- */
    if (sheetName === "Fleet_Report_Daily" && e.range.getA1Notation() === "B2") {
      if (typeof refreshFleetDailyReportFromSheetDate === "function") {
        refreshFleetDailyReportFromSheetDate();
      }
      return;
    }

    /* -----------------------------------------------
       FLEET_REPORT_WEEKLY — cambio data in B2
    ----------------------------------------------- */
    if (sheetName === "Fleet_Report_Weekly" && e.range.getA1Notation() === "B2") {
      if (typeof refreshFleetWeeklyReportFromSheetDate === "function") {
        refreshFleetWeeklyReportFromSheetDate();
      }
      return;
    }

    /* -----------------------------------------------
       HUB_REPORT_WEEKLY — cambio data in B2
    ----------------------------------------------- */
    if (sheetName === "HUB_Report_Weekly" && e.range.getA1Notation() === "B2") {
      if (typeof refreshHubWeeklyReportFromSheetDate === "function") {
        refreshHubWeeklyReportFromSheetDate();
      }
      return;
    }

    /* -----------------------------------------------
       HOTELS / HUBS — sync Routes automatico
    ----------------------------------------------- */
    if (sheetName === CFG.SHEETS.HOTELS || sheetName === CFG.SHEETS.HUBS) {
      if (editedRow < 2) return;
      hotelsHubs_onEditInstallable(e);
      return;
    }

    /* -----------------------------------------------
       CREW_MASTER — cambio Hotel_ID / Status / Travel
    ----------------------------------------------- */
    if (sheetName === CFG.SHEETS.CREW) {
      if (editedRow < 2) return;
      _handleCrewMasterEdit_(e, sh, editedRow, editedCol);
      return;
    }

    /* -----------------------------------------------
       TRIPS — il blocco più importante
    ----------------------------------------------- */
    if (sheetName === CFG.SHEETS.TRIPS) {
      if (editedRow < 2) return;
      _handleTripsEdit_(e, sh, editedRow, editedCol);
      return;
    }

  } catch (err) {
    TS_log_("ERROR", "tsOnEditInstallable", {
      sheet: sheetName,
      row:   editedRow,
      message: err.message
    });
    // Non lancia — un errore nel trigger non deve bloccare l'utente
    Logger.log("tsOnEditInstallable error: " + err.message);
  }
}

/* =========================================
   HANDLER CREW_MASTER
   ========================================= */

function _handleCrewMasterEdit_(e, sh, row, col) {
  const hdr = getHeaderMap_(sh);

  const watchedCols = [
    hdr["Hotel_ID"],
    hdr["Hotel_Status"],
    hdr["Travel_Status"],
    hdr["Arrival_Date"],    // nuova — invalidazione cache se cambia
    hdr["Departure_Date"]   // nuova — invalidazione cache se cambia
  ].filter(Boolean);

  if (!watchedCols.includes(col)) return;

  // Invalida cache immediatamente — non aspetta scadenza TTL
  TS_invalidateCrewCache_();

  // Legge la riga crew in bulk (una sola chiamata)
  const crewRow  = sh.getRange(row, 1, 1, sh.getLastColumn()).getValues()[0];
  const crewId   = hdr["Crew_ID"]   ? crewRow[hdr["Crew_ID"]   - 1] : "";
  const fullName = hdr["Full_Name"] ? crewRow[hdr["Full_Name"] - 1] : "";

  if (!crewId && !fullName) return;

  const removed = refreshTripsAffectedByCrewChange_(crewId, fullName);

  if (removed > 0) {
    SpreadsheetApp.getActive().toast(
      removed + " invalid assignment(s) removed",
      "Captain", 4
    );
  }
}

/* =========================================
   HANDLER TRIPS — il più complesso
   ========================================= */

function _handleTripsEdit_(e, sh, row, col) {
  const hdr = getHeaderMap_(sh);

  // Colonne che triggera azioni
  const puTxtCol  = hdr["Pickup"];
  const doTxtCol  = hdr["Dropoff"];
  const puIdCol   = hdr["Pickup_ID"];
  const doIdCol   = hdr["Dropoff_ID"];
  const callCol   = hdr["Call"];
  const arrTimeCol= hdr["Arr_Time"];
  const vehicleCol= hdr["Vehicle_ID"];
  const durCol    = hdr["Duration_Min"];

  // Verifica header minimi
  if (!puIdCol || !doIdCol) {
    throw new Error("Trips missing Pickup_ID / Dropoff_ID headers.");
  }

  /* ---------------------------------------------------
     CASO 1: Edit su Pickup o Dropoff (testo)
     → sync IDs → duration → transfer class
     → tempi → sync pax → refresh assignments
  --------------------------------------------------- */
  if (col === puTxtCol || col === doTxtCol) {
    // 1. Risolve ID da testo
    TS_syncTripLocationIdsSingleRow_(sh, row, hdr);
    SpreadsheetApp.flush();

    // 2. Aggiorna durata e transfer class
    TS_updateTripDurationSingleRow_(sh, row, hdr);
    TS_updateTripTransferClassSingleRow_(sh, row, hdr);

    // 3. Ricalcola tempi (la transfer class è appena cambiata)
    recalculateTimesForTripGroup_(sh, row, hdr);
    SpreadsheetApp.flush();

    // 4. Aggiorna meeting point
    updateMeetingPointSingleRow_(sh, row, hdr);

    // 5. Sync pax
    syncTripPassengersForTripsRow_(row);

    // 6. Rimuovi assegnazioni non più valide
    const removed = refreshAssignmentsAffectedByTripRowChange_(row);
    if (removed > 0) {
      SpreadsheetApp.getActive().toast(
        removed + " invalid assignment(s) removed", "Captain", 3
      );
    }
    return;
  }

  /* ---------------------------------------------------
     CASO 2: Edit su Pickup_ID o Dropoff_ID (diretto)
     → duration → transfer class → tempi → sync pax
  --------------------------------------------------- */
  if (col === puIdCol || col === doIdCol) {
    TS_updateTripDurationSingleRow_(sh, row, hdr);
    TS_updateTripTransferClassSingleRow_(sh, row, hdr);
    recalculateTimesForTripGroup_(sh, row, hdr);
    SpreadsheetApp.flush();
    updateMeetingPointSingleRow_(sh, row, hdr);
    syncTripPassengersForTripsRow_(row);
    const removed = refreshAssignmentsAffectedByTripRowChange_(row);
    if (removed > 0) {
      SpreadsheetApp.getActive().toast(
        removed + " invalid assignment(s) removed", "Captain", 3
      );
    }
    return;
  }

  /* ---------------------------------------------------
     CASO 3: Edit su Arr_Time (AL)
     → ricalcola Call per DEPARTURE/ARRIVAL
     → propaga a tutte le righe stesso Trip_ID
     → ricalcola tutti i tempi del gruppo
  --------------------------------------------------- */
  if (arrTimeCol && col === arrTimeCol) {
    // calculateTripTimesSingleRow_ gestisce il calcolo della Call
    // in base alla Transfer_Class
    calculateTripTimesSingleRow_(sh, row, hdr);
    // Propaga la Call calcolata alle altre righe del trip
    propagateCallToTripGroup_(sh, row, hdr);
    return;
  }

  /* ---------------------------------------------------
     CASO 4: Edit su Call (D) manuale (STANDARD)
     → propaga a tutte le righe stesso Trip_ID
     → ricalcola Pickup_Time, Start_DT, End_DT per tutte
  --------------------------------------------------- */
  if (callCol && col === callCol) {
    // Ricalcola prima la riga corrente
    calculateTripTimesSingleRow_(sh, row, hdr);
    // Poi propaga agli altri row dello stesso Trip_ID
    propagateCallToTripGroup_(sh, row, hdr);
    return;
  }

  /* ---------------------------------------------------
     CASO 5: Edit su Duration_Min (AU)
     → ricalcola Pickup_Time, Start_DT, End_DT
     → NON propaga — ogni riga ha la sua durata
  --------------------------------------------------- */
  if (durCol && col === durCol) {
    calculateTripTimesSingleRow_(sh, row, hdr);
    return;
  }

  /* ---------------------------------------------------
     CASO 6: Edit su Vehicle_ID (I)
     → sync Driver_Name, Sign_Code, Capacity da Fleet
  --------------------------------------------------- */
  if (vehicleCol && col === vehicleCol) {
    syncVehicleDataFromFleet_(sh, row, hdr);
    return;
  }

  // Qualsiasi altra colonna — nessuna azione
}

/* =========================================
   ON SELECTION CHANGE — Fleet Report Daily
   Bottoni prev/today/next giorno
   ========================================= */

function onSelectionChange(e) {
  if (!e || !e.range) return;
  const sh = e.range.getSheet();
  if (!sh || sh.getName() !== "Fleet_Report_Daily") return;
  if (e.range.getNumRows() > 1 || e.range.getNumColumns() > 1) return;

  const a1 = e.range.getA1Notation();
  try {
    if (a1 === "F2" && typeof fleetDailyPrevDay === "function") {
      fleetDailyPrevDay();
      _safeResetFleetDailySelection_();
    } else if (a1 === "G2" && typeof fleetDailyToday === "function") {
      fleetDailyToday();
      _safeResetFleetDailySelection_();
    } else if (a1 === "H2" && typeof fleetDailyNextDay === "function") {
      fleetDailyNextDay();
      _safeResetFleetDailySelection_();
    }
  } catch (err) {
    Logger.log("onSelectionChange error: " + err.message);
  }
}

function _safeResetFleetDailySelection_() {
  try {
    SpreadsheetApp.flush();
    const sh = SpreadsheetApp.getActive().getSheetByName("Fleet_Report_Daily");
    if (sh) sh.setActiveSelection("B2");
  } catch (err) {
    Logger.log("_safeResetFleetDailySelection_ error: " + err.message);
  }
}

/* =========================================
   SETUP
   ========================================= */

/**
 * Apre il link della Wrap Trip Web App.
 * Il link cambia ad ogni deploy — aggiornare WRAP_TRIP_URL
 * dopo aver pubblicato la Web App da Apps Script.
 */
function tsOpenWrapTripApp() {
  const ui = SpreadsheetApp.getUi();

  // Dopo il deploy, sostituisci questo URL con quello reale
  const deployUrl = PropertiesService.getScriptProperties().getProperty("WRAP_TRIP_URL");

  if (!deployUrl) {
    ui.alert(
      "Wrap Trip App -- Setup Required",
      "The Web App has not been deployed yet.\n\n" +
      "Steps to deploy:\n" +
      "1. Apps Script -> Deploy -> New Deployment\n" +
      "2. Type: Web App\n" +
      "3. Execute as: Me\n" +
      "4. Who has access: Anyone with Google Account\n" +
      "5. Copy the Web App URL\n" +
      "6. Run tsSetWrapTripUrl() and paste the URL",
      ui.ButtonSet.OK
    );
    return;
  }

  ui.alert(
    "Wrap Trip App",
    "Open this URL on your mobile:\n\n" + deployUrl +
    "\n\nTip: scan the QR below or share the link.",
    ui.ButtonSet.OK
  );
}

/**
 * Salva l'URL della Web App nelle Script Properties.
 * Eseguire una volta dopo il deploy.
 */
function tsSetWrapTripUrl() {
  const ui  = SpreadsheetApp.getUi();
  const res = ui.prompt(
    "Set Wrap Trip URL",
    "Paste the Web App URL after deployment:",
    ui.ButtonSet.OK_CANCEL
  );
  if (res.getSelectedButton() !== ui.Button.OK) return;
  const url = String(res.getResponseText() || "").trim();
  if (!url) return;
  PropertiesService.getScriptProperties().setProperty("WRAP_TRIP_URL", url);
  ui.alert("URL saved successfully.");
}

/**
 * Installa il trigger onEdit e configura il sistema.
 * Da eseguire una volta quando si carica il progetto
 * su un nuovo spreadsheet.
 */
function tsSetupEnterprise() {
  // Rimuove tutti i trigger esistenti
  ScriptApp.getProjectTriggers().forEach(t => ScriptApp.deleteTrigger(t));

  // Installa trigger onEdit installabile
  ScriptApp.newTrigger("tsOnEditInstallable")
    .forSpreadsheet(SpreadsheetApp.getActive())
    .onEdit()
    .create();

  // Verifica struttura fogli backend
  TS_ensurePaxIndexSheet_();
  ensureLogSheet_();
  upgradeTripPassengersSheetStructure_();

  SpreadsheetApp.getActive().toast(
    "CAPTAIN setup completed. Trigger installed.", "Captain", 5
  );

  TS_log_("INFO", "tsSetupEnterprise", {
    message: "Setup completed. Trigger installed."
  });
}

/* =========================================
   FULL SYSTEM REFRESH
   Ricostruisce tutto da zero — da usare
   quando qualcosa non quadra o a inizio giornata
   ========================================= */

function tsFullRefresh() {
  try {
    const ss = SpreadsheetApp.getActive();
    ss.toast("Starting full refresh...", "Captain");

    // 1. Crew cache
    TS_refreshCrewCache_();
    ss.toast("Crew cache rebuilt...", "Captain");

    // 2. DV Passengers
    TS_rebuildDVSheet_();
    ss.toast("DV Passengers rebuilt...", "Captain");

    // 3. Location IDs e durate
    TS_syncAllTripLocationIds_();
    ss.toast("Location IDs and durations refreshed...", "Captain");

    // 4. Sync Transfer_Class(auto) per tutte le righe
    _syncAllTripTransferClasses_();
    ss.toast("Transfer classes synced...", "Captain");

    // 5. Sync Vehicle data (Driver, Sign, Capacity) per tutte le righe
    _syncAllVehicleData_();
    ss.toast("Vehicle data synced...", "Captain");

    // 6. Ricalcola tempi per tutte le righe
    _recalculateAllTripTimes_();
    ss.toast("Trip times recalculated...", "Captain");

    // 7. Passenger list
    updateTripsPassengerListAuto_();
    ss.toast("Passenger lists updated...", "Captain");

    // 8. PaxIndex
    TS_rebuildPaxIndex_();
    ss.toast("PaxIndex rebuilt...", "Captain");

    // 9. Conflicts
    TS_recomputePaxConflicts_();

    ss.toast("Full refresh completed.", "Captain", 5);

    TS_log_("INFO", "tsFullRefresh", {
      message: "Full system refresh completed"
    });

  } catch (err) {
    TS_log_("ERROR", "tsFullRefresh", { message: err.message });
    throw err;
  }
}

/**
 * Ricalcola tempi (Call, Pickup_Time, Start_DT, End_DT)
 * per tutte le righe reali di Trips in bulk.
 * Chiamata da tsFullRefresh.
 */
function _recalculateAllTripTimes_() {
  const ss = SpreadsheetApp.getActive();
  const sh = ss.getSheetByName(CFG.SHEETS.TRIPS);
  if (!sh) return;

  const hdr      = getHeaderMap_(sh);
  const firstRow = CFG.TRIPS.HEADER_ROWS + 1;
  const lastRow  = getRealLastTripRow_(sh);
  if (lastRow < firstRow) return;

  const numRows  = lastRow - firstRow + 1;
  const data     = sh.getRange(firstRow, 1, numRows, sh.getLastColumn()).getValues();
  const tripIdCol= (hdr["Trip_ID"] || 1) - 1;

  for (let i = 0; i < data.length; i++) {
    const rowNum = firstRow + i;
    const tripId = String(data[i][tripIdCol] || "").trim();
    if (!tripId) continue; // salta righe template
    calculateTripTimesSingleRow_(sh, rowNum, hdr);
  }

  Logger.log("All trip times recalculated: " + numRows + " rows processed");
}

/**
 * Sincronizza Transfer_Class(auto) su tutte le righe
 * reali di Trips in bulk.
 * Chiamata da tsFullRefresh.
 */
function _syncAllTripTransferClasses_() {
  const ss = SpreadsheetApp.getActive();
  const sh = ss.getSheetByName(CFG.SHEETS.TRIPS);
  if (!sh) return;

  const hdr    = getHeaderMap_(sh);
  const tcCol  = hdr["Transfer_Class(auto)"];
  const pidCol = hdr["Pickup_ID"];
  const didCol = hdr["Dropoff_ID"];
  const tidCol = hdr["Trip_ID"];
  if (!tcCol || !pidCol || !didCol) return;

  const firstRow = CFG.TRIPS.HEADER_ROWS + 1;
  const lastRow  = getRealLastTripRow_(sh);
  if (lastRow < firstRow) return;

  const numRows = lastRow - firstRow + 1;
  const data    = sh.getRange(firstRow, 1, numRows, sh.getLastColumn()).getValues();
  const out     = [];

  for (let i = 0; i < data.length; i++) {
    const r      = data[i];
    const tripId = tidCol ? String(r[tidCol - 1] || "").trim() : "";
    if (!tripId) { out.push([""]); continue; }
    const pid = String(r[pidCol - 1] || "").trim().toUpperCase();
    const did = String(r[didCol - 1] || "").trim().toUpperCase();
    out.push([getTransferClass_(pid, did)]);
  }

  sh.getRange(firstRow, tcCol, out.length, 1).setValues(out);
  Logger.log("Transfer classes synced: " + out.length + " rows");
}

/**
 * Sincronizza Driver_Name(auto), Sign_Code(auto),
 * Capacity(auto) da Fleet su tutte le righe reali
 * di Trips in bulk.
 * Chiamata da tsFullRefresh.
 */
function _syncAllVehicleData_() {
  const ss      = SpreadsheetApp.getActive();
  const tripsSh = ss.getSheetByName(CFG.SHEETS.TRIPS);
  const fleetSh = ss.getSheetByName(CFG.SHEETS.FLEET);
  if (!tripsSh || !fleetSh) return;

  const tripsHdr = getHeaderMap_(tripsSh);
  const fleetHdr = getHeaderMap_(fleetSh);

  const vehicleCol = tripsHdr["Vehicle_ID"];
  const driverCol  = tripsHdr["Driver_Name(auto)"];
  const signCol    = tripsHdr["Sign_Code(auto)"];
  const capCol     = tripsHdr["Capacity(auto)"];
  const tidCol     = tripsHdr["Trip_ID"];
  if (!vehicleCol || !driverCol || !signCol || !capCol) return;

  // Costruisce lookup Fleet in memoria — una sola lettura
  const fleetLast = fleetSh.getLastRow();
  const fleetData = fleetLast >= 2
    ? fleetSh.getRange(2, 1, fleetLast - 1, fleetSh.getLastColumn()).getValues()
    : [];

  const fleetMap = {};
  fleetData.forEach(r => {
    const vid  = fleetHdr["Vehicle_ID"]  ? String(r[fleetHdr["Vehicle_ID"]  - 1] || "").trim() : "";
    const drv  = fleetHdr["Driver_Name"] ? String(r[fleetHdr["Driver_Name"] - 1] || "").trim() : "";
    const sign = fleetHdr["Sign_Code"]   ? String(r[fleetHdr["Sign_Code"]   - 1] || "").trim() : "";
    const cap  = fleetHdr["Capacity"]    ? String(r[fleetHdr["Capacity"]    - 1] || "").trim() : "";
    if (vid) fleetMap[vid] = { drv, sign, cap };
  });

  const firstRow = CFG.TRIPS.HEADER_ROWS + 1;
  const lastRow  = getRealLastTripRow_(tripsSh);
  if (lastRow < firstRow) return;

  const numRows = lastRow - firstRow + 1;
  const data    = tripsSh.getRange(firstRow, 1, numRows, tripsSh.getLastColumn()).getValues();

  const drvOut = [], signOut = [], capOut = [];

  for (let i = 0; i < data.length; i++) {
    const r      = data[i];
    const tripId = tidCol ? String(r[tidCol - 1] || "").trim() : "";
    if (!tripId) {
      drvOut.push([""]); signOut.push([""]); capOut.push([""]);
      continue;
    }
    const vid     = String(r[vehicleCol - 1] || "").trim();
    const vehicle = fleetMap[vid] || { drv: "", sign: "", cap: "" };
    drvOut.push([vehicle.drv]);
    signOut.push([vehicle.sign]);
    capOut.push([vehicle.cap]);
  }

  tripsSh.getRange(firstRow, driverCol, numRows, 1).setValues(drvOut);
  tripsSh.getRange(firstRow, signCol,   numRows, 1).setValues(signOut);
  tripsSh.getRange(firstRow, capCol,    numRows, 1).setValues(capOut);

  Logger.log("Vehicle data synced: " + numRows + " rows");
}

/* =========================================
   CLEAR FORMULAS FROM TRIPS
   Elimina le formule pre-caricate nelle colonne
   auto di Trips e le sostituisce con valori
   calcolati dagli script.
   Da eseguire una volta dopo l'installazione,
   o ogni volta che si aggiungono colonne.
   ========================================= */

/**
 * Cancella le formule dalle colonne auto di Trips
 * (Pickup_Time, Driver_Name(auto), Sign_Code(auto),
 * Capacity(auto), Meeting_Point(auto),
 * Transfer_Class(auto), Start_DT, End_DT,
 * OverCap_Flag, VehicleConflict_Count)
 * su tutte le righe del foglio, poi esegue
 * tsFullRefresh() per riscrivere i valori corretti
 * sulle righe con dati reali.
 */
function tsClearFormulasFromTrips() {
  const ss = SpreadsheetApp.getActive();
  const sh = ss.getSheetByName(CFG.SHEETS.TRIPS);
  if (!sh) throw new Error("Trips sheet not found.");

  const ui = SpreadsheetApp.getUi();
  const confirm = ui.alert(
    "Clear Formulas from Trips",
    "This will remove all pre-loaded formulas from the auto columns in Trips " +
    "(Pickup_Time, Driver, Sign, Capacity, Meeting Point, Transfer Class, Start_DT, End_DT, etc.) " +
    "and replace them with script-calculated values.\n\n" +
    "Run this once after installation or after adding/removing columns.\n\n" +
    "Continue?",
    ui.ButtonSet.OK_CANCEL
  );

  if (confirm !== ui.Button.OK) return;

  const hdr      = getHeaderMap_(sh);
  const lastRow  = sh.getMaxRows();
  const dataStart= CFG.TRIPS.HEADER_ROWS + 1;
  if (lastRow < dataStart) return;

  const numRows = lastRow - dataStart + 1;

  // Colonne auto da pulire — trovate per nome, indipendenti dalla posizione
  const AUTO_COLS = [
    "Pickup_Time",
    "Driver_Name(auto)",
    "Sign_Code(auto)",
    "Capacity(auto)",
    "Meeting_Point(auto)",
    "Transfer_Class(auto)",
    "Start_DT",
    "End_DT",
    "OverCap_Flag",
    "VehicleConflict_Count"
  ];

  let cleared = 0;
  AUTO_COLS.forEach(colName => {
    const col = hdr[colName];
    if (!col) return;
    sh.getRange(dataStart, col, numRows, 1).clearContent();
    cleared++;
    Logger.log("Cleared: " + colName + " (col " + col + ")");
  });

  ss.toast("Formulas cleared from " + cleared + " columns. Running Full Refresh...", "Captain");
  SpreadsheetApp.flush();

  // Riscrive i valori corretti sulle righe con dati reali
  tsFullRefresh();

  TS_log_("INFO", "tsClearFormulasFromTrips", {
    sheet: CFG.SHEETS.TRIPS,
    message: "Cleared " + cleared + " auto columns, full refresh completed"
  });

  ui.alert(
    "Done",
    "Formulas removed from " + cleared + " auto columns.\n" +
    "Script-calculated values have been restored on all real trip rows.",
    ui.ButtonSet.OK
  );
}

/* =========================================
   LEGACY STUBS
   Funzioni disabilitate — mantenute per
   compatibilità con trigger eventualmente
   ancora registrati
   ========================================= */

function trips_onEditInstallable() {
  throw new Error(
    "trips_onEditInstallable is disabled. " +
    "System migrated to Trip_Passengers. " +
    "Run tsSetupEnterprise() to reinstall triggers."
  );
}

function updateAGandPaxTotal() {
  // no-op — legacy
}

function refreshAllTripsPassengerListAndTotal() {
  updateTripsPassengerListAuto_();
}

function dvOnEditTriggerAuto() {
  try { refreshAllDvCachesAutoHeaders(); }
  catch (err) { Logger.log("dvOnEditTriggerAuto error: " + err.message); }
}

/* =========================================
   SETUP TRIPS DATA VALIDATION
   Ricrea tutti i dropdown su Trips e Trips_Template
   ========================================= */

function tsSetupTripsValidation() {
  const ss = SpreadsheetApp.getActive();

  const sheets = [
    ss.getSheetByName(CFG.SHEETS.TRIPS),
    ss.getSheetByName("Trips_Template")
  ].filter(Boolean);

  if (!sheets.length) throw new Error("No Trips sheet found");

  const NUM_ROWS = 200; // Righe con DV

  sheets.forEach(sh => {
    const hdr = getHeaderMap_(sh);
    _applyTripsDV_(ss, sh, hdr, NUM_ROWS);
    _applyTripsConditionalFormatting_(sh, hdr, NUM_ROWS);
  });

  SpreadsheetApp.getActive().toast(
    "Data validation set on " + NUM_ROWS + " rows.", "Captain", 3
  );
}

function _applyTripsConditionalFormatting_(sh, hdr, numRows) {
  const tcCol = hdr["Transfer_Class(auto)"];
  if (!tcCol) return;

  const lastCol   = sh.getLastColumn();
  const dataRange = sh.getRange(2, 1, numRows, lastCol);
  const colLetter = String.fromCharCode(64 + tcCol);

  sh.clearConditionalFormatRules();

  const rules = [];

  rules.push(
    SpreadsheetApp.newConditionalFormatRule()
      .whenFormulaSatisfied('=$' + colLetter + '2="ARRIVAL"')
      .setBackground("#b7e1cd")
      .setRanges([dataRange])
      .build()
  );

  rules.push(
    SpreadsheetApp.newConditionalFormatRule()
      .whenFormulaSatisfied('=$' + colLetter + '2="DEPARTURE"')
      .setBackground("#f9cb9c")
      .setRanges([dataRange])
      .build()
  );

  sh.setConditionalFormatRules(rules);
  Logger.log("Conditional formatting applied on " + sh.getName());
}

function _applyTripsDV_(ss, sh, hdr, numRows) {
  const listsSh = ss.getSheetByName(CFG.SHEETS.LISTS);
  const fleetSh = ss.getSheetByName(CFG.SHEETS.FLEET);
  if (!listsSh || !fleetSh) throw new Error("Lists or Fleet sheet not found");

  const listsLastRow = Math.max(listsSh.getLastRow(), 2);
  const fleetLastRow = Math.max(fleetSh.getLastRow(), 2);

  const dvFromRange = (rangeA1) =>
    SpreadsheetApp.newDataValidation()
      .requireValueInRange(ss.getRange(rangeA1), true)
      .setAllowInvalid(false)
      .build();

  const unitCol = hdr["Unit"];
  if (unitCol) {
    sh.getRange(2, unitCol, numRows, 1)
      .setDataValidation(dvFromRange(CFG.SHEETS.LISTS + "!A2:A" + listsLastRow));
  }

  const stCol = hdr["Service_Type"];
  if (stCol) {
    sh.getRange(2, stCol, numRows, 1)
      .setDataValidation(
        SpreadsheetApp.newDataValidation()
          .requireValueInRange(ss.getRange(CFG.SHEETS.LISTS + "!B2:B" + listsLastRow), true)
          .setAllowInvalid(true)
          .build()
      );
  }

  const puCol = hdr["Pickup"];
  if (puCol) {
    sh.getRange(2, puCol, numRows, 1)
      .setDataValidation(dvFromRange(CFG.SHEETS.LISTS + "!E2:E" + listsLastRow));
  }

  const doCol = hdr["Dropoff"];
  if (doCol) {
    sh.getRange(2, doCol, numRows, 1)
      .setDataValidation(dvFromRange(CFG.SHEETS.LISTS + "!E2:E" + listsLastRow));
  }

  const vCol = hdr["Vehicle_ID"];
  if (vCol) {
    sh.getRange(2, vCol, numRows, 1)
      .setDataValidation(dvFromRange(CFG.SHEETS.FLEET + "!A2:A" + fleetLastRow));
  }

  Logger.log("DV applied on " + sh.getName() + " -- " + numRows + " rows");
}
/* =========================================
   FLEET MONITOR
   ========================================= */

function openFleetMonitor() {
  // I dati vengono caricati dal modal stesso via google.script.run —
  // nessun payload inline nel template per evitare errori di escape JSON.
  const html = HtmlService.createHtmlOutputFromFile("FleetMonitor")
    .setTitle("Fleet Monitor")
    .setWidth(720);

  SpreadsheetApp.getUi().showModalDialog(html, "🚗 Fleet Monitor");
}