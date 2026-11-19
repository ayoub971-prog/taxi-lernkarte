// Taxi-Lernkarte – Hauptprogramm: Karte, Pins, Orte-Liste, eigene Orte, Sicherung, Navigation.
// Quiz/Pruefung steckt in quizmode.js, der Fahrmodus in drivemode.js. Beide bekommen das Objekt `ctx`.
import { PLACES, STUFEN, TYP_ICON, filterPlaces, BOX } from './places.js?v=2';
import { distanceM, formatDistance } from './geo.js?v=2';
import { createStore, makeBackup, parseBackup } from './store.js?v=2';
import * as progress from './progress.js?v=2';
import { $, $$, el, toast, confirmDialog, speak } from './ui.js?v=2';
import { initQuiz } from './quizmode.js?v=2';
import { initDrive } from './drivemode.js?v=2';
import { initGame } from './gamemode.js?v=2';
import { initOverview } from './overview.js?v=2';
import { initMap3d } from './map3d.js?v=2';
import { layoutLabels, labelPriority } from './labels.js?v=2';

export const APP_VERSION = '2';
const L = window.L;

// ---------------------------------------------------------------- Speicher
function safeStorage() {
  try { const t = '__t'; localStorage.setItem(t, '1'); localStorage.removeItem(t); return localStorage; }
  catch { const m = {}; return { getItem: (k) => m[k] ?? null, setItem: (k, v) => { m[k] = String(v); } }; } // nur fuer diese Sitzung
}
const store = createStore(safeStorage());
try { navigator.storage?.persist?.(); } catch { /* optional */ }

// ---------------------------------------------------------------- Karte
const map = L.map('map', { zoomControl: false, zoomSnap: 0.5, maxZoom: 19, minZoom: 9, tap: true });
L.control.zoom({ position: 'bottomleft', zoomInTitle: 'Vergrössern', zoomOutTitle: 'Verkleinern' }).addTo(map);
map.attributionControl.setPrefix('<a href="https://leafletjs.com" target="_blank" rel="noopener">Leaflet</a>');
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19, crossOrigin: true, updateInterval: 120, keepBuffer: 4,
  attribution: '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>-Mitwirkende',
}).addTo(map);
map.fitBounds(L.latLngBounds(PLACES.map((p) => [p.lat, p.lng])), { padding: [24, 24] });
new ResizeObserver(() => map.invalidateSize({ animate: false })).observe($('#stage'));

// ---------------------------------------------------------------- gemeinsames Objekt fuer die Module
const ownToPlace = (p) => ({ ...p, stufe: 0, type: 'Eigener Ort', address: 'Eigener Ort', own: true });
const ctx = {
  L, map, store, progress, mode: 'normal', filter: { stufe: 'alle', weak: false },
  toast, speak,
  allPlaces: () => [...PLACES, ...store.state.places.map(ownToPlace)],
  /** Orte einer Auswahl: 'alle' | '1' | '2' | '3' | 'eigene' */
  poolFor(sel) {
    const all = ctx.allPlaces();
    if (sel === 'eigene') return all.filter((p) => p.own);
    if (sel === '1' || sel === '2' || sel === '3') return all.filter((p) => p.stufe === Number(sel));
    return all;
  },
  setMode(m) { ctx.mode = m; $('#app').dataset.mode = m; applyView(); },
  showView: (v) => showView(v),
  refresh: () => { renderMarkers(); renderList(); renderBars(); },
  pinIcon: (p, o) => pinIcon(p, o),
  onMapClick: null,
  setMarkersVisible(on) { if (on) { map.addLayer(markerLayer); renderMarkers(); } else { map.removeLayer(markerLayer); gl.clearPlaces(); } },
  setFilter(stufe, weak = false) { ctx.filter = { stufe, weak }; syncChips(); ctx.refresh(); },
  resize: () => map.invalidateSize({ animate: false }),
  routesAB: loadRoutesAB,
  setLabels(on) { store.setSetting('labels', on); applyLabels(); },
  flyToPlace,
};
window.__taxi = ctx;
const gl = initMap3d(ctx);   // 3D-Ansicht (MapLibre), wird erst bei Bedarf geladen
ctx.gl = gl; ctx.viewListeners = [];

