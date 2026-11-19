// Einmaliges Bauen der statischen Routendateien (data/routes-ab.json, data/pairs.json).
// Quelle: oeffentlicher OSRM-Demo-Server (router.project-osrm.org) auf OpenStreetMap-Daten.
// Nutzungsregeln der Demo: hoechstens 1 Anfrage pro Sekunde, kein Dauerbetrieb -> darum wird
// einmal gebaut und das Ergebnis im Repo gespeichert. Die App selbst fragt NIE einen Routendienst.
// Start:  node tools/fetch-routes.mjs        (dauert ca. 3 Minuten, ca. 140 Anfragen)
import fs from 'node:fs';
import { PLACES } from '../js/places.js?v=2';

const BASE = 'https://router.project-osrm.org/route/v1/driving/';
const P = Object.fromEntries(PLACES.map((p) => [p.id, p]));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rad = Math.PI / 180;
const dist = (a, b) => { // Meter, Haversine auf [lat,lng]
  const dLat = (b[0] - a[0]) * rad, dLng = (b[1] - a[1]) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * rad) * Math.cos(b[0] * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371008.8 * Math.asin(Math.sqrt(h));
};

// Douglas-Peucker; Punkte in keep[] bleiben immer erhalten (Abbiegepunkte).
function simplify(pts, tol, keep) {
  const mx = 111320 * Math.cos(47.3 * rad), my = 110540;
  const xy = pts.map((p) => [p[1] * mx, p[0] * my]);
  const mark = new Uint8Array(pts.length);
  mark[0] = mark[pts.length - 1] = 1; keep.forEach((i) => { mark[i] = 1; });
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    let imax = -1, dmax = 0;
    for (let i = a + 1; i < b; i++) {
      const [x1, y1] = xy[a], [x2, y2] = xy[b], [x, y] = xy[i];
      const dx = x2 - x1, dy = y2 - y1, l2 = dx * dx + dy * dy;
      let t = l2 ? ((x - x1) * dx + (y - y1) * dy) / l2 : 0; t = Math.max(0, Math.min(1, t));
      const d = Math.hypot(x - (x1 + t * dx), y - (y1 + t * dy));
      if (d > dmax) { dmax = d; imax = i; }
    }
    // Zwischen zwei erhaltenen Punkten gibt es evtl. weitere erzwungene: dort teilen
    let forced = -1; for (let i = a + 1; i < b; i++) if (mark[i]) { forced = i; break; }
    if (forced > 0) { stack.push([a, forced], [forced, b]); continue; }
    if (dmax > tol) { mark[imax] = 1; stack.push([a, imax], [imax, b]); }
  }
  return { pts: pts.filter((_, i) => mark[i]), idx: [...mark].map((m, i) => (m ? i : -1)).filter((i) => i >= 0) };
}

async function osrm(coords, extra = '') {
  const url = BASE + coords.map((c) => `${c.lng},${c.lat}`).join(';') + `?overview=false&steps=true&geometries=geojson${extra}`;
  for (let t = 0; t < 3; t++) {
    const r = await fetch(url, { headers: { 'User-Agent': 'taxi-lernkarte-build/1.0 (einmalig, github ayoub971-prog)' } });
    if (r.ok) { const d = await r.json(); if (d.code === 'Ok') return d.routes[0]; }
    await sleep(3000);
  }
  throw new Error('OSRM fehlgeschlagen: ' + url);
}

