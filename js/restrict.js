// Fahrverbot-Markierung (Fahr- und Spielmodus): Wege, die fuer Autos verboten sind (Fussgaengerzonen, Fuss-/Velowege, Treppen,
// Feldwege, Busspuren, gesperrte Strassen), und Einbahnstrassen von hinten.
//   - 2D-Karte: rot-weiss gestrichelte Linien (Leaflet) + Fahrverbot-Zeichen an den Einfahrten, nur rund ums Auto (leicht).
//   - Fahrersicht (MapLibre): Linien kommen direkt aus den Vektorkacheln (map3d.js, boldRoads), die Zeichen aus denselben Einfahrten.
//   - Daten: data/noentry.json (tools/build-noentry.mjs, einmaliger Abzug aus OSM). Einbahn-Einfahrten kommen aus dem Strassennetz (game.js buildBlocked).
const R_GATES = 260, R_WAYS = 420;      // Meter rund ums Auto
const M_LAT = 111320, M_LNG = 111320 * Math.cos(47.3 * Math.PI / 180);
export const KIND_TEXT = { fussgaengerzone: 'Fussgängerzone', fussweg: 'Fussweg', veloweg: 'Veloweg', treppe: 'Treppe', feldweg: 'Feldweg', busspur: 'Busspur', gesperrt: 'Gesperrte Strasse', einbahn: 'Einbahnstrasse (Gegenrichtung)' };
const SIGN_NOENTRY = '<svg viewBox="0 0 32 32" width="30" height="30"><circle cx="16" cy="16" r="14" fill="#d32f2f" stroke="#fff" stroke-width="2.5"/><rect x="7" y="13" width="18" height="6" rx="1" fill="#fff"/></svg>';
const SIGN_NOCARS = '<svg viewBox="0 0 32 32" width="30" height="30"><circle cx="16" cy="16" r="14" fill="#fff" stroke="#d32f2f" stroke-width="4"/><path d="M8 19v-3l2-4h12l2 4v3z M10 19h12" fill="#222"/><circle cx="11" cy="20" r="1.8" fill="#222"/><circle cx="21" cy="20" r="1.8" fill="#222"/></svg>';
export const signSvg = (kind) => (kind === 'einbahn' ? SIGN_NOENTRY : SIGN_NOCARS);

export function initRestrict(ctx) {
  const { L, map, gl } = ctx;
  const layer = L.layerGroup().addTo(map);
  let ne = null, loading = null, active = false, extra = [], last = { lat: 0, lng: 0, t: 0 };

  function load() {
    return (loading ??= fetch('data/noentry.json?v=5').then((r) => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then((j) => { ne = j; return j; }).catch((e) => { loading = null; console.warn('noentry.json:', e.message); return null; }));
  }
  const near = (lat, lng, p, r) => Math.abs(lat - p[0]) * M_LAT < r && Math.abs(lng - p[1]) * M_LNG < r;
  const decode = (arr) => { const out = []; for (let i = 0; i < arr.length; i += 2) out.push([arr[i] / 1e5, arr[i + 1] / 1e5]); return out; };

  /** Zeichnet alles rund um (lat,lng) neu. */
  function render(lat, lng) {
    layer.clearLayers();
    const gates = [];
    if (ne) for (const g of ne.gates) if (near(lat, lng, [g[1] / 1e5, g[2] / 1e5], R_GATES)) gates.push({ lat: g[1] / 1e5, lng: g[2] / 1e5, kind: g[4] });
    for (const g of extra) if (near(lat, lng, [g.lat, g.lng], R_GATES)) gates.push(g);
    if (!gl.active && ne) {
      for (const [kind, arr] of ne.ways) {
        const pts = decode(arr); if (!pts.some((p) => near(lat, lng, p, R_WAYS))) continue;
        L.polyline(pts, { color: '#d32f2f', weight: 6, opacity: 0.92, interactive: false, lineCap: 'round' }).addTo(layer);
        L.polyline(pts, { color: '#fff', weight: 3, opacity: 1, dashArray: '5 9', interactive: false, lineCap: 'butt' }).addTo(layer);
      }
      for (const g of gates) L.marker([g.lat, g.lng], { interactive: false, keyboard: false, icon: L.divIcon({ className: 'ban-sign', html: signSvg(g.kind), iconSize: [30, 30], iconAnchor: [15, 15] }), zIndexOffset: 500 }).addTo(layer);
    }
    if (gl.active) gl.setGates?.(gates);
  }
  /** Pro Bild aufrufen (billig: baut nur alle ~1 s oder nach 40 m neu auf). */
  function update(pos, force = false) {
    if (!active) return;
    const now = performance.now();
    if (!force && now - last.t < 1000 && Math.abs(pos.lat - last.lat) * M_LAT < 40 && Math.abs(pos.lng - last.lng) * M_LNG < 40) return;
    last = { lat: pos.lat, lng: pos.lng, t: now }; render(pos.lat, pos.lng);
  }
  function start(extraGates = []) { active = true; extra = extraGates; last = { lat: 0, lng: 0, t: 0 }; return load(); }
  function stop() { active = false; extra = []; layer.clearLayers(); gl.setGates?.([]); }
  // Beim Wechsel 2D <-> Fahrersicht sofort neu zeichnen
  ctx.viewListeners.push(() => { if (active && last.t) render(last.lat, last.lng); });
  return { start, stop, update, load, data: () => ne, isActive: () => active };
}