// ---------------------------------------------------------------- 2D / 3D umschalten
/** 3D gewuenscht? Standard: ja, wenn WebGL vorhanden ist. Gemerkt wird nur die Wahl der Person. */
const want3d = () => store.state.settings.view3d !== false && gl.supported() && !ctx.forceOverview;
let applying = Promise.resolve();
/** Zeigt je nach Modus die 3D- oder die 2D-Karte. Quiz und Pruefung laufen immer in 2D (genaues Tippen). */
function applyView() {
  return (applying = applying.then(doApplyView));
}
async function doApplyView() {
  const app = $('#app');
  const wantGl = want3d() && (ctx.mode === 'normal' || ctx.mode === 'drive' || ctx.mode === 'game');
  if (wantGl && !gl.active) {
    try { try { await gl.ensure(); } catch (e0) { if (!gl.supported()) throw e0; await new Promise((r) => setTimeout(r, 1500)); await gl.ensure(); } }   // 1 Wiederholung: beim allerersten Start uebernimmt gerade der Service Worker
    catch (e) {
      console.warn('3D nicht verfuegbar:', e?.message || e);
      if (!gl.failedToasted) { gl.failedToasted = true; toast(gl.supported() ? '3D braucht Internet – die 2D-Karte bleibt aktiv.' : 'Dein Gerät kann kein 3D (WebGL) – die 2D-Karte bleibt aktiv.', 4500); }
      syncViewBtn(); return;
    }
    if (!(want3d() && (ctx.mode === 'normal' || ctx.mode === 'drive' || ctx.mode === 'game'))) return doApplyView();   // Modus hat sich waehrend des Ladens geaendert
    gl.syncFrom2D(); gl.active = true; app.dataset.gl = '3d';
    gl.map().resize(); renderMarkers(); reapplyLocation();
  } else if (!wantGl && gl.active) {
    gl.active = false; app.dataset.gl = '2d';
    gl.syncTo2D(); map.invalidateSize({ animate: false });
    if (gl.loaded()) gl.clearPlaces();
    renderMarkers();
  } else if (!wantGl) app.dataset.gl = '2d';
  syncViewBtn(); layoutActive(); ctx.viewListeners.forEach((f) => f());
}
function syncViewBtn() {
  const on = gl.active;
  for (const b of $$('#btn-3d, #drv-3d')) { b.setAttribute('aria-pressed', String(on)); b.querySelector('span') ? (b.querySelector('span').textContent = on ? '2D' : '3D') : (b.textContent = on ? '2D' : '3D'); }
  $('#btn-3d').hidden = !gl.supported();
}
ctx.applyView = applyView;
ctx.glLost = () => { toast('3D wurde vom Gerät beendet – die 2D-Karte übernimmt.', 4500); applyView(); };
// iOS: Seitenzoom per Zwei-Finger-Geste und Doppeltipp-Zoom verhindern (die Karten haben ihr eigenes Zoomen)
['gesturestart', 'gesturechange'].forEach((t) => document.addEventListener(t, (e) => e.preventDefault(), { passive: false }));
function toggle3d() { store.setSetting('view3d', !gl.active); gl.failedToasted = false; return applyView(); }
$('#btn-3d').addEventListener('click', toggle3d);
$('#drv-3d').addEventListener('click', toggle3d);

// ---------------------------------------------------------------- Pins
function pinNode(p, { label = true, cls = '' } = {}) {
  const m = p.own ? 'own' : 'm-' + progress.mastery(store.state.progress, p.id);
  const node = el('div', { class: `pin ${m} ${label ? '' : 'nolabel'} ${cls}`, 'data-prio': String(labelPriority(p)) },
    el('span', { class: 'pin-dot' }), el('span', { class: 'pin-ico', 'aria-hidden': 'true' }, p.own ? '⭐' : (TYP_ICON[p.type] || '📍')),
    el('span', { class: 'pin-label' }, p.label || p.name));
  return node;
}
function pinIcon(p, o = {}) {
  return L.divIcon({ html: pinNode(p, o), className: '', iconSize: [44, 48], iconAnchor: [22, 46], popupAnchor: [0, -44] });
}

