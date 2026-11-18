// Tests fuer Distanz/Punkte, Quiz, Lernfortschritt, Wiederholung, Speicher/Sicherung und Fahr-Rechenkern.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PLACES, inBox } from '../js/places.js?v=1';
import { distanceM, formatDistance, scorePoints, isHit, verdict } from '../js/geo.js?v=1';
import { pickQuestions, makeOptions, shuffle, summarizeWo, summarizeName } from '../js/quiz.js?v=1';
import * as progress from '../js/progress.js?v=1';
import { recordWrong, recordRight, dueKeys, INTERVALS_MS } from '../js/repeat.js?v=1';
import { cleanPlace, mergePlaces, makeBackup, parseBackup, createStore } from '../js/store.js?v=1';
import * as drive from '../js/drive.js?v=1';

const rngSeq = (seed = 1) => () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
const P = Object.fromEntries(PLACES.map((p) => [p.id, p]));

// ---------------------------------------------------------------- Distanz
test('distanceM: 0 m, symmetrisch, bekannte Strecken', () => {
  assert.equal(distanceM(P.hb, P.hb), 0);
  assert.ok(Math.abs(distanceM(P.hb, P.paradeplatz) - distanceM(P.paradeplatz, P.hb)) < 1e-6);
  const hbParade = distanceM(P.hb, P.paradeplatz);   // Luftlinie HB - Paradeplatz ca. 1 km
  assert.ok(hbParade > 900 && hbParade < 1100, String(hbParade));
  const wz = distanceM(P.waedenswil, P.hb);           // Waedenswil - HB ca. 20 km Luftlinie
  assert.ok(wz > 17000 && wz < 23000, String(wz));
  assert.ok(Math.abs(distanceM({ lat: 47, lng: 8 }, { lat: 48, lng: 8 }) - 111195) < 200); // 1 Grad Breite
});

test('Punkte, Treffer, Format, Kommentar', () => {
  assert.equal(scorePoints(0), 100); assert.equal(scorePoints(50), 100);
  assert.equal(scorePoints(2000), 0); assert.equal(scorePoints(5000), 0);
  assert.ok(scorePoints(500) > scorePoints(1000));
  assert.equal(scorePoints(NaN), 0);
  assert.equal(isHit(200), true); assert.equal(isHit(201), false);
  assert.equal(formatDistance(340.4), '340 m'); assert.equal(formatDistance(1250), '1.25 km'); assert.equal(formatDistance(15200), '15.2 km');
  assert.equal(verdict(10), 'Perfekt!'); assert.match(verdict(3000), /Weit daneben/);
});

// ---------------------------------------------------------------- Quiz
test('Quiz: Fragenauswahl, Optionen, Auswertung', () => {
  const rng = rngSeq(7);
  const qs = pickQuestions(PLACES, 10, rng);
  assert.equal(qs.length, 10); assert.equal(new Set(qs.map((p) => p.id)).size, 10);
  assert.equal(pickQuestions(PLACES, 0, rng).length, PLACES.length);
  assert.equal(pickQuestions(PLACES.slice(0, 3), 10, rng).length, 3);
  for (const p of PLACES) {
    const o = makeOptions(p, PLACES, rng);
    assert.equal(o.length, 4); assert.equal(new Set(o.map((x) => x.id)).size, 4); assert.ok(o.some((x) => x.id === p.id));
  }
  assert.equal(shuffle([1, 2, 3, 4], rngSeq(3)).sort().join(), '1,2,3,4');
  const s = summarizeWo([{ id: 'a', distance: 0 }, { id: 'b', distance: 300 }, { id: 'c', distance: 2500 }]);
  assert.equal(s.hits, 1); assert.equal(s.points, 100 + scorePoints(300)); assert.equal(Math.round(s.avgDistance), 933);
  assert.deepEqual(summarizeName([{ correct: true }, { correct: false }]), { n: 2, right: 1, pct: 50 });
});

