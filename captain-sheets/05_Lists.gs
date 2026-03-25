/**
 * 05_Lists.gs
 * Transport Lists (Transport_List, TRAVEL_AIRPORT_List),
 * generazione PDF, invio email
 * Captain — Transport Management System
 */

/* =========================================
   CONFIGURAZIONE LISTE
   ========================================= */

const LISTS_CFG = {

  // Colonne da estrarre da Trips
  COLS: [
    "Pickup_Time", "Call", "Pickup", "Meeting_Point(auto)", "Dropoff",
    "Sign_Code(auto)", "Driver_Name(auto)", "Pax_Count(auto)",
    "Passenger_List(auto)", "Service_Type", "Notes",
    "Trip_ID", "Unit", "Transfer_Class(auto)",
    "Flight/Train_No", "Arr_Time", "Terminal/Gate",
    "Start_DT", "End_DT", "Pickup_ID", "Dropoff_ID", "Date"
  ],

  // Header stampabili Transport_List
  HEADERS_TRANSPORT: [
    "PU Time", "Call", "Pickup", "Dropoff", "Meeting Point",
    "Sign", "Driver", "#", "Passengers", "Service", "Notes"
  ],

  // Header stampabili TRAVEL
  HEADERS_TRAVEL: [
    "PU Time", "Call", "Type", "Pickup", "Dropoff",
    "Flight/Train", "Dept Time", "Arr Time", "Terminal", "Meeting Point",
    "Sign", "Driver", "#", "Passengers", "Service", "Notes"
  ],

  // Larghezze colonne in pixel
  WIDTHS_TRANSPORT: [55, 55, 110, 90, 110, 55, 80, 30, 180, 90, 120],
  WIDTHS_TRAVEL:    [55, 55, 75, 100, 100, 70, 55, 55, 65, 90, 55, 80, 30, 170, 90, 120],

  // Colori
  COLORS: {
    TRANSPORT: { bg: "#1a3a5c", fg: "#ffffff" },
    TRAVEL:    { bg: "#7b2d8b", fg: "#ffffff" },
    SECTION:   { bg: "#e8f0f8", fg: "#1a3a5c" },
    GROUP:     { bg: "#f0f4f8", fg: "#334155" },
    GROUP_T:   { bg: "#f3e8f7", fg: "#7b2d8b" },
    HUB:       { bg: "#f8fafc", fg: "#64748b" },
    SEP:       "#1a3a5c",
    SEP_T:     "#7b2d8b",
    DEP_BG:    "#fffbeb",
    ARR_BG:    "#f0fdf4",
    EVEN:      "#ffffff",
    ODD:       "#f8fafc"
  }
};

/* =========================================
   ENTRY POINT
   ========================================= */

/**
 * Apre il dialog per scegliere il range di date.
 * Chiamato dal menu CAPTAIN → Generate Transport Lists.
 */
function tsGenerateLists() {
  try {
    // Data di default = prima data trovata in Trips
    const tripsData = _readTripsForLists_(null, null);
    const defaultDate = tripsData && tripsData.dateFrom
      ? Utilities.formatDate(tripsData.dateFrom, Session.getScriptTimeZone(), "yyyy-MM-dd")
      : Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd");

    const tpl = HtmlService.createTemplateFromFile("DateRangeDialog");
    tpl.defaultDate = defaultDate;
    SpreadsheetApp.getUi().showModalDialog(
      tpl.evaluate().setWidth(360).setHeight(260),
      "Generate Transport Lists"
    );
  } catch (err) {
    TS_log_("ERROR", "tsGenerateLists", { message: err.message });
    SpreadsheetApp.getUi().alert("Error:\n" + err.message);
  }
}

/**
 * Chiamato dal dialog DateRangeDialog con le date selezionate.
 * @param {string} fromStr  "yyyy-MM-dd"
 * @param {string} toStr    "yyyy-MM-dd"
 */
function tsGenerateListsForRange(fromStr, toStr) {
  try {
    const ss = SpreadsheetApp.getActive();
    ss.toast("Generating transport lists...", "Captain");

    const dateFrom = _parseDateStr_(fromStr);
    const dateTo   = _parseDateStr_(toStr);
    if (!dateFrom || !dateTo) throw new Error("Invalid date range.");

    const tripsData = _readTripsForLists_(dateFrom, dateTo);
    if (!tripsData || !tripsData.byDate || !Object.keys(tripsData.byDate).length) {
      SpreadsheetApp.getUi().alert("No trips found for the selected date range.");
      return;
    }

    _buildTransportList_(tripsData);
    _buildTravelList_(tripsData);
    _hideSecondList_();

    TS_log_("INFO", "tsGenerateListsForRange", {
      message: "Lists generated for " + tripsData.titleSuffix
    });

    ss.toast("Lists generated for " + tripsData.titleSuffix + ".", "Captain", 5);

  } catch (err) {
    TS_log_("ERROR", "tsGenerateListsForRange", { message: err.message });
    throw err;
  }
}

function _parseDateStr_(str) {
  if (!str) return null;
  const m = String(str).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return isNaN(d) ? null : d;
}

/* =========================================
   LETTURA DATI TRIPS
   ========================================= */

