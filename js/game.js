// Rechenkern des Spielmodus "Selber fahren" (rein, ohne Browser – wird mit Node getestet).
//   - Strassennetz (data/graph.json, gebaut von tools/build-graph.mjs) als Graph aus Kreuzungen (Knoten) und Strassenstuecken (Kanten).
//   - Das Auto sitzt immer auf einer Kante (Position s in Metern entlang der Fahrtrichtung dir = +1/-1) und folgt so der Strasse.
//   - An Kreuzungen waehlt die Lenk-Eingabe (links / geradeaus / rechts) den Abzweig, der am besten passt.
//   - Gas/Bremse steuern das Tempo, vor Kreuzungen bremst eine kleine Fahrhilfe automatisch ab.
//   - Missionen: "Fahre von A nach B", Kuerzester Weg (Dijkstra) fuer Hinweis, Punkte und Sterne.
import { distanceM } from './geo.js?v=2';
import { posAt, bearing, angleDiff } from './drive.js?v=2';

/** Tempolimit (km/h) wenn OSM keinen Wert hat – grobe Annahme je Strassenklasse (siehe graph.cls). */
export const DEFAULT_KMH = [100, 80, 50, 50, 50, 50, 50, 20];
export const SPEED_FACTOR = 1.15;     // Hoechsttempo = Limit x 1.15 (man darf etwas zu schnell sein, es gibt dann Abzug)
export const ARRIVE_M = 70;           // Ankunft: so nah am Zielort (Luftlinie)

// ------------------------------------------------------------------ Graph
/** Rohdaten (data/graph.json) in einen Graphen umwandeln. */
export function buildGraph(raw) {
  const nodes = [];
  for (let i = 0; i < raw.n.length; i += 2) nodes.push({ lat: raw.n[i] / 1e5, lng: raw.n[i + 1] / 1e5 });
  const edges = raw.e.map(([a, b, cls, ms, nm, ow, len, inner], id) => {
    const pts = [nodes[a]]; let la = Math.round(nodes[a].lat * 1e5), lo = Math.round(nodes[a].lng * 1e5);
    for (let i = 0; i < inner.length; i += 2) { la += inner[i]; lo += inner[i + 1]; pts.push({ lat: la / 1e5, lng: lo / 1e5 }); }
    pts.push(nodes[b]);
    const cum = [0]; for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + distanceM(pts[i - 1], pts[i]));
    return { id, a, b, cls, ms, name: raw.names[nm] || '', ow: !!ow, pts, cum, total: Math.max(cum[cum.length - 1], 1), len: cum[cum.length - 1] };
  });
  const out = nodes.map(() => []);   // Ausfahrten je Knoten: { e, dir, to }
  for (const e of edges) {
    out[e.a].push({ e, dir: 1, to: e.b });
    if (!e.ow) out[e.b].push({ e, dir: -1, to: e.a });
  }
  const g = { nodes, edges, out, cls: raw.cls, grid: new Map() };
  const C = 0.004;
  nodes.forEach((n, i) => { const k = `${Math.floor(n.lat / C)},${Math.floor(n.lng / C)}`; (g.grid.get(k) || g.grid.set(k, []).get(k)).push(i); });
  g.cell = C;
  return g;
}

export const limitKmh = (e) => e.ms || DEFAULT_KMH[e.cls] || 50;
export const limitTagged = (e) => e.ms > 0;
const msOf = (e) => (limitKmh(e) / 3.6);

/** Naechster Knoten zu einem Punkt (Gitter-Suche, waechst bis etwas gefunden ist). */
export function nearestNode(g, p, maxRing = 6) {
  const ci = Math.floor(p.lat / g.cell), cj = Math.floor(p.lng / g.cell);
  let best = -1, bd = Infinity;
  for (let r = 0; r <= maxRing; r++) {
    for (let i = -r; i <= r; i++) for (let j = -r; j <= r; j++) {
      if (Math.max(Math.abs(i), Math.abs(j)) !== r) continue;
      for (const n of g.grid.get(`${ci + i},${cj + j}`) || []) { const d = distanceM(p, g.nodes[n]); if (d < bd) { bd = d; best = n; } }
    }
    if (best >= 0 && bd < r * g.cell * 80000) break;
  }
  return { node: best, dist: bd };
}

