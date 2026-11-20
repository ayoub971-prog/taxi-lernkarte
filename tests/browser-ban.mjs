// Fahrverbot-Markierung und Sperre (Spielmodus), Knopf «Selber steuern» im Fahrmodus, «Selber fahren» oben im Panel.
// Start: node tests/browser-ban.mjs   (Fahrersicht-Teil braucht Internet: OpenFreeMap)    Screenshots: /workspace/taxi-shots/v5
import assert from 'node:assert/strict';
import path from 'node:path';
import { launch, sleep } from './cdp.mjs';

const PORT = 18781, DBG = 19351;
const SHOTS = process.env.SHOTS_DIR || '/workspace/taxi-shots/v5';
const b = await launch({ port: PORT, dbg: DBG, shots: SHOTS });
const { ev, waitFor, shot, click: click0, center, touch, viewport, step, send } = b;
const click = async (sel) => { await ev(`document.querySelector(${JSON.stringify(sel)})?.scrollIntoView({block:'center'})`); await sleep(150); await click0(sel); };
const key = (type, k, code, vk) => send('Input.dispatchKeyEvent', { type, key: k, code, windowsVirtualKeyCode: vk });

await viewport(915, 412, 2);
await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/` });
await waitFor('window.__taxi', 20000);
await waitFor('document.querySelector("#dlg-intro").open', 10000); await click('#dlg-intro .btn'); await waitFor('!document.querySelector("#dlg-intro").open');
await ev(`__taxi.store.setSetting('driverView', false)`);   // zuerst 2D (Norden oben), die Fahrersicht kommt danach

await step('Panel «Fahren»: «Selber fahren» steht ganz oben und ist ohne Scrollen sichtbar', async () => {
  await click('.nav-btn[data-view=fahren]'); await sleep(300);
  const r = await ev(`const cards = [...document.querySelectorAll('#panel-fahren .card')]; return { first: cards[0].querySelector('h2')?.textContent, btn: document.querySelector('#game-start').getBoundingClientRect().top, ih: innerHeight }`);
  assert.match(r.first, /Selber fahren/); assert.ok(r.btn < r.ih, 'Spiel-Start nicht sichtbar: ' + r.btn);
});

await step('Fahrmodus: grosser Knopf «Selber steuern» wechselt zum Spielmodus mit demselben Ziel', async () => {
  await click('#drv-start-b'); await waitFor('__taxi.drive.isActive()', 10000); await sleep(500);
  const r0 = await ev(`const r = document.querySelector('#drv-self').getBoundingClientRect(); return { h: r.height, w: r.width, vis: r.height > 0 }`);
  assert.ok(r0.vis && r0.h >= 44 && r0.w >= 150, JSON.stringify(r0));
  assert.equal(await ev(`return __taxi.restrict.isActive()`), true);
  await click('#drv-self'); await waitFor('__taxi.game.isActive() && !document.querySelector("#game-menu").hidden', 30000);
  const r = await ev(`return { drive: __taxi.drive.isActive(), target: __taxi.game.state().m.target.id }`);
  assert.equal(r.drive, false); assert.equal(r.target, 'buerkliplatz');
  await click('[data-act=go]');
});

// Fall suchen, in dem man in einen verbotenen Weg abbiegen koennte, und das Auto davor stellen
let hit;
await step('Sperre vorbereiten: Kreuzung mit verbotenem Weg gefunden, Auto steht davor', async () => {
  hit = await ev(`const G = await import('/js/game.js?v=5'); const g = __taxi.game.graph(); const blocked = g.blocked; let best = null;
    for (const [node, list] of blocked) for (const o of g.out[node]) for (const steer of [-1, 1]) {
      if (o.dir === -1 && o.e.ow) continue;
      const car = G.newCar(g, o.e.a, 0); car.e = o.e; car.dir = -o.dir; car.s = Math.max(0, o.e.total - 0.2); car.v = 4; car.steerLatch = steer; car.latchAge = 0;
      if (car.dir === -1 && o.e.ow) continue;
      const evs = G.step(g, car, { gas: 1, brake: 0, steer }, 0.1, { scale: 2 }); const ban = evs.find((e) => e.type === 'noentry'); if (!ban || ban.kind === 'einbahn') continue;
      const n = g.nodes[node]; const score = (n.lat > 47.355 ? 10 : 0) + (ban.kind === 'fussgaengerzone' ? 5 : 0) + (o.e.total > 60 ? 2 : 0);
      if (!best || score > best.score) best = { score, edge: o.e.id, dir: -o.dir, steer, node, kind: ban.kind, lat: n.lat, lng: n.lng };
    }
    return best;`);
  assert.ok(hit, 'kein Fall gefunden');
  await ev(`const g = __taxi.game.state(), gr = __taxi.game.graph(); const e = gr.edges[${hit.edge}]; g.car.e = e; g.car.dir = ${hit.dir}; g.car.s = Math.max(0, e.total - 45); g.car.v = 0; g.car.steerLatch = 0; g.car.latchAge = 99; g.violations = 0; g.mistakes = 0;
    window.__vib = []; navigator.vibrate = (p) => { window.__vib.push(p); return true; };`);
  await sleep(1500);
});

await step('2D-Karte: Fahrverbot-Zeichen und rot-weisse Linien rund um das Auto, Zoom-Knoepfe kollidieren nicht', async () => {
  const r = await ev(`return { signs: document.querySelectorAll('.ban-sign').length, red: [...document.querySelectorAll('#map .leaflet-overlay-pane path')].filter((p) => p.getAttribute('stroke') === '#d32f2f').length, dashed: [...document.querySelectorAll('#map .leaflet-overlay-pane path')].filter((p) => p.getAttribute('stroke-dasharray')).length, gl: __taxi.gl.active }`);
  assert.equal(r.gl, false); assert.ok(r.signs >= 1, 'keine Zeichen'); assert.ok(r.red >= 1 && r.dashed >= 1, JSON.stringify(r));
  await ev(`__taxi.zoomctl.reset()`); await shot('01-spiel-fahrverbot-2d-quer', 600);
});

await step('Sperre: Rechts/Links in den verbotenen Weg -> «Fahrverbot» (Text), Vibration, Punktabzug, Auto bleibt auf der Strasse', async () => {
  const gas = { ...(await center('[data-pad=gas]')), id: 1 };
  await touch('touchStart', [gas]);
  const code = hit.steer > 0 ? ['ArrowRight', 'ArrowRight', 39] : ['ArrowLeft', 'ArrowLeft', 37];
  await key('rawKeyDown', code[0], code[1], code[2]);
  await waitFor('__taxi.game.state().violations >= 1', 30000);
  await key('keyUp', code[0], code[1], code[2]); await touch('touchEnd', []); await sleep(600);
  const r = await ev(`const g = __taxi.game.state(); return { v: g.violations, alert: !document.querySelector('#ban-alert').hidden, text: document.querySelector('#ban-alert').textContent, vib: window.__vib.length, onGraph: !!g.car.e && __taxi.game.graph().edges.includes(g.car.e), time: document.querySelector('#g-time').textContent }`);
  assert.equal(r.v, 1); assert.ok(r.alert); assert.match(r.text, /Fahrverbot/); assert.ok(r.vib >= 1, 'keine Vibration'); assert.ok(r.onGraph); assert.match(r.time, /⛔ 1/);
  await shot('02-spiel-fahrverbot-warnung-quer', 200);
  const pts = await ev(`const G = await import('/js/game.js?v=5'); const g = __taxi.game.state(); return { with: G.rate(g.m, { seconds: 100, mistakes: 0, hints: 0, violations: g.violations, speedingS: 0 }).score, without: G.rate(g.m, { seconds: 100, mistakes: 0, hints: 0, violations: 0, speedingS: 0 }).score }`);
  assert.equal(pts.without - pts.with, 100);
});

await step('Fahrersicht (MapLibre): Fahrverbot-Linien aus den Vektorkacheln und Zeichen sichtbar', async () => {
  await ev(`__taxi.game.state().car.v = 0; await __taxi.toggleDriverView()`); await waitFor('__taxi.gl.active', 60000);
  await waitFor(`(() => { const m = __taxi.gl.map(); return m && m.loaded() && m.areTilesLoaded(); })()`, 60000);
  await ev(`__taxi.restrict.update({ lat: ${hit.lat}, lng: ${hit.lng} }, true)`); await sleep(2500);
  const r = await ev(`const m = __taxi.gl.map(); return { red: !!m.getLayer('taxi-ban-red'), dash: !!m.getLayer('taxi-ban-dash'), sym: !!m.getLayer('taxi-gates-sym'), feats: (m.getSource('taxi-gates').serialize().data.features || []).length, rendered: m.queryRenderedFeatures({ layers: ['taxi-ban-red'] }).length, z: m.getZoom() }`);
  assert.ok(r.red && r.dash && r.sym, JSON.stringify(r)); assert.ok(r.feats >= 1, 'keine Zeichen-Daten');
  assert.ok(r.rendered >= 1, 'keine Fahrverbot-Linien im Bild: ' + JSON.stringify(r));
  await shot('03-spiel-fahrverbot-fahrersicht-quer', 800);
  await ev(`__taxi.game.stop(true)`);
});

await step('Fahrmodus: Auto-Navi laeuft weiter, Markierung aktiv und wieder aus nach dem Beenden', async () => {
  await ev(`await __taxi.toggleDriverView()`);
  await click('.nav-btn[data-view=fahren]'); await sleep(300); await click('#drv-start-a'); await waitFor('__taxi.drive.isActive()', 10000);
  assert.equal(await ev(`return __taxi.restrict.isActive()`), true);
  await click('#drv-end'); await waitFor('!__taxi.drive.isActive()', 10000);
  assert.equal(await ev(`return __taxi.restrict.isActive()`), false);
  assert.equal(await ev(`return document.querySelectorAll('.ban-sign').length`), 0);
});

await step('Keine JavaScript-Fehler in der Konsole', async () => { assert.deepEqual(b.errors.filter((e) => !/openfreemap|Failed to load resource/.test(e)), [], b.errors.join('\n')); });
process.exit(b.finish(path.join(SHOTS, 'ergebnis-fahrverbot.txt')) ? 1 : 0);
