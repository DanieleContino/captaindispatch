/**
 * 02_Trips.gs
 * Gestione Trips, calcolo tempi, Trip_Passengers,
 * assegnazione passeggeri, archivio
 * Captain — Transport Management System
 */

/* =========================================
   COSTANTI TRIP_PASSENGERS
   ========================================= */

const TP_HEADERS = [
  "Trip_ID", "Crew_ID", "Full_Name",
  "Pickup_ID", "Dropoff_ID",
  "Start_DT", "End_DT", "Trip_Row"
];

/* =========================================
   CALCOLO TEMPI — cuore del sistema
   ========================================= */

/**
 * Calcola e scrive Call, Pickup_Time, Start_DT, End_DT
 * per una singola riga di Trips.
 *
 * Logica:
 * DEPARTURE (hotel→hub): Call = Arr_Time - CHECKIN_BUFFER
 * ARRIVAL   (hub→hotel): Call = Arr_Time
 * STANDARD:              Call = inserita manualmente (non toccare)
 *
 * Pickup_Time:
 *   ARRIVAL   → Pickup_Time = Call  (driver già all'hub, non parte da hotel)
 *   DEPARTURE / STANDARD → Pickup_Time = Call - Duration
 * Start_DT = Date + Pickup_Time
 * End_DT   = Start_DT + Duration
 *
 * @param {Sheet}  sh      Foglio Trips
 * @param {number} rowNum  Numero riga
 * @param {Object} hdrOpt  Header map opzionale
 */
function calculateTripTimesSingleRow_(sh, rowNum, hdrOpt) {
  const hdr = hdrOpt || getHeaderMap_(sh);

  // Colonne necessarie
  const dateCol    = hdr["Date"];
  const callCol    = hdr["Call"];
  const puTimeCol  = hdr["Pickup_Time"];
  const durCol     = hdr["Duration_Min"];
  const startCol   = hdr["Start_DT"];
  const endCol     = hdr["End_DT"];
  const arrTimeCol = hdr["Arr_Time"];
  const tcCol      = hdr["Transfer_Class(auto)"];
  const pidCol     = hdr["Pickup_ID"];
  const didCol     = hdr["Dropoff_ID"];

  if (!dateCol || !callCol || !puTimeCol || !durCol || !startCol || !endCol) {
    Logger.log("calculateTripTimesSingleRow_: missing required headers");
    return;
  }

  const row = sh.getRange(rowNum, 1, 1, sh.getLastColumn()).getValues()[0];

  const dateVal = row[dateCol - 1];
  const durVal  = row[durCol  - 1];
  const pidVal  = pidCol ? String(row[pidCol - 1] || "").trim().toUpperCase() : "";
  const didVal  = didCol ? String(row[didCol - 1] || "").trim().toUpperCase() : "";
  const tc      = tcCol  ? String(row[tcCol  - 1] || "").trim().toUpperCase()
                         : getTransferClass_(pidVal, didVal);

  // Se non c'è la data non possiamo calcolare niente
  const dateObj = toDateSafe_(dateVal);
  if (!dateObj) return;

  const dur = Number(durVal || 0);

  // --- Calcola Call per DEPARTURE e ARRIVAL ---
  let callMinutes = null; // null = non modificare

  if (arrTimeCol) {
    const arrVal = row[arrTimeCol - 1];
    const arrMin = toTimeMinutes_(arrVal);

    if (arrMin !== null) {
      if (tc === "DEPARTURE") {
        // Parti in tempo per il check-in
        callMinutes = arrMin - CFG.HUB.CHECKIN_BUFFER_MIN;
        if (callMinutes < 0) callMinutes += 1440; // gestisce mezzanotte
      } else if (tc === "ARRIVAL") {
        // Sii all'aeroporto all'arrivo del volo
        callMinutes = arrMin;
      }
    }
  }

  // Scrive Call se calcolata (DEPARTURE/ARRIVAL)
  // Per STANDARD non tocca — è inserita manualmente dall'utente
  if (callMinutes !== null) {
    const callDate = combineDateAndMinutes_(dateObj, callMinutes);
    sh.getRange(rowNum, callCol).setValue(callDate);
  }

  // Legge Call (aggiornata o esistente)
  const callRow = sh.getRange(rowNum, callCol).getValue();
  const callMin = toTimeMinutes_(callRow);
  if (callMin === null) return; // no Call → non possiamo calcolare

  // Pickup_Time:
  // ARRIVAL (hub→hotel): il driver aspetta all'hub → Pickup_Time = Call
  //   La Duration è il tempo hub→hotel, Start_DT/End_DT lo usano comunque.
  // DEPARTURE/STANDARD:  Pickup_Time = Call - Duration (il driver parte da un hotel)
  const puMin  = (tc === "ARRIVAL") ? callMin : callMin - dur;
  const puDate = combineDateAndMinutes_(dateObj, puMin < 0 ? puMin + 1440 : puMin);

  // Start_DT = Date + Pickup_Time
  const startDt = new Date(dateObj);
  startDt.setHours(puDate.getHours(), puDate.getMinutes(), 0, 0);

  // End_DT = Start_DT + Duration
  const endDt = new Date(startDt.getTime() + dur * 60000);

  // Scrive tutto in bulk — 3 celle
  sh.getRange(rowNum, puTimeCol).setValue(puDate);
  sh.getRange(rowNum, startCol ).setValue(startDt);
  sh.getRange(rowNum, endCol   ).setValue(endDt);

  // Formati
  sh.getRange(rowNum, puTimeCol).setNumberFormat("HH:mm");
  sh.getRange(rowNum, callCol  ).setNumberFormat("HH:mm");
  sh.getRange(rowNum, startCol ).setNumberFormat("dd/MM/yyyy HH:mm");
  sh.getRange(rowNum, endCol   ).setNumberFormat("dd/MM/yyyy HH:mm");
}

/**
 * Propaga la Call a tutte le righe dello stesso Trip_ID
 * e ricalcola i tempi per ognuna.
 *
 * Usata quando:
 * - L'utente modifica D (Call) su una riga STANDARD
 * - Lo script calcola la Call su una riga DEPARTURE/ARRIVAL
 *
 * @param {Sheet}  sh      Foglio Trips
 * @param {number} rowNum  Riga modificata
 * @param {Object} hdr     Header map
 */
function propagateCallToTripGroup_(sh, rowNum, hdr) {
  const tripIdCol = hdr["Trip_ID"];
  const callCol   = hdr["Call"];
  if (!tripIdCol || !callCol) return;

  // Legge il Trip_ID e la Call della riga modificata
  const editedRow = sh.getRange(rowNum, 1, 1, sh.getLastColumn()).getValues()[0];
  const tripId    = String(editedRow[tripIdCol - 1] || "").trim();
  const callVal   = editedRow[callCol - 1];

  if (!tripId || !callVal) return;

  // Cerca tutte le righe con lo stesso Trip_ID
  const firstRow = CFG.TRIPS.HEADER_ROWS + 1;
  const lastRow  = getRealLastTripRow_(sh);
  if (lastRow < firstRow) return;

  const numRows = lastRow - firstRow + 1;
  const data    = sh.getRange(firstRow, tripIdCol, numRows, 1).getValues();

  for (let i = 0; i < data.length; i++) {
    const r   = firstRow + i;
    if (r === rowNum) continue; // già aggiornata
    const tid = String(data[i][0] || "").trim();
    if (tid !== tripId) continue;

    // Scrive la stessa Call e ricalcola i tempi
    sh.getRange(r, callCol).setValue(callVal);
    calculateTripTimesSingleRow_(sh, r, hdr);
  }
}