// ------------------------------------------------------------------ Position und Richtung auf einer Kante
/** Position bei s Metern in Fahrtrichtung dir. */
export function edgePos(e, s, dir) {
  const ss = dir > 0 ? s : e.total - s;
  const p = posAt(e, Math.max(0, Math.min(e.total, ss)));
  return { lat: p.lat, lng: p.lng };
}
/** Fahrtrichtung (Grad, 0 = Nord) bei s Metern. */
export function edgeHeading(e, s, dir, look = 6) {
  const ss = dir > 0 ? s : e.total - s;
  const a = posAt(e, Math.max(0, ss - look)), b = posAt(e, Math.min(e.total, ss + look));
  const h = bearing(a, b);
  return dir > 0 ? h : (h + 180) % 360;
}

// ------------------------------------------------------------------ Kuerzester Weg
class Heap {
  constructor() { this.a = []; }
  push(k, v) { const a = this.a; a.push([k, v]); let i = a.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (a[p][0] <= a[i][0]) break; [a[p], a[i]] = [a[i], a[p]]; i = p; } }
  pop() { const a = this.a, top = a[0], last = a.pop(); if (a.length) { a[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < a.length && a[l][0] < a[m][0]) m = l; if (r < a.length && a[r][0] < a[m][0]) m = r; if (m === i) break; [a[m], a[i]] = [a[i], a[m]]; i = m; } } return top; }
  get size() { return this.a.length; }
}

/** Dijkstra von einem Knoten aus. cost: 'm' (Meter) oder 's' (Sekunden bei Tempolimit). Gibt { dist, prev } zurueck. */
export function dijkstra(g, from, cost = 'm', stopAt = -1) {
  const dist = new Float64Array(g.nodes.length).fill(Infinity), prev = new Array(g.nodes.length).fill(null);
  dist[from] = 0; const h = new Heap(); h.push(0, from);
  while (h.size) {
    const [d, v] = h.pop(); if (d > dist[v]) continue; if (v === stopAt) break;
    for (const o of g.out[v]) {
      const c = d + (cost === 'm' ? o.e.len : o.e.len / msOf(o.e));
      if (c < dist[o.to]) { dist[o.to] = c; prev[o.to] = { from: v, o }; h.push(c, o.to); }
    }
  }
  return { dist, prev };
}

/** Restweg zu einem Zielknoten fuer ALLE Knoten (Dijkstra rueckwaerts) – in Metern. Dient zur Fehlererkennung. */
export function distancesTo(g, target) {
  const rin = g.nodes.map(() => []);
  for (const e of g.edges) { rin[e.b].push({ from: e.a, len: e.len }); if (!e.ow) rin[e.a].push({ from: e.b, len: e.len }); }
  const dist = new Float64Array(g.nodes.length).fill(Infinity); dist[target] = 0;
  const h = new Heap(); h.push(0, target);
  while (h.size) { const [d, v] = h.pop(); if (d > dist[v]) continue; for (const r of rin[v]) { const c = d + r.len; if (c < dist[r.from]) { dist[r.from] = c; h.push(c, r.from); } } }
  return dist;
}

/** Weg als Liste von { e, dir } vom Knoten `from` zum Knoten `to`; null wenn nicht erreichbar. */
export function pathBetween(g, from, to, cost = 'm') {
  const { dist, prev } = dijkstra(g, from, cost, to);
  if (!isFinite(dist[to])) return null;
  const steps = []; let v = to;
  while (v !== from) { const p = prev[v]; steps.push({ e: p.o.e, dir: p.o.dir }); v = p.from; }
  steps.reverse();
  return { steps, cost: dist[to] };
}
export function pathLatLngs(steps) {
  const pts = [];
  for (const { e, dir } of steps) { const list = dir > 0 ? e.pts : [...e.pts].reverse(); for (const p of list) pts.push([p.lat, p.lng]); }
  return pts;
}

// ------------------------------------------------------------------ Abzweige an Kreuzungen
/** Moegliche Weiterfahrten am Ende von (e, dir): { o, angle } mit angle in (-180,180], negativ = links. */
export function optionsAt(g, e, dir) {
  const node = dir > 0 ? e.b : e.a;
  const inH = edgeHeading(e, e.total, dir);
  let list = g.out[node].map((o) => ({ o, angle: angleDiff(inH, edgeHeading(o.e, 0, o.dir)) }));
  const noBack = list.filter((x) => !(x.o.e === e && x.o.dir === -dir) && Math.abs(x.angle) < 155);
  if (noBack.length) return { node, list: noBack, deadEnd: false };
  // Sackgasse (oder nur Haarnadel): Wenden erlaubt
  const back = list.filter((x) => x.o.e === e && x.o.dir === -dir);
  return { node, list: back.length ? back : list, deadEnd: true };
}
/** Beste Weiterfahrt fuer die Lenk-Eingabe steer (-1 links, 0 geradeaus, +1 rechts). */
export function pickOption(list, steer) {
  const want = steer < 0 ? -90 : steer > 0 ? 90 : 0;
  let best = list[0], bd = Infinity;
  for (const x of list) { const d = Math.abs(x.angle - want) + (Math.abs(x.angle) > 120 ? 60 : 0); if (d < bd) { bd = d; best = x; } }
  return best;
}
/** Klartext fuer einen Abzweig-Winkel. */
export function turnWord(angle) { return angle < -25 ? 'links' : angle > 25 ? 'rechts' : 'geradeaus'; }

