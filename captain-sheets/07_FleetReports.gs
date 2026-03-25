/**
 * 07_FleetReports.gs
 * Fleet Reports — Daily, Weekly, Hub Weekly
 * Legge da Trips_History (non da Trips) per lo storico.
 * Captain — Transport Management System
 *
 * NOTE:
 * - getHeaderMap_(), toDateSafe_(), isHubId_(), dayKey_(),
 *   formatMinutes_(), formatTime_(), sameDay_(),
 *   requireHeaders_(), getRealLastRow_() sono in 00_Config.gs
 * - Gli helper TS_getTripsDataSheet_(), TS_getDurationMinutes_(),
 *   TS_getDriverName_(), ecc. sono in 05_Lists.gs
 * - I trigger Fleet_Report_Daily/Weekly B2 sono in 06_Triggers.gs
 */

function openFleetDailyReportForActiveTripDate() {
  const ss = SpreadsheetApp.getActive();
  const tripsSh = ss.getSheetByName("Trips");
  if (!tripsSh) throw new Error("Trips sheet not found.");

  const row = tripsSh.getActiveCell().getRow();
  if (row <= 1) throw new Error("Select a valid trip row in Trips.");

  const hdr = getHeaderMap_(tripsSh);
  const dateCol = hdr["Date"];
  if (!dateCol) throw new Error("Trips missing header: Date");

  const tripDate = tripsSh.getRange(row, dateCol).getValue();
  if (!(tripDate instanceof Date) || isNaN(tripDate)) {
    throw new Error("Selected row has no valid Date.");
  }

  buildFleetDailyReport_(tripDate);
}

function openFleetDailyReportForToday() {
  buildFleetDailyReport_(new Date());
}

function tsBuildFleetDailyReportForPromptDate() {
  const ui = SpreadsheetApp.getUi();
  const res = ui.prompt(
    "Fleet Daily Report",
    "Enter date as DD/MM/YYYY",
    ui.ButtonSet.OK_CANCEL
  );

  if (res.getSelectedButton() !== ui.Button.OK) return;

  const txt = String(res.getResponseText() || "").trim();
  if (!txt) return;

  const m = txt.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) throw new Error("Use date format DD/MM/YYYY");

  const d = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
  if (!(d instanceof Date) || isNaN(d)) throw new Error("Invalid date.");

  buildFleetDailyReport_(d);
}

function refreshFleetDailyReportFromSheetDate() {
  const ss = SpreadsheetApp.getActive();
  const sh = ss.getSheetByName("Fleet_Report_Daily");
  if (!sh) throw new Error("Fleet_Report_Daily sheet not found.");

  const targetDate = sh.getRange("B2").getValue();
  if (!(targetDate instanceof Date) || isNaN(targetDate)) {
    throw new Error("B2 must contain a valid date.");
  }

  buildFleetDailyReport_(targetDate);
}

/* =========================================
   FLEET DAILY
========================================= */

function buildFleetDailyReport_(targetDate) {
  const ss = SpreadsheetApp.getActive();
  const reportName = "Fleet_Report_Daily";
  let sh = ss.getSheetByName(reportName);

  if (!sh) {
    sh = ss.insertSheet(reportName);
  } else {
    const maxRows = sh.getMaxRows();
    const maxCols = sh.getMaxColumns();

    if (maxRows > 3 && maxCols > 0) {
      sh.getRange(4, 1, maxRows - 3, maxCols).clearContent().clearFormat();
    }

    sh.clearConditionalFormatRules();
  }

 const tripsSh = TS_getTripsDataSheet_();

  const hdr = getHeaderMap_(tripsSh);
  TS_requireHeaders_(hdr, ["Date", "Trip_ID", "Pickup_ID", "Dropoff_ID", "Start_DT", "End_DT"], "Trips");

  const data = tripsSh.getLastRow() >= 2
    ? tripsSh.getRange(2, 1, tripsSh.getLastRow() - 1, tripsSh.getLastColumn()).getValues()
    : [];

  const cleanDate = new Date(targetDate);
  cleanDate.setHours(0, 0, 0, 0);

  const reportData = TS_buildFleetDailyData_(data, hdr, cleanDate);
  TS_renderFleetDailyReport_(sh, reportData, cleanDate);

  SpreadsheetApp.setActiveSheet(sh);
}