/**
 * Ricalcola i tempi per tutte le righe dello stesso Trip_ID.
 * Versione che ricalcola anche la riga sorgente.
 */
function recalculateTimesForTripGroup_(sh, rowNum, hdr) {
  const tripIdCol = hdr["Trip_ID"];
  if (!tripIdCol) return;

  const editedRow = sh.getRange(rowNum, 1, 1, sh.getLastColumn()).getValues()[0];
  const tripId    = String(editedRow[tripIdCol - 1] || "").trim();
  if (!tripId) {
    calculateTripTimesSingleRow_(sh, rowNum, hdr);
    return;
  }

  const firstRow = CFG.TRIPS.HEADER_ROWS + 1;
  const lastRow  = getRealLastTripRow_(sh);
  if (lastRow < firstRow) return;

  const numRows = lastRow - firstRow + 1;
  const data    = sh.getRange(firstRow, tripIdCol, numRows, 1).getValues();

  for (let i = 0; i < data.length; i++) {
    const r   = firstRow + i;
    const tid = String(data[i][0] || "").trim();
    if (tid !== tripId) continue;
    calculateTripTimesSingleRow_(sh, r, hdr);
  }
}

/* =========================================
   SYNC VEICOLO DA FLEET
   ========================================= */

/**
 * Quando Vehicle_ID cambia, aggiorna automaticamente
 * Driver_Name(auto), Sign_Code(auto), Capacity(auto)
 * leggendo dal foglio Fleet.
 *
 * @param {Sheet}  sh      Foglio Trips
 * @param {number} rowNum  Numero riga
 * @param {Object} hdrOpt  Header map opzionale
 */
function syncVehicleDataFromFleet_(sh, rowNum, hdrOpt) {
  const hdr = hdrOpt || getHeaderMap_(sh);

  const vehicleCol  = hdr["Vehicle_ID"];
  const driverCol   = hdr["Driver_Name(auto)"];
  const signCol     = hdr["Sign_Code(auto)"];
  const capCol      = hdr["Capacity(auto)"];

  if (!vehicleCol) return;

  const row       = sh.getRange(rowNum, 1, 1, sh.getLastColumn()).getValues()[0];
  const vehicleId = String(row[vehicleCol - 1] || "").trim();

  if (!vehicleId) {
    // Vehicle_ID rimosso — pulisce le colonne auto
    if (driverCol) sh.getRange(rowNum, driverCol).setValue("");
    if (signCol)   sh.getRange(rowNum, signCol  ).setValue("");
    if (capCol)    sh.getRange(rowNum, capCol   ).setValue("");
    return;
  }

  // Legge Fleet
  const ss      = SpreadsheetApp.getActive();
  const fleetSh = ss.getSheetByName(CFG.SHEETS.FLEET);
  if (!fleetSh || fleetSh.getLastRow() < 2) return;

  const fleetHdr  = getHeaderMap_(fleetSh);
  const fleetData = fleetSh.getRange(2, 1, fleetSh.getLastRow() - 1, fleetSh.getLastColumn())
                           .getValues();

  let driverName = "", signCode = "", capacity = "";

  for (let i = 0; i < fleetData.length; i++) {
    const fVehicleId = String(
      fleetHdr["Vehicle_ID"] ? fleetData[i][fleetHdr["Vehicle_ID"] - 1] : fleetData[i][0]
    || "").trim();

    if (fVehicleId !== vehicleId) continue;

    driverName = fleetHdr["Driver_Name"] ?
                 String(fleetData[i][fleetHdr["Driver_Name"] - 1] || "").trim() : "";
    signCode   = fleetHdr["Sign_Code"] ?
                 String(fleetData[i][fleetHdr["Sign_Code"]   - 1] || "").trim() : "";
    capacity   = fleetHdr["Capacity"] ?
                 String(fleetData[i][fleetHdr["Capacity"]    - 1] || "").trim() : "";
    break;
  }

  if (driverCol) sh.getRange(rowNum, driverCol).setValue(driverName);
  if (signCol)   sh.getRange(rowNum, signCol  ).setValue(signCode);
  if (capCol)    sh.getRange(rowNum, capCol   ).setValue(capacity);
}

/* =========================================
   TRIP_PASSENGERS — struttura e setup
   ========================================= */

function createTripPassengersSheet() {
  const ss = SpreadsheetApp.getActive();
  if (ss.getSheetByName(CFG.SHEETS.PAX)) {
    Logger.log("Trip_Passengers già esiste");
    return;
  }
  const sh = ss.insertSheet(CFG.SHEETS.PAX);
  sh.getRange(1, 1, 1, TP_HEADERS.length).setValues([TP_HEADERS]);
  sh.getRange("F:G").setNumberFormat("dd/MM/yyyy HH:mm");
  sh.getRange("H:H").setNumberFormat("0");
  sh.setFrozenRows(1);
}

function upgradeTripPassengersSheetStructure_() {
  const ss = SpreadsheetApp.getActive();
  const sh = ss.getSheetByName(CFG.SHEETS.PAX);
  if (!sh) throw new Error("Trip_Passengers sheet not found");

  if (sh.getLastColumn() < TP_HEADERS.length) {
    sh.insertColumnsAfter(sh.getLastColumn(), TP_HEADERS.length - sh.getLastColumn());
  }

  sh.getRange(1, 1, 1, TP_HEADERS.length).setValues([TP_HEADERS]);
  sh.getRange("F:G").setNumberFormat("dd/MM/yyyy HH:mm");
  sh.getRange("H:H").setNumberFormat("0");
  sh.setFrozenRows(1);

  // Normalizza Trip_Row (col H) in bulk
  const lastRow = sh.getLastRow();
  if (lastRow >= 2) {
    const hRange  = sh.getRange(2, 8, lastRow - 1, 1);
    const hValues = hRange.getValues();
    const fixed   = hValues.map(row => {
      const v = row[0];
      if (v === "" || v === null) return [""];
      if (typeof v === "number" && !isNaN(v)) return [Math.round(v)];
      if (v instanceof Date && isValidDate_(v)) {
        const base = new Date(1899, 11, 30);
        const days = Math.round((v.getTime() - base.getTime()) / 86400000);
        return [days > 0 ? days : ""];
      }
      const n = Number(String(v).trim());
      return [!isNaN(n) && n > 0 ? Math.round(n) : ""];
    });
    hRange.setValues(fixed);
  }

  Logger.log("Trip_Passengers structure upgraded.");
}

function upgradeTripPassengersSheetStructure() {
  upgradeTripPassengersSheetStructure_();
}

/* =========================================
   PASSEGGERI — lettura normalizzata
   ========================================= */

/**
 * Legge i passeggeri assegnati a una riga Trips
 * da Trip_Passengers. Restituisce nomi normalizzati.
 *
 * Questa è la funzione che mancava nel codice originale
 * (getNormalizedPassengersForTripRow_ era chiamata ma
 * non definita — persa durante le iterazioni con ChatGPT).
 *
 * @param  {number} tripRow  Numero riga in Trips
 * @return {string[]}        Array di nomi normalizzati
 */
function getNormalizedPassengersForTripRow_(tripRow) {
  const ss   = SpreadsheetApp.getActive();
  const tpSh = ss.getSheetByName(CFG.SHEETS.PAX);
  if (!tpSh || tpSh.getLastRow() < 2) return [];

  const hdr        = getHeaderMap_(tpSh);
  const tripRowCol = hdr["Trip_Row"];
  const nameCol    = hdr["Full_Name"];
  const crewIdCol  = hdr["Crew_ID"];
  if (!tripRowCol || !nameCol) return [];

  const lastRow = getRealLastPaxRow_(tpSh);
  if (lastRow < 2) return [];

  const data = tpSh.getRange(2, 1, lastRow - 1, tpSh.getLastColumn()).getValues();
  const out  = [];

  for (let i = 0; i < data.length; i++) {
    if (Number(data[i][tripRowCol - 1] || 0) !== Number(tripRow)) continue;
    const name = String(data[i][nameCol - 1] || "").trim() ||
                 (crewIdCol ? String(data[i][crewIdCol - 1] || "").trim() : "");
    if (name) out.push(normName_(name));
  }

  return out;
}

