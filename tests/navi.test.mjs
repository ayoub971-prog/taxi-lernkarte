// Tests fuer den Navi-Look (js/navi.js) und die Manoeverberechnung im Spiel (game.js pathManeuvers), ohne Browser.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import * as N from '../js/navi.js';
import * as G from '../js/game.js';
import { PLACES } from '../js/places.js';
import { prepRoute, instruction, streetName, posAt } from '../js/drive.js';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const g = G.buildGraph(JSON.parse(fs.readFileSync(path.join(root, 'data/graph.json'), 'utf8')));

test('Abbiegewinkel -> Pfeil-Art und Text', () => {
  assert.equal(N.turnKey(0), 'gerade'); assert.equal(N.turnKey(-90), 'links'); assert.equal(N.turnKey(90), 'rechts');
  assert.equal(N.turnKey(-35), 'leicht-links'); assert.equal(N.turnKey(40), 'leicht-rechts');
  assert.equal(N.turnKey(-140), 'scharf-links'); assert.equal(N.turnKey(175), 'wenden'); assert.equal(N.turnKey(-178), 'wenden');
  assert.equal(N.fmtDist(8), '10 m'); assert.equal(N.fmtDist(173), '170 m'); assert.equal(N.fmtDist(640), '650 m'); assert.equal(N.fmtDist(1240), '1.2 km'); assert.equal(N.fmtDist(25000), '25 km');
});

test('Banner: weit weg «Richtung», nah «In 200 m links auf …», «Dann:», Ziel', () => {
  const list = [{ s: 1000, kind: 'turn', angle: -90, name: 'Seestrasse' }, { s: 1150, kind: 'turn', angle: 80, name: 'Bahnhofstrasse' }, { s: 2500, kind: 'ziel', name: 'Bürkliplatz' }];
  const far = N.naviBanner(list, 0, { dest: 'Bürkliplatz' });
  assert.equal(far.far, true); assert.equal(far.arrow, 'gerade'); assert.equal(far.title, 'Richtung Seestrasse'); assert.equal(far.dann, 'rechts'); assert.equal(far.distText, '1.0 km');
  const near = N.naviBanner(list, 800, { dest: 'Bürkliplatz' });
  assert.equal(near.far, false); assert.equal(near.arrow, 'links'); assert.equal(near.title, 'In 200 m links auf Seestrasse'); assert.equal(near.dann, 'rechts');
  const now = N.naviBanner(list, 985, {}); assert.match(now.title, /^Jetzt links auf Seestrasse/);
  const second = N.naviBanner(list, 1100, {}); assert.equal(second.arrow, 'rechts'); assert.equal(second.dann, null, 'nach Bahnhofstrasse kommt 1.3 km nichts mehr');
  const z = N.naviBanner(list, 2400, { dest: 'Bürkliplatz' }); assert.equal(z.arrow, 'ziel'); assert.match(z.title, /Bürkliplatz/);
  assert.equal(N.naviBanner(list, 2600, {}).ziel, true);
  const round = N.naviBanner([{ s: 200, kind: 'roundabout', exit: 2, angle: 0, name: 'Bellevue' }, { s: 900, kind: 'ziel' }], 0, {}); assert.equal(round.arrow, 'kreisel'); assert.match(round.title, /Kreisel 2\. Ausfahrt/);
  const noName = N.naviBanner([{ s: 100, kind: 'turn', angle: 90, name: '' }, { s: 900, kind: 'ziel' }], 0, {}); assert.equal(noName.title, 'In 100 m rechts');
});

test('Restzeit, Restweg, Ankunftsuhrzeit; Pfeil-SVG fuer alle Arten', () => {
  const e = N.etaInfo(5000, 50 / 3.6, new Date(2026, 10, 20, 13, 50));
  assert.equal(e.rest, '6 Min.'); assert.equal(e.dist, '5.0 km'); assert.equal(e.arrive, '13:56');
  assert.equal(N.etaInfo(90000, 25, new Date(2026, 10, 20, 23, 30)).rest, '1 Std. 00 Min.');
  for (const k of ['gerade', 'links', 'rechts', 'leicht-links', 'leicht-rechts', 'scharf-links', 'scharf-rechts', 'wenden', 'kreisel', 'ziel']) { const s = N.arrowSvg(k); assert.match(s, /^<svg [^>]*viewBox="0 0 48 48"/); assert.ok(s.length > 80 && !/NaN/.test(s), k); }
});

/** Auto auf den Anfang eines Wegs vom Ort a zum Ort b stellen. */
function carAt(a) { const n = G.nearestNode(g, PLACES.find((p) => p.id === a)).node; return G.newCar(g, n, 0); }
const nodeOf = (id) => G.nearestNode(g, PLACES.find((p) => p.id === id)).node;

