// Baut data/graph.json: ein kompaktes Strassennetz (OpenStreetMap) fuer den Spielmodus "Selber fahren".
//
// EINMALIGER Build-Schritt (nicht Teil der App). Daten: OpenStreetMap-Mitwirkende, ODbL.
//   1. Rohdaten holen (6 Abfragen nacheinander, 20 s Pause, eigener User-Agent) – siehe tools/fetch-graph-raw.sh
//        bash tools/fetch-graph-raw.sh /pfad/zu/osm-raw
//   2. Graph bauen:  node tools/build-graph.mjs /pfad/zu/osm-raw
//
// Auswahl: motorway/trunk/primary/secondary/tertiary/unclassified (+ _link) im ganzen Gebiet,
// residential/living_street nur im Umkreis von 450 m um Orte und um die Routen A/B (haelt die Datei klein).
// Ergebnis: nur die groesste "stark zusammenhaengende" Komponente (man kommt von jedem Punkt zu jedem anderen,
// Einbahnstrassen beachtet). Strassen werden an Kreuzungen in Kanten zerlegt.
import fs from 'node:fs';
import path from 'node:path';
import { PLACES } from '../js/places.js';

const dir = process.argv[2] || '/workspace/osm-raw';
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const CLASSES = ['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'unclassified', 'residential', 'living_street'];
const clsOf = (h) => CLASSES.indexOf(h.replace('_link', ''));
const NEAR_M = 450;

// ---- Rohdaten lesen (Duplikate ueber way-id entfernen)
const ways = new Map();
for (const f of fs.readdirSync(dir).filter((x) => /^chunk\d+\.json$/.test(x))) {
  const j = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
  for (const w of j.elements) if (w.type === 'way' && w.geometry && w.geometry.length > 1) ways.set(w.id, w);
}
console.log('Wege roh:', ways.size);

// ---- Schluesselpunkte (Orte + Routen) fuer die Auswahl der Wohnstrassen
const keyPts = PLACES.map((p) => [p.lat, p.lng]);
const rA = JSON.parse(fs.readFileSync(path.join(root, 'data/routes-ab.json'), 'utf8'));
for (const r of Object.values(rA.routes)) for (let i = 0; i < r.c.length; i += 8) keyPts.push([r.c[i], r.c[i + 1]]);
const CELL = 0.005;
const grid = new Map();
const gk = (la, lo) => `${Math.floor(la / CELL)},${Math.floor(lo / CELL)}`;
for (const p of keyPts) { const k = gk(p[0], p[1]); (grid.get(k) || grid.set(k, []).get(k)).push(p); }
const M_LAT = 111320, M_LNG = 111320 * Math.cos(47.3 * Math.PI / 180);
const dM = (a, b) => Math.hypot((a[0] - b[0]) * M_LAT, (a[1] - b[1]) * M_LNG);
function nearKey(la, lo) {
  const ci = Math.floor(la / CELL), cj = Math.floor(lo / CELL);
  for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (const p of grid.get(`${ci + i},${cj + j}`) || []) if (dM([la, lo], p) < NEAR_M) return true;
  return false;
}

// ---- Wege filtern
const keep = [];
for (const w of ways.values()) {
  const t = w.tags || {}, h = t.highway || '';
  const c = clsOf(h); if (c < 0) continue;
  if (t.area === 'yes' || ['no', 'private'].includes(t.access) || ['no', 'private'].includes(t.motor_vehicle)) continue;
  if (c >= 6 && !w.geometry.some((g) => nearKey(g.lat, g.lon))) continue;
  keep.push(w);
}
console.log('Wege behalten:', keep.length);

// ---- Knoten: Koordinate als Schluessel; Kreuzung = in >= 2 Wegen oder Wegende
const K = (g) => `${Math.round(g.lat * 1e5)},${Math.round(g.lon * 1e5)}`;
const use = new Map();
for (const w of keep) for (const g of w.geometry) use.set(K(g), (use.get(K(g)) || 0) + 1);

function simplify(pts, tol) { // Douglas-Peucker in Metern
  if (pts.length < 3) return pts;
  const keepI = new Array(pts.length).fill(false); keepI[0] = keepI[pts.length - 1] = true;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop(); let md = 0, mi = -1;
    const ax = pts[a][1] * M_LNG, ay = pts[a][0] * M_LAT, bx = pts[b][1] * M_LNG, by = pts[b][0] * M_LAT, dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy;
    for (let i = a + 1; i < b; i++) {
      const px = pts[i][1] * M_LNG - ax, py = pts[i][0] * M_LAT - ay;
      const t = L2 ? Math.max(0, Math.min(1, (px * dx + py * dy) / L2)) : 0;
      const d = Math.hypot(px - t * dx, py - t * dy);
      if (d > md) { md = d; mi = i; }
    }
    if (md > tol && mi > 0) { keepI[mi] = true; stack.push([a, mi], [mi, b]); }
  }
  return pts.filter((_, i) => keepI[i]);
}