function TS_buildFleetDailyData_(rows, hdr, targetDate) {
  const grouped = {};
  const dayKey = TS_dayKeyFleet_(targetDate);

  rows.forEach(r => {
  const rowDate = toDateSafe_(TS_getTripDateRaw_(r, hdr));
  if (!rowDate) return;
  if (TS_dayKeyFleet_(rowDate) !== dayKey) return;

    const tripId = TS_getTripId_(r, hdr);
    const pickupId = TS_getPickupId_(r, hdr);
    const dropoffId = TS_getDropoffId_(r, hdr);

    const vehicleId = TS_getVehicleId_(r, hdr, "");
    const driverName = TS_getDriverName_(r, hdr, "—");

    const unit = hdr["Unit"] ? String(r[hdr["Unit"] - 1] || "").trim() : "";
    const serviceType = hdr["Service_Type"] ? String(r[hdr["Service_Type"] - 1] || "").trim() : "";
    const startDt = TS_getStartDt_(r, hdr);
    const endDt = TS_getEndDt_(r, hdr);

    if (!tripId) return;
    if (!vehicleId && driverName === "—") return;

    const pickupIsHub = TS_isHubIdFleet_(pickupId);
    const dropoffIsHub = TS_isHubIdFleet_(dropoffId);
    const isHub = pickupIsHub || dropoffIsHub;

    const direction = pickupIsHub && !dropoffIsHub
      ? "IN"
      : (!pickupIsHub && dropoffIsHub ? "OUT" : "");

    const bucket = isHub ? "HUB" : "LOCAL";
    const groupKey = [bucket, vehicleId || "NO_VEHICLE", driverName || "—"].join("||");
    const uniqueTripKey = [tripId, bucket].join("||");

    if (!grouped[groupKey]) {
      grouped[groupKey] = {
        bucket: bucket,
        vehicleId: vehicleId || "—",
        driverName: driverName || "—",
        tripKeys: {},
        tripCount: 0,
        hubTripCount: 0,
        inCount: 0,
        outCount: 0,
        totalMinutes: 0,
        firstStart: null,
        lastEnd: null,
        units: {},
        serviceTypes: {},
        tripIds: {}
      };
    }

    const g = grouped[groupKey];

    if (!g.tripKeys[uniqueTripKey]) {
      g.tripKeys[uniqueTripKey] = true;
      g.tripCount++;

      if (bucket === "HUB") {
        g.hubTripCount++;
        if (direction === "IN") g.inCount++;
        if (direction === "OUT") g.outCount++;
      }

      g.tripIds[tripId] = true;
    }

    if (unit) g.units[unit] = true;
    if (serviceType) g.serviceTypes[serviceType] = true;

    const startSafe = toDateSafe_(startDt);
const endSafe = toDateSafe_(endDt);

if (startSafe) {
  if (!g.firstStart || startSafe.getTime() < g.firstStart.getTime()) {
    g.firstStart = startSafe;
  }
}

if (endSafe) {
  if (!g.lastEnd || endSafe.getTime() > g.lastEnd.getTime()) {
    g.lastEnd = endSafe;
  }
}

    g.totalMinutes += TS_getDurationMinutes_(startDt, endDt);
  });

  const hubRows = [];
  const localRows = [];

  Object.keys(grouped).forEach(k => {
    const g = grouped[k];

    const units = Object.keys(g.units).sort().join(" / ");
    const serviceTypes = Object.keys(g.serviceTypes).sort().join(", ");
    const tripIds = Object.keys(g.tripIds).sort().join(", ");

    let note = "";
    if (g.bucket === "HUB") {
      if (g.hubTripCount >= 5 || g.totalMinutes >= 480) note = "HEAVY HUB DAY";
      else if (g.hubTripCount >= 3) note = "BALANCED HUB";
      else if (g.hubTripCount >= 1) note = "HUB ACTIVE";
    } else {
      if (g.tripCount >= 6 || g.totalMinutes >= 420) note = "FULL DAY";
      else if (g.tripCount >= 1 && g.tripCount <= 3) note = "LIGHT";
      else if (g.tripCount >= 4) note = "NORMAL";
    }

    const row = {
      vehicleId: g.vehicleId,
      driverName: g.driverName,
      tripCount: g.tripCount,
      hubTripCount: g.hubTripCount,
      inCount: g.inCount,
      outCount: g.outCount,
      totalMinutes: g.totalMinutes,
      hoursText: TS_formatMinutesFleet_(g.totalMinutes),
      firstStart: g.firstStart,
      lastEnd: g.lastEnd,
      firstText: TS_formatTimeFleet_(g.firstStart),
      lastText: TS_formatTimeFleet_(g.lastEnd),
      units: units,
      serviceTypes: serviceTypes,
      tripIds: tripIds,
      note: note
    };

    if (g.bucket === "HUB") hubRows.push(row);
    else localRows.push(row);
  });

  hubRows.sort(TS_sortFleetRows_);
  localRows.sort(TS_sortFleetRows_);

  const allRows = hubRows.concat(localRows);

  const summary = {
    vehiclesUsed: TS_countDistinctFleet_(allRows.map(x => x.vehicleId).filter(v => v && v !== "—")),
    activeDrivers: TS_countDistinctFleet_(allRows.map(x => x.driverName).filter(v => v && v !== "—")),
    hubTrips: hubRows.reduce((n, x) => n + x.hubTripCount, 0),
    localTrips: localRows.reduce((n, x) => n + x.tripCount, 0),

    hubVehiclesUsed: TS_countDistinctFleet_(hubRows.map(x => x.vehicleId).filter(v => v && v !== "—")),
    hubDriversUsed: TS_countDistinctFleet_(hubRows.map(x => x.driverName).filter(v => v && v !== "—")),
    hubIn: hubRows.reduce((n, x) => n + x.inCount, 0),
    hubOut: hubRows.reduce((n, x) => n + x.outCount, 0),

    localVehiclesUsed: TS_countDistinctFleet_(localRows.map(x => x.vehicleId).filter(v => v && v !== "—")),
    localDriversUsed: TS_countDistinctFleet_(localRows.map(x => x.driverName).filter(v => v && v !== "—"))
  };

  return {
    summary: summary,
    hubRows: hubRows,
    localRows: localRows
  };
}

