// Tests fuer die festen Orte: Pflichtorte, Koordinaten im Zuerichsee-Rechteck, keine Dubletten, Suche.
import test from 'node:test';
import assert from 'node:assert/strict';
import { PLACES, BOX, STUFEN, TYPEN, inBox, normalize, filterPlaces } from '../js/places.js?v=1';
import { distanceM } from '../js/geo.js?v=1';

test('alle Pflichtorte aus dem Auftrag und dem Dossier sind vorhanden', () => {
  const ids = new Set(PLACES.map((p) => p.id));
  for (const id of ['waedenswil', 'au-zh', 'horgen', 'thalwil', 'kilchberg', 'wollishofen', 'enge', 'sihlcity', 'brunau', 'albisguetli', 'hb',
    'buerkliplatz', 'paradeplatz', 'bellevue', 'triemli', 'see-spital-horgen', 'faehre-horgen', 'samstagern', 'richterswil', 'schoenenberg',
    'oberrieden', 'rueschlikon', 'tessinerplatz', 'schmiede-wiedikon', 'brunaupark', 'morgental', 'hafen-wollishofen', 'kaepfnach', 'spital-kilchberg',
    'albisguetli-tram', 'kilchberg-zentrum', 'thalwil-zentrum', 'waedenswil-zentrum', 'schloss-au']) assert.ok(ids.has(id), 'fehlt: ' + id);
});

test('alle Koordinaten liegen im Zürichsee-Rechteck', () => {
  for (const p of PLACES) assert.ok(inBox(p.lat, p.lng), `${p.id} ausserhalb: ${p.lat}, ${p.lng}`);
  assert.equal(inBox(48.0, 8.5), false);
  assert.equal(inBox(NaN, 8.5), false);
});

test('keine Dubletten bei id, Name, Beschriftung; Orte sind mindestens 50 m auseinander', () => {
  for (const key of ['id', 'name', 'label']) assert.equal(new Set(PLACES.map((p) => p[key])).size, PLACES.length, 'Dublette bei ' + key);
  for (let i = 0; i < PLACES.length; i++) for (let j = i + 1; j < PLACES.length; j++) {
    const d = distanceM(PLACES[i], PLACES[j]);
    assert.ok(d >= 50, `${PLACES[i].id} und ${PLACES[j].id} nur ${Math.round(d)} m auseinander`);
  }
});

test('jeder Ort hat Stufe, Typ, Adresse, OSM-Quelle und plausible Felder', () => {
  for (const p of PLACES) {
    assert.ok(STUFEN[p.stufe], p.id + ' Stufe');
    assert.ok(TYPEN.includes(p.type), p.id + ' Typ');
    assert.match(p.osm, /^(node|way|relation)\/\d+$/, p.id + ' osm');
    assert.ok(p.name && p.label && p.address && p.note, p.id + ' Textfelder');
    assert.ok(!/ß/.test(JSON.stringify(p)), p.id + ' enthält ß (Schweizer Schreibweise: ss)');
  }
  for (const s of [1, 2, 3]) assert.ok(PLACES.filter((p) => p.stufe === s).length >= 5, 'Stufe ' + s + ' zu klein');
});

test('Suche ignoriert Umlaute und Gross-/Kleinschreibung', () => {
  assert.equal(normalize('Bürkliplatz'), 'burkliplatz');
  assert.equal(normalize('Strasse ß'), 'strasse ss');
  assert.deepEqual(filterPlaces(PLACES, 'burkli').map((p) => p.id), ['buerkliplatz']);
  assert.ok(filterPlaces(PLACES, 'WÄDENSWIL').length >= 2);
  assert.equal(filterPlaces(PLACES, 'uetlibergstrasse 301').length, 1);
  assert.equal(filterPlaces(PLACES, 'xyzxyz').length, 0);
  assert.equal(filterPlaces(PLACES, '').length, PLACES.length);
});
