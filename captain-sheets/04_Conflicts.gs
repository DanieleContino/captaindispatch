/**
 * 04_Conflicts.gs
 * TS_PaxIndex — indice passeggeri denormalizzato
 * Conflict detection — PaxConflict_Flag su Trips
 * Captain — Transport Management System
 */

/* =========================================
   TS_PAX_INDEX
   Database denormalizzato che contiene una riga
   per ogni passeggero assegnato a ogni trip.
   Serve per:
   1. Rilevamento conflitti (stesso pax su due trip sovrapposti)
   2. Hub Coverage Assistant
   3. Pax Assignment Status sidebar
   ========================================= */

const TS_PAX_INDEX = (() => {

  const SHEET_NAME = "TS_PaxIndex";

  const HEADERS = [
    "Index_ID",
    "Date",
    "Trip_Row",
    "Trip_ID",
    "Crew_ID",
    "Full_Name",
    "Dept",
    "Unit",
    "Travel_Status",
    "Hotel_Name",
    "Hotel_ID",
    "Service_Type",
    "Transfer_Class",
    "Pickup",
    "Pickup_ID",
    "Dropoff",
    "Dropoff_ID",
    "Vehicle_ID",
    "Start_DT",
    "End_DT",
    "Source_Passenger_Col",
    "Source_Passenger_Pos",
    "Name_Key",
    "Resolve_Status",
    "Resolve_Note",
    "Updated_At"
  ];

  /* -----------------------------------------------
     SETUP SHEET
  ----------------------------------------------- */

  function ensureSheet_() {
    const ss = SpreadsheetApp.getActive();
    let sh   = ss.getSheetByName(SHEET_NAME);
    if (!sh) sh = ss.insertSheet(SHEET_NAME);

    const lr = sh.getLastRow();
    const lc = sh.getLastColumn();

    if (lr < 1 || lc < HEADERS.length) {
      sh.clear();
      _setHeader_(sh);
      return sh;
    }

    const existing = sh.getRange(1, 1, 1, HEADERS.length)
                       .getDisplayValues()[0]
                       .map(v => String(v || "").trim());

    if (!HEADERS.every((h, i) => h === existing[i])) {
      sh.clear();
      _setHeader_(sh);
    }

    return sh;
  }

  function _setHeader_(sh) {
    sh.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, HEADERS.length)
      .setFontWeight("bold")
      .setBackground("#0f172a")
      .setFontColor("#ffffff");
    sh.autoResizeColumns(1, HEADERS.length);
  }

  /* -----------------------------------------------
     LETTURA DATI TRIPS
  ----------------------------------------------- */

  function buildTripsRowMaps_() {
    const ss      = SpreadsheetApp.getActive();
    const tripsSh = ss.getSheetByName(CFG.SHEETS.TRIPS);
    if (!tripsSh) throw new Error("Trips not found");

    const hdr      = getHeaderMap_(tripsSh);
    const required = [
      "Trip_ID", "Date", "Unit", "Service_Type",
      "Pickup", "Pickup_ID", "Dropoff", "Dropoff_ID",
      "Vehicle_ID", "Start_DT", "End_DT"
    ];
    requireHeaders_(hdr, required, "Trips");

    const firstRow = CFG.TRIPS.HEADER_ROWS + 1;
    const lastRow  = getRealLastTripRow_(tripsSh);
    const lastCol  = tripsSh.getLastColumn();

    if (lastRow < firstRow) return { hdr, rawByRow: {}, displayByRow: {} };

    const numRows     = lastRow - firstRow + 1;
    const rawData     = tripsSh.getRange(firstRow, 1, numRows, lastCol).getValues();
    const displayData = tripsSh.getRange(firstRow, 1, numRows, lastCol).getDisplayValues();

    const rawByRow = {}, displayByRow = {};
    for (let i = 0; i < rawData.length; i++) {
      rawByRow[firstRow + i]     = rawData[i];
      displayByRow[firstRow + i] = displayData[i];
    }

    return { hdr, rawByRow, displayByRow };
  }

  /* -----------------------------------------------
     POSIZIONE PASSEGGERO (per Source_Passenger_Pos)
  ----------------------------------------------- */

  function buildSourcePosMap_(tpData, tpHdr) {
    const counters = {}, out = {};
    for (let i = 0; i < tpData.length; i++) {
      const row     = tpData[i];
      const tripRow = Number(row[tpHdr["Trip_Row"] - 1] || 0);
      const cId     = String(row[tpHdr["Crew_ID"]   - 1] || "").trim();
      const cName   = String(row[tpHdr["Full_Name"] - 1] || "").trim();
      if (!tripRow || (!cId && !cName)) continue;
      const key = String(tripRow) + "|" + (cId || cName);
      if (!counters[tripRow]) counters[tripRow] = 0;
      counters[tripRow]++;
      out[key] = counters[tripRow];
    }
    return out;
  }

  /* -----------------------------------------------
     COSTRUZIONE RIGA INDEX
  ----------------------------------------------- */

  function buildRowFromSingleTPRow_(
    tpRow, tpHdr,
    tripsHdr, tripsRawByRow, tripsDisplayByRow,
    crewCache, sourcePosMap, now
  ) {
    const tripId    = String(tpRow[tpHdr["Trip_ID"]   - 1] || "").trim();
    const crewIdRaw = String(tpRow[tpHdr["Crew_ID"]   - 1] || "").trim();
    const nameRaw   = String(tpRow[tpHdr["Full_Name"] - 1] || "").trim();
    const tripRow   = Number(tpRow[tpHdr["Trip_Row"]  - 1] || 0);

    if (!tripRow) return null;
    if (!tripId && !crewIdRaw && !nameRaw) return null;

    const rowRaw     = tripsRawByRow[tripRow];
    const rowDisplay = tripsDisplayByRow[tripRow];
    if (!rowRaw || !rowDisplay) return null;

    // Helper per leggere colonne Trips
    const gD = col => String(rowDisplay[tripsHdr[col] - 1] || "").trim();
    const gR = col => rowRaw[tripsHdr[col] - 1] || "";

    const tripIdFromTrips = gD("Trip_ID");
    const transferClass   = tripsHdr["Transfer_Class(auto)"]
                            ? String(rowDisplay[tripsHdr["Transfer_Class(auto)"] - 1] || "").trim()
                            : tripsHdr["Transfer_Class"]
                            ? String(rowDisplay[tripsHdr["Transfer_Class"]       - 1] || "").trim()
                            : "";

    // Risolve crew
    const resolved = resolveCrewFromTripPassenger_(crewIdRaw, nameRaw, crewCache);

    const finalCrew = resolved.ok
      ? String(resolved.record.crewId  || crewIdRaw || "").trim()
      : String(crewIdRaw || "").trim();

    const finalName = resolved.ok
      ? String(resolved.record.name    || nameRaw   || "").trim()
      : String(nameRaw   || "").trim();

    const dept        = resolved.ok ? String(resolved.record.dept        || "").trim() : "";
    const travelStatus= resolved.ok ? String(resolved.record.travelStatus|| "").trim() : "";
    const hotelName   = resolved.ok ? String(resolved.record.hotelName   || "").trim() : "";
    const hotelId     = resolved.ok ? String(resolved.record.hotelId     || "").trim().toUpperCase() : "";

    const sourcePosKey = String(tripRow) + "|" + (finalCrew || finalName || "UNKNOWN");
    const indexId = [
      tripIdFromTrips || tripId,
      finalCrew || resolved.normName || finalName || "UNKNOWN",
      "Trip_Passengers",
      tripRow
    ].join("|");

    return [
      indexId,
      gR("Date"),
      tripRow,
      tripIdFromTrips || tripId,
      finalCrew,
      finalName,
      dept,
      gD("Unit"),
      travelStatus,
      hotelName,
      hotelId,
      gD("Service_Type"),
      transferClass,
      gD("Pickup"),
      gD("Pickup_ID").toUpperCase(),
      gD("Dropoff"),
      gD("Dropoff_ID").toUpperCase(),
      gD("Vehicle_ID"),
      gR("Start_DT"),
      gR("End_DT"),
      "Trip_Passengers",
      sourcePosMap[sourcePosKey] || 1,
      resolved.normName || normName_(finalName),
      resolved.status,
      resolved.note,
      now
    ];
  }

  /* -----------------------------------------------
     BUILD TUTTE LE RIGHE
  ----------------------------------------------- */

  function buildAllRows_() {
    const ss   = SpreadsheetApp.getActive();
    const tpSh = ss.getSheetByName(CFG.SHEETS.PAX);
    if (!tpSh || tpSh.getLastRow() < 2) return [];

    const tpHdr = getHeaderMap_(tpSh);
    requireHeaders_(tpHdr, ["Trip_ID","Crew_ID","Full_Name","Trip_Row"], "Trip_Passengers");

    const tpLastRow = getRealLastPaxRow_(tpSh);
    if (tpLastRow < 2) return [];

    const tpData     = tpSh.getRange(2, 1, tpLastRow - 1, tpSh.getLastColumn()).getValues();
    const tripsMaps  = buildTripsRowMaps_();
    const crewCache  = TS_getCrewCache_();
    const now        = new Date();
    const posMap     = buildSourcePosMap_(tpData, tpHdr);
    const out        = [];

    for (let i = 0; i < tpData.length; i++) {
      const r       = tpData[i];
      const tripRow = Number(r[tpHdr["Trip_Row"] - 1] || 0);
      const cId     = String(r[tpHdr["Crew_ID"]   - 1] || "").trim();
      const cName   = String(r[tpHdr["Full_Name"] - 1] || "").trim();
      if (!tripRow || (!cId && !cName)) continue;

      const row = buildRowFromSingleTPRow_(
        r, tpHdr,
        tripsMaps.hdr, tripsMaps.rawByRow, tripsMaps.displayByRow,
        crewCache, posMap, now
      );
      if (row) out.push(row);
    }

    return out;
  }

  /* -----------------------------------------------
     BUILD RIGHE PER UN SINGOLO TRIP ROW
  ----------------------------------------------- */

  function buildRowsForTripRow_(tripRow) {
    const ss   = SpreadsheetApp.getActive();
    const tpSh = ss.getSheetByName(CFG.SHEETS.PAX);
    if (!tpSh || tpSh.getLastRow() < 2) return [];

    const tpHdr = getHeaderMap_(tpSh);
    requireHeaders_(tpHdr, ["Trip_ID","Crew_ID","Full_Name","Trip_Row"], "Trip_Passengers");

    const tpLastRow = getRealLastPaxRow_(tpSh);
    if (tpLastRow < 2) return [];

    const tpData = tpSh.getRange(2, 1, tpLastRow - 1, tpSh.getLastColumn()).getValues()
                       .filter(r => Number(r[tpHdr["Trip_Row"] - 1] || 0) === Number(tripRow));

    if (!tpData.length) return [];

    const tripsMaps = buildTripsRowMaps_();
    const crewCache = TS_getCrewCache_();
    const now       = new Date();
    const posMap    = buildSourcePosMap_(tpData, tpHdr);
    const out       = [];

    tpData.forEach(r => {
      const row = buildRowFromSingleTPRow_(
        r, tpHdr,
        tripsMaps.hdr, tripsMaps.rawByRow, tripsMaps.displayByRow,
        crewCache, posMap, now
      );
      if (row) out.push(row);
    });

    return out;
  }

  /* -----------------------------------------------
     FORMATI
  ----------------------------------------------- */

  function applyFormats_(sh, startRow, rowCount) {
    if (!rowCount) return;
    const dateCol = HEADERS.indexOf("Date")       + 1;
    const startCol= HEADERS.indexOf("Start_DT")   + 1;
    const endCol  = HEADERS.indexOf("End_DT")     + 1;
    const updCol  = HEADERS.indexOf("Updated_At") + 1;
    sh.getRange(startRow, dateCol,  rowCount, 1).setNumberFormat("dd/MM/yyyy");
    sh.getRange(startRow, startCol, rowCount, 1).setNumberFormat("dd/MM/yyyy HH:mm");
    sh.getRange(startRow, endCol,   rowCount, 1).setNumberFormat("dd/MM/yyyy HH:mm");
    sh.getRange(startRow, updCol,   rowCount, 1).setNumberFormat("dd/MM/yyyy HH:mm:ss");
  }

  /* -----------------------------------------------
     PULIZIA RIGHE PER TRIP ROW
  ----------------------------------------------- */

  function deleteRowsForTripRow_(sh, tripRow) {
    const lastRow    = sh.getLastRow();
    if (lastRow < 2) return 0;

    const tripRowCol = HEADERS.indexOf("Trip_Row") + 1;
    const values     = sh.getRange(2, tripRowCol, lastRow - 1, 1).getValues();
    const toDelete   = [];

    for (let i = values.length - 1; i >= 0; i--) {
      if (Number(values[i][0] || 0) === Number(tripRow)) toDelete.push(i + 2);
    }

    if (!toDelete.length) return 0;

    // Raggruppa delete contigue per efficienza
    const groups = [];
    let start = toDelete[0], cnt = 1;
    for (let i = 1; i < toDelete.length; i++) {
      if (toDelete[i] === toDelete[i-1] - 1) { start = toDelete[i]; cnt++; }
      else { groups.push({ start, cnt }); start = toDelete[i]; cnt = 1; }
    }
    groups.push({ start, cnt });
    groups.forEach(g => sh.deleteRows(g.start, g.cnt));

    return toDelete.length;
  }

  /* -----------------------------------------------
     API PUBBLICA
  ----------------------------------------------- */

  function rebuild() {
    const sh   = ensureSheet_();
    const rows = buildAllRows_();
    const last = sh.getLastRow();
    if (last >= 2) sh.getRange(2, 1, last - 1, sh.getLastColumn()).clearContent();
    if (!rows.length) return { rows: 0 };
    sh.getRange(2, 1, rows.length, HEADERS.length).setValues(rows);
    applyFormats_(sh, 2, rows.length);
    return { rows: rows.length };
  }

  function rebuildForTripRow_(tripRow) {
    const sh = ensureSheet_();
    deleteRowsForTripRow_(sh, tripRow);
    const rows = buildRowsForTripRow_(tripRow);
    if (!rows.length) return { tripRow, rows: 0 };
    const startRow = sh.getLastRow() + 1;
    sh.getRange(startRow, 1, rows.length, HEADERS.length).setValues(rows);
    applyFormats_(sh, startRow, rows.length);
    return { tripRow, rows: rows.length };
  }

  return { ensureSheet_, rebuild, rebuildForTripRow_, HEADERS };

})();