// ------------------------------------------------------------------ Das Auto
export function newCar(g, node, outIndex = 0) {
  const o = g.out[node][outIndex];
  return { e: o.e, dir: o.dir, s: 0, v: 0, steerLatch: 0, latchAge: 99, brakeHold: 0, odo: 0, speedingS: 0, time: 0, bump: 0, lastNode: node };
}
export function carPos(car) { return edgePos(car.e, car.s, car.dir); }
export function carHeading(car) { return edgeHeading(car.e, car.s, car.dir); }

/**
 * Ein Zeitschritt. input = { gas 0..1, brake 0..1, steer -1..1 }.
 * opts = { scale (Spieltempo, 1..4), distTo (Float64Array, Restweg je Knoten) }.
 * Gibt Ereignisse zurueck: [{ type: 'junction', ... } | { type: 'mistake' } | { type: 'bump' }].
 */
export function step(g, car, input, dt, opts = {}) {
  const scale = opts.scale ?? 2, events = [];
  const limit = limitKmh(car.e), vcap = (limit * SPEED_FACTOR) / 3.6;
  // Lenk-Absicht merken: ein kurzer Tipp zaehlt noch ca. 2.5 s (damit man nicht genau treffen muss)
  if (input.steer) { car.steerLatch = input.steer > 0 ? 1 : -1; car.latchAge = 0; } else car.latchAge += dt;
  if (car.latchAge > 2.5) car.steerLatch = 0;
  const steer = input.steer || car.steerLatch;

  // Tempo
  let a = 0;
  if (input.gas > 0 && input.brake === 0) a = car.v < 0 ? 9 : 4.2 * input.gas;
  else if (input.brake > 0) {
    if (car.v > 0.2) { a = -10 * input.brake; car.brakeHold = 0; }
    else { car.brakeHold += dt; a = car.brakeHold > 0.35 ? -3.2 : (car.v > 0 ? -car.v / dt : 0); }
  } else { a = car.v > 0 ? -1.1 : car.v < 0 ? 2.5 : 0; car.brakeHold = 0; }
  car.v += a * dt;
  if (car.v > vcap) car.v = Math.max(vcap, car.v - 6 * dt);
  if (car.v < -4) car.v = -4;
  if (!a && Math.abs(car.v) < 0.15) car.v = 0;

  // Fahrhilfe: vor der Kreuzung abbremsen (Kurven nicht mit voller Fahrt)
  if (car.v > 0) {
    const toEnd = car.e.total - car.s;
    if (toEnd < 90) {
      const opt = optionsAt(g, car.e, car.dir), pick = pickOption(opt.list, steer);
      const ang = Math.abs(pick.angle);
      const vTurn = opt.deadEnd ? 2 : ang < 25 ? Math.max(8, Math.min(vcap, 14)) : ang < 100 ? 5.5 : 3.5;
      const vlim = Math.sqrt(vTurn * vTurn + 2 * 5 * Math.max(0, toEnd - 4));
      if (car.v > vlim) car.v = Math.max(vlim, car.v - 11 * dt);
    }
  }

  // Bewegen
  const ds = car.v * dt * scale;
  car.odo += Math.abs(ds); car.time += dt;
  if (limitTagged(car.e) && car.v * 3.6 > limit + 5) car.speedingS += dt;
  car.s += ds;
  if (car.s < 0) { car.s = 0; if (car.v < -0.5) events.push({ type: 'bump' }); car.v = 0; }
  let guard = 6;
  while (car.s >= car.e.total && guard-- > 0) {
    const opt = optionsAt(g, car.e, car.dir);
    const pick = pickOption(opt.list, steer);
    const over = car.s - car.e.total;
    const ev = { type: 'junction', node: opt.node, from: car.e, options: opt.list, picked: pick, deadEnd: opt.deadEnd };
    if (opts.distTo) {
      let best = Infinity; for (const x of opt.list) best = Math.min(best, x.o.e.len + opts.distTo[x.o.to]);
      const chosen = pick.o.e.len + opts.distTo[pick.o.to];
      if (opt.list.length > 1 && isFinite(best) && chosen - best > 80) events.push({ type: 'mistake', node: opt.node, extra: chosen - best });
    }
    events.push(ev);
    car.e = pick.o.e; car.dir = pick.o.dir; car.s = over; car.lastNode = opt.node;
    car.steerLatch = 0; car.latchAge = 99;
  }
  return events;
}