/* =========================================
   PASSENGER LIST — aggiornamento Trips
   ========================================= */

/**
 * Aggiorna Passenger_List(auto) e Pax_Count(auto) su Trips.
 * Bulk: legge Trip_Passengers, costruisce mappa in memoria,
 * scrive due colonne in una sola chiamata.
 */
function updateTripsPassengerListAuto_() {
  const ss      = SpreadsheetApp.getActive();
  const tripsSh = ss.getSheetByName(CFG.SHEETS.TRIPS);
  const tpSh    = ss.getSheetByName(CFG.SHEETS.PAX);
  if (!tripsSh || !tpSh) return;

  const tripsHdr = getHeaderMap_(tripsSh);
  const tpHdr    = getHeaderMap_(tpSh);

  const paxListCol = tripsHdr["Passenger_List(auto)"];
  const paxCntCol  = tripsHdr["Pax_Count(auto)"];
  if (!paxListCol || !paxCntCol) return;

  const tripRowCol = tpHdr["Trip_Row"];
  const nameCol    = tpHdr["Full_Name"];
  const crewIdCol  = tpHdr["Crew_ID"];
  if (!tripRowCol || (!nameCol && !crewIdCol)) return;

  const firstRow    = CFG.TRIPS.HEADER_ROWS + 1;
  const lastTripRow = getRealLastTripRow_(tripsSh);
  if (lastTripRow < firstRow) return;

  // Legge Trip_Passengers in bulk
  const tpLastRow = getRealLastPaxRow_(tpSh);
  const tpData    = tpLastRow >= 2
    ? tpSh.getRange(2, 1, tpLastRow - 1, tpSh.getLastColumn()).getDisplayValues()
    : [];

  // Costruisce mappa tripRow → [nomi] in memoria
  const paxByRow = {};
  for (let i = 0; i < tpData.length; i++) {
    const r       = tpData[i];
    const tripRow = Number(r[tripRowCol - 1] || 0);
    if (!tripRow) continue;
    const name = (nameCol   ? String(r[nameCol   - 1] || "").trim() : "") ||
                 (crewIdCol ? String(r[crewIdCol  - 1] || "").trim() : "");
    if (!name) continue;
    if (!paxByRow[tripRow]) paxByRow[tripRow] = [];
    paxByRow[tripRow].push(name);
  }

  const numRows = lastTripRow - firstRow + 1;
  const listOut = [], cntOut = [];

  for (let rowNum = firstRow; rowNum <= lastTripRow; rowNum++) {
    const uniq = dedupeNames_(paxByRow[rowNum] || []);
    listOut.push([uniq.join(", ")]);
    cntOut.push([uniq.length || ""]);
  }

  tripsSh.getRange(firstRow, paxListCol, numRows, 1).setValues(listOut);
  tripsSh.getRange(firstRow, paxCntCol,  numRows, 1).setValues(cntOut);
}

/**
 * Versione single-row — aggiorna solo la riga specificata.
 * Più veloce del rebuild completo per aggiornamenti singoli.
 */
function updateTripsPassengerListAutoForTripRow_(tripRow) {
  const ss      = SpreadsheetApp.getActive();
  const tripsSh = ss.getSheetByName(CFG.SHEETS.TRIPS);
  const tpSh    = ss.getSheetByName(CFG.SHEETS.PAX);
  if (!tripsSh || !tpSh) return;

  const tripsHdr = getHeaderMap_(tripsSh);
  const tpHdr    = getHeaderMap_(tpSh);

  const paxListCol = tripsHdr["Passenger_List(auto)"];
  const paxCntCol  = tripsHdr["Pax_Count(auto)"];
  const tripRowCol = tpHdr["Trip_Row"];
  const nameCol    = tpHdr["Full_Name"];
  const crewIdCol  = tpHdr["Crew_ID"];

  if (!paxListCol || !paxCntCol || !tripRowCol || (!nameCol && !crewIdCol)) return;

  const data  = tpSh.getDataRange().getValues();
  const names = [];

  for (let i = 1; i < data.length; i++) {
    if (Number(data[i][tripRowCol - 1] || 0) !== Number(tripRow)) continue;
    const name = (nameCol   ? String(data[i][nameCol   - 1] || "").trim() : "") ||
                 (crewIdCol ? String(data[i][crewIdCol  - 1] || "").trim() : "");
    if (name) names.push(name);
  }

  const uniq = dedupeNames_(names);
  tripsSh.getRange(tripRow, paxListCol).setValue(uniq.join(", "));
  tripsSh.getRange(tripRow, paxCntCol ).setValue(uniq.length || "");
}

/* =========================================
   TRIP_PASSENGERS — rebuild e sync
   ========================================= */

/**
 * Ricostruisce Trip_Passengers da Trips — bulk.
 * Mantiene le assegnazioni pax esistenti,
 * aggiorna solo i metadata (Pickup_ID, Dropoff_ID, ecc.).
 */
