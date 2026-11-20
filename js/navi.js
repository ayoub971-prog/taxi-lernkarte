// Navi-Look (Fahrmodus und Spielmodus): Abbiegekarte oben links, «Dann:»-Zeile, Restzeit-Leiste, Strassennamen an Abzweigen.
// Der obere Teil (Manoever, Banner-Text, Zeiten, Pfeil-SVG) ist rein und wird in Node getestet (tests/navi.test.mjs).
//
// Manoever: { s: Meterstand (ab Start bzw. ab Auto), kind: 'turn' | 'roundabout' | 'ziel', angle: Grad (negativ = links),
//             name: Strasse nach dem Manoever, exit: Kreisel-Ausfahrt, verb: eigener Text (z. B. «auf die Autobahn auffahren») }

/** Pfeil-Art aus dem Abbiegewinkel (−180..180, negativ = links). */
export function turnKey(angle) {
  const a = Math.abs(angle), side = angle < 0 ? 'links' : 'rechts';
  if (a < 20) return 'gerade';
  if (a < 55) return `leicht-${side}`;
  if (a < 135) return side;
  if (a < 165) return `scharf-${side}`;
  return 'wenden';
}
export const TURN_WORD = { gerade: 'geradeaus weiter', 'leicht-links': 'leicht links', 'leicht-rechts': 'leicht rechts', links: 'links', rechts: 'rechts', 'scharf-links': 'scharf links', 'scharf-rechts': 'scharf rechts', wenden: 'wenden' };

/** Entfernung fuer die Anzeige: «80 m», «350 m», «1.2 km». */
export function fmtDist(m) {
  m = Math.max(0, m);
  if (m < 100) return `${Math.max(10, Math.round(m / 10) * 10)} m`;
  if (m < 300) return `${Math.round(m / 10) * 10} m`;
  if (m < 1000) return `${Math.round(m / 50) * 50} m`;
  return `${(m / 1000).toFixed(m < 10000 ? 1 : 0)} km`;
}
/** Fuer das «In … m»: ab 35 m Rest «Jetzt». */
export const NEAR_M = 350;

/**
 * Banner-Inhalt fuer die Abbiegekarte. list = Manoever (nach s sortiert), s = aktueller Meterstand, dest = Name des Ziels.
 * Rueckgabe: { arrow: Pfeil-Art, dist (m), distText, title, dann: Pfeil-Art | null, far, ziel }
 */
export function naviBanner(list, s, { dest = 'Ziel', thenM = 700 } = {}) {
  const i = list.findIndex((m) => m.s > s - 8);
  if (i < 0) return { arrow: 'ziel', dist: 0, distText: '', title: 'Ziel erreicht', dann: null, far: false, ziel: true };
  const m = list[i], dist = Math.max(0, m.s - s), far = dist > NEAR_M && m.kind !== 'ziel';
  const nx = list[i + 1];
  const dann = nx && nx.s - m.s <= thenM && m.kind !== 'ziel' ? arrowKind(nx) : null;
  const where = (m.name || '').trim();
  const dt = dist < 35 ? 'Jetzt' : fmtDist(dist);
  let title;
  if (m.kind === 'ziel') title = dist < 35 ? `Ziel erreicht${dest ? `: ${dest}` : ''}` : `In ${dt} am Ziel${dest ? `: ${dest}` : ''}`;
  else if (far) title = `Richtung ${where || dest}`;
  else if (m.kind === 'roundabout') title = `${dist < 35 ? 'Jetzt' : `In ${dt}`} im Kreisel ${m.exit ? `${m.exit}. Ausfahrt` : TURN_WORD[turnKey(m.angle || 0)]}${where ? ` auf ${where}` : ''}`;
  else if (m.verb) title = `${dist < 35 ? 'Jetzt' : `In ${dt}`} ${m.verb}`;
  else { const w = TURN_WORD[turnKey(m.angle || 0)]; title = `${dist < 35 ? 'Jetzt' : `In ${dt}`} ${w}${where ? ` auf ${where}` : ''}`; }
  return { arrow: far ? 'gerade' : arrowKind(m), dist, distText: dt, title, dann, far, ziel: m.kind === 'ziel' };
}
export const arrowKind = (m) => (m.kind === 'ziel' ? 'ziel' : m.kind === 'roundabout' ? 'kreisel' : turnKey(m.angle || 0));

/** Restzeit, Restweg und Ankunftsuhrzeit. speed in m/s. */
export function etaInfo(restM, speed, now = new Date()) {
  const sec = speed > 0 ? restM / speed : 0, min = Math.max(1, Math.round(sec / 60));
  const rest = min < 60 ? `${min} Min.` : `${Math.floor(min / 60)} Std. ${String(min % 60).padStart(2, '0')} Min.`;
  const t = new Date(now.getTime() + min * 60000);
  const arrive = `${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}`;
  return { rest, dist: fmtDist(restM).replace(/^(\d+) m$/, (_, n) => `${Math.max(10, Math.round(n / 10) * 10)} m`), arrive, min };
}