const markerLayer = L.layerGroup().addTo(map);
const markers = new Map();

function visiblePlaces() {
  let list = ctx.poolFor(ctx.filter.stufe);
  if (ctx.filter.weak) list = list.filter((p) => progress.mastery(store.state.progress, p.id) === 'rot');
  return list;
}

function popupNode(p) {
  const m = progress.mastery(store.state.progress, p.id);
  const mtxt = { rot: 'noch schwach', gelb: 'unterwegs', gruen: 'sicher' }[m];
  const n = el('div', {}, el('b', {}, p.name), el('br'),
    p.own ? null : el('span', {}, `${TYP_ICON[p.type] || '📍'} ${p.type} · Stufe ${p.stufe}`), p.own ? null : el('br'),
    p.address && !p.own ? el('span', {}, p.address) : null, p.address && !p.own ? el('br') : null,
    p.note ? el('span', {}, p.note) : null, p.note ? el('br') : null,
    el('small', {}, p.own ? 'Eigener Ort' : `Lernstand: ${mtxt}`));
  if (p.own) {
    n.append(el('br'),
      el('button', { class: 'pbtn', type: 'button', onclick: () => { closePopups(); openPlaceDialog({ place: p }); } }, '✏️ Bearbeiten'),
      el('button', { class: 'pbtn danger', type: 'button', onclick: () => deletePlace(p) }, '🗑️ Löschen'));
  }
  return n;
}

function renderMarkers() {
  markerLayer.clearLayers(); markers.clear(); gl.clearPlaces();
  if (ctx.mode !== 'normal') return;
  for (const p of visiblePlaces()) {
    const mk = L.marker([p.lat, p.lng], { icon: pinIcon(p), title: p.name, keyboard: true, riseOnHover: true });
    mk.bindPopup(() => popupNode(p), { maxWidth: 280 });
    markerLayer.addLayer(mk); markers.set(p.id, mk);
  }
  if (gl.active || gl.loaded()) gl.setPlaces(visiblePlaces(), (p) => pinNode(p), popupNode);
  requestAnimationFrame(layoutActive);
}
function closePopups() { map.closePopup(); gl.closePopups(); }

/** Beschriftungen der gerade sichtbaren Karte neu platzieren (siehe labels.js). */
function layoutActive() { if (ctx.mode === 'normal') layoutLabels(gl.active ? gl.container : $('#map')); }
map.on('zoomend moveend', layoutActive);
gl.onMove(layoutActive);

function flyToPlace(p) {
  showView('karte');
  if (gl.active) {
    gl.flyTo(p.lat, p.lng, 16.5);
    gl.map().once('moveend', () => gl.openPopup(p.id));
    return;
  }
  const mk = markers.get(p.id);
  map.flyTo([p.lat, p.lng], 16, { duration: 1 });
  if (mk) map.once('moveend', () => mk.openPopup());
}

// ---------------------------------------------------------------- Namen ein/aus
function applyLabels() {
  const on = store.state.settings.labels !== false;
  $('#map').classList.toggle('labels-off', !on); gl.container.classList.toggle('labels-off', !on);
  $('#btn-labels').setAttribute('aria-pressed', String(on));
  layoutActive();
}
$('#btn-labels').addEventListener('click', () => { store.setSetting('labels', !(store.state.settings.labels !== false)); applyLabels(); });