/**
 * Legge Trips, filtra per range di date, raggruppa per data.
 *
 * @param  {Date|null} dateFrom  Data inizio (null = prima data trovata)
 * @param  {Date|null} dateTo    Data fine   (null = stessa di dateFrom)
 * @return {Object|null}
 *   {
 *     dateFrom, dateTo, titleSuffix,
 *     byDate: { "yyyy-MM-dd": { date, dateFormatted, rows } },
 *     sortedDates: ["yyyy-MM-dd", ...],
 *     hdr
 *   }
 */
function _readTripsForLists_(dateFrom, dateTo) {
  const ss      = SpreadsheetApp.getActive();
  const tripsSh = ss.getSheetByName(CFG.SHEETS.TRIPS);
  if (!tripsSh) throw new Error("Trips sheet not found.");

  const hdr      = getHeaderMap_(tripsSh);
  const firstRow = CFG.TRIPS.HEADER_ROWS + 1;
  const lastRow  = getRealLastTripRow_(tripsSh);
  if (lastRow < firstRow) return null;

  const numRows    = lastRow - firstRow + 1;
  const data       = tripsSh.getRange(firstRow, 1, numRows, tripsSh.getLastColumn()).getValues();
  const meaningful = data.filter(r => isTripRowMeaningful_(r, hdr));
  if (!meaningful.length) return null;

  const dateCol = (hdr["Date"] || 2) - 1;

  // Se non specificate, usa la prima data trovata per entrambi
  if (!dateFrom) {
    for (let i = 0; i < meaningful.length; i++) {
      const d = toDateSafe_(meaningful[i][dateCol]);
      if (d) { dateFrom = new Date(d); dateFrom.setHours(0,0,0,0); break; }
    }
  }
  if (!dateTo) dateTo = new Date(dateFrom);

  // Normalizza a mezzanotte
  const fromMs = new Date(dateFrom).setHours(0,0,0,0);
  const toMs   = new Date(dateTo).setHours(23,59,59,999);

  // Filtra per range e raggruppa per data
  const byDate = {};

  meaningful.forEach(r => {
    const d = toDateSafe_(r[dateCol]);
    if (!d) return;
    const dMs = d.getTime();
    if (dMs < fromMs || dMs > toMs) return;

    const key = Utilities.formatDate(d, Session.getScriptTimeZone(), "yyyy-MM-dd");
    if (!byDate[key]) {
      const dayDate = new Date(d); dayDate.setHours(0,0,0,0);
      byDate[key] = {
        date:          dayDate,
        dateFormatted: formatDate_(dayDate),
        rows:          []
      };
    }
    byDate[key].rows.push(r);
  });

  if (!Object.keys(byDate).length) return null;

  const sortedDates = Object.keys(byDate).sort();

  // Titolo range
  const fromFmt = formatDate_(dateFrom);
  const toFmt   = formatDate_(dateTo);
  const titleSuffix = sameDay_(dateFrom, dateTo) ? fromFmt : fromFmt + " → " + toFmt;

  return {
    dateFrom,
    dateTo,
    titleSuffix,
    byDate,
    sortedDates,
    hdr
  };
}

/* =========================================
   TRANSPORT LIST (MAIN + SECOND)
   ========================================= */

function _buildTransportList_(tripsData) {
  const ss = SpreadsheetApp.getActive();
  let sh   = ss.getSheetByName(CFG.SHEETS.MAIN_LIST);
  if (!sh) sh = ss.insertSheet(CFG.SHEETS.MAIN_LIST);

  _clearSheet_(sh);

  const title   = "TRANSPORT LIST — " + tripsData.titleSuffix;
  const headers = LISTS_CFG.HEADERS_TRANSPORT;
  const numCols = headers.length;
  const colors  = LISTS_CFG.COLORS.TRANSPORT;

  LISTS_CFG.WIDTHS_TRANSPORT.forEach((w, i) => { if (i < numCols) sh.setColumnWidth(i + 1, w); });
  sh.setHiddenGridlines(true);

  let row = 1;
  row = _writeTitleRow_(sh, row, numCols, title, colors);
  row = _writeHeaderRow_(sh, row, numCols, headers, colors);

  let totalGroups = 0;

  tripsData.sortedDates.forEach(dateKey => {
    const dayData = tripsData.byDate[dateKey];

    // Separatore giorno
    row = _writeDaySeparator_(sh, row, numCols, dayData.dateFormatted, colors);

    // Dati del giorno passati come oggetto compatibile con le funzioni esistenti
    const dayTripsData = { rows: dayData.rows, hdr: tripsData.hdr };

    const mainGroups   = _filterAndGroupRows_("MAIN",   "STANDARD", dayTripsData);
    const secondGroups = _filterAndGroupRows_("SECOND", "STANDARD", dayTripsData);

    row = _writeSectionBlock_(sh, row, numCols, "MAIN UNIT",   mainGroups,   dayTripsData, "TRANSPORT");
    row = _writeSectionBlock_(sh, row, numCols, "SECOND UNIT", secondGroups, dayTripsData, "TRANSPORT");

    totalGroups += mainGroups.length + secondGroups.length;
  });

  sh.setFrozenRows(2);
  Logger.log("Transport_List: " + totalGroups + " groups across " + tripsData.sortedDates.length + " days");
}

/* =========================================
   TRAVEL LIST
   ========================================= */

