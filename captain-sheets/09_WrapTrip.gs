/**
 * 09_WrapTrip.gs
 * Web App mobile per la creazione rapida di trip a fine set.
 * Il Captain scansiona QR del driver e dei passeggeri,
 * il sistema crea il trip completo in Trips + Trip_Passengers.
 * Captain — Transport Management System
 */

/* =========================================
   WEB APP ENTRY POINT
   ========================================= */

/**
 * Serve la Web App mobile.
 * Pubblicare come Web App con accesso "Anyone with Google Account".
 */
function doGet(e) {
  const tpl = HtmlService.createTemplateFromFile("WrapTripApp");
  // Passa il parametro qr alla pagina se presente nell'URL
  tpl.incomingQR = (e && e.parameter && e.parameter.qr)
    ? String(e.parameter.qr)
    : "";

  return tpl.evaluate()
    .setTitle("Captain — Wrap Trip")
    .addMetaTag("viewport", "width=device-width, initial-scale=1.0, maximum-scale=1.0")
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .setSandboxMode(HtmlService.SandboxMode.IFRAME);
}

/* =========================================
   FORM DATA — dropdown per la Web App
   ========================================= */

/**
 * Restituisce i dati necessari per popolare la Web App:
 * - Lista locations (Hotels + Hubs) per Pickup e Dropoff
 * - Data odierna
 * - Unità di produzione disponibili
 *
 * @return {Object} { locations, units, today }
 */
function getWrapTripFormData() {
  try {
    const ss = SpreadsheetApp.getActive();

    // Locations da Hotels e Hubs
    const locations = [];

    // Hotels
    const hotelsSh = ss.getSheetByName(CFG.SHEETS.HOTELS);
    if (hotelsSh && hotelsSh.getLastRow() >= 2) {
      const data = hotelsSh.getRange(2, 1, hotelsSh.getLastRow() - 1, 2).getValues();
      data.forEach(r => {
        const id   = String(r[0] || "").trim();
        const name = String(r[1] || "").trim();
        if (id && name) locations.push({ id, name, type: "HOTEL" });
      });
    }

    // Hubs
    const hubsSh = ss.getSheetByName(CFG.SHEETS.HUBS);
    if (hubsSh && hubsSh.getLastRow() >= 2) {
      const data = hubsSh.getRange(2, 1, hubsSh.getLastRow() - 1, 2).getValues();
      data.forEach(r => {
        const id   = String(r[0] || "").trim();
        const name = String(r[1] || "").trim();
        if (id && name) locations.push({ id, name, type: "HUB" });
      });
    }

    // Ordina per nome
    locations.sort((a, b) => a.name.localeCompare(b.name));

    // Data odierna in formato yyyy-MM-dd
    const today = Utilities.formatDate(
      new Date(),
      Session.getScriptTimeZone(),
      "yyyy-MM-dd"
    );

    // Service Types da Lists!B — stesso dropdown del foglio Trips
    const serviceTypes = ["Wrap"]; // default sempre presente
    const listsSh = ss.getSheetByName(CFG.SHEETS.LISTS);
    if (listsSh && listsSh.getLastRow() >= 2) {
      const col = listsSh.getRange(2, 2, listsSh.getLastRow() - 1, 1).getValues();
      col.forEach(r => {
        const v = String(r[0] || "").trim();
        if (v && !serviceTypes.includes(v)) serviceTypes.push(v);
      });
    }

    return {
      ok:           true,
      locations:    locations,
      units:        CFG.UNITS,
      serviceTypes: serviceTypes,
      today:        today
    };

  } catch (err) {
    return { ok: false, error: err.message };
  }
}

/* =========================================
   QR RESOLVER
   ========================================= */

/**
 * Risolve un codice QR scansionato.
 * Distingue crew (CR:) da veicoli (VH:) tramite prefisso.
 *
 * @param  {string} code  Contenuto del QR (es. "CR:CR0002" o "VH:VAN-01")
 * @return {Object}       { ok, type, data } oppure { ok: false, error }
 */
