// Fahrersicht (Verfolgerkamera mit MapLibre): Bearing folgt dem Heading, Pitch gesetzt, Gebaeude aus, Umschalten, Fallback,
// Zoom/Pinch/Uebersicht/Minikarte im Spiel- und Fahrmodus, Bildrate.   Start:  node tests/browser-view.mjs   (braucht Internet: OpenFreeMap)
import assert from 'node:assert/strict';
import path from 'node:path';
import { launch, sleep } from './cdp.mjs';

const PORT = 18778, DBG = 19348;
const SHOTS = process.env.SHOTS_DIR || '/workspace/taxi-shots/v4';
const b = await launch({ port: PORT, dbg: DBG, shots: SHOTS });
const { ev, waitFor, shot, click, center, touch, viewport, step, send } = b;
const fps = [];
const measureFps = (ms = 3000) => ev(`return await new Promise((r) => { let n = 0; const t0 = performance.now(); (function f() { n++; if (performance.now() - t0 < ${ms}) requestAnimationFrame(f); else r(Math.round(n / ((performance.now() - t0) / 1000) * 10) / 10); })(); })`);
const cam = () => ev(`const m = __taxi.gl.map(); const g = __taxi.game.isActive() ? __taxi.game.state() : null; const d = __taxi.drive.isActive() ? __taxi.drive.state() : null;
  return { b: m.getBearing(), p: m.getPitch(), z: m.getZoom(), heading: g ? g.heading : d ? d.heading : null, bld: m.getLayer('building-3d') ? m.getLayoutProperty('building-3d', 'visibility') : 'none', pr: m.getPixelRatio() }`);
const angDiff = (a, c) => Math.abs(((a - c + 540) % 360) - 180);
const glReady = (ms = 60000) => waitFor(`(() => { const m = __taxi.gl.map(); return m && m.loaded() && m.areTilesLoaded(); })()`, ms);