function TS_renderFleetDailyReport_(sh, reportData, targetDate) {
  sh.setHiddenGridlines(true);
  sh.setFrozenRows(0);
  sh.setColumnWidths(1, 9, 120);
  sh.setColumnWidth(2, 180);
  sh.setColumnWidth(6, 90);
  sh.setColumnWidth(7, 95);
  sh.setColumnWidth(8, 95);
  sh.setColumnWidth(9, 180);

  sh.getRange("A1:I1").merge();
  sh.getRange("A1").setValue("CAPTAIN — FLEET DAILY REPORT");
  sh.getRange("A1")
    .setFontSize(18)
    .setFontWeight("bold")
    .setFontColor("#ffffff")
    .setBackground("#0f172a")
    .setHorizontalAlignment("center")
    .setVerticalAlignment("middle");
  sh.setRowHeight(1, 30);

  sh.getRange("A2:E2").clearContent().clearFormat();

  sh.getRange("A2").setValue("Date:");
  sh.getRange("B2").setValue(targetDate).setNumberFormat("dd/MM/yyyy");
  sh.getRange("D2").setValue("Production:");
  sh.getRange("E2").setValue("Captain Project");

  if (!String(sh.getRange("F2").getValue() || "").trim()) sh.getRange("F2").setValue("◀");
  if (!String(sh.getRange("G2").getValue() || "").trim()) sh.getRange("G2").setValue("TODAY");
  if (!String(sh.getRange("H2").getValue() || "").trim()) sh.getRange("H2").setValue("▶");

  sh.getRange("A2:I2")
    .setBackground("#f1f5f9")
    .setFontColor("#334155")
    .setFontWeight("normal")
    .setVerticalAlignment("middle");

  sh.getRange("F2:H2")
    .setHorizontalAlignment("center")
    .setFontWeight("bold");

  TS_writeFleetCard_(sh, "A4:B6", "VEHICLES USED", reportData.summary.vehiclesUsed);
  TS_writeFleetCard_(sh, "C4:D6", "ACTIVE DRIVERS", reportData.summary.activeDrivers);
  TS_writeFleetCard_(sh, "E4:F6", "HUB TRIPS", reportData.summary.hubTrips);
  TS_writeFleetCard_(sh, "G4:H6", "LOCAL TRIPS", reportData.summary.localTrips);

  let row = 8;

  sh.getRange(row, 1, 1, 9).merge();
  sh.getRange(row, 1).setValue("HUB TRANSFERS");
  sh.getRange(row, 1)
    .setBackground("#134e4a")
    .setFontColor("#ffffff")
    .setFontWeight("bold")
    .setFontSize(12);
  row++;

  sh.getRange(row, 1, 1, 9).merge();
  sh.getRange(row, 1).setValue(
    "Total HUB Trips: " + reportData.summary.hubTrips +
    " | IN: " + reportData.summary.hubIn +
    " | OUT: " + reportData.summary.hubOut +
    " | Vehicles Used: " + reportData.summary.hubVehiclesUsed +
    " | Drivers Used: " + reportData.summary.hubDriversUsed
  );
  sh.getRange(row, 1)
    .setBackground("#ecfeff")
    .setFontColor("#334155")
    .setFontStyle("italic");
  row += 2;

  const hubHeaderRow = row;
  const hubHeaders = ["Vehicle", "Driver", "HUB Trips", "IN", "OUT", "Hours", "First HUB", "Last HUB", "Notes"];
  sh.getRange(row, 1, 1, hubHeaders.length).setValues([hubHeaders]);
  sh.getRange(row, 1, 1, hubHeaders.length)
    .setBackground("#0f766e")
    .setFontColor("#ffffff")
    .setFontWeight("bold");
  row++;

  if (!reportData.hubRows.length) {
    sh.getRange(row, 1, 1, 9).merge();
    sh.getRange(row, 1).setValue("No HUB transfers for this day.");
    sh.getRange(row, 1)
      .setBackground("#f8fafc")
      .setFontColor("#64748b");
    row += 2;
  } else {
    reportData.hubRows.forEach((x, idx) => {
      sh.getRange(row, 1, 1, 9).setValues([[
        x.vehicleId,
        x.driverName,
        x.hubTripCount,
        x.inCount,
        x.outCount,
        x.hoursText,
        x.firstText,
        x.lastText,
        x.note
      ]]);

      const bg = idx % 2 === 0 ? "#f0fdfa" : "#ffffff";
      sh.getRange(row, 1, 1, 9).setBackground(bg);

      if (x.hubTripCount >= 5 || x.totalMinutes >= 480) {
        sh.getRange(row, 9).setBackground("#fee2e2").setFontColor("#991b1b").setFontWeight("bold");
      } else if (x.hubTripCount >= 3) {
        sh.getRange(row, 9).setBackground("#fef3c7").setFontColor("#92400e").setFontWeight("bold");
      }

      row++;
    });
    row++;
  }

  sh.getRange(row, 1, 1, 9).merge();
  sh.getRange(row, 1).setValue("LOCAL TRANSFERS");
  sh.getRange(row, 1)
    .setBackground("#374151")
    .setFontColor("#ffffff")
    .setFontWeight("bold")
    .setFontSize(12);
  row++;

  sh.getRange(row, 1, 1, 9).merge();
  sh.getRange(row, 1).setValue(
    "Total Local Trips: " + reportData.summary.localTrips +
    " | Vehicles Used: " + reportData.summary.localVehiclesUsed +
    " | Drivers Used: " + reportData.summary.localDriversUsed
  );
  sh.getRange(row, 1)
    .setBackground("#f8fafc")
    .setFontColor("#334155")
    .setFontStyle("italic");
  row += 2;

  const localHeaderRow = row;
  const localHeaders = ["Vehicle", "Driver", "Local Trips", "Hours", "First Trip", "Last Trip", "Units", "Service Types", "Notes"];
  sh.getRange(row, 1, 1, localHeaders.length).setValues([localHeaders]);
  sh.getRange(row, 1, 1, localHeaders.length)
    .setBackground("#6b7280")
    .setFontColor("#ffffff")
    .setFontWeight("bold");
  row++;

  if (!reportData.localRows.length) {
    sh.getRange(row, 1, 1, 9).merge();
    sh.getRange(row, 1).setValue("No LOCAL transfers for this day.");
    sh.getRange(row, 1)
      .setBackground("#f8fafc")
      .setFontColor("#64748b");
    row += 2;
  } else {
    reportData.localRows.forEach((x, idx) => {
      sh.getRange(row, 1, 1, 9).setValues([[
        x.vehicleId,
        x.driverName,
        x.tripCount,
        x.hoursText,
        x.firstText,
        x.lastText,
        x.units,
        x.serviceTypes,
        x.note
      ]]);

      const bg = idx % 2 === 0 ? "#f9fafb" : "#ffffff";
      sh.getRange(row, 1, 1, 9).setBackground(bg);

      if (x.tripCount >= 6 || x.totalMinutes >= 420) {
        sh.getRange(row, 9).setBackground("#fef3c7").setFontColor("#92400e").setFontWeight("bold");
      }

      row++;
    });
    row++;
  }

  sh.getRange(row, 1, 1, 9).merge();
  sh.getRange(row, 1).setValue("Generated by Captain");
  sh.getRange(row, 1)
    .setBackground("#f1f5f9")
    .setFontColor("#64748b")
    .setHorizontalAlignment("right")
    .setFontStyle("italic");

  const lastRow = sh.getLastRow();
  const lastCol = 9;
  sh.getRange(1, 1, lastRow, lastCol).setVerticalAlignment("middle");
  sh.getRange(1, 1, lastRow, lastCol).setWrap(true);

  if (reportData.hubRows.length) {
    sh.getRange(hubHeaderRow, 1, reportData.hubRows.length + 1, 9)
      .setBorder(true, true, true, true, false, false, "#cbd5e1", SpreadsheetApp.BorderStyle.SOLID);
  }
  if (reportData.localRows.length) {
    sh.getRange(localHeaderRow, 1, reportData.localRows.length + 1, 9)
      .setBorder(true, true, true, true, false, false, "#d1d5db", SpreadsheetApp.BorderStyle.SOLID);
  }

  sh.getRange(hubHeaderRow + 1, 3, Math.max(1, reportData.hubRows.length), 3).setHorizontalAlignment("center");
  sh.getRange(localHeaderRow + 1, 3, Math.max(1, reportData.localRows.length), 2).setHorizontalAlignment("center");
}