const nodeId = new Map(); const nodes = [];
const nid = (g) => { const k = K(g); if (!nodeId.has(k)) { nodeId.set(k, nodes.length); nodes.push([Math.round(g.lat * 1e5), Math.round(g.lon * 1e5)]); } return nodeId.get(k); };
const names = ['']; const nameIdx = new Map([['', 0]]);
const nmi = (s) => { if (!nameIdx.has(s)) { nameIdx.set(s, names.length); names.push(s); } return nameIdx.get(s); };
const lenOf = (pts) => { let s = 0; for (let i = 1; i < pts.length; i++) s += dM(pts[i - 1], pts[i]); return s; };

const edges = []; // {a,b,cls,ms,nm,ow,pts:[[lat,lng]]}
for (const w of keep) {
  const t = w.tags, h = t.highway, cls = clsOf(h);
  let geom = w.geometry.map((g) => ({ lat: g.lat, lon: g.lon }));
  let ow = 0;
  const o = t.oneway;
  if (o === 'yes' || o === 'true' || o === '1') ow = 1;
  else if (o === '-1') { ow = 1; geom = geom.reverse(); }
  else if (o !== 'no' && (t.junction === 'roundabout' || h === 'motorway' || h === 'motorway_link')) ow = 1;
  const ms = parseInt(String(t.maxspeed || '').replace(/[^0-9]/g, ''), 10) || 0;
  const nm = nmi(t.name || t.ref || '');
  let start = 0;
  for (let i = 1; i < geom.length; i++) {
    if (i === geom.length - 1 || use.get(K(geom[i])) >= 2) {
      const seg = geom.slice(start, i + 1);
      const a = nid(seg[0]), b = nid(seg[seg.length - 1]);
      const pts = simplify(seg.map((g) => [g.lat, g.lon]), 1.5);
      if (!(a === b && pts.length < 3)) edges.push({ a, b, cls, ms, nm, ow, pts });
      start = i;
    }
  }
}
console.log('Knoten roh:', nodes.length, 'Kanten roh:', edges.length);

// ---- groesste stark zusammenhaengende Komponente (iteratives Kosaraju)
const N = nodes.length;
const fwd = Array.from({ length: N }, () => []), rev = Array.from({ length: N }, () => []);
for (const e of edges) { fwd[e.a].push(e.b); rev[e.b].push(e.a); if (!e.ow) { fwd[e.b].push(e.a); rev[e.a].push(e.b); } }
const seen = new Uint8Array(N), order = [];
for (let s = 0; s < N; s++) {
  if (seen[s]) continue; const st = [[s, 0]]; seen[s] = 1;
  while (st.length) { const top = st[st.length - 1]; const [v, i] = top; if (i < fwd[v].length) { top[1]++; const w2 = fwd[v][i]; if (!seen[w2]) { seen[w2] = 1; st.push([w2, 0]); } } else { order.push(v); st.pop(); } }
}
const comp = new Int32Array(N).fill(-1); let nc = 0; const sizes = [];
for (let k = order.length - 1; k >= 0; k--) {
  const s = order[k]; if (comp[s] >= 0) continue; const st = [s]; comp[s] = nc; let n = 0;
  while (st.length) { const v = st.pop(); n++; for (const w2 of rev[v]) if (comp[w2] < 0) { comp[w2] = nc; st.push(w2); } }
  sizes.push(n); nc++;
}
const big = sizes.indexOf(Math.max(...sizes));
console.log('Komponenten:', nc, 'groesste:', sizes[big], 'von', N);

// ---- schreiben
const remap = new Map(); const outNodes = [];
const rn = (i) => { if (!remap.has(i)) { remap.set(i, outNodes.length / 2); outNodes.push(nodes[i][0], nodes[i][1]); } return remap.get(i); };
const outEdges = [];
let lenSum = 0;
for (const e of edges) {
  if (comp[e.a] !== big || comp[e.b] !== big) continue;
  const len = Math.round(lenOf(e.pts));
  if (e.a === e.b && len < 15) continue;
  const a = rn(e.a), b = rn(e.b);
  const inner = []; let pla = nodes[e.a][0], plo = nodes[e.a][1];
  for (let i = 1; i < e.pts.length - 1; i++) { const la = Math.round(e.pts[i][0] * 1e5), lo = Math.round(e.pts[i][1] * 1e5); inner.push(la - pla, lo - plo); pla = la; plo = lo; }
  outEdges.push([a, b, e.cls, e.ms, e.nm, e.ow, len, inner]); lenSum += len;
}
const usedNames = new Map([[0, 0]]); const outNames = [''];
for (const e of outEdges) { if (!usedNames.has(e[4])) { usedNames.set(e[4], outNames.length); outNames.push(names[e[4]]); } e[4] = usedNames.get(e[4]); }
const out = { v: 1, src: 'OpenStreetMap-Mitwirkende (ODbL), Overpass-Abzug ' + new Date().toISOString().slice(0, 10), cls: CLASSES, n: outNodes, names: outNames, e: outEdges };
fs.writeFileSync(path.join(root, 'data/graph.json'), JSON.stringify(out));
console.log('Knoten:', outNodes.length / 2, 'Kanten:', outEdges.length, 'Strassen-km:', Math.round(lenSum / 1000), 'Datei:', Math.round(fs.statSync(path.join(root, 'data/graph.json')).size / 1024), 'KB');
