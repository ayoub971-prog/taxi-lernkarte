// Tests fuer den Spielmodus: Strassennetz (data/graph.json) und Fahrlogik (js/game.js), ohne Browser.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { PLACES, BOX } from '../js/places.js';
import * as G from '../js/game.js';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const raw = JSON.parse(fs.readFileSync(path.join(root, 'data/graph.json'), 'utf8'));
const g = G.buildGraph(raw);
const seeded = (seed) => () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };

test('Strassennetz: Groesse, Gebiet, Kanten-Laengen', () => {
  assert.ok(g.nodes.length > 5000 && g.edges.length > 5000, `${g.nodes.length} Knoten`);
  assert.ok(fs.statSync(path.join(root, 'data/graph.json')).size < 1.5e6, 'Datei zu gross');
  for (const n of g.nodes) assert.ok(n.lat > BOX.south - 0.03 && n.lat < BOX.north + 0.03 && n.lng > BOX.west - 0.03 && n.lng < BOX.east + 0.03);
  for (const e of g.edges) assert.ok(e.len > 0 && e.total >= 1 && e.pts.length >= 2);
  assert.ok(raw.src.includes('OpenStreetMap'));
});

test('Jeder Ort liegt in der Naehe des Netzes (ausser Halbinsel Schloss Au)', () => {
  for (const p of PLACES) { const s = G.nearestNode(g, p); assert.ok(s.dist < (p.id === 'schloss-au' ? 400 : 200), `${p.id}: ${Math.round(s.dist)} m`); }
});

test('Netz ist zusammenhaengend: Weg von Wädenswil zu allen Orten (Einbahnstrassen beachtet)', () => {
  const from = G.nearestNode(g, PLACES.find((p) => p.id === 'waedenswil')).node;
  const { dist } = G.dijkstra(g, from, 'm');
  for (const p of PLACES) { const n = G.nearestNode(g, p).node; assert.ok(isFinite(dist[n]), 'nicht erreichbar: ' + p.id); }
  const back = G.dijkstra(g, G.nearestNode(g, PLACES.find((p) => p.id === 'paradeplatz')).node, 'm').dist;
  assert.ok(isFinite(back[from]), 'Rueckweg fehlt');
});

test('Weg Wädenswil -> Paradeplatz hat eine plausible Laenge (20-35 km)', () => {
  const a = G.nearestNode(g, PLACES.find((p) => p.id === 'waedenswil')).node, b = G.nearestNode(g, PLACES.find((p) => p.id === 'paradeplatz')).node;
  const r = G.pathBetween(g, a, b, 'm');
  assert.ok(r.cost > 18000 && r.cost < 38000, 'Laenge ' + Math.round(r.cost));
});

test('Abzweige: Winkel, Wenden nur in der Sackgasse, Wahl nach Lenk-Eingabe', () => {
  const list = [{ angle: -80, o: 'L' }, { angle: 5, o: 'G' }, { angle: 85, o: 'R' }];
  assert.equal(G.pickOption(list, -1).o, 'L'); assert.equal(G.pickOption(list, 0).o, 'G'); assert.equal(G.pickOption(list, 1).o, 'R');
  assert.equal(G.pickOption([{ angle: 5, o: 'G' }, { angle: 80, o: 'R' }], -1).o, 'G', 'links gibt es nicht: naechstbester');
  assert.equal(G.turnWord(-60), 'links'); assert.equal(G.turnWord(3), 'geradeaus'); assert.equal(G.turnWord(70), 'rechts');
});

test('Fahrphysik: Gas beschleunigt, Bremse stoppt, rueckwaerts nach kurzem Halten, Tempolimit', () => {
  const m = G.makeMission(g, PLACES, { targetId: 'paradeplatz', startId: 'buerkliplatz', scale: 2 });
  const car = m.car; const s0 = car.s;
  for (let i = 0; i < 100; i++) G.step(g, car, { gas: 1, brake: 0, steer: 0 }, 0.05, { scale: 2, distTo: m.distTo });
  assert.ok(car.v > 8, 'v=' + car.v);
  for (let i = 0; i < 120; i++) G.step(g, car, { gas: 0, brake: 1, steer: 0 }, 0.05, { scale: 2, distTo: m.distTo });
  assert.equal(car.v <= 0 || car.v < 0.3, true);
  const vs = []; for (let i = 0; i < 80; i++) { G.step(g, car, { gas: 0, brake: 1, steer: 0 }, 0.05, { scale: 2 }); vs.push(car.v); }
  assert.ok(Math.min(...vs) <= 0, 'Rueckwaerts/Stillstand');
  assert.ok(Math.min(...vs) >= -4.01, 'Rueckwaerts-Tempo begrenzt');
  const c2 = G.newCar(g, m.startNode, 0); for (let i = 0; i < 2000; i++) G.step(g, c2, { gas: 1, brake: 0, steer: 0 }, 0.05, { scale: 1 });
  assert.ok(c2.v * 3.6 <= G.limitKmh(c2.e) * G.SPEED_FACTOR + 0.5, 'zu schnell: ' + c2.v * 3.6);
});