function _buildTravelList_(tripsData) {
  const ss = SpreadsheetApp.getActive();
  let sh   = ss.getSheetByName(CFG.SHEETS.TRAVEL_LIST);
  if (!sh) sh = ss.insertSheet(CFG.SHEETS.TRAVEL_LIST);

  _clearSheet_(sh);

  const title   = "TRANSPORT LIST — TRAVEL — " + tripsData.titleSuffix;
  const headers = LISTS_CFG.HEADERS_TRAVEL;
  const numCols = headers.length;
  const colors  = LISTS_CFG.COLORS.TRAVEL;

  LISTS_CFG.WIDTHS_TRAVEL.forEach((w, i) => { if (i < numCols) sh.setColumnWidth(i + 1, w); });
  sh.setHiddenGridlines(true);

  let row = 1;
  row = _writeTitleRow_(sh, row, numCols, title, colors);
  row = _writeHeaderRow_(sh, row, numCols, headers, colors);

  let totalGroups = 0;

  tripsData.sortedDates.forEach(dateKey => {
    const dayData      = tripsData.byDate[dateKey];
    const dayTripsData = { rows: dayData.rows, hdr: tripsData.hdr };

    row = _writeDaySeparator_(sh, row, numCols, dayData.dateFormatted, colors);

    const depGroups = _filterAndGroupRows_(null, "DEPARTURE", dayTripsData);
    const arrGroups = _filterAndGroupRows_(null, "ARRIVAL",   dayTripsData);

    row = _writeSectionBlock_(sh, row, numCols, "DEPARTURES", depGroups, dayTripsData, "TRAVEL");
    row = _writeSectionBlock_(sh, row, numCols, "ARRIVALS",   arrGroups, dayTripsData, "TRAVEL");

    totalGroups += depGroups.length + arrGroups.length;
  });

  sh.setFrozenRows(2);
  Logger.log("TRAVEL_AIRPORT_List: " + totalGroups + " groups across " + tripsData.sortedDates.length + " days");
}

/* =========================================
   NASCONDI SECOND_LIST
   ========================================= */

function _hideSecondList_() {
  const sh = SpreadsheetApp.getActive().getSheetByName(CFG.SHEETS.SECOND_LIST);
  if (sh) sh.hideSheet();
}

/* =========================================
   FILTRO E RAGGRUPPAMENTO PER TRIP_ID
   ========================================= */

function _filterAndGroupRows_(unit, transferClass, tripsData) {
  const { rows, hdr } = tripsData;

  const unitCol = hdr["Unit"]                 ? hdr["Unit"]                 - 1 : -1;
  const tcCol   = hdr["Transfer_Class(auto)"] ? hdr["Transfer_Class(auto)"] - 1 : -1;
  const tidCol  = hdr["Trip_ID"]              ? hdr["Trip_ID"]              - 1 : -1;
  const tcUpper = transferClass.toUpperCase();

  const filtered = rows.filter(r => {
    const rowUnit = unitCol >= 0 ? String(r[unitCol] || "").trim().toUpperCase() : "";
    const rowTc   = tcCol   >= 0 ? String(r[tcCol]   || "").trim().toUpperCase() : "";
    if (unit && rowUnit !== unit) return false;
    if (rowTc !== tcUpper) return false;
    return true;
  });

  filtered.sort((a, b) =>
    _getTimeMinutes_(a, hdr, "Pickup_Time") - _getTimeMinutes_(b, hdr, "Pickup_Time")
  );

  const groups   = [];
  const groupMap = {};

  filtered.forEach(r => {
    const tid = tidCol >= 0 ? String(r[tidCol] || "").trim() : "";
    const key = tid || ("__" + groups.length);
    if (!groupMap[key]) {
      const g = { tripId: tid, transferClass: tcUpper, rows: [] };
      groups.push(g);
      groupMap[key] = g;
    }
    groupMap[key].rows.push(r);
  });

  return groups;
}

/* =========================================
   SEZIONE (MAIN / SECOND / DEPARTURES / ARRIVALS)
   ========================================= */

function _writeSectionBlock_(sh, startRow, numCols, label, groups, tripsData, listType) {
  let row = startRow;
  if (!groups.length) return row;

  const bg = listType === "TRAVEL"
    ? LISTS_CFG.COLORS.GROUP_T.bg
    : LISTS_CFG.COLORS.SECTION.bg;
  const fg = listType === "TRAVEL"
    ? LISTS_CFG.COLORS.GROUP_T.fg
    : LISTS_CFG.COLORS.SECTION.fg;

  sh.getRange(row, 1, 1, numCols).merge()
    .setValue("▌  " + label)
    .setBackground(bg).setFontColor(fg)
    .setFontWeight("bold").setFontSize(11)
    .setVerticalAlignment("middle").setHorizontalAlignment("left");
  sh.setRowHeight(row, 22);
  row++;

  groups.forEach(group => {
    row = _writeGroupBlock_(sh, row, numCols, group, tripsData, listType);
  });

  // Riga di separazione tra sezioni
  sh.getRange(row, 1, 1, numCols).setBackground("#e2e8f0");
  sh.setRowHeight(row, 6);
  row++;

  return row;
}

/* =========================================
   GRUPPO (Trip_ID)
   ========================================= */

