/**
 * 08_Sidebars.gs
 * Funzioni GS per le sidebar HTML:
 * - Vehicle Availability Sidebar
 * - Pax Assignment Status Sidebar
 * - New Pax Assignment Sidebar
 * - Hub Coverage Assistant
 * Captain — Transport Management System
 *
 * NOTE: getHeaderMap_() sostituisce tutte le vecchie varianti:
 * getHeadersMapVehicleSidebar_, getHeadersNewPaxSidebar_,
 * getHeaderMapHCA_, getHeaders_
 */

/* =========================================
   COSTANTI HUB COVERAGE
   ========================================= */

const HUB_COVERAGE_CFG = {
  TRIPS_SHEET:      "Trips",
  FLEET_SHEET:      "Fleet",
  CREW_SHEET:       "Crew_Master",
  PAX_INDEX_SHEET:  "TS_PaxIndex",
  HOTELS_SHEET:     "Hotels",
  HUBS_SHEET:       "Hubs",
  TITLE:            "Hub Coverage Assistant",
  HUB_PREFIX_RE:    /^(APT_|STN_|PRT_)/i,
  MAX_VEHICLES_IN_PLAN: 4
};

const VEHICLE_SIDEBAR_CFG = {
  TRIPS_SHEET:   "Trips",
  FLEET_SHEET:   "Fleet",
  SIDEBAR_TITLE: "Vehicle Availability"
};


/* =========================================
   VEHICLE AVAILABILITY SIDEBAR
   ========================================= */

function openVehicleAvailabilitySidebar() {
  const tpl = HtmlService.createTemplateFromFile("VehicleAvailabilitySidebar");
  tpl.payload = getVehicleAvailabilityForActiveSelection_();

  const html = tpl.evaluate()
    .setTitle(VEHICLE_SIDEBAR_CFG.SIDEBAR_TITLE)
    .setWidth(460);

  SpreadsheetApp.getUi().showSidebar(html);
}


function showVehicleAvailability() {
  openVehicleAvailabilitySidebar();
}


function refreshVehicleAvailabilitySidebar() {
  openVehicleAvailabilitySidebar();
}


function getVehicleAvailabilityForActiveSelection_() {
  const sh = SpreadsheetApp.getActiveSheet();

  if (!sh || sh.getName() !== VEHICLE_SIDEBAR_CFG.TRIPS_SHEET) {
    return {
      error: "Select a row in Trips sheet",
      row: "",
      trip: {},
      freeNow: [],
      busyNow: []
    };
  }

  const range = sh.getActiveRange();
  if (!range) {
    return {
      error: "Select a trip row",
      row: "",
      trip: {},
      freeNow: [],
      busyNow: []
    };
  }

  const row = range.getRow();
  if (row <= 1) {
    return {
      error: "Select a trip row",
      row: "",
      trip: {},
      freeNow: [],
      busyNow: []
    };
  }

  return getVehicleAvailabilityForTripRow_(row);
}


function assignVehicleFromSidebar(vehicleId) {
  const sh = SpreadsheetApp.getActiveSheet();

  if (!sh || sh.getName() !== VEHICLE_SIDEBAR_CFG.TRIPS_SHEET) {
    throw new Error("Select a row in Trips sheet before assigning a vehicle.");
  }

  const range = sh.getActiveRange();
  if (!range) {
    throw new Error("No active row selected.");
  }

  const row = range.getRow();
  if (row <= 1) {
    throw new Error("Select a valid trip row.");
  }

  const hdr = getHeaderMap_(sh);
  const vehicleCol = hdr["Vehicle_ID"];
  if (!vehicleCol) {
    throw new Error("Trips header missing: Vehicle_ID");
  }

  vehicleId = String(vehicleId || "").trim();
  if (!vehicleId) {
    throw new Error("Vehicle_ID is empty.");
  }

  sh.getRange(row, vehicleCol).setValue(vehicleId);
  SpreadsheetApp.flush();

  // Popola automaticamente Driver_Name(auto), Sign_Code(auto), Capacity(auto)
  // esattamente come fa l'onEdit quando l'utente sceglie dal dropdown.
  syncVehicleDataFromFleet_(sh, row, hdr);
  SpreadsheetApp.flush();

  return "Vehicle assigned: " + vehicleId + " to row " + row;
}


function getVehicleAvailabilityForTripRow_(tripRow) {
  const ss = SpreadsheetApp.getActive();
  const tripsSh = ss.getSheetByName(VEHICLE_SIDEBAR_CFG.TRIPS_SHEET);
  const fleetSh = ss.getSheetByName(VEHICLE_SIDEBAR_CFG.FLEET_SHEET);

  if (!tripsSh) throw new Error("Trips sheet not found");
  if (!fleetSh) throw new Error("Fleet sheet not found");

  const tripsHdr = getHeaderMap_(tripsSh);
  const rowValues = tripsSh.getRange(tripRow, 1, 1, tripsSh.getLastColumn()).getValues()[0];

  const tripDate = tripsHdr["Date"] ? rowValues[tripsHdr["Date"] - 1] : null;
  const pickupName = tripsHdr["Pickup"] ? String(rowValues[tripsHdr["Pickup"] - 1] || "").trim() : "";
  const dropoffName = tripsHdr["Dropoff"] ? String(rowValues[tripsHdr["Dropoff"] - 1] || "").trim() : "";
  const pickupId = tripsHdr["Pickup_ID"] ? String(rowValues[tripsHdr["Pickup_ID"] - 1] || "").trim() : "";
  const selectedVehicleId = tripsHdr["Vehicle_ID"] ? String(rowValues[tripsHdr["Vehicle_ID"] - 1] || "").trim() : "";
  const tripId = tripsHdr["Trip_ID"] ? String(rowValues[tripsHdr["Trip_ID"] - 1] || "").trim() : "";

  const startDt = getTripStartForSidebar_(rowValues, tripsHdr, tripDate);
  const endDt = getTripEndForSidebar_(rowValues, tripsHdr, startDt);

  const tripStartMs = startDt ? startDt.getTime() : null;
  const tripEndMs = endDt ? endDt.getTime() : null;

  const fleetData = getSheetDataByHeaderVehicleSidebar_(fleetSh);
  const tripsData = getSheetDataByHeaderVehicleSidebar_(tripsSh);

  const vehicleStats = TS_getVehicleDailyStats_(tripDate);
  const groupedTripsMap = TS_buildTripGroupMapForSidebar_(tripDate, tripRow);

  const vehicles = fleetData.rows
    .map(r => {
      const vehicleId = getByHeaderVehicleSidebar_(r, fleetData.map, "Vehicle_ID");
      if (!vehicleId) return null;

      const cleanVehicleId = String(vehicleId).trim();
      const stats = vehicleStats[cleanVehicleId] || { trips: 0, minutes: 0 };

      return {
        vehicleId: cleanVehicleId,
        type: String(getByHeaderVehicleSidebar_(r, fleetData.map, "Type") || "").trim(),
        capacity: String(getByHeaderVehicleSidebar_(r, fleetData.map, "Capacity") || "").trim(),
        driverName: String(getByHeaderVehicleSidebar_(r, fleetData.map, "Driver_Name") || "").trim(),
        notes: String(getByHeaderVehicleSidebar_(r, fleetData.map, "Notes") || "").trim(),
        tripsToday: stats.trips,
        workMinutes: stats.minutes,
        workHours: TS_formatMinutes_(stats.minutes),
        fleetStatus: TS_getFleetStatus_(stats.minutes)
      };
    })
    .filter(Boolean);

  const sameDayTrips = tripsData.rows.filter((r, idx) => {
    const actualRow = idx + 2;
    if (actualRow === tripRow) return false;

    const d = getByHeaderVehicleSidebar_(r, tripsData.map, "Date");
    if (!(tripDate instanceof Date) || isNaN(tripDate)) return true;
    return isSameDayVehicleSidebar_(tripDate, d);
  });

  const enriched = vehicles.map(v => {
    let busy = false;
    let availableAfter = null;
    let blockingTripId = "";
    let blockingRoute = "";

    for (let i = 0; i < sameDayTrips.length; i++) {
      const r = sameDayTrips[i];

      const otherVehicleId = String(getByHeaderVehicleSidebar_(r, tripsData.map, "Vehicle_ID") || "").trim();
      if (!otherVehicleId || otherVehicleId !== v.vehicleId) continue;

      const otherTripId = String(getByHeaderVehicleSidebar_(r, tripsData.map, "Trip_ID") || "").trim();
      if (!otherTripId) continue;

      const groupedKey = otherVehicleId + "||" + otherTripId;
      const groupedTrip = groupedTripsMap[groupedKey];

      const otherStart = groupedTrip && groupedTrip.minStart
        ? groupedTrip.minStart
        : getTripStartFromDataRowVehicleSidebar_(r, tripsData.map);

      const otherEnd = groupedTrip && groupedTrip.maxEnd
        ? groupedTrip.maxEnd
        : getTripEndFromDataRowVehicleSidebar_(r, tripsData.map, otherStart);

      if (!otherStart || !otherEnd) continue;

      const otherStartMs = otherStart.getTime();
      const otherEndMs = otherEnd.getTime();

      let repositionMin = 0;
      if (groupedTrip && groupedTrip.dropoffIds && groupedTrip.dropoffIds.length && pickupId) {
        const firstDropoffId = String(groupedTrip.dropoffIds[groupedTrip.dropoffIds.length - 1] || "").trim();
        if (firstDropoffId) {
          repositionMin = Number(getRouteDurationMinVehicleSidebar_(firstDropoffId, pickupId) || 0);
        }
      } else {
        const otherDropoffId = String(getByHeaderVehicleSidebar_(r, tripsData.map, "Dropoff_ID") || "").trim();
        if (otherDropoffId && pickupId) {
          repositionMin = Number(getRouteDurationMinVehicleSidebar_(otherDropoffId, pickupId) || 0);
        }
      }

      const availableMs = otherEndMs + repositionMin * 60000;

      if (tripStartMs === null || tripEndMs === null) {
        if (!availableAfter || availableMs > availableAfter) {
          availableAfter = availableMs;
          blockingTripId = otherTripId;
          blockingRoute = groupedTrip && groupedTrip.routeText ? groupedTrip.routeText : "";
        }
        continue;
      }

      const overlaps = otherStartMs < tripEndMs && availableMs > tripStartMs;
      if (overlaps) {
        busy = true;
        if (!availableAfter || availableMs > availableAfter) {
          availableAfter = availableMs;
          blockingTripId = otherTripId;
          blockingRoute = groupedTrip && groupedTrip.routeText ? groupedTrip.routeText : "";
        }
      }
    }

    return {
      vehicleId: v.vehicleId,
      type: v.type,
      capacity: v.capacity,
      driverName: v.driverName,
      notes: v.notes,
      tripsToday: v.tripsToday,
      workMinutes: v.workMinutes,
      workHours: v.workHours,
      fleetStatus: v.fleetStatus,
      status: busy ? "BUSY" : "FREE",
      availableAfter: availableAfter ? formatTimeVehicleSidebar_(new Date(availableAfter)) : "",
      blockingTripId: blockingTripId,
      blockingRoute: blockingRoute,
      selected: selectedVehicleId === v.vehicleId
    };
  });

  return {
    error: "",
    row: tripRow,
    tripId: tripId,
    pickup: pickupName,
    dropoff: dropoffName,
    pickupTime: startDt ? formatDateTimeVehicleSidebar_(startDt) : "",
    trip: {
      date: formatDateVehicleSidebar_(tripDate),
      pickup: pickupName,
      dropoff: dropoffName,
      start: startDt ? formatDateTimeVehicleSidebar_(startDt) : "",
      end: endDt ? formatDateTimeVehicleSidebar_(endDt) : "",
      selectedVehicleId: selectedVehicleId
    },
    freeNow: enriched.filter(v => v.status === "FREE"),
    busyNow: enriched.filter(v => v.status === "BUSY"),
    freeVehicles: enriched
      .filter(v => v.status === "FREE")
      .map(v => ({
        vehicleId: v.vehicleId,
        driver: v.driverName,
        capacity: v.capacity,
        tripsToday: v.tripsToday,
        workHours: v.workHours,
        fleetStatus: v.fleetStatus,
        availableAfter: v.availableAfter || "Now"
      })),
    busyVehicles: enriched
      .filter(v => v.status === "BUSY")
      .map(v => ({
        vehicleId: v.vehicleId,
        driver: v.driverName,
        capacity: v.capacity,
        tripsToday: v.tripsToday,
        workHours: v.workHours,
        fleetStatus: v.fleetStatus,
        availableAfter: v.availableAfter || "",
        blockingTripId: v.blockingTripId || "",
        blockingRoute: v.blockingRoute || ""
      }))
  };
}