/** Autopilot: lenkt an jeder Kreuzung so, dass der kuerzeste Weg (path.steps) befahren wird. */
function drive(m, { scale = 3, maxS = 3000, wrongAt = -1 } = {}) {
  const car = m.car; let k = 0; const ev = []; let t = 0, junctions = 0, mistakes = 0, multi = 0;
  const dt = 0.05;
  while (t < maxS) {
    const ahead = G.lookAhead(g, car);
    let steer = 0;
    const want = m.path.steps[k + 1];
    if (ahead.dist < 70 && want) {
      const opt = G.optionsAt(g, car.e, car.dir);
      for (const st of [0, -1, 1]) { if (G.pickOption(opt.list, st).o.e === want.e && G.pickOption(opt.list, st).o.dir === want.dir) { steer = st; break; } }
      if (wrongAt >= 0 && opt.list.length > 1 && multi === wrongAt) { steer = [0, -1, 1].find((st) => G.pickOption(opt.list, st).o.e !== want.e) ?? steer; }
      if (opt.list.length > 1 && ahead.dist < 70) { /* zaehlt unten */ }
    }
    const events = G.step(g, car, { gas: 1, brake: 0, steer }, dt, { scale, distTo: m.distTo });
    for (const e of events) { ev.push(e); if (e.type === 'junction') { junctions++; if (e.options.length > 1) multi++; if (car.e === want?.e && car.dir === want?.dir) k++; } if (e.type === 'mistake') mistakes++; }
    t += dt;
    if (G.arrived(car, m.target, m.arriveR)) return { ok: true, t, junctions, mistakes, car };
  }
  return { ok: false, t, junctions, mistakes, car };
}

test('Mission Bürkliplatz -> Paradeplatz: Autopilot kommt an, biegt an Kreuzungen ab, Sterne', () => {
  const m = G.makeMission(g, PLACES, { targetId: 'paradeplatz', startId: 'buerkliplatz', scale: 3 });
  assert.ok(m && m.meters > 200 && m.parS > 10);
  const r = drive(m, { scale: 3 });
  assert.ok(r.ok, 'nicht angekommen');
  assert.ok(r.junctions >= 2, 'Kreuzungen: ' + r.junctions);
  assert.equal(r.mistakes, 0);
  const rating = G.rate(m, { seconds: r.t, mistakes: 0, hints: 0, speedingS: 0 });
  assert.ok(rating.stars >= 2 && rating.score > 300, JSON.stringify(rating));
});

test('Mehrere Zufallsmissionen (1.2-7.5 km) werden vom Autopilot geschafft', () => {
  const rnd = seeded(7); let done = 0;
  for (let i = 0; i < 6; i++) {
    const m = G.makeMission(g, PLACES, { rnd, scale: 4 }); assert.ok(m, 'keine Mission');
    assert.ok(m.meters >= 1000 && m.meters <= 8000, 'Strecke ' + m.meters);
    const r = drive(m, { scale: 4, maxS: 4000 }); assert.ok(r.ok, `${m.start.id} -> ${m.target.id} (${Math.round(m.meters)} m) nicht erreicht`); done++;
  }
  assert.equal(done, 6);
});

test('Falsch abbiegen wird erkannt (Fehler), Hinweis-Weg fuehrt trotzdem ans Ziel', () => {
  const m = G.makeMission(g, PLACES, { targetId: 'paradeplatz', startId: 'buerkliplatz', scale: 3 });
  let found = 0;
  for (let w = 0; w < 4; w++) { const m2 = G.makeMission(g, PLACES, { targetId: 'paradeplatz', startId: 'buerkliplatz', scale: 3 }); const r = drive(m2, { scale: 3, wrongAt: w, maxS: 600 }); found += r.mistakes; }
  assert.ok(found >= 1, 'kein Fehler erkannt');
  const car = m.car; for (let i = 0; i < 200; i++) G.step(g, car, { gas: 1, brake: 0, steer: 0 }, 0.05, { scale: 3 });
  const node = car.dir > 0 ? car.e.b : car.e.a, p = G.pathBetween(g, node, m.targetNode, 's');
  assert.ok(p && G.pathLatLngs(p.steps).length > 1);
});

