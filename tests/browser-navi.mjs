// Navi-Look (Version 6): Abbiegekarte, Tacho, Restzeit-Leiste, Route, Etiketten, Zentrieren, Satellit, keine Ueberdeckungen.
// Start: node tests/browser-navi.mjs     (Fahrersicht- und Satellit-Teil brauchen Internet: OpenFreeMap, swisstopo)   Screenshots: /workspace/taxi-shots/v6
import assert from 'node:assert/strict';
import path from 'node:path';
import { launch, sleep } from './cdp.mjs';

const PORT = 18782, DBG = 19352;
const SHOTS = process.env.SHOTS_DIR || '/workspace/taxi-shots/v6';
const b = await launch({ port: PORT, dbg: DBG, shots: SHOTS });
const { ev, waitFor, shot, click: click0, viewport, step, send } = b;
const click = async (sel) => { await ev(`document.querySelector(${JSON.stringify(sel)})?.scrollIntoView({block:'center'})`); await sleep(150); await click0(sel); };
const VIEWPORTS = [['360x740', 360, 740], ['915x412', 915, 412], ['412x915', 412, 915], ['1024x768', 1024, 768], ['1366x1024', 1366, 1024]];

await viewport(915, 412, 2);
await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/?gl=0` });   // zuerst 2D (Layout und Satellit in Leaflet); die Fahrersicht kommt danach
await waitFor('window.__taxi', 20000);
await waitFor('document.querySelector("#dlg-intro").open', 10000); await click('#dlg-intro .btn'); await waitFor('!document.querySelector("#dlg-intro").open');

/** Sichtbare Teile eines Modus: keine Ueberdeckung untereinander, alle im Bild. Gibt Probleme als Text zurueck. */
const clashes = (sels) => ev(`const vis = (s) => [...document.querySelectorAll(s)].filter((e) => { const cs = getComputedStyle(e); const r = e.getBoundingClientRect(); return !e.hidden && cs.display !== 'none' && cs.visibility !== 'hidden' && r.width > 2 && r.height > 2; });
  const items = []; for (const s of ${JSON.stringify(sels)}) for (const e of vis(s)) items.push([s, e.getBoundingClientRect()]);
  const bad = []; const W = innerWidth, H = innerHeight;
  for (const [s, r] of items) if (r.left < -1 || r.top < -1 || r.right > W + 1 || r.bottom > H + 1) bad.push('ausserhalb: ' + s + ' ' + [r.left, r.top, r.right, r.bottom].map(Math.round));
  for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) {
    const a = items[i][1], c = items[j][1], w = Math.min(a.right, c.right) - Math.max(a.left, c.left), h = Math.min(a.bottom, c.bottom) - Math.max(a.top, c.top);
    if (w > 3 && h > 3) bad.push('Ueberdeckung: ' + items[i][0] + ' x ' + items[j][0] + ' (' + Math.round(w) + 'x' + Math.round(h) + ')');
  }
  return { n: items.length, bad };`);
const GAME_SELS = ['#game-navi', '.g-meta', '#g-view', '[data-pad=map]', '[data-pad=pause]', '#sat-btn', '#zoom-ctl', '#minimap', '.g-speed', '#game-eta', '.recenter',
  '[data-pad=left]', '[data-pad=right]', '[data-pad=gas]', '[data-pad=brake]', '[data-pad=uturn]', '[data-pad=hint]'];
const DRIVE_SELS = ['#drive-hud', '#drive-meta', '#drv-3d', '#sat-btn', '#drv-map', '#drv-mm', '#zoom-ctl', '#minimap', '#drive-speed', '#drv-self', '#drive-eta', '#drive-controls', '.drive-disc', '#drive-info', '.recenter'];

await step('Spielmodus: Navi-Karte mit Pfeil, Text und «Dann:», Tacho, weisse Leiste mit Restzeit, Route blau-violett', async () => {
  await ev(`__taxi.store.setSetting('driverView', false); __taxi.game.start({ targetId: 'buerkliplatz', startId: 'paradeplatz' })`);
  await waitFor('!document.querySelector("#game-menu").hidden', 30000); await click('[data-act=go]');
  await ev(`__taxi.overview.setEnabled(true); __taxi.overview.show(true, () => {})`);
  await sleep(1200);
  const r = await ev(`const q = (s) => document.querySelector(s); const g = __taxi.game.state();
    return { title: q('#game-navi .nt').textContent, dist: q('#game-navi .nd').textContent, arrow: !!q('#game-navi .na svg'), man: g.nav.res?.maneuvers.length, line: !!g.nav.line, eta: q('#game-eta .eta-min').textContent, sub: q('#game-eta .eta-sub').textContent,
      color: g.nav.line?.options.color, navi: q('#app').dataset.navi, tacho: q('.g-speed').getBoundingClientRect().width, round: getComputedStyle(q('.g-speed')).borderRadius }`);
  assert.ok(r.title.length > 3, 'kein Text'); assert.ok(r.arrow); assert.ok(r.man >= 2, 'Manoever: ' + r.man); assert.ok(r.line); assert.equal(r.color, '#5b3df5');
  assert.match(r.eta, /Min|Std/); assert.match(r.sub, /Ankunft \d\d:\d\d/); assert.equal(r.navi, '1'); assert.ok(r.tacho >= 60); assert.equal(r.round, '50%');
});

for (const [name, w, h] of VIEWPORTS) {
  await step(`Layout Spielmodus ${name}: nichts verdeckt sich, alles im Bild (Navi-Karte, Seitenknoepfe, Zoom, Mini, Tacho, Leiste, Steuerung)`, async () => {
    await viewport(w, h, 2); await sleep(500);
    const r = await clashes(GAME_SELS);
    await shot(`layout-spiel-${name}`, 300);
    assert.ok(r.n >= 14, 'zu wenige Teile: ' + r.n); assert.deepEqual(r.bad, [], r.bad.join('\n'));
  });
}
await ev(`__taxi.game.stop(true)`);

for (const [name, w, h] of VIEWPORTS) {
  await step(`Layout Fahrmodus ${name}: nichts verdeckt sich, alles im Bild`, async () => {
    await viewport(w, h, 2); await sleep(300);
    await ev(`__taxi.drive.stop(true)`); await click('.nav-btn[data-view=fahren]'); await sleep(300);
    await click('#drv-start-b'); await waitFor('__taxi.drive.isActive()', 10000); await sleep(600);
    await ev(`__taxi.overview.setEnabled(true); __taxi.overview.show(true, () => {})`); await sleep(900);
    const r = await clashes(DRIVE_SELS);
    await shot(`layout-fahrmodus-${name}`, 300);
    assert.ok(r.n >= 10, 'zu wenige Teile: ' + r.n); assert.deepEqual(r.bad, [], r.bad.join('\n'));
    await ev(`__taxi.drive.stop(true)`);
  });
}


// ---------------------------------------------------------------- Neuberechnung nach Abweichen
await step('Spielmodus: Weicht man ab, wird die Route neu berechnet (Banner, Restweg, Linie)', async () => {
  await viewport(915, 412, 2); await sleep(300);
  await ev(`__taxi.game.start({ targetId: 'buerkliplatz', startId: 'paradeplatz' })`);
  await waitFor('!document.querySelector("#game-menu").hidden', 30000); await click('[data-act=go]'); await sleep(800);
  const a = await ev(`const g = __taxi.game.state(); return { key: g.nav.key, total: Math.round(g.nav.res.total), title: document.querySelector('#game-navi .nt').textContent, eta: document.querySelector('#game-eta .eta-sub').textContent }`);
  await ev(`const G = await import('/js/game.js?v=6'); const gr = __taxi.game.graph(), g = __taxi.game.state(); const p = __taxi.allPlaces().find((x) => x.id === 'sihlcity'); const n = G.nearestNode(gr, p).node;
    const c = G.newCar(gr, n, 0); Object.assign(g.car, c);`);
  await sleep(900);
  const r = await ev(`const g = __taxi.game.state(); return { key: g.nav.key, total: Math.round(g.nav.res.total), title: document.querySelector('#game-navi .nt').textContent, eta: document.querySelector('#game-eta .eta-sub').textContent, line: !!g.nav.line }`);
  assert.notEqual(r.key, a.key); assert.notEqual(r.total, a.total, 'Restweg gleich geblieben'); assert.ok(r.line); assert.notEqual(r.eta, a.eta);
  // Navi aus: Karte und Route weg, Kompass wieder da
  await ev(`__taxi.store.setSetting('gameNavi', false); document.querySelector('#app').dataset.navi = '0'`); await sleep(500);
  const off = await ev(`const g = __taxi.game.state(); return { card: getComputedStyle(document.querySelector('#game-navi')).display, line: !!g.nav.line, compass: document.querySelector('.g-compass').getBoundingClientRect().width }`);
  assert.equal(off.card, 'none'); assert.equal(off.line, false); assert.ok(off.compass > 20);
  await ev(`__taxi.store.setSetting('gameNavi', true); document.querySelector('#app').dataset.navi = '1'`);
  await ev(`__taxi.game.stop(true)`);
});

// ---------------------------------------------------------------- Satellit in der 2D-Karte
await step('Satellit 2D: Knopf wechselt zu swisstopo SWISSIMAGE, «© swisstopo» sichtbar, OSM-Kacheln weg, Wahl wird gemerkt (auch nach Neuladen)', async () => {
  await viewport(412, 915, 2); await sleep(300);
  await click('.nav-btn[data-view=karte]'); await sleep(300);
  assert.equal(await ev(`return document.querySelector('#app').dataset.sat`), '0');
  await click('#btn-sat');
  await waitFor(`document.querySelectorAll('#map .leaflet-tile-pane img[src*="wmts.geo.admin.ch"]').length > 3`, 20000);
  await sleep(2500);
  const r = await ev(`const imgs = [...document.querySelectorAll('#map .leaflet-tile-pane img')]; const sat = imgs.filter((i) => i.src.includes('wmts.geo.admin.ch/1.0.0/ch.swisstopo.swissimage/default/current/3857/'));
    return { sat: sat.length, ok: sat.filter((i) => i.complete && i.naturalWidth > 0).length, osm: imgs.filter((i) => i.src.includes('tile.openstreetmap.org')).length, has: __taxi.map.hasLayer(__taxi.osmLayer), attr: document.querySelector('.leaflet-control-attribution').textContent, setting: __taxi.store.state.settings.satellite, on: document.querySelector('#app').dataset.sat, pressed: document.querySelector('#btn-sat').getAttribute('aria-pressed') }`);
  assert.ok(r.sat > 3 && r.ok >= r.sat - 2, JSON.stringify(r)); assert.equal(r.osm, 0); assert.equal(r.has, false); assert.match(r.attr, /© swisstopo|swisstopo/); assert.equal(r.setting, true); assert.equal(r.on, '1'); assert.equal(r.pressed, 'true');
  await shot('04-satellit-2d-karte-hoch', 300);
  await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/?gl=0` }); await waitFor('window.__taxi', 20000); await sleep(800);
  assert.equal(await ev(`return document.querySelector('#app').dataset.sat`), '1', 'Wahl nicht gemerkt');
  assert.equal(await ev(`return __taxi.map.hasLayer(__taxi.osmLayer)`), false);
  await waitFor('document.querySelector("#dlg-intro").open', 5000).catch(() => {}); if (await ev(`return document.querySelector("#dlg-intro").open`)) await click('#dlg-intro .btn');
  await click('#btn-sat'); await sleep(300);
  assert.equal(await ev(`return document.querySelector('#app').dataset.sat + __taxi.map.hasLayer(__taxi.osmLayer)`), '0true');
  await click('#btn-sat'); await sleep(200);
  assert.equal(await ev(`return __taxi.store.state.settings.satellite`), true);
});
await step('Satellit im Spielmodus 2D: Knopf in der Seitenleiste, Fahrverbot-Linien bleiben sichtbar', async () => {
  await viewport(915, 412, 2); await sleep(300);
  await ev(`__taxi.store.setSetting('driverView', false); __taxi.game.start({ targetId: 'buerkliplatz', startId: 'paradeplatz' })`);
  await waitFor('!document.querySelector("#game-menu").hidden', 30000); await click('[data-act=go]'); await sleep(1500);
  const r = await ev(`const q = (s) => document.querySelector(s); return { btn: q('#sat-btn').getBoundingClientRect().width, caption: q('#sat-btn small').textContent, sat: __taxi.sat.isOn(), red: [...document.querySelectorAll('#map .leaflet-overlay-pane path')].filter((p) => p.getAttribute('stroke') === '#d32f2f').length }`);
  assert.ok(r.btn >= 56); assert.equal(r.sat, true); assert.match(r.caption, /swisstopo/);
  await shot('05-spiel-satellit-2d-quer', 600);
  await ev(`__taxi.game.stop(true)`);
});