function resolveQR(code) {
  try {
    const raw = String(code || "").trim();
    if (!raw) return { ok: false, error: "Empty QR code" };

    if (raw.startsWith(CFG.QR.CREW_PREFIX)) {
      const crewId = raw.slice(CFG.QR.CREW_PREFIX.length).trim();
      return _resolveCrewQR_(crewId);
    }

    if (raw.startsWith(CFG.QR.VEHICLE_PREFIX)) {
      const vehicleId = raw.slice(CFG.QR.VEHICLE_PREFIX.length).trim();
      return _resolveVehicleQR_(vehicleId);
    }

    return { ok: false, error: "Unknown QR format: " + raw };

  } catch (err) {
    return { ok: false, error: err.message };
  }
}

/**
 * Risolve un Crew_ID dal QR.
 */
function _resolveCrewQR_(crewId) {
  const cache = TS_getCrewCache_();
  const entry = cache.byCrewId[crewId];

  if (!entry) {
    // Prova a cercare anche crew non CONFIRMED (potrebbero essere nuovi)
    const ss     = SpreadsheetApp.getActive();
    const sh     = ss.getSheetByName(CFG.SHEETS.CREW);
    const hdr    = getHeaderMap_(sh);
    const last   = getRealLastCrewRow_(sh);
    if (last >= 2) {
      const data = sh.getRange(2, 1, last - 1, sh.getLastColumn()).getValues();
      for (let i = 0; i < data.length; i++) {
        const id = String(data[i][hdr["Crew_ID"] - 1] || "").trim();
        if (id !== crewId) continue;
        return {
          ok:   true,
          type: "CREW",
          data: {
            crewId:       id,
            fullName:     String(data[i][hdr["Full_Name"]      - 1] || "").trim(),
            dept:         hdr["Dept"]         ? String(data[i][hdr["Dept"]         - 1] || "").trim() : "",
            unit:         hdr["Unit"]         ? String(data[i][hdr["Unit"]         - 1] || "").trim() : "",
            hotelId:      hdr["Hotel_ID"]     ? String(data[i][hdr["Hotel_ID"]     - 1] || "").trim() : "",
            hotelName:    hdr["HOTELS"]       ? String(data[i][hdr["HOTELS"]       - 1] || "").trim() : "",
            travelStatus: hdr["Travel_Status"]? String(data[i][hdr["Travel_Status"]- 1] || "").trim() : "",
            hotelStatus:  hdr["Hotel_Status"] ? String(data[i][hdr["Hotel_Status"] - 1] || "").trim() : ""
          }
        };
      }
    }
    return { ok: false, error: "Crew not found: " + crewId };
  }

  return {
    ok:   true,
    type: "CREW",
    data: {
      crewId:       entry.crewId,
      fullName:     entry.name,
      dept:         entry.dept,
      unit:         entry.unit,
      hotelId:      entry.hotelId,
      hotelName:    entry.hotelName,
      travelStatus: entry.travelStatus,
      hotelStatus:  entry.hotelStatus
    }
  };
}

/**
 * Risolve un Vehicle_ID dal QR.
 */
function _resolveVehicleQR_(vehicleId) {
  const ss      = SpreadsheetApp.getActive();
  const fleetSh = ss.getSheetByName(CFG.SHEETS.FLEET);
  if (!fleetSh || fleetSh.getLastRow() < 2) {
    return { ok: false, error: "Fleet sheet not found or empty" };
  }

  const hdr  = getHeaderMap_(fleetSh);
  const data = fleetSh.getRange(2, 1, fleetSh.getLastRow() - 1, fleetSh.getLastColumn()).getValues();

  for (let i = 0; i < data.length; i++) {
    const id = String(data[i][(hdr["Vehicle_ID"] || 1) - 1] || "").trim();
    if (id !== vehicleId) continue;

    return {
      ok:   true,
      type: "VEHICLE",
      data: {
        vehicleId:  id,
        type:       hdr["Type"]        ? String(data[i][hdr["Type"]        - 1] || "").trim() : "",
        capacity:   hdr["Capacity"]    ? Number(data[i][hdr["Capacity"]    - 1] || 0)         : 0,
        driverName: hdr["Driver_Name"] ? String(data[i][hdr["Driver_Name"] - 1] || "").trim() : "",
        signCode:   hdr["Sign_Code"]   ? String(data[i][hdr["Sign_Code"]   - 1] || "").trim() : "",
        unit:       hdr["Unit_Default"]? String(data[i][hdr["Unit_Default"]- 1] || "").trim() : ""
      }
    };
  }

  return { ok: false, error: "Vehicle not found: " + vehicleId };
}