function TS_getVehicleDailyStats_(targetDate) {
  const ss = SpreadsheetApp.getActive();
  const sh = ss.getSheetByName("Trips");
  if (!sh || sh.getLastRow() < 2) return {};

  const hdr = getHeaderMap_(sh);

  const dateCol = hdr["Date"];
  const vehicleCol = hdr["Vehicle_ID"];
  const tripIdCol = hdr["Trip_ID"];
  const startCol = hdr["Start_DT"];
  const endCol = hdr["End_DT"];

  if (!dateCol || !vehicleCol || !tripIdCol) return {};

  const data = sh.getRange(2, 1, sh.getLastRow() - 1, sh.getLastColumn()).getValues();

  let dayRef = null;
  if (targetDate instanceof Date && !isNaN(targetDate)) {
    dayRef = new Date(targetDate);
    dayRef.setHours(0, 0, 0, 0);
  }

  const groupedTrips = {};

  for (let i = 0; i < data.length; i++) {
    const row = data[i];

    const vehicleId = String(row[vehicleCol - 1] || "").trim();
    const tripId = String(row[tripIdCol - 1] || "").trim();
    const rowDate = row[dateCol - 1];

    if (!vehicleId || !tripId) continue;
    if (!(rowDate instanceof Date) || isNaN(rowDate)) continue;

    const rowDay = new Date(rowDate);
    rowDay.setHours(0, 0, 0, 0);

    if (dayRef && rowDay.getTime() !== dayRef.getTime()) continue;

    const key = vehicleId + "||" + tripId;

    const startDt = startCol ? row[startCol - 1] : null;
    const endDt = endCol ? row[endCol - 1] : null;

    if (!groupedTrips[key]) {
      groupedTrips[key] = {
        vehicleId: vehicleId,
        tripId: tripId,
        minStart: (startDt instanceof Date && !isNaN(startDt)) ? startDt : null,
        maxEnd: (endDt instanceof Date && !isNaN(endDt)) ? endDt : null
      };
    } else {
      if (startDt instanceof Date && !isNaN(startDt)) {
        if (!groupedTrips[key].minStart || startDt.getTime() < groupedTrips[key].minStart.getTime()) {
          groupedTrips[key].minStart = startDt;
        }
      }

      if (endDt instanceof Date && !isNaN(endDt)) {
        if (!groupedTrips[key].maxEnd || endDt.getTime() > groupedTrips[key].maxEnd.getTime()) {
          groupedTrips[key].maxEnd = endDt;
        }
      }
    }
  }

  const stats = {};

  Object.keys(groupedTrips).forEach(key => {
    const g = groupedTrips[key];
    const vehicleId = g.vehicleId;

    if (!stats[vehicleId]) {
      stats[vehicleId] = {
        trips: 0,
        minutes: 0
      };
    }

    stats[vehicleId].trips += 1;

    if (g.minStart && g.maxEnd) {
      const durationMin = Math.round((g.maxEnd.getTime() - g.minStart.getTime()) / 60000);
      if (durationMin > 0) {
        stats[vehicleId].minutes += durationMin;
      }
    }
  });

  return stats;
}


function TS_formatMinutes_(minutes) {
  minutes = Number(minutes || 0);
  if (minutes <= 0) return "0h 0m";

  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);

  return h + "h " + m + "m";
}


function TS_getFleetStatus_(minutes) {
  if (!minutes || minutes <= 0) return "GREEN";

  const hours = minutes / 60;

  if (hours < 6) return "GREEN";
  if (hours < 9) return "YELLOW";

  return "RED";
}


function TS_buildTripGroupMapForSidebar_(tripDate, excludeRow) {
  const ss = SpreadsheetApp.getActive();
  const sh = ss.getSheetByName("Trips");
  if (!sh || sh.getLastRow() < 2) return {};

  const hdr = getHeaderMap_(sh);
  const data = sh.getRange(2, 1, sh.getLastRow() - 1, sh.getLastColumn()).getValues();

  const out = {};

  for (let i = 0; i < data.length; i++) {
    const actualRow = i + 2;
    if (excludeRow && actualRow === excludeRow) continue;

    const row = data[i];

    const rowDate = hdr["Date"] ? row[hdr["Date"] - 1] : null;
    if (!(rowDate instanceof Date) || isNaN(rowDate)) continue;
    if (tripDate instanceof Date && !isNaN(tripDate) && !isSameDayVehicleSidebar_(tripDate, rowDate)) continue;

    const tripId = hdr["Trip_ID"] ? String(row[hdr["Trip_ID"] - 1] || "").trim() : "";
    const vehicleId = hdr["Vehicle_ID"] ? String(row[hdr["Vehicle_ID"] - 1] || "").trim() : "";
    const pickup = hdr["Pickup"] ? String(row[hdr["Pickup"] - 1] || "").trim() : "";
    const dropoff = hdr["Dropoff"] ? String(row[hdr["Dropoff"] - 1] || "").trim() : "";
    const startDt = hdr["Start_DT"] ? row[hdr["Start_DT"] - 1] : null;
    const endDt = hdr["End_DT"] ? row[hdr["End_DT"] - 1] : null;
    const dropoffId = hdr["Dropoff_ID"] ? String(row[hdr["Dropoff_ID"] - 1] || "").trim() : "";

    if (!tripId || !vehicleId) continue;

    const key = vehicleId + "||" + tripId;

    if (!out[key]) {
      out[key] = {
        tripId: tripId,
        vehicleId: vehicleId,
        pickup: pickup,
        dropoffs: [],
        dropoffIds: [],
        minStart: (startDt instanceof Date && !isNaN(startDt)) ? startDt : null,
        maxEnd: (endDt instanceof Date && !isNaN(endDt)) ? endDt : null
      };
    }

    if (dropoff) out[key].dropoffs.push(dropoff);
    if (dropoffId) out[key].dropoffIds.push(dropoffId);

    if (startDt instanceof Date && !isNaN(startDt)) {
      if (!out[key].minStart || startDt.getTime() < out[key].minStart.getTime()) {
        out[key].minStart = startDt;
      }
    }

    if (endDt instanceof Date && !isNaN(endDt)) {
      if (!out[key].maxEnd || endDt.getTime() > out[key].maxEnd.getTime()) {
        out[key].maxEnd = endDt;
      }
    }
  }

  Object.keys(out).forEach(key => {
    out[key].dropoffs = Array.from(new Set(out[key].dropoffs));
    out[key].dropoffIds = Array.from(new Set(out[key].dropoffIds));
    out[key].routeText = TS_formatGroupedRouteForSidebar_(out[key].pickup, out[key].dropoffs);
  });

  return out;
}


function TS_formatGroupedRouteForSidebar_(pickup, dropoffs) {
  const cleanPickup = String(pickup || "").trim();
  const cleanDropoffs = Array.from(new Set((dropoffs || []).map(x => String(x || "").trim()).filter(Boolean)));

  if (!cleanPickup && !cleanDropoffs.length) return "";
  if (!cleanDropoffs.length) return cleanPickup;

  if (cleanDropoffs.length === 1) {
    return cleanPickup + " → " + cleanDropoffs[0];
  }

  return cleanPickup + " → " + cleanDropoffs.join(", ");
}


function getTripStartForSidebar_(rowValues, hdr, tripDate) {
  if (hdr["Start_DT"]) {
    const v = rowValues[hdr["Start_DT"] - 1];
    if (v instanceof Date && !isNaN(v)) return v;
  }

  const timeHeaders = ["Pickup_Time", "Time", "Call", "Arr_Time"];
  for (let i = 0; i < timeHeaders.length; i++) {
    const h = timeHeaders[i];
    if (!hdr[h]) continue;

    const raw = rowValues[hdr[h] - 1];
    const dt = mergeDateAndTimeVehicleSidebar_(tripDate, raw);
    if (dt) return dt;
  }

  return null;
}


function getTripEndForSidebar_(rowValues, hdr, startDt) {
  if (hdr["End_DT"]) {
    const v = rowValues[hdr["End_DT"] - 1];
    if (v instanceof Date && !isNaN(v)) return v;
  }

  if (!startDt) return null;

  const duration = Number(hdr["Duration_Min"] ? rowValues[hdr["Duration_Min"] - 1] : "") || 0;
  if (!duration) return null;

  return new Date(startDt.getTime() + duration * 60000);
}


function getTripStartFromDataRowVehicleSidebar_(row, map) {
  if (map["Start_DT"]) {
    const v = row[map["Start_DT"] - 1];
    if (v instanceof Date && !isNaN(v)) return v;
  }

  const tripDate = map["Date"] ? row[map["Date"] - 1] : null;
  const timeHeaders = ["Pickup_Time", "Time", "Call", "Arr_Time"];

  for (let i = 0; i < timeHeaders.length; i++) {
    const h = timeHeaders[i];
    if (!map[h]) continue;
    const dt = mergeDateAndTimeVehicleSidebar_(tripDate, row[map[h] - 1]);
    if (dt) return dt;
  }

  return null;
}


function getTripEndFromDataRowVehicleSidebar_(row, map, startDt) {
  if (map["End_DT"]) {
    const v = row[map["End_DT"] - 1];
    if (v instanceof Date && !isNaN(v)) return v;
  }

  if (!startDt) return null;

  const duration = Number(map["Duration_Min"] ? row[map["Duration_Min"] - 1] : "") || 0;
  if (!duration) return null;

  return new Date(startDt.getTime() + duration * 60000);
}


function mergeDateAndTimeVehicleSidebar_(dateValue, timeValue) {
  if (!(dateValue instanceof Date) || isNaN(dateValue)) return null;

  let hours = 0;
  let minutes = 0;

  if (timeValue instanceof Date && !isNaN(timeValue)) {
    hours = timeValue.getHours();
    minutes = timeValue.getMinutes();
  } else if (typeof timeValue === "number" && isFinite(timeValue)) {
    const totalMinutes = Math.round(timeValue * 24 * 60);
    hours = Math.floor(totalMinutes / 60) % 24;
    minutes = totalMinutes % 60;
  } else {
    const s = String(timeValue || "").trim();
    const m = s.match(/\b(\d{1,2}):(\d{2})\b/);
    if (!m) return null;
    hours = Number(m[1]);
    minutes = Number(m[2]);
  }

  const out = new Date(dateValue);
  out.setHours(hours, minutes, 0, 0);
  return out;
}


function formatDateVehicleSidebar_(d) {
  if (!(d instanceof Date) || isNaN(d)) return "";
  return Utilities.formatDate(d, Session.getScriptTimeZone(), "dd/MM/yyyy");
}


function formatTimeVehicleSidebar_(d) {
  if (!(d instanceof Date) || isNaN(d)) return "";
  return Utilities.formatDate(d, Session.getScriptTimeZone(), "HH:mm");
}


function formatDateTimeVehicleSidebar_(d) {
  if (!(d instanceof Date) || isNaN(d)) return "";
  return Utilities.formatDate(d, Session.getScriptTimeZone(), "dd/MM HH:mm");
}


function isSameDayVehicleSidebar_(a, b) {
  if (!(a instanceof Date) || isNaN(a)) return false;
  if (!(b instanceof Date) || isNaN(b)) return false;

  return a.getFullYear() === b.getFullYear() &&
         a.getMonth() === b.getMonth() &&
         a.getDate() === b.getDate();
}


function getSheetDataByHeaderVehicleSidebar_(sh) {
  if (!sh || sh.getLastRow() < 2) {
    return { map: getHeaderMap_(sh), rows: [] };
  }

  const map = getHeaderMap_(sh);
  const rows = sh.getRange(2, 1, sh.getLastRow() - 1, sh.getLastColumn()).getValues();
  return { map, rows };
}


function getByHeaderVehicleSidebar_(row, map, header) {
  const col = map[header];
  if (!col) return "";
  return row[col - 1];
}


function getRouteDurationMinVehicleSidebar_(fromId, toId) {
  const sh = SpreadsheetApp.getActive().getSheetByName("Routes");
  if (!sh || sh.getLastRow() < 2) return "";

  const data = sh.getRange(2, 1, sh.getLastRow() - 1, 3).getValues();
  const fromNorm = String(fromId || "").trim();
  const toNorm = String(toId || "").trim();

  for (let i = 0; i < data.length; i++) {
    const a = String(data[i][0] || "").trim();
    const b = String(data[i][1] || "").trim();
    if (a === fromNorm && b === toNorm) {
      const dur = Number(data[i][2] || 0);
      if (dur > 0) return dur;
    }
  }

  if (typeof estimateMinByIds_ === "function") {
    return Number(estimateMinByIds_(fromNorm, toNorm) || 0) || "";
  }

  return "";
}

/* =========================================
   PAX ASSIGNMENT STATUS SIDEBAR
   ========================================= */

function openPaxAssignmentSidebar() {
  const payload = buildPaxAssignmentData_();

  const tpl = HtmlService.createTemplateFromFile("PaxAssignmentSidebar");
  tpl.payload = payload;

  const html = tpl.evaluate()
    .setWidth(1000)
    .setHeight(650);

  SpreadsheetApp.getUi().showModalDialog(
    html,
    "Pax Assignment Status"
  );
}