// ---------------------------------------------------------------- Routen A / B (Lernskizze)
let routesPromise = null;
function loadRoutesAB() { return routesPromise ??= fetch('data/routes-ab.json?v=2').then((r) => r.json()); }
const routeLayers = {};
const ROUTE_STYLE = {
  A: { color: '#1565c0', weight: 5, title: 'Variante A – Autobahn A3' },
  B: { color: '#2e7d32', weight: 5, title: 'Variante B – Seestrasse' },
};
async function toggleRoute(key) {
  const btn = $(key === 'A' ? '#btn-route-a' : '#btn-route-b');
  if (routeLayers[key]) { map.removeLayer(routeLayers[key]); delete routeLayers[key]; gl.setLine('route-' + key, null); }
  else {
    try {
      const data = await loadRoutesAB();
      const c = data.routes[key].c, pts = [];
      for (let i = 0; i < c.length; i += 2) pts.push([c[i], c[i + 1]]);
      const st = ROUTE_STYLE[key];
      const line = L.polyline(pts, { color: st.color, weight: st.weight, opacity: 0.85, lineJoin: 'round' });
      const casing = L.polyline(pts, { color: '#fff', weight: st.weight + 4, opacity: 0.8, interactive: false });
      const grp = L.featureGroup(key === 'B' ? [casing, line] : [casing, line]).addTo(map);
      line.bindPopup(`<b>${st.title}</b><br>${(data.routes[key].d / 1000).toFixed(1)} km · Lernskizze, keine Prüfungsroute`);
      routeLayers[key] = grp;
      gl.setLine('route-' + key, pts, { color: st.color, width: 5 });
      if (gl.active) gl.fitPoints(pts, 40); else map.fitBounds(grp.getBounds(), { padding: [30, 30] });
    } catch { toast('Route konnte nicht geladen werden.'); }
  }
  btn.setAttribute('aria-pressed', String(!!routeLayers[key]));
  $('#legend').hidden = !Object.keys(routeLayers).length;
}
$('#btn-route-a').addEventListener('click', () => toggleRoute('A'));
$('#btn-route-b').addEventListener('click', () => toggleRoute('B'));

// ---------------------------------------------------------------- Mein Standort + "In der Naehe"
let locLayer = null, lastLoc = null;
function reapplyLocation() { if (lastLoc) gl.setLocation(lastLoc.lat, lastLoc.lng); }
$('#btn-locate').addEventListener('click', () => {
  if (!navigator.geolocation) return toast('Dein Gerät kann den Standort nicht bestimmen.');
  toast('Standort wird gesucht …');
  navigator.geolocation.getCurrentPosition((pos) => {
    const ll = L.latLng(pos.coords.latitude, pos.coords.longitude);
    locLayer?.remove();
    locLayer = L.layerGroup([L.circle(ll, { radius: pos.coords.accuracy, color: '#1565c0', weight: 1, fillOpacity: 0.08 }),
      L.circleMarker(ll, { radius: 9, color: '#fff', weight: 3, fillColor: '#1565c0', fillOpacity: 1 })]).addTo(map);
    lastLoc = { lat: ll.lat, lng: ll.lng };
    if (gl.active) { gl.setLocation(ll.lat, ll.lng); gl.flyTo(ll.lat, ll.lng, 15.5); } else map.flyTo(ll, 15, { duration: 1 });
    showNearby(ll);
  }, (err) => toast(err.code === 1 ? 'Standort nicht erlaubt. Bitte in den Chrome-Einstellungen freigeben.' : 'Standort nicht gefunden.'),
  { enableHighAccuracy: true, timeout: 15000, maximumAge: 10000 });
});
function showNearby(ll) {
  const near = ctx.allPlaces().map((p) => ({ p, d: distanceM({ lat: ll.lat, lng: ll.lng }, p) })).sort((a, b) => a.d - b.d).slice(0, 3);
  const box = $('#nearby'); box.replaceChildren(el('h3', {}, 'In der Nähe'),
    ...near.map(({ p, d }) => el('button', { type: 'button', onclick: () => { box.hidden = true; flyToPlace(p); } }, `${TYP_ICON[p.type] || '📍'} ${p.label || p.name} – ${formatDistance(d)}`)),
    el('button', { type: 'button', onclick: () => { box.hidden = true; } }, '✕ Schliessen'));
  box.hidden = false;
}
ctx.showNearby = showNearby;