// ---------------------------------------------------------------- Fahrersicht (MapLibre) mit Navi, Satellit, Zentrieren
await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/` }); await waitFor('window.__taxi', 20000); await sleep(600);
if (await ev(`return document.querySelector("#dlg-intro").open`)) await click('#dlg-intro .btn');
const glReady = (ms = 60000) => waitFor(`(() => { const m = __taxi.gl.map(); return m && m.isStyleLoaded() && m.areTilesLoaded(); })()`, ms);
const measureFps = (ms = 3000) => ev(`return await new Promise((r) => { let n = 0; const t0 = performance.now(); (function f() { n++; if (performance.now() - t0 < ${ms}) requestAnimationFrame(f); else r(Math.round(n / ((performance.now() - t0) / 1000) * 10) / 10); })(); })`);
const fps = [];
await step('Fahrersicht: Spiel mit Navi-Karte, Route, Strassennamen-Etiketten; Screenshot quer (Karte)', async () => {
  await viewport(915, 412, 2); await sleep(300);
  await ev(`__taxi.store.setSetting('satellite', false); __taxi.sat.set(false); __taxi.store.setSetting('driverView', true)`);
  await ev(`__taxi.game.start({ targetId: 'buerkliplatz', startId: 'paradeplatz' })`);
  await waitFor('!document.querySelector("#game-menu").hidden', 30000); await waitFor('__taxi.gl.active', 60000); await click('[data-act=go]'); await glReady();
  await sleep(2500); await glReady();
  const r = await ev(`const m = __taxi.gl.map(); const src = m.getSource('taxi-turn-labels'); const q = (s) => document.querySelector(s);
    return { labels: !!m.getLayer('taxi-turn-labels'), nlab: (src.serialize().data.features || []).length, navi: !!m.getSource('ln-navi'), color: m.getPaintProperty('ln-navi', 'line-color'), sat: m.getLayoutProperty('taxi-sat', 'visibility'), ban: !!m.getLayer('taxi-ban-red'), title: q('#game-navi .nt').textContent }`);
  assert.ok(r.labels && r.navi); assert.equal(r.color, '#5b3df5'); assert.equal(r.sat, 'none'); assert.ok(r.ban); assert.ok(r.title.length > 3);
  await shot('01-spiel-navi-fahrersicht-quer', 900);
  fps.push(['Spielmodus Fahrersicht Karte 915x412 DPR2 (Software-GL)', await measureFps(), (await ev(`return __taxi.game.perf().avgMs`)).toFixed(2)]);
});
await step('Fahrersicht + Satellit: swisstopo-Luftbild unter den Strassen, Flaechen aus, Namen und Fahrverbot-Linien sichtbar; Screenshot quer', async () => {
  await click('#sat-btn'); await sleep(500);
  await waitFor(`(() => { const m = __taxi.gl.map(); return m.getLayoutProperty('taxi-sat', 'visibility') === 'visible' && m.areTilesLoaded(); })()`, 60000); await sleep(1500);
  const r = await ev(`const m = __taxi.gl.map(); const L = m.getStyle().layers; const fills = L.filter((l) => l.type === 'fill' && l.id !== 'taxi-sat').map((l) => m.getLayoutProperty(l.id, 'visibility'));
    const idx = (id) => L.findIndex((l) => l.id === id); const firstSym = L.findIndex((l) => l.type === 'symbol');
    return { sat: m.getLayoutProperty('taxi-sat', 'visibility'), tilesUrl: m.getSource('swisstopo').tiles[0], attr: m.getSource('swisstopo').attribution, fillsHidden: fills.every((v) => v === 'none'), nFill: fills.length, satIdx: idx('taxi-sat'), roadIdx: idx('taxi-road-fill'), symIdx: firstSym, banIdx: idx('taxi-ban-red'), roadOp: m.getPaintProperty('taxi-road-fill', 'line-opacity'),
      banVis: m.getLayoutProperty('taxi-ban-red', 'visibility') ?? 'visible', banOp: m.getPaintProperty('taxi-ban-red', 'line-opacity'), banRendered: m.queryRenderedFeatures({ layers: ['taxi-ban-red'] }).length, satRendered: m.isSourceLoaded('swisstopo'),
      btn: document.querySelector('#sat-btn small').textContent, setting: __taxi.store.state.settings.satellite }`);
  assert.match(r.tilesUrl, /wmts\.geo\.admin\.ch\/1\.0\.0\/ch\.swisstopo\.swissimage\/default\/current\/3857\/\{z\}\/\{x\}\/\{y\}\.jpeg/); assert.match(r.attr, /swisstopo/);
  assert.ok(r.nFill > 3 && r.fillsHidden, 'Flaechen muessen aus sein'); assert.ok(r.satIdx >= 0 && r.satIdx < r.roadIdx && r.roadIdx < r.symIdx, JSON.stringify(r)); assert.equal(r.roadOp, 0.5);
  assert.equal(r.banVis, 'visible'); assert.equal(r.banOp, 0.95); assert.ok(r.banRendered >= 1, 'Fahrverbot-Linien muessen sichtbar bleiben'); assert.ok(r.satRendered); assert.match(r.btn, /swisstopo/); assert.equal(r.setting, true);
  await shot('02-spiel-satellit-fahrersicht-quer', 800);
  fps.push(['Spielmodus Fahrersicht Satellit 915x412 DPR2 (Software-GL)', await measureFps(), (await ev(`return __taxi.game.perf().avgMs`)).toFixed(2)]);
});
await step('Zentrieren: Karte verschieben -> Knopf «Zentrieren», Kamera folgt nicht, Auto bleibt an seiner Position; Tipp -> Kamera folgt wieder', async () => {
  await ev(`Object.defineProperty(__taxi, 'glSlow', { get: () => false, set: () => {}, configurable: true })`);   // Software-GL ist langsam: kein Rueckfall auf 2D waehrend des Tests
  const before = await ev(`const c = document.querySelector('#car').getBoundingClientRect(); return { x: c.x, y: c.y, free: __taxi.freeLook, vis: !document.querySelector('#game-bottom .recenter').hidden }`);
  assert.equal(before.free, false); assert.equal(before.vis, false);
  const [x0, y0] = [450, 200];
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: x0, y: y0 }); await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: x0, y: y0, button: 'left', clickCount: 1 });
  for (let i = 1; i <= 16; i++) { await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: x0 + i * 12, y: y0 + i * 8, button: 'left', buttons: 1 }); await sleep(40); }
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: x0 + 192, y: y0 + 128, button: 'left', clickCount: 1 });
  await waitFor('__taxi.freeLook === true', 5000);
  await waitFor(`await (async () => { const G = await import('/js/game.js?v=6'); const g = __taxi.game.state(), m = __taxi.gl.map(), pos = G.carPos(g.car), pp = m.project([pos.lng, pos.lat]), c = document.querySelector('#car'); return Math.abs(parseFloat(c.style.left) - pp.x) < 4 && Math.abs(parseFloat(c.style.top) - pp.y) < 4 && !m.isMoving(); })()`, 15000).catch(() => {});
  const free = await ev(`const G = await import('/js/game.js?v=6'); const g = __taxi.game.state(); const m = __taxi.gl.map(); const pos = G.carPos(g.car), pp = m.project([pos.lng, pos.lat]);
    const car = document.querySelector('#car').getBoundingClientRect(); const rc = document.querySelector('#game-bottom .recenter'); const rr = rc.getBoundingClientRect();
    return { x: car.x, y: car.y, vis: !rc.hidden, w: rr.width, h: rr.height, dx: parseFloat(document.querySelector('#car').style.left) - pp.x, dy: parseFloat(document.querySelector('#car').style.top) - pp.y, off: Math.hypot(m.project([pos.lng, pos.lat]).x - innerWidth * 0.5, 0), glact: __taxi.gl.active, fl: __taxi.freeLook, left: document.querySelector('#car').style.left, top: document.querySelector('#car').style.top, st: g.state, slow: __taxi.glSlow, mode: __taxi.mode };`);
  assert.ok(free.vis && free.w > 100 && free.h >= 44, JSON.stringify(free));
  assert.ok(Math.abs(free.dx) < 4 && Math.abs(free.dy) < 4, 'Auto muss an seiner Geo-Position stehen: ' + JSON.stringify(free));
  assert.ok(Math.abs(free.x - before.x) > 15 || Math.abs(free.y - before.y) > 15, 'Karte muss verschoben sein: ' + JSON.stringify([before, free]));
  const cs = await ev(`const m = __taxi.gl.map(); return [m.getCenter().lng, m.getCenter().lat]`); await sleep(1200);
  const cs2 = await ev(`const m = __taxi.gl.map(); return [m.getCenter().lng, m.getCenter().lat]`); assert.deepEqual(cs, cs2, 'Kamera darf nicht zurueckspringen');
  assert.deepEqual((await clashes(GAME_SELS)).bad, [], 'Zentrieren-Knopf ueberdeckt etwas');
  await shot('06-zentrieren-knopf-quer', 300);
  await click('#game-bottom .recenter'); await sleep(900);
  const back = await ev(`const car = document.querySelector('#car').getBoundingClientRect(); return { x: car.x, y: car.y, free: __taxi.freeLook, vis: !document.querySelector('#game-bottom .recenter').hidden }`);
  assert.equal(back.free, false); assert.equal(back.vis, false); assert.ok(Math.abs(back.x - before.x) < 3 && Math.abs(back.y - before.y) < 3, 'Auto wieder an der Fahr-Position: ' + JSON.stringify([before, back]));
});
await step('Fahrersicht: Fahrmodus (Auto-Navi) mit Navi-Karte und Satellit, Leiste und Tacho', async () => {
  await ev(`__taxi.glSlow = false`);
  await ev(`__taxi.game.stop(true)`); await click('.nav-btn[data-view=fahren]'); await sleep(300);
  await click('#drv-start-b'); await waitFor('__taxi.drive.isActive()', 10000); await waitFor('__taxi.gl.active', 60000); await glReady();
  await ev(`document.querySelector('#drv-speed').value = 6; document.querySelector('#drv-speed').dispatchEvent(new Event('input'))`);
  await click('#drv-play'); await sleep(5000);
  const r = await ev(`const q = (s) => document.querySelector(s); const m = __taxi.gl.map(); return { title: q('#turn-text').textContent, dist: q('#turn-dist').textContent, eta: q('#eta-min').textContent, sub: q('#eta-sub').textContent, kmh: q('#drv-kmh').textContent, sat: m.getLayoutProperty('taxi-sat', 'visibility'), color: m.getPaintProperty('ln-drive', 'line-color'), lab: (m.getSource('taxi-turn-labels').serialize().data.features || []).length }`);
  assert.ok(r.title.length > 3); assert.match(r.eta, /Min|Std/); assert.match(r.sub, /Ankunft/); assert.equal(r.kmh, '50'); assert.equal(r.sat, 'visible'); assert.equal(r.color, '#5b3df5');
  await shot('07-fahrmodus-navi-satellit-quer', 600);
  fps.push(['Fahrmodus Fahrersicht Satellit 915x412 DPR2 (Software-GL)', await measureFps(), '-']);
  await click('#sat-btn'); await sleep(800);
  assert.equal(await ev(`return __taxi.gl.map().getLayoutProperty('taxi-sat', 'visibility')`), 'none'); assert.equal(await ev(`return __taxi.store.state.settings.satellite`), false);
  await click('#drv-end'); await waitFor('!__taxi.drive.isActive()', 10000);
});
console.log('\nBildrate (Software-GL, nur Vergleichswert):'); fps.forEach((r) => console.log(' ', r.join(' | ')));

await step('Keine JavaScript-Fehler in der Konsole', async () => { assert.deepEqual(b.errors.filter((e) => !/openfreemap|Failed to load resource|swisstopo|geo\.admin/.test(e)), [], b.errors.join('\n')); });
process.exit(b.finish(path.join(SHOTS, 'ergebnis-navi.txt')) ? 1 : 0);
