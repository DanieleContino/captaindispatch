import { NextResponse } from 'next/server'

export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const lat  = parseFloat(searchParams.get('lat'))  || 37.6
  const lng  = parseFloat(searchParams.get('lng'))  || 14.0
  const zoom = searchParams.get('lat') ? 14 : 7
  const key  = process.env.GOOGLE_MAPS_API_KEY

  if (!key) {
    return new Response('<h2 style="font-family:sans-serif;padding:20px;color:#dc2626">⚠ GOOGLE_MAPS_API_KEY non configurata</h2>', {
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
      status: 500,
    })
  }

  const html = `<!DOCTYPE html>
<html lang="it">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Scegli posizione</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; overflow: hidden; }
    #map { width: 100%; height: calc(100vh - 72px); }
    #bottom {
      position: fixed; bottom: 0; left: 0; right: 0; height: 72px;
      background: white; border-top: 1px solid #e2e8f0;
      display: flex; align-items: center; padding: 0 14px; gap: 10px;
    }
    #info { flex: 1; min-width: 0; }
    #addr {
      font-size: 12px; color: #94a3b8; font-style: italic;
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
      margin-bottom: 2px; font-weight: 500;
    }
    #addr.selected { color: #0f172a; font-style: normal; font-weight: 600; }
    #coords { font-size: 11px; color: #94a3b8; font-variant-numeric: tabular-nums; }
    #hint {
      position: absolute; top: 14px; left: 50%; transform: translateX(-50%);
      background: rgba(15,35,64,0.82); color: white; padding: 8px 20px;
      border-radius: 999px; font-size: 12px; pointer-events: none;
      white-space: nowrap; box-shadow: 0 2px 12px rgba(0,0,0,0.25);
      transition: opacity 0.3s;
    }
    .btn {
      padding: 8px 14px; border-radius: 8px; cursor: pointer;
      font-weight: 700; font-size: 12px; white-space: nowrap; flex-shrink: 0;
    }
    #btn-ok  { background: #2563eb; color: white; border: none; }
    #btn-ok:disabled { background: #cbd5e1; color: white; cursor: default; }
    #btn-no  { background: white; color: #64748b; border: 1px solid #e2e8f0; }
    #loading {
      position: absolute; top: 50%; left: 50%; transform: translate(-50%,-50%);
      background: white; padding: 20px 32px; border-radius: 12px;
      box-shadow: 0 4px 24px rgba(0,0,0,0.15); font-size: 14px; color: #64748b;
    }
  </style>
</head>
<body>
  <div id="loading">⏳ Caricamento mappa…</div>
  <div id="map" style="display:none"></div>
  <span id="hint">📍 Clicca sulla mappa per posizionare il pin</span>
  <div id="bottom">
    <div id="info">
      <div id="addr">Nessun punto selezionato</div>
      <div id="coords"></div>
    </div>
    <button class="btn" id="btn-no"  onclick="doCancel()">✕ Annulla</button>
    <button class="btn" id="btn-ok"  onclick="doConfirm()" disabled>✓ Usa questo punto</button>
  </div>

  <script>
    var map, marker, geocoder;
    var sel = null;

    function initMap() {
      document.getElementById('loading').style.display = 'none';
      document.getElementById('map').style.display = 'block';

      map = new google.maps.Map(document.getElementById('map'), {
        center: { lat: ${lat}, lng: ${lng} },
        zoom: ${zoom},
        gestureHandling: 'greedy',
        mapTypeControl: true,
        streetViewControl: false,
        fullscreenControl: false,
        zoomControlOptions: { position: google.maps.ControlPosition.RIGHT_CENTER },
        mapTypeControlOptions: {
          mapTypeIds: ['roadmap', 'satellite', 'hybrid', 'terrain'],
          style: google.maps.MapTypeControlStyle.DROPDOWN_MENU,
          position: google.maps.ControlPosition.TOP_RIGHT,
        },
      });

      geocoder = new google.maps.Geocoder();

      map.addListener('click', function(e) {
        var lat = e.latLng.lat();
        var lng = e.latLng.lng();

        // piazza marker con animazione
        if (marker) marker.setMap(null);
        marker = new google.maps.Marker({
          position: { lat: lat, lng: lng },
          map: map,
          animation: google.maps.Animation.DROP,
          title: 'Punto selezionato',
        });

        // nascondi hint
        document.getElementById('hint').style.opacity = '0';

        // aggiorna UI
        var addrEl = document.getElementById('addr');
        addrEl.className = '';
        addrEl.textContent = '🔍 Ricerca indirizzo…';
        document.getElementById('coords').textContent =
          lat.toFixed(6) + ', ' + lng.toFixed(6);
        document.getElementById('btn-ok').disabled = true;
        sel = null;

        // reverse geocoding
        geocoder.geocode({ location: { lat: lat, lng: lng } }, function(results, status) {
          var address = '';
          if (status === 'OK' && results && results[0]) {
            address = results[0].formatted_address;
          }
          addrEl.className = 'selected';
          addrEl.textContent = address || ('📍 ' + lat.toFixed(5) + ', ' + lng.toFixed(5));
          document.getElementById('btn-ok').disabled = false;
          sel = { lat: lat, lng: lng, address: address };
        });
      });
    }

    function doConfirm() {
      if (!sel) return;
      window.parent.postMessage(
        { type: 'MAP_PICK', lat: sel.lat, lng: sel.lng, address: sel.address },
        '*'
      );
    }

    function doCancel() {
      window.parent.postMessage({ type: 'MAP_CANCEL' }, '*');
    }
  </script>
  <script async defer
    src="https://maps.googleapis.com/maps/api/js?key=${key}&callback=initMap&loading=async">
  </script>
</body>
</html>`

  return new Response(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      // Permette all'iframe di caricare la pagina
      'X-Frame-Options': 'SAMEORIGIN',
    },
  })
}
