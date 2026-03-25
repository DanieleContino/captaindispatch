/**
 * 01_Crew.gs
 * Gestione Crew_Master, cache crew, DV_Passengers
 * Captain — Transport Management System
 */

/* =========================================
   CREW CACHE
   Legge Crew_Master una volta, serializza in
   CacheService per 10 minuti. Tutte le funzioni
   che hanno bisogno dei dati crew usano questa
   cache invece di rileggere il foglio ogni volta.
   ========================================= */

/**
 * Costruisce la cache crew da Crew_Master e la salva
 * in CacheService. Chiamata automaticamente quando
 * la cache è scaduta o invalidata.
 *
 * Struttura payload:
 * {
 *   byHotel:       { hotelId: [crewEntry, ...] }
 *   byCrewId:      { crewId: crewEntry }
 *   byNormName:    { normName: crewEntry }  — solo nomi univoci
 *   ambiguousNames:{ normName: true }       — nomi duplicati
 *   duplicates:    { normName: [crewEntry, ...] }
 *   hotels:        [hotelId, ...]           — lista hotel con crew
 * }
 *
 * crewEntry: { crewId, name, dept, unit, hotelName,
 *              hotelId, hotelStatus, travelStatus }
 *
 * Solo crew con Hotel_Status = CONFIRMED entra nella cache.
 */
function TS_buildCrewCache_() {
  const ss = SpreadsheetApp.getActive();
  const sh = ss.getSheetByName(CFG.SHEETS.CREW);
  if (!sh) throw new Error("Crew_Master not found");

  const hdr = getHeaderMap_(sh);
  requireHeaders_(hdr, [
    "Crew_ID", "Full_Name", "Hotel_ID", "Hotel_Status", "Travel_Status"
  ], "Crew_Master");

  const emptyPayload = {
    byHotel: {}, byCrewId: {}, byNormName: {},
    hotels: [], ambiguousNames: {}, duplicates: {}
  };

  const lastRow  = getRealLastCrewRow_(sh);
  const startRow = CFG.CREW.HEADER_ROWS + 1;

  if (lastRow < startRow) {
    CacheService.getDocumentCache().put(
      CFG.CACHE.CREW_KEY, JSON.stringify(emptyPayload), CFG.CACHE.TTL_SEC
    );
    return emptyPayload;
  }

  const data = sh.getRange(startRow, 1, lastRow - startRow + 1, sh.getLastColumn())
                  .getDisplayValues();

  const byHotel = {}, byCrewId = {}, byNormName = {};
  const duplicates = {}, ambiguousNames = {};
  const hotelsSet  = new Set();

  for (let i = 0; i < data.length; i++) {
    const r = data[i];

    const crewId      = String(r[hdr["Crew_ID"]       - 1] || "").trim();
    const name        = String(r[hdr["Full_Name"]      - 1] || "").trim();
    const dept        = hdr["Dept"]         ? String(r[hdr["Dept"]         - 1] || "").trim() : "";
    const unit        = hdr["Unit"]         ? String(r[hdr["Unit"]         - 1] || "").trim() : "";
    const hotelName   = hdr["HOTELS"]       ? String(r[hdr["HOTELS"]       - 1] || "").trim() : "";
    const hotelId     = String(r[hdr["Hotel_ID"]       - 1] || "").trim().toUpperCase();
    const hotelStatus = String(r[hdr["Hotel_Status"]   - 1] || "").trim().toUpperCase();
    const travelStatus= String(r[hdr["Travel_Status"]  - 1] || "").trim().toUpperCase();
    const phone       = hdr["Phone"]        ? String(r[hdr["Phone"]        - 1] || "").trim() : "";
    const notes       = hdr["Notes"]        ? String(r[hdr["Notes"]        - 1] || "").trim() : "";

    // Solo crew CONFIRMED entra nella cache
    if (!crewId || !name || !hotelId || hotelStatus !== "CONFIRMED") continue;

    const normN = normName_(name);
    const entry = {
      crewId, name, dept, unit, hotelName,
      hotelId, hotelStatus, travelStatus, phone, notes
    };

    byCrewId[crewId] = entry;
    hotelsSet.add(hotelId);

    if (!byHotel[hotelId]) byHotel[hotelId] = [];
    byHotel[hotelId].push(entry);

    if (!duplicates[normN]) duplicates[normN] = [];
    duplicates[normN].push(entry);
  }

  // Costruisce byNormName — solo nomi univoci
  Object.keys(duplicates).forEach(normN => {
    if (duplicates[normN].length === 1) {
      byNormName[normN] = duplicates[normN][0];
    } else {
      ambiguousNames[normN] = true;
    }
  });

  // Ordina crew per hotel per dept + nome
  Object.keys(byHotel).forEach(hotelId => {
    byHotel[hotelId].sort((a, b) => {
      const da = String(a.dept || "").toLowerCase();
      const db = String(b.dept || "").toLowerCase();
      if (da !== db) return da < db ? -1 : 1;
      const na = String(a.name || "").toLowerCase();
      const nb = String(b.name || "").toLowerCase();
      return na < nb ? -1 : na > nb ? 1 : 0;
    });
  });

  const payload = {
    byHotel, byCrewId, byNormName,
    hotels: Array.from(hotelsSet).sort(),
    ambiguousNames, duplicates
  };

  CacheService.getDocumentCache().put(
    CFG.CACHE.CREW_KEY,
    JSON.stringify(payload),
    CFG.CACHE.TTL_SEC
  );

  return payload;
}

/**
 * Restituisce la cache crew.
 * Se scaduta o non presente, la ricostruisce.
 */
function TS_getCrewCache_() {
  const raw = CacheService.getDocumentCache().get(CFG.CACHE.CREW_KEY);
  if (raw) {
    try { return JSON.parse(raw); }
    catch (e) { /* cache corrotta — ricostruisce */ }
  }
  return TS_buildCrewCache_();
}

