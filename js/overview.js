// Uebersichtskarte und Minikarte fuer Spielmodus und Fahrmodus.
//   Uebersicht: pausiert die Fahrt, wechselt in die 2D-Karte (frei zoomen und verschieben), zeigt Auto und Ziel
//               (und auf Wunsch den kuerzesten Weg). "Weiterfahren" bringt die Verfolger-Kamera genau dorthin zurueck, wo du warst.
//   Minikarte:  kleine Nord-oben-Karte in der Ecke waehrend der Fahrt (Auto + Ziel), ein/aus.
import { $, el, toast } from './ui.js?v=3';

const CAR_SVG = '<svg viewBox="0 0 40 70" width="22" height="38"><rect x="4" y="3" width="32" height="64" rx="10" fill="#f9c80e" stroke="#6b5200" stroke-width="3"/><rect x="9" y="14" width="22" height="12" rx="3" fill="#2b3a4a"/><rect x="9" y="42" width="22" height="14" rx="3" fill="#2b3a4a"/></svg>';

export function initOverview(ctx) {
  const { L, map, store, gl } = ctx;
  const app = $('#app'), bar = $('#overview-bar'), mapEl = $('#map');
  const layer = L.layerGroup().addTo(map);
  let cur = null;   // laufende Uebersicht: { spec, carMarker }

  function carNode(heading) { const n = el('div', { class: 'ov-car', style: `transform:rotate(${Math.round(heading)}deg)` }); n.innerHTML = CAR_SVG; return n; }
  const mkCar = (heading) => L.divIcon({ html: carNode(heading), className: '', iconSize: [30, 44], iconAnchor: [15, 22] });

  /**
   * spec: { pos(): {lat,lng,heading}, target: {lat,lng}, pause(): void, resume(): void, hint?(): [[lat,lng]…] | null }
   */
  async function open(spec) {
    if (cur) return;
    cur = { spec };
    spec.pause();
    ctx.forceOverview = true; app.dataset.overview = '1';
    await ctx.applyView();              // 3D -> 2D (die Einstellung 2D/3D bleibt unveraendert)
    mapEl.style.cssText = ''; mapEl.style.transform = '';
    map.invalidateSize({ animate: false });
    const p = spec.pos();
    layer.clearLayers();
    L.marker([p.lat, p.lng], { icon: mkCar(p.heading), interactive: false, zIndexOffset: 1000 }).addTo(layer);
    L.polyline([[p.lat, p.lng], [spec.target.lat, spec.target.lng]], { color: '#1d232a', weight: 3, dashArray: '6 8', opacity: 0.7, interactive: false }).addTo(layer);
    fit(null);
    bar.hidden = false;
    $('#ov-hint').hidden = !spec.hint;
  }
  function fit(extra) {
    const p = cur.spec.pos(), pts = [[p.lat, p.lng], [cur.spec.target.lat, cur.spec.target.lng], ...(extra || [])];
    map.fitBounds(L.latLngBounds(pts), { paddingTopLeft: [40, 90], paddingBottomRight: [40, 130], maxZoom: 17, animate: false });
  }
  async function close() {
    if (!cur) return;
    const { spec } = cur; cur = null;
    layer.clearLayers(); bar.hidden = true;
    ctx.forceOverview = false; app.dataset.overview = '';
    await ctx.applyView();
    spec.resume();
  }
  $('#ov-resume').addEventListener('click', close);
  $('#ov-hint').addEventListener('click', () => { if (!cur?.spec.hint) return; const pts = cur.spec.hint(); if (pts) fit(pts); });

  // ------------------------------------------------------------ Minikarte
  const box = $('#minimap');
  let mm = null, tapHandler = null, lastFit = 0;
  function create() {
    mm = { map: L.map('minimap-map', { zoomControl: false, attributionControl: false, dragging: false, touchZoom: false, scrollWheelZoom: false, doubleClickZoom: false, boxZoom: false, keyboard: false, tap: false, zoomSnap: 0.5, minZoom: 10, maxZoom: 17 }) };
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 17, crossOrigin: true }).addTo(mm.map);
    mm.map.setView([47.3, 8.6], 13);
    mm.car = L.marker([47.3, 8.6], { icon: mkCar(0), interactive: false }).addTo(mm.map);
    mm.tgt = L.marker([47.3, 8.6], { icon: L.divIcon({ html: '<div style="font-size:24px;line-height:24px">🏁</div>', className: '', iconSize: [24, 24], iconAnchor: [4, 22] }), interactive: false }).addTo(mm.map);
  }
  function show(on, onTap) {
    tapHandler = onTap || null;
    box.hidden = !on;
    if (on) { if (!mm) create(); setTimeout(() => mm.map.invalidateSize({ animate: false }), 0); lastFit = 0; }
  }
  /** Aus der Fahrschleife aufrufen (darf oft sein, arbeitet selbst hoechstens ~3x pro Sekunde). */
  function update(pos, heading, target, now = performance.now()) {
    if (box.hidden || !mm || now - lastFit < 330) return;
    lastFit = now;
    mm.car.setLatLng([pos.lat, pos.lng]);
    const n = mm.car.getElement()?.firstChild; if (n) n.style.transform = `rotate(${Math.round(heading)}deg)`;
    mm.tgt.setLatLng([target.lat, target.lng]);
    mm.map.fitBounds(L.latLngBounds([[pos.lat, pos.lng], [target.lat, target.lng]]), { padding: [26, 26], maxZoom: 16, animate: false });
  }
  box.addEventListener('click', () => tapHandler?.());
  const enabled = () => store.state.settings.minimap === true;
  function setEnabled(on) { store.setSetting('minimap', !!on); }

  return { open, close, isOpen: () => !!cur, show, update, enabled, setEnabled };
}
