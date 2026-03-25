/**
 * 00_Config.gs
 * Configurazione globale e utility condivise
 * Captain — Transport Management System
 */

/* =========================================
   CONFIGURAZIONE GLOBALE
   ========================================= */

const CFG = {

  SHEETS: {
    TRIPS:          "Trips",
    TRIPS_HISTORY:  "Trips_History",
    CREW:           "Crew_Master",
    DV:             "DV_Passengers",
    PAX:            "Trip_Passengers",
    PAX_INDEX:      "TS_PaxIndex",
    ROUTES:         "Routes",
    HOTELS:         "Hotels",
    HUBS:           "Hubs",
    FLEET:          "Fleet",
    LISTS:          "Lists",
    LOG:            "TS_Log",
    MAIN_LIST:      "Transport_List",
    SECOND_LIST:    "SECOND_List",
    TRAVEL_LIST:    "TRAVEL_AIRPORT_List"
  },

  TRIPS: {
    HEADER_ROWS:        1,
    // MAX_TRIPS_ROWS rimosso — ora dinamico via getRealLastTripRow_()
    PAX_CONFLICT_FLAG:  "PaxConflict_Flag"
  },

  CREW: {
    HEADER_ROWS:        1,
    FULL_NAME_COL:      2,   // B
    HOTEL_ID_COL:       7,   // G
    HOTEL_STATUS_COL:   8    // H — Travel_Status è col 10 J
  },

  QR: {
    SIZE:               150,  // px — dimensione QR code
    // Prefissi per distinguere crew da veicoli al momento della scansione
    CREW_PREFIX:        "CR:",
    VEHICLE_PREFIX:     "VH:",
    // Nome colonna QR nei fogli
    CREW_COL:           "QR_Code",
    FLEET_COL:          "QR_Code"
  },

  DV: {
    HEADER_ROW:         1,
    DATA_START_ROW:     2,
    MAX_LIST_ROWS:      600
  },

  HUB: {
    // Buffer check-in per voli in partenza (minuti)
    // Modificabile senza toccare il codice
    CHECKIN_BUFFER_MIN: 120,
    // Pattern per riconoscere un hub (aeroporto, porto, stazione)
    PREFIX_RE:          /^(APT_|STN_|PRT_)/i
  },

  ROUTES: {
    AVG_SPEED_KMH:      30,
    MIN_MIN:            5,
    ROUND_TO:           5,   // arrotonda ai 5 minuti — più realistico
    // Fattori di correzione per tipo di percorso
    // Calibrabili dopo confronto con i driver senza toccare il codice
    ROAD_FACTORS: {
      HUB_TO_HOTEL:     1.8, // aeroporto/porto/stazione → hotel
      HOTEL_TO_HUB:     1.8, // hotel → aeroporto/porto/stazione
      HOTEL_TO_HOTEL:   1.4, // spostamenti urbani tra hotel/location
      DEFAULT:          1.6  // fallback
    }
  },

  CACHE: {
    CREW_KEY:           "TS_CREW_CACHE_V3",
    TTL_SEC:            600   // 10 minuti
  },

  LOG: {
    MAX_ROWS:           1000
  },

  // Unità di produzione configurabili
  // Aggiungere "SPLIT" qui quando necessario
  UNITS: ["MAIN", "SECOND"],

  // Nome produzione — aggiornare quando noto
  PRODUCTION_NAME: "CAPTAIN",

  VERSION: "2.0.0"
};

/* =========================================
   HEADER MAP — unica funzione per tutto il progetto
   ========================================= */

/**
 * Restituisce { headerName: colIndex_1based } per un foglio.
 * Questa è l'UNICA funzione getHeaderMap del progetto.
 *
 * @param  {Sheet}  sh  Il foglio Google Sheets
 * @return {Object}     Mappa header → colonna (1-based)
 */