/** OSRM-Route -> kompaktes Format: {c:[lat,lng,...], st:[[s,name,ref,type,mod,exit,k]...], d, t} */
function compact(route) {
  const pts = []; const stepStart = []; const raw = [];
  const legs = route.legs;
  legs.forEach((leg, li) => leg.steps.forEach((st, si) => {
    const isFirst = li === 0 && si === 0;
    const isLast = li === legs.length - 1 && si === leg.steps.length - 1;
    const g = st.geometry.coordinates.map(([lng, lat]) => [lat, lng]);
    const startIdx = pts.length ? pts.length - 1 : 0;
    if (!pts.length) pts.push(...g); else pts.push(...g.slice(1));
    const t = st.maneuver.type;
    if (!isFirst && !isLast && (t === 'arrive' || t === 'depart')) return; // Zwischenziele ueberspringen
    raw.push({ idx: isFirst ? 0 : startIdx, name: st.name || '', ref: st.ref || '', type: t, mod: st.maneuver.modifier || '', exit: st.maneuver.exit || 0 });
  }));
  const s = simplify(pts, 1.5, raw.map((r) => r.idx));
  const remap = new Map(s.idx.map((o, n) => [o, n]));
  const cum = [0]; for (let i = 1; i < s.pts.length; i++) cum.push(cum[i - 1] + dist(s.pts[i - 1], s.pts[i]));
  const decision = new Set(['turn', 'end of road', 'fork', 'roundabout', 'rotary', 'roundabout turn', 'on ramp', 'off ramp', 'merge', 'arrive', 'depart']);
  const st = raw.map((r) => {
    const straight = r.mod === 'straight' || r.mod === '';
    const k = decision.has(r.type) && !(r.type === 'turn' && straight) ? 1 : 0;
    return [Math.round(cum[remap.get(r.idx)]), r.name, r.ref, r.type, r.mod, r.exit, k];
  });
  return { c: s.pts.flatMap(([a, b]) => [Math.round(a * 1e5) / 1e5, Math.round(b * 1e5) / 1e5]), st, d: Math.round(cum.at(-1)), t: Math.round(route.duration) };
}

const out = { quelle: 'OSRM-Demo auf OpenStreetMap-Daten (© OpenStreetMap-Mitwirkende, ODbL)', erstellt: new Date().toISOString().slice(0, 10), routes: {} };

// Variante A: Autobahn A3. OSRM waehlt von selbst A3 -> Ausfahrt Zuerich-Brunau/Allmendstrasse -> Albisguetli.
console.log('Variante A'); out.routes.A = compact(await osrm([P.waedenswil, P.albisguetli])); await sleep(1200);
// Variante B: Seestrasse. Zwischenziele erzwingen das linke Seeufer, die Teilstrecken sind kurz, so bleibt die Route auf der Seestrasse (wird unten geprueft).
console.log('Variante B');
out.routes.B = compact(await osrm([P.waedenswil, P['au-zh'], P.horgen, P.oberrieden, P.thalwil, P.rueschlikon, P.kilchberg, P.wollishofen, P.enge, P.buerkliplatz]));
fs.writeFileSync('data/routes-ab.json', JSON.stringify(out));
console.log('A', out.routes.A.d, 'm  B', out.routes.B.d, 'm');
const bAuto = out.routes.B.st.filter((s) => /^A\d/.test(s[2])).length;
if (bAuto) { console.error('WARNUNG: Variante B nutzt Autobahnabschnitte:', bAuto); process.exit(1); }

// Pruefungs-Aufgaben: alle Paare zwischen diesen Orten (je Richtung eine echte Route).
const ids = ['waedenswil', 'horgen', 'thalwil', 'kilchberg', 'wollishofen', 'enge', 'sihlcity', 'hb', 'paradeplatz', 'bellevue', 'triemli', 'albisguetli'];
const pairs = { quelle: out.quelle, erstellt: out.erstellt, pairs: {} };
for (const a of ids) for (const b of ids) {
  if (a === b) continue;
  await sleep(1200);
  const r = compact(await osrm([P[a], P[b]]));
  pairs.pairs[`${a}|${b}`] = r;
  process.stdout.write('.');
}
fs.writeFileSync('data/pairs.json', JSON.stringify(pairs));
console.log('\nfertig', Object.keys(pairs.pairs).length, 'Paare');