function rebuildTripPassengersFromTrips_allTrips() {
  const ss      = SpreadsheetApp.getActive();
  const tripsSh = ss.getSheetByName(CFG.SHEETS.TRIPS);
  const tpSh    = ss.getSheetByName(CFG.SHEETS.PAX);
  if (!tripsSh) throw new Error("Trips sheet not found");
  if (!tpSh)    throw new Error("Trip_Passengers sheet not found");

  upgradeTripPassengersSheetStructure_();

  const firstRow     = CFG.TRIPS.HEADER_ROWS + 1;
  const tripsLastRow = getRealLastTripRow_(tripsSh);
  const tripsLastCol = tripsSh.getLastColumn();
  const tpLastRow    = getRealLastPaxRow_(tpSh);
  const tpLastCol    = tpSh.getLastColumn();

  const tripsHeaders = tripsSh.getRange(1, 1, 1, tripsLastCol).getValues()[0];
  const tripsData    = tripsLastRow >= firstRow
    ? tripsSh.getRange(firstRow, 1, tripsLastRow - firstRow + 1, tripsLastCol).getValues()
    : [];

  const tpHeaders = tpSh.getRange(1, 1, 1, Math.max(tpLastCol, 8)).getValues()[0];
  const tpData    = tpLastRow >= 2
    ? tpSh.getRange(2, 1, tpLastRow - 1, Math.max(tpLastCol, 8)).getValues()
    : [];

  const f  = findHeaderIndex_;
  const ti = {
    trip:   f(tripsHeaders, ["Trip_ID",   "Trip ID"]),
    pickup: f(tripsHeaders, ["Pickup_ID", "Pickup ID"]),
    dropoff:f(tripsHeaders, ["Dropoff_ID","Dropoff ID"]),
    start:  f(tripsHeaders, ["Start_DT",  "Start DT"]),
    end:    f(tripsHeaders, ["End_DT",    "End DT"])
  };
  if (Object.values(ti).some(i => i === -1)) throw new Error("Missing required columns in Trips");

  const tp = {};
  TP_HEADERS.forEach(h => { tp[h] = f(tpHeaders, [h, h.replace("_", " ")]); });
  if (Object.values(tp).some(i => i === -1)) throw new Error("Trip_Passengers headers missing");

  // Mappa tripRow → metadata
  const tripsByRow = {};
  for (let i = 0; i < tripsData.length; i++) {
    const row    = tripsData[i];
    const rowNum = firstRow + i;
    const tripId = String(row[ti.trip] || "").trim();
    if (!tripId) continue; // salta righe template
    tripsByRow[rowNum] = {
      tripId,
      pickupId:  String(row[ti.pickup]  || "").trim(),
      dropoffId: String(row[ti.dropoff] || "").trim(),
      startDt:   row[ti.start] || "",
      endDt:     row[ti.end]   || ""
    };
  }

  const finalRows = [];
  const touched   = new Set();

  // Mantieni assegnazioni esistenti, aggiorna metadata
  for (let i = 0; i < tpData.length; i++) {
    const row     = tpData[i].slice();
    const tripRow = Number(row[tp["Trip_Row"]] || 0);
    const meta    = tripsByRow[tripRow];

    if (tripRow && meta) {
      row[tp["Trip_ID"]]    = meta.tripId;
      row[tp["Pickup_ID"]]  = meta.pickupId;
      row[tp["Dropoff_ID"]] = meta.dropoffId;
      row[tp["Start_DT"]]   = meta.startDt;
      row[tp["End_DT"]]     = meta.endDt;
      touched.add(tripRow);
    }

    finalRows.push([
      row[tp["Trip_ID"]],   row[tp["Crew_ID"]],  row[tp["Full_Name"]],
      row[tp["Pickup_ID"]], row[tp["Dropoff_ID"]],
      row[tp["Start_DT"]],  row[tp["End_DT"]],   row[tp["Trip_Row"]]
    ]);
  }

  // Placeholder per trip senza pax assegnati
  Object.keys(tripsByRow).forEach(key => {
    const tripRow = Number(key);
    if (touched.has(tripRow)) return;
    const meta = tripsByRow[tripRow];
    finalRows.push([
      meta.tripId, "", "",
      meta.pickupId, meta.dropoffId,
      meta.startDt, meta.endDt, tripRow
    ]);
  });

  // Bulk write
  const maxRows = tpSh.getMaxRows();
  if (maxRows > 1) tpSh.getRange(2, 1, maxRows - 1, 8).clearContent();
  if (finalRows.length) tpSh.getRange(2, 1, finalRows.length, 8).setValues(finalRows);
  tpSh.getRange("F:G").setNumberFormat("dd/MM/yyyy HH:mm");
  tpSh.getRange("H:H").setNumberFormat("0");

  updateTripsPassengerListAuto_();
  TS_rebuildPaxIndex_();
  Logger.log("Trip_Passengers rebuilt. Trips processed: " + Object.keys(tripsByRow).length);
}

/**
 * Sincronizza metadata Trip_Passengers per un singolo Trips row.
 * Usata dal trigger onEdit — aggiorna solo la riga coinvolta.
 */
function syncTripPassengersForTripsRow_(tripRow) {
  const ss      = SpreadsheetApp.getActive();
  const tripsSh = ss.getSheetByName(CFG.SHEETS.TRIPS);
  const tpSh    = ss.getSheetByName(CFG.SHEETS.PAX);
  if (!tripsSh || !tpSh) return;

  upgradeTripPassengersSheetStructure_();

  const rowNum = Number(tripRow);
  if (!rowNum || rowNum < 2) return;

  const tripsLastCol = tripsSh.getLastColumn();
  const tripsHeaders = tripsSh.getRange(1, 1, 1, tripsLastCol).getValues()[0];
  const tripValues   = tripsSh.getRange(rowNum, 1, 1, tripsLastCol).getValues()[0];

  const tpLastRow = getRealLastPaxRow_(tpSh);
  const tpLastCol = tpSh.getLastColumn();
  const tpAll     = tpLastRow >= 2
    ? tpSh.getRange(1, 1, tpLastRow, tpLastCol).getValues()
    : [];
  const tpHeaders = tpAll.length ? tpAll[0] : tpSh.getRange(1, 1, 1, 8).getValues()[0];

  const f  = findHeaderIndex_;
  const ti = {
    trip:   f(tripsHeaders, ["Trip_ID",   "Trip ID"]),
    pickup: f(tripsHeaders, ["Pickup_ID", "Pickup ID"]),
    dropoff:f(tripsHeaders, ["Dropoff_ID","Dropoff ID"]),
    start:  f(tripsHeaders, ["Start_DT",  "Start DT"]),
    end:    f(tripsHeaders, ["End_DT",    "End DT"])
  };
  if (Object.values(ti).some(i => i === -1)) return;

  const tp = {};
  TP_HEADERS.forEach(h => { tp[h] = f(tpHeaders, [h, h.replace("_", " ")]); });
  if (Object.values(tp).some(i => i === -1)) return;

  const tripId   = String(tripValues[ti.trip]   || "").trim();
  const pickupId = String(tripValues[ti.pickup]  || "").trim();
  const dropoffId= String(tripValues[ti.dropoff] || "").trim();
  const startDt  = tripValues[ti.start] || "";
  const endDt    = tripValues[ti.end]   || "";
  if (!tripId) return;

  const finalRows = [];
  let   found     = false;

  for (let r = 1; r < tpAll.length; r++) {
    const row = tpAll[r].slice();
    if (Number(row[tp["Trip_Row"]] || 0) === rowNum) {
      found = true;
      row[tp["Trip_ID"]]    = tripId;
      row[tp["Pickup_ID"]]  = pickupId;
      row[tp["Dropoff_ID"]] = dropoffId;
      row[tp["Start_DT"]]   = startDt;
      row[tp["End_DT"]]     = endDt;
    }
    finalRows.push([
      row[tp["Trip_ID"]],   row[tp["Crew_ID"]],  row[tp["Full_Name"]],
      row[tp["Pickup_ID"]], row[tp["Dropoff_ID"]],
      row[tp["Start_DT"]],  row[tp["End_DT"]],   row[tp["Trip_Row"]]
    ]);
  }

  if (!found) {
    finalRows.push([tripId, "", "", pickupId, dropoffId, startDt, endDt, rowNum]);
  }

  const maxRows = tpSh.getMaxRows();
  if (maxRows > 1) tpSh.getRange(2, 1, maxRows - 1, 8).clearContent();
  if (finalRows.length) tpSh.getRange(2, 1, finalRows.length, 8).setValues(finalRows);
  tpSh.getRange("F:G").setNumberFormat("dd/MM/yyyy HH:mm");
  tpSh.getRange("H:H").setNumberFormat("0");

  updateTripsPassengerListAutoForTripRow_(rowNum);
  TS_rebuildPaxIndexForTripRow_(rowNum);
  Logger.log("Trip_Passengers synced for row: " + rowNum);
}

/* =========================================
   ADD / REMOVE PASSEGGERI
   ========================================= */

/**
 * Aggiunge passeggeri a un trip da una lista di Crew_ID.
 * Chiamato dalla sidebar Pax Assignment.
 */