function showPaxAssignmentStatus() {
  openPaxAssignmentSidebar();
}


function buildPaxAssignmentData_() {
  const ss = SpreadsheetApp.getActive();
  const tripsSh = ss.getSheetByName("Trips");
  const crewSh = ss.getSheetByName("Crew_Master");
  const paxIndexSh = ss.getSheetByName("TS_PaxIndex");

  if (!tripsSh) throw new Error("Trips sheet not found");
  if (!crewSh) throw new Error("Crew_Master sheet not found");

  const activeRange = tripsSh.getActiveRange();
  if (!activeRange) throw new Error("Select a trip row");

  const row = activeRange.getRow();
  if (row <= 1) throw new Error("Select a trip row");

  const tripsHdr = getHeaderMap_(tripsSh);
  const crewHdr = getHeaderMap_(crewSh);

  const tripRow = tripsSh.getRange(row, 1, 1, tripsSh.getLastColumn()).getValues()[0];
  const tripDate = tripsHdr["Date"] ? tripRow[tripsHdr["Date"] - 1] : null;

  const assignedMap = buildAssignedMapForDate_(tripDate, paxIndexSh, tripsSh);

  const crewData = crewSh.getDataRange().getValues();
  const assigned = [];
  const unassigned = [];

  for (let r = 1; r < crewData.length; r++) {
    const name = String(crewData[r][crewHdr["Full_Name"] - 1] || "").trim();
    const status = String(crewData[r][crewHdr["Travel_Status"] - 1] || "").trim().toUpperCase();

    if (!name) continue;
    if (!["IN", "OUT", "PRESENT"].includes(status)) continue;

    const dept = crewHdr["Dept"] ? String(crewData[r][crewHdr["Dept"] - 1] || "").trim() : "";
    const hotel = crewHdr["HOTELS"] ? String(crewData[r][crewHdr["HOTELS"] - 1] || "").trim() : "";

    const entry = {
      name: name,
      dept: dept || "NO DEPT",
      status: status,
      hotel: hotel
    };

    const key = normName_(name);
    if (assignedMap[key]) {
      entry.trip = assignedMap[key].tripId || "";
      entry.route = assignedMap[key].route || "";
      entry.pickupTime = assignedMap[key].pickupTime || "";
      entry.callTime = assignedMap[key].callTime || "";
      assigned.push(entry);
    } else {
      unassigned.push(entry);
    }
  }

  assigned.sort(sortPaxSidebarRows_);
  unassigned.sort(sortPaxSidebarRows_);

  return {
    date: formatDate_(tripDate),
    assigned: assigned,
    unassigned: unassigned
  };
}


function buildAssignedMapForDate_(tripDate, paxIndexSh, tripsSh) {
  const map = {};

  if (!tripDate || !(tripDate instanceof Date) || isNaN(tripDate)) return map;

  const ss = SpreadsheetApp.getActive();
  const tpSh = ss.getSheetByName("Trip_Passengers");
  if (!tpSh || tpSh.getLastRow() < 2 || !tripsSh || tripsSh.getLastRow() < 2) {
    return map;
  }

  const tpHeaders = getHeaderMap_(tpSh);
  const tripsHeaders = getHeaderMap_(tripsSh);

  const requiredTp = ["Trip_ID", "Full_Name", "Trip_Row"];
  const hasTp = requiredTp.every(h => tpHeaders[h]);
  if (!hasTp) return map;

  const tpData = tpSh.getRange(2, 1, tpSh.getLastRow() - 1, tpSh.getLastColumn()).getValues();
  const tripsData = tripsSh.getRange(2, 1, tripsSh.getLastRow() - 1, tripsSh.getLastColumn()).getValues();

  for (let i = 0; i < tpData.length; i++) {
    const row = tpData[i];

    const name = String(row[tpHeaders["Full_Name"] - 1] || "").trim();
    const tripId = String(row[tpHeaders["Trip_ID"] - 1] || "").trim();
    const tripRow = Number(row[tpHeaders["Trip_Row"] - 1] || 0);

    if (!name || !tripId || !tripRow || tripRow < 2) continue;

    const tripArrIndex = tripRow - 2;
    if (tripArrIndex < 0 || tripArrIndex >= tripsData.length) continue;

    const tripRowValues = tripsData[tripArrIndex];
    const rowDate = tripsHeaders["Date"] ? tripRowValues[tripsHeaders["Date"] - 1] : null;
    if (!sameDay_(tripDate, rowDate)) continue;

    const pickup = tripsHeaders["Pickup"] ? String(tripRowValues[tripsHeaders["Pickup"] - 1] || "").trim() : "";
const dropoff = tripsHeaders["Dropoff"] ? String(tripRowValues[tripsHeaders["Dropoff"] - 1] || "").trim() : "";
const pickupTime = tripsHeaders["Pickup_Time"] ? tripRowValues[tripsHeaders["Pickup_Time"] - 1] : "";
const callTime = tripsHeaders["Call_Time"]
  ? tripRowValues[tripsHeaders["Call_Time"] - 1]
  : tripRowValues[3]; // fallback colonna D

map[normName_(name)] = {
  tripId: tripId,
  route: [pickup, dropoff].filter(Boolean).join(" → "),
  pickupTime: formatTimeLoose_(pickupTime),
  callTime: formatTimeLoose_(callTime)
};
  }

  return map;
}


function sortPaxSidebarRows_(a, b) {
  const deptA = String(a.dept || "").trim().toLowerCase();
  const deptB = String(b.dept || "").trim().toLowerCase();
  if (deptA !== deptB) return deptA.localeCompare(deptB);

  const nameA = String(a.name || "").trim().toLowerCase();
  const nameB = String(b.name || "").trim().toLowerCase();
  return nameA.localeCompare(nameB);
}


/* =========================================
   NEW PAX ASSIGNMENT SIDEBAR
   ========================================= */

function openNewPaxAssignmentSidebar() {
  const payload = buildNewPaxAssignmentPayload_();

  const tpl = HtmlService.createTemplateFromFile("NewPaxAssignmentSidebar");
  tpl.payload = payload;

  const html = tpl.evaluate()
    .setTitle("Pax Assignment")
    .setWidth(480);

  SpreadsheetApp.getUi().showSidebar(html);
}


function buildNewPaxAssignmentPayload_() {
  const ss = SpreadsheetApp.getActive();
  const tripsSh = ss.getSheetByName("Trips");
  const crewSh = ss.getSheetByName("Crew_Master");
  const paxSh = ss.getSheetByName("Trip_Passengers");

  if (!tripsSh) throw new Error("Trips sheet not found");
  if (!crewSh) throw new Error("Crew_Master sheet not found");
  if (!paxSh) throw new Error("Trip_Passengers sheet not found");

  const activeRange = tripsSh.getActiveRange();
  if (!activeRange) throw new Error("Select a trip row in Trips");

  const row = activeRange.getRow();
  if (row <= 1) throw new Error("Select a valid trip row in Trips");

  const tripsHdr = getHeaderMap_(tripsSh);
  const rowValues = tripsSh.getRange(row, 1, 1, tripsSh.getLastColumn()).getValues()[0];

  const tripId    = tripsHdr["Trip_ID"]    ? String(rowValues[tripsHdr["Trip_ID"]    - 1] || "").trim() : "";
  const tripDate  = tripsHdr["Date"]       ? rowValues[tripsHdr["Date"]       - 1] : "";
  const pickup    = tripsHdr["Pickup"]     ? String(rowValues[tripsHdr["Pickup"]     - 1] || "").trim() : "";
  const dropoff   = tripsHdr["Dropoff"]   ? String(rowValues[tripsHdr["Dropoff"]   - 1] || "").trim() : "";
  const pickupId  = tripsHdr["Pickup_ID"] ? String(rowValues[tripsHdr["Pickup_ID"] - 1] || "").trim() : "";
  const dropoffId = tripsHdr["Dropoff_ID"]? String(rowValues[tripsHdr["Dropoff_ID"]- 1] || "").trim() : "";
  const vehicleId = tripsHdr["Vehicle_ID"]? String(rowValues[tripsHdr["Vehicle_ID"]- 1] || "").trim() : "";

  const pickupTime = tripsHdr["Pickup_Time"]
    ? formatLooseTimeNewPaxSidebar_(rowValues[tripsHdr["Pickup_Time"] - 1])
    : "";
  const callTime = formatLooseTimeNewPaxSidebar_(rowValues[3]); // colonna D

  if (!tripId) throw new Error("Selected trip row has no Trip_ID");

  // Legge capacità del veicolo da Fleet
  const capacity = _getVehicleCapacityNewPax_(vehicleId);

  const assignedPassengers = getAssignedPassengersForTripAndRowNewPaxSidebar_(tripId, row);
  const availableCrew      = getAvailableCrewForTripNewPaxSidebar_(row, pickupId, dropoffId, assignedPassengers);

  return {
    tripId:             tripId,
    tripRow:            row,
    tripDate:           formatDateNewPaxSidebar_(tripDate),
    pickup:             pickup,
    dropoff:            dropoff,
    pickupId:           pickupId,
    dropoffId:          dropoffId,
    pickupTime:         pickupTime,
    callTime:           callTime,
    vehicleId:          vehicleId,
    capacity:           capacity,
    assignedPassengers: assignedPassengers,
    availableCrew:      availableCrew.available,
    busy:               availableCrew.busy
  };
}


/**
 * Legge la capacità di un veicolo dal foglio Fleet.
 * Restituisce 0 se il veicolo non è trovato o non ha Vehicle_ID.
 */
function _getVehicleCapacityNewPax_(vehicleId) {
  if (!vehicleId) return 0;
  const ss      = SpreadsheetApp.getActive();
  const fleetSh = ss.getSheetByName("Fleet");
  if (!fleetSh || fleetSh.getLastRow() < 2) return 0;

  const hdr  = getHeaderMap_(fleetSh);
  const vCol = hdr["Vehicle_ID"];
  const cCol = hdr["Capacity"];
  if (!vCol || !cCol) return 0;

  const data = fleetSh.getRange(2, 1, fleetSh.getLastRow() - 1, fleetSh.getLastColumn()).getValues();
  for (let i = 0; i < data.length; i++) {
    const id = String(data[i][vCol - 1] || "").trim();
    if (id === vehicleId) {
      return Number(data[i][cCol - 1] || 0) || 0;
    }
  }
  return 0;
}


function getAssignedPassengersForTripNewPaxSidebar_(tripId) {
  const ss = SpreadsheetApp.getActive();
  const sh = ss.getSheetByName("Trip_Passengers");
  if (!sh || sh.getLastRow() < 2) return [];

  const hdr = getHeaderMap_(sh);
  const data = sh.getRange(2, 1, sh.getLastRow() - 1, sh.getLastColumn()).getValues();

  const out = [];

  for (let i = 0; i < data.length; i++) {
    const row = data[i];

    const rowTripId = hdr["Trip_ID"] ? String(row[hdr["Trip_ID"] - 1] || "").trim() : "";
    if (rowTripId !== tripId) continue;

    const crewId = hdr["Crew_ID"] ? String(row[hdr["Crew_ID"] - 1] || "").trim() : "";
    const fullName = hdr["Full_Name"] ? String(row[hdr["Full_Name"] - 1] || "").trim() : "";
    const pickupId = hdr["Pickup_ID"] ? String(row[hdr["Pickup_ID"] - 1] || "").trim() : "";
    const dropoffId = hdr["Dropoff_ID"] ? String(row[hdr["Dropoff_ID"] - 1] || "").trim() : "";
    const startDt = hdr["Start_DT"] ? row[hdr["Start_DT"] - 1] : "";
    const endDt = hdr["End_DT"] ? row[hdr["End_DT"] - 1] : "";

    if (!fullName && !crewId) continue;

    out.push({
      crewId: crewId,
      fullName: fullName || crewId,
      pickup: pickupId,
      dropoff: dropoffId,
      vehicle: "",
      callTime: formatLooseDateTimeNewPaxSidebar_(startDt),
      pickupTime: formatLooseDateTimeNewPaxSidebar_(startDt),
      startDt: formatLooseDateTimeNewPaxSidebar_(startDt),
      endDt: formatLooseDateTimeNewPaxSidebar_(endDt)
    });
  }

  out.sort((a, b) => {
    const na = String(a.fullName || "").toLowerCase();
    const nb = String(b.fullName || "").toLowerCase();
    return na.localeCompare(nb);
  });

  return out;
}