/**
 * Forza il rebuild della cache crew.
 * Chiamata quando Crew_Master viene modificato.
 */
function TS_refreshCrewCache_() {
  return TS_buildCrewCache_();
}

/**
 * Invalida la cache senza ricostruirla.
 * La ricostruzione avviene alla prossima chiamata
 * di TS_getCrewCache_() — lazy loading.
 */
function TS_invalidateCrewCache_() {
  try {
    CacheService.getDocumentCache().remove(CFG.CACHE.CREW_KEY);
  } catch (e) {
    Logger.log("Cache invalidation failed (non-critical): " + e.message);
  }
}

/* =========================================
   CREW RESOLUTION
   ========================================= */

/**
 * Risolve un nome passeggero al record crew corrispondente.
 *
 * @param  {string} name       Nome da cercare
 * @param  {Object} crewCache  Cache crew
 * @return {{ok, status, note, record, normName}}
 */
function TS_resolveCrewByPassengerName_(name, crewCache) {
  const normN = normName_(name);

  if (!normN) {
    return { ok: false, status: "EMPTY_NAME",
             note: "Empty passenger name", record: null, normName: "" };
  }

  if (crewCache.ambiguousNames && crewCache.ambiguousNames[normN]) {
    const opts = ((crewCache.duplicates || {})[normN] || [])
                 .map(x => x.crewId).join(", ");
    return { ok: false, status: "DUPLICATE_NAME",
             note: "Duplicate name: " + opts, record: null, normName: normN };
  }

  const record = (crewCache.byNormName || {})[normN] || null;

  if (!record) {
    return { ok: false, status: "NAME_NOT_FOUND",
             note: "Not found in confirmed cache", record: null, normName: normN };
  }

  return { ok: true, status: "OK", note: "", record, normName: normN };
}

/**
 * Risolve crew da Crew_ID o Full_Name.
 * Prima cerca per ID (più preciso), poi per nome.
 */
function resolveCrewFromTripPassenger_(crewId, fullName, crewCache) {
  const cId   = String(crewId   || "").trim();
  const cName = String(fullName || "").trim();

  if (cId && crewCache.byCrewId && crewCache.byCrewId[cId]) {
    const record = crewCache.byCrewId[cId];
    return {
      ok: true, status: "OK", note: "",
      record,
      normName: normName_(record.name || cName)
    };
  }

  if (cName) return TS_resolveCrewByPassengerName_(cName, crewCache);

  return { ok: false, status: "EMPTY_NAME",
           note: "Empty passenger", record: null, normName: "" };
}

/* =========================================
   DV_PASSENGERS — cache per le sidebar
   ========================================= */

/**
 * Ricostruisce DV_Passengers dalla cache crew.
 *
 * Struttura: header = Hotel_ID, righe = nomi crew per hotel
 * Usato dalla sidebar Pax Assignment per mostrare
 * i crew disponibili per hotel.
 *
 * Bulk write: costruisce l'intera matrice in memoria
 * poi scrive in una sola chiamata per hotel.
 */
function refreshAllDvCachesAutoHeaders() {
  const ss   = SpreadsheetApp.getActive();
  const dvSh = ss.getSheetByName(CFG.SHEETS.DV);
  if (!dvSh) return;

  const crew   = TS_getCrewCache_();
  const hotels = crew.hotels || [];

  const { HEADER_ROW: hr, DATA_START_ROW: dsr, MAX_LIST_ROWS: maxR } = CFG.DV;

  // Pulisce area esistente
  const maxCols  = Math.max(dvSh.getLastColumn(), 1);
  const maxClear = Math.max(0, dvSh.getMaxRows() - hr + 1);
  if (maxCols > 0 && maxClear > 0) {
    dvSh.getRange(hr, 1, maxClear, maxCols).clearContent();
  }

  if (!hotels.length) return;

  // Scrive header = Hotel_ID
  dvSh.getRange(hr, 1, 1, hotels.length).setValues([hotels]);

  // Costruisce matrice nomi in memoria
  const colsData = hotels.map(hotelId =>
    (crew.byHotel[hotelId] || []).map(x => x.name).sort()
  );

  const maxLen = colsData.reduce((m, c) => Math.max(m, c.length), 0);
  if (!maxLen) return;

  const matrix = Array.from({ length: maxLen }, () => Array(hotels.length).fill(""));
  colsData.forEach((col, c) => col.forEach((name, r) => { matrix[r][c] = name; }));

  dvSh.getRange(dsr, 1, matrix.length, matrix[0].length).setValues(matrix);
  Logger.log("DV cache updated: " + hotels.join(", "));
}

/**
 * Ricostruisce DV_Passengers usando la stessa logica
 * ma leggendo direttamente Crew_Master (senza cache).
 * Compatibilità con il vecchio codice.
 */
function TS_rebuildDVSheet_() {
  TS_refreshCrewCache_();
  refreshAllDvCachesAutoHeaders();
}

/* =========================================
   VALIDAZIONE PASSEGGERI PER TRIP
   ========================================= */

/**
 * Restituisce i nomi crew validi per un trip
 * basandosi su Pickup_ID, Dropoff_ID e Travel_Status.
 *
 * Regole:
 * STANDARD (hotel→location): crew PRESENT nell'hotel di pickup
 * DEPARTURE (hotel→hub):     crew OUT nell'hotel di pickup
 * ARRIVAL (hub→hotel):       crew IN nell'hotel di dropoff
 *
 * @param  {string} pickupId   Pickup_ID del trip
 * @param  {string} dropoffId  Dropoff_ID del trip
 * @param  {Object} crew       Cache crew
 * @return {string[]}          Nomi crew validi, ordinati
 */
