/**
 * 10_Maps.gs
 * Integrazione OpenRouteService (HeiGIT) per calcolo durate reali.
 * Profilo: driving-car, preferenza: fastest
 * Captain — Transport Management System
 */

/* =========================================
   CONFIGURAZIONE
   ========================================= */

const MAPS_CFG = {
  API_KEY_PROP:  "MAPS_API_KEY",
  // driving-car con preference=fastest → percorso più veloce (autostrada)
  ENDPOINT:      "https://api.openrouteservice.org/v2/directions/driving-car",
  ROUND_TO:      5,    // arrotonda ai 5 minuti
  MIN_MIN:       5,    // durata minima
  BATCH_PAUSE:   1600   // ms di pausa tra richieste (rate limit: 40 req/min)
};

/* =========================================
   API KEY
   ========================================= */

function getMapsApiKey_() {
  const key = PropertiesService.getScriptProperties()
                .getProperty(MAPS_CFG.API_KEY_PROP);
  if (!key) throw new Error(
    "MAPS_API_KEY non trovata nelle Script Properties."
  );
  return key;
}

/* =========================================
   CHIAMATA API SINGOLA
   ========================================= */

/**
 * Chiama ORS per la durata di guida tra due punti.
 * Usa preference=fastest per percorso più veloce (autostrada).
 *
 * @return {number|null}  Minuti arrotondati o null se fallisce
 */
function getOrsRouteDuration_(fromLat, fromLng, toLat, toLng) {
  const key = getMapsApiKey_();

  const payload = {
    coordinates: [
      [fromLng, fromLat],   // ORS vuole [lng, lat]
      [toLng,   toLat]
    ],
    preference:  "fastest", // percorso più veloce — usa autostrade
    units:       "m",       // distanza in metri
    language:    "it-IT"
  };

  const options = {
    method:             "post",
    contentType:        "application/json",
    headers: {
      "Authorization":  key,
      "Accept":         "application/json"
    },
    payload:            JSON.stringify(payload),
    muteHttpExceptions: true
  };

  try {
    const response = UrlFetchApp.fetch(MAPS_CFG.ENDPOINT, options);
    const code     = response.getResponseCode();
    const body     = response.getContentText();

    if (code !== 200) {
      Logger.log("ORS error " + code + ": " + body.substring(0, 300));
      return null;
    }

    const json        = JSON.parse(body);
    const durationSec = json.routes[0].summary.duration;
    if (!isFinite(durationSec) || durationSec <= 0) return null;

    let min = durationSec / 60;
    min = Math.max(MAPS_CFG.MIN_MIN, min);
    min = Math.round(min / MAPS_CFG.ROUND_TO) * MAPS_CFG.ROUND_TO;
    return min;

  } catch (err) {
    Logger.log("ORS fetch error: " + err.message);
    return null;
  }
}

/* =========================================
   DEBUG — mostra risposta raw ORS
   Utile per diagnosticare problemi di durata
   ========================================= */

/**
 * Mostra la risposta completa di ORS per APT_PMO → H001.
 * Includi durata in secondi, distanza, sommario completo.
 */