function getAvailableCrewForTripNewPaxSidebar_(tripRow, pickupId, dropoffId, assignedPassengers) {
  const ss = SpreadsheetApp.getActive();
  const crewSh = ss.getSheetByName("Crew_Master");
  const tripsSh = ss.getSheetByName("Trips");
  const tpSh = ss.getSheetByName("Trip_Passengers");

  if (!crewSh || crewSh.getLastRow() < 2) return { available: [], busy: [] };
  if (!tripsSh) throw new Error("Trips sheet not found");
  if (!tpSh) throw new Error("Trip_Passengers sheet not found");

  const tripsHdr = getHeaderMap_(tripsSh);
const tripsData = tripsSh.getRange(2, 1, Math.max(tripsSh.getLastRow() - 1, 0), tripsSh.getLastColumn()).getValues();
const tripIdCol = tripsHdr["Trip_ID"];

const tripIdByRow = {};
for (let i = 0; i < tripsData.length; i++) {
  const sheetRow = i + 2;
  const tripIdVal = tripIdCol ? String(tripsData[i][tripIdCol - 1] || "").trim() : "";
  tripIdByRow[sheetRow] = tripIdVal;
}
  const startDtCol = tripsHdr["Start_DT"];
  const endDtCol = tripsHdr["End_DT"];

  const targetStart = tripsSh.getRange(tripRow, startDtCol).getValue();
  const targetEnd = tripsSh.getRange(tripRow, endDtCol).getValue();

  const targetStartMs = targetStart instanceof Date ? targetStart.getTime() : null;
  const targetEndMs = targetEnd instanceof Date ? targetEnd.getTime() : null;

  const crewHdr = getHeaderMap_(crewSh);
  const crewData = crewSh.getRange(2, 1, crewSh.getLastRow() - 1, crewSh.getLastColumn()).getValues();

  const pickupIsHub = /^(APT_|STN_|PRT_)/i.test(String(pickupId || "").trim());
  const dropoffIsHub = /^(APT_|STN_|PRT_)/i.test(String(dropoffId || "").trim());

  let acceptedStatuses = [];
  let targetHotelId = "";

  if (pickupIsHub && !dropoffIsHub) {
    acceptedStatuses = ["IN"];
    targetHotelId = String(dropoffId || "").toUpperCase();
  } else if (!pickupIsHub && dropoffIsHub) {
    acceptedStatuses = ["OUT"];
    targetHotelId = String(pickupId || "").toUpperCase();
  } else if (!pickupIsHub && !dropoffIsHub) {
    acceptedStatuses = ["PRESENT"];
    targetHotelId = String(pickupId || "").toUpperCase();
  }

  const assignedKeys = new Set(
    (assignedPassengers || []).map(p =>
      String(p.crewId || p.fullName || "").toLowerCase()
    )
  );
  const busyCrewKeys = new Set();
const busyCrewDetails = {};
  

  if (tpSh.getLastRow() >= 2 && targetStartMs && targetEndMs) {
    const tpHdr = getHeaderMap_(tpSh);
    const tpData = tpSh.getRange(2, 1, tpSh.getLastRow() - 1, tpSh.getLastColumn()).getValues();

    const tpTripRowCol = tpHdr["Trip_Row"];
    const tpCrewIdCol = tpHdr["Crew_ID"];
    const tpFullNameCol = tpHdr["Full_Name"];
    const tpStartDtCol = tpHdr["Start_DT"];
    const tpEndDtCol = tpHdr["End_DT"];

    for (let i = 0; i < tpData.length; i++) {
      const r = tpData[i];

      const otherTripRow = Number(r[tpTripRowCol - 1] || 0);
      if (otherTripRow === Number(tripRow)) continue;

      const otherStart = r[tpStartDtCol - 1];
      const otherEnd = r[tpEndDtCol - 1];

      if (!(otherStart instanceof Date) || !(otherEnd instanceof Date)) continue;

      const overlaps = (targetStartMs < otherEnd.getTime()) && (otherStart.getTime() < targetEndMs);
      if (!overlaps) continue;

      const crewId = String(r[tpCrewIdCol - 1] || "").toLowerCase();
      const fullName = tpFullNameCol ? String(r[tpFullNameCol - 1] || "").toLowerCase() : "";

     const busyKey1 = String(crewId || "").trim().toLowerCase();
const busyKey2 = String(fullName || "").trim().toLowerCase();

if (busyKey1) {
  busyCrewKeys.add(busyKey1);
  busyCrewDetails[busyKey1] = {
    tripRow: otherTripRow,
    start: otherStart,
    end: otherEnd
  };
}

if (busyKey2) {
  busyCrewKeys.add(busyKey2);
  busyCrewDetails[busyKey2] = {
    tripRow: otherTripRow,
    start: otherStart,
    end: otherEnd
  };
}
    }
  }

  const available = [];
  const busy = [];

  for (let i = 0; i < crewData.length; i++) {
    const row = crewData[i];

    const crewId = String(row[crewHdr["Crew_ID"] - 1] || "").trim();
    const fullName = String(row[crewHdr["Full_Name"] - 1] || "").trim();
    const dept = String(row[crewHdr["Dept"] - 1] || "").trim();
    const hotelId = String(row[crewHdr["Hotel_ID"] - 1] || "").toUpperCase();
    const hotelName = String(row[crewHdr["HOTELS"] - 1] || "").trim();
    const hotelStatus = String(row[crewHdr["Hotel_Status"] - 1] || "").toUpperCase();
    const travelStatus = String(row[crewHdr["Travel_Status"] - 1] || "").toUpperCase();

    if (!fullName) continue;
    if (hotelStatus !== "CONFIRMED") continue;
    if (acceptedStatuses.length && !acceptedStatuses.includes(travelStatus)) continue;
    if (targetHotelId && hotelId !== targetHotelId) continue;

    const key1 = crewId.toLowerCase();
    const key2 = fullName.toLowerCase();

    if (assignedKeys.has(key1) || assignedKeys.has(key2)) continue;

    if (busyCrewKeys.has(key1) || busyCrewKeys.has(key2)) {
      const detail = busyCrewDetails[key1] || busyCrewDetails[key2] || {};

busy.push({
  crewId,
  fullName,
  dept,
  hotelName,
  travelStatus,
  reason: "OVERLAP",
  conflictTripRow: detail.tripRow || "",
  conflictTripId: detail.tripRow ? (tripIdByRow[detail.tripRow] || "") : "",
  conflictTripLabel: detail.tripRow
    ? ((tripIdByRow[detail.tripRow] || "") ? ("TRIP " + tripIdByRow[detail.tripRow]) : "")
    : "",
  conflictRowLabel: detail.tripRow ? ("Row " + detail.tripRow) : "",
  conflictStart: detail.start || "",
  conflictEnd: detail.end || "",
  conflictTimeText: formatBusyTimeRangeNewPaxSidebar_(detail.start, detail.end)
});
      continue;
    }

    available.push({
      crewId,
      fullName,
      dept,
      hotelName,
      travelStatus,
      callTime: "",
      pickupTime: ""
    });
  }
available.sort((a, b) => {
  const deptA = String(a.dept || "").trim().toLowerCase();
  const deptB = String(b.dept || "").trim().toLowerCase();

  if (!deptA && deptB) return 1;
  if (deptA && !deptB) return -1;
  if (deptA !== deptB) return deptA.localeCompare(deptB);

  const nameA = String(a.fullName || "").trim().toLowerCase();
  const nameB = String(b.fullName || "").trim().toLowerCase();
  return nameA.localeCompare(nameB);
});
  return {
    available,
    busy
  };
}


function formatDateNewPaxSidebar_(d) {
  if (!(d instanceof Date) || isNaN(d)) return "";
  return Utilities.formatDate(d, Session.getScriptTimeZone(), "dd/MM/yyyy");
}


function formatLooseDateTimeNewPaxSidebar_(v) {
  if (v instanceof Date && !isNaN(v)) {
    return Utilities.formatDate(v, Session.getScriptTimeZone(), "dd/MM HH:mm");
  }
  return String(v || "").trim();
}


function formatLooseTimeNewPaxSidebar_(v) {
  if (v instanceof Date && !isNaN(v)) {
    return Utilities.formatDate(v, Session.getScriptTimeZone(), "HH:mm");
  }

  if (typeof v === "number" && isFinite(v)) {
    const totalMinutes = Math.round(v * 24 * 60);
    const hh = Math.floor(totalMinutes / 60) % 24;
    const mm = totalMinutes % 60;
    return String(hh).padStart(2, "0") + ":" + String(mm).padStart(2, "0");
  }

  return String(v || "").trim();
}


function getRowIndexForTrip_(sheet, tripId){
  const hdr = getHeaderMap_(sheet);
  const tripCol = hdr["Trip_ID"];
  const data = sheet.getRange(2,tripCol,sheet.getLastRow()-1,1).getValues();

  for (let i=0;i<data.length;i++){
    if (String(data[i][0]||"") === tripId) return i+2;
  }
  return 2;
}


function getAssignedPassengersForTripAndRowNewPaxSidebar_(tripId, tripRow) {
  const ss = SpreadsheetApp.getActive();
  const sh = ss.getSheetByName("Trip_Passengers");
  const tripsSh = ss.getSheetByName("Trips");
  const crewSh = ss.getSheetByName("Crew_Master");

  if (!sh || sh.getLastRow() < 2) return [];
  if (!tripsSh) throw new Error("Trips sheet not found");
  if (!crewSh) throw new Error("Crew_Master sheet not found");

  const hdr = getHeaderMap_(sh);
  const data = sh.getRange(2, 1, sh.getLastRow() - 1, sh.getLastColumn()).getValues();

  const tripsHdr = getHeaderMap_(tripsSh);
  const tripsData = tripsSh.getRange(2, 1, Math.max(tripsSh.getLastRow() - 1, 0), tripsSh.getLastColumn()).getValues();

  const crewHdr = getHeaderMap_(crewSh);
  const crewData = crewSh.getRange(2, 1, Math.max(crewSh.getLastRow() - 1, 0), crewSh.getLastColumn()).getValues();

  const tripLookupByRow = {};
  for (let i = 0; i < tripsData.length; i++) {
    const sheetRow = i + 2;
    const r = tripsData[i];

    tripLookupByRow[sheetRow] = {
      pickupName: tripsHdr["Pickup"] ? String(r[tripsHdr["Pickup"] - 1] || "").trim() : "",
      dropoffName: tripsHdr["Dropoff"] ? String(r[tripsHdr["Dropoff"] - 1] || "").trim() : "",
      pickupId: tripsHdr["Pickup_ID"] ? String(r[tripsHdr["Pickup_ID"] - 1] || "").trim() : "",
      dropoffId: tripsHdr["Dropoff_ID"] ? String(r[tripsHdr["Dropoff_ID"] - 1] || "").trim() : ""
    };
  }

  const crewById = {};
  const crewIdCol = crewHdr["Crew_ID"] ? crewHdr["Crew_ID"] - 1 : -1;
  const deptCol = crewHdr["Department"] ? crewHdr["Department"] - 1
                : crewHdr["Dept"] ? crewHdr["Dept"] - 1
                : crewHdr["DEPT"] ? crewHdr["DEPT"] - 1
                : 2; // fallback colonna C

  for (let i = 0; i < crewData.length; i++) {
    const r = crewData[i];
    const crewId = crewIdCol >= 0 ? String(r[crewIdCol] || "").trim() : "";
    const dept = deptCol >= 0 ? String(r[deptCol] || "").trim() : "";
    if (crewId) {
      crewById[crewId] = { dept: dept };
    }
  }

  const out = [];

  for (let i = 0; i < data.length; i++) {
    const row = data[i];

    const rowTripId = hdr["Trip_ID"] ? String(row[hdr["Trip_ID"] - 1] || "").trim() : "";
    const rowTripRow = hdr["Trip_Row"] ? Number(row[hdr["Trip_Row"] - 1] || 0) : 0;

    if (rowTripId !== String(tripId)) continue;
    if (rowTripRow !== Number(tripRow)) continue;

    const crewId = hdr["Crew_ID"] ? String(row[hdr["Crew_ID"] - 1] || "").trim() : "";
    const fullName = hdr["Full_Name"] ? String(row[hdr["Full_Name"] - 1] || "").trim() : "";
    const pickupId = hdr["Pickup_ID"] ? String(row[hdr["Pickup_ID"] - 1] || "").trim() : "";
    const dropoffId = hdr["Dropoff_ID"] ? String(row[hdr["Dropoff_ID"] - 1] || "").trim() : "";
    const startDt = hdr["Start_DT"] ? row[hdr["Start_DT"] - 1] : "";
    const endDt = hdr["End_DT"] ? row[hdr["End_DT"] - 1] : "";

    if (!fullName && !crewId) continue;

    const tripMeta = tripLookupByRow[rowTripRow] || {};
    const pickupName = tripMeta.pickupName || pickupId;
    const dropoffName = tripMeta.dropoffName || dropoffId;
    const dept = (crewById[crewId] && crewById[crewId].dept) ? crewById[crewId].dept : "";

    out.push({
      crewId: crewId,
      fullName: fullName || crewId,
      dept: dept,
      pickup: pickupName,
      dropoff: dropoffName,
      vehicle: "",
      callTime: formatLooseDateTimeNewPaxSidebar_(startDt),
      pickupTime: formatLooseDateTimeNewPaxSidebar_(startDt),
      startDt: formatLooseDateTimeNewPaxSidebar_(startDt),
      endDt: formatLooseDateTimeNewPaxSidebar_(endDt)
    });
  }

  out.sort((a, b) => {
    return String(a.fullName || "").localeCompare(String(b.fullName || ""), undefined, { sensitivity: "base" });
  });
out.sort((a, b) => {
  const deptA = String(a.dept || "").trim().toLowerCase();
  const deptB = String(b.dept || "").trim().toLowerCase();

  if (!deptA && deptB) return 1;
  if (deptA && !deptB) return -1;
  if (deptA !== deptB) return deptA.localeCompare(deptB);

  const nameA = String(a.fullName || "").trim().toLowerCase();
  const nameB = String(b.fullName || "").trim().toLowerCase();
  return nameA.localeCompare(nameB);
});
  return out;
}