function TS_writeFleetCard_(sh, a1, label, value) {
  const rg = sh.getRange(a1);
  rg.merge();
  rg.setBackground("#e2e8f0")
    .setHorizontalAlignment("center")
    .setVerticalAlignment("middle")
    .setWrap(true);

  const text = label + "\n" + value;

  const rich = SpreadsheetApp.newRichTextValue()
    .setText(text)
    .setTextStyle(0, label.length, SpreadsheetApp.newTextStyle()
      .setBold(true)
      .setForegroundColor("#475569")
      .setFontSize(10)
      .build())
    .setTextStyle(label.length + 1, text.length, SpreadsheetApp.newTextStyle()
      .setBold(true)
      .setForegroundColor("#0f172a")
      .setFontSize(16)
      .build())
    .build();

  rg.setRichTextValue(rich);
}

/* =========================================
   DAILY EDIT / NAV
========================================= */

function TS_handleFleetReportEdit_(e) {
  if (!e || !e.range) return false;

  const sh = e.range.getSheet();
  if (!sh || sh.getName() !== "Fleet_Report_Daily") return false;
  if (e.range.getA1Notation() !== "B2") return false;

  const targetDate = e.range.getValue();
  if (!(targetDate instanceof Date) || isNaN(targetDate)) return true;

  buildFleetDailyReport_(targetDate);
  return true;
}

function fleetDailyPrevDay() {
  const ss = SpreadsheetApp.getActive();
  const sh = ss.getSheetByName("Fleet_Report_Daily");
  if (!sh) throw new Error("Fleet_Report_Daily not found");

  const v = sh.getRange("B2").getValue();
  const d = (v instanceof Date && !isNaN(v)) ? new Date(v) : new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - 1);

  sh.getRange("B2").setValue(d).setNumberFormat("dd/MM/yyyy");
  refreshFleetDailyReportFromSheetDate();
}

function fleetDailyToday() {
  const ss = SpreadsheetApp.getActive();
  const sh = ss.getSheetByName("Fleet_Report_Daily");
  if (!sh) throw new Error("Fleet_Report_Daily not found");

  const d = new Date();
  d.setHours(0, 0, 0, 0);

  sh.getRange("B2").setValue(d).setNumberFormat("dd/MM/yyyy");
  refreshFleetDailyReportFromSheetDate();
}

function fleetDailyNextDay() {
  const ss = SpreadsheetApp.getActive();
  const sh = ss.getSheetByName("Fleet_Report_Daily");
  if (!sh) throw new Error("Fleet_Report_Daily not found");

  const v = sh.getRange("B2").getValue();
  const d = (v instanceof Date && !isNaN(v)) ? new Date(v) : new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 1);

  sh.getRange("B2").setValue(d).setNumberFormat("dd/MM/yyyy");
  refreshFleetDailyReportFromSheetDate();
}

function fixFleetDailyHeaderControls() {
  const ss = SpreadsheetApp.getActive();
  const sh = ss.getSheetByName("Fleet_Report_Daily");
  if (!sh) throw new Error("Fleet_Report_Daily not found");

  const b2 = sh.getRange("B2");
  const val = b2.getValue();

  if (!(val instanceof Date) || isNaN(val)) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    b2.setValue(today);
  }

  b2.setNumberFormat("dd/MM/yyyy");
  b2.setFontWeight("bold");

  sh.getRange("F2").setValue("◀");
  sh.getRange("G2").setValue("TODAY");
  sh.getRange("H2").setValue("▶");

  sh.getRange("F2:H2")
    .setHorizontalAlignment("center")
    .setFontWeight("bold")
    .setBorder(true, true, true, true, false, false);
}

/* =========================================
   FLEET WEEKLY
========================================= */

function openFleetWeeklyReportForToday() {
  buildFleetWeeklyReport_(new Date());
}

function refreshFleetWeeklyReportFromSheetDate() {
  const ss = SpreadsheetApp.getActive();
  const sh = ss.getSheetByName("Fleet_Report_Weekly");
  if (!sh) throw new Error("Fleet_Report_Weekly sheet not found.");

  const targetDate = sh.getRange("B2").getValue();
  const startDate = TS_weeklyNormalizeDate_(targetDate);
  if (!startDate) throw new Error("B2 must contain a valid date.");

  buildFleetWeeklyReport_(startDate);
}