function TS_getValidPassengerNamesForTrip_(pickupId, dropoffId, crew) {
  const pid = String(pickupId  || "").trim().toUpperCase();
  const did = String(dropoffId || "").trim().toUpperCase();
  if (!pid && !did) return [];

  const tc          = getTransferClass_(pid, did);
  const validNames  = new Set();

  const addFiltered = (hotelId, acceptedStatuses) => {
    const list = crew.byHotel[hotelId] || [];
    list.forEach(item => {
      const ts = String(item.travelStatus || "").trim().toUpperCase();
      if (!acceptedStatuses || acceptedStatuses.has(ts)) {
        validNames.add(item.name);
      }
    });
  };

  switch (tc) {
    case "STANDARD":   addFiltered(pid, new Set(["PRESENT"])); break;
    case "DEPARTURE":  addFiltered(pid, new Set(["OUT"]));     break;
    case "ARRIVAL":    addFiltered(did, new Set(["IN"]));      break;
    default: break;
  }

  return Array.from(validNames).sort();
}

/**
 * Verifica se un crew è valido per un trip
 * basandosi su pickup, dropoff e status.
 *
 * @param  {string} pickupId   Pickup_ID
 * @param  {string} dropoffId  Dropoff_ID
 * @param  {Object} crewObj    Record crew { hotelId, hotelStatus, travelStatus }
 * @return {boolean}
 */
function crewMatchesTripRules_(pickupId, dropoffId, crewObj) {
  const pid = String(pickupId  || "").trim().toUpperCase();
  const did = String(dropoffId || "").trim().toUpperCase();
  const tc  = getTransferClass_(pid, did);

  const hotelStatus  = String(crewObj.hotelStatus  || "").trim().toUpperCase();
  const travelStatus = String(crewObj.travelStatus || "").trim().toUpperCase();
  const hotelId      = String(crewObj.hotelId      || "").trim().toUpperCase();

  if (hotelStatus !== "CONFIRMED") return false;

  switch (tc) {
    case "STANDARD":
      return travelStatus === "PRESENT" && hotelId === pid;
    case "DEPARTURE":
      return travelStatus === "OUT" && hotelId === pid;
    case "ARRIVAL":
      return travelStatus === "IN" && hotelId === did;
    default:
      return false;
  }
}

/**
 * Filtra dalla lista i nomi già assegnati al trip.
 */
function TS_filterOutAlreadyAssigned_(values, assignedNames) {
  const set = new Set((assignedNames || []).map(v => normName_(v)).filter(Boolean));
  return (values || []).filter(v => !set.has(normName_(v)));
}

/**
 * Restituisce i nomi passeggeri assegnati a una riga Trips
 * leggendo da Trip_Passengers.
 */
function TS_getAssignedPassengerNamesForTripRow_(tripRow) {
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
    if (name) out.push(name);
  }

  return out;
}

/* =========================================
   SETUP TRAVEL STATUS DV
   ========================================= */

function setupCrewTravelStatusDV() {
  const ss = SpreadsheetApp.getActive();
  const sh = ss.getSheetByName(CFG.SHEETS.CREW);
  if (!sh) throw new Error("Sheet not found: Crew_Master");

  const hdr        = getHeaderMap_(sh);
  const travelCol  = hdr["Travel_Status"];
  if (!travelCol) throw new Error("Crew_Master missing Travel_Status header");

  const numRows = Math.max(1, sh.getMaxRows() - 1);
  sh.getRange(2, travelCol, numRows, 1).setDataValidation(
    SpreadsheetApp.newDataValidation()
      .requireValueInList(["IN", "OUT", "PRESENT"], true)
      .setAllowInvalid(false)
      .build()
  );
  Logger.log("Travel_Status DV set on " + numRows + " rows");
}

/* =========================================
   MENU ACTIONS
   ========================================= */

/**
 * Genera i QR codes per tutti i crew in Crew_Master
 * e tutti i veicoli in Fleet.
 * Chiamato da CAPTAIN → Generate QR Codes.
 */
function tsGenerateQRCodes() {
  try {
    const ss = SpreadsheetApp.getActive();
    ss.toast("Generating QR codes...", "Captain");

    const crewCount    = _generateCrewQRCodes_();
    const vehicleCount = _generateFleetQRCodes_();

    TS_log_("INFO", "tsGenerateQRCodes", {
      message: "QR generated: " + crewCount + " crew, " + vehicleCount + " vehicles"
    });

    SpreadsheetApp.getUi().alert(
      "QR Codes Generated",
      "Crew: " + crewCount + " QR codes\n" +
      "Vehicles: " + vehicleCount + " QR codes\n\n" +
      "Look for the QR_Code column in Crew_Master and Fleet.",
      SpreadsheetApp.getUi().ButtonSet.OK
    );

  } catch (err) {
    TS_log_("ERROR", "tsGenerateQRCodes", { message: err.message });
    SpreadsheetApp.getUi().alert("Error generating QR codes:\n" + err.message);
  }
}

/**
 * Genera QR codes per Crew_Master.
 * Il QR contiene "CR:{Crew_ID}" per distinguerlo dai veicoli.
 * Aggiunge/aggiorna la colonna QR_Code.
 *
 * @return {number} Numero di QR generati
 */