function addSelectedPassengers(tripId, tripRow, crewIds) {
  if (!tripId || !tripRow || !crewIds || !crewIds.length) return;

  const ss      = SpreadsheetApp.getActive();
  const paxSh   = ss.getSheetByName(CFG.SHEETS.PAX);
  const crewSh  = ss.getSheetByName(CFG.SHEETS.CREW);
  const tripsSh = ss.getSheetByName(CFG.SHEETS.TRIPS);
  if (!paxSh || !crewSh || !tripsSh) throw new Error("Missing required sheets");

  // Legge crew in bulk
  const crewHdr  = getHeaderMap_(crewSh);
  const crewLast = getRealLastCrewRow_(crewSh);
  const crewData = crewLast >= 2
    ? crewSh.getRange(2, 1, crewLast - 1, crewSh.getLastColumn()).getValues()
    : [];

  const crewMap = {};
  crewData.forEach(r => {
    const id = crewHdr["Crew_ID"]   ? String(r[crewHdr["Crew_ID"]   - 1] || "").trim() : "";
    const nm = crewHdr["Full_Name"] ? String(r[crewHdr["Full_Name"] - 1] || "").trim() : "";
    if (id) crewMap[id] = nm;
  });

  // Legge dati trip
  const tripsHdr = getHeaderMap_(tripsSh);
  const rowVals  = tripsSh.getRange(tripRow, 1, 1, tripsSh.getLastColumn()).getValues()[0];
  const pickupId = tripsHdr["Pickup_ID"]  ? String(rowVals[tripsHdr["Pickup_ID"]  - 1] || "").trim() : "";
  const dropoffId= tripsHdr["Dropoff_ID"] ? String(rowVals[tripsHdr["Dropoff_ID"] - 1] || "").trim() : "";
  const startDt  = tripsHdr["Start_DT"]   ? rowVals[tripsHdr["Start_DT"]  - 1] : "";
  const endDt    = tripsHdr["End_DT"]     ? rowVals[tripsHdr["End_DT"]    - 1] : "";

  // Carica assegnazioni esistenti per dedup
  const existingLast = getRealLastPaxRow_(paxSh);
  const existingData = existingLast >= 2
    ? paxSh.getRange(2, 1, existingLast - 1, paxSh.getLastColumn()).getValues()
    : [];

  const seen = new Set();
  existingData.forEach(r => {
    seen.add([String(r[0]||"").trim(), Number(r[7]||0), String(r[1]||"").trim()].join("||"));
  });

  const newRows = [];
  crewIds.forEach(crewId => {
    const cId = String(crewId || "").trim();
    if (!cId) return;
    if (seen.has([tripId, Number(tripRow), cId].join("||"))) return;
    newRows.push([
      tripId, cId, crewMap[cId] || "",
      pickupId, dropoffId, startDt, endDt, Number(tripRow)
    ]);
  });

  if (newRows.length) {
    const nextRow = paxSh.getLastRow() + 1;
    paxSh.getRange(nextRow, 1, newRows.length, 8).setValues(newRows);
  }

  updateTripsPassengerListAutoForTripRow_(tripRow);
  TS_rebuildPaxIndexForTripRow_(tripRow);
}

/**
 * Rimuove passeggeri da un trip — bulk rewrite.
 * Chiamato dalla sidebar Pax Assignment.
 */
function removeSelectedPassengers(tripId, tripRow, crewIds) {
  const ss = SpreadsheetApp.getActive();
  const sh = ss.getSheetByName(CFG.SHEETS.PAX);
  if (!sh) throw new Error("Trip_Passengers sheet not found");

  const lastRow = sh.getLastRow();
  if (lastRow < 2) return;

  const data    = sh.getRange(1, 1, lastRow, 8).getValues();
  const headers = data[0];
  const tidCol  = headers.indexOf("Trip_ID");
  const cidCol  = headers.indexOf("Crew_ID");
  const rowCol  = headers.indexOf("Trip_Row");

  if (tidCol === -1 || cidCol === -1 || rowCol === -1) {
    throw new Error("Trip_Passengers headers missing");
  }

  const crewSet = new Set(crewIds.map(String));
  const newRows = [headers];

  for (let i = 1; i < data.length; i++) {
    const r      = data[i];
    const rTid   = String(r[tidCol] || "").trim();
    const rCid   = String(r[cidCol] || "").trim();
    const rRow   = Number(r[rowCol] || 0);
    const remove = rTid === String(tripId) &&
                   rRow === Number(tripRow) &&
                   crewSet.has(rCid);
    if (!remove) newRows.push(r);
  }

  sh.clearContents();
  sh.getRange(1, 1, newRows.length, newRows[0].length).setValues(newRows);
  sh.getRange("F:G").setNumberFormat("dd/MM/yyyy HH:mm");
  sh.getRange("H:H").setNumberFormat("0");

  updateTripsPassengerListAutoForTripRow_(tripRow);
  TS_rebuildPaxIndexForTripRow_(tripRow);
  TS_recomputePaxConflictsForTripRow_(tripRow);
}

/* =========================================
   REFRESH ASSEGNAZIONI dopo variazioni
   ========================================= */

/**
 * Rimuove da Trip_Passengers le assegnazioni non più valide
 * dopo che Hotel_ID/Status/Travel_Status di un crew è cambiato.
 * Bulk rewrite invece di deleteRow in loop.
 *
 * @return {number} Numero di assegnazioni rimosse
 */
function refreshTripsAffectedByCrewChange_(crewId, fullName) {
  const ss     = SpreadsheetApp.getActive();
  const tpSh   = ss.getSheetByName(CFG.SHEETS.PAX);
  const crewSh = ss.getSheetByName(CFG.SHEETS.CREW);
  if (!tpSh || !crewSh) return 0;

  const tpLastRow = getRealLastPaxRow_(tpSh);
  if (tpLastRow < 2) return 0;

  const tpHdr   = getHeaderMap_(tpSh);
  const crewHdr = getHeaderMap_(crewSh);
  const tpData  = tpSh.getRange(2, 1, tpLastRow - 1, tpSh.getLastColumn()).getValues();
  const crewLast= getRealLastCrewRow_(crewSh);
  const crewData= crewLast >= 2
    ? crewSh.getRange(2, 1, crewLast - 1, crewSh.getLastColumn()).getValues()
    : [];

  const wCrew = String(crewId   || "").trim().toLowerCase();
  const wName = String(fullName || "").trim().toLowerCase();

  // Trova il record crew aggiornato
  let crewObj = null;
  for (let i = 0; i < crewData.length; i++) {
    const r    = crewData[i];
    const rId  = String(r[crewHdr["Crew_ID"]   - 1] || "").trim();
    const rNm  = String(r[crewHdr["Full_Name"] - 1] || "").trim();
    if ((wCrew && rId.toLowerCase() === wCrew) ||
        (wName && rNm.toLowerCase() === wName)) {
      crewObj = {
        crewId:       rId,
        fullName:     rNm,
        hotelId:      r[crewHdr["Hotel_ID"]      - 1] || "",
        hotelStatus:  r[crewHdr["Hotel_Status"]  - 1] || "",
        travelStatus: r[crewHdr["Travel_Status"] - 1] || ""
      };
      break;
    }
  }

  if (!crewObj) return 0;

  // Bulk rewrite — tieni solo le righe valide
  const keepRows = [];
  let   removed  = 0;

  for (let i = 0; i < tpData.length; i++) {
    const r      = tpData[i];
    const rCid   = String(r[tpHdr["Crew_ID"]   - 1] || "").trim().toLowerCase();
    const rName  = String(r[tpHdr["Full_Name"] - 1] || "").trim().toLowerCase();
    const isTarget = (wCrew && rCid  === wCrew) || (wName && rName === wName);

    if (!isTarget) { keepRows.push(r); continue; }

    const pid = String(r[tpHdr["Pickup_ID"]  - 1] || "").trim();
    const did = String(r[tpHdr["Dropoff_ID"] - 1] || "").trim();

    if (crewMatchesTripRules_(pid, did, crewObj)) {
      keepRows.push(r);
    } else {
      removed++;
    }
  }

  if (removed === 0) return 0;

  const totalCols = tpSh.getLastColumn();
  tpSh.getRange(2, 1, tpLastRow - 1, totalCols).clearContent();
  if (keepRows.length) {
    tpSh.getRange(2, 1, keepRows.length, totalCols).setValues(keepRows);
  }
  tpSh.getRange("F:G").setNumberFormat("dd/MM/yyyy HH:mm");
  tpSh.getRange("H:H").setNumberFormat("0");

  updateTripsPassengerListAuto_();
  TS_rebuildPaxIndex_();
  TS_recomputePaxConflicts_();

  Logger.log("Crew change refresh: removed=" + removed);
  return removed;
}

