// Statische Pruefungen: Versionen ueberall gleich, alle Dateien des Service Workers existieren,
// Manifest/Icons ok, keine Fremd-Server (kein CDN), Leaflet lokal, Schweizer Schreibweise (ss).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const jsFiles = fs.readdirSync(path.join(ROOT, 'js')).map((f) => 'js/' + f);

test('Version: sw.js, app.js und alle ?v= stimmen ueberein', () => {
  const v = read('sw.js').match(/const VERSION = '(\d+)'/)[1];
  assert.equal(read('js/app.js').match(/APP_VERSION = '(\d+)'/)[1], v);
  for (const f of ['index.html', 'manifest.webmanifest', 'sw.js', ...jsFiles]) {
    const found = [...read(f).matchAll(/\?v=(\d+)/g)].map((m) => m[1]);
    assert.ok(found.every((x) => x === v), `${f}: uneinheitliche ?v= (${[...new Set(found)]}) statt ${v}`);
  }
});

test('Service Worker: alle vorab gespeicherten Dateien existieren, alle Module sind enthalten', () => {
  const list = [...read('sw.js').matchAll(/'([^']+)'/g)].map((m) => m[1]).filter((s) => /\.(js|css|json|png|svg|webmanifest|html)(\?v=\d+)?$/.test(s) || s === './');
  assert.ok(list.length > 20);
  for (const a of list) { if (a === './') continue; assert.ok(fs.existsSync(path.join(ROOT, a.split('?')[0])), 'fehlt: ' + a); }
  for (const f of jsFiles) assert.ok(list.some((a) => a.startsWith(f)), f + ' fehlt im Service Worker');
  assert.ok(list.includes('data/pairs.json?v=' + read('sw.js').match(/VERSION = '(\d+)'/)[1]));
});

test('Manifest: installierbar (Name, start_url, Icons vorhanden, standalone)', () => {
  const m = JSON.parse(read('manifest.webmanifest'));
  assert.equal(m.display, 'standalone'); assert.equal(m.lang, 'de-CH'); assert.ok(m.name && m.short_name && m.start_url);
  assert.ok(m.icons.some((i) => i.sizes === '192x192') && m.icons.some((i) => i.sizes === '512x512') && m.icons.some((i) => i.purpose === 'maskable'));
  for (const i of m.icons) assert.ok(fs.existsSync(path.join(ROOT, i.src.split('?')[0])), i.src);
});

test('Leaflet liegt lokal, keine CDN-/Fremd-Skripte, nur erlaubte Server im Code', () => {
  const html = read('index.html');
  assert.match(html, /vendor\/leaflet\/leaflet\.js/); assert.match(html, /vendor\/leaflet\/leaflet\.css/);
  assert.ok(!/(unpkg|jsdelivr|cdnjs|googleapis|gstatic)/.test(html + jsFiles.map(read).join('')));
  assert.ok(fs.existsSync(path.join(ROOT, 'vendor/leaflet/LICENSE')));
  const hosts = new Set();
  for (const f of ['index.html', 'sw.js', ...jsFiles]) for (const m of read(f).matchAll(/https?:\/\/([a-z0-9.-]+)/gi)) hosts.add(m[1]);
  const allowed = new Set(['tile.openstreetmap.org', 'www.openstreetmap.org', 'leafletjs.com', 'github.com', 'tiles.openfreemap.org', 'openfreemap.org', 'www.openmaptiles.org', 'overpass.openstreetmap.fr']);
  for (const h of hosts) assert.ok(allowed.has(h), 'unerwarteter Server: ' + h);
  assert.match(read('js/app.js'), /OpenStreetMap<\/a>-Mitwirkende/); // Quellenangabe auf der Karte
});

test('Hinweise und Schweizer Schreibweise', () => {
  const html = read('index.html');
  assert.match(html, /nicht offiziell/); assert.match(html, /Strassenverkehrsamt Zürich/); assert.match(html, /cab24\.ch/); assert.match(html, /kein echtes Navi/);
  for (const f of ['index.html', 'README.md', ...jsFiles]) assert.ok(!/ß/.test(read(f).replaceAll('/ß/g', '')), f + ' enthält ß');
});

test('README und Lizenz vorhanden', () => {
  assert.match(read('README.md'), /Taxi-Lernkarte/); assert.match(read('LICENSE'), /MIT License/);
  for (const w of ['Version veröffentlichen', 'Feste Orte ergänzen', 'Grenzen']) assert.ok(read('README.md').includes(w), 'README ohne «' + w + '»');
});