/* =========================================
   API PUBBLICA TS_PAX_INDEX
   ========================================= */

function TS_ensurePaxIndexSheet_() {
  return TS_PAX_INDEX.ensureSheet_();
}

function TS_rebuildPaxIndex_() {
  return TS_PAX_INDEX.rebuild();
}

function TS_rebuildPaxIndexForTripRow_(tripRow) {
  return TS_PAX_INDEX.rebuildForTripRow_(tripRow);
}

/* =========================================
   CONFLICT DETECTION
   ========================================= */

/**
 * Costruisce la mappa dei conflitti leggendo TS_PaxIndex.
 * Un conflitto = stesso crew su due trip con orari sovrapposti
 * nello stesso giorno.
 *
 * @return {Object} { tripRow: "⚠ nome1; nome2" } o { tripRow: "" }
 */
function TS_buildPaxConflictFlagsMap_() {
  const ss         = SpreadsheetApp.getActive();
  const paxIndexSh = ss.getSheetByName(CFG.SHEETS.PAX_INDEX);
  const flags      = {};

  if (!paxIndexSh || paxIndexSh.getLastRow() < 2) return flags;

  const idxHdr = getHeaderMap_(paxIndexSh);
  requireHeaders_(idxHdr, [
    "Trip_Row", "Crew_ID", "Full_Name",
    "Date", "Start_DT", "End_DT", "Resolve_Status"
  ], "TS_PaxIndex");

  const data = paxIndexSh
    .getRange(2, 1, paxIndexSh.getLastRow() - 1, paxIndexSh.getLastColumn())
    .getValues();

  // Raggruppa per crew + giorno
  const byCrewDay = {};

  for (let i = 0; i < data.length; i++) {
    const r           = data[i];
    const tripRow     = Number(r[idxHdr["Trip_Row"]       - 1] || 0);
    const crewId      = String(r[idxHdr["Crew_ID"]        - 1] || "").trim();
    const fullName    = String(r[idxHdr["Full_Name"]      - 1] || "").trim();
    const tripDate    = r[idxHdr["Date"]                  - 1];
    const startDt     = r[idxHdr["Start_DT"]              - 1];
    const endDt       = r[idxHdr["End_DT"]                - 1];
    const resolve     = String(r[idxHdr["Resolve_Status"] - 1] || "").trim();

    if (!tripRow || resolve !== "OK" || !crewId) continue;
    if (!isValidDate_(tripDate) || !isValidDate_(startDt) || !isValidDate_(endDt)) continue;
    if (endDt <= startDt) continue;

    const key = crewId + "|" + dayKey_(tripDate);
    if (!byCrewDay[key]) byCrewDay[key] = [];
    if (!flags[tripRow]) flags[tripRow] = [];

    byCrewDay[key].push({
      tripRow,
      crewId,
      fullName,
      start: startDt.getTime(),
      end:   endDt.getTime()
    });
  }

  // Rileva sovrapposizioni
  Object.keys(byCrewDay).forEach(key => {
    const trips = byCrewDay[key].sort((a, b) => a.start - b.start);

    for (let i = 0; i < trips.length; i++) {
      const a = trips[i];
      for (let j = i + 1; j < trips.length; j++) {
        const b = trips[j];
        if (b.start >= a.end) break; // ordinati per start — nessuna altra sovrapposizione

        if (a.start < b.end && b.start < a.end) {
          const label = a.fullName || a.crewId;
          if (!flags[a.tripRow]) flags[a.tripRow] = [];
          if (!flags[b.tripRow]) flags[b.tripRow] = [];
          flags[a.tripRow].push(label);
          flags[b.tripRow].push(label);
        }
      }
    }
  });

  // Deduplica e formatta
  const out = {};
  Object.keys(flags).forEach(tr => {
    const names = [...new Set(flags[tr] || [])].sort();
    out[Number(tr)] = names.length ? "⚠ " + names.join("; ") : "";
  });

  return out;
}