// ---------------------------------------------------------------- Eigene Orte: Dialog, Langdruck
const dlgPlace = $('#dlg-place');
let editing = null;
function openPlaceDialog({ latlng, place }) {
  editing = place ? { id: place.id, lat: place.lat, lng: place.lng } : { lat: latlng.lat, lng: latlng.lng };
  $('#dlg-place-title').textContent = place ? 'Ort bearbeiten' : 'Neuer Ort';
  $('#in-name').value = place?.name ?? ''; $('#in-note').value = place?.note ?? '';
  $('#in-coords').textContent = `Lage: ${editing.lat.toFixed(5)}, ${editing.lng.toFixed(5)}`;
  dlgPlace.showModal(); setTimeout(() => $('#in-name').focus(), 50);
}
$('#form-place').addEventListener('submit', (e) => {
  e.preventDefault();
  const name = $('#in-name').value.trim(); if (!name) return;
  const data = { name, note: $('#in-note').value, lat: editing.lat, lng: editing.lng };
  const saved = editing.id ? store.updatePlace(editing.id, data) : store.addPlace(data);
  dlgPlace.close();
  if (!saved) return toast('Speichern nicht möglich.');
  ctx.refresh(); toast(editing.id ? 'Gespeichert.' : `«${saved.name}» gespeichert.`);
});
$('#place-cancel').addEventListener('click', () => dlgPlace.close());
async function deletePlace(p) {
  closePopups();
  if (await confirmDialog(`«${p.name}» löschen?`, 'Löschen')) { store.removePlace(p.id); store.mutateProgress((pr) => { delete pr[p.id]; }); ctx.refresh(); toast('Gelöscht.'); }
}

// Langer Druck (ca. 0.6 s) auf die Karte -> neuer Ort. Eigene Erkennung, weil das native
// "contextmenu" bei Finger und S Pen nicht ueberall gleich ausgeloest wird.
let press = null, suppressUntil = 0;
const cancelPress = () => { if (press) { clearTimeout(press.timer); press = null; } };
/** Langdruck-Erkennung fuer einen Karten-Container; toLatLng wandelt Bildschirmpunkt -> {lat,lng}. */
function watchLongPress(cont, ignore, toLatLng) {
  cont.addEventListener('pointerdown', (e) => {
    cancelPress();
    if (!e.isPrimary || ctx.mode !== 'normal' || e.target.closest(ignore)) return;
    const ev = { clientX: e.clientX, clientY: e.clientY };
    press = { x: e.clientX, y: e.clientY, timer: setTimeout(() => {
      press = null; suppressUntil = Date.now() + 900;
      openPlaceDialog({ latlng: toLatLng(ev) });
    }, 600) };
  });
  cont.addEventListener('pointermove', (e) => { if (press && Math.hypot(e.clientX - press.x, e.clientY - press.y) > 10) cancelPress(); });
  ['pointerup', 'pointercancel', 'pointerleave'].forEach((t) => cont.addEventListener(t, cancelPress));
  cont.addEventListener('contextmenu', (e) => e.preventDefault());
}
watchLongPress(map.getContainer(), '.leaflet-control, .leaflet-marker-icon, .leaflet-popup', (ev) => map.mouseEventToLatLng(ev));
watchLongPress(gl.container, '.maplibregl-ctrl, .maplibregl-marker, .maplibregl-popup', (ev) => {
  const r = gl.container.getBoundingClientRect(), ll = gl.map().unproject([ev.clientX - r.left, ev.clientY - r.top]);
  return { lat: ll.lat, lng: ll.lng };
});
map.on('zoomstart movestart', cancelPress);
map.on('contextmenu', (e) => { if (ctx.mode === 'normal' && !gl.active && Date.now() > suppressUntil) openPlaceDialog({ latlng: e.latlng }); });
map.on('click', (e) => { if (Date.now() > suppressUntil && ctx.onMapClick) ctx.onMapClick(e); });