/** Naechste Kreuzung voraus: { dist, node, options:[{angle, word, name, picked}] }. */
export function lookAhead(g, car, steer = 0) {
  const opt = optionsAt(g, car.e, car.dir);
  const pick = pickOption(opt.list, steer || car.steerLatch);
  return { dist: car.e.total - car.s, node: opt.node, deadEnd: opt.deadEnd,
    options: opt.list.map((x) => ({ angle: x.angle, word: turnWord(x.angle), name: x.o.e.name, picked: x === pick })) };
}

// ------------------------------------------------------------------ Missionen
/** Zeit in Sekunden fuer einen Weg bei Tempolimit, durch den Spielfaktor geteilt. */
export const parSeconds = (path, scale) => path.cost / scale;

/**
 * Mission waehlen. places = alle Orte; opts: { targetId, startId, rnd, weightOf(place) }.
 * Rueckgabe: { start, target, startNode, targetNode, arriveR, path, parS, meters, car, distTo } oder null.
 */
export function makeMission(g, places, { targetId, startId, rnd = Math.random, weightOf = () => 1, minM = 1200, maxM = 7500, scale = 2 } = {}) {
  const snap = new Map();
  const snapOf = (p) => { if (!snap.has(p.id)) snap.set(p.id, nearestNode(g, p)); return snap.get(p.id); };
  const usable = places.filter((p) => snapOf(p).dist < 180);
  const pickW = (list) => { const w = list.map(weightOf); let r = rnd() * w.reduce((x, y) => x + y, 0); for (let i = 0; i < list.length; i++) { r -= w[i]; if (r <= 0) return list[i]; } return list.at(-1); };
  const target = targetId ? usable.find((p) => p.id === targetId) : pickW(usable);
  if (!target) return null;
  const tn = snapOf(target).node, distTo = distancesTo(g, tn);
  let start = null;
  const cands = usable.filter((p) => p.id !== target.id && (!startId || p.id === startId) && isFinite(distTo[snapOf(p).node]));
  const inRange = cands.filter((c) => { const d = distTo[snapOf(c).node]; return startId || (d >= minM && d <= maxM); });
  if (inRange.length) start = inRange[Math.floor(rnd() * inRange.length)];
  else start = [...cands].sort((x, y) => distTo[snapOf(x).node] - distTo[snapOf(y).node])[0] || null;   // sonst der naechste Ort
  if (!start) return null;
  const sn = snapOf(start).node;
  const path = pathBetween(g, sn, tn, 's');
  if (!path) return null;
  const first = path.steps[0];
  const idx = Math.max(0, g.out[sn].findIndex((o) => o.e === first.e && o.dir === first.dir));
  return { start, target, startNode: sn, targetNode: tn, arriveR: Math.max(ARRIVE_M, snapOf(target).dist + 35), path, parS: parSeconds(path, scale), meters: distTo[sn], car: newCar(g, sn, idx), distTo };
}

/** Punkte und Sterne am Ende. stats = { seconds, mistakes, hints, speedingS }. */
export function rate(m, stats) {
  const over = Math.max(0, stats.seconds - m.parS);
  const score = Math.max(100, Math.round(1000 - over * 4 - stats.mistakes * 120 - stats.hints * 150 - stats.speedingS * 8));
  let stars = 1;
  if (stats.seconds <= m.parS * 2.6 + 30 && stats.mistakes <= 2) stars = 2;
  if (stats.seconds <= m.parS * 1.7 + 15 && stats.mistakes === 0 && stats.hints === 0) stars = 3;
  return { score, stars };
}

/** Ankunft pruefen (Luftlinie zum Zielort). */
export function arrived(car, target, r = ARRIVE_M) { return distanceM(carPos(car), target) <= r; }

/** Wie weit ist das Ziel (Luftlinie) und in welcher Himmelsrichtung. */
export function toTarget(car, target) { const p = carPos(car); return { dist: distanceM(p, target), bearing: bearing(p, target) }; }
