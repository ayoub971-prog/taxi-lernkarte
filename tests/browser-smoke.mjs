// Browser-Rauchtest mit echtem (headless) Chrome ueber das DevTools-Protokoll, Handy-Groesse 412x915.
// Optional – braucht google-chrome/chromium und python3.   Start:  node tests/browser-smoke.mjs
// Prueft: Start ohne Fehler, Pins, Namen an/aus, Orte-Liste/Filter/Suche, Langdruck -> eigener Ort (+ bearbeiten, loeschen),
// JSON-Sicherung, Quiz (Wo ist / Welcher Ort / Pruefen / Heute), Pruefungsaufgabe mit Aufdecken, Routen A/B,
// Fahrmodus (Auto bewegt sich auf der Strecke, Karte dreht sich, Frage waehrend der Fahrt), Querformat, Offline-Start.
// Screenshots: /workspace/taxi-shots (oder Ordner in SHOTS_DIR).
import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const PORT = 18770, DBG = 19340;
const SHOTS = process.env.SHOTS_DIR || '/workspace/taxi-shots';
fs.mkdirSync(SHOTS, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const chromeBin = ['google-chrome', 'chromium', 'chromium-browser'].find((c) => { try { execFileSync('which', [c], { stdio: 'ignore' }); return true; } catch { return false; } });
if (!chromeBin) { console.log('SKIP: kein Chrome gefunden'); process.exit(0); }

const server = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], { cwd: ROOT, stdio: 'ignore' });
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'taxi-chrome-'));
const chrome = spawn(chromeBin, ['--headless=new', `--remote-debugging-port=${DBG}`, `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check', '--disable-gpu', '--no-sandbox', 'about:blank'], { stdio: 'ignore' });
const cleanup = () => { try { chrome.kill('SIGKILL'); } catch {} try { server.kill(); } catch {} };
process.on('exit', cleanup);

let ws, msgId = 0;
const pending = new Map();
const errors = [];
const send = (method, params = {}) => { const id = ++msgId; ws.send(JSON.stringify({ id, method, params })); return new Promise((res, rej) => pending.set(id, { res, rej })); };
async function ev(expr) {
  const r = await send('Runtime.evaluate', { expression: `(async () => { ${expr} })()`, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error('Seite: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
  return r.result.value;
}
async function waitFor(expr, ms = 6000) {
  const t = Date.now();
  while (Date.now() - t < ms) { if (await ev(`return !!(${expr})`)) return; await sleep(100); }
  throw new Error('Timeout: ' + expr);
}
async function shot(name) {
  await sleep(1200); // Kacheln laden lassen
  const r = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(SHOTS, name + '.png'), Buffer.from(r.data, 'base64'));
}
const mouse = async (type, x, y) => send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1 });
async function clickAt(x, y) { await mouse('mouseMoved', x, y); await mouse('mousePressed', x, y); await mouse('mouseReleased', x, y); }
async function center(sel) {
  const r = await ev(`const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return null; if (e.closest('.panel')) e.scrollIntoView({block:'center'}); const b = e.getBoundingClientRect(); return {x: b.x + b.width/2, y: b.y + b.height/2, w: b.width, h: b.height}`);
  assert.ok(r, 'Element nicht gefunden: ' + sel); return r;
}
async function click(sel) { const c = await center(sel); assert.ok(c.w >= 40 && c.h >= 40 || /^(.leaflet|.chip)/.test(sel), `Tippflaeche zu klein (${sel}): ${c.w}x${c.h}`); await clickAt(c.x, c.y); }
async function clickText(sel, text) {
  const r = await ev(`const e = [...document.querySelectorAll(${JSON.stringify(sel)})].find(b => b.textContent.includes(${JSON.stringify(text)})); if (!e) return null; if (e.closest('.panel')) e.scrollIntoView({block:'center'}); const b = e.getBoundingClientRect(); return {x: b.x + b.width/2, y: b.y + b.height/2}`);
  assert.ok(r, `Knopf «${text}» nicht gefunden (${sel})`); await clickAt(r.x, r.y);
}
const results = [];
async function step(name, fn) {
  try { await fn(); results.push(['PASS', name]); console.log('PASS', name); }
  catch (e) { results.push(['FAIL', name, e.message]); console.log('FAIL', name, '-', e.message); }
}
const tapPlace = async (id, offPx = 0) => { // tippt auf die Karte an die Stelle eines Ortes (optional offPx Pixel Richtung Kartenmitte daneben)
  const pt = await ev(`const p = __taxi.allPlaces().find(p => p.id === ${JSON.stringify(id)}); const m = __taxi.map; const c = m.latLngToContainerPoint([p.lat, p.lng]); const s = m.getSize();
    const dx = s.x / 2 - c.x, dy = s.y / 2 - c.y, len = Math.hypot(dx, dy) || 1; const r = document.querySelector('#map').getBoundingClientRect();
    return {x: r.x + c.x + dx / len * ${offPx}, y: r.y + c.y + dy / len * ${offPx}}`);
  const hit = await ev(`const e = document.elementFromPoint(${pt.x}, ${pt.y}); return e ? (e.id || e.className) : null`);
  if (!/(^map$|leaflet-container)/.test(String(hit))) console.log('  Hinweis: Tipp bei', id, JSON.stringify(pt), 'trifft', hit, await ev(`const m = __taxi.map; return JSON.stringify({z: m.getZoom(), c: m.getCenter(), s: m.getSize(), b: m.getBounds().toBBoxString(), q: __taxi.quiz.state().q.bounds.toBBoxString(), i: __taxi.quiz.state().q.i, mode: __taxi.mode})`));
  await clickAt(pt.x, pt.y);
};

async function main() {
  for (let i = 0; i < 50; i++) { try { await (await fetch(`http://127.0.0.1:${DBG}/json/version`)).json(); break; } catch { await sleep(200); } }
  for (let i = 0; i < 50; i++) { try { await fetch(`http://127.0.0.1:${PORT}/`); break; } catch { await sleep(200); } }
  const target = await (await fetch(`http://127.0.0.1:${DBG}/json/new?about:blank`, { method: 'PUT' })).json();
  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener('open', r));
  ws.addEventListener('message', (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.rej(new Error(m.error.message)) : p.res(m.result); }
    if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errors.push(m.params.args.map((a) => a.value || a.description).join(' '));
    if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error' && !/favicon|tile\.openstreetmap|ERR_INTERNET_DISCONNECTED/.test((m.params.entry.url || '') + m.params.entry.text)) errors.push(m.params.entry.text + ' ' + (m.params.entry.url || ''));
  });
  await send('Runtime.enable'); await send('Log.enable'); await send('Page.enable'); await send('Network.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 412, height: 915, deviceScaleFactor: 2, mobile: true, screenWidth: 412, screenHeight: 915 });
  await send('Emulation.setTouchEmulationEnabled', { enabled: true });
  await send('Emulation.setGeolocationOverride', { latitude: 47.3641, longitude: 8.5308, accuracy: 30 });
  await send('Browser.grantPermissions', { permissions: ['geolocation'] }).catch(() => {});
  const URL0 = `http://127.0.0.1:${PORT}/`;
  await send('Page.navigate', { url: URL0 });
  await waitFor('window.__taxi && document.querySelectorAll(".pin").length > 0', 10000);
  await waitFor('navigator.serviceWorker.controller', 10000).catch(async () => { await send('Page.reload'); await waitFor('window.__taxi && navigator.serviceWorker.controller', 10000); });
  await waitFor('window.__taxi && document.querySelectorAll(".pin").length > 0');

  await step('Start: Willkommens-Hinweis, danach Karte mit 34 roten Pins, Quellenangabe, Service Worker', async () => {
    await waitFor('document.querySelector("#dlg-intro").open');
    assert.match(await ev('return document.querySelector("#dlg-intro").textContent'), /freiwillige Lernhilfe/);
    await shot('01-willkommen');
    await click('#dlg-intro .btn'); await waitFor('!document.querySelector("#dlg-intro").open');
    const r = await ev(`return { pins: document.querySelectorAll('.pin').length, red: document.querySelectorAll('.pin.m-rot').length,
      attr: document.querySelector('.leaflet-control-attribution').textContent, caches: await caches.keys(), w: innerWidth, scroll: document.documentElement.scrollWidth,
      tiles: document.querySelectorAll('.leaflet-tile').length, ver: document.querySelector('#app-version').textContent }`);
    assert.equal(r.pins, 34); assert.equal(r.red, 34); assert.match(r.attr, /OpenStreetMap/); assert.ok(r.caches.includes('taxi-lernkarte-shell-v1'), r.caches.join());
    assert.equal(r.w, 412); assert.ok(r.scroll <= 412, 'horizontales Scrollen: ' + r.scroll); assert.equal(r.ver, '1'); assert.ok(r.tiles > 0);
    await shot('02-karte');
  });

  await step('Namen an/aus (Pins bleiben, Beschriftung verschwindet)', async () => {
    const vis = () => ev(`return [...document.querySelectorAll('.pin-label')].filter(l => getComputedStyle(l).display !== 'none').length`);
    const on = await vis(); assert.ok(on >= 5, 'sichtbare Namen: ' + on);
    await click('#btn-labels'); assert.equal(await vis(), 0);
    assert.equal(await ev(`return document.querySelectorAll('.pin').length`), 34);
    await shot('03-namen-aus');
    await click('#btn-labels'); assert.ok((await vis()) >= 5);
  });

  await step('Mein Standort: Punkt auf der Karte + «In der Nähe»', async () => {
    await click('#btn-locate'); await waitFor('!document.querySelector("#nearby").hidden', 8000);
    const t = await ev(`return document.querySelector('#nearby').textContent`);
    assert.match(t, /Enge|Tessinerplatz/); assert.match(t, /m\b/);
    await shot('04-standort');
    await clickText('#nearby button', 'Schliessen');
  });

  await step('Orte: Liste (34), Stufen-Filter, Suche, Tippen fliegt zum Ort', async () => {
    await click('.nav-btn[data-view="orte"]');
    assert.equal(await ev(`return document.querySelectorAll('#place-list li').length`), 34);
    await shot('05-orte');
    await click('.chip[data-f="1"]'); assert.equal(await ev(`return document.querySelectorAll('#place-list li').length`), 11);
    await click('.chip[data-f="alle"]');
    await ev(`const s = document.querySelector('#search'); s.value = 'bürkli'; s.dispatchEvent(new Event('input'))`);
    assert.equal(await ev(`return document.querySelectorAll('#place-list li').length`), 1);
    await click('#place-list button.item');
    await waitFor('document.querySelector("#app").dataset.view === "karte"');
    await waitFor('document.querySelector(".leaflet-popup")', 5000);
    assert.match(await ev(`return document.querySelector('.leaflet-popup-content').textContent`), /Bürkliplatz/);
    await shot('06-popup-buerkliplatz');
    await ev(`const s = document.querySelector('#search'); s.value = ''; s.dispatchEvent(new Event('input')); __taxi.map.closePopup()`);
  });

  await step('Eigener Ort: Langdruck auf Karte -> Dialog -> speichern -> bearbeiten -> loeschen', async () => {
    await ev(`__taxi.map.setView([47.3308, 8.5900], 15, {animate: false})`); await sleep(600); // offene Seefläche ohne Pins
    const r = await ev(`const b = document.querySelector('#map').getBoundingClientRect(); return {x: b.x + b.width / 2 - 60, y: b.y + b.height / 2 + 120}`);
    await mouse('mouseMoved', r.x, r.y); await mouse('mousePressed', r.x, r.y); await sleep(900); await mouse('mouseReleased', r.x, r.y);
    await waitFor('document.querySelector("#dlg-place").open');
    await ev(`document.querySelector('#in-name').value = 'Hotel Storchen'; document.querySelector('#in-note').value = 'Weinplatz 2, Lernort'`);
    await shot('07-eigener-ort-dialog');
    await click('#form-place .btn.primary');
    await waitFor('!document.querySelector("#dlg-place").open');
    assert.equal(await ev(`return JSON.parse(localStorage.getItem('taxi-lernkarte-v1')).places.length`), 1);
    assert.equal(await ev(`return document.querySelectorAll('.pin.own').length`), 1);
    await ev(`document.querySelector('.pin.own').click()`); await waitFor('document.querySelector(".leaflet-popup .pbtn")');
    await shot('08-eigener-ort-popup');
    await clickText('.leaflet-popup .pbtn', 'Bearbeiten'); await waitFor('document.querySelector("#dlg-place").open');
    await ev(`document.querySelector('#in-note').value = 'geändert'`); await click('#form-place .btn.primary'); await waitFor('!document.querySelector("#dlg-place").open');
    assert.equal(await ev(`return __taxi.store.state.places[0].note`), 'geändert');
    await ev(`document.querySelector('.pin.own').click()`); await waitFor('document.querySelector(".leaflet-popup .pbtn.danger")');
    await clickText('.leaflet-popup .pbtn', 'Löschen'); await waitFor('document.querySelector("#dlg-msg").open'); await click('#msg-yes');
    await waitFor('__taxi.store.state.places.length === 0');
    assert.equal(await ev(`return document.querySelectorAll('.pin.own').length`), 0);
    // fuer die Sicherung wieder einen anlegen
    await ev(`__taxi.store.addPlace({name: 'Testort', note: 'x', lat: 47.37, lng: 8.54}); __taxi.refresh()`);
  });

  await step('Sicherung: Export (JSON) und Import (Dubletten werden uebersprungen)', async () => {
    await click('.nav-btn[data-view="mehr"]');
    await ev(`window.__dl = null; const orig = HTMLAnchorElement.prototype.click; HTMLAnchorElement.prototype.click = function () { if (this.download) { window.__dl = {name: this.download, href: this.href}; return; } return orig.call(this); }`);
    await click('#btn-export'); await waitFor('window.__dl');
    const text = await ev(`return await (await fetch(window.__dl.href)).text()`);
    const j = JSON.parse(text); assert.equal(j.app, 'taxi-lernkarte'); assert.equal(j.places.length, 1); assert.equal(j.places[0].name, 'Testort');
    assert.match(await ev('return window.__dl.name'), /^taxi-lernkarte-sicherung-\d{4}-\d\d-\d\d\.json$/);
    // Import: gleiche Datei -> 0 neue; geaenderte Datei -> 1 neuer Ort
    const imp = (t) => ev(`const dt = new DataTransfer(); dt.items.add(new File([${JSON.stringify(t)}], 'b.json', {type: 'application/json'})); const i = document.querySelector('#file-import'); i.files = dt.files; i.dispatchEvent(new Event('change')); await new Promise(r => setTimeout(r, 400)); return document.querySelector('#backup-msg').textContent`);
    assert.match(await imp(text), /0 neue Orte/);
    j.places.push({ id: 'uimport1', name: 'Importiert', lat: 47.36, lng: 8.55, note: '' });
    assert.match(await imp(JSON.stringify(j)), /1 neue Orte/);
    assert.equal(await ev(`return __taxi.store.state.places.length`), 2);
    assert.match(await imp('{"nope":1}'), /keine Sicherung/);
    await shot('09-mehr');
    await ev(`for (const p of __taxi.store.state.places.slice()) __taxi.store.removePlace(p.id); __taxi.refresh()`);
  });

  await step('Quiz «Wo ist …?» (Stufe 1): Tipp auf den Ort = Treffer, daneben = Distanz in m, Ergebnis, Ampelfarbe', async () => {
    await click('.nav-btn[data-view="quiz"]'); await shot('10-quiz-menue');
    await ev(`document.querySelector('#quiz-stufe').value = '1'; document.querySelector('#quiz-stufe').dispatchEvent(new Event('change')); document.querySelector('#quiz-count').value = '5'`);
    await click('#q-wo'); await waitFor('document.querySelector("#app").dataset.mode === "quiz"');
    assert.equal(await ev(`return document.querySelectorAll('.pin').length`), 0, 'Pins muessen im Quiz verborgen sein');
    assert.match(await ev(`return document.querySelector('#banner').textContent`), /^Wo ist /);
    await shot('11-wo-frage');
    const ids = [];
    for (let i = 0; i < 5; i++) {
      const id = await ev(`return __taxi.quiz.state().q.items[__taxi.quiz.state().q.i].place.id`); ids.push(id);
      if (i === 1) await tapPlace(id, 70); else await tapPlace(id);   // Frage 2: 70 Pixel daneben
      await waitFor('document.querySelector("#quiz-card .qfb")');
      const fb = await ev(`return document.querySelector('#quiz-card .qfb').textContent`);
      if (i === 1) { assert.match(fb, /Distanz: (\d\.\d\d km|\d{3,4} m)/); assert.ok(!/Perfekt|Treffer/.test(fb), fb); } else assert.match(fb, /Distanz: \d{1,3} m/);
      if (i === 0) await shot('12-wo-feedback');
      await clickText('#quiz-card .btn', i === 4 ? 'Ergebnis' : 'Weiter');
    }
    assert.match(await ev(`return document.querySelector('#quiz-card').textContent`), /4 von 5 richtig \(80 %\)/);
    await shot('13-wo-ergebnis');
    const prog = await ev(`return __taxi.store.state.progress`);
    assert.equal(prog[ids[1]].box, 0); assert.equal(prog[ids[0]].box, 1);
    await clickText('#quiz-card .btn', 'Fertig'); await waitFor('document.querySelector("#app").dataset.mode === "normal"');
    assert.equal(await ev(`return document.querySelectorAll('.pin').length`), 34);
  });

  await step('Quiz «Welcher Ort?»: 4 Antworten, richtige/falsche Rueckmeldung; Pruefen ohne Rueckmeldung; Heute ueben', async () => {
    await click('.nav-btn[data-view="quiz"]');
    await ev(`document.querySelector('#quiz-stufe').value = 'alle'; document.querySelector('#quiz-count').value = '5'`);
    await click('#q-name'); await waitFor('document.querySelectorAll("#quiz-card .opt").length === 4');
    await shot('14-name-frage');
    let id = await ev(`return __taxi.quiz.state().q.items[0].place.id`);
    await click(`#quiz-card .opt[data-id="${id}"]`);
    assert.match(await ev(`return document.querySelector('#quiz-card .qfb').textContent`), /Richtig!/);
    await clickText('#quiz-card .btn', 'Weiter'); await waitFor('document.querySelectorAll("#quiz-card .opt").length === 4');
    id = await ev(`return __taxi.quiz.state().q.items[1].place.id`);
    const wrong = await ev(`return [...document.querySelectorAll('#quiz-card .opt')].find(b => b.dataset.id !== ${JSON.stringify(id)}).dataset.id`);
    await click(`#quiz-card .opt[data-id="${wrong}"]`);
    assert.match(await ev(`return document.querySelector('#quiz-card .qfb').textContent`), /Falsch – das ist:/);
    await shot('15-name-falsch');
    await click('#quiz-card .btn.primary'); // weiter
    await clickText('#quiz-card .btn', 'Beenden'); await waitFor('document.querySelector("#app").dataset.mode === "normal"');
    // Pruefen: keine Rueckmeldung
    await click('.nav-btn[data-view="quiz"]'); await click('#q-pruefen'); await waitFor('document.querySelector("#app").dataset.mode === "quiz"');
    const first = await ev(`return __taxi.quiz.state().q.items[0].kind`);
    if (first === 'wo') await tapPlace(await ev(`return __taxi.quiz.state().q.items[0].place.id`)); else await click('#quiz-card .opt');
    await waitFor('document.querySelector("#quiz-card .qfb")');
    assert.match(await ev(`return document.querySelector('#quiz-card').textContent`), /gespeichert|Weiter/); assert.ok(!/Distanz|Richtig|Falsch/.test(await ev(`return document.querySelector('#quiz-card').textContent`)), 'Pruefen darf nichts verraten');
    await clickText('#quiz-card .btn', 'Beenden'); await waitFor('document.querySelector("#app").dataset.mode === "normal"');
    // Heute ueben
    await click('.nav-btn[data-view="quiz"]');
    assert.match(await ev(`return document.querySelector('#btn-heute').textContent`), /Heute üben \(10 Fragen\)/);
    await click('#btn-heute'); await waitFor('document.querySelector("#app").dataset.mode === "quiz"');
    assert.equal(await ev(`return __taxi.quiz.state().q.items.length`), 10);
    await clickText('#quiz-card .btn', 'Beenden'); await waitFor('document.querySelector("#app").dataset.mode === "normal"');
  });

  await step('Fortschritt: Ampelfarben (rot/gelb/gruen), Filter «Nur schwache», Prozent pro Stufe', async () => {
    await ev(`__taxi.store.mutateProgress(pr => { for (const id of ['horgen','thalwil','oberrieden']) pr[id] = {box: 5, due: Date.now() + 1e9, right: 5, wrong: 0}; pr['kilchberg'] = {box: 2, due: Date.now() + 1e9, right: 2, wrong: 0}; }); __taxi.refresh()`);
    const c = await ev(`return {g: document.querySelectorAll('.pin.m-gruen').length, y: document.querySelectorAll('.pin.m-gelb').length}`);
    assert.ok(c.g >= 3 && c.y >= 1, JSON.stringify(c));
    await shot('16-ampel-karte');
    await click('.nav-btn[data-view="orte"]');
    assert.ok((await ev(`return document.querySelectorAll('.prog').length`)) >= 3);
    assert.match(await ev(`return document.querySelector('#progress-bars').textContent`), /\d+ %/);
    const all = await ev(`return document.querySelectorAll('#place-list li').length`);
    await click('.chip.weak'); const weak = await ev(`return document.querySelectorAll('#place-list li').length`);
    assert.ok(weak < all && weak >= 20, `schwach ${weak} von ${all}`);
    await shot('17-orte-fortschritt-schwach');
    await click('.chip.weak');
  });

  await step('Routen A (Autobahn) und B (Seestrasse) einzeln ein-/ausschaltbar, mit Hinweis «Lernskizze»', async () => {
    await click('.nav-btn[data-view="karte"]');
    await click('#btn-route-a'); await waitFor('document.querySelector("#legend") && !document.querySelector("#legend").hidden');
    await click('#btn-route-b'); await sleep(800);
    assert.equal(await ev(`return document.querySelectorAll('#map path.leaflet-interactive[stroke-width="5"]').length`), 2);
    assert.match(await ev(`return document.querySelector('#legend').textContent`), /Lernskizze, keine Prüfungsroute/);
    await ev(`__taxi.map.fitBounds([[47.2, 8.5], [47.38, 8.7]], {animate: false})`);
    await shot('18-routen-a-b');
    await click('#btn-route-a'); assert.equal(await ev(`return document.querySelectorAll('#map path.leaflet-interactive[stroke-width="5"]').length`), 1);
    await click('#btn-route-b'); assert.equal(await ev(`return document.querySelector('#legend').hidden`), true);
  });

  await step('Stufe 4 Pruefungsaufgabe: Start/Ziel, Aufdecken Strasse fuer Strasse, Aufloesen, Bewertung -> Wiederholliste', async () => {
    await click('.nav-btn[data-view="quiz"]'); await click('#q-exam');
    await waitFor('document.querySelector("#quiz-card .qtext") && /^Fahre von/.test(document.querySelector("#quiz-card .qtext").textContent)', 8000);
    const text = await ev(`return document.querySelector('#quiz-card .qtext').textContent`); assert.match(text, /^Fahre von .+ nach .+\.$/);
    assert.equal(await ev(`return document.querySelectorAll('#map path[stroke="#ef6c00"]').length`), 0, 'vor dem Aufdecken keine Route');
    await shot('19-pruefung-aufgabe');
    await clickText('#quiz-card .btn', 'Aufdecken');
    await waitFor('document.querySelector("#quiz-card ol")');
    await clickText('#quiz-card .btn', 'Nächste Strasse');
    const n1 = await ev(`return __taxi.quiz.state().exam.shown`); assert.equal(n1, 2);
    await shot('20-pruefung-aufgedeckt');
    await clickText('#quiz-card .btn', 'Alles auflösen'); await waitFor('/Gewusst/.test(document.querySelector("#quiz-card").textContent)');
    await shot('21-pruefung-aufgeloest');
    const key = await ev(`return __taxi.quiz.state().exam.key`);
    await clickText('#quiz-card .btn', 'Noch nicht');
    assert.ok(await ev(`return !!__taxi.store.state.repeat['pair:' + ${JSON.stringify(key)}]`), 'falsche Aufgabe muss in der Wiederholliste landen');
    await clickText('#quiz-card .btn', 'Beenden'); await waitFor('document.querySelector("#app").dataset.mode === "normal"');
  });

  await step('Fahrmodus: Auto faehrt auf der Strecke, Karte folgt und dreht sich, Navi-Balken, Frage waehrend der Fahrt', async () => {
    await click('.nav-btn[data-view="fahren"]'); await shot('22-fahren-menue');
    await click('#drv-start-b'); await waitFor('__taxi.drive.isActive()', 8000);
    assert.equal(await ev(`return document.querySelector('#app').dataset.mode`), 'drive');
    assert.equal(await ev(`return getComputedStyle(document.querySelector('#nav')).display`), 'none');
    await sleep(1500); await shot('23-fahren-start');
    const t0 = await ev(`const d = __taxi.drive.state(); return {s: d.s, playing: d.playing, hud: document.querySelector('#turn-text').textContent, street: document.querySelector('#street-now').textContent}`);
    assert.equal(t0.s, 0); assert.equal(t0.playing, false); assert.ok(t0.hud.length > 3 && t0.street.length > 3, JSON.stringify(t0));
    await ev(`const i = document.querySelector('#drv-speed'); i.value = 6; i.dispatchEvent(new Event('input'))`);
    await click('#drv-play');
    const probe = () => ev(`const d = __taxi.drive.state(); const c = __taxi.map.getCenter(); let best = 1e9; const R = d.route;
      for (let i = 0; i < R.pts.length; i++) { const dl = (R.pts[i].lat - c.lat) * 111195, dg = (R.pts[i].lng - c.lng) * 75400; best = Math.min(best, Math.hypot(dl, dg)); }
      const car = document.querySelector('#car').getBoundingClientRect(); const m = document.querySelector('#map').getBoundingClientRect();
      return {s: d.s, heading: d.heading, offRoute: best, transform: document.querySelector('#map').style.transform, zoom: __taxi.map.getZoom(),
        carCx: car.x + car.width / 2, mapCx: m.x + m.width / 2, hud: document.querySelector('#turn-text').textContent, dist: document.querySelector('#turn-dist').textContent,
        street: document.querySelector('#street-now').textContent, info: document.querySelector('#drive-info').textContent}`);
    await sleep(1500); const a = await probe(); await shot('24-fahren-unterwegs-1');
    await sleep(2500); const b = await probe(); await shot('25-fahren-unterwegs-2');
    assert.ok(a.s > 100, 'Auto bewegt sich nicht: ' + a.s); assert.ok(b.s > a.s + 100, `s ${a.s} -> ${b.s}`);
    assert.ok(a.offRoute < 40 && b.offRoute < 40, `Kartenmitte nicht auf der Strecke: ${a.offRoute}, ${b.offRoute}`);
    assert.match(b.transform, /^rotate\(-?[\d.]+deg\)$/); assert.ok(Math.abs(a.carCx - a.mapCx) < 2, 'Auto liegt nicht im Drehpunkt der Karte');
    assert.equal(b.zoom, 15, 'bei 6x Zoomstufe 15'); assert.match(b.info, /Rest .* km/);
    // Frage waehrend der Fahrt: Auto haelt an
    await ev(`const i = document.querySelector('#drv-speed'); i.value = 10; i.dispatchEvent(new Event('input'))`);
    await waitFor('!document.querySelector("#drive-q").hidden', 40000);
    const pausedS = await ev(`return __taxi.drive.state().s`); await sleep(700);
    assert.equal(await ev(`return __taxi.drive.state().s`), pausedS, 'Auto muss bei der Frage stehen');
    const q = await ev(`const d = __taxi.drive.state(); const q = d.pending; return {kind: q.kind, answer: q.answer, text: document.querySelector('#drive-q .qtext').textContent, n: document.querySelectorAll('#drive-q .opt').length}`);
    assert.ok(q.n >= 3); assert.ok(q.text.length > 15);
    await shot('26-fahren-frage');
    await click(`#drive-q .opt[data-id="${q.answer}"]`);
    assert.match(await ev(`return document.querySelector('#drive-q .qfb').textContent`), /Richtig/);
    await clickText('#drive-q .btn', 'Weiter fahren');
    await waitFor('__taxi.drive.state().playing && !__taxi.drive.state().pending');
    // Falsche Antwort bei einer Abbiegefrage landet in der Wiederholliste
    await waitFor('!document.querySelector("#drive-q").hidden', 40000);
    const q2 = await ev(`const q = __taxi.drive.state().pending; return {kind: q.kind, key: q.key, answer: q.answer}`);
    const wrongId = await ev(`return [...document.querySelectorAll('#drive-q .opt')].find(b => b.dataset.id !== ${JSON.stringify(String(q2.answer))}).dataset.id`);
    await click(`#drive-q .opt[data-id="${wrongId}"]`);
    assert.match(await ev(`return document.querySelector('#drive-q .qfb').textContent`), /Falsch/);
    if (q2.kind === 'turn') assert.ok(await ev(`return !!__taxi.store.state.repeat[${JSON.stringify(q2.key)}]`), 'Fehler gehoert in die Wiederholliste');
    else assert.equal(await ev(`return __taxi.store.state.progress[${JSON.stringify(q2.answer)}].box`), 0);
    await shot('27-fahren-falsch');
    await clickText('#drive-q .btn', 'Weiter fahren');
    // Pause, Zurueck, Vor
    await click('#drv-play'); assert.equal(await ev(`return __taxi.drive.state().playing`), false);
    const s1 = await ev(`return __taxi.drive.state().s`); await click('#drv-back'); const s2 = await ev(`return __taxi.drive.state().s`); assert.ok(s2 < s1 - 400 || s2 === 0);
    await click('#drv-fwd'); assert.ok((await ev(`return __taxi.drive.state().s`)) > s2);
  });

  await step('Fahrmodus im Querformat (915x412) und Beenden', async () => {
    await send('Emulation.setDeviceMetricsOverride', { width: 915, height: 412, deviceScaleFactor: 2, mobile: true, screenWidth: 915, screenHeight: 412 });
    await sleep(800); await ev(`window.dispatchEvent(new Event('resize'))`); await sleep(500);
    await ev(`const d = __taxi.drive.state(); if (d.pending) { d.pending.done = true; d.pending = null; document.querySelector('#drive-q').hidden = true; }`);
    await click('#drv-play'); await sleep(1500);
    const r = await ev(`const car = document.querySelector('#car').getBoundingClientRect(); const hud = document.querySelector('#drive-hud').getBoundingClientRect(); const bot = document.querySelector('#drive-bottom').getBoundingClientRect();
      return {carX: car.x + car.width / 2, carY: car.y + car.height / 2, hudH: hud.height, botTop: bot.top, botLeft: bot.left, vw: innerWidth, vh: innerHeight}`);
    assert.ok(r.vw === 915 && r.vh === 412); assert.ok(r.carY > r.hudH && r.carY < r.vh, 'Auto sichtbar'); assert.ok(r.carX < r.botLeft, 'Auto nicht unter der Steuerung');
    await shot('28-fahren-querformat');
    await send('Emulation.setDeviceMetricsOverride', { width: 412, height: 915, deviceScaleFactor: 2, mobile: true, screenWidth: 412, screenHeight: 915 });
    await sleep(500); await click('#drv-end'); await waitFor('document.querySelector("#app").dataset.mode === "normal"');
    assert.equal(await ev(`return __taxi.drive.isActive()`), false);
    assert.equal(await ev(`return document.querySelector('#map').style.transform`), '');
    await sleep(500); assert.equal(await ev(`return document.querySelectorAll('.pin').length`), 34);
    await shot('29-nach-fahrt');
  });

  await step('Offline: App startet ohne Netz aus dem Cache (Karte, Pins, Orte, Routen)', async () => {
    await send('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 });
    await send('Page.reload'); await waitFor('window.__taxi && document.querySelectorAll(".pin").length === 34', 10000);
    assert.equal(await ev(`return document.querySelectorAll('.pin').length`), 34);
    await ev(`Object.defineProperty(navigator, 'onLine', {value: false, configurable: true}); window.dispatchEvent(new Event('offline'))`);
    assert.equal(await ev(`return document.querySelector('#offline').hidden`), false, 'Offline-Hinweis');
    await ev(`document.querySelector('#btn-route-b').click()`); await sleep(800);
    assert.equal(await ev(`return document.querySelectorAll('#map path.leaflet-interactive[stroke-width="5"]').length`), 1, 'Route B offline');
    const pr = await ev(`return (await (await fetch('data/pairs.json?v=1')).json()).pairs['horgen|paradeplatz'].d`); assert.ok(pr > 5000);
    await shot('30-offline');
    await send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  });

  await step('Keine JavaScript-Fehler in der Konsole', async () => { assert.deepEqual(errors, []); });

  const failed = results.filter((r) => r[0] === 'FAIL');
  console.log(`\n${results.length - failed.length}/${results.length} Schritte bestanden. Screenshots: ${SHOTS}`);
  fs.writeFileSync(path.join(SHOTS, 'ergebnis.txt'), results.map((r) => r.join(' ')).join('\n') + '\n');
  cleanup(); process.exit(failed.length ? 1 : 0);
}
main().catch((e) => { console.error(e); cleanup(); process.exit(1); });