// ---------------------------------------------------------------- Orte-Liste, Filter, Fortschritt
function syncChips() {
  $$('#chips .chip[data-f]').forEach((c) => c.classList.toggle('on', c.dataset.f === ctx.filter.stufe));
  $('#chips .chip.weak').setAttribute('aria-pressed', String(ctx.filter.weak));
}
$('#chips').addEventListener('click', (e) => {
  const c = e.target.closest('.chip'); if (!c) return;
  if (c.dataset.weak) ctx.setFilter(ctx.filter.stufe, !ctx.filter.weak); else ctx.setFilter(c.dataset.f, ctx.filter.weak);
});
$('#search').addEventListener('input', renderList);

function renderList() {
  const list = filterPlaces(visiblePlaces(), $('#search').value);
  const ul = $('#place-list'); ul.replaceChildren();
  for (const p of list) {
    const m = p.own ? 'own' : progress.mastery(store.state.progress, p.id);
    const sub = p.own ? 'Eigener Ort' : `Stufe ${p.stufe} · ${p.type}`;
    const li = el('li', {}, el('button', { class: 'item', type: 'button', onclick: () => flyToPlace(p) },
      el('span', { class: `dot ${m}` }), el('span', {}, el('span', { class: 'name' }, p.name), el('span', { class: 'sub' }, sub))));
    if (p.own) { li.firstChild.append(el('span', { class: 'edit', role: 'button', 'aria-label': 'Bearbeiten', onclick: (e) => { e.stopPropagation(); openPlaceDialog({ place: p }); } }, '✏️')); }
    ul.append(li);
  }
  $('#place-empty').hidden = list.length > 0;
}

function renderBars() {
  const box = $('#progress-bars'); box.replaceChildren();
  const rows = [['Stufe 1', ctx.poolFor('1')], ['Stufe 2', ctx.poolFor('2')], ['Stufe 3', ctx.poolFor('3')]];
  if (store.state.places.length) rows.push(['Eigene', ctx.poolFor('eigene')]);
  for (const [lab, pool] of rows) {
    const s = progress.summary(pool, store.state.progress);
    const w = (n) => `${s.n ? (n / s.n) * 100 : 0}%`;
    box.append(el('div', { class: 'prog' }, el('span', { class: 'lab' }, `${lab} · ${s.gruen}/${s.n} sicher`),
      el('span', { class: 'bar' }, el('i', { class: 'g', style: `width:${w(s.gruen)}` }), el('i', { class: 'y', style: `width:${w(s.gelb)}` }), el('i', { class: 'r', style: `width:${w(s.rot)}` })),
      el('span', { class: 'pct' }, `${s.pct} %`)));
  }
  const qp = $('#quiz-progress');
  if (qp) { const s = progress.summary(ctx.poolFor($('#quiz-stufe').value), store.state.progress); qp.textContent = `${s.gruen} von ${s.n} Orten sicher (grün), ${s.gelb} unterwegs (gelb), ${s.rot} schwach (rot).`; }
  const hb = $('#btn-heute');
  if (hb) hb.textContent = `☀️ Heute üben (${progress.dueTodayCount(ctx.allPlaces(), store.state.progress, 10)} Fragen)`;
}

// ---------------------------------------------------------------- Navigation
const PANELS = { orte: '#panel-orte', quiz: '#panel-quiz', fahren: '#panel-fahren', mehr: '#panel-mehr' };
function showView(v) {
  if (v !== 'karte') { ctx.quiz?.stop(); }
  if (v !== 'karte' && v !== 'fahren') { ctx.drive?.stop(); }
  if (v === 'fahren' && ctx.drive?.isActive()) v = 'karte';
  $('#app').dataset.view = v;
  for (const [k, sel] of Object.entries(PANELS)) $(sel).hidden = k !== v;
  if (v === 'orte') { renderList(); renderBars(); }
  if (v === 'quiz') { renderBars(); renderQuizStats(); }
  if (v === 'karte') setTimeout(() => { map.invalidateSize({ animate: false }); gl.map()?.resize(); layoutActive(); }, 0);
}
$$('#nav .nav-btn').forEach((b) => b.addEventListener('click', () => showView(b.dataset.view)));