function _generateCrewQRCodes_() {
  const ss = SpreadsheetApp.getActive();
  const sh = ss.getSheetByName(CFG.SHEETS.CREW);
  if (!sh) throw new Error("Crew_Master sheet not found.");

  const hdr      = getHeaderMap_(sh);
  const lastRow  = getRealLastCrewRow_(sh);
  const startRow = CFG.CREW.HEADER_ROWS + 1;
  if (lastRow < startRow) return 0;

  let qrCol = hdr[CFG.QR.CREW_COL];
  if (!qrCol) {
    qrCol = sh.getLastColumn() + 1;
    sh.getRange(1, qrCol).setValue(CFG.QR.CREW_COL).setFontWeight("bold");
  }

  const crewIdCol = hdr["Crew_ID"];
  const nameCol   = hdr["Full_Name"];
  if (!crewIdCol) throw new Error("Crew_Master missing header: Crew_ID");

  const cellSize = CFG.QR.SIZE + 10;
  sh.setColumnWidth(qrCol, cellSize);

  const data  = sh.getRange(startRow, 1, lastRow - startRow + 1, sh.getLastColumn()).getValues();
  let   count = 0;

  data.forEach((row, idx) => {
    const crewId = String(row[crewIdCol - 1] || "").trim();
    if (!crewId) return;

    const cellRow   = startRow + idx;
    const name      = nameCol ? String(row[nameCol - 1] || "").trim() : crewId;
    const qrContent = CFG.QR.CREW_PREFIX + crewId;
    const qrUrl     = _buildQRUrl_(qrContent);

    sh.setRowHeight(cellRow, cellSize);

    try {
      const cell = sh.getRange(cellRow, qrCol);
      // Formato automatico — necessario per CellImage
      cell.setNumberFormat("General");
      const image = SpreadsheetApp.newCellImage()
        .setSourceUrl(qrUrl)
        .setAltTextTitle(crewId)
        .setAltTextDescription(name)
        .build();
      cell.setValue(image);
      count++;
    } catch (e) {
      Logger.log("QR FAILED for " + crewId + " | URL: " + qrUrl + " | Error: " + e.message);
      sh.getRange(cellRow, qrCol).setValue(qrContent);
    }
  });

  Logger.log("Crew QR codes generated: " + count);
  return count;
}

/**
 * Genera QR codes per Fleet.
 */
function _generateFleetQRCodes_() {
  const ss = SpreadsheetApp.getActive();
  const sh = ss.getSheetByName(CFG.SHEETS.FLEET);
  if (!sh) throw new Error("Fleet sheet not found.");

  const hdr     = getHeaderMap_(sh);
  const lastRow = sh.getLastRow();
  if (lastRow < 2) return 0;

  let qrCol = hdr[CFG.QR.FLEET_COL];
  if (!qrCol) {
    qrCol = sh.getLastColumn() + 1;
    sh.getRange(1, qrCol).setValue(CFG.QR.FLEET_COL).setFontWeight("bold");
  }

  const vehicleCol = hdr["Vehicle_ID"];
  const driverCol  = hdr["Driver_Name"];
  if (!vehicleCol) throw new Error("Fleet missing header: Vehicle_ID");

  const cellSize = CFG.QR.SIZE + 10;
  sh.setColumnWidth(qrCol, cellSize);

  const data  = sh.getRange(2, 1, lastRow - 1, sh.getLastColumn()).getValues();
  let   count = 0;

  data.forEach((row, idx) => {
    const vehicleId = String(row[vehicleCol - 1] || "").trim();
    if (!vehicleId) return;

    const cellRow   = 2 + idx;
    const driver    = driverCol ? String(row[driverCol - 1] || "").trim() : vehicleId;
    const qrContent = CFG.QR.VEHICLE_PREFIX + vehicleId;
    const qrUrl     = _buildQRUrl_(qrContent);

    sh.setRowHeight(cellRow, cellSize);

    try {
      const cell = sh.getRange(cellRow, qrCol);
      cell.setNumberFormat("General");
      const image = SpreadsheetApp.newCellImage()
        .setSourceUrl(qrUrl)
        .setAltTextTitle(vehicleId)
        .setAltTextDescription(driver)
        .build();
      cell.setValue(image);
      count++;
    } catch (e) {
      Logger.log("QR error for " + vehicleId + ": " + e.message);
      sh.getRange(cellRow, qrCol).setValue(qrContent);
    }
  });

  Logger.log("Fleet QR codes generated: " + count);
  return count;
}

/**
 * Costruisce l'URL del QR code.
 * Il QR contiene l'URL della Web App con il parametro ?qr=
 * così la camera nativa del telefono apre direttamente l'app.
 * Se l'URL della Web App non è configurato, usa solo il codice.
 */
function _buildQRUrl_(content) {
  const size     = CFG.QR.SIZE + "x" + CFG.QR.SIZE;
  const webAppUrl= PropertiesService.getScriptProperties().getProperty("WRAP_TRIP_URL");

  let data;
  if (webAppUrl) {
    data = webAppUrl + "?qr=" + encodeURIComponent(content);
  } else {
    data = content;
  }

  return "https://api.qrserver.com/v1/create-qr-code/?size=" + size +
         "&data=" + encodeURIComponent(data) + "&format=png&margin=4";
}

/**
 * Stampa i QR codes di Crew_Master in un foglio dedicato
 * con nome e dipartimento — pronto per la stampa e la plastificazione.
 */