function _writeGroupBlock_(sh, startRow, numCols, group, tripsData, listType) {
  const { hdr } = tripsData;
  let row       = startRow;
  const isMulti = group.rows.length > 1;
  const tc      = group.transferClass;

  // Intestazione gruppo solo se multi-fermata
  if (isMulti) {
    row = _writeGroupHeader_(sh, row, numCols, group, hdr, listType);
  }

  // Per ARRIVAL multi-dropoff: riga hub in testa
  if (isMulti && tc === "ARRIVAL" && listType === "TRAVEL") {
    row = _writeHubHeaderRow_(sh, row, numCols, group, hdr);
  }

  // Righe dati
  group.rows.forEach((r, idx) => {
    if (listType === "TRAVEL") {
      row = _writeTravelDataRow_(sh, row, numCols, r, hdr, tc, isMulti, idx);
    } else {
      row = _writeTransportDataRow_(sh, row, numCols, r, hdr, isMulti, idx);
    }
  });

  // Per DEPARTURE multi-pickup: riga hub in coda
  if (isMulti && tc === "DEPARTURE" && listType === "TRAVEL") {
    row = _writeHubFooterRow_(sh, row, numCols, group, hdr);
  }

  // Separatore sottile tra gruppi
  sh.getRange(row, 1, 1, numCols)
    .setBackground(listType === "TRAVEL" ? LISTS_CFG.COLORS.SEP_T : LISTS_CFG.COLORS.SEP);
  sh.setRowHeight(row, 2);
  row++;

  return row;
}

/* =========================================
   INTESTAZIONE GRUPPO
   ========================================= */

function _writeGroupHeader_(sh, startRow, numCols, group, hdr, listType) {
  const r0     = group.rows[0];
  const tc     = group.transferClass;
  const sign   = hdr["Sign_Code(auto)"]   ? String(r0[hdr["Sign_Code(auto)"]   - 1] || "").trim() : "";
  const driver = hdr["Driver_Name(auto)"] ? String(r0[hdr["Driver_Name(auto)"] - 1] || "").trim() : "";

  const parts = [];
  if (sign)   parts.push(sign);
  if (driver) parts.push(driver);

  // Etichetta tipo servizio
  if (tc === "DEPARTURE") {
    parts.push("Multi-Pickup");
  } else if (tc === "ARRIVAL") {
    parts.push("Multi-Dropoff");
  } else {
    // STANDARD — determina se multi-pickup o multi-dropoff
    const pickups  = new Set(group.rows.map(r => hdr["Pickup_ID"]  ? String(r[hdr["Pickup_ID"]  - 1] || "").trim() : "").filter(Boolean));
    const dropoffs = new Set(group.rows.map(r => hdr["Dropoff_ID"] ? String(r[hdr["Dropoff_ID"] - 1] || "").trim() : "").filter(Boolean));
    if (pickups.size > 1)  parts.push("Multi-Pickup");
    else                   parts.push("Multi-Dropoff");
  }

  if (tc === "DEPARTURE" || tc === "ARRIVAL") {
    // Raccoglie tutti i voli/orari unici tra le righe del gruppo
    const flightMap = {};
    group.rows.forEach(r => {
      const fl  = hdr["Flight/Train_No"] ? String(r[hdr["Flight/Train_No"] - 1] || "").trim() : "";
      const dep = hdr["Dept_Time"]       ? formatTimeLoose_(r[hdr["Dept_Time"] - 1]) : "";
      const arr = hdr["Arr_Time"]        ? formatTimeLoose_(r[hdr["Arr_Time"]  - 1]) : "";
      const tm  = hdr["Terminal/Gate"]   ? String(r[hdr["Terminal/Gate"]      - 1] || "").trim() : "";
      if (!fl) return;
      const key = fl + "|" + (tc === "DEPARTURE" ? dep : arr);
      if (!flightMap[key]) {
        flightMap[key] = {
          flight:   fl,
          deptTime: dep,
          arrTime:  arr,
          terminal: tm,
          sortMin:  toTimeMinutes_(tc === "DEPARTURE"
            ? (hdr["Dept_Time"] ? r[hdr["Dept_Time"] - 1] : null)
            : (hdr["Arr_Time"]  ? r[hdr["Arr_Time"]  - 1] : null)) || 9999
        };
      }
    });

    const flights = Object.values(flightMap);

    if (flights.length > 1 && tc === "DEPARTURE") {
      flights.sort((a, b) => a.sortMin - b.sortMin);
      const priority = flights[0];
      parts.push("Priority: " + priority.flight + " dep " + priority.deptTime);
    } else if (flights.length === 1) {
      const f = flights[0];
      if (tc === "DEPARTURE") {
        parts.push(f.flight);
        if (f.deptTime) parts.push("dep " + f.deptTime);
      } else {
        parts.push(f.flight);
        if (f.arrTime) parts.push("arr " + f.arrTime);
      }
      if (f.terminal) parts.push(f.terminal);
    }
  }

  const colors = listType === "TRAVEL" ? LISTS_CFG.COLORS.GROUP_T : LISTS_CFG.COLORS.GROUP;

  sh.getRange(startRow, 1, 1, numCols).merge()
    .setValue(parts.filter(Boolean).join("  ·  "))
    .setBackground(colors.bg).setFontColor(colors.fg)
    .setFontSize(10).setFontWeight("normal")
    .setVerticalAlignment("middle").setHorizontalAlignment("left");
  _setBorders_(sh.getRange(startRow, 1, 1, numCols), "group");
  sh.setRowHeight(startRow, 18);

  return startRow + 1;
}

