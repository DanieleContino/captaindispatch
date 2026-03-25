/**
 * 03_Routes.gs
 * Gestione Routes, calcolo durate, location resolver
 * Captain — Transport Management System
 */

/* =========================================
   ROUTE SHEET HELPERS
   ========================================= */

function getRoutesSheet_() {
  return SpreadsheetApp.getActive().getSheetByName(CFG.SHEETS.ROUTES);
}

function ensureRoutesHeader_(sh) {
  const expected = ["From_ID","To_ID","Duration","From_Name","To_Name","Source"];
  const header   = sh.getRange(1, 1, 1, 6).getDisplayValues()[0];
  if (!expected.every((v, i) => String(header[i] || "").trim() === v)) {
    sh.getRange(1, 1, 1, 6).setValues([expected]);
  }
}

function routeKey_(fromId, toId) {
  return norm_(fromId) + "→" + norm_(toId);
}

/** Ultima riga reale del foglio Routes. */
function getRealLastRouteRow_(sh) {
  const lastRow = sh.getLastRow();
  if (lastRow < 2) return 1;
  const values = sh.getRange(2, 1, lastRow - 1, 2).getDisplayValues();
  for (let i = values.length - 1; i >= 0; i--) {
    if (norm_(values[i][0]) || norm_(values[i][1])) return i + 2;
  }
  return 1;
}

/* =========================================
   HAVERSINE — calcolo distanza e stima durata
   ========================================= */

