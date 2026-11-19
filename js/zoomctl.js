// Kartenzoom waehrend der Fahrt (Fahrmodus und Spielmodus): Plus/Minus-Knoepfe, Zwei-Finger-Pinch, Mausrad, Tasten +/-.
// Die Kamera folgt dem Taxi weiter. Der gewaehlte Zoom ist ein Zuschlag (delta) auf den Standardzoom der Fahrt und wird gemerkt.
export const ZMIN = 12, ZMAX = 18, DMIN = -5, DMAX = 2;

export function initZoomCtl(ctx) {
  const { store } = ctx;
  const el = document.querySelector('#zoom-ctl'), stage = document.querySelector('#stage');
  const clampD = (v) => Math.min(DMAX, Math.max(DMIN, Math.round(v * 4) / 4 + 0));
  let delta = clampD(Number(store.state.settings.driveZoom) || 0);
  const listeners = [];
  const active = () => !ctx.forceOverview && !!(ctx.drive?.isActive?.() || ctx.game?.isActive?.());

  /** Zoom fuer diesen Standardwert (Leaflet-Zoom, 2D). */
  /** Zoom fuer MapLibre (Zoom = Leaflet-Zoom - 1). */
  const zoomGl = (base) => Math.min(ZMAX - 1, Math.max(ZMIN - 1, base + delta));
  const zoom = (base) => Math.min(ZMAX, Math.max(ZMIN, base + delta));
  function set(v) {
    const n = clampD(v); if (n === delta) return;
    delta = n; store.setSetting('driveZoom', delta); sync(); listeners.forEach((f) => f());
  }
  function sync() {
    if (!el) return;
    el.querySelector('[data-z=in]').disabled = delta >= DMAX;
    el.querySelector('[data-z=out]').disabled = delta <= DMIN;
    el.querySelector('[data-z=reset]').hidden = delta === 0;
  }
  const step = (s) => set(delta + s);
  el?.addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; const z = b.dataset.z; if (z === 'in') step(0.5); else if (z === 'out') step(-0.5); else if (z === 'reset') set(0); });
  el?.addEventListener('contextmenu', (e) => e.preventDefault());

  // Tasten + / - / 0
  addEventListener('keydown', (e) => {
    if (!active() || e.ctrlKey || e.metaKey || /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
    if (e.key === '+' || e.key === '=' || e.code === 'NumpadAdd') { step(0.5); e.preventDefault(); }
    else if (e.key === '-' || e.key === '_' || e.code === 'NumpadSubtract') { step(-0.5); e.preventDefault(); }
    else if (e.key === '0' || e.code === 'Numpad0') { set(0); }
  });

  // Mausrad (Capture-Phase: Leaflet bekommt es nicht, sonst wuerde die Karte kurz mitzoomen)
  let wheelAt = 0;
  stage?.addEventListener('wheel', (e) => {
    if (!active() || e.target.closest('#game-menu, #drive-q, dialog')) return;
    e.preventDefault(); e.stopPropagation();
    const now = performance.now(); if (now - wheelAt < 90) return; wheelAt = now;
    step(e.deltaY < 0 ? 0.5 : -0.5);
  }, { capture: true, passive: false });

  // Zwei-Finger-Pinch auf der Karte (Finger auf Knoepfen zaehlen nicht)
  let pinch = null;
  const onBtn = (t) => !!(t.target.closest && t.target.closest('button, #game-pad, #game-menu, #drive-q, #overview-bar, #minimap'));
  const dist = (t) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
  stage?.addEventListener('touchstart', (e) => {
    if (!active() || e.touches.length !== 2 || onBtn(e.touches[0]) || onBtn(e.touches[1])) return;
    pinch = { d0: dist(e.touches), start: delta }; e.stopPropagation(); e.preventDefault();
  }, { capture: true, passive: false });
  stage?.addEventListener('touchmove', (e) => {
    if (!pinch) return;
    e.stopPropagation(); e.preventDefault();
    if (e.touches.length === 2 && pinch.d0 > 10) set(pinch.start + Math.log2(dist(e.touches) / pinch.d0));
  }, { capture: true, passive: false });
  const end = (e) => { if (!pinch) return; e.stopPropagation(); if (e.touches.length < 2) pinch = null; };
  stage?.addEventListener('touchend', end, { capture: true }); stage?.addEventListener('touchcancel', end, { capture: true });

  sync();
  return { zoom, zoomGl, set, step, reset: () => set(0), delta: () => delta, onChange: (f) => listeners.push(f), active };
}