// ---------------------------------------------------------------- Fortschritt + Wiederholung
test('Fortschritt: Boxen, Ampel, gewichtete Auswahl, Heute-ueben', () => {
  const prog = {}, now = 1_000_000;
  assert.equal(progress.mastery(prog, 'x'), 'rot');
  progress.answer(prog, 'x', true, now); assert.equal(prog.x.box, 1); assert.equal(progress.mastery(prog, 'x'), 'rot');
  progress.answer(prog, 'x', true, now); assert.equal(progress.mastery(prog, 'x'), 'gelb');
  progress.answer(prog, 'x', true, now); progress.answer(prog, 'x', true, now); assert.equal(progress.mastery(prog, 'x'), 'gruen');
  for (let i = 0; i < 10; i++) progress.answer(prog, 'x', true, now);
  assert.equal(prog.x.box, progress.MAX_BOX); assert.equal(prog.x.due, now + progress.WAIT_MS[5]);
  progress.answer(prog, 'x', false, now); assert.equal(prog.x.box, 0); assert.equal(prog.x.due, now + progress.WAIT_MS[0]);
  const pool = [{ id: 'weak' }, { id: 'strong' }];
  const pr = { weak: { box: 0, due: now - 1, right: 0, wrong: 3 }, strong: { box: 5, due: now + 1e9, right: 9, wrong: 0 } };
  assert.ok(progress.weight(pr, 'weak', now) > 10 * progress.weight(pr, 'strong', now));
  let weakFirst = 0; const rng = rngSeq(11);
  for (let i = 0; i < 200; i++) if (progress.pickWeighted(pool, pr, 1, now, rng)[0].id === 'weak') weakFirst++;
  assert.ok(weakFirst > 170, 'schwacher Ort zu selten: ' + weakFirst);
  assert.equal(progress.pickWeighted(pool, pr, 0, now).length, 2);
  const pool2 = Array.from({ length: 30 }, (_, i) => ({ id: 'p' + i }));
  const p2 = { p3: { box: 1, due: now - 5, right: 1, wrong: 0 }, p4: { box: 4, due: now + 9e9, right: 5, wrong: 0 } };
  const day = progress.dailySet(pool2, p2, 10, now);
  assert.equal(day.length, 10); assert.equal(day[0].id, 'p3'); assert.ok(!day.some((p) => p.id === 'p4'));
  const sum = progress.summary(pool2.slice(0, 5), { p0: { box: 5 }, p1: { box: 3 } });
  assert.deepEqual([sum.gruen, sum.gelb, sum.rot, sum.pct], [1, 1, 3, 20]);
});

test('Wiederholung (Fehlerliste): falsch -> bald faellig, richtig -> laengere Abstaende, nach der letzten Box weg', () => {
  const rep = {}, t0 = 5_000_000;
  recordWrong(rep, 'pair:a|b', t0);
  assert.deepEqual(dueKeys(rep, 'pair:', t0), []);
  assert.deepEqual(dueKeys(rep, 'pair:', t0 + INTERVALS_MS[0]), ['pair:a|b']);
  assert.deepEqual(dueKeys(rep, 'turn:', t0 + 1e12), []);
  let t = t0;
  for (let i = 0; i < INTERVALS_MS.length - 1; i++) { t += 1e10; assert.equal(recordRight(rep, 'pair:a|b', t), false); }
  assert.equal(recordRight(rep, 'pair:a|b', t + 1e10), true); assert.ok(!rep['pair:a|b']);
  recordWrong(rep, 'k', t0); recordWrong(rep, 'k', t0); assert.equal(rep.k.wrong, 2); assert.equal(rep.k.box, 0);
  assert.equal(recordRight(rep, 'gibt-es-nicht'), false);
});

// ---------------------------------------------------------------- Speicher + Sicherung
const memStorage = () => { const m = {}; return { getItem: (k) => m[k] ?? null, setItem: (k, v) => { m[k] = String(v); }, m }; };

test('Speicher: eigene Orte anlegen, aendern, loeschen; bleibt nach Neustart erhalten', () => {
  const st = memStorage(); const s1 = createStore(st);
  const p = s1.addPlace({ name: '  Hotel Storchen ', note: 'Weinplatz 2', lat: 47.3708, lng: 8.5424 });
  assert.equal(p.name, 'Hotel Storchen'); assert.ok(p.id.startsWith('u'));
  assert.equal(s1.addPlace({ name: '', lat: 1, lng: 1 }), null);
  assert.equal(s1.addPlace({ name: 'x', lat: 200, lng: 1 }), null);
  s1.updatePlace(p.id, { note: 'neu' }); s1.mutateProgress((pr) => progress.answer(pr, p.id, true)); s1.setSetting('labels', false);
  const s2 = createStore(st);
  assert.equal(s2.state.places.length, 1); assert.equal(s2.state.places[0].note, 'neu'); assert.equal(s2.state.settings.labels, false); assert.equal(s2.state.progress[p.id].box, 1);
  assert.equal(s2.removePlace(p.id), true); assert.equal(createStore(st).state.places.length, 0);
  assert.equal(createStore({ getItem: () => '{kaputt', setItem() {} }).state.places.length, 0);
});