function getNewPaxAssignmentPayload(tripId, tripRow) {
  return buildNewPaxAssignmentPayload_(tripId, tripRow);
}


function formatBusyTimeRangeNewPaxSidebar_(start, end) {
  const tz = Session.getScriptTimeZone();

  const s = (start instanceof Date && !isNaN(start))
    ? Utilities.formatDate(start, tz, "HH:mm")
    : "";

  const e = (end instanceof Date && !isNaN(end))
    ? Utilities.formatDate(end, tz, "HH:mm")
    : "";

  if (s && e) return s + " – " + e;
  if (s) return s;
  return "";
}


/* =========================================
   HUB COVERAGE ASSISTANT
   ========================================= */

function openHubCoverageAssistant() {
  const tpl = HtmlService.createTemplateFromFile("HubCoverageAssistant.html");
  tpl.payload = buildHubCoveragePayload_();

  const html = tpl.evaluate()
    .setWidth(1200)
    .setHeight(720);

  SpreadsheetApp.getUi().showModalDialog(
    html,
    HUB_COVERAGE_CFG.TITLE
  );
}


function refreshHubCoverageAssistant() {
  openHubCoverageAssistant();
}


function buildHubCoveragePayload_() {
  try {
    const ss = SpreadsheetApp.getActive();
    const tripsSh = ss.getSheetByName(HUB_COVERAGE_CFG.TRIPS_SHEET);
    if (!tripsSh) {
      return { error: "Trips sheet not found", sections: [] };
    }

    const activeRange = tripsSh.getActiveRange();
    if (!activeRange) {
      return { error: "Select a trip row in Trips", sections: [] };
    }

    const selectedRow = activeRange.getRow();
    if (selectedRow <= 1) {
      return { error: "Select a valid trip row in Trips", sections: [] };
    }

    const tripsHdr = getHeaderMap_(tripsSh);
    const selectedValues = tripsSh.getRange(selectedRow, 1, 1, tripsSh.getLastColumn()).getValues()[0];

    const tripDate = getDateCellHCA_(selectedValues, tripsHdr, "Date");
    if (!(tripDate instanceof Date) || isNaN(tripDate)) {
      return { error: "Selected row has no valid Date", sections: [] };
    }

    const pickupId = getCellStringHCA_(selectedValues, tripsHdr, "Pickup_ID");
    const dropoffId = getCellStringHCA_(selectedValues, tripsHdr, "Dropoff_ID");
    const pickupName = getCellStringHCA_(selectedValues, tripsHdr, "Pickup");
    const dropoffName = getCellStringHCA_(selectedValues, tripsHdr, "Dropoff");

    const selectedMovement = classifyHubMovementHCA_(pickupId, dropoffId);
    if (!selectedMovement.isHubTransfer) {
      return {
        error: "Hub Coverage Assistant works only with HUB transfers (Airport / Port / Train Station).",
        sections: []
      };
    }

    const selectedHubId = selectedMovement.direction === "IN" ? pickupId : dropoffId;
    const selectedHubName = selectedMovement.direction === "IN" ? pickupName : dropoffName;

    const tripsData = tripsSh.getLastRow() >= 2
      ? tripsSh.getRange(2, 1, tripsSh.getLastRow() - 1, tripsSh.getLastColumn()).getValues()
      : [];

    const paxByTripRow = readPaxIndexByTripRowHCA_();
    const sameDayHubRows = [];

    for (let i = 0; i < tripsData.length; i++) {
      const rowValues = tripsData[i];
      const rowNum = i + 2;

      const d = getDateCellHCA_(rowValues, tripsHdr, "Date");
      if (!sameDayHCA_(tripDate, d)) continue;

      const pId = getCellStringHCA_(rowValues, tripsHdr, "Pickup_ID");
      const dId = getCellStringHCA_(rowValues, tripsHdr, "Dropoff_ID");
      const movement = classifyHubMovementHCA_(pId, dId);

      if (!movement.isHubTransfer) continue;

      const hubId = movement.direction === "IN" ? pId : dId;
      if (hubId !== selectedHubId) continue;

      sameDayHubRows.push({
        row: rowNum,
        values: rowValues,
        direction: movement.direction,
        hubId: hubId,
        passengers: paxByTripRow[rowNum] || []
      });
    }

    const groupedStops = groupHubCoverageStopsHCA_(sameDayHubRows, tripsHdr);

    const sections = [
      buildHubCoverageSectionHCA_("IN", selectedHubId, selectedHubName, tripDate, groupedStops),
      buildHubCoverageSectionHCA_("OUT", selectedHubId, selectedHubName, tripDate, groupedStops)
    ];

    return {
  error: "",
  selectedRow: selectedRow,
  date: formatDateHCA_(tripDate),
  hubId: selectedHubId,
  hubName: selectedHubName,
  selectedDirection: selectedMovement.direction,
 selectedTrip: buildSelectedTripSummaryHCA_(selectedRow, selectedValues, tripsHdr, tripsData),
  sections: sections
};

  } catch (err) {
    return {
      error: err && err.message ? err.message : String(err),
      sections: []
    };
  }
}


function buildHubCoverageSectionHCA_(direction, hubId, hubName, tripDate, groupedStops) {
  const expectedByHotel = buildExpectedByHotelHCA_(direction);

  const assignedStops = groupedStops.filter(s =>
    s.direction === direction && s.hubId === hubId
  );

  const assignedByHotel = {};
  assignedStops.forEach(stop => {
    if (!assignedByHotel[stop.hotelId]) assignedByHotel[stop.hotelId] = [];
    assignedByHotel[stop.hotelId].push(stop);
  });

  const allHotelIds = Array.from(new Set([
    ...Object.keys(expectedByHotel),
    ...Object.keys(assignedByHotel)
  ]));

  const hotels = [];
  let expectedTotal = 0;
  let assignedTotal = 0;
  let coveredHotels = 0;
  let partialHotels = 0;
  let missingHotels = 0;
  let extraHotels = 0;

  allHotelIds.forEach(hotelId => {
    const expected = expectedByHotel[hotelId] || {
      hotelId: hotelId,
      hotelName: resolveLocationNameByIdHCA_(hotelId) || hotelId,
      passengers: []
    };

    const stopList = assignedByHotel[hotelId] || [];
    const assignedNames = dedupeNamesHCA_(flattenHCA_(stopList.map(s => s.passengers || [])));

    const expectedKeys = new Set(expected.passengers.map(normalizeNameHCA_));
    const assignedKeys = new Set(assignedNames.map(normalizeNameHCA_));

    let matchedCount = 0;
    expectedKeys.forEach(k => {
      if (assignedKeys.has(k)) matchedCount++;
    });

    const missingPassengers = expected.passengers.filter(name =>
      !assignedKeys.has(normalizeNameHCA_(name))
    );

    const extraPassengers = assignedNames.filter(name =>
      !expectedKeys.has(normalizeNameHCA_(name))
    );

    const expectedCount = expected.passengers.length;
    const assignedCount = assignedNames.length;

    let status = "missing";
    if (expectedCount === 0 && assignedCount > 0) {
      status = "extra";
    } else if (expectedCount > 0 && matchedCount === 0) {
      status = "missing";
    } else if (expectedCount > 0 && matchedCount < expectedCount) {
      status = "partial";
    } else if (expectedCount > 0 && matchedCount >= expectedCount) {
      status = "covered";
    }

    if (status === "covered") coveredHotels++;
    if (status === "partial") partialHotels++;
    if (status === "missing") missingHotels++;
    if (status === "extra") extraHotels++;

    expectedTotal += expectedCount;
    assignedTotal += assignedCount;

    hotels.push({
      hotelId: hotelId,
      hotelName: expected.hotelName || hotelId,
      expectedCount: expectedCount,
      assignedCount: assignedCount,
      matchedCount: matchedCount,
      missingCount: missingPassengers.length,
      extraCount: extraPassengers.length,
      status: status,
      expectedPassengers: expected.passengers,
      assignedPassengers: assignedNames,
      missingPassengers: missingPassengers,
      extraPassengers: extraPassengers,
      stops: stopList.map(s => ({
        tripId: s.tripId,
        row: s.row,
        pickup: s.pickup,
        dropoff: s.dropoff,
        paxCount: s.passengers.length,
        passengers: s.passengers,
        serviceType: s.serviceType,
        flightNo: s.flightNo,
        arrTime: s.arrTime,
        terminalGate: s.terminalGate
      }))
    });
  });

  sortHotelsCaptainPriorityHCA_(hotels);

  const flights = buildFlightCoverageHCA_(assignedStops, expectedByHotel, tripDate);

  const missingPassengerGroups = [];
  hotels.forEach(h => {
    if (h.missingPassengers && h.missingPassengers.length) {
      missingPassengerGroups.push({
        hotelId: h.hotelId,
        hotelName: h.hotelName,
        passengers: h.missingPassengers,
        count: h.missingPassengers.length
      });
    }
  });

  return {
    direction: direction,
    hubId: hubId,
    hubName: hubName,
    date: formatDateHCA_(tripDate),
    expectedTotal: expectedTotal,
    assignedTotal: assignedTotal,
    coveredHotels: coveredHotels,
    partialHotels: partialHotels,
    missingHotels: missingHotels,
    extraHotels: extraHotels,
    stopsCount: assignedStops.length,
    hotels: hotels,
    flights: flights,
    missingPassengerGroups: missingPassengerGroups,
    missingPassengerTotal: missingPassengerGroups.reduce((n, x) => n + x.count, 0)
  };
}


function buildExpectedByHotelHCA_(direction) {
  const ss = SpreadsheetApp.getActive();
  const crewSh = ss.getSheetByName(HUB_COVERAGE_CFG.CREW_SHEET);
  if (!crewSh || crewSh.getLastRow() < 2) return {};

  const hdr = getHeaderMap_(crewSh);
  const data = crewSh.getRange(2, 1, crewSh.getLastRow() - 1, crewSh.getLastColumn()).getDisplayValues();

  const targetStatus = direction === "IN" ? "IN" : "OUT";
  const out = {};

  data.forEach(r => {
    const fullName = getCellStringByHeaderIndexHCA_(r, hdr, "Full_Name");
    const hotelId = getCellStringByHeaderIndexHCA_(r, hdr, "Hotel_ID").toUpperCase();
    const hotelStatus = getCellStringByHeaderIndexHCA_(r, hdr, "Hotel_Status").toUpperCase();
    const travelStatus = getCellStringByHeaderIndexHCA_(r, hdr, "Travel_Status").toUpperCase();

    if (!fullName || !hotelId) return;
    if (hotelStatus !== "CONFIRMED") return;
    if (travelStatus !== targetStatus) return;

    if (!out[hotelId]) {
      out[hotelId] = {
        hotelId: hotelId,
        hotelName: resolveLocationNameByIdHCA_(hotelId) || hotelId,
        passengers: []
      };
    }

    out[hotelId].passengers.push(fullName);
  });

  Object.keys(out).forEach(hotelId => {
    out[hotelId].passengers = dedupeNamesHCA_(out[hotelId].passengers);
  });

  return out;
}


function readPaxIndexByTripRowHCA_() {
  const sh = SpreadsheetApp.getActive().getSheetByName(HUB_COVERAGE_CFG.PAX_INDEX_SHEET);
  if (!sh || sh.getLastRow() < 2) return {};

  const data = sh.getDataRange().getValues();
  const hdr = data.shift();

  const rowCol = hdr.indexOf("Trip_Row");
  const nameCol = hdr.indexOf("Full_Name");

  if (rowCol === -1 || nameCol === -1) return {};

  const out = {};
  data.forEach(r => {
    const tripRow = Number(r[rowCol]);
    const fullName = String(r[nameCol] || "").trim();
    if (!tripRow || !fullName) return;

    if (!out[tripRow]) out[tripRow] = [];
    out[tripRow].push(fullName);
  });

  Object.keys(out).forEach(k => {
    out[k] = dedupeNamesHCA_(out[k]);
  });

  return out;
}


