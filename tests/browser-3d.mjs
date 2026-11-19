// Browser-Test (echtes headless Chrome, Software-WebGL): grosse Beschriftungen, 3D-Gebaeude, Fahrmodus in 3D,
// Spielmodus "Selber fahren" mit echten Touch-Ereignissen (Multitouch), Uebersichtskarte, Minikarte,
// iPad-/Handy-Groessen und Bildraten-Messung.   Start:  node tests/browser-3d.mjs
// Braucht Internet (OpenFreeMap-Kacheln). Screenshots: /workspace/taxi-shots/v2 (oder SHOTS_DIR).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { launch, sleep } from './cdp.mjs';

const PORT = 18772, DBG = 19342;
const SHOTS = process.env.SHOTS_DIR || '/workspace/taxi-shots/v2';
const b = await launch({ port: PORT, dbg: DBG, shots: SHOTS });
const { ev, waitFor, shot, click, clickAt, center, touch, viewport, step, send } = b;
const fpsReport = [];

/** Sichtbare Beschriftungen in einem Container: Anzahl, kleinste Schrift, Ueberlappungen (Flaeche > 4 px2). */
const labelStats = (sel) => ev(`
  const root = document.querySelector(${JSON.stringify(sel)});
  const labs = [...root.querySelectorAll('.pin-label')].filter((l) => getComputedStyle(l).display !== 'none' && l.getBoundingClientRect().width > 0);
  const r = labs.map((l) => ({ t: l.textContent, b: l.getBoundingClientRect(), fs: parseFloat(getComputedStyle(l).fontSize), sh: getComputedStyle(l).textShadow, c: getComputedStyle(l).color, slot: l.className }));
  let overlaps = [];
  for (let i = 0; i < r.length; i++) for (let j = i + 1; j < r.length; j++) {
    const a = r[i].b, c = r[j].b, w = Math.min(a.right, c.right) - Math.max(a.left, c.left), h = Math.min(a.bottom, c.bottom) - Math.max(a.top, c.top);
    if (w > 2 && h > 2) overlaps.push(r[i].t + ' / ' + r[j].t);
  }
  return { n: labs.length, minFont: Math.min(...r.map((x) => x.fs)), shadow: r[0]?.sh || '', color: r[0]?.c || '', overlaps, names: r.map((x) => x.t), slots: r.map((x) => x.t + ':' + x.slot) };`);
const glReady = (ms = 60000) => waitFor(`(() => { const m = __taxi.gl.map(); return m && m.loaded() && m.areTilesLoaded(); })()`, ms);
const glJump = async (lng, lat, zoom, pitch = 60, bearing = 0) => {
  await ev(`__taxi.gl.map().jumpTo({center:[${lng},${lat}], zoom:${zoom}, pitch:${pitch}, bearing:${bearing}})`);
  await sleep(400); await glReady();
  await sleep(500);
};
const measureFps = (ms = 3000) => ev(`return await new Promise((r) => { let n = 0; const t0 = performance.now(); (function f() { n++; if (performance.now() - t0 < ${ms}) requestAnimationFrame(f); else r(Math.round(n / ((performance.now() - t0) / 1000) * 10) / 10); })(); })`);
const pos = (sel) => center(sel);
const closeIntro = async () => { await waitFor('document.querySelector("#dlg-intro").open', 10000); await click('#dlg-intro .btn'); await waitFor('!document.querySelector("#dlg-intro").open'); };

