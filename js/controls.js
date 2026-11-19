// Eingabe fuer den Spielmodus: Bildschirm-Knoepfe (mehrere Finger gleichzeitig), Tastatur, Bluetooth-Gamepad.
// read() liefert jederzeit { gas 0..1, brake 0..1, steer -1|0|1 }. Einmalige Tasten (Pause, Wenden, Hinweis) kommen als Rueckrufe.
//
// Gamepad (Standard-Belegung wie Xbox/PS): Gas = RT oder A · Bremse/Rueckwaerts = LT oder B · Lenken = linker Stick oder Steuerkreuz
//                                          Wenden = Y · Hinweis = X · Pause = Start · Uebersicht = Auswahl (Select)
// Tastatur: Pfeil hoch/W = Gas · Pfeil runter/S/Leertaste = Bremse · Pfeil links/rechts oder A/D = Lenken · U = Wenden · H = Hinweis · M = Uebersichtskarte · Esc/P = Pause
export function createControls({ root, haptics = () => true, onPause, onUturn, onHint, onMap }) {
  const names = ['left', 'right', 'gas', 'brake'];
  const touch = { left: new Set(), right: new Set(), gas: new Set(), brake: new Set() };
  const keys = new Set();
  const btn = Object.fromEntries(names.map((n) => [n, root.querySelector(`[data-pad="${n}"]`)]));
  const buzz = (ms) => { if (haptics()) { try { navigator.vibrate?.(ms); } catch { /* optional */ } } };
  const mark = (n) => btn[n]?.classList.toggle('down', touch[n].size > 0);
  const listeners = [];
  const on = (t, ev, fn, opt) => { t.addEventListener(ev, fn, opt); listeners.push([t, ev, fn, opt]); };

  for (const n of names) {
    const b = btn[n]; if (!b) continue;
    on(b, 'pointerdown', (e) => { e.preventDefault(); try { b.setPointerCapture(e.pointerId); } catch { /* */ } touch[n].add(e.pointerId); mark(n); buzz(12); });
    const up = (e) => { touch[n].delete(e.pointerId); mark(n); };
    on(b, 'pointerup', up); on(b, 'pointercancel', up); on(b, 'lostpointercapture', up);
    on(b, 'contextmenu', (e) => e.preventDefault());
  }
  for (const [sel, fn] of [['[data-pad="uturn"]', () => onUturn?.()], ['[data-pad="hint"]', () => onHint?.()], ['[data-pad="pause"]', () => onPause?.()], ['[data-pad="map"]', () => onMap?.()]]) {
    const b = root.querySelector(sel) || document.querySelector(sel); if (b) on(b, 'click', fn);   // Pause/Karte liegen oben im HUD
  }
  const keyMap = { ArrowUp: 'gas', w: 'gas', W: 'gas', ArrowDown: 'brake', s: 'brake', S: 'brake', ' ': 'brake', ArrowLeft: 'left', a: 'left', A: 'left', ArrowRight: 'right', d: 'right', D: 'right' };
  on(window, 'keydown', (e) => {
    if (e.target && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
    if (keyMap[e.key]) { keys.add(keyMap[e.key]); e.preventDefault(); }
    else if (e.key === 'u' || e.key === 'U') onUturn?.();
    else if (e.key === 'h' || e.key === 'H') onHint?.();
    else if (e.key === 'm' || e.key === 'M') onMap?.();
    else if (e.key === 'Escape' || e.key === 'p' || e.key === 'P') onPause?.();
  });
  on(window, 'keyup', (e) => { if (keyMap[e.key]) keys.delete(keyMap[e.key]); });
  on(window, 'blur', () => { keys.clear(); for (const n of names) { touch[n].clear(); mark(n); } });

  const gpPrev = {};
  function pad() {
    let gp = null;
    try { gp = [...(navigator.getGamepads?.() || [])].find((g) => g && g.connected); } catch { /* */ }
    if (!gp) return null;
    const b = (i) => gp.buttons[i]?.value ?? 0, p = (i) => !!gp.buttons[i]?.pressed;
    const edge = (name, now, fn) => { if (now && !gpPrev[name]) fn?.(); gpPrev[name] = now; };
    edge('pause', p(9), onPause); edge('map', p(8), onMap); edge('hint', p(2), onHint); edge('uturn', p(3), onUturn);
    const ax = gp.axes[0] || 0;
    const steer = p(14) || ax < -0.4 ? -1 : p(15) || ax > 0.4 ? 1 : 0;
    return { gas: Math.max(b(7), p(0) ? 1 : 0, p(5) ? 1 : 0), brake: Math.max(b(6), p(1) ? 1 : 0), steer, name: gp.id };
  }

  /** Aktuelle Eingabe. Gegenlenken/Gegenschub (links+rechts, Gas+Bremse) hebt sich auf bzw. Bremse gewinnt. */
  function read() {
    const g = pad();
    const down = (n) => touch[n].size > 0 || keys.has(n);
    let steer = (down('right') ? 1 : 0) - (down('left') ? 1 : 0);
    let gas = down('gas') ? 1 : 0, brake = down('brake') ? 1 : 0;
    if (g) { gas = Math.max(gas, g.gas); brake = Math.max(brake, g.brake); if (!steer) steer = g.steer; }
    if (brake > 0.05) gas = 0;
    return { gas, brake, steer, gamepad: g?.name || '' };
  }
  function destroy() { for (const [t, ev, fn, opt] of listeners) t.removeEventListener(ev, fn, opt); listeners.length = 0; keys.clear(); for (const n of names) { touch[n].clear(); mark(n); } }
  /** Fuer Tests: Knopf programmatisch druecken/loslassen. */
  const hold = (n, v = true, id = 999) => { if (v) touch[n].add(id); else touch[n].delete(id); mark(n); };
  return { read, destroy, hold, buzz };
}