test('Sicherung: Export -> Import, Dubletten werden uebersprungen, Fremdes wird abgelehnt', () => {
  const st = memStorage(); const s = createStore(st);
  s.addPlace({ name: 'A-Ort', note: 'n', lat: 47.3, lng: 8.5 }); s.addPlace({ name: 'B-Ort', lat: 47.31, lng: 8.51 });
  s.mutateProgress((pr) => progress.answer(pr, 'horgen', false)); s.mutateRepeat((r) => recordWrong(r, 'pair:a|b'));
  const text = makeBackup(s.state, new Date('2026-11-18T12:00:00Z'));
  const r = parseBackup(text);
  assert.equal(r.places.length, 2); assert.equal(r.progress.horgen.wrong, 1); assert.ok(r.repeat['pair:a|b']);
  const s2 = createStore(memStorage());
  const first = s2.importPlaces(r.places).added, second = s2.importPlaces(r.places).added;
  assert.deepEqual([first, second], [2, 0]); assert.equal(s2.state.places.length, 2);
  assert.match(parseBackup('{}').error, /keine Sicherung/); assert.match(parseBackup('kein json').error, /JSON/);
  assert.match(parseBackup(JSON.stringify({ app: 'taxi-lernkarte', format: 99, places: [] })).error, /neueren/);
  const m = mergePlaces([], [{ name: 'X', lat: 1, lng: 1 }, { name: '', lat: 1, lng: 1 }, null]);
  assert.deepEqual([m.added, m.skipped], [1, 2]);
  assert.equal(cleanPlace({ name: 'x'.repeat(200), lat: 1, lng: 1 }).name.length, 80);
});

// ---------------------------------------------------------------- Routen-Daten + Fahr-Rechenkern
const ab = JSON.parse(fs.readFileSync(new URL('../data/routes-ab.json', import.meta.url)));
const pairs = JSON.parse(fs.readFileSync(new URL('../data/pairs.json', import.meta.url)));

function checkRoute(raw, name) {
  const r = drive.prepRoute(raw, name, name);
  assert.ok(r.pts.length > 20, name + ' zu kurz');
  for (const p of r.pts) assert.ok(inBox(p.lat, p.lng), `${name}: Punkt ausserhalb ${p.lat},${p.lng}`);
  for (let i = 1; i < r.cum.length; i++) assert.ok(r.cum[i] >= r.cum[i - 1]);
  assert.ok(Math.abs(r.total - raw.d) < 5, `${name}: Laenge ${r.total} vs ${raw.d}`);
  for (let i = 1; i < r.steps.length; i++) assert.ok(r.steps[i].s >= r.steps[i - 1].s, name + ' Schritte unsortiert');
  assert.equal(r.steps.at(-1).type, 'arrive');
  for (let i = 1; i < r.pts.length; i++) assert.ok(distanceM(r.pts[i - 1], r.pts[i]) < 4000, `${name}: Sprung bei Punkt ${i}`);
  return r;
}

test('Routen A und B: Start/Ziel, Autobahn nur bei A, Orte entlang der Strecke', () => {
  const A = checkRoute(ab.routes.A, 'A'), B = checkRoute(ab.routes.B, 'B');
  assert.ok(distanceM(A.pts[0], P.waedenswil) < 200); assert.ok(distanceM(A.pts.at(-1), P.albisguetli) < 200);
  assert.ok(distanceM(B.pts[0], P.waedenswil) < 200);
  assert.ok(A.steps.some((s) => s.ref === 'A3'), 'A nutzt A3'); assert.ok(!B.steps.some((s) => /^A\d/.test(s.ref)), 'B ohne Autobahn');
  const order = drive.placesAlong(B, PLACES).map((a) => a.place.id);
  for (const id of ['waedenswil', 'au-zh', 'horgen', 'oberrieden', 'thalwil', 'rueschlikon', 'kilchberg', 'wollishofen', 'enge']) assert.ok(order.includes(id), 'B kommt nicht an ' + id + ' vorbei');
  const ix = (id) => order.indexOf(id);
  assert.ok(ix('au-zh') < ix('horgen') && ix('horgen') < ix('thalwil') && ix('thalwil') < ix('kilchberg') && ix('kilchberg') < ix('enge'));
  const alongA = drive.placesAlong(A, PLACES).map((a) => a.place.id);
  assert.ok(alongA.includes('brunau') && alongA.includes('albisguetli'));
});

