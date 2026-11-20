// Baut data/noentry.json: Wege, auf denen Autos NICHT fahren duerfen (fuer die Fahrverbot-Markierung in der 2D-Karte und die Sperre im Spielmodus).
// EINMALIGER Build-Schritt (nicht Teil der App). Daten: OpenStreetMap-Mitwirkende, ODbL.
//   1. bash tools/fetch-noentry-raw.sh /pfad/zu/osm-noentry     (Fuss-/Velowege, Treppen, Feldwege, Fussgaengerzonen, Busspuren)
//   2. node tools/build-noentry.mjs /pfad/zu/osm-noentry [/pfad/zu/osm-raw]    (osm-raw = Rohdaten von build-graph.mjs, fuer Strassen mit access=no)
// Es bleiben nur Wege, die ans befahrbare Netz (data/graph.json) anschliessen, plus Fussgaengerzonen und gesperrte Strassen.
// Ergebnis: { ways: [[art, [lat1e5, lng1e5, ...]]], gates: [[knotenIndex|-1, lat1e5, lng1e5, peilungGrad, art]] } (gates = Einfahrten).
import fs from 'node:fs';
import path from 'node:path';

const dirNE = process.argv[2] || '/workspace/osm-noentry', dirRaw = process.argv[3] || '/workspace/osm-raw';
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const graph = JSON.parse(fs.readFileSync(path.join(root, 'data/graph.json'), 'utf8'));
const NN = graph.n.length / 2;
const M_LAT = 111320, M_LNG = 111320 * Math.cos(47.3 * Math.PI / 180);
const dM = (a, b) => Math.hypot((a[0] - b[0]) * M_LAT, (a[1] - b[1]) * M_LNG);
const brg = (a, b) => (Math.atan2((b[1] - a[1]) * M_LNG, (b[0] - a[0]) * M_LAT) * 180 / Math.PI + 360) % 360;

// Gitter ueber alle Strassen-Stuetzpunkte (Knoten + Zwischenpunkte der Kanten), um Anschluesse zu finden
const CELL = 0.0004, grid = new Map(), gk = (la, lo) => `${Math.floor(la / CELL)},${Math.floor(lo / CELL)}`;
const nodes = []; for (let i = 0; i < NN; i++) nodes.push([graph.n[2 * i] / 1e5, graph.n[2 * i + 1] / 1e5]);
nodes.forEach((p, i) => { const k = gk(p[0], p[1]); (grid.get(k) || grid.set(k, []).get(k)).push(i); });
function nearNode(p, r = 12) {
  const ci = Math.floor(p[0] / CELL), cj = Math.floor(p[1] / CELL); let best = -1, bd = r;
  for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (const n of grid.get(`${ci + i},${cj + j}`) || []) { const d = dM(p, nodes[n]); if (d < bd) { bd = d; best = n; } }
  return best;
}
const KIND = { pedestrian: 'fussgaengerzone', footway: 'fussweg', path: 'fussweg', cycleway: 'veloweg', steps: 'treppe', track: 'feldweg', bridleway: 'feldweg', busway: 'busspur', bus_guideway: 'busspur' };
const OK_MV = ['yes', 'designated', 'permissive', 'destination', 'agricultural', 'forestry'];