/* =========================================
   RIGA HUB INIZIALE (ARRIVAL)
   ========================================= */

function _writeHubHeaderRow_(sh, startRow, numCols, group, hdr) {
  const r0      = group.rows[0];
  const pickup  = hdr["Pickup"]          ? String(r0[hdr["Pickup"]          - 1] || "").trim() : "";
  const meetPt  = hdr["Meeting_Point(auto)"] ? String(r0[hdr["Meeting_Point(auto)"] - 1] || "").trim() : "";
  const puTime  = _formatTimeSimple_(r0, hdr, "Pickup_Time");
  const call    = _formatTimeSimple_(r0, hdr, "Call");

  const label = pickup + (meetPt ? "  —  " + meetPt : "") + "  →  multi-dropoff ↓";

  sh.getRange(startRow, 1, 1, numCols).merge()
    .setValue(label)
    .setBackground(LISTS_CFG.COLORS.ARR_BG)
    .setFontColor("#065f46")
    .setFontSize(10).setFontWeight("bold")
    .setVerticalAlignment("middle").setHorizontalAlignment("left");
  _setBorders_(sh.getRange(startRow, 1, 1, numCols), "hub");
  sh.setRowHeight(startRow, 18);

  return startRow + 1;
}

/* =========================================
   RIGA HUB FINALE (DEPARTURE)
   ========================================= */

function _writeHubFooterRow_(sh, startRow, numCols, group, hdr) {
  const r0     = group.rows[0];
  const dropoff= hdr["Dropoff"]        ? String(r0[hdr["Dropoff"]        - 1] || "").trim() : "";
  const term   = hdr["Terminal/Gate"]  ? String(r0[hdr["Terminal/Gate"]  - 1] || "").trim() : "";
  const label  = "→  " + dropoff + (term ? "  —  " + term : "");

  sh.getRange(startRow, 1, 1, numCols).merge()
    .setValue(label)
    .setBackground(LISTS_CFG.COLORS.HUB.bg)
    .setFontColor(LISTS_CFG.COLORS.HUB.fg)
    .setFontSize(10).setFontStyle("italic")
    .setVerticalAlignment("middle");
  _setBorders_(sh.getRange(startRow, 1, 1, numCols), "hub");
  sh.setRowHeight(startRow, 16);

  return startRow + 1;
}

/* =========================================
   RIGA DATI TRANSPORT LIST
   ========================================= */

function _writeTransportDataRow_(sh, startRow, numCols, r, hdr, isMulti, rowIdx) {
  const bg      = rowIdx % 2 === 0 ? LISTS_CFG.COLORS.EVEN : LISTS_CFG.COLORS.ODD;
  const puTime  = _formatTimeMidnight_(r, hdr);
  const call    = _formatTimeSimple_(r, hdr, "Call");
  const pickup  = hdr["Pickup"]               ? String(r[hdr["Pickup"]               - 1] || "").trim() : "";
  const meetPt  = hdr["Meeting_Point(auto)"]  ? String(r[hdr["Meeting_Point(auto)"]  - 1] || "").trim() : "";
  const dropoff = hdr["Dropoff"]              ? String(r[hdr["Dropoff"]              - 1] || "").trim() : "";
  const sign    = hdr["Sign_Code(auto)"]      ? String(r[hdr["Sign_Code(auto)"]      - 1] || "").trim() : "";
  const driver  = hdr["Driver_Name(auto)"]    ? String(r[hdr["Driver_Name(auto)"]    - 1] || "").trim() : "";
  const paxCnt  = hdr["Pax_Count(auto)"]      ? (r[hdr["Pax_Count(auto)"] - 1] || "") : "";
  const paxList = hdr["Passenger_List(auto)"] ? String(r[hdr["Passenger_List(auto)"] - 1] || "").trim() : "";
  const service = hdr["Service_Type"]         ? String(r[hdr["Service_Type"]         - 1] || "").trim() : "";
  const notes   = hdr["Notes"]                ? String(r[hdr["Notes"]                - 1] || "").trim() : "";

  const dropoffDisplay = dropoff;

  const rng = sh.getRange(startRow, 1, 1, numCols);
  rng.setValues([[puTime, call, pickup, dropoffDisplay, meetPt, sign, driver, paxCnt || "", paxList, service, notes]])
    .setBackground(bg).setVerticalAlignment("middle").setWrap(true);
  _setBorders_(rng, "data");
  sh.getRange(startRow, 8).setHorizontalAlignment("center");
  sh.setRowHeight(startRow, 20);

  return startRow + 1;
}

/* =========================================
   RIGA DATI TRAVEL LIST
   ========================================= */

