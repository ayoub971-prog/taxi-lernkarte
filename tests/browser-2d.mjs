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
    assert.equal(r.ta, 'none'); assert.equal(r.us, 'none'); assert.ok(r.sw <= r.iw + 1 && Math.abs(r.app - r.ih) < 2); assert.ok(r.v > 3, 'faehrt nicht');
    await shot(`28-layout-2d-${name}`, 600);
    fps.push([`Spielmodus 2D ${w}x${h} DPR2 (Software-Rendering)`, await measureFps(), (await ev(`return __taxi.game.perf().avgMs`)).toFixed(2)]);
    await touch('touchEnd', []); await ev(`__taxi.game.stop(true)`);
  });
}

await step('Keine JavaScript-Fehler in der Konsole', async () => { assert.deepEqual(b.errors, [], b.errors.join('\n')); });
console.log('\nBildrate (Software-Rendering, nur Vergleichswert):'); fps.forEach((r) => console.log(' ', r.join(' | ')));
process.exit(b.finish(path.join(SHOTS, 'ergebnis-2d.txt')) ? 1 : 0);