function buildFleetWeeklyReport_(targetDate) {
  const ss = SpreadsheetApp.getActive();
  const reportName = "Fleet_Report_Weekly";

  let sh = ss.getSheetByName(reportName);
  if (!sh) {
    sh = ss.insertSheet(reportName);
  } else {
    sh.clear();
    sh.clearFormats();
    sh.clearConditionalFormatRules();
  }

  const startDate = TS_weeklyNormalizeDate_(targetDate);
  if (!startDate) throw new Error("Invalid start date.");

  const endDate = new Date(startDate);
  endDate.setDate(startDate.getDate() + 6);
  endDate.setHours(0, 0, 0, 0);

  const tripsSh = TS_getTripsDataSheet_();
  const hdr = getHeaderMap_(tripsSh);
  TS_requireHeaders_(hdr, ["Date", "Trip_ID", "Pickup_ID", "Dropoff_ID", "Start_DT", "End_DT"], "Trips");

  const data = tripsSh.getLastRow() >= 2
    ? tripsSh.getRange(2, 1, tripsSh.getLastRow() - 1, tripsSh.getLastColumn()).getValues()
    : [];

  const reportData = TS_buildFleetWeeklyData_(data, hdr, startDate, endDate);
  TS_renderFleetWeeklyReport_(sh, reportData, startDate, endDate);

  SpreadsheetApp.setActiveSheet(sh);
}

function TS_buildFleetWeeklyData_(rows, hdr, startDate, endDate) {
  const startDay = TS_weeklyNormalizeDate_(startDate);
  const endDay = TS_weeklyNormalizeDate_(endDate);

  const byVehicleDriver = {};
  const dailyMap = {};
  const summaryVehicles = new Set();
  const summaryDrivers = new Set();

  for (let i = 0; i < 7; i++) {
    const d = new Date(startDay);
    d.setDate(startDay.getDate() + i);

    const key = TS_weeklyDayKey_(d);
    dailyMap[key] = {
      date: new Date(d),
      vehicles: new Set(),
      drivers: new Set(),
      totalMinutes: 0
    };
  }

  rows.forEach(r => {
    const tripDateRaw = TS_getTripDateRaw_(r, hdr);
const tripDate = TS_weeklyNormalizeDate_(toDateSafe_(tripDateRaw) || tripDateRaw);
if (!tripDate) return;

    if (tripDate.getTime() < startDay.getTime() || tripDate.getTime() > endDay.getTime()) return;

    const tripId = TS_getTripId_(r, hdr);
    if (!tripId) return;

    const pickupId = TS_getPickupId_(r, hdr);
    const dropoffId = TS_getDropoffId_(r, hdr);

    const vehicleId = TS_getVehicleId_(r, hdr, "—");
    const driverName = TS_getDriverName_(r, hdr, "—");

    const startDt = TS_getStartDt_(r, hdr);
    const endDt = TS_getEndDt_(r, hdr);

    const pickupIsHub = TS_weeklyIsHubId_(pickupId);
    const dropoffIsHub = TS_weeklyIsHubId_(dropoffId);
    const isHub = pickupIsHub || dropoffIsHub;

    const direction = pickupIsHub && !dropoffIsHub
      ? "IN"
      : (!pickupIsHub && dropoffIsHub ? "OUT" : "");

    const durationMin = TS_getDurationMinutes_(startDt, endDt);

    const dayKey = TS_weeklyDayKey_(tripDate);
    const vdKey = vehicleId + "||" + driverName;

    if (vehicleId !== "—") summaryVehicles.add(vehicleId);
    if (driverName !== "—") summaryDrivers.add(driverName);

    if (!byVehicleDriver[vdKey]) {
      byVehicleDriver[vdKey] = {
        vehicleId: vehicleId,
        driverName: driverName,
        activeDays: new Set(),
        tripIds: new Set(),
        hubTripIds: new Set(),
        localTripIds: new Set(),
        inTripIds: new Set(),
        outTripIds: new Set(),
        totalMinutes: 0,
        firstStart: null,
        lastEnd: null
      };
    }

    const g = byVehicleDriver[vdKey];
    g.activeDays.add(dayKey);
    g.tripIds.add(tripId);
    g.totalMinutes += durationMin;

    if (isHub) g.hubTripIds.add(tripId);
    else g.localTripIds.add(tripId);

    if (direction === "IN") g.inTripIds.add(tripId);
    if (direction === "OUT") g.outTripIds.add(tripId);

    const startSafe = toDateSafe_(startDt);
const endSafe = toDateSafe_(endDt);

if (startSafe) {
  if (!g.firstStart || startSafe.getTime() < g.firstStart.getTime()) {
    g.firstStart = startSafe;
  }
}

if (endSafe) {
  if (!g.lastEnd || endSafe.getTime() > g.lastEnd.getTime()) {
    g.lastEnd = endSafe;
  }
}

    const day = dailyMap[dayKey];
    if (day) {
      if (vehicleId !== "—") day.vehicles.add(vehicleId);
      if (driverName !== "—") day.drivers.add(driverName);

      day.tripIds = day.tripIds || new Set();
      day.hubTripIds = day.hubTripIds || new Set();
      day.localTripIds = day.localTripIds || new Set();
      day.inTripIds = day.inTripIds || new Set();
      day.outTripIds = day.outTripIds || new Set();

      day.tripIds.add(tripId);
      if (isHub) day.hubTripIds.add(tripId);
      else day.localTripIds.add(tripId);
      if (direction === "IN") day.inTripIds.add(tripId);
      if (direction === "OUT") day.outTripIds.add(tripId);

      day.totalMinutes += durationMin;
    }
  });

  const vehicleDriverRows = Object.keys(byVehicleDriver).map(k => {
    const x = byVehicleDriver[k];

    const totalTrips = x.tripIds.size;
    const hubTrips = x.hubTripIds.size;
    const localTrips = x.localTripIds.size;
    const inTrips = x.inTripIds.size;
    const outTrips = x.outTripIds.size;
    const activeDays = x.activeDays.size;
    const avgMinPerDay = activeDays ? Math.round(x.totalMinutes / activeDays) : 0;

    let note = "";
    if (x.totalMinutes >= 2400) note = "HEAVY WEEK";
    else if (hubTrips >= 8) note = "HUB FOCUSED";
    else if (totalTrips <= 2) note = "LIGHT WEEK";
    else if (localTrips > 0 && hubTrips > 0) note = "MIXED USE";

    return {
      vehicleId: x.vehicleId,
      driverName: x.driverName,
      activeDays: activeDays,
      totalTrips: totalTrips,
      hubTrips: hubTrips,
      inTrips: inTrips,
      outTrips: outTrips,
      localTrips: localTrips,
      firstCall: x.firstStart,
      lastWrap: x.lastEnd,
      firstCallText: TS_weeklyFormatDateTime_(x.firstStart),
      lastWrapText: TS_weeklyFormatDateTime_(x.lastEnd),
      totalMinutes: x.totalMinutes,
      totalHoursText: TS_weeklyFormatMinutes_(x.totalMinutes),
      avgHoursDayText: TS_weeklyFormatMinutes_(avgMinPerDay),
      note: note
    };
  });

  vehicleDriverRows.sort(TS_sortFleetWeeklyRows_);

  const dailyRows = Object.keys(dailyMap).sort().map(key => {
    const d = dailyMap[key];
    const totalTrips = d.tripIds ? d.tripIds.size : 0;
    const hubTrips = d.hubTripIds ? d.hubTripIds.size : 0;
    const inTrips = d.inTripIds ? d.inTripIds.size : 0;
    const outTrips = d.outTripIds ? d.outTripIds.size : 0;
    const localTrips = d.localTripIds ? d.localTripIds.size : 0;

    return {
      date: d.date,
      dayText: Utilities.formatDate(d.date, Session.getScriptTimeZone(), "EEE"),
      dateText: Utilities.formatDate(d.date, Session.getScriptTimeZone(), "dd/MM"),
      vehiclesUsed: d.vehicles.size,
      driversActive: d.drivers.size,
      totalTrips: totalTrips,
      hubTrips: hubTrips,
      inTrips: inTrips,
      outTrips: outTrips,
      localTrips: localTrips,
      totalMinutes: d.totalMinutes,
      totalHoursText: TS_weeklyFormatMinutes_(d.totalMinutes)
    };
  });

  const summary = {
    vehiclesUsed: summaryVehicles.size,
    driversActive: summaryDrivers.size,
    totalTrips: vehicleDriverRows.reduce((n, x) => n + x.totalTrips, 0),
    totalHubTrips: vehicleDriverRows.reduce((n, x) => n + x.hubTrips, 0),
    totalLocalTrips: vehicleDriverRows.reduce((n, x) => n + x.localTrips, 0),
    totalWeeklyMinutes: vehicleDriverRows.reduce((n, x) => n + x.totalMinutes, 0)
  };

  return {
    summary: summary,
    vehicleDriverRows: vehicleDriverRows,
    dailyRows: dailyRows
  };
}