const ways = new Map();
for (const f of fs.readdirSync(dirNE).filter((x) => /^chunk\d+\.json$/.test(x))) for (const w of JSON.parse(fs.readFileSync(path.join(dirNE, f), 'utf8')).elements) if (w.type === 'way' && w.geometry?.length > 1) ways.set(w.id, { w, restricted: false });
let restr = 0;
if (fs.existsSync(dirRaw)) for (const f of fs.readdirSync(dirRaw).filter((x) => /^chunk\d+\.json$/.test(x))) for (const w of JSON.parse(fs.readFileSync(path.join(dirRaw, f), 'utf8')).elements) {
  const t = w.tags || {};
  if (w.type === 'way' && w.geometry?.length > 1 && (['no', 'private'].includes(t.access) || ['no', 'private'].includes(t.motor_vehicle)) && !ways.has(w.id)) { ways.set(w.id, { w, restricted: true }); restr++; }
}
const outWays = [], gates = [], seenGate = [];
const enc = (pts) => pts.flatMap((p) => [Math.round(p[0] * 1e5), Math.round(p[1] * 1e5)]);
function dp(pts, tol = 2) {   // Douglas-Peucker
  if (pts.length < 3) return pts;
  const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1;
  const st = [[0, pts.length - 1]];
  while (st.length) {
    const [a, b] = st.pop(); let md = 0, mi = -1;
    for (let i = a + 1; i < b; i++) {
      const A = pts[a], B = pts[b], P = pts[i], dx = (B[0] - A[0]) * M_LAT, dy = (B[1] - A[1]) * M_LNG, L = Math.hypot(dx, dy) || 1e-9;
      const d = Math.abs(((P[0] - A[0]) * M_LAT) * dy - ((P[1] - A[1]) * M_LNG) * dx) / L; if (d > md) { md = d; mi = i; }
    }
    if (md > tol && mi > 0) { keep[mi] = 1; st.push([a, mi], [mi, b]); }
  }
  return pts.filter((_, i) => keep[i]);
}
function addGate(idx, p, bearing, kind) {
  for (const g of seenGate) if (g[0] === idx && idx >= 0 && Math.abs(((g[3] - bearing + 540) % 360) - 180) < 20) return;
  if (idx < 0 && seenGate.some((g) => g[0] < 0 && dM([g[1] / 1e5, g[2] / 1e5], p) < 25)) return;
  const g = [idx, Math.round(p[0] * 1e5), Math.round(p[1] * 1e5), Math.round(bearing), kind]; seenGate.push(g); gates.push(g);
}
const counts = {};
for (const { w, restricted } of ways.values()) {
  const t = w.tags || {}, h = t.highway;
  let kind = restricted ? 'gesperrt' : KIND[h]; if (!kind) continue;
  if (!restricted) {
    if (t.area === 'yes' || t.indoor || t.tunnel === 'building_passage' && false) continue;
    if (['sidewalk', 'crossing'].includes(t.footway) || t.footway === 'traffic_island' || t.cycleway === 'crossing') continue;
    if (OK_MV.includes(t.motor_vehicle) || OK_MV.includes(t.vehicle) || (t.access === 'yes' && h !== 'pedestrian' && h !== 'steps')) continue;   // fuer Autos erlaubt
    if (h === 'pedestrian' && OK_MV.includes(t.motor_vehicle)) continue;
  }
  const pts = w.geometry.map((g) => [g.lat, g.lon]);
  // Anschluesse ans befahrbare Netz
  const touch = []; pts.forEach((p, i) => { const n = nearNode(p, 6); if (n >= 0) touch.push([i, n]); });
  const wholeKeep = restricted || kind === 'fussgaengerzone';
  if (!touch.length && !wholeKeep) continue;
  let keepPts;
  if (wholeKeep) keepPts = pts;
  else {   // nur 90 m rund um die Anschluesse
    const mark = new Uint8Array(pts.length);
    for (const [i] of touch) for (const dir of [1, -1]) { let s = 0, j = i; mark[j] = 1; while (j + dir >= 0 && j + dir < pts.length && s < 90) { s += dM(pts[j], pts[j + dir]); j += dir; mark[j] = 1; } }
    keepPts = null; const parts = []; let cur = [];
    pts.forEach((p, i) => { if (mark[i]) cur.push(p); else if (cur.length) { parts.push(cur); cur = []; } }); if (cur.length) parts.push(cur);
    for (const part of parts) if (part.length > 1) { outWays.push([kind, enc(dp(part))]); counts[kind] = (counts[kind] || 0) + 1; }
  }
  if (keepPts && keepPts.length > 1) { outWays.push([kind, enc(dp(keepPts))]); counts[kind] = (counts[kind] || 0) + 1; }
  for (const [i, n] of touch) {
    if (i + 1 < pts.length) addGate(n, pts[i], brg(pts[i], pts[i + 1]), kind);
    if (i - 1 >= 0) addGate(n, pts[i], brg(pts[i], pts[i - 1]), kind);
  }
}
const out = { v: 1, src: 'OpenStreetMap-Mitwirkende (ODbL), Overpass-Abzug ' + new Date().toISOString().slice(0, 10), graphNodes: NN, ways: outWays, gates };
const json = JSON.stringify(out);
fs.writeFileSync(path.join(root, 'data/noentry.json'), json);
console.log('Rohwege:', ways.size, '(gesperrte Strassen aus osm-raw:', restr + ')', '| behalten:', outWays.length, counts, '| Einfahrten:', gates.length, '| Knoten-Einfahrten:', gates.filter((g) => g[0] >= 0).length, '|', (json.length / 1024).toFixed(0), 'KB');