function renderQuizStats() {
  const s = store.state.stats; const parts = [];
  if (s.ueben_wo) parts.push(`Wo ist …?: Bestwert ${s.ueben_wo.best} %`);
  if (s.ueben_name) parts.push(`Welcher Ort?: Bestwert ${s.ueben_name.best} %`);
  if (s.pruefen) parts.push(`Prüfen: Bestwert ${s.pruefen.best} %`);
  $('#quiz-stats').textContent = parts.join(' · ');
}
ctx.renderQuizStats = renderQuizStats;
$('#quiz-stufe').addEventListener('change', renderBars);

// ---------------------------------------------------------------- Einstellungen (Fahren)
$('#set-questions').checked = store.state.settings.questions !== false;
$('#set-voice').checked = !!store.state.settings.voice;
$('#set-questions').addEventListener('change', (e) => store.setSetting('questions', e.target.checked));
$('#set-voice').addEventListener('change', (e) => store.setSetting('voice', e.target.checked));

// ---------------------------------------------------------------- Sicherung (JSON)
const backupMsg = (t) => { $('#backup-msg').textContent = t; };
$('#btn-export').addEventListener('click', () => {
  const blob = new Blob([makeBackup(store.state)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = el('a', { href: url, download: `taxi-lernkarte-sicherung-${new Date().toISOString().slice(0, 10)}.json` });
  document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 5000);
  backupMsg(`Gespeichert: ${store.state.places.length} eigene Orte, Lernstand inklusive. Die Datei liegt im Ordner «Downloads».`);
});
$('#btn-import').addEventListener('click', () => $('#file-import').click());
$('#file-import').addEventListener('change', async (e) => {
  const f = e.target.files[0]; e.target.value = ''; if (!f) return;
  const r = parseBackup(await f.text());
  if (r.error) return backupMsg(r.error);
  const res = store.importPlaces(r.places);
  store.mutateProgress((pr) => { for (const [id, e2] of Object.entries(r.progress)) if (!pr[id] || (e2.right + e2.wrong) > (pr[id].right + pr[id].wrong)) pr[id] = e2; });
  store.mutateRepeat((rep) => { for (const [k, v] of Object.entries(r.repeat)) if (!rep[k]) rep[k] = v; });
  ctx.refresh();
  backupMsg(`Geladen: ${res.added} neue Orte${res.skipped ? `, ${res.skipped} übersprungen (schon vorhanden oder ungültig)` : ''}. Lernstand zusammengeführt.`);
});
$('#btn-reset').addEventListener('click', async () => {
  if (await confirmDialog('Lernfortschritt (Ampelfarben, Wiederholungen, Bestwerte) wirklich zurücksetzen? Eigene Orte bleiben.', 'Zurücksetzen')) { store.resetProgress(); ctx.refresh(); backupMsg('Lernfortschritt zurückgesetzt.'); }
});
$('#app-version').textContent = APP_VERSION;

// ---------------------------------------------------------------- Offline-Hinweis, Start
const updateOnline = () => { $('#offline').hidden = navigator.onLine; };
addEventListener('online', updateOnline); addEventListener('offline', updateOnline); updateOnline();

ctx.quiz = initQuiz(ctx);
ctx.overview = initOverview(ctx);
ctx.drive = initDrive(ctx);
ctx.game = initGame(ctx);
applyLabels(); renderMarkers(); renderList(); renderBars(); showView('karte'); syncViewBtn(); applyView();

if (!store.state.settings.introSeen) {
  const dlg = $('#dlg-intro'); dlg.addEventListener('close', () => store.setSetting('introSeen', true));
  setTimeout(() => dlg.showModal(), 300);
}

if ('serviceWorker' in navigator) {
  addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => { /* ohne SW laeuft die App trotzdem, nur nicht offline */ }));
}