function haversineKm_(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const toRad = d => d * Math.PI / 180;
  const dLat  = toRad(lat2 - lat1);
  const dLon  = toRad(lon2 - lon1);
  const a = Math.sin(dLat/2)**2 +
            Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function parseCoordinate_(value) {
  if (value === null || value === undefined) return NaN;
  let s = String(value).trim().replace(/\s+/g, "");
  const ld = s.lastIndexOf("."), lc = s.lastIndexOf(",");
  if (ld > -1 && lc > -1) {
    s = ld > lc ? s.replace(/,/g, "") : s.replace(/\./g, "").replace(",", ".");
  } else if (lc > -1) {
    s = s.replace(",", ".");
  }
  let n = parseFloat(s);
  if (isFinite(n) && Math.abs(n) > 180) n /= 1e14;
  return n;
}

/**
 * Sceglie il fattore di correzione stradale corretto
 * in base al tipo di percorso (hub↔hotel o hotel↔hotel).
 */
function getRoadFactor_(fromId, toId) {
  const f = CFG.ROUTES.ROAD_FACTORS;
  const fromIsHub = isHubId_(fromId);
  const toIsHub   = isHubId_(toId);
  if (fromIsHub && !toIsHub) return f.HUB_TO_HOTEL;
  if (!fromIsHub && toIsHub) return f.HOTEL_TO_HUB;
  if (!fromIsHub && !toIsHub) return f.HOTEL_TO_HOTEL;
  return f.DEFAULT;
}

/**
 * Stima la durata in minuti tra due ID location
 * usando le coordinate e Haversine.
 * Restituisce stringa vuota se non riesce.
 */
function estimateMinByIds_(fromId, toId) {
  fromId = norm_(fromId);
  toId   = norm_(toId);
  if (!fromId || !toId || fromId === toId) return "";

  const ss = SpreadsheetApp.getActive();
  const a  = findCoordsById_(ss, fromId);
  const b  = findCoordsById_(ss, toId);
  if (!a || !b) return "";

  const factor = getRoadFactor_(fromId, toId);
  const km     = haversineKm_(a.lat, a.lng, b.lat, b.lng);
  let   min    = (km * factor / CFG.ROUTES.AVG_SPEED_KMH) * 60;
  min = Math.max(CFG.ROUTES.MIN_MIN, min);
  // Arrotonda ai 5 minuti — più realistico
  min = Math.round(min / CFG.ROUTES.ROUND_TO) * CFG.ROUTES.ROUND_TO;

  return (isFinite(min) && min > 0) ? min : "";
}

/**
 * Cerca le coordinate di un ID in Hotels e Hubs.
 * Hotels: Pickup_ID=col1, Lat=col6, Lng=col7
 * Hubs:   Pickup_ID=col1, Lat=col6, Lng=col7
 */
function findCoordsById_(ss, id) {
  return findCoordsInSheet_(ss.getSheetByName(CFG.SHEETS.HOTELS), id) ||
         findCoordsInSheet_(ss.getSheetByName(CFG.SHEETS.HUBS),   id) ||
         null;
}

function findCoordsInSheet_(sh, id) {
  if (!sh || sh.getLastRow() < 2) return null;
  const lastRow = sh.getLastRow();
  // IMPORTANTE: usa getValues() non getDisplayValues().
  // Con locale italiano getDisplayValues() restituisce numeri
  // con virgola ("38,1797") — parseFloat() li legge come NaN.
  // getValues() restituisce sempre Number JS, indipendente dal locale.
  const data = sh.getRange(2, 1, lastRow - 1, 7).getValues();
  for (let i = 0; i < data.length; i++) {
    if (norm_(data[i][0]) !== norm_(id)) continue;
    const lat = parseCoordinate_(data[i][5]);  // col F
    const lng = parseCoordinate_(data[i][6]);  // col G
    if (isFinite(lat) && isFinite(lng) && lat !== 0 && lng !== 0) return { lat, lng };
    return null;
  }
  return null;
}

/* =========================================
   ROUTE DURATION MAP — usata da tutto il sistema
   ========================================= */

/**
 * Costruisce mappa { "FROMID||TOID": durationMin }
 * dal foglio Routes. Questa è la fonte primaria
 * di tutti i calcoli di durata.
 *
 * @return {Object} Mappa chiave → durata in minuti
 */
function TS_buildRouteDurationMap_() {
  const sh = SpreadsheetApp.getActive().getSheetByName(CFG.SHEETS.ROUTES);
  if (!sh) throw new Error("Routes sheet not found.");
  const lastRow = sh.getLastRow();
  if (lastRow < 2) return {};
  const hdr    = getHeaderMap_(sh);
  const fromCol= hdr["From_ID"]   || 1;
  const toCol  = hdr["To_ID"]     || 2;
  const durCol = hdr["Duration"]  || hdr["Duration_Min"] || 3;
  const data   = sh.getRange(2, 1, lastRow - 1, sh.getLastColumn()).getValues();
  const map    = {};
  for (let i = 0; i < data.length; i++) {
    const fromId = String(data[i][fromCol-1] || "").trim().toUpperCase();
    const toId   = String(data[i][toCol-1]   || "").trim().toUpperCase();
    const dur    = Number(data[i][durCol-1]  || "");
    if (!fromId || !toId || !isFinite(dur) || dur <= 0) continue;
    map[fromId + "||" + toId] = dur;
  }
  return map;
}

/**
 * Restituisce la durata in minuti tra due location.
 * Prima cerca in Routes, poi stima con Haversine.
 *
 * @param  {string} pickupId   ID location partenza
 * @param  {string} dropoffId  ID location arrivo
 * @return {number|string}     Durata in minuti o "" se non trovata
 */
function TS_getRouteDurationMin_(pickupId, dropoffId) {
  const from = String(pickupId  || "").trim().toUpperCase();
  const to   = String(dropoffId || "").trim().toUpperCase();
  if (!from || !to) return "";
  const map = TS_buildRouteDurationMap_();
  return map[from + "||" + to] || estimateMinByIds_(from, to) || "";
}

/* =========================================
   ID → NAME MAP — usata per From_Name/To_Name
   ========================================= */

/**
 * Costruisce mappa { id: name } da Hotels e Hubs.
 */
function buildIdNameMap_(ss) {
  const map = {};
  [CFG.SHEETS.HOTELS, CFG.SHEETS.HUBS].forEach(name => {
    const sh = ss.getSheetByName(name);
    if (!sh || sh.getLastRow() < 2) return;
    // Hotels: Pickup_ID=col1, Hotel_Name=col2
    // Hubs:   Pickup_ID=col1, Hubs_Name=col2
    sh.getRange(2, 1, sh.getLastRow()-1, 2).getValues().forEach(r => {
      const id = norm_(r[0]);
      if (id) map[id] = String(r[1] || "").trim();
    });
  });
  return map;
}

/* =========================================
   SYNC ROUTES — aggiornamento automatico
   da Hotels/Hubs edit
   ========================================= */

/**
 * Legge tutti gli ID da un foglio (Hotels o Hubs).
 */
function readLocationIds_(sh) {
  if (!sh || sh.getLastRow() < 2) return [];
  return Array.from(new Set(
    sh.getRange(2, 1, sh.getLastRow()-1, 1)
      .getDisplayValues().flat()
      .map(norm_).filter(Boolean)
  ));
}

/**
 * Carica le rotte esistenti come Set di chiavi "A→B".
 * Separa le MANUAL dalle AUTO per non sovrascriverle.
 */
function loadExistingRoutes_(sh) {
  const lastRow = getRealLastRouteRow_(sh);
  if (lastRow < 2) return { all: new Set(), manual: new Set() };
  const data   = sh.getRange(2, 1, lastRow - 1, 6).getValues();
  const all    = new Set();
  const manual = new Set();
  data.forEach(r => {
    const a = norm_(r[0]), b = norm_(r[1]);
    if (!a || !b) return;
    const key = routeKey_(a, b);
    all.add(key);
    if (norm_(r[5]).toUpperCase() === "MANUAL") manual.add(key);
  });
  return { all, manual };
}

/**
 * Sincronizza Routes quando Hotels o Hubs cambia.
 *
 * Logica:
 * 1. Genera tutte le coppie possibili (hotel↔hub, hub↔hub, hotel↔hotel)
 * 2. Per coppie nuove → aggiunge con stima AUTO
 * 3. Per coppie AUTO esistenti con Lat/Lng aggiornata → ricalcola
 * 4. Per coppie MANUAL → non tocca mai
 * 5. Aggiorna From_Name/To_Name su tutte le righe
 */
function syncRoutesFromLocations_() {
  withDocLock_(() => {
    const ss       = SpreadsheetApp.getActive();
    const routesSh = getRoutesSheet_();
    if (!routesSh) {
      Logger.log("Routes sheet not found — skipping sync");
      return;
    }

    ensureRoutesHeader_(routesSh);

    const hotels   = readLocationIds_(ss.getSheetByName(CFG.SHEETS.HOTELS));
    const hubs     = readLocationIds_(ss.getSheetByName(CFG.SHEETS.HUBS));
    const nameMap  = buildIdNameMap_(ss);
    const existing = loadExistingRoutes_(routesSh);
    const newRows  = [];

    // Genera tutte le coppie necessarie
    const pairs = [];

    // Hotel ↔ Hub (bidirezionale)
    hotels.forEach(h => hubs.forEach(hub => {
      pairs.push([h, hub]);
      pairs.push([hub, h]);
    }));

    // Hub ↔ Hub
    hubs.forEach(a => hubs.forEach(b => {
      if (a !== b) pairs.push([a, b]);
    }));

    // Hotel ↔ Hotel
    hotels.forEach(a => hotels.forEach(b => {
      if (a !== b) pairs.push([a, b]);
    }));

    // Aggiunge solo le coppie mancanti
    pairs.forEach(([fromId, toId]) => {
      fromId = norm_(fromId).toUpperCase();
      toId   = norm_(toId).toUpperCase();
      if (!fromId || !toId) return;
      const key = routeKey_(fromId, toId);
      if (existing.all.has(key)) return; // già esiste — AUTO o MANUAL
      const est = estimateMinByIds_(fromId, toId);
      newRows.push([
        fromId,
        toId,
        est || "",
        nameMap[fromId] || "",
        nameMap[toId]   || "",
        est ? "AUTO" : ""
      ]);
      existing.all.add(key);
    });

    // Appende le nuove rotte in bulk
    if (newRows.length) {
      const nextRow = Math.max(2, getRealLastRouteRow_(routesSh) + 1);
      routesSh.getRange(nextRow, 1, newRows.length, 6).setValues(newRows);
      Logger.log("Routes: added " + newRows.length + " new routes");
    }

    // Aggiorna i nomi su tutte le rotte esistenti in bulk
    _syncRouteNamesNoLock_(routesSh, nameMap);

    Logger.log("Routes sync completed. Total pairs checked: " + pairs.length);
  });
}

/**
 * Ricalcola le stime AUTO quando le coordinate cambiano.
 * Le rotte MANUAL non vengono mai toccate.
 */
function recalculateAutoRoutes_() {
  withDocLock_(() => {
    const routesSh = getRoutesSheet_();
    if (!routesSh) return;
    ensureRoutesHeader_(routesSh);
    const lastRow = getRealLastRouteRow_(routesSh);
    if (lastRow < 2) return;
    const data = routesSh.getRange(2, 1, lastRow - 1, 6).getValues();
    const out  = data.map(r => {
      const fromId = norm_(r[0]);
      const toId   = norm_(r[1]);
      const source = norm_(r[5]).toUpperCase();
      // MANUAL → non toccare mai
      if (source === "MANUAL") return r;
      if (!fromId || !toId) return r;
      const est = estimateMinByIds_(fromId, toId);
      return [fromId, toId, est || r[2], r[3], r[4], est ? "AUTO" : r[5]];
    });
    routesSh.getRange(2, 1, out.length, 6).setValues(out);
  });
}

/**
 * Aggiorna From_Name e To_Name su tutte le righe di Routes.
 * Versione pubblica (acquisisce il lock).
 */
function syncRouteNames_() {
  withDocLock_(() => {
    const routesSh = getRoutesSheet_();
    if (!routesSh) return;
    const nameMap = buildIdNameMap_(SpreadsheetApp.getActive());
    _syncRouteNamesNoLock_(routesSh, nameMap);
  });
}

/**
 * Versione interna — da chiamare solo quando il lock è già acquisito.
 */
function _syncRouteNamesNoLock_(routesSh, nameMap) {
  ensureRoutesHeader_(routesSh);
  const lastRow = getRealLastRouteRow_(routesSh);
  if (lastRow < 2) return;
  const data = routesSh.getRange(2, 1, lastRow - 1, 6).getValues();
  const out  = data.map(r => [
    norm_(r[0]),
    norm_(r[1]),
    r[2],
    nameMap[norm_(r[0]).toUpperCase()] || r[3] || "",
    nameMap[norm_(r[1]).toUpperCase()] || r[4] || "",
    r[5]
  ]);
  routesSh.getRange(2, 1, out.length, 6).setValues(out);
}

/**
 * Compatta Routes rimuovendo righe vuote.
 */
function compactRoutesSheet_() {
  withDocLock_(() => {
    const sh = getRoutesSheet_();
    if (!sh) return;
    ensureRoutesHeader_(sh);
    const lastRow = sh.getLastRow();
    if (lastRow < 2) return;
    const data  = sh.getRange(2, 1, lastRow - 1, 6).getValues();
    const clean = data.filter(r => norm_(r[0]) || norm_(r[1]));
    sh.getRange(2, 1, Math.max(lastRow - 1, 1), 6).clearContent();
    if (clean.length) sh.getRange(2, 1, clean.length, 6).setValues(clean);
  });
}

/* =========================================
   UPDATE TRIPS DURATIONS
   ========================================= */

/**
 * Aggiorna Duration_Min su tutte le righe reali di Trips — bulk.
 */
function TS_refreshDurationsTrips_() {
  const ss = SpreadsheetApp.getActive();
  const sh = ss.getSheetByName(CFG.SHEETS.TRIPS);
  if (!sh) throw new Error("Trips sheet not found.");

  const hdr      = getHeaderMap_(sh);
  const firstRow = CFG.TRIPS.HEADER_ROWS + 1;
  const lastRow  = getRealLastTripRow_(sh);
  if (lastRow < firstRow) return;

  requireHeaders_(hdr, ["Duration_Min","Pickup_ID","Dropoff_ID"], "Trips");

  const { Duration_Min: durCol, Pickup_ID: pickupCol, Dropoff_ID: dropoffCol } = hdr;
  const routeMap = TS_buildRouteDurationMap_();
  const numRows  = lastRow - firstRow + 1;
  const data     = sh.getRange(firstRow, 1, numRows, sh.getLastColumn()).getValues();
  const out      = [];

  for (let i = 0; i < data.length; i++) {
    const r   = data[i];
    if (!isTripRowMeaningful_(r, hdr)) { out.push([""]); continue; }
    const pid = String(r[pickupCol  - 1] || "").trim().toUpperCase();
    const did = String(r[dropoffCol - 1] || "").trim().toUpperCase();
    const dur = routeMap[pid + "||" + did] ||
                estimateMinByIds_(pid, did) || "";
    out.push([dur]);
  }

  sh.getRange(firstRow, durCol, out.length, 1).setValues(out);
  Logger.log("Trips durations refreshed: " + out.length + " rows");
}

/**
 * Aggiorna Duration_Min per una singola riga di Trips.
 * Usata dal trigger onEdit per evitare di riscrivere tutto.
 *
 * @param {Sheet}  sh      Foglio Trips
 * @param {number} rowNum  Numero riga (1-based)
 * @param {Object} hdrOpt  Header map opzionale (se già disponibile)
 */
function TS_updateTripDurationSingleRow_(sh, rowNum, hdrOpt) {
  const hdr    = hdrOpt || getHeaderMap_(sh);
  const durCol = hdr["Duration_Min"];
  if (!durCol) throw new Error("Trips missing header: Duration_Min");

  const row      = sh.getRange(rowNum, 1, 1, sh.getLastColumn()).getValues()[0];
  const routeMap = TS_buildRouteDurationMap_();
  const pid      = String(row[(hdr["Pickup_ID"]  || 1) - 1] || "").trim().toUpperCase();
  const did      = String(row[(hdr["Dropoff_ID"] || 1) - 1] || "").trim().toUpperCase();
  const dur      = routeMap[pid + "||" + did] ||
                   estimateMinByIds_(pid, did) || "";

  sh.getRange(rowNum, durCol).setValue(dur);
  return dur;
}

/**
 * Aggiorna Transfer_Class(auto) per una singola riga.
 *
 * @param {Sheet}  sh      Foglio Trips
 * @param {number} rowNum  Numero riga
 * @param {Object} hdrOpt  Header map opzionale
 */
function TS_updateTripTransferClassSingleRow_(sh, rowNum, hdrOpt) {
  const hdr = hdrOpt || getHeaderMap_(sh);
  const pid  = hdr["Pickup_ID"];
  const did  = hdr["Dropoff_ID"];
  const tc   = hdr["Transfer_Class(auto)"];
  if (!pid || !did || !tc) return;

  const row    = sh.getRange(rowNum, 1, 1, sh.getLastColumn()).getDisplayValues()[0];
  const pId    = String(row[pid - 1] || "").trim().toUpperCase();
  const dId    = String(row[did - 1] || "").trim().toUpperCase();
  const value  = getTransferClass_(pId, dId);

  sh.getRange(rowNum, tc).setValue(value);
  return value;
}

/* =========================================
   LOCATION RESOLVER
   Risolve testo Pickup/Dropoff → Pickup_ID/Dropoff_ID
   ========================================= */

/**
 * Costruisce la cache per la risoluzione dei nomi location.
 * Mappa ogni testo trovato in Hotels/Hubs al suo ID.
 *
 * @return {{ nameToId: Object, knownIds: Object }}
 */
function TS_buildTripsLocationResolverCache_() {
  const cache = { nameToId: {}, knownIds: {} };
  [CFG.SHEETS.HOTELS, CFG.SHEETS.HUBS].forEach(name => {
    _addLocationsToCache_(cache, name);
  });
  return cache;
}

function _addLocationsToCache_(cache, sheetName) {
  const ss = SpreadsheetApp.getActive();
  const sh = ss.getSheetByName(sheetName);
  if (!sh || sh.getLastRow() < 2) return;

  const lastRow = sh.getLastRow();
  const lastCol = sh.getLastColumn();
  const headers = sh.getRange(1, 1, 1, lastCol).getDisplayValues()[0];
  const data    = sh.getRange(2, 1, lastRow - 1, lastCol).getDisplayValues();

  // Cerca colonna ID (contiene "id" nel nome)
  const idCol = headers.findIndex(h => String(h || "").toLowerCase().includes("id"));
  if (idCol === -1) return;

  data.forEach(row => {
    const id = String(row[idCol] || "").trim().toUpperCase();
    if (!id) return;
    cache.knownIds[id] = id;

    // Mappa tutte le colonne testuali → ID
    headers.forEach((h, colIdx) => {
      const value = String(row[colIdx] || "").trim();
      if (!value) return;
      const normKey = _normalizeLocationKey_(value);
      if (normKey && !cache.nameToId[normKey]) {
        cache.nameToId[normKey] = id;
      }
    });
  });
}

function _normalizeLocationKey_(value) {
  return String(value || "")
    .replace(/\u00A0/g, " ")
    .trim()
    .replace(/\s+/g, " ")
    .toUpperCase();
}

/**
 * Risolve un testo (nome hotel, ID, ecc.) al suo Pickup_ID/Dropoff_ID.
 *
 * @param  {string} rawValue  Testo da risolvere
 * @param  {Object} cache     Cache da TS_buildTripsLocationResolverCache_()
 * @return {string}           ID risolto o "" se non trovato
 */
function TS_resolveLocationId_(rawValue, cache) {
  const raw = String(rawValue || "").trim();
  if (!raw) return "";
  const upper = raw.toUpperCase();
  if (cache.knownIds[upper]) return upper;
  const normKey = _normalizeLocationKey_(raw);
  return (normKey && cache.nameToId[normKey]) || "";
}

/**
 * Sincronizza Pickup_ID e Dropoff_ID su tutte le righe reali di Trips.
 * Bulk: legge tutto, risolve in memoria, scrive due colonne.
 */
function TS_syncAllTripLocationIds_() {
  const ss = SpreadsheetApp.getActive();
  const sh = ss.getSheetByName(CFG.SHEETS.TRIPS);
  if (!sh) throw new Error("Trips sheet not found.");

  const hdr      = getHeaderMap_(sh);
  const firstRow = CFG.TRIPS.HEADER_ROWS + 1;
  const lastRow  = getRealLastTripRow_(sh);
  if (lastRow < firstRow) return;

  requireHeaders_(hdr, ["Pickup","Dropoff","Pickup_ID","Dropoff_ID"], "Trips");

  const { Pickup: puTxt, Dropoff: doTxt, Pickup_ID: puId, Dropoff_ID: doId } = hdr;
  const cache   = TS_buildTripsLocationResolverCache_();
  const numRows = lastRow - firstRow + 1;
  const data    = sh.getRange(firstRow, 1, numRows, sh.getLastColumn()).getDisplayValues();

  const puOut = [], doOut = [];

  for (let i = 0; i < data.length; i++) {
    const r       = data[i];
    const tripId  = String(r[(hdr["Trip_ID"] || 1) - 1] || "").trim();
    const puText  = String(r[puTxt - 1] || "").trim();
    const doText  = String(r[doTxt - 1] || "").trim();

    if (!tripId && !puText && !doText) {
      // Riga template vuota — mantieni valori esistenti
      puOut.push([String(r[puId - 1] || "").trim()]);
      doOut.push([String(r[doId - 1] || "").trim()]);
    } else {
      puOut.push([TS_resolveLocationId_(puText, cache) || String(r[puId - 1] || "").trim()]);
      doOut.push([TS_resolveLocationId_(doText, cache) || String(r[doId - 1] || "").trim()]);
    }
  }

  sh.getRange(firstRow, puId, puOut.length, 1).setValues(puOut);
  sh.getRange(firstRow, doId, doOut.length, 1).setValues(doOut);
  SpreadsheetApp.flush();

  // Dopo aver aggiornato gli ID, ricalcola le durate
  TS_refreshDurationsTrips_();
  Logger.log("Trip location IDs synced: " + puOut.length + " rows");
}

/**
 * Sincronizza Pickup_ID e Dropoff_ID per una singola riga.
 * Usata dal trigger onEdit.
 *
 * @param {Sheet}  sh       Foglio Trips
 * @param {number} rowNum   Numero riga
 * @param {Object} hdr      Header map
 * @param {Object} cacheOpt Cache opzionale (se già disponibile)
 */
function TS_syncTripLocationIdsSingleRow_(sh, rowNum, hdr, cacheOpt) {
  const cache = cacheOpt || TS_buildTripsLocationResolverCache_();
  const { Pickup: puTxt, Dropoff: doTxt, Pickup_ID: puId, Dropoff_ID: doId } = hdr;

  if (!puTxt || !doTxt) throw new Error("Trips missing Pickup / Dropoff headers.");
  if (!puId  || !doId)  throw new Error("Trips missing Pickup_ID / Dropoff_ID headers.");

  const rowVals = sh.getRange(rowNum, 1, 1, sh.getLastColumn()).getDisplayValues()[0];
  const puText  = String(rowVals[puTxt - 1] || "").trim();
  const doText  = String(rowVals[doTxt - 1] || "").trim();

  sh.getRange(rowNum, puId).setValue(TS_resolveLocationId_(puText, cache) || "");
  sh.getRange(rowNum, doId).setValue(TS_resolveLocationId_(doText, cache) || "");
}

/* =========================================
   MEETING POINT — auto da Hotels/Hubs
   ========================================= */

/**
 * Legge il Default_Pickup_Point per un location ID.
 * Hotels: Pickup_ID=col1, Default_Pickup_Point=col4
 * Hubs:   Pickup_ID=col1, Default_Pickup_Point=col4
 *
 * @param  {string} locationId  ID location
 * @return {string}             Punto di raccolta o ""
 */
function getDefaultPickupPoint_(locationId) {
  if (!locationId) return "";
  const id = String(locationId).trim().toUpperCase();
  const ss = SpreadsheetApp.getActive();

  for (const sheetName of [CFG.SHEETS.HOTELS, CFG.SHEETS.HUBS]) {
    const sh = ss.getSheetByName(sheetName);
    if (!sh || sh.getLastRow() < 2) continue;
    const data = sh.getRange(2, 1, sh.getLastRow() - 1, 4).getDisplayValues();
    for (let i = 0; i < data.length; i++) {
      if (String(data[i][0] || "").trim().toUpperCase() === id) {
        return String(data[i][3] || "").trim(); // col D = Default_Pickup_Point
      }
    }
  }
  return "";
}

/**
 * Aggiorna Meeting_Point(auto) per una singola riga.
 * Legge il Default_Pickup_Point del Pickup_ID.
 *
 * @param {Sheet}  sh      Foglio Trips
 * @param {number} rowNum  Numero riga
 * @param {Object} hdrOpt  Header map opzionale
 */
function updateMeetingPointSingleRow_(sh, rowNum, hdrOpt) {
  const hdr    = hdrOpt || getHeaderMap_(sh);
  const mpCol  = hdr["Meeting_Point(auto)"];
  const pidCol = hdr["Pickup_ID"];
  if (!mpCol || !pidCol) return;

  const row       = sh.getRange(rowNum, 1, 1, sh.getLastColumn()).getDisplayValues()[0];
  const pickupId  = String(row[pidCol - 1] || "").trim().toUpperCase();
  const meetPoint = getDefaultPickupPoint_(pickupId);

  // Aggiorna solo se c'è un valore — non sovrascrivere note manuali
  // se l'utente ha già scritto qualcosa di custom
  const current = String(row[mpCol - 1] || "").trim();
  if (!current || current === getDefaultPickupPoint_(String(row[pidCol - 1] || "").trim())) {
    sh.getRange(rowNum, mpCol).setValue(meetPoint);
  }
}

/* =========================================
   ONDIT HANDLER — Hotels/Hubs
   ========================================= */

/**
 * Chiamato dal trigger quando si modifica Hotels o Hubs.
 * Sincronizza Routes automaticamente.
 */
function hotelsHubs_onEditInstallable(e) {
  if (!e || !e.range) return;
  const sh   = e.range.getSheet();
  const name = sh.getName();
  if (name !== CFG.SHEETS.HOTELS && name !== CFG.SHEETS.HUBS) return;
  if (e.range.getRow() < 2) return;

  // Qualsiasi modifica a Hotels/Hubs → sync Routes
  try {
    syncRoutesFromLocations_();
  } catch (err) {
    TS_log_("ERROR", "hotelsHubs_onEditInstallable", {
      sheet: name,
      message: err.message
    });
  }
}

/* =========================================
   MENU ACTIONS
   ========================================= */

function refreshRoutesDurationsTrigger() {
  withDocLock_(() => {
    recalculateAutoRoutes_();
    syncRouteNames_();
  });
}

function tsRefreshRoutes() {
  try {
    syncRoutesFromLocations_();
    SpreadsheetApp.getActive().toast(
      "Routes sincronizzate.",
      "Captain", 3
    );
  } catch (err) {
    TS_log_("ERROR", "tsRefreshRoutes", { message: err.message });
    throw err;
  }
}

/* =========================================
   TEST COORDINATE
   Verifica che le coordinate di Hotels e Hubs
   vengano lette correttamente (indipendente dal
   locale italiano del foglio).
   ========================================= */

/**
 * Testa la lettura delle coordinate e il calcolo Haversine.
 * Mostra risultato in un alert.
 * Da chiamare via CAPTAIN Tools per verificare lat/lng.
 */
function tsTestCoordinates() {
  const ss    = SpreadsheetApp.getActive();
  const lines = [];
  const errors= [];
  const ok    = [];

  for (const shName of [CFG.SHEETS.HOTELS, CFG.SHEETS.HUBS]) {
    const sh = ss.getSheetByName(shName);
    if (!sh || sh.getLastRow() < 2) {
      errors.push("Foglio mancante: " + shName);
      continue;
    }
    // getValues() — NON getDisplayValues() — evita virgola italiana
    const data = sh.getRange(2, 1, sh.getLastRow() - 1, 7).getValues();
    data.forEach(function(row) {
      const id = String(row[0] || "").trim();
      if (!id) return;
      const lat = parseCoordinate_(row[5]);
      const lng = parseCoordinate_(row[6]);
      if (!isFinite(lat) || !isFinite(lng) || lat === 0 || lng === 0) {
        errors.push("FAIL " + id + ": lat=" + row[5] + " lng=" + row[6]);
      } else {
        ok.push("OK   " + id + ": " + lat.toFixed(4) + ", " + lng.toFixed(4));
      }
    });
  }

  // Testa calcolo Haversine APT_PMO -> ogni hotel
  lines.push("--- Distanze da APT_PMO ---");
  const hubCoords = findCoordsById_(ss, "APT_PMO");
  if (!hubCoords) {
    errors.push("APT_PMO: coordinate non trovate");
  } else {
    ok.push("APT_PMO: " + hubCoords.lat.toFixed(4) + ", " + hubCoords.lng.toFixed(4));
    const sh = ss.getSheetByName(CFG.SHEETS.HOTELS);
    if (sh && sh.getLastRow() >= 2) {
      const data = sh.getRange(2, 1, sh.getLastRow() - 1, 7).getValues();
      data.forEach(function(row) {
        const id = String(row[0] || "").trim();
        if (!id) return;
        const dur = estimateMinByIds_("APT_PMO", id);
        lines.push("  APT_PMO -> " + id + ": " + (dur || "N/A") + " min");
      });
    }
  }

  const status = errors.length > 0 ? "PROBLEMI TROVATI" : "TUTTO OK";
  const out = [status + "\n",
    "COORDINATE:\n" + ok.join("\n"),
    errors.length ? "\nERRORI:\n" + errors.join("\n") : "",
    "\n" + lines.join("\n")
  ];

  SpreadsheetApp.getUi().alert(
    "CAPTAIN — Coordinate Test",
    out.join(""),
    SpreadsheetApp.getUi().ButtonSet.OK
  );
  TS_log_("INFO", "tsTestCoordinates", { message: status + " OK:" + ok.length + " Errors:" + errors.length });
}

/**
 * Riscrive le coordinate in Hotels e Hubs come numeri puri.
 * Risolve problemi di testo, virgole, formato esponenziale.
 */
function tsFixLatLngFormat() {
  const ss    = SpreadsheetApp.getActive();
  const lines = [];
  var fixed = 0, failed = 0;

  for (const shName of [CFG.SHEETS.HOTELS, CFG.SHEETS.HUBS]) {
    const sh = ss.getSheetByName(shName);
    if (!sh || sh.getLastRow() < 2) continue;
    const lastRow = sh.getLastRow();
    const data    = sh.getRange(2, 1, lastRow - 1, 7).getValues();
    for (var i = 0; i < data.length; i++) {
      const id  = String(data[i][0] || "").trim();
      if (!id) continue;
      const lat = parseCoordinate_(data[i][5]);
      const lng = parseCoordinate_(data[i][6]);
      if (!isFinite(lat) || !isFinite(lng) || lat === 0 || lng === 0) {
        lines.push("FAIL " + shName + " " + id + ": " + data[i][5] + " / " + data[i][6]);
        failed++;
        continue;
      }
      const rowIdx = i + 2;
      sh.getRange(rowIdx, 6).setNumberFormat("0.0000000").setValue(lat);
      sh.getRange(rowIdx, 7).setNumberFormat("0.0000000").setValue(lng);
      lines.push("OK   " + shName + " " + id + ": " + lat.toFixed(6) + ", " + lng.toFixed(6));
      fixed++;
    }
  }

  SpreadsheetApp.flush();
  SpreadsheetApp.getUi().alert(
    "CAPTAIN — Fix Lat/Lng",
    "Fixed: " + fixed + "  Failed: " + failed + "\n\n" + lines.join("\n"),
    SpreadsheetApp.getUi().ButtonSet.OK
  );
  TS_log_("INFO", "tsFixLatLngFormat", { message: "Fixed:" + fixed + " Failed:" + failed });
}