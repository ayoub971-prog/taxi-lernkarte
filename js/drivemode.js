// Fahrmodus: Ein Taxi faehrt auf echter Strassengeometrie (data/*.json). Die Karte folgt dem Auto,
// ist stark herangezoomt und dreht sich in Fahrtrichtung (CSS-Drehung des Karten-Containers).
// Oben ein Navi-Balken (Strasse, naechster Abbieger, Distanz), unten Steuerung, dazwischen
// Pruefungsfragen ("Wohin geht es?", "Welcher Ort kommt als Naechstes?"). Alles ist Simulation.
import { BASE_SPEED, posAt, headingAt, angleDiff, currentStep, nextDecision, instruction, shortDist, placesAlong, planQuestions, questionText, streetName, prepRoute } from './drive.js?v=6';
import { recordWrong, recordRight, allKeys } from './repeat.js?v=6';
import { formatDistance } from './geo.js?v=6';
import { naviBanner, renderBanner, etaInfo, driveManeuvers } from './navi.js?v=6';
import { $, el, toast, speak } from './ui.js?v=6';

export function initDrive(ctx) {
  const { L, map, store, gl } = ctx;
  const mapEl = $('#map'), stage = $('#stage'), car = $('#car');
  const hud = $('#drive-hud'), bottom = $('#drive-bottom'), qBox = $('#drive-q');
  const layer = L.layerGroup().addTo(map);
  let d = null; // laufende Fahrt
  let raf = 0;

  const zoomFor = (mul) => (mul <= 2 ? 17 : mul <= 5 ? 16 : 15);
  const zoomFor3d = (mul) => (mul <= 2 ? 17.3 : mul <= 5 ? 16.5 : 15.7);   // MapLibre-Zoom (512er Kacheln)
  const landscape = () => stage.clientWidth > stage.clientHeight * 1.2;
  let geo = { W: 0, H: 0, cx: 0, cy: 0 };

  /** Karten-Container uebergross machen, damit beim Drehen keine Ecken leer bleiben; Auto sitzt im Zentrum der Drehung. */
  function layoutDrive() {
    const W = stage.clientWidth, H = stage.clientHeight;
    const D = Math.ceil(Math.hypot(W, H)) + 40;
    if (gl.active) {   // 3D: Kamera hinter dem Auto, das Auto sitzt tief im Bild
      const cx3 = landscape() ? W * 0.27 : W / 2, cy3 = H * (landscape() ? 0.72 : 0.74);
      geo = { W, H, cx: cx3, cy: cy3 };
      mapEl.style.cssText = ''; car.style.transform = '';
      Object.assign(car.style, { left: cx3 + 'px', top: cy3 + 'px' });
      gl.map()?.resize();
      return;
    }
    const cx = landscape() ? W * 0.27 : W / 2, cy = H * (landscape() ? 0.6 : 0.64);
    Object.assign(mapEl.style, { inset: 'auto', width: D + 'px', height: D + 'px', left: cx - D / 2 + 'px', top: cy - D / 2 + 'px' });
    Object.assign(car.style, { left: cx + 'px', top: cy + 'px' });
    map.invalidateSize({ animate: false });
  }

  /** Startet eine Fahrt. route: Ergebnis von prepRoute(). opts: {destName, destPlace} */
  function start(route, opts = {}) {
    stop(true);
    ctx.quiz.stop();
    ctx.setMode('drive'); ctx.setMarkersVisible(false); ctx.showView('karte');
    ctx.restrict.start();
    const along = placesAlong(route, ctx.allPlaces());
    const weakKeys = along.filter((a) => ctx.progress.mastery(store.state.progress, a.place.id) === 'rot').map((a) => 'ort:' + a.place.id);
    const repeatKeys = new Set([...allKeys(store.state.repeat, 'turn:' + route.id), ...weakKeys]);
    d = {
      route, destName: opts.destName || route.title, destId: opts.destId || null, along, s: 0, mul: Number($('#drv-speed').value), playing: false, heading: headingAt(route, 0),
      qs: store.state.settings.questions === false ? [] : planQuestions(route, along, ctx.allPlaces(), { repeatKeys }),
      asked: 0, right: 0, said: {}, finished: false, last: 0, hudAt: 0, zoom: 0, pending: null,
    };
    d.qs.forEach((q) => { q.done = false; });
    d.man = driveManeuvers(route, d.destName, { instruction, streetName, posAt });
    const pts = route.pts.map((p) => [p.lat, p.lng]);
    L.polyline(pts, { color: '#fff', weight: 14, opacity: 0.9, interactive: false }).addTo(layer);
    L.polyline(pts, { color: '#5b3df5', weight: 9, opacity: 0.95, interactive: false }).addTo(layer);
    const end = route.pts.at(-1);
    gl.setLine('drive', pts, { color: '#5b3df5', width: 9 }); gl.setEnd(end.lat, end.lng);
    L.marker([end.lat, end.lng], { icon: L.divIcon({ html: '<div style="font-size:30px;line-height:30px">🏁</div>', className: '', iconSize: [30, 30], iconAnchor: [5, 28] }), interactive: false }).addTo(layer);
    [hud, $('#drive-meta'), bottom, car, $('#drv-3d'), $('#drv-map'), $('#drv-mm')].forEach((n) => { n.hidden = false; });
    ctx.overview.show(ctx.overview.enabled(), openOverview); syncMiniBtn();
    qBox.hidden = true;
    layoutDrive();
    syncVoiceBtn(); $('#drv-play').textContent = '▶';
    frame(true);
    cancelAnimationFrame(raf); raf = requestAnimationFrame(loop);
    toast('Simulation zum Lernen, kein echtes Navi.', 3500);
  }

  function stop(silent = false) {
    if (!d) return;
    cancelAnimationFrame(raf); d = null;
    layer.clearLayers(); gl.setLine('drive', null); gl.setEnd(null); ctx.restrict.stop();
    ctx.overview.close(); ctx.overview.show(false);
    [hud, $('#drive-meta'), bottom, car, $('#drv-3d'), $('#drv-map'), $('#drv-mm')].forEach((n) => { n.hidden = true; });
    ctx.naviUi.setLabels([]); ctx.setFreeLook(false);
    mapEl.style.cssText = ''; car.style.cssText = '';
    try { window.speechSynthesis?.cancel(); } catch { /* optional */ }
    ctx.setMode('normal'); ctx.setMarkersVisible(true); ctx.refresh();
    map.invalidateSize({ animate: false });
    if (gl.active) { gl.resetPadding(); if (!silent) gl.fitPoints([[47.17, 8.47], [47.40, 8.72]], 10); }
    if (!silent) map.fitBounds([[47.17, 8.47], [47.40, 8.72]], { animate: false });
  }

  // ------------------------------------------------------------ Hauptschleife
  function loop(now) {
    if (!d) return;
    const dt = Math.min(0.1, (now - (d.last || now)) / 1000); d.last = now;
    if (d.playing && !d.pending) {
      d.s = Math.min(d.route.total, d.s + BASE_SPEED * d.mul * dt);
      const q = d.qs.find((x) => !x.done && x.at <= d.s && d.s - x.at < 400);
      if (q) ask(q);
      if (d.s >= d.route.total) finishDrive();
    }
    if (!ctx.forceOverview) { frame(false, dt, now); ctx.overview.update(posAt(d.route, d.s), d.heading, d.route.pts.at(-1), now); }
    raf = requestAnimationFrame(loop);
  }

  /** Zeichnet einen Schritt: Karte zentrieren, drehen, HUD aktualisieren. */
  function frame(first, dt = 0, now = 0) {
    const r = d.route, pos = posAt(r, d.s), target = headingAt(r, d.s);
    ctx.restrict.update(pos, first);
    d.heading = first ? target : (d.heading + angleDiff(d.heading, target) * Math.min(1, dt * 4) + 360) % 360;
    if (gl.active && ctx.freeLook) ctx.placeCarFree(pos, d.heading);
    else if (gl.active) gl.follow(pos.lat, pos.lng, d.heading, ctx.zoomctl.zoomGl(zoomFor3d(d.mul)), geo.W, geo.H, geo.cx, geo.cy);
    else {
      map.setView([pos.lat, pos.lng], ctx.zoomctl.zoom(zoomFor(d.mul)), { animate: false });
      if (ctx.driverView()) { mapEl.style.transform = `rotate(${-d.heading}deg)`; car.style.transform = ''; }
      else { mapEl.style.transform = ''; car.style.transform = `rotate(${d.heading}deg)`; }   // Norden oben: das Auto dreht sich
    }
    if (first || now - d.hudAt > 200) { d.hudAt = now; updateHud(); }
  }

  function updateHud() {
    const r = d.route, s = d.s;
    const cur = currentStep(r, s), nd = nextDecision(r, s);
    $('#street-now').textContent = streetName(cur) ? `Sie fahren auf: ${streetName(cur)}` : 'Sie fahren geradeaus';
    renderBanner(hud, naviBanner(d.man, s, { dest: d.destName }));
    ctx.naviUi.setLabels(ctx.naviUi.labelsFor(d.man, s));
    if (nd && !d.finished && store.state.settings.voice) {
      const ins = instruction(nd.step), i = nd.index;
      if (nd.dist <= 300 && !d.said[i + 'a']) { d.said[i + 'a'] = 1; speak(`In ${Math.round(nd.dist / 50) * 50} Metern ${ins.text}`); }
      else if (nd.dist <= 40 && !d.said[i + 'b']) { d.said[i + 'b'] = 1; speak(`Jetzt ${ins.text}`); }
    }
    const rest = Math.max(0, r.total - s), eta = etaInfo(rest, r.seconds > 0 ? r.total / r.seconds : BASE_SPEED);
    $('#eta-min').textContent = d.finished ? 'Am Ziel' : eta.rest; $('#eta-sub').textContent = d.finished ? '🏁' : `${eta.dist} · Ankunft ${eta.arrive}`;
    $('#drv-kmh').textContent = d.playing && !d.pending ? String(Math.round(BASE_SPEED * 3.6)) : '0';   // Tacho: Fahrtempo der Simulation (50 km/h), der Faktor 1–10× raffft nur die Zeit
    const near = d.along.find((a) => Math.abs(a.s - s) <= 250);
    const info = [];
    if (near) {
      info.push(`📍 Sie passieren: ${near.place.label || near.place.name}`);
      if (store.state.settings.voice && !d.said['p' + near.place.id] && Math.abs(near.s - s) <= 120) { d.said['p' + near.place.id] = 1; speak(`Sie passieren ${near.place.label || near.place.name}`); }
    } else if (d.qs.length === 0) {
      const nx = d.along.find((a) => a.s > s);
      if (nx) info.push(`Nächster Ort: ${nx.place.label || nx.place.name} (${shortDist(nx.s - s)})`);
    }
    $('#drive-info').replaceChildren(...info.map((t) => el('span', {}, t)));
  }

  // ------------------------------------------------------------ Fragen waehrend der Fahrt
  function ask(q) {
    d.pending = q; d.playing = false; syncPlayBtn();
    const cur = streetName(currentStep(d.route, d.s));
    const opts = q.kind === 'next' ? q.options : q.options.map((o) => ({ id: o, label: o }));
    qBox.replaceChildren(el('div', { class: 'qtext' }, questionText(q, cur, d.destName)),
      el('div', { class: 'opts' }, opts.map((o) => el('button', { class: 'opt', type: 'button', 'data-id': o.id, onclick: (e) => answer(q, o, e.currentTarget) }, o.label))));
    qBox.hidden = false;
    if (store.state.settings.voice) speak(questionText(q, cur, d.destName));
  }

  function answer(q, opt, btn) {
    const ok = opt.id === q.answer;
    d.asked += 1; if (ok) d.right += 1;
    qBox.querySelectorAll('.opt').forEach((b) => { b.disabled = true; if (b.dataset.id === String(q.answer)) b.classList.add('right'); });
    if (!ok) btn.classList.add('wrong');
    if (q.kind === 'turn') store.mutateRepeat((rep) => (ok ? recordRight(rep, q.key) : recordWrong(rep, q.key)));
    else store.mutateProgress((pr) => ctx.progress.answer(pr, q.place.id, ok));
    const expl = q.kind === 'next' ? `Das ist: ${q.place.name}` : `Richtig ist: ${instruction(q.step).text}`;
    qBox.append(el('div', { class: 'qfb ' + (ok ? 'good' : 'bad') }, ok ? `Richtig! ${expl}` : `Falsch. ${expl}${q.kind === 'turn' ? ' (kommt später wieder)' : ''}`),
      el('button', { class: 'btn primary', type: 'button', onclick: () => { q.done = true; d.pending = null; qBox.hidden = true; d.playing = true; syncPlayBtn(); } }, 'Weiter fahren'));
  }

  function finishDrive() {
    d.finished = true; d.playing = false; syncPlayBtn(); updateHud();
    qBox.replaceChildren(el('div', { class: 'qtext' }, '🏁 Ziel erreicht'),
      el('div', { class: 'qfb' }, d.asked ? `Fragen: ${d.right} von ${d.asked} richtig.` : 'Gute Fahrt gehabt!'),
      el('button', { class: 'btn primary', type: 'button', onclick: () => start(d.route, { destName: d.destName, destId: d.destId }) }, 'Nochmal fahren'),
      el('button', { class: 'btn', type: 'button', style: 'margin-top:8px', onclick: () => { stop(); } }, 'Beenden'));
    qBox.hidden = false;
  }

  // ------------------------------------------------------------ Steuerung
  const syncPlayBtn = () => { $('#drv-play').textContent = d?.playing ? '⏸' : '▶'; };
  const syncVoiceBtn = () => { const on = !!store.state.settings.voice; $('#drv-voice').setAttribute('aria-pressed', String(on)); $('#drv-voice').textContent = on ? '🔊' : '🔇'; $('#set-voice').checked = on; };
  $('#drv-play').addEventListener('click', () => { if (!d || d.pending) return; if (d.finished) return; d.playing = !d.playing; syncPlayBtn(); });
  $('#drv-back').addEventListener('click', () => { if (!d) return; d.s = Math.max(0, d.s - 500); d.finished = false; qBox.hidden = !d.pending; frame(true); });
  $('#drv-fwd').addEventListener('click', () => { if (!d || d.pending) return; d.s = Math.min(d.route.total - 1, d.s + 500); frame(true); });
  $('#drv-speed').addEventListener('input', (e) => { $('#drv-speed-label').textContent = `${e.target.value}×`; if (d) d.mul = Number(e.target.value); });
  $('#drv-voice').addEventListener('click', () => { store.setSetting('voice', !store.state.settings.voice); syncVoiceBtn(); if (!store.state.settings.voice) { try { speechSynthesis.cancel(); } catch { /* */ } } });
  $('#drv-end').addEventListener('click', () => stop());
  addEventListener('resize', () => { if (d && !ctx.forceOverview) layoutDrive(); });
  // 2D <-> 3D waehrend der Fahrt: Layout und Kamera neu setzen
  ctx.viewListeners.push(() => { if (d && !ctx.forceOverview) { layoutDrive(); frame(true); } });
  setTimeout(() => ctx.zoomctl.onChange(() => { if (d && !ctx.forceOverview) { if (ctx.freeLook) ctx.setFreeLook(false); else frame(false, 0, performance.now()); } }), 0);
  // Uebersichtskarte (pausiert die Fahrt) und Minikarte
  function openOverview() {
    if (!d || d.pending || d.finished) return toast(d?.pending ? 'Erst die Frage beantworten.' : 'Die Fahrt ist zu Ende.');
    let was = false;
    ctx.overview.open({
      pos: () => ({ ...posAt(d.route, d.s), heading: d.heading }), target: d.route.pts.at(-1),
      pause: () => { was = d.playing; d.playing = false; syncPlayBtn(); },
      resume: () => { if (!d) return; d.playing = was; d.last = 0; syncPlayBtn(); layoutDrive(); frame(true); },
    });
  }
  const syncMiniBtn = () => $('#drv-mm').setAttribute('aria-pressed', String(ctx.overview.enabled()));
  $('#drv-map').addEventListener('click', openOverview);
  $('#drv-mm').addEventListener('click', () => { ctx.overview.setEnabled(!ctx.overview.enabled()); ctx.overview.show(ctx.overview.enabled(), openOverview); syncMiniBtn(); });

  // ------------------------------------------------------------ Start-Knoepfe im Fahren-Menue
  async function startAB(key) {
    try {
      const data = await ctx.routesAB();
      const title = key === 'A' ? 'Autobahn A3: Wädenswil → Albisgütli' : 'Seestrasse: Wädenswil → Zürich (Bürkliplatz)';
      start(prepRoute(data.routes[key], 'route-' + key, title), { destName: key === 'A' ? 'Albisgütli' : 'Bürkliplatz', destId: key === 'A' ? 'albisguetli' : 'buerkliplatz' });
    } catch { toast('Route konnte nicht geladen werden.'); }
  }
  $('#drv-self').addEventListener('click', () => { const id = d?.destId || undefined; stop(true); ctx.game.start({ targetId: id }); });   // gleiches Ziel im Spielmodus
  $('#drv-start-a').addEventListener('click', () => startAB('A'));
  $('#drv-start-b').addEventListener('click', () => startAB('B'));
  $('#drv-start-exam').addEventListener('click', async () => {
    const pick = await ctx.quiz.pickPair(); if (!pick) return;
    start(pick.route, { destName: pick.b.name, destId: pick.b.id });
    toast(`Fahre von ${pick.a.label} nach ${pick.b.label}`, 4000);
  });

  return { openOverview, start, stop, isActive: () => !!d, state: () => d };
}