function TS_renderFleetWeeklyReport_(sh, reportData, startDate, endDate) {
  sh.setHiddenGridlines(true);
  sh.setFrozenRows(0);

  sh.setColumnWidth(1, 110);
  sh.setColumnWidth(2, 170);
  sh.setColumnWidth(3, 90);
  sh.setColumnWidth(4, 90);
  sh.setColumnWidth(5, 75);
  sh.setColumnWidth(6, 75);
  sh.setColumnWidth(7, 75);
  sh.setColumnWidth(8, 90);
  sh.setColumnWidth(9, 140);
  sh.setColumnWidth(10, 140);
  sh.setColumnWidth(11, 100);
  sh.setColumnWidth(12, 95);
  sh.setColumnWidth(13, 160);

  sh.getRange("A1:M1").merge();
  sh.getRange("A1").setValue("CAPTAIN — FLEET WEEKLY REPORT");
  sh.getRange("A1")
    .setFontSize(18)
    .setFontWeight("bold")
    .setFontColor("#ffffff")
    .setBackground("#0f172a")
    .setHorizontalAlignment("center")
    .setVerticalAlignment("middle");
  sh.setRowHeight(1, 30);

  sh.getRange("A2:M2").clear();
  sh.getRange("A2").setValue("Start Date:");
  sh.getRange("B2").setValue(startDate).setNumberFormat("dd/MM/yyyy");
  sh.getRange("D2").setValue("End Date:");
  sh.getRange("E2").setValue(endDate).setNumberFormat("dd/MM/yyyy");
  sh.getRange("G2").setValue("Production:");
  sh.getRange("H2").setValue("Captain Project");

  const rule = SpreadsheetApp.newDataValidation()
    .requireDate()
    .setAllowInvalid(false)
    .build();

  sh.getRange("B2").setDataValidation(rule);

  sh.getRange("A2:M2")
    .setBackground("#f1f5f9")
    .setFontColor("#334155")
    .setFontWeight("normal");

  TS_writeFleetWeeklyCard_(sh, "A4:B6", "VEHICLES USED", reportData.summary.vehiclesUsed);
  TS_writeFleetWeeklyCard_(sh, "C4:D6", "DRIVERS ACTIVE", reportData.summary.driversActive);
  TS_writeFleetWeeklyCard_(sh, "E4:F6", "TOTAL TRIPS", reportData.summary.totalTrips);
  TS_writeFleetWeeklyCard_(sh, "G4:H6", "HUB TRIPS", reportData.summary.totalHubTrips);
  TS_writeFleetWeeklyCard_(sh, "I4:J6", "LOCAL TRIPS", reportData.summary.totalLocalTrips);
  TS_writeFleetWeeklyCard_(sh, "K4:M6", "TOTAL HOURS", TS_weeklyFormatMinutes_(reportData.summary.totalWeeklyMinutes));

  let row = 8;

  sh.getRange(row, 1, 1, 13).merge();
  sh.getRange(row, 1).setValue("VEHICLE / DRIVER WEEKLY LOAD");
  sh.getRange(row, 1)
    .setBackground("#134e4a")
    .setFontColor("#ffffff")
    .setFontWeight("bold")
    .setFontSize(12);
  row++;

  const mainHeaders = [
    "Vehicle", "Driver", "Days", "Trips", "HUB", "IN", "OUT", "LOCAL",
    "First Call", "Last Wrap", "Hours", "Avg/Day", "Notes"
  ];

  const mainHeaderRow = row;
  sh.getRange(row, 1, 1, mainHeaders.length).setValues([mainHeaders]);
  sh.getRange(row, 1, 1, mainHeaders.length)
    .setBackground("#0f766e")
    .setFontColor("#ffffff")
    .setFontWeight("bold");
  row++;

  if (!reportData.vehicleDriverRows.length) {
    sh.getRange(row, 1, 1, 13).merge();
    sh.getRange(row, 1).setValue("No fleet activity in selected period.");
    sh.getRange(row, 1)
      .setBackground("#f8fafc")
      .setFontColor("#64748b");
    row += 2;
  } else {
    reportData.vehicleDriverRows.forEach((x, idx) => {
      sh.getRange(row, 1, 1, 13).setValues([[
        x.vehicleId,
        x.driverName,
        x.activeDays,
        x.totalTrips,
        x.hubTrips,
        x.inTrips,
        x.outTrips,
        x.localTrips,
        x.firstCallText,
        x.lastWrapText,
        x.totalHoursText,
        x.avgHoursDayText,
        x.note
      ]]);

      const bg = idx % 2 === 0 ? "#ffffff" : "#f8fafc";
      sh.getRange(row, 1, 1, 13).setBackground(bg);

      if (x.totalMinutes >= 2400) {
        sh.getRange(row, 13).setBackground("#fee2e2").setFontColor("#991b1b").setFontWeight("bold");
      } else if (x.hubTrips >= 8) {
        sh.getRange(row, 13).setBackground("#fef3c7").setFontColor("#92400e").setFontWeight("bold");
      }

      row++;
    });
    row++;
  }

  sh.getRange(row, 1, 1, 10).merge();
  sh.getRange(row, 1).setValue("DAILY OVERVIEW");
  sh.getRange(row, 1)
    .setBackground("#374151")
    .setFontColor("#ffffff")
    .setFontWeight("bold")
    .setFontSize(12);
  row++;

  const dayHeaders = ["Day", "Date", "Vehicles", "Drivers", "Trips", "HUB", "IN", "OUT", "LOCAL", "Hours"];
  const dayHeaderRow = row;

  sh.getRange(row, 1, 1, dayHeaders.length).setValues([dayHeaders]);
  sh.getRange(row, 1, 1, dayHeaders.length)
    .setBackground("#6b7280")
    .setFontColor("#ffffff")
    .setFontWeight("bold");
  row++;

  reportData.dailyRows.forEach((x, idx) => {
    sh.getRange(row, 1, 1, 10).setValues([[
      x.dayText,
      x.dateText,
      x.vehiclesUsed,
      x.driversActive,
      x.totalTrips,
      x.hubTrips,
      x.inTrips,
      x.outTrips,
      x.localTrips,
      x.totalHoursText
    ]]);

    const bg = idx % 2 === 0 ? "#ffffff" : "#f9fafb";
    sh.getRange(row, 1, 1, 10).setBackground(bg);
    row++;
  });

  row++;

  sh.getRange(row, 1, 1, 13).merge();
  sh.getRange(row, 1).setValue("Generated by Captain");
  sh.getRange(row, 1)
    .setBackground("#f1f5f9")
    .setFontColor("#64748b")
    .setHorizontalAlignment("right")
    .setFontStyle("italic");

  const lastRow = sh.getLastRow();
  sh.getRange(1, 1, lastRow, 13).setVerticalAlignment("middle");
  sh.getRange(1, 1, lastRow, 13).setWrap(true);

  if (reportData.vehicleDriverRows.length) {
    sh.getRange(mainHeaderRow, 1, reportData.vehicleDriverRows.length + 1, 13)
      .setBorder(true, true, true, true, false, false, "#cbd5e1", SpreadsheetApp.BorderStyle.SOLID);
  }

  if (reportData.dailyRows.length) {
    sh.getRange(dayHeaderRow, 1, reportData.dailyRows.length + 1, 10)
      .setBorder(true, true, true, true, false, false, "#d1d5db", SpreadsheetApp.BorderStyle.SOLID);
  }

  sh.getRange(mainHeaderRow + 1, 3, Math.max(1, reportData.vehicleDriverRows.length), 6).setHorizontalAlignment("center");
  sh.getRange(dayHeaderRow + 1, 3, Math.max(1, reportData.dailyRows.length), 7).setHorizontalAlignment("center");
}