function getHeaderMap_(sh) {
  if (!sh) return {};
  const lastCol = sh.getLastColumn();
  if (lastCol < 1) return {};
  const headers = sh.getRange(1, 1, 1, lastCol).getDisplayValues()[0];
  const map = {};
  headers.forEach((h, i) => {
    const key = String(h || "").trim();
    if (key) map[key] = i + 1;
  });
  return map;
}

/* =========================================
   RILEVAMENTO ULTIMA RIGA REALE
   ========================================= */

/**
 * Trova l'ultima riga con dati reali in un foglio,
 * leggendo solo la colonna "anchor" (senza formule).
 *
 * Risolve il problema di getLastRow() su fogli con
 * formule pre-caricate su tutte le righe (es. Trips
 * ha ~989 righe di template ma solo 6-200 con dati).
 *
 * @param  {Sheet}  sh          Il foglio
 * @param  {number} anchorCol   Colonna 1-based senza formule
 * @param  {number} headerRows  Righe header da saltare (default 1)
 * @return {number}             Riga dell'ultimo dato reale
 */
function getRealLastRow_(sh, anchorCol, headerRows) {
  headerRows = headerRows || 1;
  anchorCol  = anchorCol  || 1;
  const sheetLastRow = sh.getLastRow();
  if (sheetLastRow <= headerRows) return headerRows;
  const numRows = sheetLastRow - headerRows;
  const col = sh.getRange(headerRows + 1, anchorCol, numRows, 1).getValues();
  for (let i = col.length - 1; i >= 0; i--) {
    const v = col[i][0];
    if (v !== null && v !== undefined && String(v).trim() !== "") {
      return headerRows + 1 + i;
    }
  }
  return headerRows;
}

/**
 * Ultima riga reale di Trips.
 * Usa Trip_ID (col A) come anchor — non ha formule.
 */
function getRealLastTripRow_(sh) {
  return getRealLastRow_(sh, 1, 1);
}

/**
 * Ultima riga reale di Trip_Passengers.
 * Usa Trip_ID (col A) come anchor.
 */
function getRealLastPaxRow_(sh) {
  return getRealLastRow_(sh, 1, 1);
}

/**
 * Ultima riga reale di Crew_Master.
 * Usa Crew_ID (col A) come anchor.
 */
function getRealLastCrewRow_(sh) {
  return getRealLastRow_(sh, 1, 1);
}

/**
 * Verifica se una riga di Trips ha dati reali
 * o è solo un template con formule pre-caricate.
 *
 * @param  {Array}  row  Array di valori della riga
 * @param  {Object} hdr  Mappa header → colonna (1-based)
 * @return {boolean}
 */
function isTripRowMeaningful_(row, hdr) {
  const tripId = hdr["Trip_ID"] ? String(row[hdr["Trip_ID"] - 1] || "").trim() : "";
  const pickup = hdr["Pickup"]  ? String(row[hdr["Pickup"]  - 1] || "").trim() : "";
  const date   = hdr["Date"]    ? row[hdr["Date"] - 1] : null;
  return !!(tripId || (pickup && date));
}

/* =========================================
   NORMALIZZAZIONE STRINGHE E DATE
   ========================================= */

/**
 * Normalizza qualsiasi valore in stringa trimmed.
 */
function norm_(v) {
  return String(v === null || v === undefined ? "" : v).trim();
}

/**
 * Normalizza un nome per confronti
 * (lowercase, spazi normalizzati, no-break space rimosso).
 */