/**
 * Rimuove da Trip_Passengers le assegnazioni non più valide
 * dopo che Pickup_ID/Dropoff_ID di un trip è cambiato.
 * Bulk rewrite.
 *
 * @return {number} Numero di assegnazioni rimosse
 */
function refreshAssignmentsAffectedByTripRowChange_(tripRow) {
  const ss     = SpreadsheetApp.getActive();
  const tpSh   = ss.getSheetByName(CFG.SHEETS.PAX);
  const crewSh = ss.getSheetByName(CFG.SHEETS.CREW);
  if (!tpSh || !crewSh || !tripRow || tripRow < 2) return 0;

  const tpHdr   = getHeaderMap_(tpSh);
  const crewHdr = getHeaderMap_(crewSh);
  const tpLast  = getRealLastPaxRow_(tpSh);
  if (tpLast < 2) return 0;

  const tpData  = tpSh.getRange(1, 1, tpLast, tpSh.getLastColumn()).getValues();
  const headers = tpData[0];
  const crewLast= getRealLastCrewRow_(crewSh);
  const crewData= crewLast >= 2
    ? crewSh.getRange(2, 1, crewLast - 1, crewSh.getLastColumn()).getValues()
    : [];

  // Costruisce lookup crew
  const crewById   = new Map();
  const crewByName = new Map();
  crewData.forEach(r => {
    const cId   = String(r[crewHdr["Crew_ID"]   - 1] || "").trim();
    const cName = String(r[crewHdr["Full_Name"] - 1] || "").trim();
    const obj   = {
      crewId:       cId,
      fullName:     cName,
      hotelId:      r[crewHdr["Hotel_ID"]      - 1] || "",
      hotelStatus:  r[crewHdr["Hotel_Status"]  - 1] || "",
      travelStatus: r[crewHdr["Travel_Status"] - 1] || ""
    };
    if (cId)   crewById.set(cId.toLowerCase(), obj);
    if (cName) crewByName.set(cName.toLowerCase(), obj);
  });

  const newData = [headers];
  let   removed = 0;

  for (let i = 1; i < tpData.length; i++) {
    const row    = tpData[i];
    const rRow   = Number(row[tpHdr["Trip_Row"] - 1] || 0);

    if (rRow !== Number(tripRow)) { newData.push(row); continue; }

    const cId    = String(row[tpHdr["Crew_ID"]   - 1] || "").trim().toLowerCase();
    const cName  = String(row[tpHdr["Full_Name"] - 1] || "").trim().toLowerCase();
    const pid    = String(row[tpHdr["Pickup_ID"]  - 1] || "").trim();
    const did    = String(row[tpHdr["Dropoff_ID"] - 1] || "").trim();

    if (!cId && !cName) { newData.push(row); continue; }

    const crewObj = (cId   && crewById.get(cId))   ||
                    (cName && crewByName.get(cName)) || null;

    if (crewObj && crewMatchesTripRules_(pid, did, crewObj)) {
      newData.push(row);
    } else {
      removed++;
    }
  }

  tpSh.clearContents();
  tpSh.getRange(1, 1, newData.length, newData[0].length).setValues(newData);
  tpSh.getRange("F:G").setNumberFormat("dd/MM/yyyy HH:mm");
  tpSh.getRange("H:H").setNumberFormat("0");

  if (removed > 0) {
    updateTripsPassengerListAutoForTripRow_(tripRow);
    TS_rebuildPaxIndexForTripRow_(tripRow);
    TS_recomputePaxConflictsForTripRow_(tripRow);
  }

  return removed;
}

/* =========================================
   CLEAN TRIP_PASSENGERS
   ========================================= */

/**
 * Pulisce Trip_Passengers: rimuove righe orfane,
 * blank e duplicate. Mantiene un placeholder per
 * ogni trip senza passeggeri assegnati.
 */
function TS_cleanTripPassengers_() {
  const ss   = SpreadsheetApp.getActive();
  const tpSh = ss.getSheetByName(CFG.SHEETS.PAX);
  if (!tpSh) throw new Error("Trip_Passengers sheet not found");

  upgradeTripPassengersSheetStructure_();

  const lastRow = tpSh.getLastRow();
  const lastCol = Math.max(tpSh.getLastColumn(), 8);
  if (lastRow < 2) return;

  const headers = tpSh.getRange(1, 1, 1, lastCol).getValues()[0];
  const data    = tpSh.getRange(2, 1, lastRow - 1, lastCol).getValues();
  const f       = findHeaderIndex_;

  const c = {
    tripId:  f(headers, ["Trip_ID",   "Trip ID"]),
    crewId:  f(headers, ["Crew_ID",   "Crew ID"]),
    name:    f(headers, ["Full_Name", "Full Name", "Name"]),
    pickup:  f(headers, ["Pickup_ID", "Pickup ID"]),
    dropoff: f(headers, ["Dropoff_ID","Dropoff ID"]),
    start:   f(headers, ["Start_DT",  "Start DT"]),
    end:     f(headers, ["End_DT",    "End DT"]),
    tripRow: f(headers, ["Trip_Row",  "Trip Row"])
  };
  if (Object.values(c).some(i => i === -1)) throw new Error("Trip_Passengers headers missing");

  const rowsByTripRow = {};
  const realSeen      = new Set();

  for (let i = 0; i < data.length; i++) {
    const r       = data[i];
    const tripId  = String(r[c.tripId]  || "").trim();
    const crewId  = String(r[c.crewId]  || "").trim();
    const name    = String(r[c.name]    || "").trim();
    const pickup  = String(r[c.pickup]  || "").trim();
    const dropoff = String(r[c.dropoff] || "").trim();
    const start   = r[c.start] || "";
    const end     = r[c.end]   || "";
    const tripRow = Number(r[c.tripRow] || 0);

    if (!tripRow || !tripId) continue;
    if (!rowsByTripRow[tripRow]) rowsByTripRow[tripRow] = { real: [], placeholders: [] };

    const isReal = !!(crewId || name);
    if (isReal) {
      const key = [tripRow, tripId, crewId.toLowerCase(), name.toLowerCase()].join("||");
      if (realSeen.has(key)) continue;
      realSeen.add(key);
      rowsByTripRow[tripRow].real.push([tripId, crewId, name, pickup, dropoff, start, end, tripRow]);
    } else {
      rowsByTripRow[tripRow].placeholders.push([tripId, "", "", pickup, dropoff, start, end, tripRow]);
    }
  }

  const finalRows = [];
  Object.keys(rowsByTripRow).map(Number).sort((a, b) => a - b).forEach(tr => {
    const b = rowsByTripRow[tr];
    if (b.real.length) finalRows.push(...b.real);
    else if (b.placeholders.length) finalRows.push(b.placeholders[0]);
  });

  if (lastRow > 1) tpSh.getRange(2, 1, lastRow - 1, 8).clearContent();
  if (finalRows.length) tpSh.getRange(2, 1, finalRows.length, 8).setValues(finalRows);
  tpSh.getRange("F:G").setNumberFormat("dd/MM/yyyy HH:mm");
  tpSh.getRange("H:H").setNumberFormat("0");

  updateTripsPassengerListAuto_();
  TS_rebuildPaxIndex_();
  TS_recomputePaxConflicts_();
}