/* =========================================
   CREATE WRAP TRIP
   ========================================= */

/**
 * Crea il trip completo da fine set.
 *
 * @param {Object} tripData {
 *   date:       "yyyy-MM-dd",
 *   pickupId:   "SET_1",
 *   pickupName: "SET_1",
 *   unit:       "MAIN",
 *   vehicle: { vehicleId, driverName, signCode, capacity },
 *   passengers: [{ crewId, fullName, dept, hotelId, hotelName }, ...]
 * }
 * @return {Object} { ok, tripId, rowsCreated, message }
 */
function createWrapTrip(tripData) {
  try {
    return withDocLock_(() => _createWrapTripLocked_(tripData));
  } catch (err) {
    TS_log_("ERROR", "createWrapTrip", { message: err.message });
    return { ok: false, error: err.message };
  }
}

function _createWrapTripLocked_(tripData) {
  const ss      = SpreadsheetApp.getActive();
  const tripsSh = ss.getSheetByName(CFG.SHEETS.TRIPS);
  if (!tripsSh) throw new Error("Trips sheet not found");

  const hdr      = getHeaderMap_(tripsSh);
  const lastRow  = getRealLastTripRow_(tripsSh);

  // Genera Trip_ID univoco
  const tripId = _generateWrapTripId_();

  // Data del trip
  const tripDate = _parseTripDate_(tripData.date);
  if (!tripDate) throw new Error("Invalid date: " + tripData.date);

  // Usa il timestamp mandato dal client (ora del click Confirm sul telefono).
  // Se non presente o non valido, usa l'ora del server come fallback.
  // Questo evita sfasamenti dovuti al timezone del server GAS (UTC)
  // rispetto all'ora locale del dispositivo.
  let now;
  if (tripData.confirmTimestamp) {
    const ts = new Date(tripData.confirmTimestamp);
    now = isNaN(ts) ? new Date() : ts;
  } else {
    now = new Date();
  }
  const tz = Session.getScriptTimeZone();
  const callDate = new Date(tripDate);
  // Converte l'ora del client nel timezone dello script per scrivere HH:mm corretto
  const hh = parseInt(Utilities.formatDate(now, tz, "HH"), 10);
  const mm = parseInt(Utilities.formatDate(now, tz, "mm"), 10);
  callDate.setHours(hh, mm, 0, 0);

  // Raggruppa passeggeri per hotel di destinazione (dropoff)
  const byHotel = {};
  (tripData.passengers || []).forEach(p => {
    const key = p.hotelId || "UNKNOWN";
    if (!byHotel[key]) {
      byHotel[key] = {
        hotelId:   p.hotelId   || "",
        hotelName: p.hotelName || p.hotelId || "",
        passengers: []
      };
    }
    byHotel[key].passengers.push(p);
  });

  const hotelGroups = Object.values(byHotel);
  if (!hotelGroups.length) throw new Error("No passengers assigned");

  const vehicle       = tripData.vehicle    || {};
  const pickupId      = String(tripData.pickupId      || "").trim();
  const pickupName    = String(tripData.pickupName    || pickupId).trim();
  const fixedDropoffId  = String(tripData.dropoffId   || "").trim();
  const fixedDropoffName= String(tripData.dropoffName || "").trim();
  const unit          = String(tripData.unit || vehicle.unit || CFG.UNITS[0]).trim();

  // Calcola Duration_Min per ogni dropoff
  const routeMap = TS_buildRouteDurationMap_();

  const newRows    = [];
  const paxRows    = [];
  let   nextRow    = lastRow + 1;

  hotelGroups.forEach(group => {
    const dropoffId   = fixedDropoffId   || group.hotelId;
    const dropoffName = fixedDropoffName || group.hotelName;

    // Duration da Routes
    const dur = routeMap[pickupId + "||" + dropoffId] ||
                estimateMinByIds_(pickupId, dropoffId) || 0;

    // Transfer_Class determina la logica di Pickup_Time
    const transferClass = getTransferClass_(pickupId, dropoffId);

    // Pickup_Time per Wrap Trip:
    // ARRIVAL   (hub→hotel): driver già all'hub → Pickup_Time = Call
    // DEPARTURE (hotel→hub): driver parte dall'hotel → Pickup_Time = Call - Duration
    // STANDARD  (set→hotel, ecc.): il veicolo parte ORA al momento della creazione
    //   → Pickup_Time = Call (= ora attuale), End_DT = ora + Duration
    //   NON si sottrae la Duration — il trip è appena creato, il veicolo parte subito
    const puMs   = (transferClass === "DEPARTURE")
                   ? callDate.getTime() - dur * 60000
                   : callDate.getTime();  // ARRIVAL e STANDARD: parte adesso
    const puDate = new Date(puMs);

    // Start_DT = tripDate + Pickup_Time
    const startDt = new Date(tripDate);
    startDt.setHours(puDate.getHours(), puDate.getMinutes(), 0, 0);

    // End_DT = Start_DT + Duration
    const endDt = new Date(startDt.getTime() + dur * 60000);

    // Passenger list
    const paxNames = group.passengers.map(p => p.fullName).join(", ");
    const paxCount = group.passengers.length;

    // Usa getHeaderMap per posizionare i valori nelle colonne corrette
    const row = _buildTripsRow_(hdr, tripsSh.getLastColumn(), {
      tripId,
      tripDate,
      unit,
      // Call automatica solo per ARRIVAL (hub->hotel) e DEPARTURE (hotel->hub).
      // Per STANDARD (SET->hotel, BaseCamp->hotel, ecc.) rimane vuota --
      // come per i trip normali inseriti a mano nel foglio.
      call: (transferClass === "ARRIVAL" || transferClass === "DEPARTURE")
            ? callDate
            : "",
      pickupTime:   puDate,
      serviceType:  String(tripData.serviceType || "Wrap").trim(),
      pickup:       pickupName,
      dropoff:      dropoffName,
      vehicleId:    vehicle.vehicleId    || "",
      driverName:   vehicle.driverName   || "",
      signCode:     vehicle.signCode     || "",
      capacity:     vehicle.capacity     || "",
      paxCount,
      paxList:      paxNames,
      durMin:       dur,
      startDt,
      endDt,
      pickupId,
      dropoffId,
      transferClass
    });

    newRows.push({ row, tripRow: nextRow });

    // Costruisce righe Trip_Passengers
    group.passengers.forEach(p => {
      paxRows.push([
        tripId,
        p.crewId   || "",
        p.fullName || "",
        pickupId,
        dropoffId,
        startDt,
        endDt,
        nextRow
      ]);
    });

    nextRow++;
  });

  // Scrive righe in Trips con setValues
  const dateCol  = hdr["Date"];
  const startCol = hdr["Start_DT"];
  const endCol   = hdr["End_DT"];
  const puCol    = hdr["Pickup_Time"];
  const callCol  = hdr["Call"];
  const writtenRows = [];
  newRows.forEach(({ row, tripRow }) => {
    const fullRange = tripsSh.getRange(tripRow, 1, 1, row.length);
    // Reset formato su tutta la riga per cancellare il formato template
    fullRange.setNumberFormat("@");
    // Imposta formati corretti sulle colonne data/ora
    if (dateCol)  tripsSh.getRange(tripRow, dateCol).setNumberFormat("dd/MM/yyyy");
    if (startCol) tripsSh.getRange(tripRow, startCol).setNumberFormat("dd/MM/yyyy HH:mm");
    if (endCol)   tripsSh.getRange(tripRow, endCol).setNumberFormat("dd/MM/yyyy HH:mm");
    if (puCol)    tripsSh.getRange(tripRow, puCol).setNumberFormat("HH:mm");
    if (callCol)  tripsSh.getRange(tripRow, callCol).setNumberFormat("HH:mm");
    // Scrive i valori
    fullRange.setValues([row]);
    writtenRows.push({ row, tripRow });
  });

  // Scrive righe in Trip_Passengers
  if (paxRows.length) {
    const paxSh      = ss.getSheetByName(CFG.SHEETS.PAX);
    if (paxSh) {
      const nextPaxRow = getRealLastPaxRow_(paxSh) + 1;
      paxSh.getRange(nextPaxRow, 1, paxRows.length, 8).setValues(paxRows);
      paxSh.getRange(nextPaxRow, 6, paxRows.length, 2)
        .setNumberFormat("dd/MM/yyyy HH:mm");
    }
  }

  // Aggiorna PaxIndex e conflitti per ogni riga creata
  writtenRows.forEach(({ tripRow }) => {
    try {
      TS_rebuildPaxIndexForTripRow_(tripRow);
      TS_recomputePaxConflictsForTripRow_(tripRow);
    } catch(e) {
      Logger.log("PaxIndex/Conflicts update failed for row " + tripRow + ": " + e.message);
    }
  });

  TS_log_("INFO", "createWrapTrip", {
    message: "Wrap trip created: " + tripId +
             " | Rows: " + writtenRows.length +
             " | Pax: " + paxRows.length
  });

  return {
    ok:          true,
    tripId:      tripId,
    rowsCreated: writtenRows.length,
    paxAssigned: paxRows.length,
    message:     "Trip " + tripId + " created with " +
                 writtenRows.length + " stop(s) and " +
                 paxRows.length + " passenger(s)"
  };
}