function TS_writeFleetWeeklyCard_(sh, a1, label, value) {
  const rg = sh.getRange(a1);
  rg.merge();
  rg.setBackground("#e2e8f0")
    .setHorizontalAlignment("center")
    .setVerticalAlignment("middle")
    .setWrap(true);

  const text = label + "\n" + value;

  const rich = SpreadsheetApp.newRichTextValue()
    .setText(text)
    .setTextStyle(0, label.length, SpreadsheetApp.newTextStyle()
      .setBold(true)
      .setForegroundColor("#475569")
      .setFontSize(10)
      .build())
    .setTextStyle(label.length + 1, text.length, SpreadsheetApp.newTextStyle()
      .setBold(true)
      .setForegroundColor("#0f172a")
      .setFontSize(16)
      .build())
    .build();

  rg.setRichTextValue(rich);
}

function TS_handleFleetWeeklyEdit_(e) {
  if (!e || !e.range) return false;

  const sh = e.range.getSheet();
  if (!sh || sh.getName() !== "Fleet_Report_Weekly") return false;
  if (e.range.getA1Notation() !== "B2") return false;

  const startDate = TS_weeklyNormalizeDate_(e.range.getValue());
  if (!startDate) return true;

  buildFleetWeeklyReport_(startDate);
  return true;
}

/* =========================================
   HUB WEEKLY
========================================= */