function groupHubCoverageStopsHCA_(sameDayHubRows, hdr) {
  const map = {};

  sameDayHubRows.forEach(item => {
    const r = item.values;

    const tripId = getCellStringHCA_(r, hdr, "Trip_ID");
    const pickup = getCellStringHCA_(r, hdr, "Pickup");
    const dropoff = getCellStringHCA_(r, hdr, "Dropoff");
    const pickupId = getCellStringHCA_(r, hdr, "Pickup_ID");
    const dropoffId = getCellStringHCA_(r, hdr, "Dropoff_ID");
    const serviceType = getCellStringHCA_(r, hdr, "Service_Type");
    const flightNo = getCellStringHCA_(r, hdr, "Flight/Train_No");
    const terminalGate = getCellStringHCA_(r, hdr, "Terminal/Gate");
    const arrTime = formatTimeLooseHCA_(getCellValueHCA_(r, hdr, "Arr_Time"));

    const vehicleId = getCellStringHCA_(r, hdr, "Vehicle_ID");
    const driverName =
      getCellStringHCA_(r, hdr, "Driver_Name(auto)") ||
      getCellStringHCA_(r, hdr, "Driver_Name");
    const signCode =
      getCellStringHCA_(r, hdr, "Sign_Code(auto)") ||
      getCellStringHCA_(r, hdr, "Sign_Code") ||
      "";

    const hotelId = item.direction === "IN" ? dropoffId : pickupId;
    const hotelName = item.direction === "IN" ? dropoff : pickup;

    const groupKey = [
      item.direction,
      item.hubId,
      tripId,
      pickupId,
      dropoffId
    ].join("||");

    if (!map[groupKey]) {
      map[groupKey] = {
        key: groupKey,
        row: item.row,
        tripId: tripId,
        direction: item.direction,
        hubId: item.hubId,
        hotelId: hotelId,
        hotelName: hotelName,
        pickup: pickup,
        dropoff: dropoff,
        pickupId: pickupId,
        dropoffId: dropoffId,
        serviceType: serviceType,
        flightNo: flightNo,
        arrTime: arrTime,
        terminalGate: terminalGate,
        passengers: [],
        vehicleIds: [],
        driverNames: [],
        signCodes: []
      };
    }

    map[groupKey].passengers.push.apply(
      map[groupKey].passengers,
      item.passengers || []
    );

    if (vehicleId) map[groupKey].vehicleIds.push(vehicleId);
    if (driverName) map[groupKey].driverNames.push(driverName);
    if (signCode) map[groupKey].signCodes.push(signCode);
  });

  return Object.values(map).map(stop => {
    stop.passengers = dedupeNamesHCA_(stop.passengers);
    stop.vehicleIds = Array.from(new Set((stop.vehicleIds || []).filter(Boolean)));
    stop.driverNames = Array.from(new Set((stop.driverNames || []).filter(Boolean)));
    stop.signCodes = Array.from(new Set((stop.signCodes || []).filter(Boolean)));

    stop.vehicleId = stop.vehicleIds.join(", ");
    stop.driverName = stop.driverNames.join(", ");
    stop.signCode = stop.signCodes.join(", ");

    return stop;
  });
}


function buildFlightCoverageHCA_(assignedStops, expectedByHotel, tripDate) {
  const flights = groupStopsByFlightHCA_(assignedStops);

  flights.forEach(group => {
    group.expectedTotal = 0;
    group.coveredHotels = 0;
    group.partialHotels = 0;
    group.missingHotels = 0;
    group.extraHotels = 0;

    const hotels = Object.values(group.hotels);

    hotels.forEach(h => {
      const expected = expectedByHotel[h.hotelId] || {
        hotelId: h.hotelId,
        hotelName: h.hotelName || resolveLocationNameByIdHCA_(h.hotelId) || h.hotelId,
        passengers: []
      };

      const expectedNames = dedupeNamesHCA_(expected.passengers || []);
      const assignedNames = dedupeNamesHCA_(h.passengers || []);

      const expectedKeys = new Set(expectedNames.map(normalizeNameHCA_));
      const assignedKeys = new Set(assignedNames.map(normalizeNameHCA_));

      let matchedCount = 0;
      expectedKeys.forEach(k => {
        if (assignedKeys.has(k)) matchedCount++;
      });

      const missingPassengers = expectedNames.filter(name => {
        return !assignedKeys.has(normalizeNameHCA_(name));
      });

      const extraPassengers = assignedNames.filter(name => {
        return !expectedKeys.has(normalizeNameHCA_(name));
      });

      const expectedCount = expectedNames.length;
      const assignedCount = assignedNames.length;

      let status = "missing";
      if (expectedCount === 0 && assignedCount > 0) {
        status = "extra";
      } else if (expectedCount > 0 && matchedCount === 0) {
        status = "missing";
      } else if (expectedCount > 0 && matchedCount < expectedCount) {
        status = "partial";
      } else if (expectedCount > 0 && matchedCount >= expectedCount) {
        status = "covered";
      }

      h.hotelName = expected.hotelName || h.hotelName || h.hotelId;
      h.expectedCount = expectedCount;
      h.assignedCount = assignedCount;
      h.matchedCount = matchedCount;
      h.expectedPassengers = expectedNames;
      h.assignedPassengers = assignedNames;
      h.missingPassengers = missingPassengers;
      h.missingCount = missingPassengers.length;
      h.extraPassengers = extraPassengers;
      h.extraCount = extraPassengers.length;
      h.status = status;

      group.expectedTotal += expectedCount;
      if (status === "covered") group.coveredHotels++;
      if (status === "partial") group.partialHotels++;
      if (status === "missing") group.missingHotels++;
      if (status === "extra") group.extraHotels++;
    });

    group.hotelList = hotels.sort(compareHotelsCaptainPriorityHCA_);
    group.totalPax = dedupeNamesHCA_(group.passengers || []).length;
    group.targetDateTime = buildFlightTargetDateTimeHCA_(tripDate, group.arrTime);
    group.suggestedAssignments = buildSuggestedFleetAssignmentsHCA_(group.totalPax, group.targetDateTime);
    group.vehiclePlan = summarizeAssignmentsByTypeHCA_(group.suggestedAssignments);
    group.vehiclePlanText = group.vehiclePlan.length
      ? group.vehiclePlan.map(x => x.count + " " + x.vehicleType).join(" + ")
      : "No vehicle plan";

    group.stops = group.stops.map(s => {
  const hotel = group.hotels[s.hotelId] || {};
  return {
    tripId: s.tripId,
    row: s.row,
    pickup: s.pickup,
    dropoff: s.dropoff,
    hotelId: s.hotelId,
    hotelName: hotel.hotelName || s.hotelName || resolveLocationNameByIdHCA_(s.hotelId) || s.hotelId,
    passengers: dedupeNamesHCA_(s.passengers || []),
    paxCount: dedupeNamesHCA_(s.passengers || []).length,
    serviceType: s.serviceType,
    vehicleId: s.vehicleId || "",
    driverName: s.driverName || "",
    signCode: s.signCode || ""
  };
});

    const groupedMissing = [];
    group.hotelList.forEach(h => {
      if (h.missingPassengers && h.missingPassengers.length) {
        groupedMissing.push({
          hotelId: h.hotelId,
          hotelName: h.hotelName,
          passengers: h.missingPassengers,
          count: h.missingPassengers.length
        });
      }
    });
    group.missingPassengerGroups = groupedMissing;
    group.missingPassengerTotal = groupedMissing.reduce((n, x) => n + x.count, 0);
  });

  flights.sort((a, b) => {
    const ta = a.arrTime || "";
    const tb = b.arrTime || "";
    if (ta !== tb) return ta.localeCompare(tb);

    const fa = a.flight || "";
    const fb = b.flight || "";
    return fa.localeCompare(fb);
  });

  return flights;
}


function groupStopsByFlightHCA_(stops) {
  const map = {};

  stops.forEach(s => {
    const flight = String(s.flightNo || "NO FLIGHT").trim();
    const arr = String(s.arrTime || "").trim();
    const key = [s.direction, s.hubId, flight, arr].join("||");

    if (!map[key]) {
      map[key] = {
        direction: s.direction,
        hubId: s.hubId,
        flight: flight,
        arrTime: arr,
        terminalGate: s.terminalGate || "",
        passengers: [],
        hotels: {},
        stops: []
      };
    }

    map[key].passengers.push.apply(map[key].passengers, s.passengers || []);

    map[key].stops.push({
  tripId: s.tripId,
  row: s.row,
  pickup: s.pickup,
  dropoff: s.dropoff,
  hotelId: s.hotelId,
  hotelName: s.hotelName,
  passengers: dedupeNamesHCA_(s.passengers || []),
  paxCount: dedupeNamesHCA_(s.passengers || []).length,
  serviceType: s.serviceType,
  vehicleId: s.vehicleId || "",
  driverName: s.driverName || "",
  signCode: s.signCode || ""
});

    if (!map[key].hotels[s.hotelId]) {
      map[key].hotels[s.hotelId] = {
        hotelId: s.hotelId,
        hotelName: s.hotelName || resolveLocationNameByIdHCA_(s.hotelId) || s.hotelId,
        passengers: []
      };
    }

    map[key].hotels[s.hotelId].passengers.push.apply(
      map[key].hotels[s.hotelId].passengers,
      s.passengers || []
    );
  });

  return Object.values(map).map(g => {
    g.passengers = dedupeNamesHCA_(g.passengers);
    Object.keys(g.hotels).forEach(hotelId => {
      g.hotels[hotelId].passengers = dedupeNamesHCA_(g.hotels[hotelId].passengers);
      g.hotels[hotelId].count = g.hotels[hotelId].passengers.length;
    });
    return g;
  });
}


function getFleetVehiclesHCA_() {
  const sh = SpreadsheetApp.getActive().getSheetByName(HUB_COVERAGE_CFG.FLEET_SHEET);
  if (!sh || sh.getLastRow() < 2) return [];

  const hdr = getHeaderMap_(sh);
  const data = sh.getRange(2, 1, sh.getLastRow() - 1, sh.getLastColumn()).getValues();

  const vehicles = [];

  data.forEach(r => {
    const vehicleId = getCellStringHCA_(r, hdr, "Vehicle_ID");
    const type = getCellStringHCA_(r, hdr, "Type");
    const driverName = getCellStringHCA_(r, hdr, "Driver_Name");
    const capacity = Number(getCellValueHCA_(r, hdr, "Capacity")) || 0;

    if (!vehicleId || capacity <= 0) return;

    vehicles.push({
      vehicleId: vehicleId,
      type: type || vehicleId,
      driverName: driverName || "",
      capacity: capacity
    });
  });

  return vehicles;
}


function buildSuggestedFleetAssignmentsHCA_(paxTotal, targetDateTime) {
  paxTotal = Number(paxTotal) || 0;
  if (paxTotal <= 0) return [];

  const allVehicles = getFleetVehiclesHCA_();
  if (!allVehicles.length) return [];

  const availabilityMap = getVehicleAvailabilityMapHCA_(targetDateTime);

  const availableNow = allVehicles
    .filter(v => {
      if (!targetDateTime) return true;
      const availableFrom = availabilityMap[v.vehicleId];
      if (!availableFrom) return true;
      return availableFrom.getTime() <= targetDateTime.getTime();
    })
    .sort((a, b) => b.capacity - a.capacity);

  let chosen = chooseBestVehicleComboHCA_(availableNow, paxTotal);

  if (!chosen.length) {
    const allWithAvailability = allVehicles
      .slice()
      .sort((a, b) => {
        const aa = availabilityMap[a.vehicleId] ? availabilityMap[a.vehicleId].getTime() : 0;
        const bb = availabilityMap[b.vehicleId] ? availabilityMap[b.vehicleId].getTime() : 0;
        if (aa !== bb) return aa - bb;
        return b.capacity - a.capacity;
      });

    chosen = chooseBestVehicleComboHCA_(allWithAvailability, paxTotal);
  }

  return chosen.map(v => ({
    vehicleId: v.vehicleId,
    vehicleType: v.type,
    driverName: v.driverName,
    capacity: v.capacity,
    availableFrom: availabilityMap[v.vehicleId]
      ? formatDateTimeHCA_(availabilityMap[v.vehicleId])
      : ""
  }));
}