/* =========================================
   HELPERS
   ========================================= */

/**
 * Genera un Trip_ID univoco per i wrap trip.
 * Formato: W_HHMMSS (es. W_143022)
 */
function _generateWrapTripId_() {
  const now = new Date();
  const hh  = String(now.getHours()).padStart(2, "0");
  const mm  = String(now.getMinutes()).padStart(2, "0");
  const ss  = String(now.getSeconds()).padStart(2, "0");
  return "W_" + hh + mm + ss;
}

/**
 * Converte stringa "yyyy-MM-dd" in Date.
 */
function _parseTripDate_(str) {
  if (!str) return null;
  const m = String(str).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return isNaN(d) ? null : d;
}

/**
 * Costruisce un array row per Trips con i valori
 * nelle colonne corrette basandosi su hdr.
 */
function _buildTripsRow_(hdr, numCols, vals) {
  const row = new Array(numCols).fill("");

  const set = (header, value) => {
    if (hdr[header]) row[hdr[header] - 1] = value;
  };

  set("Trip_ID",              vals.tripId);
  set("Date",                 vals.tripDate);
  set("Unit",                 vals.unit);
  set("Call",                 vals.call);
  set("Pickup_Time",          vals.pickupTime);
  set("Service_Type",         vals.serviceType);
  set("Pickup",               vals.pickup);
  set("Dropoff",              vals.dropoff);
  set("Vehicle_ID",           vals.vehicleId);
  set("Driver_Name(auto)",    vals.driverName);
  set("Sign_Code(auto)",      vals.signCode);
  set("Capacity(auto)",       vals.capacity);
  set("Pax_Count(auto)",      vals.paxCount);
  set("Passenger_List(auto)", vals.paxList);
  set("Duration_Min",         vals.durMin);
  set("Start_DT",             vals.startDt);
  set("End_DT",               vals.endDt);
  set("Pickup_ID",            vals.pickupId);
  set("Dropoff_ID",           vals.dropoffId);
  set("Transfer_Class(auto)", vals.transferClass);
  set("Status",               "Scheduled");

  return row;
}