function _writeTravelDataRow_(sh, startRow, numCols, r, hdr, tc, isMulti, rowIdx) {
  const bg = tc === "DEPARTURE" ? LISTS_CFG.COLORS.DEP_BG
           : tc === "ARRIVAL"   ? LISTS_CFG.COLORS.ARR_BG
           : (rowIdx % 2 === 0  ? LISTS_CFG.COLORS.EVEN : LISTS_CFG.COLORS.ODD);

  const puTime   = _formatTimeMidnight_(r, hdr);
  const call     = _formatTimeSimple_(r, hdr, "Call");
  const typeLabel= isMulti ? "" : tc;
  const pickup   = hdr["Pickup"]               ? String(r[hdr["Pickup"]               - 1] || "").trim() : "";
  const dropoff  = hdr["Dropoff"]              ? String(r[hdr["Dropoff"]              - 1] || "").trim() : "";
  const flight   = hdr["Flight/Train_No"]      ? String(r[hdr["Flight/Train_No"]      - 1] || "").trim() : "";
  const deptTime = hdr["Dept_Time"]            ? formatTimeLoose_(r[hdr["Dept_Time"]  - 1]) : "";
  const arrTime  = hdr["Arr_Time"]             ? formatTimeLoose_(r[hdr["Arr_Time"]   - 1]) : "";
  const term     = hdr["Terminal/Gate"]        ? String(r[hdr["Terminal/Gate"]        - 1] || "").trim() : "";
  const meetPt   = hdr["Meeting_Point(auto)"]  ? String(r[hdr["Meeting_Point(auto)"]  - 1] || "").trim() : "";
  const sign     = hdr["Sign_Code(auto)"]      ? String(r[hdr["Sign_Code(auto)"]      - 1] || "").trim() : "";
  const driver   = hdr["Driver_Name(auto)"]    ? String(r[hdr["Driver_Name(auto)"]    - 1] || "").trim() : "";
  const paxCnt   = hdr["Pax_Count(auto)"]      ? (r[hdr["Pax_Count(auto)"] - 1] || "") : "";
  const paxList  = hdr["Passenger_List(auto)"] ? String(r[hdr["Passenger_List(auto)"] - 1] || "").trim() : "";
  const service  = hdr["Service_Type"]         ? String(r[hdr["Service_Type"]         - 1] || "").trim() : "";
  const notes    = hdr["Notes"]                ? String(r[hdr["Notes"]                - 1] || "").trim() : "";

  // Nessuna freccia — l'intestazione gruppo e i separatori danno già il contesto
  const pickupDisplay  = pickup;
  const dropoffDisplay = dropoff;

  const rng = sh.getRange(startRow, 1, 1, numCols);
  rng.setValues([[puTime, call, typeLabel, pickupDisplay, dropoffDisplay,
                  flight, deptTime, arrTime, term, meetPt,
                  sign, driver, paxCnt || "", paxList, service, notes]])
    .setBackground(bg).setVerticalAlignment("middle").setWrap(true);
  _setBorders_(rng, "data");
  sh.getRange(startRow, 13).setHorizontalAlignment("center");
  sh.setRowHeight(startRow, 20);

  return startRow + 1;
}

/* =========================================
   TITOLO E HEADER ROW
   ========================================= */

function _writeTitleRow_(sh, startRow, numCols, title, colors) {
  const rng = sh.getRange(startRow, 1, 1, numCols);
  rng.merge()
    .setValue(title)
    .setBackground(colors.bg).setFontColor(colors.fg)
    .setFontSize(14).setFontWeight("bold")
    .setHorizontalAlignment("center").setVerticalAlignment("middle");
  sh.setRowHeight(startRow, 32);
  return startRow + 1;
}

function _writeHeaderRow_(sh, startRow, numCols, headers, colors) {
  const rng = sh.getRange(startRow, 1, 1, numCols);
  rng.setValues([headers])
    .setBackground(colors.bg).setFontColor(colors.fg)
    .setFontWeight("bold").setFontSize(10)
    .setHorizontalAlignment("center").setVerticalAlignment("middle");
  const borderStyle = colors.bg === LISTS_CFG.COLORS.TRAVEL.bg ? "header_travel" : "header";
  _setBorders_(rng, borderStyle);
  sh.setRowHeight(startRow, 20);
  return startRow + 1;
}

/**
 * Scrive una riga separatrice di data.
 * Visibile solo quando ci sono più giorni nel range.
 */
function _writeDaySeparator_(sh, startRow, numCols, dateFormatted, colors) {
  const rng = sh.getRange(startRow, 1, 1, numCols);
  rng.merge()
    .setValue("━━  " + dateFormatted + "  ━━")
    .setBackground(colors.bg)
    .setFontColor(colors.fg)
    .setFontSize(11)
    .setFontWeight("bold")
    .setHorizontalAlignment("center")
    .setVerticalAlignment("middle");
  sh.setRowHeight(startRow, 24);
  return startRow + 1;
}

/* =========================================
   UTILITY ORARI
   ========================================= */

/**
 * Formatta Pickup_Time con gestione mezzanotte.
 * Se End_DT è giorno diverso da Date → aggiunge
 * "→ dd/MM HH:mm" sulla stessa cella (a capo).
 */
function _formatTimeMidnight_(r, hdr) {
  const puVal   = hdr["Pickup_Time"] ? r[hdr["Pickup_Time"] - 1] : null;
  const endVal  = hdr["End_DT"]      ? r[hdr["End_DT"]      - 1] : null;
  const dateVal = hdr["Date"]        ? r[hdr["Date"]         - 1] : null;

  const puMin = toTimeMinutes_(puVal);
  if (puMin === null) return "";

  const puStr = String(Math.floor(puMin / 60)).padStart(2, "0") + ":" +
                String(puMin % 60).padStart(2, "0");

  if (endVal && dateVal) {
    const endDate  = toDateSafe_(endVal);
    const tripDate = toDateSafe_(dateVal);
    if (endDate && tripDate && !sameDay_(endDate, tripDate)) {
      return puStr + "\n→ " + formatDateTime_(endDate);
    }
  }

  return puStr;
}

