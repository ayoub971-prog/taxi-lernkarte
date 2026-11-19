// Spielmodus "Selber fahren": Du steuerst das Taxi selbst auf dem echten Strassennetz (OpenStreetMap).
// Gas / Bremse / Links / Rechts als Bildschirm-Knoepfe (Multitouch), per Gamepad oder Tastatur.
// Mission: "Fahre zum Paradeplatz" – Pfeil und Distanz zeigen die Richtung, am Ende gibt es Punkte und Sterne.
// Rechenkern: game.js (Node-getestet). Eingabe: controls.js. Kamera: 3D hinter dem Auto (MapLibre) oder 2D gedreht (Leaflet).
import * as G from './game.js?v=4';
import { createControls } from './controls.js?v=4';
import { angleDiff } from './drive.js?v=4';
import { formatDistance, distanceM } from './geo.js?v=4';
import { STUFEN } from './places.js?v=4';
import { $, el, toast } from './ui.js?v=4';

const fmtTime = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const ARROW = { links: '◀', geradeaus: '▲', rechts: '▶' };

export function initGame(ctx) {
  const { L, map, store, gl } = ctx;
  const stage = $('#stage'), mapEl = $('#map'), carEl = $('#car'), hud = $('#game-hud'), pad = $('#game-pad'), menu = $('#game-menu');
  const layer = L.layerGroup().addTo(map);
  let graph = null, graphP = null, g = null, raf = 0, controls = null, geo = { W: 0, H: 0, cx: 0, cy: 0 }, audio = null, hintTimer = 0, lastInput = { steer: 0 };

  const perf = { n: 0, sum: 0, max: 0, dtSum: 0, dtN: 0 };   // Messwerte: JS-Zeit pro Bild (ohne Grafik) und Bildabstand
  const set = (k, d) => store.state.settings[k] ?? d;
  const haptics = () => set('haptics', true) !== false;
  const sound = () => set('sound', false) === true;
  const scaleSetting = () => Math.min(4, Math.max(1, Number(set('gameScale', 2)) || 2));

  // ------------------------------------------------------------ Hilfen: Ton, Vollbild
  function beep(freq = 660, ms = 120, type = 'sine') {
    if (!sound()) return;
    try {
      audio ??= new (window.AudioContext || window.webkitAudioContext)();
      const o = audio.createOscillator(), gn = audio.createGain();
      o.type = type; o.frequency.value = freq; gn.gain.value = 0.08; o.connect(gn); gn.connect(audio.destination);
      o.start(); gn.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + ms / 1000); o.stop(audio.currentTime + ms / 1000 + 0.02);
    } catch { /* ohne Ton weiter */ }
  }
  const buzz = (p) => { if (haptics()) { try { navigator.vibrate?.(p); } catch { /* optional */ } } };
  async function tryLandscape() {
    try { if (!document.fullscreenElement && document.documentElement.requestFullscreen) await document.documentElement.requestFullscreen(); } catch { /* optional */ }
    try { await screen.orientation?.lock?.('landscape'); } catch { /* geht nur im Vollbild/PWA – sonst einfach quer halten */ }
  }
  function leaveLandscape() {
    try { screen.orientation?.unlock?.(); } catch { /* */ }
    try { if (document.fullscreenElement) document.exitFullscreen(); } catch { /* */ }
  }

  // ------------------------------------------------------------ Strassennetz laden
  function loadGraph() {
    return (graphP ??= fetch('data/graph.json?v=4').then((r) => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); }).then(G.buildGraph)
      .catch((e) => { graphP = null; throw e; }));
  }

  // ------------------------------------------------------------ Start / Ende
  async function start(opts = {}) {
    if (!graph) toast('Strassennetz wird geladen …', 2500);
    tryLandscape();
    try { graph = await loadGraph(); } catch { toast('Das Strassennetz konnte nicht geladen werden (offline und noch nie geladen?).', 5000); return; }
    stop(true);
    ctx.quiz.stop(); ctx.drive.stop(true);
    const prog = store.state.progress;
    const weightOf = (p) => ({ rot: 4, gelb: 2, gruen: 1 }[ctx.progress.mastery(prog, p.id)] || 1);
    const scale = scaleSetting();
    const m = G.makeMission(graph, ctx.allPlaces(), { targetId: opts.targetId, startId: opts.startId, weightOf, scale });
    if (!m) { toast('Für diese Auswahl gibt es keine Mission.'); return; }
    g = { m, car: m.car, scale, state: 'ready', mistakes: 0, hints: 0, heading: G.carHeading(m.car), last: 0, hudAt: 0, nearAt: 0, near: '', opts, gamepadSeen: false };
    ctx.setMode('game'); ctx.setMarkersVisible(false); ctx.showView('karte');
    [hud, pad, carEl].forEach((n) => { n.hidden = false; });
    controls = createControls({ root: pad, haptics, onPause: () => togglePause(), onUturn: uturn, onHint: () => { hint(); }, onMap: openOverview });
    ctx.overview.show(ctx.overview.enabled(), openOverview);
    const t = m.target;
    L.marker([t.lat, t.lng], { icon: L.divIcon({ html: el('div', { class: 'endflag' }, el('span', {}, '🏁'), el('b', {}, t.label || t.name)), className: '', iconSize: [30, 30], iconAnchor: [5, 28] }), interactive: false }).addTo(layer);
    gl.setEnd(t.lat, t.lng, t.label || t.name);
    $('#g-goal').textContent = `Fahre zum ${t.name}`;
    layoutGame(); frame(true); updateHud(true);
    cancelAnimationFrame(raf); raf = requestAnimationFrame(loop);
    showMenu('intro');
  }

  function stop(silent = false) {
    if (!g) return;
    cancelAnimationFrame(raf); clearTimeout(hintTimer);
    controls?.destroy(); controls = null; g = null;
    ctx.overview.close(); ctx.overview.show(false);
    layer.clearLayers(); gl.setLine('hint', null); gl.setEnd(null);
    [hud, pad, carEl, menu].forEach((n) => { n.hidden = true; });
    mapEl.style.cssText = ''; carEl.style.cssText = '';
    ctx.setMode('normal'); ctx.setMarkersVisible(true); ctx.refresh();
    map.invalidateSize({ animate: false });
    if (gl.active) { gl.resetPadding(); if (!silent) gl.fitPoints([[47.17, 8.47], [47.40, 8.72]], 10); }
    if (!silent) { map.fitBounds([[47.17, 8.47], [47.40, 8.72]], { animate: false }); leaveLandscape(); }
  }

  // ------------------------------------------------------------ Kamera
  const landscape = () => stage.clientWidth > stage.clientHeight * 1.1;
  function layoutGame() {
    const W = stage.clientWidth, H = stage.clientHeight;
    const cx = W / 2, cy = H * (gl.active ? 0.72 : 0.68);
    geo = { W, H, cx, cy };
    if (gl.active) { mapEl.style.cssText = ''; carEl.style.transform = ''; gl.map()?.resize(); }
    else {
      const D = Math.ceil(Math.hypot(W, H)) + 40;
      Object.assign(mapEl.style, { inset: 'auto', width: D + 'px', height: D + 'px', left: cx - D / 2 + 'px', top: cy - D / 2 + 'px' });
      map.invalidateSize({ animate: false });
    }
    Object.assign(carEl.style, { left: cx + 'px', top: cy + 'px' });
  }
  function frame(first, dt = 0) {
    const car = g.car, pos = G.carPos(car), target = G.carHeading(car);
    g.heading = first ? target : (g.heading + angleDiff(g.heading, target) * Math.min(1, dt * 5) + 360) % 360;
    const eff = Math.abs(car.v) * g.scale;
    if (gl.active) gl.follow(pos.lat, pos.lng, g.heading, ctx.zoomctl.zoomGl(eff < 4 ? 17.6 : eff < 12 ? 17.1 : eff < 25 ? 16.6 : 16.1), geo.W, geo.H, geo.cx, geo.cy);
    else {
      map.setView([pos.lat, pos.lng], ctx.zoomctl.zoom(eff < 4 ? 18 : eff < 12 ? 17 : eff < 25 ? 16.5 : 16), { animate: false });
      if (ctx.driverView()) { mapEl.style.transform = `rotate(${-g.heading}deg)`; carEl.style.transform = ''; }
      else { mapEl.style.transform = ''; carEl.style.transform = `rotate(${g.heading}deg)`; }
    }
  }
  ctx.viewListeners.push(() => { if (g && !ctx.forceOverview) { layoutGame(); frame(true); } });
  setTimeout(() => ctx.zoomctl.onChange(() => { if (g && !ctx.forceOverview) frame(false, 0); }), 0);
  addEventListener('resize', () => { if (g && !ctx.forceOverview) { layoutGame(); frame(true); } });

  // ------------------------------------------------------------ Hauptschleife
  function loop(now) {
    if (!g) return;
    const raw = (now - (g.last || now)) / 1000, dt = Math.min(0.05, raw); g.last = now;
    const t0 = performance.now();
    if (g.state === 'run') {
      const inp = controls.read(); lastInput = inp;
      if (inp.gamepad && !g.gamepadSeen) { g.gamepadSeen = true; toast('🎮 Gamepad erkannt', 2500); }
      for (const ev of G.step(graph, g.car, inp, dt, { scale: g.scale, distTo: g.m.distTo })) {
        if (ev.type === 'mistake') { g.mistakes += 1; toast('Falsch abgebogen – du entfernst dich vom Ziel.', 3000); beep(180, 250, 'square'); buzz([60, 40, 60]); }
        else if (ev.type === 'bump') buzz(30);
      }
      if (G.arrived(g.car, g.m.target, g.m.arriveR)) finish();
    }
    if (g) {
      if (!ctx.forceOverview) { frame(false, dt); if (now - g.hudAt > 120) { g.hudAt = now; updateHud(); } ctx.overview.update(G.carPos(g.car), g.heading, g.m.target, now); }
      const ms = performance.now() - t0; perf.n += 1; perf.sum += ms; perf.max = Math.max(perf.max, ms); if (raw > 0) { perf.dtSum += raw; perf.dtN += 1; }
      raf = requestAnimationFrame(loop);
    }
  }

  // ------------------------------------------------------------ Anzeige
  function updateHud(force = false) {
    const car = g.car, t = g.m.target;
    const kmh = Math.round(Math.abs(car.v) * 3.6);
    $('#g-kmh').textContent = String(kmh) + (car.v < -0.2 ? ' R' : '');
    const lim = $('#g-limit'); lim.hidden = !G.limitTagged(car.e); lim.textContent = String(car.e.ms || '');
    lim.classList.toggle('over', G.limitTagged(car.e) && kmh > car.e.ms + 5);
    $('#g-street').textContent = car.e.name || 'Strasse ohne Namen';
    if (force || performance.now() - g.nearAt > 600) {
      g.nearAt = performance.now();
      const pos = G.carPos(car);
      let best = null; for (const p of ctx.allPlaces()) { const d = distanceM(pos, p); if (!best || d < best.d) best = { p, d }; }
      $('#g-ort').textContent = best && best.d < 900 ? `📍 bei ${best.p.label || best.p.name}` : '';
    }
    const tt = G.toTarget(car, t);
    $('#g-cdist').textContent = formatDistance(tt.dist);
    $('#g-arrow').style.transform = `rotate(${angleDiff(g.heading, tt.bearing)}deg)`;
    $('#g-time').textContent = `⏱ ${fmtTime(car.time)}   ✖ ${g.mistakes}${g.hints ? `   🧭 ${g.hints}` : ''}`;
    const la = G.lookAhead(graph, car, lastInput.steer || 0), box = $('#g-junction');
    if (la.dist < 140 && car.v >= 0 && la.options.length > 0 && (la.options.length > 1 || la.deadEnd)) {
      const items = [...la.options].sort((a, b) => a.angle - b.angle);
      box.replaceChildren(el('small', {}, `Kreuzung in ${Math.max(5, Math.round(la.dist / 10) * 10)} m`),
        ...items.map((o) => el('span', { class: 'jopt' + (o.picked ? ' on' : '') }, `${ARROW[o.word]} ${o.name || ''}`.trim())));
      box.hidden = false;
    } else box.hidden = true;
  }

  // ------------------------------------------------------------ Menues
  function showMenu(kind) {
    const t = g.m.target, s = g.m.start;
    const body = [];
    if (kind === 'intro') {
      body.push(el('h2', {}, '🎮 Selber fahren'),
        el('p', { class: 'big' }, `Du stehst bei ${s.name}. Fahre zum ${t.name}.`),
        el('p', {}, `Etwa ${(g.m.meters / 1000).toFixed(1)} km. Halte GAS gedrückt. Tippe vor einer Kreuzung ◀ oder ▶, um abzubiegen (ohne Tippen geht es geradeaus).`),
        el('p', { class: 'hint' }, 'Der Pfeil oben zeigt zum Ziel. Spielzeit läuft schneller als im echten Leben (Tempo ×' + g.scale + ').'),
        el('button', { class: 'btn primary big', type: 'button', 'data-act': 'go', onclick: () => { g.state = 'run'; g.car.time = 0; menu.hidden = true; beep(880, 120); buzz(20); } }, 'Los!'),
        el('button', { class: 'btn', type: 'button', onclick: () => stop() }, 'Abbrechen'));
    } else if (kind === 'pause') {
      body.push(el('h2', {}, '⏸ Pause'),
        el('button', { class: 'btn primary big', type: 'button', 'data-act': 'resume', onclick: () => togglePause() }, 'Weiterfahren'),
        el('button', { class: 'btn big', type: 'button', onclick: () => { togglePause(); hint(); } }, '🧭 Neu berechnen (Hinweis, −150 Punkte)'),
        el('label', { class: 'check' }, el('input', { type: 'checkbox', checked: sound() ? '' : null, onchange: (e) => store.setSetting('sound', e.target.checked) }), ' Ton'),
        el('label', { class: 'check' }, el('input', { type: 'checkbox', checked: haptics() ? '' : null, onchange: (e) => store.setSetting('haptics', e.target.checked) }), ' Vibration'),
        el('label', { class: 'speed2' }, el('span', {}, `Tempo ×${g.scale} (gilt ab der nächsten Mission)`), el('input', { type: 'range', min: 1, max: 4, step: 1, value: String(scaleSetting()), onchange: (e) => store.setSetting('gameScale', Number(e.target.value)) })),
        el('label', { class: 'check' }, el('input', { type: 'checkbox', checked: ctx.overview.enabled() ? '' : null, onchange: (e) => { ctx.overview.setEnabled(e.target.checked); ctx.overview.show(e.target.checked, openOverview); } }), ' Minikarte in der Ecke'),
        ctx.gl.enable3d && ctx.gl.supported() ? el('button', { class: 'btn', type: 'button', onclick: () => { menu.hidden = true; ctx.gl.supported() && toggle3d(); } }, gl.active ? 'Zu 2D wechseln' : 'Zu 3D wechseln') : null,
        el('button', { class: 'btn', type: 'button', onclick: () => stop() }, 'Spiel beenden'));
    } else if (kind === 'done') {
      const r = g.rating;
      body.push(el('h2', {}, r.stars === 3 ? '🏁 Super gefahren!' : '🏁 Ziel erreicht'),
        el('div', { class: 'stars', 'aria-label': `${r.stars} von 3 Sternen` }, '★'.repeat(r.stars) + '☆'.repeat(3 - r.stars)),
        el('p', { class: 'big' }, `${r.score} Punkte`),
        el('p', {}, `Zeit ${fmtTime(g.car.time)} (gut: ${fmtTime(g.m.parS)}) · Fehler ${g.mistakes} · Hinweise ${g.hints}`),
        el('p', { class: 'hint' }, r.stars >= 2 ? `«${t.name}» kommt in der Lernkarte weiter nach oben.` : `«${t.name}» kommt bald wieder dran – üben lohnt sich.`),
        el('button', { class: 'btn primary big', type: 'button', 'data-act': 'next', onclick: () => start({}) }, 'Neue Mission'),
        el('button', { class: 'btn big', type: 'button', onclick: () => start({ targetId: t.id, startId: s.id }) }, 'Nochmal dieselbe'),
        el('button', { class: 'btn', type: 'button', onclick: () => stop() }, 'Beenden'));
    }
    menu.replaceChildren(el('div', { class: 'gm-card' }, body)); menu.hidden = false;
  }
  function toggle3d() { store.setSetting('view3d', !gl.active); ctx.applyView(); }

  function togglePause() {
    if (ctx.overview.isOpen()) { ctx.overview.close(); return; }
    if (!g || g.state === 'ready' || g.state === 'done') return;
    if (g.state === 'run') { g.state = 'pause'; showMenu('pause'); }
    else { g.state = 'run'; menu.hidden = true; }
  }

  function uturn() {
    if (!g || g.state !== 'run') return;
    const c = g.car;
    if (c.e.ow) return toast('Einbahnstrasse: Wenden nicht möglich.');
    if (Math.abs(c.v) * 3.6 > 20) return toast('Zum Wenden zuerst langsamer fahren.');
    c.dir = -c.dir; c.s = c.e.total - c.s; c.v = 0; c.steerLatch = 0; beep(520, 80);
  }

  /** Zeigt den kuerzesten Weg zum Ziel; gibt die Punkte zurueck (fuer die Uebersicht). */
  function hint() {
    if (!g || (g.state !== 'run' && g.state !== 'pause')) return null;
    const c = g.car, node = c.dir > 0 ? c.e.b : c.e.a;
    const p = G.pathBetween(graph, node, g.m.targetNode, 's');
    if (!p) { toast('Kein Weg gefunden.'); return null; }
    g.hints += 1;
    const pts = [[G.carPos(c).lat, G.carPos(c).lng], [graph.nodes[node].lat, graph.nodes[node].lng], ...G.pathLatLngs(p.steps)];
    layer.eachLayer((l) => { if (l.options?.className === 'hintline') layer.removeLayer(l); });
    L.polyline(pts, { color: '#ff6f00', weight: 8, opacity: 0.9, className: 'hintline', interactive: false }).addTo(layer);
    gl.setLine('hint', pts, { color: '#ff6f00', width: 8 });
    clearTimeout(hintTimer);
    hintTimer = setTimeout(() => { layer.eachLayer((l) => { if (l.options?.className === 'hintline') layer.removeLayer(l); }); gl.setLine('hint', null); }, 12000);
    toast('🧭 Kürzester Weg (orange) – 12 Sekunden. −150 Punkte', 3500); beep(440, 100);
    return pts;
  }

  /** Uebersichtskarte: Spiel pausiert, 2D-Karte mit Auto, Ziel und auf Wunsch dem kuerzesten Weg. */
  function openOverview() {
    if (!g || g.state !== 'run') return;
    ctx.overview.open({
      pos: () => ({ ...G.carPos(g.car), heading: g.heading }), target: g.m.target,
      pause: () => { g.state = 'pause'; },
      resume: () => { if (!g) return; g.state = 'run'; g.last = 0; layoutGame(); frame(true); },
      hint: () => hint(),
    });
  }

  function finish() {
    g.state = 'done'; g.car.v = 0;
    g.rating = G.rate(g.m, { seconds: g.car.time, mistakes: g.mistakes, hints: g.hints, speedingS: g.car.speedingS });
    const t = g.m.target, ok = g.rating.stars >= 2;
    store.mutateProgress((pr) => ctx.progress.answer(pr, t.id, ok));        // Lernstand: Zielort wird sicherer oder bleibt schwach
    const key = `${g.m.start.id}>${t.id}`, best = { ...(store.state.settings.gameBest || {}) };
    if (!best[key] || best[key].score < g.rating.score) best[key] = { stars: g.rating.stars, score: g.rating.score };
    store.setSetting('gameBest', best);
    ctx.refresh(); syncBest();
    beep(660, 120); setTimeout(() => beep(880, 160), 140); setTimeout(() => beep(1100, 220), 300); buzz([80, 50, 120]);
    showMenu('done');
  }

  // ------------------------------------------------------------ Fahren-Menue: Zielauswahl, Start
  const sel = $('#game-target');
  if (sel) {
    sel.append(el('option', { value: '' }, 'Zufälliges Ziel'));
    for (const [n, name] of Object.entries(STUFEN)) {
      const grp = el('optgroup', { label: `Stufe ${n} – ${name}` });
      ctx.poolFor(String(n)).forEach((p) => grp.append(el('option', { value: p.id }, p.name)));
      sel.append(grp);
    }
    $('#game-start').addEventListener('click', () => start({ targetId: sel.value || undefined }));
  }
  function syncBest() {
    const b = Object.values(store.state.settings.gameBest || {});
    const box = $('#game-best'); if (!box) return;
    box.textContent = b.length ? `Bisher ${b.length} Missionen · ${b.reduce((a, x) => a + x.stars, 0)} ★ gesammelt` : 'Noch keine Mission gefahren.';
  }
  syncBest();

  return { start, stop, isActive: () => !!g, state: () => g, controls: () => controls, graph: () => graph, hint, uturn, togglePause, openOverview, perf: () => ({ ...perf, avgMs: perf.sum / Math.max(1, perf.n), fps: perf.dtN / Math.max(0.001, perf.dtSum) }) };
}