/**
 * Ricalcola PaxConflict_Flag su tutte le righe reali di Trips.
 * Bulk write — una sola chiamata setValues.
 */
function TS_recomputePaxConflicts_() {
  const ss      = SpreadsheetApp.getActive();
  const tripsSh = ss.getSheetByName(CFG.SHEETS.TRIPS);
  if (!tripsSh) throw new Error("Trips not found");

  const tripsHdr = getHeaderMap_(tripsSh);
  const flagCol  = tripsHdr[CFG.TRIPS.PAX_CONFLICT_FLAG];
  if (!flagCol) throw new Error("Trips missing header: " + CFG.TRIPS.PAX_CONFLICT_FLAG);

  const firstRow = CFG.TRIPS.HEADER_ROWS + 1;
  const lastRow  = getRealLastTripRow_(tripsSh);
  if (lastRow < firstRow) return;

  const flagsMap = TS_buildPaxConflictFlagsMap_();
  const out      = [];

  for (let r = firstRow; r <= lastRow; r++) {
    out.push([flagsMap[r] || ""]);
  }

  tripsSh.getRange(firstRow, flagCol, out.length, 1).setValues(out);
}

/**
 * Ricalcola PaxConflict_Flag solo per i trip row
 * impattati da una modifica specifica.
 * Molto più veloce del rebuild completo.
 *
 * @param {number} tripRow  Riga Trips modificata
 */