/* =========================================
   ARCHIVIO TRIPS
   ========================================= */

function archiveTripsDay() {
  const ss      = SpreadsheetApp.getActive();
  const tripsSh = ss.getSheetByName(CFG.SHEETS.TRIPS);
  if (!tripsSh) throw new Error("Trips sheet not found.");
  const historySh = TS_ensureTripsHistorySheet_();
  const result    = TS_archiveTripsToHistory_(tripsSh, historySh);
  SpreadsheetApp.getUi().alert(
    "Archive completed.\nNew rows: " + result.archivedCount +
    "\nSkipped: " + result.skippedCount
  );
}

function resetTripsFromTemplate() {
  const ss         = SpreadsheetApp.getActive();
  const tripsSh    = ss.getSheetByName(CFG.SHEETS.TRIPS);
  const templateSh = ss.getSheetByName("Trips_Template");
  if (!tripsSh)    throw new Error("Trips sheet not found.");
  if (!templateSh) throw new Error("Trips_Template sheet not found.");
  TS_resetTripsFromTemplate_(tripsSh, templateSh);
  SpreadsheetApp.getUi().alert("Trips has been reset from template.");
}

function archiveAndResetTrips() {
  const ss         = SpreadsheetApp.getActive();
  const tripsSh    = ss.getSheetByName(CFG.SHEETS.TRIPS);
  const templateSh = ss.getSheetByName("Trips_Template");
  if (!tripsSh)    throw new Error("Trips sheet not found.");
  if (!templateSh) throw new Error("Trips_Template sheet not found.");
  const historySh = TS_ensureTripsHistorySheet_();
  const result    = TS_archiveTripsToHistory_(tripsSh, historySh);
  TS_resetTripsFromTemplate_(tripsSh, templateSh);
  SpreadsheetApp.getUi().alert(
    "Archive + Reset completed.\n" +
    "New rows: " + result.archivedCount + "\n" +
    "Skipped: "  + result.skippedCount  + "\n" +
    "Trips reset from template."
  );
}

function TS_ensureTripsHistorySheet_() {
  const ss      = SpreadsheetApp.getActive();
  const tripsSh = ss.getSheetByName(CFG.SHEETS.TRIPS);
  if (!tripsSh) throw new Error("Trips sheet not found.");

  let historySh = ss.getSheetByName(CFG.SHEETS.TRIPS_HISTORY);
  if (!historySh) historySh = ss.insertSheet(CFG.SHEETS.TRIPS_HISTORY);

  const tripsHeaders   = tripsSh.getRange(1, 1, 1, tripsSh.getLastColumn()).getValues()[0];
  const expectedHeaders= tripsHeaders.concat(["Archive_Date", "Archived_At"]);
  const curCol  = Math.max(historySh.getLastColumn(), expectedHeaders.length);
  const existing= historySh.getLastRow() >= 1
    ? historySh.getRange(1, 1, 1, curCol).getValues()[0] : [];
  const match   = existing.length >= expectedHeaders.length &&
                  expectedHeaders.every((h, i) => String(existing[i] || "") === String(h));
  if (!match) {
    historySh.clear();
    historySh.getRange(1, 1, 1, expectedHeaders.length)
             .setValues([expectedHeaders]).setFontWeight("bold");
  }
  return historySh;
}

function TS_archiveTripsToHistory_(tripsSh, historySh) {
  const lastRow = getRealLastTripRow_(tripsSh);
  const lastCol = tripsSh.getLastColumn();
  const firstRow= CFG.TRIPS.HEADER_ROWS + 1;
  if (lastRow < firstRow) return { archivedCount: 0, skippedCount: 0 };

  const hdr = getHeaderMap_(tripsSh);
  requireHeaders_(hdr, ["Trip_ID", "Date", "Pickup_ID", "Dropoff_ID"], "Trips");

  const { Trip_ID: tidCol, Date: dateCol, Pickup_ID: pidCol, Dropoff_ID: didCol } = hdr;
  const tripValues = tripsSh.getRange(firstRow, 1, lastRow - firstRow + 1, lastCol).getValues();

  const histLast = historySh.getLastRow();
  const histCol  = historySh.getLastColumn();
  const existingKeys = new Set();

  if (histLast >= 2) {
    historySh.getRange(2, 1, histLast - 1, histCol).getValues().forEach(r => {
      const id  = String(r[tidCol - 1] || "").trim();
      const dk  = TS_archiveDateKey_(r[dateCol - 1]);
      const pid = String(r[pidCol - 1] || "").trim().toUpperCase();
      const did = String(r[didCol - 1] || "").trim().toUpperCase();
      if (id && dk) existingKeys.add([id, dk, pid, did].join("||"));
    });
  }

  const now         = new Date();
  const archiveDate = new Date(); archiveDate.setHours(0, 0, 0, 0);
  const toArchive   = [];
  let   skipped     = 0;

  tripValues.forEach(r => {
    const id  = String(r[tidCol - 1] || "").trim();
    const dk  = TS_archiveDateKey_(r[dateCol - 1]);
    const pid = String(r[pidCol - 1] || "").trim().toUpperCase();
    const did = String(r[didCol - 1] || "").trim().toUpperCase();
    if (!id || !dk) return;
    const key = [id, dk, pid, did].join("||");
    if (existingKeys.has(key)) { skipped++; return; }
    existingKeys.add(key);
    toArchive.push(r.concat([archiveDate, now]));
  });

  if (toArchive.length) {
    const startRow = historySh.getLastRow() + 1;
    historySh.getRange(startRow, 1, toArchive.length, toArchive[0].length)
             .setValues(toArchive);
    historySh.getRange(startRow, lastCol + 1, toArchive.length, 1)
             .setNumberFormat("dd/MM/yyyy");
    historySh.getRange(startRow, lastCol + 2, toArchive.length, 1)
             .setNumberFormat("dd/MM/yyyy HH:mm:ss");
  }

  return { archivedCount: toArchive.length, skippedCount: skipped };
}

function TS_archiveDateKey_(value) {
  const d = toDateSafe_(value);
  if (!d) return "";
  const x = new Date(d); x.setHours(0, 0, 0, 0);
  return Utilities.formatDate(x, Session.getScriptTimeZone(), "yyyy-MM-dd");
}

function TS_resetTripsFromTemplate_(tripsSh, templateSh) {
  if (templateSh.getLastRow() < 1) {
    throw new Error("Trips_Template must have at least the header row.");
  }

  // Approccio veloce — pulisce solo il contenuto delle righe dati
  // mantenendo tutta la formattazione, DV e struttura esistente
  const lastRow = tripsSh.getMaxRows();
  const lastCol = tripsSh.getMaxColumns();

  if (lastRow >= 2) {
    tripsSh.getRange(2, 1, lastRow - 1, lastCol).clearContent();
  }

  Logger.log("Trips reset: content cleared from row 2 to " + lastRow);
}

/* =========================================
   SIDEBAR HELPERS
   ========================================= */

function syncTripPassengersForActiveRow() {
  const sh  = SpreadsheetApp.getActiveSheet();
  const row = sh.getActiveCell().getRow();
  if (sh.getName() !== CFG.SHEETS.TRIPS) {
    throw new Error("Open the Trips sheet and select the row to sync.");
  }
  try {
    syncTripPassengersForTripsRow_(row);
    TS_log_("INFO", "syncTripPassengersForActiveRow", {
      sheet: CFG.SHEETS.TRIPS, row, message: "Synced"
    });
  } catch (err) {
    TS_log_("ERROR", "syncTripPassengersForActiveRow", {
      sheet: CFG.SHEETS.TRIPS, row, message: err.message
    });
    throw err;
  }
}

