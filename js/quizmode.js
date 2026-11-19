// Ueben und Pruefen: Lernen -> Ueben -> Pruefen (pro Stufe), "Heute ueben" und Stufe 4 (Pruefungsaufgabe
// mit "Callen": Route Strasse fuer Strasse aufdecken). Fortschritt: progress.js, Fehlerliste: repeat.js.
import { distanceM, formatDistance, scorePoints, isHit, verdict } from './geo.js?v=3';
import { shuffle, makeOptions } from './quiz.js?v=3';
import * as progress from './progress.js?v=3';
import { recordWrong, recordRight, dueKeys } from './repeat.js?v=3';
import { prepRoute, streetGroups, slice } from './drive.js?v=3';
import { $, el, toast, speak } from './ui.js?v=3';

export function initQuiz(ctx) {
  const { L, map, store } = ctx;
  const card = $('#quiz-card'), banner = $('#banner');
  const overlay = L.layerGroup().addTo(map);
  let q = null;     // laufendes Quiz
  let exam = null;  // laufende Pruefungsaufgabe
  let lastPair = null;

  const showCard = (...kids) => { card.replaceChildren(...kids); card.hidden = false; ctx.resize(); };
  const head = (left) => el('div', { class: 'qhead' }, el('span', {}, left), el('button', { class: 'btn', type: 'button', style: 'min-height:40px;padding:4px 12px', onclick: stop }, 'Beenden'));
  const setBanner = (title, small) => { banner.replaceChildren(title, small ? el('small', {}, small) : ''); banner.hidden = false; };

  function begin() {
    ctx.setMode('quiz'); ctx.setMarkersVisible(false); ctx.showView('karte');
    overlay.clearLayers(); ctx.onMapClick = null;
  }
  function stop() {
    if (!q && !exam && ctx.mode !== 'quiz') return;
    q = null; exam = null; overlay.clearLayers(); ctx.onMapClick = null;
    card.hidden = true; banner.hidden = true;
    ctx.setMode('normal'); ctx.setMarkersVisible(true); ctx.refresh(); ctx.resize();
  }

  // ------------------------------------------------------------ Quiz-Runden
  function startQuiz(type, poolSel, n) {
    const pool = ctx.poolFor(poolSel);
    if (!pool.length) return toast('In dieser Auswahl gibt es keine Orte.');
    const prog = store.state.progress;
    const list = type === 'heute' ? shuffle(progress.dailySet(ctx.allPlaces(), prog, 10)) : progress.pickWeighted(pool, prog, n);
    const kind = (i) => (type === 'ueben_wo' ? 'wo' : type === 'ueben_name' ? 'name' : (type === 'pruefen' ? (i % 2 ? 'name' : 'wo') : (Math.random() < 0.5 ? 'wo' : 'name')));
    q = { type, poolSel, n, items: list.map((p, i) => ({ place: p, kind: kind(i) })), i: 0, results: [], feedback: type !== 'pruefen',
      bounds: L.latLngBounds(pool.map((p) => [p.lat, p.lng])) };
    q.items = q.type === 'pruefen' ? shuffle(q.items) : q.items;
    begin(); showQ();
  }

  function showQ() {
    overlay.clearLayers(); ctx.onMapClick = null;
    const it = q.items[q.i]; q.answered = false;
    const label = `Frage ${q.i + 1} von ${q.items.length}`;
    if (it.kind === 'wo') {
      setBanner(`Wo ist ${it.place.name}?`, 'Tippe auf die Karte');
      map.fitBounds(q.bounds, { paddingTopLeft: [30, 110], paddingBottomRight: [30, 30], animate: false });
      showCard(head(label), el('div', { class: 'qtext' }, 'Tippe auf die Karte.'));
      ctx.onMapClick = onTap;
    } else {
      setBanner('Welcher Ort ist das?', 'Wähle den Namen');
      L.marker([it.place.lat, it.place.lng], { icon: ctx.pinIcon(it.place, { label: false }), interactive: false }).addTo(overlay);
      map.setView([it.place.lat, it.place.lng], 15, { animate: false });
      const opts = makeOptions(it.place, ctx.allPlaces());
      const row = el('div', { class: 'opts' }, opts.map((o) => el('button', { class: 'opt', type: 'button', 'data-id': o.id, onclick: (e) => onOption(o, e.currentTarget) }, o.label || o.name)));
      showCard(head(label), el('div', { class: 'qtext' }, 'Wie heisst dieser Ort?'), row);
    }
  }

  function record(place, ok, extra = {}) {
    store.mutateProgress((pr) => progress.answer(pr, place.id, ok));
    q.results.push({ id: place.id, name: place.name, correct: ok, ...extra });
  }
  const nextBtn = () => el('button', { class: 'btn primary', type: 'button', onclick: () => { q.i += 1; q.i >= q.items.length ? finish() : showQ(); } }, q.i + 1 >= q.items.length ? 'Ergebnis' : 'Weiter');

  function onTap(e) {
    if (!q || q.answered) return; q.answered = true; ctx.onMapClick = null;
    const it = q.items[q.i], p = it.place;
    const d = distanceM(e.latlng, p), ok = isHit(d);
    record(p, ok, { distance: d, kind: 'wo' });
    L.marker(e.latlng, { icon: L.divIcon({ html: '<div class="tapdot"></div>', className: '', iconSize: [18, 18], iconAnchor: [9, 9] }), interactive: false }).addTo(overlay);
    banner.hidden = true;
    if (!q.feedback) return showCard(head(`Frage ${q.i + 1} von ${q.items.length}`), el('div', { class: 'qfb' }, 'Antwort gespeichert.'), el('div', { class: 'row' }, nextBtn()));
    L.polyline([e.latlng, [p.lat, p.lng]], { color: '#c62828', weight: 3, dashArray: '6 6', interactive: false }).addTo(overlay);
    L.marker([p.lat, p.lng], { icon: ctx.pinIcon(p, { cls: 'target' }), interactive: false }).addTo(overlay);
    map.fitBounds(L.latLngBounds([e.latlng, [p.lat, p.lng]]), { padding: [60, 60], maxZoom: 17, animate: false });
    showCard(head(`Frage ${q.i + 1} von ${q.items.length}`),
      el('div', { class: 'qfb ' + (ok ? 'good' : 'bad') }, `Distanz: ${formatDistance(d)} – ${verdict(d)} (+${scorePoints(d)} Punkte)`),
      el('div', { class: 'hint' }, `${p.name}${p.address ? ' · ' + p.address : ''}`), el('div', { class: 'row' }, nextBtn()));
  }

  function onOption(opt, btn) {
    if (!q || q.answered) return; q.answered = true;
    const it = q.items[q.i], p = it.place, ok = opt.id === p.id;
    record(p, ok, { kind: 'name' });
    $$buttons().forEach((b) => { b.disabled = true; });
    banner.hidden = true;
    if (!q.feedback) { btn.classList.add('chosen'); return card.append(el('div', { class: 'qfb' }, 'Antwort gespeichert.'), el('div', { class: 'row' }, nextBtn())); }
    $$buttons().forEach((b) => { if (b.dataset.id === p.id) b.classList.add('right'); });
    if (!ok) btn.classList.add('wrong');
    L.marker([p.lat, p.lng], { icon: ctx.pinIcon(p, { cls: 'target' }), interactive: false }).addTo(overlay);
    card.append(el('div', { class: 'qfb ' + (ok ? 'good' : 'bad') }, ok ? 'Richtig!' : `Falsch – das ist: ${p.name}`), el('div', { class: 'row' }, nextBtn()));
  }
  const $$buttons = () => [...card.querySelectorAll('.opt')];

  function finish() {
    overlay.clearLayers(); ctx.onMapClick = null; banner.hidden = true;
    const n = q.results.length, right = q.results.filter((r) => r.correct).length, pct = n ? Math.round((right / n) * 100) : 0;
    const wo = q.results.filter((r) => r.distance != null);
    const avg = wo.length ? wo.reduce((s, r) => s + r.distance, 0) / wo.length : null;
    const isBest = store.recordBest(q.type, pct);
    const wrong = q.results.filter((r) => !r.correct);
    const again = { type: q.type, poolSel: q.poolSel, n: q.n };
    map.fitBounds(q.bounds, { padding: [30, 30], animate: false });
    showCard(head('Ergebnis'), el('div', { class: 'qtext' }, `${right} von ${n} richtig (${pct} %)${isBest ? ' – neuer Bestwert!' : ''}`),
      avg != null ? el('div', { class: 'hint' }, `Durchschnittliche Distanz bei «Wo ist …?»: ${formatDistance(avg)}`) : null,
      wrong.length ? el('div', {}, el('div', { class: 'hint' }, 'Nochmal anschauen:'), el('ol', {}, wrong.map((r) => el('li', {}, r.name)))) : el('div', { class: 'qfb good' }, 'Alles richtig!'),
      el('div', { class: 'row' }, el('button', { class: 'btn primary', type: 'button', onclick: () => startQuiz(again.type, again.poolSel, again.n) }, 'Nochmal'),
        el('button', { class: 'btn', type: 'button', onclick: stop }, 'Fertig')));
    ctx.renderQuizStats?.();
  }

  // ------------------------------------------------------------ Stufe 4: Pruefungsaufgabe + "Callen"
  let pairsPromise = null;
  const loadPairs = () => (pairsPromise ??= fetch('data/pairs.json?v=3').then((r) => r.json()));

  /** Waehlt eine Aufgabe: schwache (faellige) zuerst, sonst zufaellig. Gibt {key, a, b, route} oder null. */
  async function pickPair() {
    let data; try { data = await loadPairs(); } catch { toast('Routen konnten nicht geladen werden.'); return null; }
    const keys = Object.keys(data.pairs), byId = Object.fromEntries(ctx.allPlaces().map((p) => [p.id, p]));
    const due = dueKeys(store.state.repeat, 'pair:').map((k) => k.slice(5)).filter((k) => data.pairs[k]);
    let key = due.length && Math.random() < 0.6 ? due[0] : null;
    while (!key || key === lastPair) key = keys[Math.floor(Math.random() * keys.length)];
    lastPair = key;
    const [ia, ib] = key.split('|'), a = byId[ia], b = byId[ib];
    return { key, a, b, route: prepRoute(data.pairs[key], 'pair:' + key, `${a.name} → ${b.name}`) };
  }

  async function startExam() {
    const pick = await pickPair(); if (!pick) return;
    exam = { ...pick, groups: streetGroups(pick.route), shown: 0, rated: false };
    begin(); map.fitBounds([[47.17, 8.47], [47.40, 8.72]], { animate: false });
    renderExam();
  }

  function renderExam() {
    overlay.clearLayers();
    const { a, b, groups, shown, route } = exam, N = groups.length;
    setBanner(`Von ${a.label} nach ${b.label}`, 'Überlege die Route und sage sie laut.');
    const kids = [head('Stufe 4 · Prüfungsaufgabe'), el('div', { class: 'qtext' }, `Fahre von ${a.name} nach ${b.name}.`)];
    if (shown > 0) {
      const upto = groups[shown - 1].to;
      const line = slice(route, 0, upto);
      L.polyline(line, { color: '#fff', weight: 11, opacity: 0.85, interactive: false }).addTo(overlay);
      L.polyline(line, { color: '#ef6c00', weight: 6, interactive: false }).addTo(overlay);
      L.polyline(slice(route, groups[shown - 1].s, upto), { color: '#c62828', weight: 7, interactive: false }).addTo(overlay);
      L.marker([a.lat, a.lng], { icon: ctx.pinIcon(a, { cls: 'target' }), interactive: false }).addTo(overlay);
      if (shown >= N) L.marker([b.lat, b.lng], { icon: ctx.pinIcon(b, { cls: 'target' }), interactive: false }).addTo(overlay);
      map.fitBounds(L.latLngBounds(line), { padding: [40, 40], maxZoom: 16, animate: false });
      kids.push(el('div', { class: 'hint' }, `Strasse ${shown} von ${N}`),
        el('ol', { start: Math.max(1, shown - 3) }, groups.slice(Math.max(0, shown - 4), shown).map((g, i, arr) => el('li', {}, i === arr.length - 1 ? el('b', {}, g.name) : g.name))));
    }
    const row = el('div', { class: 'row' });
    if (shown < N) {
      row.append(el('button', { class: 'btn primary', type: 'button', onclick: () => reveal(shown + 1) }, shown === 0 ? 'Aufdecken' : 'Nächste Strasse'),
        el('button', { class: 'btn', type: 'button', onclick: () => reveal(N) }, 'Alles auflösen'));
    } else if (!exam.rated) {
      kids.push(el('div', { class: 'hint' }, `Strecke ca. ${(route.total / 1000).toFixed(1)} km, ca. ${Math.max(1, Math.round(route.seconds / 60))} Min. (ohne Verkehr). Hattest du die Route?`));
      row.append(el('button', { class: 'btn primary', type: 'button', onclick: () => rate(true) }, '✔ Gewusst'), el('button', { class: 'btn', type: 'button', onclick: () => rate(false) }, '✘ Noch nicht'));
    } else {
      row.append(el('button', { class: 'btn primary', type: 'button', onclick: startExam }, 'Nächste Aufgabe'),
        el('button', { class: 'btn', type: 'button', onclick: () => ctx.drive.start(exam.route, { destName: b.name }) }, '▶ Fahrmodus'));
    }
    kids.push(row);
    showCard(...kids);
  }

  function reveal(k) {
    exam.shown = Math.min(k, exam.groups.length);
    if (store.state.settings.voice) speak(`Dann ${exam.groups[exam.shown - 1].name}`);
    renderExam();
  }
  function rate(ok) {
    exam.rated = true;
    store.mutateRepeat((rep) => (ok ? recordRight(rep, 'pair:' + exam.key) : recordWrong(rep, 'pair:' + exam.key)));
    toast(ok ? 'Super!' : 'Kommt später wieder.');
    renderExam();
  }

  // ------------------------------------------------------------ Knoepfe im Menue
  const sel = () => $('#quiz-stufe').value, count = () => Number($('#quiz-count').value);
  $('#btn-heute').addEventListener('click', () => startQuiz('heute', 'alle', 10));
  $('#q-wo').addEventListener('click', () => startQuiz('ueben_wo', sel(), count()));
  $('#q-name').addEventListener('click', () => startQuiz('ueben_name', sel(), count()));
  $('#q-pruefen').addEventListener('click', () => startQuiz('pruefen', sel(), count()));
  $('#q-exam').addEventListener('click', startExam);
  $('#q-lernen').addEventListener('click', () => {
    ctx.setFilter(sel(), false); ctx.setLabels(true); ctx.showView('karte');
    setBanner('Lernen: Pins antippen', 'Namen sind sichtbar. Wenn du bereit bist: «Üben».');
    banner.append(el('button', { class: 'btn', type: 'button', style: 'margin-top:8px;min-height:44px', onclick: () => { banner.hidden = true; ctx.setFilter('alle', false); } }, 'Fertig – alle Orte'));
    const pool = ctx.poolFor(sel()); if (pool.length) map.fitBounds(L.latLngBounds(pool.map((p) => [p.lat, p.lng])), { padding: [40, 40] });
  });

  return { stop, isActive: () => !!(q || exam), startQuiz, startExam, pickPair, state: () => ({ q, exam }) };
}
