// Gemeinsame Helfer fuer Browser-Tests mit echtem (headless) Chrome ueber das DevTools-Protokoll.
// Startet einen kleinen Webserver (python3) und Chrome mit Software-WebGL (SwiftShader), damit auch 3D getestet werden kann.
import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';

export const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function launch({ port, dbg, shots, width = 412, height = 915 }) {
  fs.mkdirSync(shots, { recursive: true });
  const chromeBin = ['google-chrome', 'chromium', 'chromium-browser'].find((c) => { try { execFileSync('which', [c], { stdio: 'ignore' }); return true; } catch { return false; } });
  if (!chromeBin) { console.log('SKIP: kein Chrome gefunden'); process.exit(0); }
  const server = spawn('python3', ['-m', 'http.server', String(port), '--bind', '127.0.0.1'], { cwd: ROOT, stdio: 'ignore' });
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'taxi-chrome-'));
  const chrome = spawn(chromeBin, ['--headless=new', `--remote-debugging-port=${dbg}`, `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check', '--no-sandbox',
    '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl', 'about:blank'], { stdio: 'ignore' });
  const cleanup = () => { try { chrome.kill('SIGKILL'); } catch { /* */ } try { server.kill(); } catch { /* */ } };
  process.on('exit', cleanup);
  for (let i = 0; i < 60; i++) { try { await (await fetch(`http://127.0.0.1:${dbg}/json/version`)).json(); break; } catch { await sleep(200); } }
  for (let i = 0; i < 60; i++) { try { await fetch(`http://127.0.0.1:${port}/`); break; } catch { await sleep(200); } }
  const target = await (await fetch(`http://127.0.0.1:${dbg}/json/new?about:blank`, { method: 'PUT' })).json();
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener('open', r));
  let msgId = 0; const pending = new Map(); const errors = [];
  const send = (method, params = {}) => { const id = ++msgId; ws.send(JSON.stringify({ id, method, params })); return new Promise((res, rej) => pending.set(id, { res, rej })); };
  ws.addEventListener('message', (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.rej(new Error(m.error.message)) : p.res(m.result); }
    if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errors.push(m.params.args.map((a) => a.value || a.description).join(' '));
    if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error' && !/favicon|tile\.openstreetmap|tiles\.openfreemap|ERR_INTERNET_DISCONNECTED|Failed to load resource/.test((m.params.entry.url || '') + m.params.entry.text)) errors.push(m.params.entry.text + ' ' + (m.params.entry.url || ''));
  });
  await send('Runtime.enable'); await send('Log.enable'); await send('Page.enable'); await send('Network.enable');
  const viewport = (w, h, dpr = 2) => send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: dpr, mobile: true, screenWidth: w, screenHeight: h });
  await viewport(width, height);
  await send('Emulation.setTouchEmulationEnabled', { enabled: true });

  async function ev(expr) {
    const r = await send('Runtime.evaluate', { expression: `(async () => { ${expr} })()`, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error('Seite: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
    return r.result.value;
  }
  async function waitFor(expr, ms = 8000) {
    const t = Date.now();
    while (Date.now() - t < ms) { if (await ev(`return !!(${expr})`)) return; await sleep(100); }
    throw new Error('Timeout: ' + expr);
  }
  async function shot(name, settle = 1200) {
    await sleep(settle);
    const r = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(shots, name + '.png'), Buffer.from(r.data, 'base64'));
  }
  const mouse = (type, x, y) => send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1 });
  async function clickAt(x, y) { await mouse('mouseMoved', x, y); await mouse('mousePressed', x, y); await mouse('mouseReleased', x, y); }
  async function center(sel) {
    const r = await ev(`const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return null; const b = e.getBoundingClientRect(); return {x: b.x + b.width/2, y: b.y + b.height/2, w: b.width, h: b.height}`);
    assert.ok(r, 'Element nicht gefunden: ' + sel); return r;
  }
  async function click(sel) { await ev(`const e = document.querySelector(${JSON.stringify(sel)}); if (e) { const b = e.getBoundingClientRect(); if (b.bottom > innerHeight || b.top < 0) e.scrollIntoView({block: 'center'}); }`); const c = await center(sel); await clickAt(c.x, c.y); }
  /** Echte Touch-Ereignisse. points = [{x,y,id}] (alle aktuell aufliegenden Finger). */
  const touch = (type, points) => send('Input.dispatchTouchEvent', { type, touchPoints: points.map((p) => ({ x: p.x, y: p.y, id: p.id ?? 1 })) });

  const results = [];
  async function step(name, fn) {
    try { await fn(); results.push(['PASS', name]); console.log('PASS', name); }
    catch (e) { results.push(['FAIL', name, e.message]); console.log('FAIL', name, '-', e.message); }
  }
  const finish = (file) => {
    const failed = results.filter((r) => r[0] === 'FAIL').length;
    fs.writeFileSync(file, results.map((r) => r.join(' ')).join('\n') + `\n\n${results.length - failed}/${results.length} Schritte bestanden.\n`);
    console.log(`\n${results.length - failed}/${results.length} Schritte bestanden. Screenshots: ${shots}`);
    cleanup(); return failed;
  };
  return { send, ev, waitFor, shot, click, clickAt, center, touch, viewport, step, results, errors, finish, cleanup, port };
}