function tsPrintCrewQRSheet() {
  try {
    const ss      = SpreadsheetApp.getActive();
    const crewSh  = ss.getSheetByName(CFG.SHEETS.CREW);
    if (!crewSh) throw new Error("Crew_Master not found.");

    const hdr      = getHeaderMap_(crewSh);
    const lastRow  = getRealLastCrewRow_(crewSh);
    const startRow = CFG.CREW.HEADER_ROWS + 1;
    if (lastRow < startRow) {
      SpreadsheetApp.getUi().alert("No crew found in Crew_Master.");
      return;
    }

    // Crea o pulisce il foglio di stampa
    const printShName = "QR_Crew_Print";
    let printSh = ss.getSheetByName(printShName);
    if (!printSh) printSh = ss.insertSheet(printShName);
    else {
      printSh.clearContents();
      printSh.clearFormats();
    }

    const data = crewSh.getRange(startRow, 1, lastRow - startRow + 1, crewSh.getLastColumn()).getValues();

    const crewIdCol = hdr["Crew_ID"]   ? hdr["Crew_ID"]   - 1 : -1;
    const nameCol   = hdr["Full_Name"] ? hdr["Full_Name"] - 1 : -1;
    const deptCol   = hdr["Dept"]      ? hdr["Dept"]      - 1 : -1;
    const unitCol   = hdr["Unit"]      ? hdr["Unit"]      - 1 : -1;

    // Layout: 3 badge per riga
    const COLS_PER_ROW = 3;
    const BADGE_ROWS   = 5; // righe per badge: QR + nome + dept + unit + spazio
    const QR_SIZE      = CFG.QR.SIZE;

    let col = 1;
    let row = 1;
    let count = 0;

    data.forEach(r => {
      const crewId = crewIdCol >= 0 ? String(r[crewIdCol] || "").trim() : "";
      const name   = nameCol   >= 0 ? String(r[nameCol]   || "").trim() : "";
      const dept   = deptCol   >= 0 ? String(r[deptCol]   || "").trim() : "";
      const unit   = unitCol   >= 0 ? String(r[unitCol]   || "").trim() : "";

      if (!crewId || !name) return;

      const qrUrl = _buildQRUrl_(CFG.QR.CREW_PREFIX + crewId);

      // QR image — usa CellImageBuilder
      try {
        const image = SpreadsheetApp.newCellImage()
          .setSourceUrl(qrUrl)
          .setAltTextTitle(crewId)
          .setAltTextDescription(name)
          .build();
        printSh.setRowHeight(row, QR_SIZE + 10);
        printSh.setColumnWidth(col, QR_SIZE + 20);
        printSh.getRange(row, col).setValue(image);
      } catch(e) {
        printSh.getRange(row, col).setValue(CFG.QR.CREW_PREFIX + crewId);
      }

      // Nome
      printSh.getRange(row + 1, col)
        .setValue(name)
        .setFontWeight("bold")
        .setFontSize(10)
        .setHorizontalAlignment("center");
      printSh.setRowHeight(row + 1, 18);

      // Dept
      printSh.getRange(row + 2, col)
        .setValue(dept)
        .setFontSize(9)
        .setFontColor("#64748b")
        .setHorizontalAlignment("center");
      printSh.setRowHeight(row + 2, 16);

      // Unit
      printSh.getRange(row + 3, col)
        .setValue(unit)
        .setFontSize(9)
        .setFontColor("#1a3a5c")
        .setHorizontalAlignment("center");
      printSh.setRowHeight(row + 3, 16);

      // Bordo badge
      printSh.getRange(row, col, BADGE_ROWS - 1, 1)
        .setBorder(true, true, true, true, false, false,
          "#cbd5e1", SpreadsheetApp.BorderStyle.SOLID);

      count++;
      col++;
      if (col > COLS_PER_ROW) {
        col = 1;
        row += BADGE_ROWS;
      }
    });

    // Attiva il foglio di stampa
    ss.setActiveSheet(printSh);

    TS_log_("INFO", "tsPrintCrewQRSheet", {
      message: "QR print sheet generated: " + count + " badges"
    });

    ss.toast("QR print sheet ready: " + count + " badges.", "Captain", 4);

  } catch (err) {
    TS_log_("ERROR", "tsPrintCrewQRSheet", { message: err.message });
    SpreadsheetApp.getUi().alert("Error:\n" + err.message);
  }
}

function tsDebugQRUrl() {
  const testId  = "CR:CR0002";
  const url     = _buildQRUrl_(testId);
  Logger.log("Testing URL: " + url);

  try {
    const response = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    const code     = response.getResponseCode();
    const type     = response.getHeaders()["Content-Type"] || "";
    Logger.log("Response code: " + code);
    Logger.log("Content-Type: " + type);
    Logger.log("Blob size: " + response.getBlob().getBytes().length + " bytes");

    if (code === 200) {
      // Prova CellImageBuilder
      try {
        const image = SpreadsheetApp.newCellImage()
          .setSourceUrl(url)
          .setAltTextTitle("TEST")
          .build();
        const sh = SpreadsheetApp.getActive().getSheetByName(CFG.SHEETS.CREW);
        sh.getRange(2, sh.getLastColumn()).setNumberFormat("General").setValue(image);
        Logger.log("CellImageBuilder: SUCCESS");
      } catch(e2) {
        Logger.log("CellImageBuilder FAILED: " + e2.message);
      }
    }
  } catch(e) {
    Logger.log("UrlFetch FAILED: " + e.message);
  }

  SpreadsheetApp.getActive().toast("Debug complete — check Execution Log", "Captain", 5);
}


function tsRefreshCrewCache() {
  TS_refreshCrewCache_();
  SpreadsheetApp.getActive().toast("Crew cache rebuilt.", "Captain", 3);
}

function tsRebuildDV() {
  TS_refreshCrewCache_();
  TS_rebuildDVSheet_();
  SpreadsheetApp.getActive().toast("DV_Passengers rebuilt.", "Captain", 3);
}

function tsDebugPassengerDVForActiveRow() {
  const sh = SpreadsheetApp.getActiveSheet();
  if (!sh || sh.getName() !== CFG.SHEETS.TRIPS) {
    throw new Error("Open a Trips row first.");
  }
  const row = sh.getActiveCell().getRow();
  if (row <= 1) throw new Error("Select a data row in Trips.");

  const hdr       = getHeaderMap_(sh);
  const pickupId  = String(sh.getRange(row, hdr["Pickup_ID"] ).getDisplayValue() || "").trim().toUpperCase();
  const dropoffId = String(sh.getRange(row, hdr["Dropoff_ID"]).getDisplayValue() || "").trim().toUpperCase();

  const crew     = TS_getCrewCache_();
  const base     = TS_getValidPassengerNamesForTrip_(pickupId, dropoffId, crew);
  const assigned = TS_getAssignedPassengerNamesForTripRow_(row);
  const filtered = TS_filterOutAlreadyAssigned_(base, assigned);

  Logger.log("ROW=" + row + " pickup=" + pickupId + " dropoff=" + dropoffId);
  Logger.log("transferClass=" + getTransferClass_(pickupId, dropoffId));
  Logger.log("base=" + JSON.stringify(base));
  Logger.log("assigned=" + JSON.stringify(assigned));
  Logger.log("filtered=" + JSON.stringify(filtered));

  SpreadsheetApp.getUi().alert(
    "Pax DV Debug — Row " + row,
    "Pickup: " + pickupId + " | Dropoff: " + dropoffId +
    "\nTransfer: " + getTransferClass_(pickupId, dropoffId) +
    "\n\nAvailable (" + filtered.length + "): " + filtered.join(", ") +
    "\nAssigned (" + assigned.length + "): " + assigned.join(", "),
    SpreadsheetApp.getUi().ButtonSet.OK
  );
}
/* =========================================
   TRAVEL STATUS — AUTOMAZIONE
   
   Tre funzionalità indipendenti:
   1. Trigger 5 min: ARRIVAL completato → IN → PRESENT
   2. onOpen check: crew con Departure_Date = domani → alert OUT
   3. Setup: installa trigger + CF colonne nuove
   ========================================= */

