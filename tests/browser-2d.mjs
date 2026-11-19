// Browser-Test fuer die Auslieferung OHNE 3D (Schalter ENABLE_3D = false): grosse Namen, Spielmodus in 2D mit echten
// Touch-Ereignissen, Uebersichtskarte, Minikarte, iPad-/Handy-Layouts.   Start:  node tests/browser-2d.mjs
// Screenshots: /workspace/taxi-shots/v2 (oder SHOTS_DIR).
import assert from 'node:assert/strict';
import path from 'node:path';
import { launch, sleep } from './cdp.mjs';

const PORT = 18774, DBG = 19344;
const SHOTS = process.env.SHOTS_DIR || '/workspace/taxi-shots/v2';
const b = await launch({ port: PORT, dbg: DBG, shots: SHOTS });
const { ev, waitFor, shot, click, center, touch, viewport, step, send } = b;
const padBtn = (n) => center(`[data-pad=${n}]`);
const measureFps = (ms = 2500) => ev(`return await new Promise((r) => { let n = 0; const t0 = performance.now(); (function f() { n++; if (performance.now() - t0 < ${ms}) requestAnimationFrame(f); else r(Math.round(n / ((performance.now() - t0) / 1000) * 10) / 10); })(); })`);
const fps = [];

await viewport(915, 412, 2);
await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/` });
await waitFor('window.__taxi', 20000);
await waitFor('document.querySelector("#dlg-intro").open', 10000); await click('#dlg-intro .btn'); await waitFor('!document.querySelector("#dlg-intro").open');

await step('3D ist aus: 2D-Karte, kein 3D-Knopf, kein MapLibre geladen', async () => {
  const r = await ev(`return { gl: document.querySelector('#app').dataset.gl, btn: document.querySelector('#btn-3d').hidden, active: __taxi.gl.active, lib: typeof window.maplibregl, sup: __taxi.gl.supported() }`);
  assert.equal(r.gl, '2d'); assert.equal(r.btn, true); assert.equal(r.active, false); assert.equal(r.lib, 'undefined'); assert.equal(r.sup, false);
});

await step('Grosse Namen in 2D: weisse Schrift mit dunklem Rand, >= 16 px, keine Ueberlappung (Enge/Tessinerplatz)', async () => {
  await ev(`__taxi.map.setView([47.3636, 8.5262], 16, { animate: false })`); await sleep(1500);
  const r = await ev(`const labs = [...document.querySelectorAll('#map .pin-label')].filter((l) => getComputedStyle(l).display !== 'none' && l.getBoundingClientRect().width > 0);
    const rs = labs.map((l) => ({ t: l.textContent, b: l.getBoundingClientRect(), fs: parseFloat(getComputedStyle(l).fontSize), sh: getComputedStyle(l).textShadow, c: getComputedStyle(l).color }));
    const ov = []; for (let i = 0; i < rs.length; i++) for (let j = i + 1; j < rs.length; j++) { const a = rs[i].b, c = rs[j].b; if (Math.min(a.right, c.right) - Math.max(a.left, c.left) > 2 && Math.min(a.bottom, c.bottom) - Math.max(a.top, c.top) > 2) ov.push(rs[i].t + '/' + rs[j].t); }
    return { names: rs.map((x) => x.t), minFont: Math.min(...rs.map((x) => x.fs)), sh: rs[0]?.sh, c: rs[0]?.c, ov };`);
  assert.ok(r.names.includes('Enge') && r.names.includes('Tessinerplatz'), JSON.stringify(r)); assert.ok(r.minFont >= 16); assert.deepEqual(r.ov, []);
  assert.match(r.c, /255, 255, 255/); assert.match(r.sh, /11, 27, 43/);
  await shot('20-2d-enge-tessinerplatz', 300);
  await ev(`__taxi.map.setView([47.3665, 8.5335], 14, { animate: false })`); await sleep(1500);
  await shot('21-2d-grosse-namen-zuerich', 300);
});

await step('Spielmodus 2D: Intro, Los, Gas + Rechts gleichzeitig (Multitouch), Auto faehrt, Strassenname', async () => {
  await ev(`__taxi.game.start({ targetId: 'paradeplatz', startId: 'buerkliplatz' })`);
  await waitFor('!document.querySelector("#game-menu").hidden', 30000);
  await shot('22-spiel-2d-intro-quer', 1500);
  await click('[data-act=go]'); await waitFor('document.querySelector("#game-menu").hidden');
  const gas = { ...(await padBtn('gas')), id: 1 }, right = { ...(await padBtn('right')), id: 2 };
  await touch('touchStart', [gas]); await waitFor('__taxi.game.state().car.v > 3', 20000);
  await touch('touchStart', [gas, right]); await sleep(300);
  const both = await ev(`return __taxi.game.controls().read()`); assert.equal(both.gas, 1); assert.equal(both.steer, 1);
  await touch('touchEnd', [right]); await sleep(300); assert.equal((await ev(`return __taxi.game.controls().read()`)).steer, 0);
  await waitFor('__taxi.game.state().car.odo > 30', 30000);
  const s = await ev(`const g = __taxi.game.state(); return { v: g.car.v * 3.6, state: g.state, street: document.querySelector('#g-street').textContent, gl: __taxi.gl.active }`);
  assert.equal(s.state, 'run'); assert.ok(s.street.length > 0); assert.equal(s.gl, false);
  await shot('23-spiel-2d-fahrt-quer', 800);
  fps.push(['Spielmodus 2D, Handy quer 915x412 (Software-Rendering)', await measureFps(), (await ev(`return __taxi.game.perf().avgMs`)).toFixed(2)]);
});

await step('Spiel-Uebersicht: pausiert, Auto + Ziel sichtbar, Weg zeigen, Weiterfahren an gleicher Stelle', async () => {
  await click('[data-pad=map]'); await waitFor('!document.querySelector("#overview-bar").hidden', 20000);
  await touch('touchEnd', []);
  const o = await ev(`const g = __taxi.game.state(); const t = g.m.target; return { st: g.state, s: g.car.s, e: g.car.e.id, targetIn: __taxi.map.getBounds().contains([t.lat, t.lng]), pad: getComputedStyle(document.querySelector('#game-pad')).display, cars: document.querySelectorAll('.ov-car').length }`);
  assert.equal(o.st, 'pause'); assert.equal(o.targetIn, true); assert.equal(o.pad, 'none'); assert.ok(o.cars >= 1);
  await sleep(1200); assert.deepEqual(await ev(`const g = __taxi.game.state(); return { s: g.car.s, e: g.car.e.id }`), { s: o.s, e: o.e });
  await shot('24-spiel-2d-uebersicht', 1200);
  const h0 = await ev(`return __taxi.game.state().hints`); await click('#ov-hint'); await sleep(800);
  assert.equal(await ev(`return __taxi.game.state().hints`), h0 + 1);
  await shot('25-spiel-2d-uebersicht-weg', 1200);
  // Zoomen per Karten-API (Pinch ist dieselbe Leaflet-Funktion)
  const z0 = await ev(`return __taxi.map.getZoom()`); await ev(`__taxi.map.setZoom(__taxi.map.getZoom() + 1, { animate: false })`);
  assert.ok((await ev(`return __taxi.map.getZoom()`)) > z0 - 0.01);
  await click('#ov-resume'); await waitFor('document.querySelector("#overview-bar").hidden', 10000);
  const back = await ev(`const g = __taxi.game.state(); return { s: g.car.s, e: g.car.e.id, pad: getComputedStyle(document.querySelector('#game-pad')).display }`);
  assert.equal(back.pad, 'flex'); assert.equal(back.e, o.e);
});

await step('Spiel: Minikarte, Pause-Menue, Tastatur', async () => {
  await ev(`__taxi.overview.setEnabled(true); __taxi.overview.show(true, __taxi.game.openOverview)`);
  await sleep(2500);
  const r = await ev(`const m = document.querySelector('#minimap'); return { hidden: m.hidden, w: m.getBoundingClientRect().width, tiles: document.querySelectorAll('#minimap-map .leaflet-tile').length }`);
  assert.equal(r.hidden, false, JSON.stringify(r)); assert.ok(r.w >= 100 && r.tiles > 0);
  await shot('26-spiel-2d-minikarte', 800);
  await send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }); await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await waitFor('__taxi.game.state().state === "pause"', 5000); await shot('27-spiel-2d-pause', 500);
  await ev(`__taxi.game.stop(true)`);
});


const zrects = () => ev(`const R = (s) => document.querySelector(s).getBoundingClientRect(); const bs = ['in', 'out'].map((k) => R('#zoom-ctl [data-z=' + k + ']'));
  return { w: Math.min(...bs.map((r) => Math.min(r.width, r.height))), box: R('#zoom-ctl') && (({ left, top, right, bottom }) => ({ left, top, right, bottom }))(R('#zoom-ctl')), iw: innerWidth, ih: innerHeight }`);
const clashWith = (sels) => ev(`const z = document.querySelector('#zoom-ctl').getBoundingClientRect();
  return ${JSON.stringify(sels)}.filter((s) => { const e = document.querySelector(s); if (!e) return false; const cs = getComputedStyle(e); if (cs.display === 'none' || e.hidden || cs.visibility === 'hidden') return false; const r = e.getBoundingClientRect(); return r.width > 0 && Math.min(r.right, z.right) - Math.max(r.left, z.left) > 1 && Math.min(r.bottom, z.bottom) - Math.max(r.top, z.top) > 1; })`);
const zoomNow = () => ev(`return __taxi.map.getZoom()`);
const GAME_PARTS = ['#minimap', '[data-pad=left]', '[data-pad=right]', '[data-pad=gas]', '[data-pad=brake]', '[data-pad=uturn]', '[data-pad=hint]', '[data-pad=pause]', '[data-pad=map]', '.g-speed', '.g-street b', '.g-street small', '#g-junction', '.g-mission'];
const DRIVE_PARTS = ['#minimap', '#drive-hud', '#drive-bottom', '#drv-map', '#drv-mm', '#drv-3d', '#car', '#drive-q'];

await step('Zoom im Spielmodus: Plus/Minus, Pinch, Mausrad, Taste; Kamera folgt und behaelt den Zoom; wird gemerkt; Standard-Knopf', async () => {
  await viewport(915, 412, 2); await sleep(300);
  await ev(`localStorage.removeItem('x'); __taxi.zoomctl.reset()`);
  await ev(`__taxi.game.start({ targetId: 'paradeplatz', startId: 'buerkliplatz' })`);
  await waitFor('!document.querySelector("#game-menu").hidden', 30000); await click('[data-act=go]');
  const zr = await zrects(); assert.ok(zr.w >= 56, 'Zoom-Knoepfe zu klein: ' + zr.w);
  assert.deepEqual(await clashWith(GAME_PARTS), [], 'Zoom-Knoepfe ueberdecken');
  assert.equal(await zoomNow(), 18, 'Start-Zoom im Stand');
  await click('#zoom-ctl [data-z=out]'); await click('#zoom-ctl [data-z=out]'); await click('#zoom-ctl [data-z=out]'); await sleep(500);
  assert.equal(await ev(`return __taxi.zoomctl.delta()`), -1.5); assert.equal(await zoomNow(), 16.5);
  assert.equal(await ev(`return !document.querySelector('#zoom-ctl [data-z=reset]').hidden`), true, 'Standard-Knopf fehlt');
  // Kamera folgt weiter (Auto faehrt), Zoom bleibt gewaehlt (Tempo aendert den Standard, Zuschlag bleibt)
  const gas = { ...(await padBtn('gas')), id: 1 }; await touch('touchStart', [gas]); await waitFor('__taxi.game.state().car.odo > 40', 30000);
  const c = await ev(`const g = __taxi.game.state(); return { odo: g.car.odo, d: __taxi.zoomctl.delta(), z: __taxi.map.getZoom(), cx: __taxi.map.getCenter().lat }`);
  assert.equal(c.d, -1.5); assert.ok(c.z <= 17 && c.z >= 14.5, 'Zoom beim Fahren ' + c.z);
  await touch('touchEnd', []); await ev(`__taxi.game.state().car.v = 0`); await sleep(500);
  // Pinch (zwei Finger auseinander) auf freier Kartenflaeche
  const cx = 640, cy = 150;
  await touch('touchStart', [{ x: cx - 40, y: cy, id: 11 }, { x: cx + 40, y: cy, id: 12 }]);
  for (let i = 1; i <= 8; i++) { await touch('touchMove', [{ x: cx - 40 - i * 10, y: cy, id: 11 }, { x: cx + 40 + i * 10, y: cy, id: 12 }]); await sleep(30); }
  await touch('touchEnd', []); await sleep(400);
  const dp = await ev(`return __taxi.zoomctl.delta()`); assert.ok(dp >= -0.25 && dp <= 0.75, 'Pinch-Zuschlag ' + dp);
  const before = await ev(`return __taxi.zoomctl.delta()`);
  await send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: 500, y: 150, deltaX: 0, deltaY: -120 }); await sleep(300);
  assert.ok((await ev(`return __taxi.zoomctl.delta()`)) > before, 'Mausrad');
  const b2 = await ev(`return __taxi.zoomctl.delta()`);
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: '-', code: 'Minus', text: '-' }); await send('Input.dispatchKeyEvent', { type: 'keyUp', key: '-', code: 'Minus' }); await sleep(200);
  assert.ok((await ev(`return __taxi.zoomctl.delta()`)) < b2, 'Taste -');
  for (let i = 0; i < 14; i++) await ev(`__taxi.zoomctl.step(-0.5)`);
  assert.ok((await zoomNow()) >= 12 && (await ev(`return __taxi.zoomctl.delta()`)) === -5, 'Untergrenze'); await sleep(300);
  for (let i = 0; i < 20; i++) await ev(`__taxi.zoomctl.step(0.5)`);
  assert.ok((await zoomNow()) <= 18, 'Obergrenze');
  await click('#zoom-ctl [data-z=out]'); await sleep(200);
  assert.equal(await ev(`return JSON.parse(localStorage.getItem('taxi-lernkarte-v1')).settings.driveZoom`), 1.5, 'nicht gemerkt');
  await shot('/../v3/01-spiel-zoom-knoepfe-quer', 800);
  await click('#zoom-ctl [data-z=reset]'); await sleep(300);
  assert.equal(await ev(`return __taxi.zoomctl.delta()`), 0); assert.equal(await ev(`return document.querySelector('#zoom-ctl [data-z=reset]').hidden`), true);
  await ev(`__taxi.game.stop(true)`);
});

await step('Zoom im Fahrmodus: Knoepfe gross, nicht ueberdeckend (hoch/quer/360 px/iPad), Zoom bleibt waehrend der Fahrt', async () => {
  for (const [w, h] of [[915, 412], [360, 740], [412, 915], [1024, 768], [1366, 1024]]) {
    await viewport(w, h, 2); await sleep(300);
    await click('.nav-btn[data-view=fahren]'); await sleep(300);
    await click('#drv-start-b'); await waitFor('__taxi.drive.isActive()', 10000); await sleep(400);
    const zr = await zrects(); assert.ok(zr.w >= 56, `${w}x${h}: Knoepfe zu klein ${zr.w}`);
    assert.ok(zr.box.left >= 0 && zr.box.right <= zr.iw && zr.box.top >= 0 && zr.box.bottom <= zr.ih, `${w}x${h}: ausserhalb ${JSON.stringify(zr.box)}`);
    assert.deepEqual(await clashWith(DRIVE_PARTS), [], `${w}x${h}: Zoom-Knoepfe ueberdecken Fahr-Anzeige`);
    if (w === 915) {
      await ev(`__taxi.zoomctl.reset()`);
      await ev(`document.querySelector('#drv-speed').value = 6; document.querySelector('#drv-speed').dispatchEvent(new Event('input'))`);
      await click('#zoom-ctl [data-z=out]'); await click('#zoom-ctl [data-z=out]'); await click('#drv-play'); await sleep(500);
      const s0 = await ev(`return __taxi.drive.state().s`); await sleep(3000);
      const r = await ev(`return { s: __taxi.drive.state().s, z: __taxi.map.getZoom(), d: __taxi.zoomctl.delta() }`);
      assert.ok(r.s - s0 > 30, 'Auto faehrt'); assert.equal(r.d, -1); assert.equal(r.z, 14, `Tempo 6x = Standard 15, Zuschlag -1 -> 14, ist ${r.z}`);
      await shot('/../v3/02-fahrmodus-zoom-quer', 600);
      await ev(`__taxi.zoomctl.reset()`);
    }
    await click('#drv-end'); await waitFor('!__taxi.drive.isActive()', 10000);
  }
  await viewport(915, 412, 2);
});

for (const [name, w, h] of [['ipad-1024x768', 1024, 768], ['ipad-1366x1024', 1366, 1024], ['phone-quer-915x412', 915, 412], ['phone-hoch-412x915', 412, 915]]) {
  await step(`Layout ${name}: Knoepfe gross, im Bild, ohne Ueberdeckung; touch-action none`, async () => {
    await viewport(w, h, 2); await sleep(400);
    await ev(`__taxi.game.start({ targetId: 'paradeplatz', startId: 'buerkliplatz' })`);
    await waitFor('!document.querySelector("#game-menu").hidden', 30000); await click('[data-act=go]');
    const gas = { ...(await padBtn('gas')), id: 1 }; await touch('touchStart', [gas]); await waitFor('__taxi.game.state().car.v > 3', 25000).catch(() => {}); await sleep(300);
    const r = await ev(`
      const R = (s) => document.querySelector(s).getBoundingClientRect(); const names = ['left', 'right', 'gas', 'brake', 'uturn', 'hint', 'pause', 'map'];
      const rects = Object.fromEntries(names.map((n) => [n, R('[data-pad=' + n + ']')]));
      const ov = (a, c) => Math.min(a.right, c.right) - Math.max(a.left, c.left) > 2 && Math.min(a.bottom, c.bottom) - Math.max(a.top, c.top) > 2;
      const pairs = []; for (let i = 0; i < names.length; i++) for (let j = i + 1; j < names.length; j++) if (ov(rects[names[i]], rects[names[j]])) pairs.push(names[i] + '/' + names[j]);
      const speed = R('.g-speed'), street = R('.g-street'); const cs = getComputedStyle(document.querySelector('[data-pad=gas]'));
      return { pairs, inside: names.every((n) => rects[n].left >= 0 && rects[n].right <= innerWidth && rects[n].top >= 0 && rects[n].bottom <= innerHeight), small: names.filter((n) => Math.min(rects[n].width, rects[n].height) < 44),
        hud: ['left', 'right', 'gas', 'brake'].filter((n) => ov(rects[n], speed) || ov(rects[n], street)), ta: cs.touchAction, us: cs.userSelect || cs.webkitUserSelect, sw: document.documentElement.scrollWidth, iw: innerWidth, app: R('#app').height, ih: innerHeight, v: __taxi.game.state().car.v };`);
    assert.deepEqual(r.pairs, [], 'ueberdecken: ' + r.pairs); assert.ok(r.inside, 'ausserhalb des Bildes'); assert.deepEqual(r.small, [], '< 44 px'); assert.deepEqual(r.hud, [], 'Anzeige verdeckt');
    assert.deepEqual(await clashWith(GAME_PARTS), [], 'Zoom-Knoepfe ueberdecken'); assert.ok((await zrects()).w >= 56);
    assert.equal(r.ta, 'none'); assert.equal(r.us, 'none'); assert.ok(r.sw <= r.iw + 1 && Math.abs(r.app - r.ih) < 2); assert.ok(r.v > 3, 'faehrt nicht');
    await shot(`28-layout-2d-${name}`, 600);
    fps.push([`Spielmodus 2D ${w}x${h} DPR2 (Software-Rendering)`, await measureFps(), (await ev(`return __taxi.game.perf().avgMs`)).toFixed(2)]);
    await touch('touchEnd', []); await ev(`__taxi.game.stop(true)`);
  });
}

await step('Keine JavaScript-Fehler in der Konsole', async () => { assert.deepEqual(b.errors, [], b.errors.join('\n')); });
console.log('\nBildrate (Software-Rendering, nur Vergleichswert):'); fps.forEach((r) => console.log(' ', r.join(' | ')));
process.exit(b.finish(path.join(SHOTS, 'ergebnis-2d.txt')) ? 1 : 0);