function chooseBestVehicleComboHCA_(vehicles, paxTotal) {
  if (!vehicles.length) return [];

  let best = null;

  function search(startIdx, combo, seats) {
    if (seats >= paxTotal) {
      const vehicleCount = combo.length;
      const waste = seats - paxTotal;
      const score = vehicleCount * 100000 + waste * 100 + seats;

      if (!best || score < best.score) {
        best = {
          combo: combo.slice(),
          score: score
        };
      }
      return;
    }

    if (combo.length >= HUB_COVERAGE_CFG.MAX_VEHICLES_IN_PLAN) return;

    for (let i = startIdx; i < vehicles.length; i++) {
      combo.push(vehicles[i]);
      search(i + 1, combo, seats + vehicles[i].capacity);
      combo.pop();
    }
  }

  search(0, [], 0);
  return best ? best.combo : [];
}


function summarizeAssignmentsByTypeHCA_(assignments) {
  const map = {};
  (assignments || []).forEach(a => {
    const key = a.vehicleType || a.vehicleId || "Vehicle";
    if (!map[key]) map[key] = 0;
    map[key]++;
  });

  return Object.keys(map).sort().map(k => ({
    vehicleType: k,
    count: map[k]
  }));
}


function getVehicleAvailabilityMapHCA_(targetDateTime) {
  const out = {};
  const tripsSh = SpreadsheetApp.getActive().getSheetByName(HUB_COVERAGE_CFG.TRIPS_SHEET);
  if (!tripsSh || tripsSh.getLastRow() < 2) return out;

  const hdr = getHeaderMap_(tripsSh);
  const vehicleCol = hdr["Vehicle_ID"];
  const startCol = hdr["Start_DT"];
  const endCol = hdr["End_DT"];

  if (!vehicleCol || !startCol || !endCol) return out;

  const data = tripsSh.getRange(2, 1, tripsSh.getLastRow() - 1, tripsSh.getLastColumn()).getValues();

  data.forEach(r => {
    const vehicleId = getCellStringHCA_(r, hdr, "Vehicle_ID");
    const startDt = getCellValueHCA_(r, hdr, "Start_DT");
    const endDt = getCellValueHCA_(r, hdr, "End_DT");

    if (!vehicleId) return;
    if (!(startDt instanceof Date) || isNaN(startDt)) return;
    if (!(endDt instanceof Date) || isNaN(endDt)) return;

    if (targetDateTime && !sameDayHCA_(targetDateTime, startDt)) return;

    if (!out[vehicleId] || endDt.getTime() > out[vehicleId].getTime()) {
      out[vehicleId] = endDt;
    }
  });

  return out;
}


function classifyHubMovementHCA_(pickupId, dropoffId) {
  pickupId = String(pickupId || "").trim().toUpperCase();
  dropoffId = String(dropoffId || "").trim().toUpperCase();

  const pickupIsHub = HUB_COVERAGE_CFG.HUB_PREFIX_RE.test(pickupId);
  const dropoffIsHub = HUB_COVERAGE_CFG.HUB_PREFIX_RE.test(dropoffId);

  if (pickupIsHub && !dropoffIsHub) {
    return { isHubTransfer: true, direction: "IN" };
  }

  if (!pickupIsHub && dropoffIsHub) {
    return { isHubTransfer: true, direction: "OUT" };
  }

  return { isHubTransfer: false, direction: "" };
}


function sortHotelsCaptainPriorityHCA_(hotels) {
  hotels.sort(compareHotelsCaptainPriorityHCA_);
}


function compareHotelsCaptainPriorityHCA_(a, b) {
  const statusPriority = {
    missing: 1,
    partial: 2,
    extra: 3,
    covered: 4
  };

  const pa = statusPriority[a.status] || 99;
  const pb = statusPriority[b.status] || 99;
  if (pa !== pb) return pa - pb;

  const ea = Number(a.expectedCount || 0);
  const eb = Number(b.expectedCount || 0);
  if (ea !== eb) return eb - ea;

  const na = String(a.hotelName || "").toLowerCase();
  const nb = String(b.hotelName || "").toLowerCase();
  return na.localeCompare(nb);
}


function resolveLocationNameByIdHCA_(id) {
  id = String(id || "").trim();
  if (!id) return "";

  const ss = SpreadsheetApp.getActive();
  const sources = [
    { sheet: HUB_COVERAGE_CFG.HOTELS_SHEET, idHeader: "Pickup_ID", nameHeader: "Hotel_Name" },
    { sheet: HUB_COVERAGE_CFG.HUBS_SHEET, idHeader: "Pickup_ID", nameHeader: "Hubs_Name" }
  ];

  for (const src of sources) {
    const sh = ss.getSheetByName(src.sheet);
    if (!sh || sh.getLastRow() < 2) continue;

    const hdr = getHeaderMap_(sh);
    const idCol = hdr[src.idHeader];
    const nameCol = hdr[src.nameHeader];
    if (!idCol || !nameCol) continue;

    const data = sh.getRange(2, 1, sh.getLastRow() - 1, sh.getLastColumn()).getDisplayValues();
    for (let i = 0; i < data.length; i++) {
      if (String(data[i][idCol - 1] || "").trim() === id) {
        return String(data[i][nameCol - 1] || "").trim();
      }
    }
  }

  return "";
}


function getCellStringHCA_(rowValues, hdr, header) {
  const col = hdr[header];
  if (!col) return "";
  return String(rowValues[col - 1] || "").trim();
}


function getCellValueHCA_(rowValues, hdr, header) {
  const col = hdr[header];
  if (!col) return "";
  return rowValues[col - 1];
}


function getDateCellHCA_(rowValues, hdr, header) {
  const col = hdr[header];
  if (!col) return null;
  const v = rowValues[col - 1];
  return v instanceof Date && !isNaN(v) ? v : null;
}


function getCellStringByHeaderIndexHCA_(rowValues, hdr, header) {
  const col = hdr[header];
  if (!col) return "";
  return String(rowValues[col - 1] || "").trim();
}