/**
 * PEZZO 1 — Trigger temporale (ogni 5 minuti)
 * 
 * Guarda i trip ARRIVAL con End_DT passato e non ancora
 * processati. Per ogni passeggero con Travel_Status = IN
 * aggiorna a PRESENT.
 * 
 * Usa ScriptProperties per tracciare l'ultima esecuzione
 * e non riprocessare gli stessi trip.
 * 
 * Regola fondamentale: il manuale vince sempre.
 * Se Travel_Status non è più IN (modificato manualmente)
 * la funzione non tocca nulla.
 */
function tsAutoUpdateTravelStatusOnArrival() {
  const ss       = SpreadsheetApp.getActive();
  const tripsSh  = ss.getSheetByName(CFG.SHEETS.TRIPS);
  const crewSh   = ss.getSheetByName(CFG.SHEETS.CREW);
  const paxSh    = ss.getSheetByName(CFG.SHEETS.PAX);

  if (!tripsSh || !crewSh || !paxSh) return;

  const tz    = Session.getScriptTimeZone();
  const now   = new Date();
  const nowMs = now.getTime();

  // Legge lastRun dalle ScriptProperties
  const props   = PropertiesService.getScriptProperties();
  const lastRun = Number(props.getProperty("TS_ARRIVAL_LAST_RUN") || "0");

  // Processa i trip con End_DT tra lastRun e ora
  // Margine di 2 minuti per coprire slittamenti del trigger
  const windowStart = Math.max(lastRun - 120000, nowMs - 10 * 60000);
  const windowEnd   = nowMs;

  // Header maps
  const tripsHdr = getHeaderMap_(tripsSh);
  const paxHdr   = getHeaderMap_(paxSh);
  const crewHdr  = getHeaderMap_(crewSh);

  const tcCol    = tripsHdr["Transfer_Class(auto)"];
  const endCol   = tripsHdr["End_DT"];
  const tidCol   = tripsHdr["Trip_ID"];
  if (!tcCol || !endCol || !tidCol) {
    props.setProperty("TS_ARRIVAL_LAST_RUN", String(nowMs));
    return;
  }

  // Legge Trips
  const lastTripRow = getRealLastTripRow_(tripsSh);
  if (lastTripRow < 2) {
    props.setProperty("TS_ARRIVAL_LAST_RUN", String(nowMs));
    return;
  }

  const tripsData = tripsSh.getRange(2, 1, lastTripRow - 1, tripsSh.getLastColumn()).getValues();

  // Raccoglie Trip_ID degli ARRIVAL con End_DT nella finestra
  const arrivalTripIds = new Set();
  tripsData.forEach(row => {
    const tc  = String(row[tcCol  - 1] || "").trim().toUpperCase();
    const tid = String(row[tidCol - 1] || "").trim();
    if (tc !== "ARRIVAL" || !tid) return;
    const endDt = row[endCol - 1];
    if (!(endDt instanceof Date) || isNaN(endDt)) return;
    const endMs = endDt.getTime();
    if (endMs >= windowStart && endMs <= windowEnd) {
      arrivalTripIds.add(tid);
    }
  });

  if (arrivalTripIds.size === 0) {
    props.setProperty("TS_ARRIVAL_LAST_RUN", String(nowMs));
    return;
  }

  // Legge Trip_Passengers — trova i Crew_ID dei trip ARRIVAL
  const lastPaxRow = getRealLastPaxRow_(paxSh);
  if (lastPaxRow < 2) {
    props.setProperty("TS_ARRIVAL_LAST_RUN", String(nowMs));
    return;
  }

  const paxTidCol   = paxHdr["Trip_ID"];
  const paxCrewCol  = paxHdr["Crew_ID"];
  if (!paxTidCol || !paxCrewCol) {
    props.setProperty("TS_ARRIVAL_LAST_RUN", String(nowMs));
    return;
  }

  const paxData   = paxSh.getRange(2, 1, lastPaxRow - 1, paxSh.getLastColumn()).getValues();
  const crewToUpdate = new Set();

  paxData.forEach(row => {
    const tid    = String(row[paxTidCol  - 1] || "").trim();
    const crewId = String(row[paxCrewCol - 1] || "").trim();
    if (arrivalTripIds.has(tid) && crewId) crewToUpdate.add(crewId);
  });

  if (crewToUpdate.size === 0) {
    props.setProperty("TS_ARRIVAL_LAST_RUN", String(nowMs));
    return;
  }

  // Aggiorna Travel_Status in Crew_Master
  // REGOLA: tocca SOLO chi è ancora IN — il manuale ha priorità assoluta
  const crewIdCol     = crewHdr["Crew_ID"];
  const travelCol     = crewHdr["Travel_Status"];
  if (!crewIdCol || !travelCol) {
    props.setProperty("TS_ARRIVAL_LAST_RUN", String(nowMs));
    return;
  }

  const lastCrewRow = getRealLastCrewRow_(crewSh);
  if (lastCrewRow < 2) {
    props.setProperty("TS_ARRIVAL_LAST_RUN", String(nowMs));
    return;
  }

  const crewData = crewSh.getRange(2, 1, lastCrewRow - 1, crewSh.getLastColumn()).getValues();
  let updated = 0;

  crewData.forEach((row, i) => {
    const crewId      = String(row[crewIdCol  - 1] || "").trim();
    const travelStatus= String(row[travelCol  - 1] || "").trim().toUpperCase();

    if (!crewToUpdate.has(crewId)) return;
    if (travelStatus !== "IN") return; // manuale ha già cambiato — non toccare

    // Aggiorna la singola cella
    crewSh.getRange(2 + i, travelCol).setValue("PRESENT");
    updated++;
  });

  if (updated > 0) {
    // Invalida cache crew — il Travel_Status è cambiato
    TS_invalidateCrewCache_();
    TS_log_("INFO", "tsAutoUpdateTravelStatusOnArrival", {
      sheet: CFG.SHEETS.CREW,
      message: updated + " crew IN → PRESENT (ARRIVAL trip completed)"
    });
  }

  // Salva timestamp ultima esecuzione
  props.setProperty("TS_ARRIVAL_LAST_RUN", String(nowMs));
}