function _formatTimeSimple_(r, hdr, colName) {
  const val = hdr[colName] ? r[hdr[colName] - 1] : null;
  if (val === null || val === undefined) return "";
  return formatTimeLoose_(val);
}

function _getTimeMinutes_(r, hdr, colName) {
  const val = hdr[colName] ? r[hdr[colName] - 1] : null;
  const m   = toTimeMinutes_(val);
  return m !== null ? m : 9999;
}

/* =========================================
   PULIZIA FOGLIO
   ========================================= */

function _clearSheet_(sh) {
  const lastRow = sh.getLastRow();
  const lastCol = Math.max(sh.getLastColumn(), 1);
  if (lastRow > 0) sh.getRange(1, 1, lastRow, lastCol).clearContent().clearFormat();
  sh.clearConditionalFormatRules();
  sh.setHiddenGridlines(true);
  sh.setFrozenRows(0);
  sh.setFrozenColumns(0);
}

/* =========================================
   BORDI
   ========================================= */

/**
 * Applica bordi a una riga.
 * @param {Range} rng        Range della riga
 * @param {string} style     "data" | "header" | "group" | "hub"
 */
function _setBorders_(rng, style) {
  const solid  = SpreadsheetApp.BorderStyle.SOLID;
  const medium = SpreadsheetApp.BorderStyle.SOLID_MEDIUM;

  switch (style) {
    case "header":
      // Bordo esterno medio, bordi interni verticali sottili bianchi
      rng.setBorder(true, true, true, true, true, false,
        "#ffffff", solid);
      rng.setBorder(true, true, true, true, false, false,
        "#1a3a5c", medium);
      break;
    case "header_travel":
      rng.setBorder(true, true, true, true, true, false,
        "#ffffff", solid);
      rng.setBorder(true, true, true, true, false, false,
        "#7b2d8b", medium);
      break;
    case "group":
      // Bordo esterno sottile scuro, nessun bordo verticale interno
      rng.setBorder(true, true, true, true, false, false,
        "#94a3b8", solid);
      break;
    case "hub":
      rng.setBorder(true, true, true, true, false, false,
        "#cbd5e1", solid);
      break;
    case "data":
    default:
      // Bordi orizzontali e verticali sottili grigi
      rng.setBorder(true, true, true, true, true, true,
        "#cbd5e1", solid);
      break;
  }
}

/* =========================================
   EXPORT PDF → GOOGLE DRIVE
   ========================================= */

/**
 * Genera le liste aggiornate, esporta i PDF su Google Drive
 * nella cartella CAPTAIN/Lists/ e mostra il link alla cartella.
 *
 * Struttura cartelle Drive:
 *   CAPTAIN/
 *     Lists/
 *       Transport_List_14-03-2026.pdf
 *       TRAVEL_AIRPORT_List_14-03-2026.pdf
 */