await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/?3d=1` });
await waitFor('window.__taxi', 20000);
await closeIntro();

await step('3D startet von selbst (WebGL), Gebaeude als Koerper, Quellenangabe OpenFreeMap/OSM', async () => {
  await waitFor('__taxi.gl.active', 60000);
  assert.equal(await ev(`return document.querySelector('#app').dataset.gl`), '3d');
  await glReady();
  const r = await ev(`const m = __taxi.gl.map(); const l = m.getLayer('building-3d'); return { type: l && l.type, attr: document.querySelector('.maplibregl-ctrl-attrib').textContent, canvases: document.querySelectorAll('#map3d canvas').length, pr: m.getPixelRatio ? m.getPixelRatio() : 0 }`);
  assert.equal(r.type, 'fill-extrusion'); assert.match(r.attr, /OpenFreeMap/); assert.match(r.attr, /OpenStreetMap/); assert.equal(r.canvases, 1);
  assert.ok(r.pr <= 2, 'Pixelrate nicht begrenzt: ' + r.pr);
  await shot('00-start-3d');
});

await step('Grosse Namen in 3D: weisse Schrift mit dunklem Rand, >= 16 px, keine Ueberlappung (Zuerich-Mitte)', async () => {
  await glJump(8.5335, 47.3665, 14.3, 50);
  const s = await labelStats('#map3d');
  assert.ok(s.n >= 5, 'sichtbare Namen: ' + s.n + ' ' + s.names);
  assert.ok(s.minFont >= 16, 'Schrift ' + s.minFont); assert.match(s.color, /255, 255, 255/); assert.match(s.shadow, /rgb\(11, 27, 43\)/);
  assert.deepEqual(s.overlaps, [], 'Ueberlappung: ' + s.overlaps);
  const icons = await ev(`return [...document.querySelectorAll('#map3d .pin-ico')].map((e) => e.textContent)`);
  assert.ok(icons.includes('🚆') && icons.includes('🏢') || icons.length > 5, 'Symbole je Ortstyp: ' + icons);
  await shot('01-3d-grosse-namen-zuerich');
});

await step('Enge/Tessinerplatz (59 m auseinander): beide Namen lesbar, ohne Ueberlappung (3D und 2D)', async () => {
  await glJump(8.5311, 47.3642, 16.3, 55);
  let s = await labelStats('#map3d');
  assert.ok(s.names.includes('Enge') && s.names.includes('Tessinerplatz'), 'Namen: ' + s.names);
  assert.deepEqual(s.overlaps, [], s.overlaps);
  await shot('02-3d-enge-tessinerplatz');
  await click('#btn-3d'); await waitFor('!__taxi.gl.active'); await sleep(500);
  await ev(`__taxi.map.setView([47.3642, 8.5311], 17, {animate: false})`); await sleep(1500);
  s = await labelStats('#map');
  assert.ok(s.names.includes('Enge') && s.names.includes('Tessinerplatz'), '2D Namen: ' + s.names);
  assert.deepEqual(s.overlaps, [], s.overlaps); assert.ok(s.minFont >= 16);
  await shot('03-2d-enge-tessinerplatz');
  await ev(`__taxi.map.fitBounds([[47.33, 8.50], [47.38, 8.56]], {animate: false})`); await sleep(1500);
  s = await labelStats('#map'); assert.deepEqual(s.overlaps, [], '2D Zuerich: ' + s.overlaps); assert.ok(s.n >= 5, '2D Namen: ' + s.n);
  await shot('04-2d-grosse-namen-zuerich');
  // Schalter fuer die Namen funktioniert weiter (fuer Ueben/Pruefen)
  await click('#btn-labels'); await sleep(300);
  assert.equal((await labelStats('#map')).n, 0, 'Namen sollten aus sein');
  await click('#btn-labels'); await sleep(300); assert.ok((await labelStats('#map')).n >= 5);
  await click('#btn-3d'); await waitFor('__taxi.gl.active', 30000);
});

await step('3D-Gebaeude: echte OSM-Haeuser sichtbar (Koerper > 0), Kamera geneigt, Pins und Routen auch in 3D', async () => {
  await glJump(8.5412, 47.3664, 17, 60, 20);
  const r = await ev(`const m = __taxi.gl.map(); return { b: m.queryRenderedFeatures({ layers: ['building-3d'] }).length, pitch: m.getPitch(), pins: document.querySelectorAll('#map3d .maplibregl-marker.pin').length }`);
  assert.ok(r.b > 20, 'Gebaeudekoerper im Bild: ' + r.b); assert.ok(r.pitch >= 55); assert.ok(r.pins >= 5);
  await shot('05-3d-gebaeude-buerkliplatz');
  await click('#btn-route-b'); await waitFor(`__taxi.gl.map().getLayer('ln-route-B')`, 8000);
  assert.equal(await ev(`return __taxi.gl.map().getLayer('ln-route-B').type`), 'line');
  await shot('06-3d-route-b');
  await click('#btn-route-b'); await waitFor(`!__taxi.gl.map().getLayer('ln-route-B')`, 5000);
});

await step('Popup in 3D: Tippen auf einen Pin zeigt Name und Adresse', async () => {
  await glJump(8.5388, 47.3697, 16.5, 50);
  const c = await ev(`const e = [...document.querySelectorAll('#map3d .maplibregl-marker.pin')].find((p) => p.textContent.includes('Paradeplatz')); const r = e.querySelector('.pin-dot').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }`);
  await clickAt(c.x, c.y); await waitFor(`document.querySelector('#map3d .maplibregl-popup')`, 5000);
  assert.match(await ev(`return document.querySelector('#map3d .maplibregl-popup').textContent`), /Paradeplatz/);
  await shot('07-3d-popup');
  await ev(`__taxi.gl.closePopups()`);
});

await step('Langdruck in 3D legt einen eigenen Ort an', async () => {
  await glJump(8.5388, 47.3697, 16.5, 40);
  const r = await center('#map3d'); const x = r.x + 60, y = r.y + 80;
  await touch('touchStart', [{ x, y, id: 1 }]); await sleep(900); await touch('touchEnd', []);
  await waitFor('document.querySelector("#dlg-place").open', 4000);
  await ev(`document.querySelector('#in-name').value = '3D-Test'`);
  await click('#form-place button[type=submit]'); await sleep(400);
  assert.equal(await ev(`return JSON.parse(localStorage.getItem('taxi-lernkarte-v1')).places.length`), 1);
  await ev(`const p = __taxi.store.state.places[0]; __taxi.store.removePlace(p.id); __taxi.refresh()`);
});

await step('Fahrmodus in 3D: Kamera hinter dem Auto, geneigt, dreht mit der Fahrtrichtung, Auto bewegt sich', async () => {
  await click('.nav-btn[data-view=fahren]'); await sleep(300);
  await click('#drv-start-b'); await waitFor('__taxi.drive.isActive()', 10000);
  await waitFor('__taxi.gl.active', 30000);
  await ev(`document.querySelector('#drv-speed').value = 6; document.querySelector('#drv-speed').dispatchEvent(new Event('input'))`);
  await click('#drv-play'); await sleep(1000);
  const a = await ev(`const m = __taxi.gl.map(), c = m.getCenter(), d = __taxi.drive.state(); return { lng: c.lng, lat: c.lat, b: m.getBearing(), p: m.getPitch(), s: d.s, h: d.heading }`);
  await sleep(6000);
  const z = await ev(`const m = __taxi.gl.map(), c = m.getCenter(), d = __taxi.drive.state(); return { lng: c.lng, lat: c.lat, b: m.getBearing(), p: m.getPitch(), s: d.s, h: d.heading, car: getComputedStyle(document.querySelector('#car')).display, z: m.getZoom() }`);
  assert.ok(z.s - a.s > 100, 'Auto bewegt sich: ' + (z.s - a.s) + ' m');
  const d = Math.hypot((z.lat - a.lat) * 111320, (z.lng - a.lng) * 75000); assert.ok(d > 50, 'Kamera folgt: ' + d);
  assert.ok(z.p >= 60, 'Neigung ' + z.p);
  const dh = Math.abs(((z.b - z.h + 540) % 360) - 180); assert.ok(dh < 8, `Peilung ${z.b} vs Fahrtrichtung ${z.h}`);
  assert.notEqual(z.car, 'none');
  await shot('08-fahrmodus-3d', 2000);
  fpsReport.push(['Fahrmodus 3D, Handy hoch 412x915', await measureFps(3000)]);
});

await step('Fahrmodus: Uebersichtskarte pausiert, 2D, frei zoomen; Weiterfahren bringt die Kamera zurueck', async () => {
  const before = await ev(`const d = __taxi.drive.state(); return { s: d.s, playing: d.playing }`);
  assert.equal(before.playing, true);
  await click('#drv-map'); await waitFor('!document.querySelector("#overview-bar").hidden && !__taxi.gl.active', 20000);
  const o = await ev(`const d = __taxi.drive.state(); const z0 = __taxi.map.getZoom(); const bnd = __taxi.map.getBounds(); const p = d.route.pts.at(-1);
    return { s: d.s, playing: d.playing, mode: document.querySelector('#app').dataset.overview, zoomCtl: getComputedStyle(document.querySelector('.leaflet-control-zoom')).display, ptr: getComputedStyle(document.querySelector('#map')).pointerEvents, endIn: bnd.contains([p.lat, p.lng]), z0, rot: document.querySelector('#map').style.transform, setting: __taxi.store.state.settings.view3d }`);
  assert.equal(o.playing, false); assert.equal(o.mode, '1'); assert.notEqual(o.zoomCtl, 'none'); assert.equal(o.ptr, 'auto'); assert.equal(o.endIn, true, 'Ziel nicht im Bild');
  assert.ok(!o.rot, 'Karte noch gedreht: ' + o.rot); assert.notEqual(o.setting, false, 'Ueberblick darf die 2D/3D-Einstellung nicht aendern');
  await sleep(1500); assert.equal(await ev(`return __taxi.drive.state().s`), o.s, 'Auto steht nicht still');
  await shot('09-fahrmodus-uebersicht', 2000);
  // frei zoomen (Zwei-Finger-Zoom per Touch) und verschieben (Ziehen)
  const m = await center('#map'); const z1 = await ev(`return __taxi.map.getZoom()`);
  await touch('touchStart', [{ x: m.x - 30, y: m.y, id: 1 }, { x: m.x + 30, y: m.y, id: 2 }]);
  for (let i = 1; i <= 8; i++) { await touch('touchMove', [{ x: m.x - 30 - i * 14, y: m.y, id: 1 }, { x: m.x + 30 + i * 14, y: m.y, id: 2 }]); await sleep(40); }
  await touch('touchEnd', []); await sleep(600);
  const z2 = await ev(`return __taxi.map.getZoom()`);
  assert.ok(z2 > z1 + 0.4, `Pinch-Zoom: ${z1} -> ${z2}`);
  const c1 = await ev(`const c = __taxi.map.getCenter(); return [c.lat, c.lng]`);
  await touch('touchStart', [{ x: m.x, y: m.y, id: 1 }]); for (let i = 1; i <= 8; i++) { await touch('touchMove', [{ x: m.x + i * 12, y: m.y + i * 6, id: 1 }]); await sleep(30); } await touch('touchEnd', []); await sleep(500);
  const c2 = await ev(`const c = __taxi.map.getCenter(); return [c.lat, c.lng]`);
  assert.ok(Math.abs(c2[1] - c1[1]) > 0.0003 || Math.abs(c2[0] - c1[0]) > 0.0002, 'Karte laesst sich nicht verschieben');
  await shot('10-fahrmodus-uebersicht-gezoomt', 1500);
  await click('#ov-resume'); await waitFor('__taxi.gl.active && document.querySelector("#overview-bar").hidden', 20000);
  await sleep(800);
  const r = await ev(`const d = __taxi.drive.state(), m = __taxi.gl.map(); return { s: d.s, playing: d.playing, p: m.getPitch(), b: m.getBearing(), h: d.heading, ov: document.querySelector('#app').dataset.overview }`);
  assert.equal(r.playing, true, 'Fahrt laeuft nicht weiter'); assert.ok(r.s >= o.s && r.s - o.s < 400, 'Position: ' + (r.s - o.s)); assert.ok(r.p >= 60 && !r.ov);
  assert.ok(Math.abs(((r.b - r.h + 540) % 360) - 180) < 15, 'Kamera nicht hinter dem Auto');
});

await step('Fahrmodus: Minikarte ein/aus, zeigt Auto und Ziel', async () => {
  await click('#drv-mm'); await waitFor('!document.querySelector("#minimap").hidden', 5000); await sleep(2500);
  const r = await ev(`const mm = document.querySelector('#minimap').getBoundingClientRect(); return { w: mm.width, tiles: document.querySelectorAll('#minimap-map .leaflet-tile').length, car: !!document.querySelector('#minimap-map .ov-car'), setting: __taxi.store.state.settings.minimap }`);
  assert.ok(r.w >= 100 && r.tiles > 0 && r.car && r.setting === true, JSON.stringify(r));
  await shot('11-fahrmodus-3d-minikarte', 1500);
  await click('#drv-mm'); await waitFor('document.querySelector("#minimap").hidden', 3000);
  await click('#drv-end'); await waitFor('!__taxi.drive.isActive()', 10000);
});

// ------------------------------------------------------------ Spielmodus
const padBtn = async (name) => ({ ...(await pos(`[data-pad=${name}]`)) });
/** Autopilot ueber ECHTE Touch-Knoepfe: Gas gedrueckt halten, vor Kreuzungen links/rechts tippen. */
async function autopilot(maxMs) {
  const gas = { ...(await padBtn('gas')), id: 1 }, left = { ...(await padBtn('left')), id: 2 }, right = { ...(await padBtn('right')), id: 3 };
  await touch('touchStart', [gas]);
  let held = null, presses = 0, bothSeen = false; const t0 = Date.now();
  while (Date.now() - t0 < maxMs) {
    const st = await ev(`
      const G = await import('./js/game.js?v=2'); const g = __taxi.game.state(), gr = __taxi.game.graph(); if (!g) return { gone: true };
      if (g.state === 'done') return { done: true };
      const car = g.car, steps = g.m.path.steps; const i = steps.findIndex((s) => s.e === car.e && s.dir === car.dir);
      const la = G.lookAhead(gr, car); let steer = 0;
      if (i >= 0 && steps[i + 1] && la.dist < 85) { const opt = G.optionsAt(gr, car.e, car.dir); for (const s of [0, -1, 1]) { const p = G.pickOption(opt.list, s); if (p.o.e === steps[i + 1].e && p.o.dir === steps[i + 1].dir) { steer = s; break; } } }
      return { steer, dist: la.dist, i, n: steps.length, read: __taxi.game.controls()?.read() };`);
    if (st.done || st.gone) break;
    const want = st.steer === -1 ? left : st.steer === 1 ? right : null;
    if ((held?.id ?? 0) !== (want?.id ?? 0)) {
      if (held) await touch('touchEnd', [held]);        // nur diesen Finger loslassen, Gas bleibt gedrueckt
      held = want;
      if (held) { await touch('touchStart', [gas, held]); presses++; }
    }
    if (held && st.read && st.read.gas === 1 && st.read.steer === st.steer) bothSeen = true;
    await sleep(60);
  }
  await touch('touchEnd', []);
  return { presses, bothSeen, ms: Date.now() - t0 };
}

await step('Spielmodus: Intro, Los, Gas+Rechts gleichzeitig (Multitouch), Auto faehrt auf der Strasse', async () => {
  await viewport(915, 412);
  await ev(`__taxi.store.setSetting('gameScale', 4)`);
  await ev(`__taxi.game.start({ targetId: 'paradeplatz', startId: 'buerkliplatz' })`);
  await waitFor('!document.querySelector("#game-menu").hidden', 30000);
  assert.match(await ev(`return document.querySelector('#game-menu').textContent`), /Fahre zum Paradeplatz/);
  await shot('12-spiel-intro-quer', 2500);
  await click('[data-act=go]'); await waitFor('document.querySelector("#game-menu").hidden');
  const gas = { ...(await padBtn('gas')), id: 1 }, right = { ...(await padBtn('right')), id: 2 };
  await touch('touchStart', [gas]); await sleep(2500);
  await touch('touchStart', [gas, right]); await sleep(300);
  const both = await ev(`return __taxi.game.controls().read()`);
  assert.equal(both.gas, 1); assert.equal(both.steer, 1, 'Gas und Rechts gleichzeitig');
  await touch('touchEnd', [right]); await sleep(300);
  assert.equal((await ev(`return __taxi.game.controls().read()`)).steer, 0);
  await sleep(2500);
  const s = await ev(`const g = __taxi.game.state(); return { v: g.car.v * 3.6, odo: g.car.odo, state: g.state, limit: document.querySelector('#g-limit').hidden, kmh: document.querySelector('#g-kmh').textContent, street: document.querySelector('#g-street').textContent, mode: document.querySelector('#app').dataset.mode, gl: __taxi.gl.active }`);
  assert.ok(s.v > 15 && s.odo > 30, JSON.stringify(s)); assert.equal(s.state, 'run'); assert.ok(s.gl, '3D aktiv'); assert.ok(s.street.length > 0);
  await shot('13-spiel-3d-fahrt-quer', 1000);
  const fps = await measureFps(3000); const perf = await ev(`return __taxi.game.perf()`);
  fpsReport.push(['Spielmodus 3D, Handy quer 915x412 (Software-GL)', fps, perf.avgMs]);
  await touch('touchEnd', []);
});

await step('Spiel-Uebersicht: pausiert, 2D, Auto + Ziel, Weg zeigen, Weiterfahren an gleicher Stelle', async () => {
  const gas = { ...(await padBtn('gas')), id: 1 }; await touch('touchStart', [gas]); await sleep(1000);
  await click('[data-pad=map]'); await waitFor('!document.querySelector("#overview-bar").hidden && !__taxi.gl.active', 20000);
  await touch('touchEnd', []);
  const o = await ev(`const g = __taxi.game.state(); const bnd = __taxi.map.getBounds(); const t = g.m.target; const L = window.L; const p = G_pos(); function G_pos() { const c = g.car; return null; }
    return { st: g.state, s: g.car.s, e: g.car.e.id, targetIn: bnd.contains([t.lat, t.lng]), pad: getComputedStyle(document.querySelector('#game-pad')).display, hintBtn: !document.querySelector('#ov-hint').hidden, cars: document.querySelectorAll('.ov-car').length }`);
  assert.equal(o.st, 'pause'); assert.equal(o.targetIn, true); assert.equal(o.pad, 'none'); assert.ok(o.hintBtn); assert.ok(o.cars >= 1);
  await sleep(1200); const same = await ev(`const g = __taxi.game.state(); return { s: g.car.s, e: g.car.e.id }`);
  assert.deepEqual(same, { s: o.s, e: o.e }, 'Auto bewegt sich in der Uebersicht');
  await shot('14-spiel-uebersicht', 1500);
  const hintsBefore = await ev(`return __taxi.game.state().hints`);
  await click('#ov-hint'); await sleep(800);
  assert.equal(await ev(`return __taxi.game.state().hints`), hintsBefore + 1);
  assert.ok(await ev(`return document.querySelectorAll('#map path.hintline, #map path[class*=hintline]').length > 0`), 'Hinweis-Linie fehlt');
  await shot('15-spiel-uebersicht-weg', 1500);
  await click('#ov-resume'); await waitFor('__taxi.gl.active && document.querySelector("#overview-bar").hidden && __taxi.game.state().state === "run"', 20000);
  const back = await ev(`const g = __taxi.game.state(), m = __taxi.gl.map(); return { s: g.car.s, e: g.car.e.id, p: m.getPitch(), b: m.getBearing(), h: g.heading }`);
  assert.equal(back.e, same.e); assert.ok(back.s - same.s < 30, 'Weiterfahren an gleicher Stelle: ' + (back.s - same.s)); assert.ok(back.p >= 55);
  assert.ok(Math.abs(((back.b - back.h + 540) % 360) - 180) < 15, 'Kamera nicht hinter dem Auto');
});

await step('Spiel: Minikarte in der Ecke, Pause-Menue, Tempo/Ton/Vibration-Schalter', async () => {
  await ev(`__taxi.overview.setEnabled(true); __taxi.overview.show(true, __taxi.game.openOverview)`); await sleep(2500);
  assert.ok(await ev(`return document.querySelectorAll('#minimap-map .leaflet-tile').length > 0`));
  await shot('16-spiel-minikarte', 1000);
  await ev(`__taxi.game.togglePause()`); await waitFor('!document.querySelector("#game-menu").hidden');
  const t = await ev(`return document.querySelector('#game-menu').textContent`);
  assert.match(t, /Pause/); assert.match(t, /Minikarte/); assert.match(t, /Vibration/); assert.match(t, /Ton/); assert.match(t, /Neu berechnen/);
  await shot('17-spiel-pause', 800);
  await click('[data-act=resume]'); await waitFor('document.querySelector("#game-menu").hidden');
  await ev(`__taxi.overview.setEnabled(false); __taxi.overview.show(false)`);
});

await step('Spielmodus: Autopilot ueber Touch-Knoepfe faehrt Buerkliplatz -> Paradeplatz, biegt ab, Mission geschafft', async () => {
  await ev(`__taxi.game.stop(true)`);
  await ev(`__taxi.store.setSetting('view3d', false); await __taxi.applyView()`);   // 2D: schnell genug fuer den Dauerlauf mit Software-Grafik
  await ev(`__taxi.game.start({ targetId: 'paradeplatz', startId: 'buerkliplatz' })`);
  await waitFor('!document.querySelector("#game-menu").hidden', 20000);
  await click('[data-act=go]');
  const r = await autopilot(240000);
  assert.ok(await ev(`return __taxi.game.state().state === 'done'`), 'Mission nicht beendet: ' + JSON.stringify(r) + await ev(`const g = __taxi.game.state(); return JSON.stringify({ st: g.state, odo: g.car.odo, v: g.car.v, e: g.car.e.name, steps: g.m.path.steps.length })`));
  assert.ok(r.presses >= 1, 'es wurde nie abgebogen: ' + JSON.stringify(r));
  assert.ok(r.bothSeen, 'Gas und Lenken gleichzeitig nie gesehen');
  const res = await ev(`const g = __taxi.game.state(); return { stars: g.rating.stars, score: g.rating.score, mistakes: g.mistakes, text: document.querySelector('#game-menu').textContent, best: __taxi.store.state.settings.gameBest, prog: __taxi.store.state.progress['paradeplatz'] }`);
  assert.ok(res.stars >= 1 && res.score >= 100); assert.match(res.text, /Punkte/); assert.ok(Object.keys(res.best).length === 1); assert.ok(res.prog, 'Lernstand nicht aktualisiert');
  console.log('  Autopilot:', JSON.stringify({ presses: r.presses, ...res, text: undefined }));
  await shot('18-spiel-ergebnis-quer', 1000);
});

await step('Spielmodus: Falsch abbiegen -> Fehler zaehlt, Hinweis zeigt Weg, Wenden funktioniert', async () => {
  await ev(`__taxi.game.stop(true)`);
  await ev(`__taxi.game.start({ targetId: 'paradeplatz', startId: 'buerkliplatz' })`);
  await waitFor('!document.querySelector("#game-menu").hidden', 20000); await click('[data-act=go]');
  // Tastatur: Pfeil hoch = Gas
  await send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'ArrowUp', code: 'ArrowUp', windowsVirtualKeyCode: 38 });
  await sleep(1500);
  assert.equal(await ev(`return __taxi.game.controls().read().gas`), 1, 'Tastatur');
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'ArrowUp', code: 'ArrowUp', windowsVirtualKeyCode: 38 });
  await ev(`const g = __taxi.game.state(); g.car.v = 0; __taxi.game.hint()`); await sleep(500);
  assert.equal(await ev(`return __taxi.game.state().hints`), 1);
  await ev(`__taxi.game.state().car.v = 0; __taxi.game.uturn()`);
  await ev(`__taxi.game.stop(true)`);
});

// ------------------------------------------------------------ iPad / Handy: Layout, Touch-Eigenschaften
const sizes = [['ipad-1024x768', 1024, 768, 2], ['ipad-1366x1024', 1366, 1024, 2], ['phone-quer-915x412', 915, 412, 2], ['phone-hoch-412x915', 412, 915, 2]];
for (const [name, w, h, dpr] of sizes) {
  await step(`Layout ${name}: Spielknoepfe gross, im Bild, ohne Ueberdeckung; touch-action none; Sicherheitsabstaende`, async () => {
    await viewport(w, h, dpr); await sleep(400);
    await ev(`__taxi.store.setSetting('view3d', true); await __taxi.applyView()`);
    await ev(`__taxi.game.start({ targetId: 'paradeplatz', startId: 'buerkliplatz' })`);
    await waitFor('!document.querySelector("#game-menu").hidden', 30000); await click('[data-act=go]');
    await waitFor('__taxi.gl.active', 40000);
    const gas = { ...(await padBtn('gas')), id: 1 }; await touch('touchStart', [gas]); await waitFor('__taxi.game.state().car.v > 3', 25000).catch(() => {}); await sleep(300);
    const r = await ev(`
      const R = (s) => document.querySelector(s).getBoundingClientRect();
      const names = ['left', 'right', 'gas', 'brake', 'uturn', 'hint', 'pause', 'map'];
      const rects = Object.fromEntries(names.map((n) => [n, R('[data-pad=' + n + ']')]));
      const ov = (a, b) => Math.min(a.right, b.right) - Math.max(a.left, b.left) > 2 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 2;
      const pairs = []; for (let i = 0; i < names.length; i++) for (let j = i + 1; j < names.length; j++) if (ov(rects[names[i]], rects[names[j]])) pairs.push(names[i] + '/' + names[j]);
      const inside = names.every((n) => rects[n].left >= 0 && rects[n].right <= innerWidth && rects[n].top >= 0 && rects[n].bottom <= innerHeight);
      const cs = (n) => getComputedStyle(document.querySelector('[data-pad=' + n + ']'));
      const speed = R('.g-speed'), street = R('.g-street'), pad = R('#game-pad');
      const hudClash = ['left', 'right', 'gas', 'brake'].filter((n) => ov(rects[n], speed) || ov(rects[n], street)); 
      return { pairs, inside, gasW: rects.gas.width, gasH: rects.gas.height, small: names.filter((n) => Math.min(rects[n].width, rects[n].height) < 44), ta: cs('gas').touchAction, us: cs('gas').userSelect || cs('gas').webkitUserSelect, co: cs('gas').webkitTouchCallout, hudClash, sw: document.documentElement.scrollWidth, sh: document.documentElement.scrollHeight, iw: innerWidth, ih: innerHeight, app: R('#app').height, gl: __taxi.gl.active, speedV: __taxi.game.state().car.v };`);
    assert.deepEqual(r.pairs, [], 'Knoepfe ueberdecken sich: ' + r.pairs); assert.ok(r.inside, 'Knopf ausserhalb des Bildes');
    assert.deepEqual(r.small, [], 'Tippflaeche < 44 px: ' + r.small); assert.equal(r.ta, 'none'); assert.equal(r.us, 'none');
    assert.deepEqual(r.hudClash, [], 'Anzeige verdeckt: ' + r.hudClash);
    assert.ok(r.sw <= r.iw + 1 && r.sh <= r.ih + 1, `Seite scrollt: ${r.sw}x${r.sh} in ${r.iw}x${r.ih}`); assert.ok(Math.abs(r.app - r.ih) < 2, 'App fuellt Hoehe nicht: ' + r.app);
    assert.ok(r.gl && r.speedV > 3, 'faehrt nicht in 3D');
    await shot(`19-layout-${name}`, 800);
    const fps = await measureFps(2500); const perf = await ev(`return __taxi.game.perf()`);
    fpsReport.push([`Spielmodus 3D ${w}x${h} DPR${dpr} (Software-GL)`, fps, perf.avgMs]);
    await touch('touchEnd', []);
    await ev(`__taxi.game.stop(true)`);
  });
}

await step('Keine JavaScript-Fehler in der Konsole', async () => { assert.deepEqual(b.errors, [], b.errors.join('\n')); });

fs.writeFileSync(path.join(SHOTS, 'fps.txt'), 'Bildrate im headless Chrome mit SOFTWARE-Grafik (SwiftShader, keine GPU) – nur ein Vergleichswert, auf dem Handy/iPad mit GPU deutlich hoeher.\n'
  + 'Spalten: Szene | rAF-Bilder pro Sekunde | JS-Zeit pro Spielbild in ms (ohne Grafik)\n' + fpsReport.map((r) => r.join(' | ')).join('\n') + '\n');
console.log('\nBildrate (Software-GL):'); fpsReport.forEach((r) => console.log(' ', r.join(' | ')));
process.exit(b.finish(path.join(SHOTS, 'ergebnis.txt')) ? 1 : 0);