test('Spiel: Manoever entlang des kuerzesten Wegs (Reihenfolge, Ziel am Ende, Laenge, Linie)', () => {
  const car = carAt('paradeplatz'), tn = nodeOf('buerkliplatz');
  const r = G.pathManeuvers(g, car, tn, 'Bürkliplatz');
  assert.ok(r && r.maneuvers.length >= 2, 'zu wenige Manoever');
  for (let i = 1; i < r.maneuvers.length; i++) assert.ok(r.maneuvers[i].s >= r.maneuvers[i - 1].s);
  assert.equal(r.maneuvers.at(-1).kind, 'ziel'); assert.equal(r.maneuvers.at(-1).name, 'Bürkliplatz');
  const node0 = car.dir > 0 ? car.e.b : car.e.a, p = G.pathBetween(g, node0, tn, 's');
  const len = car.e.total + p.steps.reduce((s, st) => s + st.e.total, 0);
  assert.ok(Math.abs(r.total - len) < 0.5, `${r.total} vs ${len}`);
  assert.ok(r.pts.length >= 3 && r.secs > 0);
  for (const m of r.maneuvers.filter((x) => x.kind === 'turn')) { assert.ok(Math.abs(m.angle) >= 20 && Math.abs(m.angle) <= 180); assert.ok(isFinite(m.lat) && isFinite(m.lng)); }
});

test('Spiel: Manoever folgen dem Weg wirklich (Abbiegerichtung stimmt mit der Geometrie)', () => {
  const car = carAt('paradeplatz'), tn = nodeOf('buerkliplatz'), r = G.pathManeuvers(g, car, tn, 'x');
  const node0 = car.dir > 0 ? car.e.b : car.e.a, p = G.pathBetween(g, node0, tn, 's');
  let inE = car.e, inDir = car.dir, s = Math.max(0, car.e.total - car.s), turns = r.maneuvers.filter((m) => m.kind === 'turn'), k = 0;
  for (const st of p.steps) {
    const a = ((G.edgeHeading(st.e, 0, st.dir) - G.edgeHeading(inE, inE.total, inDir) + 540) % 360) - 180;
    const t = turns[k];
    if (t && Math.abs(t.s - s) < 0.5) { assert.ok(Math.sign(t.angle) === Math.sign(a) && Math.abs(t.angle - a) < 0.01, `Winkel ${t.angle} vs ${a}`); assert.equal(t.name, st.e.name || ''); k++; }
    s += st.e.total; inE = st.e; inDir = st.dir;
  }
  assert.equal(k, turns.length, 'nicht alle Manoever dem Weg zugeordnet');
});

test('Spiel: nach Abweichen wird neu berechnet (anderer Standort -> anderer Weg, Restweg passt)', () => {
  const tn = nodeOf('buerkliplatz');
  const a = G.pathManeuvers(g, carAt('paradeplatz'), tn, 'B'), b = G.pathManeuvers(g, carAt('bellevue'), tn, 'B');
  assert.ok(a && b); assert.notEqual(Math.round(a.total), Math.round(b.total));
  // Auto steht auf der Kante, die vom Ziel wegfuehrt: der neue Weg ist laenger oder gleich gross wie der beste, aber es gibt ihn
  const car = carAt('paradeplatz'); const first = G.pathManeuvers(g, car, tn, 'B');
  car.dir = -car.dir; if (car.dir < 0 && car.e.ow) car.dir = 1;
  const off = G.pathManeuvers(g, car, tn, 'B');
  assert.ok(off && off.maneuvers.at(-1).kind === 'ziel'); assert.ok(first.total > 0);
  const atTarget = G.pathManeuvers(g, G.newCar(g, tn, 0), tn, 'B'); assert.equal(atTarget.maneuvers.at(-1).kind, 'ziel');
});

test('Fahrmodus: Manoever aus den Routen-Schritten (Abbiegen, Kreisel, Ziel)', () => {
  const raw = { c: [47.2, 8.6, 47.21, 8.6, 47.21, 8.61, 47.22, 8.61], t: 300,
    st: [[0, 'Seestrasse', '', 'depart', '', 0, 0], [300, 'Bahnhofstrasse', '', 'turn', 'right', 0, 1], [600, 'Bellevue', '', 'roundabout', 'left', 2, 1], [900, '', '', 'arrive', '', 0, 0]] };
  const route = prepRoute(raw, 'x', 'Test');
  const m = N.driveManeuvers(route, 'Ziel', { instruction, streetName, posAt });
  assert.deepEqual(m.map((x) => x.kind), ['turn', 'roundabout', 'ziel']);
  assert.equal(m[0].angle, 90); assert.equal(m[0].name, 'Bahnhofstrasse'); assert.equal(m[1].exit, 2); assert.equal(m.at(-1).s, route.total);
  assert.ok(m.every((x) => isFinite(x.lat)));
  const b = N.naviBanner(m, 100, { dest: 'Ziel' }); assert.equal(b.far, false); assert.equal(b.arrow, 'rechts'); assert.equal(b.dann, 'kreisel');
});