function normalizeNameHCA_(v) {
  return String(v || "")
    .replace(/\u00A0/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}


function dedupeNamesHCA_(names) {
  const map = {};
  (names || []).forEach(name => {
    const clean = String(name || "").trim();
    if (!clean) return;
    map[normalizeNameHCA_(clean)] = clean;
  });
  return Object.values(map).sort((a, b) => a.localeCompare(b));
}


function flattenHCA_(arr) {
  return [].concat.apply([], arr || []);
}


function sameDayHCA_(a, b) {
  if (!(a instanceof Date) || isNaN(a)) return false;
  if (!(b instanceof Date) || isNaN(b)) return false;

  return a.getFullYear() === b.getFullYear() &&
         a.getMonth() === b.getMonth() &&
         a.getDate() === b.getDate();
}


function formatDateHCA_(d) {
  if (!(d instanceof Date) || isNaN(d)) return "";
  return Utilities.formatDate(d, Session.getScriptTimeZone(), "dd/MM/yyyy");
}


function formatDateTimeHCA_(d) {
  if (!(d instanceof Date) || isNaN(d)) return "";
  return Utilities.formatDate(d, Session.getScriptTimeZone(), "dd/MM/yyyy HH:mm");
}


function formatTimeLooseHCA_(value) {
  if (value instanceof Date && !isNaN(value)) {
    return Utilities.formatDate(value, Session.getScriptTimeZone(), "HH:mm");
  }

  if (typeof value === "number" && isFinite(value)) {
    const totalMinutes = Math.round((value % 1) * 1440);
    const hh = Math.floor(totalMinutes / 60);
    const mm = totalMinutes % 60;
    return pad2HCA_(hh) + ":" + pad2HCA_(mm);
  }

  const s = String(value || "").trim();
  if (!s) return "";
  return s;
}


function buildFlightTargetDateTimeHCA_(dateValue, timeString) {
  if (!(dateValue instanceof Date) || isNaN(dateValue)) return null;

  const d = new Date(dateValue);
  const s = String(timeString || "").trim().replace(/\./g, ":");
  const m = s.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;

  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (!Number.isInteger(hh) || !Number.isInteger(mm)) return null;
  if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;

  d.setHours(hh, mm, 0, 0);
  return d;
}


function pad2HCA_(n) {
  n = Number(n) || 0;
  return String(n).padStart(2, "0");
}


function buildSelectedTripSummaryHCA_(selectedRow, selectedValues, hdr, tripsData) {
  const tripId = getCellStringHCA_(selectedValues, hdr, "Trip_ID");
  const tripDate = getDateCellHCA_(selectedValues, hdr, "Date");

  const pickupId = getCellStringHCA_(selectedValues, hdr, "Pickup_ID");
  const dropoffId = getCellStringHCA_(selectedValues, hdr, "Dropoff_ID");
  const movement = classifyHubMovementHCA_(pickupId, dropoffId);

  const paxByTripRow = readPaxIndexByTripRowHCA_();

  const rows = [];
  const hotelMap = {};
  const units = new Set();
  const serviceTypes = new Set();
  const vehicleIds = new Set();
  const driverNames = new Set();
  const flightNos = new Set();
  const arrTimes = new Set();
  const terminalGates = new Set();
  const pickupTimes = new Set();
  const notes = [];
  const paxNames = new Set();

  (tripsData || []).forEach((row, idx) => {
    const rowNum = idx + 2;
    const rowTripId = getCellStringHCA_(row, hdr, "Trip_ID");
    const rowDate = getDateCellHCA_(row, hdr, "Date");

    if (rowTripId !== tripId) return;
    if (!sameDayHCA_(tripDate, rowDate)) return;

    rows.push(rowNum);

    const unit = getCellStringHCA_(row, hdr, "Unit");
    const serviceType = getCellStringHCA_(row, hdr, "Service_Type");
    const vehicleId = getCellStringHCA_(row, hdr, "Vehicle_ID");
    const driverName =
      getCellStringHCA_(row, hdr, "Driver_Name(auto)") ||
      getCellStringHCA_(row, hdr, "Driver_Name");
    const flightNo = getCellStringHCA_(row, hdr, "Flight/Train_No");
    const arrTime = formatTimeLooseHCA_(getCellValueHCA_(row, hdr, "Arr_Time"));
    const terminalGate = getCellStringHCA_(row, hdr, "Terminal/Gate");
    const pickupTime = formatTimeLooseHCA_(getCellValueHCA_(row, hdr, "Pickup_Time"));
    const note = getCellStringHCA_(row, hdr, "Notes");

    if (unit) units.add(unit);
    if (serviceType) serviceTypes.add(serviceType);
    if (vehicleId) vehicleIds.add(vehicleId);
    if (driverName) driverNames.add(driverName);
    if (flightNo) flightNos.add(flightNo);
    if (arrTime) arrTimes.add(arrTime);
    if (terminalGate) terminalGates.add(terminalGate);
    if (pickupTime) pickupTimes.add(pickupTime);
    if (note) notes.push(note);

    const hotelId = movement.direction === "IN"
      ? getCellStringHCA_(row, hdr, "Dropoff_ID")
      : getCellStringHCA_(row, hdr, "Pickup_ID");

    const hotelName = movement.direction === "IN"
      ? getCellStringHCA_(row, hdr, "Dropoff")
      : getCellStringHCA_(row, hdr, "Pickup");

    if (!hotelId && !hotelName) return;

    const key = hotelId || hotelName;

    if (!hotelMap[key]) {
      hotelMap[key] = {
        hotelId: hotelId || "",
        hotelName: hotelName || key,
        passengers: []
      };
    }

    (paxByTripRow[rowNum] || []).forEach(name => {
      if (!name) return;
      hotelMap[key].passengers.push(name);
      paxNames.add(name);
    });
  });

  const hotelGroups = Object.values(hotelMap)
    .map(h => {
      const pax = dedupeNamesHCA_(h.passengers || []);
      return {
        hotelId: h.hotelId,
        hotelName: h.hotelName,
        passengers: pax,
        count: pax.length
      };
    })
    .sort((a, b) => String(a.hotelName || "").localeCompare(String(b.hotelName || "")));

  return {
    tripId: tripId || "-",
    row: rows.length ? rows.join(", ") : String(selectedRow || "-"),
    rowCount: rows.length,
    unit: Array.from(units).join(", "),
    serviceType: Array.from(serviceTypes).join(", "),
    flightNo: Array.from(flightNos).join(", "),
    arrTime: Array.from(arrTimes).join(", "),
    terminalGate: Array.from(terminalGates).join(", "),
    pickupTime: Array.from(pickupTimes).join(", "),
    vehicleId: Array.from(vehicleIds).join(", "),
    driverName: Array.from(driverNames).join(", "),
    notes: dedupeTextHCA_(notes).join(" | "),
    hubName: movement.direction === "IN"
      ? getCellStringHCA_(selectedValues, hdr, "Pickup")
      : getCellStringHCA_(selectedValues, hdr, "Dropoff"),
    hubId: movement.direction === "IN" ? pickupId : dropoffId,
    hotelGroups: hotelGroups,
    hotelNames: hotelGroups.map(h => h.hotelName),
    hotelCount: hotelGroups.length,
    totalPax: paxNames.size,
    isMultiDropoff: hotelGroups.length > 1 ? "YES" : "NO"
  };
}


function dedupeTextHCA_(items) {
  const seen = {};
  const out = [];
  (items || []).forEach(v => {
    const s = String(v || "").trim();
    if (!s) return;
    if (seen[s]) return;
    seen[s] = true;
    out.push(s);
  });
  return out;
}

/* =========================================
   FLEET OVERVIEW DATA
   Restituisce la situazione di tutti i veicoli
   per una data. Chiamabile da Sheets (modal)
   e da WrapTripApp (mobile).
   ========================================= */

/**
 * Restituisce la timeline di tutti i veicoli per la data indicata.
 * @param  {string|null} targetDateStr  "yyyy-MM-dd" oppure null per oggi
 * @return {Object}  { ok, date, dateDisplay, isToday, vehicles, generatedAt }
 */
function getFleetOverviewData(targetDateStr) {
  try {
    const ss       = SpreadsheetApp.getActive();
    const tripsSh  = ss.getSheetByName(CFG.SHEETS.TRIPS);
    const fleetSh  = ss.getSheetByName(CFG.SHEETS.FLEET);

    if (!tripsSh) return { ok: false, error: "Trips sheet not found" };
    if (!fleetSh) return { ok: false, error: "Fleet sheet not found" };

    // Determina la data target
    let targetDate;
    if (targetDateStr) {
      const m = String(targetDateStr).match(/^(\d{4})-(\d{2})-(\d{2})$/);
      if (m) targetDate = new Date(+m[1], +m[2] - 1, +m[3]);
    }
    if (!targetDate || isNaN(targetDate)) targetDate = new Date();
    targetDate.setHours(0, 0, 0, 0);

    const tz          = Session.getScriptTimeZone();
    const dateDisplay = Utilities.formatDate(targetDate, tz, "dd/MM/yyyy");
    const todayStr    = Utilities.formatDate(new Date(), tz, "yyyy-MM-dd");
    const targetStr   = Utilities.formatDate(targetDate, tz, "yyyy-MM-dd");

    // Legge tutti i veicoli da Fleet
    const fleetHdr  = getHeaderMap_(fleetSh);
    const fleetRows = fleetSh.getLastRow() >= 2
      ? fleetSh.getRange(2, 1, fleetSh.getLastRow() - 1, fleetSh.getLastColumn()).getValues()
      : [];

    const vehicles = {};
    fleetRows.forEach(r => {
      const id = String(r[(fleetHdr["Vehicle_ID"] || 1) - 1] || "").trim();
      if (!id) return;
      vehicles[id] = {
        vehicleId:  id,
        type:       String(r[(fleetHdr["Type"]        || 2) - 1] || "").trim(),
        capacity:   Number(r[(fleetHdr["Capacity"]    || 3) - 1] || 0),
        driverName: String(r[(fleetHdr["Driver_Name"] || 4) - 1] || "").trim(),
        signCode:   String(r[(fleetHdr["Sign_Code"]   || 5) - 1] || "").trim(),
        trips:      []
      };
    });

    // Legge i trip del giorno da Trips
    const tripsHdr = getHeaderMap_(tripsSh);
    const lastRow  = getRealLastTripRow_(tripsSh);
    if (lastRow >= 2) {
      const tripsData = tripsSh.getRange(2, 1, lastRow - 1, tripsSh.getLastColumn()).getValues();
      tripsData.forEach(row => {
        const vId = tripsHdr["Vehicle_ID"]
          ? String(row[tripsHdr["Vehicle_ID"] - 1] || "").trim() : "";
        if (!vId || !vehicles[vId]) return;

        const rowDate = tripsHdr["Date"] ? row[tripsHdr["Date"] - 1] : null;
        if (!(rowDate instanceof Date) || isNaN(rowDate)) return;
        const rd = new Date(rowDate); rd.setHours(0,0,0,0);
        if (Utilities.formatDate(rd, tz, "yyyy-MM-dd") !== targetStr) return;

        const tripId    = tripsHdr["Trip_ID"]     ? String(row[tripsHdr["Trip_ID"]     - 1] || "").trim() : "";
        const pickup    = tripsHdr["Pickup"]       ? String(row[tripsHdr["Pickup"]      - 1] || "").trim() : "";
        const dropoff   = tripsHdr["Dropoff"]      ? String(row[tripsHdr["Dropoff"]     - 1] || "").trim() : "";
        const pickupId  = tripsHdr["Pickup_ID"]    ? String(row[tripsHdr["Pickup_ID"]   - 1] || "").trim() : "";
        const dropoffId = tripsHdr["Dropoff_ID"]   ? String(row[tripsHdr["Dropoff_ID"]  - 1] || "").trim() : "";
        const startDt   = tripsHdr["Start_DT"]     ? row[tripsHdr["Start_DT"]   - 1] : null;
        const endDt     = tripsHdr["End_DT"]       ? row[tripsHdr["End_DT"]     - 1] : null;
        const callVal   = tripsHdr["Call"]          ? row[tripsHdr["Call"]       - 1] : null;
        const paxCount  = tripsHdr["Pax_Count(auto)"]
          ? Number(row[tripsHdr["Pax_Count(auto)"] - 1] || 0) : 0;
        const svcType   = tripsHdr["Service_Type"] ? String(row[tripsHdr["Service_Type"] - 1] || "").trim() : "";
        const status    = tripsHdr["Status"]        ? String(row[tripsHdr["Status"]       - 1] || "").trim() : "";

        const startMs = (startDt instanceof Date && !isNaN(startDt)) ? startDt.getTime() : null;
        const endMs   = (endDt   instanceof Date && !isNaN(endDt))   ? endDt.getTime()   : null;

        // Multi-dropoff: stesso tripId → espandi la finestra
        const existing = vehicles[vId].trips.find(t => t.tripId === tripId);
        if (existing) {
          if (startMs && (!existing.startMs || startMs < existing.startMs)) {
            existing.startMs      = startMs;
            existing.startDisplay = _fleetFmtTime_(startDt, tz);
          }
          if (endMs && (!existing.endMs || endMs > existing.endMs)) {
            existing.endMs      = endMs;
            existing.endDisplay = _fleetFmtTime_(endDt, tz);
            // Aggiorna l'ultimo dropoffId (quello con endMs più tardivo = ultima fermata)
            if (dropoffId) existing.dropoffId = dropoffId;
          }
          if (dropoff   && !existing.dropoffs.includes(dropoff))     existing.dropoffs.push(dropoff);
          if (dropoffId && !existing.dropoffIds.includes(dropoffId)) existing.dropoffIds.push(dropoffId);
          existing.paxCount = Math.max(existing.paxCount, paxCount);
          return;
        }

        const callDisplay = (callVal instanceof Date && !isNaN(callVal))
          ? _fleetFmtTime_(callVal, tz) : "";

        vehicles[vId].trips.push({
          tripId,
          pickup,
          pickupId,
          dropoffs:     dropoff ? [dropoff] : [],
          dropoffIds:   dropoffId ? [dropoffId] : [],
          dropoffId,
          startMs,
          endMs,
          startDisplay: startMs ? _fleetFmtTime_(startDt, tz) : callDisplay,
          endDisplay:   endMs   ? _fleetFmtTime_(endDt, tz)   : "",
          paxCount,
          svcType,
          status
        });
      });
    }

    // Pre-carica la tabella rotte una volta sola per tutti i veicoli
    const routesSh   = ss.getSheetByName(CFG.SHEETS.ROUTES);
    const routeTable = {};  // "FROM||TO" → minutes
    if (routesSh && routesSh.getLastRow() >= 2) {
      const rd = routesSh.getRange(2, 1, routesSh.getLastRow() - 1, 3).getValues();
      rd.forEach(r => {
        const f = String(r[0]||"").trim();
        const t = String(r[1]||"").trim();
        const d = Number(r[2]||0);
        if (f && t && d > 0) routeTable[f+"||"+t] = d;
      });
    }

    function _lookupRoute_(fromId, toId) {
      if (!fromId || !toId || fromId === toId) return 0;
      return routeTable[fromId+"||"+toId]
        || routeTable[toId+"||"+fromId]   // bidirezionale come fallback
        || (typeof estimateMinByIds_ === "function"
            ? Number(estimateMinByIds_(fromId, toId)||0) : 0);
    }

    // Calcola statistiche + stato live per ogni veicolo
    const nowMs = new Date().getTime();

    const result = Object.values(vehicles).map(v => {
      v.trips.sort((a, b) => (a.startMs || 0) - (b.startMs || 0));

      let busyNow          = false;
      let nextFreeMs       = null;
      let totalMinutes     = 0;
      let activeTripRoute  = "";   // rotta del trip in corso ora
      let activePickupId   = "";   // punto di partenza del trip attivo (es. SET_1)
      let activePickupName = "";
      let activeDropoffId  = "";   // ultimo dropoff del trip attivo
      let returnToBaseMs   = null; // quando il veicolo torna al punto di partenza
      let progressPct      = 0;    // % completamento trip corrente (per barra progresso)
      let etaFreeDisplay   = "";   // orario fine trip corrente
      let etaReturnDisplay = "";   // orario ritorno al punto di partenza

      v.trips.forEach(t => {
        t.route = t.pickup
          + (t.dropoffs.length ? " → " + t.dropoffs.join(", ") : "");

        if (t.startMs && t.endMs) {
          totalMinutes += Math.round((t.endMs - t.startMs) / 60000);

          const isCurrent = t.startMs <= nowMs && t.endMs > nowMs;
          const isFuture  = t.startMs > nowMs;

          if (isCurrent) {
            busyNow         = true;
            activePickupId  = t.pickupId   || "";
            activePickupName= t.pickup     || "";
            activeDropoffId = t.dropoffIds && t.dropoffIds.length
              ? t.dropoffIds[t.dropoffIds.length - 1]
              : (t.dropoffId || "");
            activeTripRoute = t.route;
            progressPct     = Math.round(
              ((nowMs - t.startMs) / (t.endMs - t.startMs)) * 100
            );
            etaFreeDisplay  = _fleetFmtTime_(new Date(t.endMs), tz);

            // Calcola ritorno al punto di partenza
            if (activeDropoffId && activePickupId && activeDropoffId !== activePickupId) {
              const returnMin = _lookupRoute_(activeDropoffId, activePickupId);
              if (returnMin > 0) {
                returnToBaseMs   = t.endMs + returnMin * 60000;
                etaReturnDisplay = _fleetFmtTime_(new Date(returnToBaseMs), tz);
              }
            }
          }

          // nextFreeMs = fine del trip più tardivo nel futuro
          if (t.endMs > nowMs && (!nextFreeMs || t.endMs > nextFreeMs)) {
            nextFreeMs = t.endMs;
          }

          // Annota pickupId e dropoffId sul trip per uso futuro
          t.progressPct = isCurrent ? progressPct : (t.endMs <= nowMs ? 100 : 0);
          t.isCurrent   = isCurrent;
          t.isFuture    = isFuture;
          t.isDone      = t.endMs <= nowMs;
        }
      });

      const statusNow = v.trips.length === 0 ? "IDLE"
        : busyNow                             ? "BUSY"
        : nextFreeMs && nextFreeMs > nowMs    ? "FREE"
        : "DONE";

      return {
        vehicleId:        v.vehicleId,
        driverName:       v.driverName,
        signCode:         v.signCode,
        type:             v.type,
        capacity:         v.capacity,
        trips:            v.trips,
        tripCount:        v.trips.length,
        totalMinutes,
        workHours:        TS_formatMinutes_(totalMinutes),
        fleetStatus:      TS_getFleetStatus_(totalMinutes),
        statusNow,
        // Dati live per veicoli BUSY
        activeTripRoute,
        activePickupName,
        progressPct,
        etaFreeDisplay,          // "20:40" — fine del trip corrente
        etaReturnDisplay,        // "20:50" — ritorno al punto di partenza
        returnToBaseName: activePickupName || "",  // "SET_1"
        // Per veicoli FREE: quando si è liberato
        nextFreeDisplay:  nextFreeMs && nextFreeMs > nowMs
          ? _fleetFmtTime_(new Date(nextFreeMs), tz) : ""
      };
    });

    // Ordina: BUSY → FREE → IDLE → DONE
    const order = { BUSY: 0, FREE: 1, IDLE: 2, DONE: 3 };
    result.sort((a, b) => (order[a.statusNow] || 0) - (order[b.statusNow] || 0));

    return {
      ok:          true,
      date:        targetStr,
      dateDisplay,
      isToday:     targetStr === todayStr,
      vehicles:    result,
      generatedAt: _fleetFmtTime_(new Date(), tz)
    };

  } catch (err) {
    TS_log_("ERROR", "getFleetOverviewData", { message: err.message });
    return { ok: false, error: err.message };
  }
}

function _fleetFmtTime_(d, tz) {
  if (!(d instanceof Date) || isNaN(d)) return "";
  return Utilities.formatDate(d, tz || Session.getScriptTimeZone(), "HH:mm");
}