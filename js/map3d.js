// 3D-Ansicht: MapLibre GL JS (lokal im Repo, vendor/maplibre) + OpenFreeMap-Vektorkacheln.
//   - OpenFreeMap ist gratis, ohne Schluessel und ohne Konto (Bedingungen: https://openfreemap.org/tos/).
//   - Der Stil "liberty" enthaelt echte OSM-Gebaeude als Koerper (Ebene "building-3d", fill-extrusion).
//   - Wird erst beim ersten Einschalten von 3D geladen (Skript + Karte). Ohne WebGL oder ohne Internet bleibt die
//     bisherige 2D-Karte (Leaflet + OSM-Kacheln) bestehen.
// Die 2D-Karte (Leaflet) bleibt immer im Hintergrund bestehen: Quiz, Pruefung und Tippen laufen dort.
export const ENABLE_3D = false || new URLSearchParams(location.search).get('3d') === '1';
const STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty';
export const PITCH_MAP = 55;      // Neigung auf der normalen Karte
export const PITCH_DRIVE = 58;    // Neigung im Fahrmodus (Blick von hinten auf das Auto)

export function webglOk() {
  try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch { return false; }
}

export function initMap3d(ctx) {
  const box = document.getElementById('map3d');
  let map = null, loading = null, glOk = null, broken = false;
  const markers = new Map();           // Ort-ID -> Marker
  const lines = {};                    // Schluessel -> { coords:[[lng,lat]…], color, width }
  let locMarker = null, endMarker = null, endPos = null, endLabel = '';
  const moveCbs = [];

  // WebGL da? Die Fahrersicht (geneigte, mitdrehende Karte) laeuft mit MapLibre. Die 3D-Gebaeude und die 3D-Ansicht der normalen Karte
  // sind ueber ENABLE_3D (oder ?3d=1) getrennt geschaltet und standardmaessig AUS.
  const supported = () => !broken && new URLSearchParams(location.search).get('gl') !== '0' && (glOk ??= webglOk());   // ?gl=0 schaltet MapLibre ab (2D-Rueckfall testen)
  const showBuildings = () => ENABLE_3D || ctx.store.state.settings.buildings3d === true;

  function loadScript() {
    if (window.maplibregl) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const link = document.createElement('link'); link.rel = 'stylesheet'; link.href = 'vendor/maplibre/maplibre-gl.css?v=4'; document.head.append(link);
      const s = document.createElement('script'); s.src = 'vendor/maplibre/maplibre-gl.js?v=4';
      s.onload = () => resolve(); s.onerror = () => reject(new Error('maplibre-script'));
      document.head.append(s);
    });
  }

  /** Karte anlegen (einmalig). Wirft einen Fehler, wenn WebGL, Skript oder Stil nicht verfuegbar sind. */
  function ensure() {
    if (map) return Promise.resolve(map);
    let m = null;
    return (loading ??= (async () => {
      if (!supported()) throw new Error('kein WebGL');
      await loadScript();
      const ml = window.maplibregl;
      const c = ctx.map.getCenter();
      m = new ml.Map({
        container: box, style: STYLE_URL, center: [c.lng, c.lat], zoom: Math.max(ctx.map.getZoom() - 1, 8), pitch: PITCH_MAP,
        minZoom: 8, maxZoom: 20, maxPitch: 75, attributionControl: false, fadeDuration: 0, dragRotate: true, touchPitch: true,
        pixelRatio: Math.min(window.devicePixelRatio || 1, 2),   // Speicher/Tempo: hoechstens 2x (iPad, S25 Ultra haben sonst 2-3.5)
        maxTileCacheSize: 80, refreshExpiredTiles: false, renderWorldCopies: false,
      });
      m.addControl(new ml.AttributionControl({ compact: true }), 'bottom-right');
      m.addControl(new ml.NavigationControl({ visualizePitch: true, showCompass: true, showZoom: true }), 'bottom-left');
      await new Promise((resolve, reject) => {
        const t = setTimeout(() => reject(new Error('Zeitueberschreitung')), 20000);
        m.once('load', () => { clearTimeout(t); resolve(); });
        m.on('error', (e) => { if (!m.isStyleLoaded() && /style|Failed to fetch|fetch/i.test(String(e?.error?.message || e?.message))) { clearTimeout(t); reject(e.error || e); } });
      });
      tune(m);
      // iOS/Android koennen den WebGL-Kontext im Hintergrund entziehen: dann sauber auf 2D zurueckfallen
      m.getCanvas().addEventListener('webglcontextlost', (e) => { e.preventDefault(); broken = true; ctx.glLost?.(); });
      m.on('moveend', () => moveCbs.forEach((f) => f()));
      m.on('idle', () => moveCbs.forEach((f) => f()));
      map = m; applyLines(); if (endPos) setEnd(endPos[0], endPos[1], endLabel);
      return m;
    })().catch((e) => { loading = null; try { m?.remove(); box.replaceChildren(); } catch { /* */ } throw e; }));
  }

  /** Stil feinjustieren: realistischere Gebaeude, weniger Symbol-Chaos. */
  function tune(m) {
    for (const l of m.getStyle().layers) if (/^poi/.test(l.id)) m.setLayoutProperty(l.id, 'visibility', 'none');
    if (m.getLayer('building-3d')) {
      m.setLayoutProperty('building-3d', 'visibility', showBuildings() ? 'visible' : 'none');
      m.setPaintProperty('building-3d', 'fill-extrusion-color', ['interpolate', ['linear'], ['coalesce', ['get', 'render_height'], 6],
        0, '#e9dfd0', 12, '#e2d6c4', 30, '#d3cbc2', 70, '#c0c4cc', 160, '#a9b1bf']);
      m.setPaintProperty('building-3d', 'fill-extrusion-opacity', 0.95);
      m.setPaintProperty('building-3d', 'fill-extrusion-vertical-gradient', true);
    }
    boldRoads(m);
    m.setLight({ anchor: 'map', position: [1.4, 215, 38], intensity: 0.5, color: '#fff4e0' });
  }

  /** Fahrersicht: Strassen dicker und kontrastreicher (eigene Ebenen ueber dem Stil, unter den Beschriftungen). Aus dem Stil, kein Zusatz-Download. */
  function boldRoads(m) {
    if (!m.getSource('openmaptiles') || m.getLayer('taxi-road-casing')) return;
    const before = m.getStyle().layers.find((l) => l.type === 'symbol')?.id;
    const major = ['motorway', 'trunk', 'primary', 'secondary', 'tertiary'], minor = ['minor', 'service', 'busway'];
    const w = (a, b, c) => ['interpolate', ['exponential', 1.5], ['zoom'], 12, a, 15, b, 18, c];
    const base = { type: 'line', source: 'openmaptiles', 'source-layer': 'transportation', layout: { 'line-cap': 'round', 'line-join': 'round' } };
    const notTunnel = ['!', ['in', ['get', 'brunnel'], ['literal', ['tunnel']]]];
    const mk = (id, cls, color, width) => m.addLayer({ ...base, id, filter: ['all', ['in', ['get', 'class'], ['literal', cls]], notTunnel], paint: { 'line-color': color, 'line-width': width } }, before);
    mk('taxi-road-casing-minor', minor, '#9aa3ad', w(1.2, 5, 22)); mk('taxi-road-fill-minor', minor, '#ffffff', w(0.6, 3.4, 18));
    mk('taxi-road-casing', major, '#5d6670', w(2.2, 8, 34)); mk('taxi-road-fill', major, ['match', ['get', 'class'], 'motorway', '#ff9a3d', 'trunk', '#ffb347', 'primary', '#ffd54f', 'secondary', '#fff0a8', '#ffffff'], w(1.4, 6, 29));
  }

  // ------------------------------------------------------------ Linien (Routen, Fahrstrecke)
  const firstSymbol = () => map.getStyle().layers.find((l) => l.type === 'symbol')?.id;
  function removeLine(key) {
    for (const id of [`ln-${key}-casing`, `ln-${key}`]) if (map.getLayer(id)) map.removeLayer(id);
    if (map.getSource(`ln-${key}`)) map.removeSource(`ln-${key}`);
  }
  function drawLine(key, { coords, color, width }) {
    removeLine(key);
    map.addSource(`ln-${key}`, { type: 'geojson', data: { type: 'Feature', geometry: { type: 'LineString', coordinates: coords } } });
    const before = firstSymbol();
    const w = (k) => ['interpolate', ['linear'], ['zoom'], 9, k * 0.5, 14, k, 18, k * 1.8];
    map.addLayer({ id: `ln-${key}-casing`, type: 'line', source: `ln-${key}`, layout: { 'line-join': 'round', 'line-cap': 'round' }, paint: { 'line-color': '#fff', 'line-width': w(width + 4), 'line-opacity': 0.85 } }, before);
    map.addLayer({ id: `ln-${key}`, type: 'line', source: `ln-${key}`, layout: { 'line-join': 'round', 'line-cap': 'round' }, paint: { 'line-color': color, 'line-width': w(width), 'line-opacity': 0.92 } }, before);
  }
  function applyLines() { if (!map) return; for (const [k, def] of Object.entries(lines)) drawLine(k, def); }
  /** Linie setzen (latlngs = [[lat,lng],…]) oder mit null entfernen. */
  function setLine(key, latlngs, style = {}) {
    if (!latlngs) { delete lines[key]; if (map) removeLine(key); return; }
    lines[key] = { coords: latlngs.map(([a, b]) => [b, a]), color: style.color || '#1565c0', width: style.width || 5 };
    if (map) drawLine(key, lines[key]);
  }

  // ------------------------------------------------------------ Pins
  function clearPlaces() { for (const mk of markers.values()) mk.remove(); markers.clear(); }
  /** list: Orte; nodeFor(p) -> .pin-Element; popupFor(p) -> DOM-Knoten. */
  function setPlaces(list, nodeFor, popupFor) {
    clearPlaces(); if (!map) return;
    const ml = window.maplibregl;
    for (const p of list) {
      const popup = new ml.Popup({ offset: [0, -46], anchor: 'bottom', maxWidth: '280px', closeButton: true }).setDOMContent(popupFor(p));
      const mk = new ml.Marker({ element: nodeFor(p), anchor: 'top-left', offset: [-22, -46] }).setLngLat([p.lng, p.lat]).setPopup(popup).addTo(map);
      markers.set(p.id, mk);
    }
  }
  const closePopups = () => { for (const mk of markers.values()) if (mk.getPopup()?.isOpen()) mk.togglePopup(); };
  function openPopup(id) { const mk = markers.get(id); if (mk && !mk.getPopup().isOpen()) mk.togglePopup(); }

  function setLocation(lat, lng) {
    locMarker?.remove(); locMarker = null; if (!map || lat == null) return;
    const dot = document.createElement('div'); dot.className = 'tapdot';
    locMarker = new window.maplibregl.Marker({ element: dot }).setLngLat([lng, lat]).addTo(map);
  }
  /** Zielflagge (optional mit Namen daneben). */
  function setEnd(lat, lng, label = '') {
    endMarker?.remove(); endMarker = null; endPos = lat == null ? null : [lat, lng]; endLabel = label; if (!map || lat == null) return;
    const f = document.createElement('div'); f.className = 'endflag'; f.innerHTML = '<span>🏁</span>';
    if (label) { const t = document.createElement('b'); t.textContent = label; f.append(t); }
    endMarker = new window.maplibregl.Marker({ element: f, anchor: 'bottom-left' }).setLngLat([lng, lat]).addTo(map);
  }

  // ------------------------------------------------------------ Kamera
  /** Von der 2D-Karte uebernehmen (Leaflet-Zoom z entspricht MapLibre-Zoom z-1). */
  function syncFrom2D() {
    if (!map) return; const c = ctx.map.getCenter();
    map.jumpTo({ center: [c.lng, c.lat], zoom: Math.max(ctx.map.getZoom() - 1, 8), pitch: PITCH_MAP, bearing: 0, padding: { top: 0, right: 0, bottom: 0, left: 0 } });
  }
  function syncTo2D() {
    if (!map) return; const c = map.getCenter();
    ctx.map.setView([c.lat, c.lng], Math.min(19, Math.max(9, Math.round((map.getZoom() + 1) * 2) / 2)), { animate: false });
  }
  function flyTo(lat, lng, z2d = 16) {
    map?.flyTo({ center: [lng, lat], zoom: z2d - 0.5, pitch: PITCH_MAP, duration: 1100, essential: true });
  }
  function fitPoints(latlngs, pad = 40) {
    if (!map || !latlngs.length) return;
    const b = new window.maplibregl.LngLatBounds(); latlngs.forEach(([a, c]) => b.extend([c, a]));
    map.fitBounds(b, { padding: pad, pitch: 40, bearing: 0, duration: 800, maxZoom: 15 });
  }
  /** Fahr-Kamera: Auto sitzt an der Bildschirmposition (cx, cy) – dafuer wird die Mitte per Padding verschoben. */
  function follow(lat, lng, bearing, zoom, W, H, cx, cy, pitch = PITCH_DRIVE) {
    if (!map) return;
    map.jumpTo({ center: [lng, lat], bearing, zoom, pitch, padding: { top: Math.max(0, 2 * cy - H), right: Math.max(0, W - 2 * cx), bottom: 0, left: 0 } });
  }
  function resetPadding() { map?.jumpTo({ padding: { top: 0, right: 0, bottom: 0, left: 0 }, bearing: 0, pitch: PITCH_MAP }); }

  new ResizeObserver(() => map?.resize()).observe(document.getElementById('stage'));

  return {
    supported, enable3d: ENABLE_3D, setBuildings: (on) => { if (map?.getLayer('building-3d')) map.setLayoutProperty('building-3d', 'visibility', on || ENABLE_3D ? 'visible' : 'none'); }, ensure, setPlaces, clearPlaces, closePopups, openPopup, setLocation, setEnd, setLine,
    syncFrom2D, syncTo2D, flyTo, fitPoints, follow, resetPadding,
    onMove: (f) => moveCbs.push(f),
    map: () => map, container: box, active: false, loaded: () => !!map,
  };
}