function normName_(v) {
  return String(v || "")
    .replace(/\u00A0/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/**
 * Converte qualsiasi valore in Date, restituisce null se fallisce.
 * Gestisce: Date object, numero seriale Excel/Sheets, stringa.
 */
function toDateSafe_(value) {
  if (value instanceof Date && !isNaN(value)) return new Date(value);

  if (typeof value === "number" && !isNaN(value)) {
    const millis = Math.round((value - 25569) * 86400 * 1000);
    const d = new Date(millis);
    return isNaN(d) ? null : d;
  }

  if (typeof value === "string" && value.trim()) {
    const s = value.trim();
    // dd/MM/yyyy HH:mm[:ss]
    let m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?$/);
    if (m) {
      return new Date(+m[3], +m[2]-1, +m[1], +m[4], +m[5], +(m[6]||0));
    }
    // dd/MM/yyyy
    m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (m) return new Date(+m[3], +m[2]-1, +m[1]);
    // fallback ISO
    const d = new Date(s);
    return isNaN(d) ? null : d;
  }

  return null;
}

/**
 * Converte un valore orario in minuti dall'inizio del giorno.
 * Gestisce: Date object, numero seriale, stringa "HH:mm".
 * Restituisce null se non riconosce il formato.
 */
function toTimeMinutes_(value) {
  if (value instanceof Date && !isNaN(value)) {
    return value.getHours() * 60 + value.getMinutes();
  }
  if (typeof value === "number" && isFinite(value)) {
    // Numero seriale Sheets (frazione di giorno)
    const totalMin = Math.round((value % 1) * 1440);
    return totalMin;
  }
  if (typeof value === "string" && value.trim()) {
    const s = value.trim().replace(/\./g, ":");
    const m = s.match(/^(\d{1,2}):(\d{2})$/);
    if (m) return +m[1] * 60 + +m[2];
  }
  return null;
}

/**
 * Crea una Date combinando una data e un numero di minuti dall'inizio del giorno.
 *
 * @param  {Date}   dateValue   La data base
 * @param  {number} minutes     Minuti dall'inizio del giorno
 * @return {Date}
 */
function combineDateAndMinutes_(dateValue, minutes) {
  const d = new Date(dateValue);
  d.setHours(0, 0, 0, 0);
  d.setMinutes(minutes);
  return d;
}

/* =========================================
   UTILITY DATE / HUB
   ========================================= */

/** Restituisce midnight timestamp per confronti giornalieri. */
function dayKey_(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x.getTime();
}

/** true se la Date è valida. */
function isValidDate_(v) {
  return v instanceof Date && !isNaN(v.getTime());
}

/** true se due Date cadono nello stesso giorno. */
function sameDay_(a, b) {
  return isValidDate_(a) && isValidDate_(b) &&
    a.getFullYear() === b.getFullYear() &&
    a.getMonth()    === b.getMonth()    &&
    a.getDate()     === b.getDate();
}

/** true se l'ID è un hub (Airport/Station/Port). */
function isHubId_(id) {
  return CFG.HUB.PREFIX_RE.test(String(id || "").trim());
}

/**
 * Classifica il tipo di transfer basandosi su Pickup_ID e Dropoff_ID.
 * @return {string} "ARRIVAL" | "DEPARTURE" | "STANDARD"
 */
function getTransferClass_(pickupId, dropoffId) {
  const pid = String(pickupId  || "").trim().toUpperCase();
  const did = String(dropoffId || "").trim().toUpperCase();
  if (!pid || !did) return "";
  if (isHubId_(pid) && !isHubId_(did)) return "ARRIVAL";
  if (!isHubId_(pid) && isHubId_(did)) return "DEPARTURE";
  return "STANDARD";
}

/* =========================================
   FORMATTAZIONE
   ========================================= */

/** Formatta minuti in "Xh Ym". */
function formatMinutes_(min) {
  const n = Math.max(0, Math.round(Number(min) || 0));
  return Math.floor(n / 60) + "h " + String(n % 60).padStart(2, "0") + "m";
}

/** Formatta una Date come "HH:mm". */
function formatTime_(d) {
  if (!isValidDate_(d)) return "";
  return Utilities.formatDate(d, Session.getScriptTimeZone(), "HH:mm");
}

/** Formatta una Date come "dd/MM/yyyy". */
function formatDate_(d) {
  if (!isValidDate_(d)) return "";
  return Utilities.formatDate(d, Session.getScriptTimeZone(), "dd/MM/yyyy");
}

/** Formatta una Date come "dd/MM/yyyy HH:mm". */
function formatDateTime_(d) {
  if (!isValidDate_(d)) return "";
  return Utilities.formatDate(d, Session.getScriptTimeZone(), "dd/MM/yyyy HH:mm");
}

/** Formatta una Date come "dd/MM HH:mm". */
function formatDateTimeShort_(d) {
  if (!isValidDate_(d)) return "";
  return Utilities.formatDate(d, Session.getScriptTimeZone(), "dd/MM HH:mm");
}

/**
 * Formatta un valore orario "loose":
 * accetta Date, numero seriale Sheets, stringa "HH:mm".
 */
function formatTimeLoose_(value) {
  if (isValidDate_(value)) return formatTime_(value);
  if (typeof value === "number" && isFinite(value)) {
    const total = Math.round((value % 1) * 1440);
    return String(Math.floor(total / 60)).padStart(2, "0") + ":" +
           String(total % 60).padStart(2, "0");
  }
  return String(value || "").trim();
}

/* =========================================
   HELPERS GENERALI
   ========================================= */

/**
 * Cerca l'indice (0-based) del primo header nella lista candidates.
 * Case-insensitive, trim.
 *
 * @param  {Array}  headers     Array di header del foglio
 * @param  {Array}  candidates  Nomi da cercare in ordine di priorità
 * @return {number}             Indice 0-based, -1 se non trovato
 */
function findHeaderIndex_(headers, candidates) {
  const lowered = candidates.map(x => String(x).trim().toLowerCase());
  for (let i = 0; i < headers.length; i++) {
    if (lowered.includes(String(headers[i] || "").trim().toLowerCase())) return i;
  }
  return -1;
}

// Alias pubblico usato dai menu e dalle sidebar
const TS_findHeaderIndex_ = findHeaderIndex_;

/**
 * Lancia un errore se uno o più header mancano dalla mappa.
 *
 * @param {Object} hdr      Mappa header → colonna
 * @param {Array}  required Array di nomi header obbligatori
 * @param {string} context  Nome del foglio (per il messaggio di errore)
 */
function requireHeaders_(hdr, required, context) {
  required.forEach(h => {
    if (!hdr[h]) throw new Error((context || "Sheet") + " missing header: " + h);
  });
}

/**
 * Wrapper lock documento con timeout 30 secondi.
 * Garantisce che operazioni critiche non si sovrappongano
 * se due utenti lavorano contemporaneamente.
 */
function withDocLock_(fn) {
  const lock = LockService.getDocumentLock();
  lock.waitLock(30000);
  try {
    return fn();
  } finally {
    try { lock.releaseLock(); } catch (e) {}
  }
}

/**
 * Deduplica un array di nomi usando normName_ per il confronto.
 * Mantiene il primo occorrenza di ogni nome (case preservata).
 */
function dedupeNames_(names) {
  const seen = new Set();
  return (names || []).filter(n => {
    const key = normName_(n);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/* =========================================
   LOGGING
   ========================================= */

function ensureLogSheet_() {
  const ss = SpreadsheetApp.getActive();
  let sh = ss.getSheetByName(CFG.SHEETS.LOG);
  if (!sh) {
    sh = ss.insertSheet(CFG.SHEETS.LOG);
    sh.getRange(1, 1, 1, 7)
      .setValues([["Timestamp","Level","Action","Sheet","Row","Trip_ID","Message"]])
      .setFontWeight("bold");
    sh.setFrozenRows(1);
  }
  return sh;
}

function tsEnsureLogSheet() {
  ensureLogSheet_();
  SpreadsheetApp.getActive().toast("TS_Log ready.");
}

/**
 * Scrive una riga nel log.
 * Mantiene automaticamente le ultime CFG.LOG.MAX_ROWS righe.
 *
 * @param {string} level   "INFO" | "WARN" | "ERROR"
 * @param {string} action  Nome della funzione o azione
 * @param {Object} meta    { sheet, row, tripId, message }
 */
function TS_log_(level, action, meta) {
  try {
    const sh = ensureLogSheet_();
    meta = meta || {};
    sh.appendRow([
      new Date(),
      String(level  || "").toUpperCase(),
      String(action || "").trim(),
      String(meta.sheet   || "").trim(),
      Number(meta.row     || 0) || "",
      String(meta.tripId  || "").trim(),
      String(meta.message || "").trim()
    ]);
    const lastRow = sh.getLastRow();
    if (lastRow > CFG.LOG.MAX_ROWS + 1) {
      sh.deleteRows(2, lastRow - CFG.LOG.MAX_ROWS - 1);
    }
  } catch (e) {
    // Il log non deve mai rompere il flusso principale
    Logger.log("TS_log_ failed: " + e.message);
  }
}

function tsClearLog() {
  const sh = ensureLogSheet_();
  const last = sh.getLastRow();
  if (last > 1) sh.getRange(2, 1, last - 1, sh.getLastColumn()).clearContent();
  SpreadsheetApp.getActive().toast("TS_Log cleared.");
}

/* =========================================
   HEALTH CHECK
   ========================================= */

function tsHealthCheck() {
  const ss      = SpreadsheetApp.getActive();
  const errors  = [];
  const warnings= [];
  const ok      = [];

  // 1. Fogli obbligatori
  const required = [
    CFG.SHEETS.TRIPS,   CFG.SHEETS.CREW,      CFG.SHEETS.PAX,
    CFG.SHEETS.PAX_INDEX, CFG.SHEETS.ROUTES,  CFG.SHEETS.DV,
    CFG.SHEETS.FLEET,   "Hotels",             "Hubs",
    CFG.SHEETS.LOG
  ];
  required.forEach(name => {
    const sh = ss.getSheetByName(name);
    if (!sh) errors.push("❌ Foglio mancante: " + name);
    else ok.push("✅ " + name);
  });

  // 1b. Fogli opzionali importanti (warning se mancano)
  const optional = [
    { name: "Trips_Template",        reason: "Reset Trips From Template non funzionerà" },
    { name: CFG.SHEETS.MAIN_LIST,    reason: "Transport_List non ancora generata — OK al primo avvio" },
    { name: CFG.SHEETS.TRIPS_HISTORY,reason: "Fleet Reports non funzioneranno senza archivio" }
  ];
  optional.forEach(o => {
    if (!ss.getSheetByName(o.name)) warnings.push("⚠️ Foglio mancante: " + o.name + " — " + o.reason);
    else ok.push("✅ " + o.name);
  });

  // 2. Header critici Trips
  const tripsSh = ss.getSheetByName(CFG.SHEETS.TRIPS);
  if (tripsSh) {
    const hdr = getHeaderMap_(tripsSh);
    const requiredHeaders = [
      "Trip_ID","Date","Unit","Call","Pickup_Time",
      "Pickup","Dropoff","Pickup_ID","Dropoff_ID",
      "Vehicle_ID","Driver_Name(auto)","Sign_Code(auto)","Capacity(auto)",
      "Duration_Min","Start_DT","End_DT",
      "Arr_Time","Service_Type","Transfer_Class(auto)",
      "Passenger_List(auto)","Pax_Count(auto)","PaxConflict_Flag"
    ];
    requiredHeaders.forEach(h => {
      if (!hdr[h]) errors.push("❌ Trips header mancante: " + h);
    });
    const realRows = Math.max(0, getRealLastTripRow_(tripsSh) - 1);
    const totalRows= Math.max(0, tripsSh.getLastRow() - 1);
    if (realRows === 0) warnings.push("⚠️ Trips: nessun trip reale");
    else ok.push("✅ Trips: " + realRows + " trip reali (+" + (totalRows - realRows) + " template)");
  }

  // 3. Header critici Crew_Master
  const crewSh = ss.getSheetByName(CFG.SHEETS.CREW);
  if (crewSh) {
    const hdr = getHeaderMap_(crewSh);
    ["Crew_ID","Full_Name","Hotel_ID","Hotel_Status","Travel_Status"].forEach(h => {
      if (!hdr[h]) errors.push("❌ Crew_Master header mancante: " + h);
    });
    ok.push("✅ Crew_Master: " + Math.max(0, getRealLastCrewRow_(crewSh) - 1) + " crew");
  }

  // 4. Trigger installato
  const hasEdit = ScriptApp.getProjectTriggers()
    .some(t => t.getHandlerFunction() === "tsOnEditInstallable");
  if (!hasEdit) errors.push("❌ Trigger onEdit NON installato → CAPTAIN > Setup");
  else ok.push("✅ Trigger onEdit attivo");

  // 5. Routes
  const routesSh = ss.getSheetByName(CFG.SHEETS.ROUTES);
  if (routesSh) {
    const count = Math.max(0, routesSh.getLastRow() - 1);
    if (count === 0) warnings.push("⚠️ Routes: nessuna rotta — durations non funzioneranno");
    else ok.push("✅ Routes: " + count + " rotte");
  }

  // 6. Fleet
  const fleetSh = ss.getSheetByName(CFG.SHEETS.FLEET);
  if (fleetSh) {
    const count = Math.max(0, fleetSh.getLastRow() - 1);
    if (count === 0) warnings.push("⚠️ Fleet: nessun veicolo");
    else ok.push("✅ Fleet: " + count + " veicoli");
  }

  // 7. Crew cache
  try {
    const cache = TS_getCrewCache_();
    const confirmed = Object.keys(cache.byCrewId || {}).length;
    if (confirmed === 0) warnings.push("⚠️ Nessun crew CONFIRMED in Crew_Master");
    else ok.push("✅ Crew cache: " + confirmed + " CONFIRMED");
  } catch (err) {
    errors.push("❌ Crew cache error: " + err.message);
  }

  // 8. Trip_Passengers struttura
  const tpSh = ss.getSheetByName(CFG.SHEETS.PAX);
  if (tpSh) {
    const hdr = getHeaderMap_(tpSh);
    ["Trip_ID","Crew_ID","Full_Name","Pickup_ID","Dropoff_ID","Start_DT","End_DT","Trip_Row"].forEach(h => {
      if (!hdr[h]) errors.push("❌ Trip_Passengers header mancante: " + h);
    });
  }

  // Costruisce report
  const status = errors.length > 0
    ? "⚠️ SISTEMA NON PRONTO"
    : warnings.length > 0
    ? "🟡 PRONTO CON AVVISI"
    : "✅ PRONTO PER LA PRODUZIONE";

  const wrapUrl = PropertiesService.getScriptProperties().getProperty("WRAP_TRIP_URL") || "non configurato";

  const lines = [status + "\n"];
  lines.push("📦 Versione: " + CFG.VERSION + "  |  Wrap Trip URL: " + (wrapUrl !== "non configurato" ? "✅ configurato" : "⚠️ non configurato"));
  lines.push("");
  if (errors.length) {
    lines.push("🔴 ERRORI (" + errors.length + "):");
    errors.forEach(e => lines.push("  " + e));
    lines.push("");
  }
  if (warnings.length) {
    lines.push("🟡 AVVISI (" + warnings.length + "):");
    warnings.forEach(w => lines.push("  " + w));
    lines.push("");
  }
  lines.push("🟢 OK (" + ok.length + "):");
  ok.forEach(o => lines.push("  " + o));
  lines.push("\n" + new Date().toLocaleString("it-IT"));

  SpreadsheetApp.getUi().alert(
    "CAPTAIN — Health Check",
    lines.join("\n"),
    SpreadsheetApp.getUi().ButtonSet.OK
  );

  TS_log_("INFO", "tsHealthCheck", {
    message: status + " | Errors:" + errors.length + " Warnings:" + warnings.length
  });
}