function refreshTripsForActiveCrewRow() {
  const sh  = SpreadsheetApp.getActiveSheet();
  const row = sh.getActiveCell().getRow();
  if (sh.getName() !== CFG.SHEETS.CREW) {
    throw new Error("Open Crew_Master and select the crew row.");
  }
  if (row < 2) return;
  const headers  = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  const values   = sh.getRange(row, 1, 1, sh.getLastColumn()).getValues()[0];
  const crewId   = findHeaderIndex_(headers, ["Crew_ID",   "Crew ID"])   >= 0
                   ? values[findHeaderIndex_(headers, ["Crew_ID",   "Crew ID"])]   : "";
  const fullName = findHeaderIndex_(headers, ["Full_Name", "Full Name"]) >= 0
                   ? values[findHeaderIndex_(headers, ["Full_Name", "Full Name"])] : "";
  try {
    refreshTripsAffectedByCrewChange_(crewId, fullName);
    TS_log_("INFO", "refreshTripsForActiveCrewRow", {
      sheet: CFG.SHEETS.CREW, row
    });
  } catch (err) {
    TS_log_("ERROR", "refreshTripsForActiveCrewRow", {
      sheet: CFG.SHEETS.CREW, row, message: err.message
    });
    throw err;
  }
}

function goToTripRowFromPaxSidebar_(tripRow) {
  const ss  = SpreadsheetApp.getActive();
  const sh  = ss.getSheetByName(CFG.SHEETS.TRIPS);
  if (!sh) throw new Error("Trips sheet not found");
  const row = Number(tripRow || 0);
  if (!row || row < 2) throw new Error("Invalid trip row");
  sh.activate();
  SpreadsheetApp.flush();
  ss.setCurrentCell(sh.getRange("A" + row));
  sh.setActiveSelection("A" + row);
  SpreadsheetApp.flush();
}

/* =========================================
   MENU ACTIONS
   ========================================= */

function refreshTripsDurations() {
  try {
    TS_refreshDurationsTrips_();
    TS_log_("INFO", "refreshTripsDurations", {
      sheet: CFG.SHEETS.TRIPS, message: "Durations refreshed"
    });
    SpreadsheetApp.getActive().toast("Trips durations refreshed.", "Captain", 3);
  } catch (err) {
    TS_log_("ERROR", "refreshTripsDurations", { message: err.message });
    throw err;
  }
}

function tsRebuildTripPassengers() {
  try {
    rebuildTripPassengersFromTrips_allTrips();
    TS_log_("INFO", "tsRebuildTripPassengers", {
      sheet: CFG.SHEETS.PAX, message: "Rebuilt"
    });
    SpreadsheetApp.getUi().alert("Trip_Passengers rebuilt successfully.");
  } catch (err) {
    TS_log_("ERROR", "tsRebuildTripPassengers", { message: err.message });
    throw err;
  }
}

function tsCleanTripPassengers() {
  try {
    TS_cleanTripPassengers_();
    TS_log_("INFO", "tsCleanTripPassengers", {
      sheet: CFG.SHEETS.PAX, message: "Cleaned"
    });
    SpreadsheetApp.getUi().alert(
      "Trip_Passengers cleaned.\nOrphan/blank/duplicate rows removed."
    );
  } catch (err) {
    TS_log_("ERROR", "tsCleanTripPassengers", { message: err.message });
    throw err;
  }
}

function tsHardRepairPaxSystem() {
  try {
    const ss   = SpreadsheetApp.getActive();
    const tpSh = ss.getSheetByName(CFG.SHEETS.PAX);
    if (!tpSh) throw new Error("Trip_Passengers sheet not found");
    const last = tpSh.getLastRow();
    if (last > 1) tpSh.getRange(2, 1, last - 1, tpSh.getLastColumn()).clearContent();
    rebuildTripPassengersFromTrips_allTrips();
    TS_rebuildPaxIndex_();
    TS_recomputePaxConflicts_();
    TS_log_("INFO", "tsHardRepairPaxSystem", {
      sheet: CFG.SHEETS.PAX, message: "Full pax system reset"
    });
    SpreadsheetApp.getUi().alert(
      "FULL PAX SYSTEM RESET:\n" +
      "- Trip_Passengers cleaned\n" +
      "- PaxIndex rebuilt\n" +
      "- Conflicts updated"
    );
  } catch (err) {
    TS_log_("ERROR", "tsHardRepairPaxSystem", { message: err.message });
    throw err;
  }
}

function updateTripsPassengerListAuto() {
  updateTripsPassengerListAuto_();
}

/* =========================================
   CREATE TRIPS TEMPLATE
   Crea Trips_Template dal foglio Trips attuale:
   - Copia tutta la struttura (header, formattazione,
     DV, conditional formatting, larghezze colonne)
   - Pulisce il contenuto delle righe dati (riga 2+)
   - Mantiene una sola riga vuota come template
   ========================================= */

function tsCreateTripsTemplate() {
  const ss      = SpreadsheetApp.getActive();
  const tripsSh = ss.getSheetByName(CFG.SHEETS.TRIPS);
  if (!tripsSh) throw new Error("Trips sheet not found");

  const ui = SpreadsheetApp.getUi();
  const confirm = ui.alert(
    "Create Trips Template",
    "This will overwrite Trips_Template with the current Trips structure.\n\nContinue?",
    ui.ButtonSet.OK_CANCEL
  );
  if (confirm !== ui.Button.OK) return;

  ss.toast("Creating template...", "Captain");

  // Elimina il vecchio template se esiste
  let templateSh = ss.getSheetByName("Trips_Template");
  if (templateSh) ss.deleteSheet(templateSh);

  // Crea nuovo foglio
  templateSh = ss.insertSheet("Trips_Template");

  const lastCol = tripsSh.getLastColumn();

  // Copia header (riga 1)
  const headerRange = tripsSh.getRange(1, 1, 1, lastCol);
  headerRange.copyTo(templateSh.getRange(1, 1));

  // Copia riga 2 con formattazione (riga template)
  if (tripsSh.getLastRow() >= 2) {
    const row2Range = tripsSh.getRange(2, 1, 1, lastCol);
    row2Range.copyTo(templateSh.getRange(2, 1));
    // Pulisce il contenuto della riga 2 ma mantiene formato/DV
    templateSh.getRange(2, 1, 1, lastCol).clearContent();
  }

  // Copia larghezze colonne
  const templateMaxCol = templateSh.getMaxColumns();
  for (let c = 1; c <= Math.min(lastCol, templateMaxCol); c++) {
    try {
      templateSh.setColumnWidth(c, tripsSh.getColumnWidth(c));
    } catch(e) {}
  }

  // Copia frozen rows/cols
  templateSh.setFrozenRows(tripsSh.getFrozenRows());
  templateSh.setFrozenColumns(tripsSh.getFrozenColumns());

  // NON copiamo conditional formatting — spesso contiene riferimenti
  // ad altri fogli che causano errori. Va riapplicato manualmente se serve.

  // Nasconde il foglio
  templateSh.hideSheet();

  TS_log_("INFO", "tsCreateTripsTemplate", {
    message: "Trips_Template created. Cols: " + lastCol
  });

  ui.alert(
    "Done!",
    "Trips_Template created successfully.\n" +
    "- Header and formatting copied\n" +
    "- Content cleared\n" +
    "- Sheet hidden\n\n" +
    "Use CAPTAIN → Reset Trips From Template to restore.",
    ui.ButtonSet.OK
  );
}