function TS_recomputePaxConflictsForTripRow_(tripRow) {
  const ss         = SpreadsheetApp.getActive();
  const tripsSh    = ss.getSheetByName(CFG.SHEETS.TRIPS);
  const paxIndexSh = ss.getSheetByName(CFG.SHEETS.PAX_INDEX);

  if (!tripsSh) throw new Error("Trips not found");

  const tripsHdr = getHeaderMap_(tripsSh);
  const flagCol  = tripsHdr[CFG.TRIPS.PAX_CONFLICT_FLAG];
  if (!flagCol) throw new Error("Trips missing header: " + CFG.TRIPS.PAX_CONFLICT_FLAG);

  const targetRow = Number(tripRow || 0);
  if (!targetRow || targetRow < 2) return;

  // Se PaxIndex vuoto — pulisce solo la riga target
  if (!paxIndexSh || paxIndexSh.getLastRow() < 2) {
    tripsSh.getRange(targetRow, flagCol).clearContent();
    return;
  }

  const idxHdr = getHeaderMap_(paxIndexSh);
  const data   = paxIndexSh
    .getRange(2, 1, paxIndexSh.getLastRow() - 1, paxIndexSh.getLastColumn())
    .getValues();

  // 1. Trova crew/day collegati al trip modificato
  const impactedKeys = {};
  for (let i = 0; i < data.length; i++) {
    const r       = data[i];
    const rowTrip = Number(r[idxHdr["Trip_Row"] - 1] || 0);
    if (rowTrip !== targetRow) continue;
    const crewId  = String(r[idxHdr["Crew_ID"] - 1] || "").trim();
    const dt      = r[idxHdr["Date"] - 1];
    if (!crewId || !isValidDate_(dt)) continue;
    impactedKeys[crewId + "|" + dayKey_(dt)] = true;
  }

  // Se nessun crew collegato — usa mappa globale per la sola riga target
  if (!Object.keys(impactedKeys).length) {
    const flagsMap = TS_buildPaxConflictFlagsMap_();
    tripsSh.getRange(targetRow, flagCol).setValue(flagsMap[targetRow] || "");
    return;
  }

  // 2. Trova tutti i tripRow impattati dagli stessi crew/day
  const impactedRows = { [targetRow]: true };
  for (let i = 0; i < data.length; i++) {
    const r      = data[i];
    const rRow   = Number(r[idxHdr["Trip_Row"] - 1] || 0);
    const crewId = String(r[idxHdr["Crew_ID"]  - 1] || "").trim();
    const dt     = r[idxHdr["Date"]            - 1];
    if (!rRow || !crewId || !isValidDate_(dt)) continue;
    if (impactedKeys[crewId + "|" + dayKey_(dt)]) impactedRows[rRow] = true;
  }

  // 3. Calcola flags globali, scrive solo sulle righe impattate
  const flagsMap  = TS_buildPaxConflictFlagsMap_();
  const rowsToWrite = Object.keys(impactedRows).map(Number).sort((a, b) => a - b);

  // Scrive in batch — setValue per riga (numero limitato di righe impattate)
  rowsToWrite.forEach(r => {
    tripsSh.getRange(r, flagCol).setValue(flagsMap[r] || "");
  });
}