/**
 * PEZZO 2 — Check partenze domani (chiamato da onOpen)
 *
 * Guarda crew con Departure_Date = domani e Travel_Status ≠ OUT.
 * Mostra un dialog con lista e checkbox.
 * Manuale sempre — il dialog è solo un assistente.
 * 
 * Se Departure_Date non esiste nel foglio, esce silenziosamente.
 */
function tsCheckDeparturesTomorrow() {
  const ss     = SpreadsheetApp.getActive();
  const crewSh = ss.getSheetByName(CFG.SHEETS.CREW);
  if (!crewSh) return;

  const hdr        = getHeaderMap_(crewSh);
  const depDateCol = hdr["Departure_Date"];
  if (!depDateCol) return; // colonna non ancora aggiunta — nessun alert

  const travelCol  = hdr["Travel_Status"];
  const nameCol    = hdr["Full_Name"];
  const hotelCol   = hdr["HOTELS"];
  if (!travelCol || !nameCol) return;

  const tz       = Session.getScriptTimeZone();
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(0, 0, 0, 0);
  const tomorrowStr = Utilities.formatDate(tomorrow, tz, "yyyy-MM-dd");

  const lastRow = getRealLastCrewRow_(crewSh);
  if (lastRow < 2) return;

  const data = crewSh.getRange(2, 1, lastRow - 1, crewSh.getLastColumn()).getValues();

  // Raccoglie crew con Departure_Date = domani e Travel_Status ≠ OUT
  const departing = [];
  data.forEach((row, i) => {
    const depDate = row[depDateCol - 1];
    if (!(depDate instanceof Date) || isNaN(depDate)) return;

    const depStr = Utilities.formatDate(depDate, tz, "yyyy-MM-dd");
    if (depStr !== tomorrowStr) return;

    const ts   = String(row[travelCol - 1] || "").trim().toUpperCase();
    if (ts === "OUT") return; // già impostato

    const name  = String(row[nameCol  - 1] || "").trim();
    const hotel = hotelCol ? String(row[hotelCol - 1] || "").trim() : "";
    departing.push({ name, hotel, sheetRow: 2 + i });
  });

  if (departing.length === 0) return; // nessuna partenza domani

  // Dialog con lista
  const ui = SpreadsheetApp.getUi();
  const names = departing.map(d =>
    "• " + d.name + (d.hotel ? "  (" + d.hotel + ")" : "")
  ).join("\n");

  const result = ui.alert(
    "⚠️ Partenze previste DOMANI",
    "I seguenti crew hanno una partenza prevista per domani.\n" +
    "Vuoi impostare Travel_Status = OUT per tutti?\n\n" +
    names + "\n\n" +
    "SÌ = imposta OUT per tutti\n" +
    "NO = nessuna modifica (gestisci manualmente)",
    ui.ButtonSet.YES_NO
  );

  if (result !== ui.Button.YES) return;

  // Aggiorna Travel_Status = OUT per tutti i confermati
  departing.forEach(d => {
    crewSh.getRange(d.sheetRow, travelCol).setValue("OUT");
  });

  // Invalida cache
  TS_invalidateCrewCache_();

  TS_log_("INFO", "tsCheckDeparturesTomorrow", {
    sheet: CFG.SHEETS.CREW,
    message: departing.length + " crew impostati OUT per partenza domani"
  });

  ss.toast(
    departing.length + " crew impostati OUT — partenze domani",
    "Captain", 5
  );
}

/**
 * PEZZO 3 — Installa trigger temporale per ARRIVAL → PRESENT
 * Da eseguire una volta dal menu CAPTAIN Tools.
 * Il trigger chiama tsAutoUpdateTravelStatusOnArrival ogni 5 minuti.
 */
function tsSetupArrivalTrigger() {
  const ui = SpreadsheetApp.getUi();

  // Controlla se esiste già
  const existing = ScriptApp.getProjectTriggers()
    .find(t => t.getHandlerFunction() === "tsAutoUpdateTravelStatusOnArrival");

  if (existing) {
    ui.alert(
      "Trigger già installato",
      "Il trigger ARRIVAL → PRESENT è già attivo (ogni 5 minuti).",
      ui.ButtonSet.OK
    );
    return;
  }

  ScriptApp.newTrigger("tsAutoUpdateTravelStatusOnArrival")
    .timeBased()
    .everyMinutes(5)
    .create();

  // Inizializza il timestamp
  PropertiesService.getScriptProperties()
    .setProperty("TS_ARRIVAL_LAST_RUN", String(new Date().getTime()));

  TS_log_("INFO", "tsSetupArrivalTrigger", {
    message: "Trigger ARRIVAL → PRESENT installato (ogni 5 min)"
  });

  ui.alert(
    "✅ Trigger installato",
    "Il sistema aggiornerà automaticamente Travel_Status da IN a PRESENT\n" +
    "quando un ARRIVAL trip viene completato (ogni 5 minuti).\n\n" +
    "Il manuale ha sempre la priorità — se hai già modificato\n" +
    "Travel_Status manualmente, il sistema non lo sovrascrive.",
    ui.ButtonSet.OK
  );
}