test('Pruefungs-Paare: genug, alle Orte bekannt, Start/Ziel stimmen, Routen plausibel', () => {
  const keys = Object.keys(pairs.pairs);
  assert.ok(keys.length >= 100, 'nur ' + keys.length + ' Paare');
  for (const k of keys) {
    const [a, b] = k.split('|'); assert.ok(P[a] && P[b], k);
    const r = drive.prepRoute(pairs.pairs[k], 'pair:' + k, k);
    assert.ok(distanceM(r.pts[0], P[a]) < 250, k + ' Start'); assert.ok(distanceM(r.pts.at(-1), P[b]) < 250, k + ' Ziel');
    assert.ok(r.total >= distanceM(P[a], P[b]) * 0.95, k + ' kuerzer als Luftlinie');
    for (const p of r.pts) assert.ok(inBox(p.lat, p.lng), k + ' ausserhalb');
  }
});

test('Fahrmodus: Position, Fahrtrichtung, Hinweise auf Deutsch, Fragenplanung', () => {
  const B = drive.prepRoute(ab.routes.B, 'B', 'B');
  const p0 = drive.posAt(B, 0), pe = drive.posAt(B, B.total + 100);
  assert.ok(distanceM(p0, B.pts[0]) < 1); assert.ok(distanceM(pe, B.pts.at(-1)) < 1);
  const mid = drive.posAt(B, 5000), m2 = drive.posAt(B, 5010);
  assert.ok(Math.abs(distanceM(mid, m2) - 10) < 1.5, 'Auto bewegt sich 10 m pro 10 m');
  const h = drive.headingAt(B, 500); assert.ok(h >= 0 && h < 360);
  assert.equal(Math.round(drive.bearing({ lat: 47, lng: 8 }, { lat: 48, lng: 8 })), 0);
  assert.equal(Math.round(drive.bearing({ lat: 47, lng: 8 }, { lat: 47, lng: 9 })), 90);
  assert.equal(drive.angleDiff(350, 10), 20); assert.equal(drive.angleDiff(10, 350), -20);
  assert.equal(drive.instruction({ type: 'turn', mod: 'right', name: 'Seestrasse' }).text, 'rechts abbiegen in Seestrasse');
  assert.equal(drive.instruction({ type: 'turn', mod: 'left', name: '' }).text, 'links abbiegen');
  assert.equal(drive.instruction({ type: 'roundabout', mod: 'right', name: 'Stockerstrasse', exit: 2 }).text, 'Im Kreisel 2. Ausfahrt nehmen in Stockerstrasse');
  assert.equal(drive.instruction({ type: 'arrive', mod: '', name: '' }).text, 'Ziel erreicht');
  assert.equal(drive.shortDist(284), '280 m'); assert.equal(drive.shortDist(1234), '1.2 km');
  const nd = drive.nextDecision(B, 0); assert.ok(nd && nd.dist > 0 && nd.step.k === 1);
  assert.ok(drive.currentStep(B, 4000).s <= 4000);
  const along = drive.placesAlong(B, PLACES);
  const qs = drive.planQuestions(B, along, PLACES, { rng: rngSeq(5) });
  assert.ok(qs.length >= 3 && qs.length <= 8);
  for (let i = 1; i < qs.length; i++) assert.ok(qs[i].at - qs[i - 1].at >= 600, 'Fragen zu dicht');
  for (const q of qs) {
    assert.ok(q.options.length >= 3);
    assert.ok(q.kind === 'next' ? q.options.some((o) => o.id === q.answer) : q.options.includes(q.answer));
    assert.ok(drive.questionText(q, 'Seestrasse', 'Zürich').length > 10);
  }
  const turn = qs.find((q) => q.kind === 'turn');
  const forced = drive.planQuestions(B, along, PLACES, { rng: rngSeq(99), repeatKeys: new Set([turn.key]) });
  assert.ok(forced.some((q) => q.key === turn.key));
  const groups = drive.streetGroups(B); assert.ok(groups.length > 5); assert.equal(groups[0].s, 0); assert.ok(Math.abs(groups.at(-1).to - B.total) < 1);
  const sl = drive.slice(B, 100, 600); assert.ok(sl.length >= 2); assert.ok(distanceM({ lat: sl[0][0], lng: sl[0][1] }, drive.posAt(B, 100)) < 1);
});