function tsDebugOrsApi() {
  const key = getMapsApiKey_();
  const ui  = SpreadsheetApp.getUi();

  // Legge coordinate dal foglio — non hardcoded
  const ss     = SpreadsheetApp.getActive();
  const coords = _buildCoordsMap_(ss);
  const apt    = coords["APT_PMO"];
  const h001   = coords["H001"];

  if (!apt)  { ui.alert("ORS Debug", "APT_PMO non trovato nel foglio Hubs.", ui.ButtonSet.OK); return; }
  if (!h001) { ui.alert("ORS Debug", "H001 non trovato nel foglio Hotels.", ui.ButtonSet.OK); return; }

  const payload = {
    coordinates: [
      [apt.lng,  apt.lat],   // APT_PMO [lng, lat]
      [h001.lng, h001.lat]   // H001
    ],
    preference: "fastest",
    units:      "m"
  };

  const options = {
    method:             "post",
    contentType:        "application/json",
    headers: {
      "Authorization":  key,
      "Accept":         "application/json"
    },
    payload:            JSON.stringify(payload),
    muteHttpExceptions: true
  };

  const response = UrlFetchApp.fetch(MAPS_CFG.ENDPOINT, options);
  const code     = response.getResponseCode();
  const body     = response.getContentText();

  if (code !== 200) {
    ui.alert("ORS Debug", "HTTP " + code + "\n\n" + body.substring(0, 500), ui.ButtonSet.OK);
    return;
  }

  const json    = JSON.parse(body);
  const summary = json.routes[0].summary;
  const durSec  = summary.duration;
  const distM   = summary.distance;
  const durMin  = Math.round(durSec / 60);
  const distKm  = (distM / 1000).toFixed(1);

  const msg = [
    "APT_PMO → H001 (Palme Hotel)",
    "",
    "Durata raw:   " + durSec.toFixed(0) + " secondi",
    "Durata:       " + durMin + " minuti",
    "Distanza:     " + distKm + " km",
    "",
    "preference:   fastest",
    "HTTP status:  " + code
  ].join("\n");

  ui.alert("ORS Debug Response", msg, ui.ButtonSet.OK);
  TS_log_("INFO", "tsDebugOrsApi", { message: "APT_PMO->H001: " + durMin + "min, " + distKm + "km" });
}

/* =========================================
   TEST API
   ========================================= */

function tsTestMapsApi() {
  const ui     = SpreadsheetApp.getUi();
  const ss     = SpreadsheetApp.getActive();
  const coords = _buildCoordsMap_(ss);

  // Coppie di test — lette dal foglio, non hardcoded
  const pairs = [
    ["APT_PMO", "H001"],
    ["APT_PMO", "H002"],
    ["APT_PMO", "H005"],
    ["H002",    "SET_1"]
  ];

  const lines = ["preference: fastest\n"];
  var ok = 0, fail = 0;

  pairs.forEach(function(p) {
    const fromId = p[0], toId = p[1];
    const fromC  = coords[fromId];
    const toC    = coords[toId];
    if (!fromC || !toC) {
      lines.push("SKIP " + fromId + " → " + toId + ": coordinate mancanti");
      return;
    }
    const r = { from: fromId, to: toId, fromLat: fromC.lat, fromLng: fromC.lng, toLat: toC.lat, toLng: toC.lng };
    const dur = getOrsRouteDuration_(r.fromLat, r.fromLng, r.toLat, r.toLng);
    if (dur) {
      lines.push("OK   " + r.from + " → " + r.to + ": " + dur + " min");
      ok++;
    } else {
      lines.push("FAIL " + r.from + " → " + r.to);
      fail++;
    }
    Utilities.sleep(MAPS_CFG.BATCH_PAUSE);
  });

  const status = fail === 0 ? "API OK" : (ok > 0 ? "PARZIALE" : "FAIL");
  ui.alert("CAPTAIN — Test API Maps\n" + status, lines.join("\n"), ui.ButtonSet.OK);
  TS_log_("INFO", "tsTestMapsApi", { message: status + " OK:" + ok + " Fail:" + fail });
}

/* =========================================
   RICALCOLO ROTTE CON API
   Aggiorna tutte le rotte AUTO con ORS.
   Le rotte MANUAL non vengono mai toccate.
   Le rotte aggiornate ricevono Source="ORS".
   ========================================= */