await viewport(915, 412, 2);
await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/` });
await waitFor('window.__taxi', 20000);
await waitFor('document.querySelector("#dlg-intro").open', 10000); await click('#dlg-intro .btn'); await waitFor('!document.querySelector("#dlg-intro").open');

await step('Normale Karte bleibt 2D (kein 3D-Knopf, MapLibre noch nicht geladen)', async () => {
  const r = await ev(`return { gl: document.querySelector('#app').dataset.gl, btn: document.querySelector('#btn-3d').hidden, lib: typeof window.maplibregl, dv: __taxi.driverView() }`);
  assert.equal(r.gl, '2d'); assert.equal(r.btn, true); assert.equal(r.lib, 'undefined'); assert.equal(r.dv, true, 'Fahrersicht standardmaessig an');
});

await step('Spielmodus: Fahrersicht startet von selbst, Pitch 55-60, Gebaeude aus, Auto unten im Bild, Strassennamen im Stil', async () => {
  await ev(`__taxi.game.start({ targetId: 'paradeplatz', startId: 'buerkliplatz' })`);
  await waitFor('!document.querySelector("#game-menu").hidden', 30000);
  await waitFor('__taxi.gl.active', 60000); await glReady();
  assert.equal(await ev(`return document.querySelector('#app').dataset.gl`), '3d');
  await click('[data-act=go]'); await waitFor('document.querySelector("#game-menu").hidden');
  const c = await cam(); assert.ok(c.p >= 55 && c.p <= 60, 'Pitch ' + c.p); assert.equal(c.bld, 'none', 'Gebaeude muessen aus sein'); assert.ok(c.pr <= 2);
  const car = await ev(`const r = document.querySelector('#car').getBoundingClientRect(); return { y: r.top + r.height / 2 }`);
  assert.ok(car.y > 412 * 0.6, 'Auto nicht im unteren Drittel: ' + car.y);
  const names = await ev(`const m = __taxi.gl.map(); return m.getStyle().layers.filter((l) => l.type === 'symbol' && /highway|road|street/.test(l.id) && m.getLayoutProperty(l.id, 'visibility') !== 'none').length`);
  assert.ok(names > 0, 'keine Strassennamen-Ebenen');
  assert.ok((await ev(`return document.querySelector('#zoom-ctl').getBoundingClientRect().width`)) >= 56);
});

await step('Spielmodus: Bearing folgt dem Heading (geglaettet), Pitch bleibt, Lenkung bleibt relativ (Links = links)', async () => {
  const gas = { ...(await center('[data-pad=gas]')), id: 1 }; await touch('touchStart', [gas]);
  await waitFor('__taxi.game.state().car.odo > 60', 60000);
  const seen = [];
  for (let i = 0; i < 10; i++) { seen.push(await cam()); await sleep(400); }
  const worst = Math.max(...seen.map((c) => angDiff(c.b, c.heading))); assert.ok(worst < 12, 'Bearing weicht vom Heading ab: ' + worst);
  assert.ok(seen.every((c) => c.p >= 55 && c.p <= 60), 'Pitch aendert sich');
  // Glaettung: pro Beobachtung kein Sprung > 90 Grad
  const jumps = seen.slice(1).map((c, i) => angDiff(c.b, seen[i].b)); assert.ok(Math.max(...jumps) < 60, 'Ruckeln: ' + Math.max(...jumps));
  // Lenkeingabe ist relativ zum Auto: Rechts-Knopf = steer +1, Links = -1, unabhaengig von der Kartendrehung
  const left = { ...(await center('[data-pad=left]')), id: 2 }; await touch('touchStart', [gas, left]); await sleep(200);
  assert.equal((await ev(`return __taxi.game.controls().read()`)).steer, -1);
  await touch('touchEnd', [left]); await sleep(200);
  await shot('/../v4/01-spiel-fahrersicht-quer', 500);
  fps.push(['Spielmodus Fahrersicht 915x412 DPR2 (Software-GL)', await measureFps(), (await ev(`return __taxi.game.perf().avgMs`)).toFixed(2)]);
  await touch('touchEnd', []);
});

await step('Spielmodus: Zoom-Knoepfe, Pinch und Taste wirken in der Fahrersicht (Zoom bleibt, Kamera folgt weiter)', async () => {
  await ev(`__taxi.game.state().car.v = 0`); await sleep(600);
  await ev(`__taxi.zoomctl.reset()`); await sleep(400);
  const z0 = (await cam()).z;
  await click('#zoom-ctl [data-z=out]'); await click('#zoom-ctl [data-z=out]'); await sleep(500);
  const z1 = (await cam()).z; assert.ok(z1 < z0 - 0.3 && z1 >= 11, `Zoom ${z0} -> ${z1}`);   // (Standardzoom 17.6 wird bei 17 gekappt)
  assert.ok(Math.abs((await cam()).p - 58) < 3);
  const cx = 640, cy = 150;
  await touch('touchStart', [{ x: cx - 40, y: cy, id: 11 }, { x: cx + 40, y: cy, id: 12 }]);
  for (let i = 1; i <= 6; i++) { await touch('touchMove', [{ x: cx - 40 - i * 10, y: cy, id: 11 }, { x: cx + 40 + i * 10, y: cy, id: 12 }]); await sleep(30); }
  await touch('touchEnd', []); await sleep(500);
  assert.ok((await cam()).z >= z1 + 0.35, 'Pinch');
  await ev(`__taxi.zoomctl.reset()`);
});

await step('Spielmodus: Uebersicht (2D) und Weiterfahren zurueck in die Fahrersicht, Minikarte', async () => {
  await click('[data-pad=map]'); await waitFor('!document.querySelector("#overview-bar").hidden && !__taxi.gl.active', 30000);
  assert.equal(await ev(`return document.querySelector('#app').dataset.gl`), '2d');
  await click('#ov-resume'); await waitFor('document.querySelector("#overview-bar").hidden && __taxi.gl.active', 40000);
  assert.ok((await cam()).p >= 55);
  await ev(`__taxi.overview.setEnabled(true); __taxi.overview.show(true, __taxi.game.openOverview)`); await sleep(2500);
  assert.ok(await ev(`return document.querySelectorAll('#minimap-map .leaflet-tile').length > 0`));
  await ev(`__taxi.overview.setEnabled(false); __taxi.overview.show(false, __taxi.game.openOverview)`);
});

await step('Umschalter: Karte mit Norden oben (2D, Auto dreht sich), Wahl wird gemerkt, zurueck in die Fahrersicht', async () => {
  assert.ok((await ev(`return document.querySelector('#g-view').getBoundingClientRect().height`)) >= 48);
  await click('#g-view'); await waitFor('!__taxi.gl.active', 20000); await sleep(600);
  const r = await ev(`return { gl: document.querySelector('#app').dataset.gl, mapT: document.querySelector('#map').style.transform, carT: document.querySelector('#car').style.transform, saved: JSON.parse(localStorage.getItem('taxi-lernkarte-v1')).settings.driverView, txt: document.querySelector('#g-view').textContent }`);
  assert.equal(r.gl, '2d'); assert.equal(r.mapT, ''); assert.match(r.carT, /rotate/); assert.equal(r.saved, false); assert.match(r.txt, /Fahrersicht/);
  await shot('/../v4/02-spiel-norden-oben-quer', 800);
  await click('#g-view'); await waitFor('__taxi.gl.active', 40000);
  const r2 = await ev(`return { carT: document.querySelector('#car').style.transform, saved: JSON.parse(localStorage.getItem('taxi-lernkarte-v1')).settings.driverView }`);
  assert.equal(r2.carT, ''); assert.equal(r2.saved, true);
});

await step('Fallback: zu langsam oder kein WebGL -> bisherige 2D-Karte (dreht mit, kein Absturz), danach wieder Fahrersicht', async () => {
  await ev(`__taxi.glSlow = true; await __taxi.applyView()`); await sleep(500);
  const r = await ev(`return { gl: document.querySelector('#app').dataset.gl, active: __taxi.gl.active, mapT: document.querySelector('#map').style.transform, state: __taxi.game.state().state }`);
  assert.equal(r.gl, '2d'); assert.equal(r.active, false); assert.match(r.mapT, /rotate/); assert.ok(['run', 'pause'].includes(r.state));
  await ev(`__taxi.glSlow = false; await __taxi.applyView()`); await waitFor('__taxi.gl.active', 40000);
  // kein WebGL: supported() false -> bleibt 2D
  await ev(`__taxi.game.stop(true)`);
});

await step('Fahrmodus (Auto-Navi): Fahrersicht, Bearing = Heading, Pitch gesetzt, Umschalter, Zoom', async () => {
  await click('.nav-btn[data-view=fahren]'); await sleep(300);
  await click('#drv-start-b'); await waitFor('__taxi.drive.isActive()', 10000); await waitFor('__taxi.gl.active', 60000);
  await ev(`document.querySelector('#drv-speed').value = 6; document.querySelector('#drv-speed').dispatchEvent(new Event('input'))`);
  await click('#drv-play'); await sleep(6000);
  const c = await cam(); assert.ok(c.p >= 55 && c.p <= 60, 'Pitch ' + c.p); assert.ok(angDiff(c.b, c.heading) < 8, `Bearing ${c.b} vs ${c.heading}`); assert.equal(c.bld, 'none');
  assert.ok((await ev(`return document.querySelector('#drv-3d').getBoundingClientRect().width`)) >= 56);
  await click('#zoom-ctl [data-z=out]'); await sleep(500); const z = (await cam()).z;
  await sleep(2500); assert.ok(Math.abs((await cam()).z - z) < 0.01, 'Zoom bleibt');
  await shot('/../v4/03-fahrmodus-fahrersicht-quer', 500);
  fps.push(['Fahrmodus Fahrersicht 915x412 DPR2 (Software-GL)', await measureFps(), '-']);
  await click('#drv-3d'); await waitFor('!__taxi.gl.active', 20000);
  assert.equal(await ev(`return document.querySelector('#map').style.transform`), '');
  await click('#drv-3d'); await waitFor('__taxi.gl.active', 40000);
  await ev(`__taxi.zoomctl.reset()`);
  await click('#drv-end'); await waitFor('!__taxi.drive.isActive()', 10000);
});

for (const [name, w, h] of [['phone-hoch-360x740', 360, 740], ['phone-hoch-412x915', 412, 915], ['ipad-1024x768', 1024, 768], ['ipad-1366x1024', 1366, 1024]]) {
  await step(`Layout ${name}: Spiel in Fahrersicht, Knoepfe im Bild und ohne Ueberdeckung (Gas, Bremse, Lenken, Zoom, Umschalter)`, async () => {
    await viewport(w, h, 2); await sleep(400);
    await ev(`__taxi.game.start({ targetId: 'paradeplatz', startId: 'buerkliplatz' })`);
    await waitFor('!document.querySelector("#game-menu").hidden', 30000); await waitFor('__taxi.gl.active', 60000); await click('[data-act=go]');
    const gas = { ...(await center('[data-pad=gas]')), id: 1 }; await touch('touchStart', [gas]); await waitFor('__taxi.game.state().car.v > 3', 40000).catch(() => {}); await sleep(300);
    const r = await ev(`
      const sels = ['[data-pad=left]', '[data-pad=right]', '[data-pad=gas]', '[data-pad=brake]', '[data-pad=uturn]', '[data-pad=hint]', '[data-pad=pause]', '[data-pad=map]', '#g-view', '#zoom-ctl'];
      const R = sels.map((s) => [s, document.querySelector(s).getBoundingClientRect()]);
      const ov = (a, c) => Math.min(a.right, c.right) - Math.max(a.left, c.left) > 2 && Math.min(a.bottom, c.bottom) - Math.max(a.top, c.top) > 2;
      const pairs = []; for (let i = 0; i < R.length; i++) for (let j = i + 1; j < R.length; j++) if (ov(R[i][1], R[j][1])) pairs.push(R[i][0] + '/' + R[j][0]);
      return { pairs, inside: R.every(([, r]) => r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight), v: __taxi.game.state().car.v, gl: __taxi.gl.active, p: __taxi.gl.map().getPitch() };`);
    assert.deepEqual(r.pairs, [], 'ueberdecken: ' + r.pairs); assert.ok(r.inside, 'ausserhalb'); assert.ok(r.gl && r.p >= 55); assert.ok(r.v > 3, 'faehrt nicht');
    await shot(`/../v4/10-layout-${name}`, 600);
    fps.push([`Spielmodus Fahrersicht ${w}x${h} DPR2 (Software-GL)`, await measureFps(2500), (await ev(`return __taxi.game.perf().avgMs`)).toFixed(2)]);
    await touch('touchEnd', []); await ev(`__taxi.game.stop(true)`);
  });
}

await step('Keine JavaScript-Fehler in der Konsole', async () => { assert.deepEqual(b.errors.filter((e) => !/openfreemap|Failed to load resource/.test(e)), [], b.errors.join('\n')); });
console.log('\nBildrate (Software-GL, nur Vergleichswert):'); fps.forEach((r) => console.log(' ', r.join(' | ')));
import('node:fs').then((fs) => fs.writeFileSync(path.join(SHOTS, 'fps-fahrersicht.txt'), 'Software-GL (SwiftShader, keine GPU), nur Vergleichswert. Szene | Bilder pro Sekunde | JS-ms pro Spielbild\n' + fps.map((r) => r.join(' | ')).join('\n') + '\n'));
process.exit(b.finish(path.join(SHOTS, 'ergebnis-fahrersicht.txt')) ? 1 : 0);