/**
 * PEZZO 4 — Setup colonne Arrival_Date e Departure_Date
 * Aggiunge DV (date) e Conditional Formatting su Crew_Master.
 * 
 * Conditional Formatting:
 * - Departure_Date = domani → riga arancione (prepara)
 * - Departure_Date = oggi   → riga rossa (urgente)
 * - Arrival_Date   = oggi   → riga verde chiaro (in arrivo oggi)
 * 
 * Le colonne vengono aggiunte dopo l'ultima colonna esistente
 * se non esistono già.
 */
function tsSetupCrewDateColumns() {
  const ss     = SpreadsheetApp.getActive();
  const crewSh = ss.getSheetByName(CFG.SHEETS.CREW);
  if (!crewSh) throw new Error("Crew_Master not found");

  const ui  = SpreadsheetApp.getUi();
  const hdr = getHeaderMap_(crewSh);

  // Aggiunge Arrival_Date se non esiste
  let arrCol = hdr["Arrival_Date"];
  if (!arrCol) {
    arrCol = crewSh.getLastColumn() + 1;
    crewSh.getRange(1, arrCol).setValue("Arrival_Date").setFontWeight("bold");
    TS_log_("INFO", "tsSetupCrewDateColumns", { message: "Arrival_Date aggiunta col " + arrCol });
  }

  // Aggiunge Departure_Date se non esiste
  let depCol = hdr["Departure_Date"];
  if (!depCol) {
    depCol = crewSh.getLastColumn() + 1;
    crewSh.getRange(1, depCol).setValue("Departure_Date").setFontWeight("bold");
    TS_log_("INFO", "tsSetupCrewDateColumns", { message: "Departure_Date aggiunta col " + depCol });
  }

  const lastRow  = crewSh.getMaxRows();
  const dataRows = Math.max(1, lastRow - 1);

  // DV date su entrambe le colonne (permette date, non obbligatorio)
  const dateDV = SpreadsheetApp.newDataValidation()
    .requireDate()
    .setAllowInvalid(true) // non blocca se vuoto
    .setHelpText("Data opzionale nel formato GG/MM/AAAA")
    .build();

  crewSh.getRange(2, arrCol, dataRows, 1).setDataValidation(dateDV);
  crewSh.getRange(2, depCol, dataRows, 1).setDataValidation(dateDV);

  // Formato data visivo
  crewSh.getRange(2, arrCol, dataRows, 1).setNumberFormat("dd/MM/yyyy");
  crewSh.getRange(2, depCol, dataRows, 1).setNumberFormat("dd/MM/yyyy");

  // Rimuove CF esistente su Crew_Master per riapplicare pulito
  // (solo le regole che riguardano le date — le altre rimangono)
  const lastCol  = crewSh.getLastColumn();
  const fullRange = crewSh.getRange(2, 1, dataRows, lastCol);

  // Lettera colonna per le formule CF
  function colLetter(n) {
    let s = "";
    while (n > 0) {
      s = String.fromCharCode(64 + (n % 26 || 26)) + s;
      n = Math.floor((n - 1) / 26);
    }
    return s;
  }

  const depLetter = colLetter(depCol);
  const arrLetter = colLetter(arrCol);

  const rules = crewSh.getConditionalFormatRules();

  // Aggiunge nuove regole CF
  // 1. Departure_Date = oggi → ROSSO ACCESO (urgente, non ancora OUT)
  const ruleRed = SpreadsheetApp.newConditionalFormatRule()
    .whenFormulaSatisfied(
      "=AND($" + depLetter + "2=TODAY(),INDIRECT(\"J\"&ROW())<>\"OUT\")"
    )
    .setBackground("#fecaca") // rosso chiaro
    .setFontColor("#b91c1c")
    .setRanges([fullRange])
    .build();

  // 2. Departure_Date = domani → ARANCIONE (prepara)
  const ruleOrange = SpreadsheetApp.newConditionalFormatRule()
    .whenFormulaSatisfied(
      "=AND($" + depLetter + "2=TODAY()+1,INDIRECT(\"J\"&ROW())<>\"OUT\")"
    )
    .setBackground("#fed7aa") // arancione chiaro
    .setFontColor("#92400e")
    .setRanges([fullRange])
    .build();

  // 3. Arrival_Date = oggi → VERDE CHIARO (in arrivo oggi)
  const ruleGreen = SpreadsheetApp.newConditionalFormatRule()
    .whenFormulaSatisfied(
      "=AND($" + arrLetter + "2=TODAY(),INDIRECT(\"J\"&ROW())=\"IN\")"
    )
    .setBackground("#d1fae5") // verde chiaro
    .setFontColor("#065f46")
    .setRanges([fullRange])
    .build();

  // Prepende le nuove regole (hanno priorità sulle esistenti)
  rules.unshift(ruleGreen);
  rules.unshift(ruleOrange);
  rules.unshift(ruleRed);
  crewSh.setConditionalFormatRules(rules);

  TS_log_("INFO", "tsSetupCrewDateColumns", {
    message: "Setup completato: Arrival_Date col " + arrCol +
             ", Departure_Date col " + depCol + ", CF applicato"
  });

  ui.alert(
    "✅ Setup completato",
    "Colonne aggiunte a Crew_Master:\n\n" +
    "• Arrival_Date  (col " + arrCol + ") — data prevista arrivo da hub\n" +
    "• Departure_Date (col " + depCol + ") — data prevista partenza verso hub\n\n" +
    "Colori automatici:\n" +
    "🔴 Departure_Date = OGGI e non ancora OUT → urgente\n" +
    "🟠 Departure_Date = DOMANI e non ancora OUT → prepara\n" +
    "🟢 Arrival_Date = OGGI e ancora IN → in arrivo oggi\n\n" +
    "Esegui 'Setup Arrival Trigger' per attivare l'aggiornamento automatico.",
    ui.ButtonSet.OK
  );
}