function tsExportAndEmail() {
  try {
    const ss = SpreadsheetApp.getActive();
    ss.toast("Generating lists and exporting PDFs...", "Captain");

    // 1. Genera le liste aggiornate
    tsGenerateLists();

    // 2. Ottieni/crea cartella Drive
    const folder = _getOrCreateDriveFolder_();

    // 3. Esporta i PDF
    const dateStr    = formatDate_(new Date()).replace(/\//g, "-");
    const sheetNames = [CFG.SHEETS.MAIN_LIST, CFG.SHEETS.TRAVEL_LIST];
    const exported   = [];

    sheetNames.forEach(sheetName => {
      const sh = ss.getSheetByName(sheetName);
      if (!sh) return;

      const fileName = sheetName + "_" + dateStr + ".pdf";
      const pdfBlob  = _exportSheetAsPdf_(ss, sh, fileName);

      // Rimuovi versioni precedenti con lo stesso nome
      const existing = folder.getFilesByName(fileName);
      while (existing.hasNext()) existing.next().setTrashed(true);

      folder.createFile(pdfBlob);
      exported.push(fileName);
    });

    const folderUrl = folder.getUrl();

    TS_log_("INFO", "tsExportAndEmail", {
      message: "PDFs exported to Drive: " + exported.join(", ")
    });

    // 4. Mostra alert con link
    SpreadsheetApp.getUi().alert(
      "PDF Export — " + dateStr,
      "PDFs saved to Google Drive:\n\n" +
      exported.map(f => "• " + f).join("\n") +
      "\n\nFolder: " + folderUrl +
      "\n\nOpen Drive to share or download.",
      SpreadsheetApp.getUi().ButtonSet.OK
    );

  } catch (err) {
    TS_log_("ERROR", "tsExportAndEmail", { message: err.message });
    SpreadsheetApp.getUi().alert("Error exporting PDFs:\n" + err.message);
  }
}

/**
 * Ottieni o crea la cartella CAPTAIN/Lists/ su Google Drive.
 * Crea le cartelle intermedie se non esistono.
 */
function _getOrCreateDriveFolder_() {
  const root        = DriveApp.getRootFolder();
  const captainName = CFG.PRODUCTION_NAME;
  const listsName   = "Lists";

  // Cartella CAPTAIN
  let captainFolder;
  const captainIt = root.getFoldersByName(captainName);
  if (captainIt.hasNext()) {
    captainFolder = captainIt.next();
  } else {
    captainFolder = root.createFolder(captainName);
  }

  // Cartella Lists dentro CAPTAIN
  let listsFolder;
  const listsIt = captainFolder.getFoldersByName(listsName);
  if (listsIt.hasNext()) {
    listsFolder = listsIt.next();
  } else {
    listsFolder = captainFolder.createFolder(listsName);
  }

  return listsFolder;
}

/**
 * Esporta un singolo foglio come PDF blob.
 */
function _exportSheetAsPdf_(ss, sh, fileName) {
  const pdfUrl = "https://docs.google.com/spreadsheets/d/" + ss.getId() +
    "/export?format=pdf" +
    "&size=A4" +
    "&portrait=false" +
    "&fitw=true" +
    "&sheetnames=false" +
    "&printtitle=false" +
    "&pagenumbers=false" +
    "&gridlines=false" +
    "&fzr=true" +
    "&gid=" + sh.getSheetId();

  return UrlFetchApp.fetch(pdfUrl, {
    headers: { Authorization: "Bearer " + ScriptApp.getOAuthToken() }
  }).getBlob().setName(fileName);
}

/* =========================================
   FLEET REPORTS — helpers (invariati)
   ========================================= */

function TS_getTripsDataSheet_() {
  const sh = SpreadsheetApp.getActive().getSheetByName(CFG.SHEETS.TRIPS_HISTORY);
  if (!sh) throw new Error("Trips_History sheet not found.");
  return sh;
}

function TS_toDateSafe_(v)                  { return toDateSafe_(v); }
function TS_requireHeaders_(h, r, c)        { return requireHeaders_(h, r, c); }
function TS_isHubId_(id)                    { return isHubId_(id); }
function TS_weeklyIsHubId_(id)              { return isHubId_(id); }
function TS_isHubIdFleet_(id)               { return isHubId_(id); }
function TS_dayKeyFleet_(d)                 { return dayKey_(d); }
function TS_weeklyDayKey_(d)               { return dayKey_(d); }
function TS_formatTimeFleet_(d)             { return isValidDate_(d) ? formatTime_(d) : "—"; }
function TS_formatMinutesFleet_(m)          { return formatMinutes_(m); }
function TS_weeklyFormatMinutes_(m)         { return formatMinutes_(m); }
function TS_countDistinctFleet_(arr)        { return Array.from(new Set((arr || []).filter(Boolean))).length; }

function TS_getDurationMinutes_(s, e) {
  const sd = toDateSafe_(s), ed = toDateSafe_(e);
  if (!sd || !ed) return 0;
  return Math.max(0, Math.round((ed.getTime() - sd.getTime()) / 60000));
}

function TS_getDriverName_(row, hdr, fallback) {
  return (hdr["Driver_Name(auto)"] ? String(row[hdr["Driver_Name(auto)"] - 1] || "").trim() : "") ||
         (hdr["Driver_Name"]       ? String(row[hdr["Driver_Name"]       - 1] || "").trim() : "") ||
         fallback;
}

function TS_getVehicleId_(row, hdr, fallback) {
  return hdr["Vehicle_ID"] ? String(row[hdr["Vehicle_ID"] - 1] || "").trim() || fallback : fallback;
}

function TS_getPickupId_(row, hdr)  { return hdr["Pickup_ID"]  ? String(row[hdr["Pickup_ID"]  - 1] || "").trim().toUpperCase() : ""; }
function TS_getDropoffId_(row, hdr) { return hdr["Dropoff_ID"] ? String(row[hdr["Dropoff_ID"] - 1] || "").trim().toUpperCase() : ""; }
function TS_getTripId_(row, hdr)    { return hdr["Trip_ID"]    ? String(row[hdr["Trip_ID"]    - 1] || "").trim() : ""; }
function TS_getTripDateRaw_(row, hdr)  { return hdr["Date"]     ? row[hdr["Date"]     - 1] : ""; }
function TS_getStartDt_(row, hdr)      { return hdr["Start_DT"] ? row[hdr["Start_DT"] - 1] : ""; }
function TS_getEndDt_(row, hdr)        { return hdr["End_DT"]   ? row[hdr["End_DT"]   - 1] : ""; }

function TS_weeklyNormalizeDate_(value) {
  const d = toDateSafe_(value);
  if (!d) return null;
  const x = new Date(d); x.setHours(0, 0, 0, 0);
  return x;
}

function TS_weeklyFormatDateTime_(d) {
  return isValidDate_(d)
    ? Utilities.formatDate(d, Session.getScriptTimeZone(), "dd/MM HH:mm")
    : "—";
}

function TS_sortFleetRows_(a, b) {
  if (b.tripCount    !== a.tripCount)    return b.tripCount    - a.tripCount;
  if (b.totalMinutes !== a.totalMinutes) return b.totalMinutes - a.totalMinutes;
  return String(a.vehicleId || "").localeCompare(String(b.vehicleId || ""));
}

function TS_sortFleetWeeklyRows_(a, b) {
  if (b.totalMinutes !== a.totalMinutes) return b.totalMinutes - a.totalMinutes;
  if (b.totalTrips   !== a.totalTrips)   return b.totalTrips   - a.totalTrips;
  return String(a.vehicleId || "").localeCompare(String(b.vehicleId || ""));
}