function refreshHubWeeklyReportFromSheetDate() {
  const ss = SpreadsheetApp.getActive();
  const sh = ss.getSheetByName("HUB_Report_Weekly");
  const tripsSh = TS_getTripsDataSheet_();
if (!sh) throw new Error("HUB_Report_Weekly sheet not found.");

  const startRaw = sh.getRange("B2").getValue();
  const weekStart = TS_weeklyNormalizeDate_(startRaw);
  if (!weekStart) throw new Error("B2 must contain a valid date.");

  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);
  weekEnd.setHours(0, 0, 0, 0);

  sh.getRange("E2").setValue(weekEnd).setNumberFormat("dd/MM/yyyy");

  const hdr = getHeaderMap_(tripsSh);
  TS_requireHeaders_(hdr, ["Date", "Trip_ID", "Pickup_ID", "Dropoff_ID", "Start_DT", "End_DT"], "Trips");

  const rows = tripsSh.getLastRow() >= 2
    ? tripsSh.getRange(2, 1, tripsSh.getLastRow() - 1, tripsSh.getLastColumn()).getValues()
    : [];

  const driverMap = {};
  const vehicleMap = {};
  const dailyMap = {};

  for (let i = 0; i < 7; i++) {
    const d = new Date(weekStart);
    d.setDate(weekStart.getDate() + i);
    const dk = TS_weeklyDayKey_(d);
    dailyMap[dk] = {
      date: new Date(d),
      tripIds: new Set(),
      totalMinutes: 0
    };
  }

  rows.forEach(r => {
    const tripDateRaw = TS_getTripDateRaw_(r, hdr);
const tripDate = TS_weeklyNormalizeDate_(toDateSafe_(tripDateRaw) || tripDateRaw);
if (!tripDate) return;
    if (tripDate.getTime() < weekStart.getTime() || tripDate.getTime() > weekEnd.getTime()) return;

    const tripId = TS_getTripId_(r, hdr);
    if (!tripId) return;

    const pickupId = TS_getPickupId_(r, hdr);
    const dropoffId = TS_getDropoffId_(r, hdr);

    const pickupIsHub = TS_weeklyIsHubId_(pickupId);
    const dropoffIsHub = TS_weeklyIsHubId_(dropoffId);
    const isHub = pickupIsHub || dropoffIsHub;
    if (!isHub) return;

    const driver = TS_getDriverName_(r, hdr, "NO DRIVER");
    const vehicle = TS_getVehicleId_(r, hdr, "NO VEHICLE");

    const startDt = TS_getStartDt_(r, hdr);
    const endDt = TS_getEndDt_(r, hdr);
    const durationMin = TS_getDurationMinutes_(startDt, endDt);

    const dayKey = TS_weeklyDayKey_(tripDate);

    if (!driverMap[driver]) {
      driverMap[driver] = {
        tripIds: new Set(),
        totalMinutes: 0
      };
    }

    if (!vehicleMap[vehicle]) {
      vehicleMap[vehicle] = {
        tripIds: new Set(),
        totalMinutes: 0
      };
    }

    driverMap[driver].tripIds.add(tripId);
    driverMap[driver].totalMinutes += durationMin;

    vehicleMap[vehicle].tripIds.add(tripId);
    vehicleMap[vehicle].totalMinutes += durationMin;

    if (dailyMap[dayKey]) {
      dailyMap[dayKey].tripIds.add(tripId);
      dailyMap[dayKey].totalMinutes += durationMin;
    }
  });

  sh.getRange("A4:Z1000").clearContent().clearFormat();
  sh.setHiddenGridlines(true);

  let r = 5;

  sh.getRange(r++, 1).setValue("HUB DRIVER LOAD").setFontWeight("bold");

  sh.getRange(r, 1, 1, 4)
    .setValues([["Driver", "Trips", "Hours", "Avg"]])
    .setBackground("#0f766e")
    .setFontColor("#ffffff")
    .setFontWeight("bold")
    .setBorder(true, true, true, true, true, true);
  r++;

  Object.keys(driverMap).sort().forEach(name => {
    const tripCount = driverMap[name].tripIds.size;
    const totalHours = driverMap[name].totalMinutes / 60;
    const avg = tripCount ? (totalHours / tripCount) : 0;

    sh.getRange(r, 1, 1, 4)
      .setValues([[
        name,
        tripCount,
        TS_weeklyFormatMinutes_(driverMap[name].totalMinutes),
        avg.toFixed(2)
      ]])
      .setBorder(true, true, true, true, true, true);
    r++;
  });

  r += 2;

  sh.getRange(r++, 1).setValue("VEHICLE SUMMARY").setFontWeight("bold");

  sh.getRange(r, 1, 1, 4)
    .setValues([["Vehicle", "Trips", "Hours", "Avg"]])
    .setBackground("#B6D7A8")
    .setFontWeight("bold")
    .setBorder(true, true, true, true, true, true);
  r++;

  Object.keys(vehicleMap).sort().forEach(id => {
    const tripCount = vehicleMap[id].tripIds.size;
    const totalHours = vehicleMap[id].totalMinutes / 60;
    const avg = tripCount ? (totalHours / tripCount) : 0;

    sh.getRange(r, 1, 1, 4)
      .setValues([[
        id,
        tripCount,
        TS_weeklyFormatMinutes_(vehicleMap[id].totalMinutes),
        avg.toFixed(2)
      ]])
      .setBorder(true, true, true, true, true, true);
    r++;
  });

  r += 2;

  sh.getRange(r++, 1).setValue("HUB DAILY FLOW").setFontWeight("bold");

  sh.getRange(r, 1, 1, 3)
    .setValues([["Date", "Trips", "Hours"]])
    .setBackground("#6b7280")
    .setFontColor("#ffffff")
    .setFontWeight("bold")
    .setBorder(true, true, true, true, true, true);
  r++;

  Object.keys(dailyMap).sort((a, b) => Number(a) - Number(b)).forEach(k => {
    const x = dailyMap[k];
    sh.getRange(r, 1, 1, 3)
      .setValues([[
        Utilities.formatDate(x.date, Session.getScriptTimeZone(), "dd/MM/yyyy"),
        x.tripIds.size,
        TS_weeklyFormatMinutes_(x.totalMinutes)
      ]])
      .setBorder(true, true, true, true, true, true);
    r++;
  });

  sh.autoResizeColumns(1, 6);
}

/* =========================================
   HELPERS
========================================= */