function tsRecalculateRoutesWithMaps() {
  const ss      = SpreadsheetApp.getActive();
  const ui      = SpreadsheetApp.getUi();
  const routeSh = ss.getSheetByName(CFG.SHEETS.ROUTES);
  if (!routeSh) { ui.alert("Foglio Routes non trovato."); return; }

  const confirm = ui.alert(
    "Recalculate Routes — ORS fastest",
    "Aggiorna tutte le rotte AUTO con tempi reali (ORS, percorso più veloce).\n" +
    "Le rotte MANUAL non vengono toccate.\n\n" +
    "Può richiedere 1-3 minuti. Continuare?",
    ui.ButtonSet.OK_CANCEL
  );
  if (confirm !== ui.Button.OK) return;

  ss.toast("Caricamento coordinate...", "Captain");
  const coords  = _buildCoordsMap_(ss);
  const lastRow = routeSh.getLastRow();
  if (lastRow < 2) { ui.alert("Nessuna rotta."); return; }

  const data = routeSh.getRange(2, 1, lastRow - 1, 6).getValues();
  const out  = [];
  var updated = 0, manual = 0, noCoords = 0, fallback = 0;

  for (var i = 0; i < data.length; i++) {
    const row    = data[i];
    const fromId = String(row[0] || "").trim().toUpperCase();
    const toId   = String(row[1] || "").trim().toUpperCase();
    const source = String(row[5] || "").trim().toUpperCase();

    if (!fromId || !toId)       { out.push(row); continue; }
    if (source === "MANUAL")    { out.push(row); manual++;   continue; }

    const fromC = coords[fromId];
    const toC   = coords[toId];
    if (!fromC || !toC)         { out.push(row); noCoords++; continue; }

    const dur = getOrsRouteDuration_(fromC.lat, fromC.lng, toC.lat, toC.lng);

    if (dur) {
      // Source = "ORS" per distinguere dai valori Haversine
      out.push([fromId, toId, dur, row[3], row[4], "ORS"]);
      updated++;
    } else {
      // ORS fallito — mantieni valore precedente, non sovrascrivere con Haversine
      // Così puoi rieseguire il ricalcolo senza perdere i valori ORS già ottenuti
      out.push(row);
      fallback++;
      Logger.log("ORS failed (rate limit?): " + fromId + " -> " + toId + " — kept previous value");
    }

    Utilities.sleep(MAPS_CFG.BATCH_PAUSE);

    if ((i + 1) % 10 === 0) {
      ss.toast("Rotte: " + (i+1) + "/" + data.length, "Captain");
    }
  }

  routeSh.getRange(2, 1, out.length, 6).setValues(out);
  SpreadsheetApp.flush();

  ss.toast("Aggiornamento durate Trips...", "Captain");
  TS_refreshDurationsTrips_();

  const msg = [
    "Aggiornate (ORS):        " + updated,
    "Fallback (Haversine):    " + fallback,
    "Senza coordinate:        " + noCoords,
    "MANUAL (non toccate):    " + manual
  ].join("\n");

  ui.alert("CAPTAIN — Routes Aggiornate", msg, ui.ButtonSet.OK);
  TS_log_("INFO", "tsRecalculateRoutesWithMaps", { message: msg.replace(/\n/g, " | ") });
}

/* =========================================
   HELPERS
   ========================================= */

/**
 * Costruisce mappa { ID: {lat, lng} } da Hotels e Hubs.
 * Usa getValues() — non getDisplayValues() — per evitare
 * problemi di virgola con locale italiano.
 */
function _buildCoordsMap_(ss) {
  const map = {};
  for (const shName of [CFG.SHEETS.HOTELS, CFG.SHEETS.HUBS]) {
    const sh = ss.getSheetByName(shName);
    if (!sh || sh.getLastRow() < 2) continue;
    const data = sh.getRange(2, 1, sh.getLastRow() - 1, 7).getValues();
    data.forEach(function(row) {
      const id  = String(row[0] || "").trim().toUpperCase();
      if (!id) return;
      const lat = parseCoordinate_(row[5]);
      const lng = parseCoordinate_(row[6]);
      if (isFinite(lat) && isFinite(lng) && lat !== 0 && lng !== 0) {
        map[id] = { lat: lat, lng: lng };
      }
    });
  }
  return map;
}