/** SVG-Pfeil (weiss, 48x48): gerader Schaft, dann Knick um den Winkel; «wenden» = U, «kreisel» = Ring, «ziel» = Flagge. */
export function arrowSvg(kind, size = 56) {
  const head = (x, y, deg) => `<polygon points="0,-9 8,5 -8,5" transform="translate(${x} ${y}) rotate(${deg})" fill="#fff"/>`;
  const st = 'fill="none" stroke="#fff" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"';
  let body;
  if (kind === 'ziel') body = '<path d="M16 42V8" stroke="#fff" stroke-width="5" stroke-linecap="round"/><path d="M18 9h22l-6 8 6 8H18z" fill="#fff"/>';
  else if (kind === 'wenden') body = `<path d="M34 42V20a9 9 0 0 0-18 0v10" ${st}/>${head(16, 33, 180)}`;
  else if (kind === 'kreisel') body = `<circle cx="24" cy="30" r="9" ${st}/><path d="M24 44v-5" ${st}/><path d="M24 21V9" ${st}/>${head(24, 9, 0)}`;
  else {
    const deg = { gerade: 0, 'leicht-links': -45, 'leicht-rechts': 45, links: -90, rechts: 90, 'scharf-links': -135, 'scharf-rechts': 135 }[kind] ?? 0, r = deg * Math.PI / 180;
    const mx = 24, my = deg === 0 ? 12 : 28, len = deg === 0 ? 0 : 17, ex = mx + Math.sin(r) * len, ey = my - Math.cos(r) * len;
    body = `<path d="M24 44V${my}${deg ? `L${ex.toFixed(1)} ${ey.toFixed(1)}` : ''}" ${st}/>${head(deg ? ex : 24, deg ? ey : 8, deg)}`;
  }
  return `<svg viewBox="0 0 48 48" width="${size}" height="${size}" aria-hidden="true">${body}</svg>`;
}

/** Bildet die DOM-Teile der Abbiegekarte (root enthaelt .na (Pfeil), .nd (Distanz), .nt (Text), .nthen (Dann-Zeile)). */
export function renderBanner(root, b) {
  if (!root) return;
  const na = root.querySelector('.na'), kind = b.arrow;
  if (na.dataset.k !== kind) { na.dataset.k = kind; na.innerHTML = arrowSvg(kind, 58); }
  root.querySelector('.nd').textContent = b.distText || '';
  root.querySelector('.nt').textContent = b.title;
  const th = root.querySelector('.nthen');
  if (b.dann) { th.hidden = false; th.querySelector('.nk').innerHTML = arrowSvg(b.dann, 26); } else th.hidden = true;
}

/** Manoever-Liste fuer eine Fahrmodus-Route (OSRM-Schritte aus drive.js). instruction/streetName kommen aus drive.js. */
export function driveManeuvers(route, destName, { instruction, streetName, posAt }) {
  const out = [];
  for (const st of route.steps) {
    if (!st.k || st.type === 'depart' || st.type === 'arrive') continue;
    const ins = instruction(st), name = streetName(st), p = posAt(route, st.s);
    const m = { s: st.s, kind: /roundabout|rotary/.test(st.type) ? 'roundabout' : 'turn', angle: ins.angle, name, exit: st.exit || 0, lat: p.lat, lng: p.lng };
    if (st.type === 'on ramp') m.verb = `auf die Autobahn auffahren${st.ref ? ` (${st.ref})` : ''}`;
    else if (st.type === 'off ramp') m.verb = `Autobahn verlassen${name ? ` Richtung ${name}` : ''}`;
    else if (st.type === 'merge' || st.type === 'fork') m.verb = ins.text.charAt(0).toLowerCase() + ins.text.slice(1);
    out.push(m);
  }
  const e = posAt(route, route.total);
  out.push({ s: route.total, kind: 'ziel', angle: 0, name: destName || '', lat: e.lat, lng: e.lng });
  return out;
}

/** Oberflaeche: Strassennamen-Etiketten an den naechsten Abzweigen und freies Verschieben der Karte (Fahrersicht) mit «Zentrieren». */
export function initNaviUi(ctx) {
  const { L, map, gl } = ctx;
  const layer = L.layerGroup().addTo(map);
  let key = '';
  /** list: [{ lat, lng, text }] – leere Liste entfernt die Etiketten. */
  function setLabels(list) {
    const k = list.map((p) => `${p.text}@${p.lat.toFixed(5)},${p.lng.toFixed(5)}`).join('|');
    if (k === key) return; key = k;
    layer.clearLayers();
    for (const p of list) {
      const n = document.createElement('span'); n.textContent = p.text;
      L.marker([p.lat, p.lng], { icon: L.divIcon({ className: 'turn-label', html: n, iconSize: [0, 0] }), interactive: false, keyboard: false }).addTo(layer);
    }
    gl.setLabels(list);
  }
  /** Etiketten fuer die naechsten 3 benannten Manoever nach s. */
  const labelsFor = (list, s) => list.filter((m) => m.s > s - 5 && m.kind !== 'ziel' && m.name && m.lat != null).slice(0, 3).map((m) => ({ lat: m.lat, lng: m.lng, text: m.name }));

  // Freies Verschieben (nur Fahrersicht/MapLibre): Kamera folgt nicht mehr, das Auto wird an seiner Geo-Position gezeichnet.
  ctx.freeLook = false;
  const stage = document.querySelector('#stage'), carEl = document.querySelector('#car');
  const recs = () => document.querySelectorAll('.recenter');
  function setFree(on) {
    on = !!on; if (ctx.freeLook === on) return;
    ctx.freeLook = on; recs().forEach((b) => { b.hidden = !on; });
    if (!on) ctx.viewListeners.forEach((f) => f());
  }
  recs().forEach((b) => b.addEventListener('click', () => setFree(false)));
  ctx.setFreeLook = setFree;
  ctx.onUserPan = () => { if (ctx.mode === 'drive' || ctx.mode === 'game') setFree(true); };
  function placeCarFree(pos, heading) {
    const m = gl.map(); if (!m) return;
    const p = m.project([pos.lng, pos.lat]);
    carEl.style.left = `${p.x}px`; carEl.style.top = `${p.y}px`;
    carEl.style.transform = `rotate(${heading - m.getBearing()}deg)`;
  }
  ctx.placeCarFree = placeCarFree;
  return { setLabels, labelsFor, setFree };
}