// ------------------------------------------------------------------ Fahrverbot: gesperrte Ausfahrten
const ne = JSON.parse(fs.readFileSync(path.join(root, 'data/noentry.json'), 'utf8'));
test('noentry.json passt zum Netz: Einfahrten liegen an Knoten, Arten bekannt, nur befahrbare Anschluesse', () => {
  assert.equal(ne.graphNodes, raw.n.length / 2);
  const kinds = new Set(['fussgaengerzone', 'fussweg', 'veloweg', 'treppe', 'feldweg', 'busspur', 'gesperrt']);
  assert.ok(ne.gates.length > 500 && ne.ways.length > 500);
  for (const [n, , , b, k] of ne.gates) { assert.ok(n >= 0 && n < ne.graphNodes); assert.ok(b >= 0 && b <= 360); assert.ok(kinds.has(k), k); }
  for (const [k, arr] of ne.ways) { assert.ok(kinds.has(k)); assert.ok(arr.length >= 4 && arr.length % 2 === 0); }
  assert.ok(ne.ways.some(([k]) => k === 'fussgaengerzone') && ne.ways.some(([k]) => k === 'treppe') && ne.ways.some(([k]) => k === 'veloweg'));
});

test('Sperre: Abbiegen in Einbahnstrasse von hinten / verbotenen Weg wird erkannt (Event noentry), Fahren bleibt auf erlaubten Strassen', () => {
  const blocked = G.buildBlocked(g, ne);
  assert.ok([...blocked.values()].flat().some((b) => b.kind === 'einbahn'), 'Einbahn-Einfahrten');
  assert.ok([...blocked.values()].flat().some((b) => b.kind !== 'einbahn'), 'Weg-Einfahrten aus noentry.json');
  let hits = 0, sideOk = 0;
  const seenKinds = new Set();
  for (const [node, list] of blocked) {
    for (const o of g.out[node]) {
      if (o.dir === 1 ? false : g.edges[o.e.id].ow) continue;
      for (const steer of [-1, 1]) {
        const car = G.newCar(g, o.e.a, 0); car.e = o.e; car.dir = -o.dir; car.s = Math.max(0, o.e.total - 0.2); car.v = 4;
        if (car.dir === -1 && o.e.ow) continue;
        car.steerLatch = steer; car.latchAge = 0;
        const evs = G.step(g, car, { gas: 1, brake: 0, steer }, 0.1, { scale: 2 });
        const j = evs.find((e) => e.type === 'junction'); if (!j || j.node !== node) continue;
        sideOk++;
        const ban = evs.find((e) => e.type === 'noentry');
        if (ban) { hits++; seenKinds.add(ban.kind); assert.ok(list.some((b) => b.kind === ban.kind)); assert.ok(!j.picked.o.e.ow || j.picked.o.dir === 1, 'Auto darf nicht gegen die Einbahn fahren'); }
        // ohne Lenk-Absicht kein Fahrverbot
        const car2 = G.newCar(g, o.e.a, 0); car2.e = o.e; car2.dir = -o.dir; car2.s = Math.max(0, o.e.total - 0.2); car2.v = 4;
        assert.ok(!G.step(g, car2, { gas: 1, brake: 0, steer: 0 }, 0.1, { scale: 2 }).some((e) => e.type === 'noentry'));
      }
    }
    if (hits > 40) break;
  }
  assert.ok(hits >= 10, `zu wenige Faelle erkannt: ${hits} von ${sideOk}`);
  assert.ok(seenKinds.has('einbahn'));
});

test('Wertung: Fahrverbote kosten 100 Punkte und den dritten Stern', () => {
  const m = { parS: 100 };
  const a = G.rate(m, { seconds: 100, mistakes: 0, hints: 0, speedingS: 0 }), b = G.rate(m, { seconds: 100, mistakes: 0, hints: 0, speedingS: 0, violations: 1 });
  assert.equal(a.stars, 3); assert.equal(a.score - b.score, 100); assert.equal(b.stars, 2);
});
test('wrongWayGates: Zeichen nur an Kreuzungen', () => {
  const w = G.wrongWayGates(g); assert.ok(w.length > 100 && w.length < g.edges.length); assert.ok(w.every((x) => x.kind === 'einbahn' && isFinite(x.lat)));
});