/* =========================================
   MENU ACTIONS
   ========================================= */

function tsRebuildPaxIndex() {
  try {
    const result = TS_rebuildPaxIndex_();
    TS_log_("INFO", "tsRebuildPaxIndex", {
      sheet: CFG.SHEETS.PAX_INDEX,
      message: "Rebuilt: " + result.rows + " rows"
    });
    SpreadsheetApp.getActive().toast(
      "PaxIndex rebuilt: " + result.rows + " rows.", "Captain", 3
    );
  } catch (err) {
    TS_log_("ERROR", "tsRebuildPaxIndex", { message: err.message });
    throw err;
  }
}

function tsRecomputePaxConflicts() {
  try {
    TS_recomputePaxConflicts_();
    TS_log_("INFO", "tsRecomputePaxConflicts", {
      sheet: CFG.SHEETS.TRIPS,
      message: "Conflicts recomputed"
    });
    SpreadsheetApp.getActive().toast("Pax conflicts recomputed.", "Captain", 3);
  } catch (err) {
    TS_log_("ERROR", "tsRecomputePaxConflicts", { message: err.message });
    throw err;
  }
}

function tsEnsurePaxIndexSheet() {
  TS_ensurePaxIndexSheet_();
  SpreadsheetApp.getActive().toast("TS_PaxIndex ready.", "Captain", 3);
}
