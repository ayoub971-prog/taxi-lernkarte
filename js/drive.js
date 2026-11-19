// Rechenkern des Fahrmodus (rein, ohne Browser): Routen vorbereiten, Auto auf der Strecke
// positionieren, Fahrhinweise auf Deutsch, Orte entlang der Strecke, Fragen waehrend der Fahrt.
//
// Routenformat (aus data/*.json, gebaut von tools/fetch-routes.mjs):
//   { c: [lat,lng,lat,lng,...], st: [[meter, name, ref, typ, richtung, ausfahrt, entscheidung], ...], d: meter, t: sekunden }
import { distanceM } from './geo.js?v=2';
import { shuffle, makeOptions } from './quiz.js?v=2';

/** Basisgeschwindigkeit in m/s bei 1x (50 km/h). */
export const BASE_SPEED = 50 / 3.6;

export function prepRoute(raw, id, title) {
  const pts = [];
  for (let i = 0; i < raw.c.length; i += 2) pts.push({ lat: raw.c[i], lng: raw.c[i + 1] });
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + distanceM(pts[i - 1], pts[i]));
  const steps = raw.st.map(([s, name, ref, type, mod, exit, k]) => ({ s, name, ref, type, mod, exit, k }));
  return { id, title, pts, cum, total: cum[cum.length - 1], steps, seconds: raw.t };
}

/** Index des letzten Punkts, dessen Meterstand <= s ist (binaere Suche). */
function idxAt(route, s) {
  let lo = 0, hi = route.cum.length - 1;
  while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (route.cum[mid] <= s) lo = mid; else hi = mid - 1; }
  return lo;
}

/** Position auf der Strecke bei s Metern (linear zwischen den Punkten). */
export function posAt(route, s) {
  s = Math.max(0, Math.min(route.total, s));
  const i = idxAt(route, s);
  if (i >= route.pts.length - 1) return { ...route.pts[route.pts.length - 1], i };
  const a = route.pts[i], b = route.pts[i + 1];
  const seg = route.cum[i + 1] - route.cum[i];
  const t = seg > 0 ? (s - route.cum[i]) / seg : 0;
  return { lat: a.lat + (b.lat - a.lat) * t, lng: a.lng + (b.lng - a.lng) * t, i };
}

/** Himmelsrichtung in Grad (0 = Nord, 90 = Ost) von a nach b. */
export function bearing(a, b) {
  const rad = Math.PI / 180;
  const y = Math.sin((b.lng - a.lng) * rad) * Math.cos(b.lat * rad);
  const x = Math.cos(a.lat * rad) * Math.sin(b.lat * rad) - Math.sin(a.lat * rad) * Math.cos(b.lat * rad) * Math.cos((b.lng - a.lng) * rad);
  return (Math.atan2(y, x) / rad + 360) % 360;
}

/** Teilstueck der Strecke von s0 bis s1 als Liste von [lat,lng] (fuer Linien auf der Karte). */
export function slice(route, s0, s1) {
  s0 = Math.max(0, s0); s1 = Math.min(route.total, s1);
  if (s1 <= s0) return [];
  const out = [posAt(route, s0)];
  for (let i = idxAt(route, s0) + 1; i < route.pts.length && route.cum[i] < s1; i++) out.push(route.pts[i]);
  out.push(posAt(route, s1));
  return out.map((p) => [p.lat, p.lng]);
}

/** Strassenabschnitte fuer "Callen": aufeinanderfolgende Schritte mit gleichem Namen werden zusammengefasst. */
export function streetGroups(route) {
  const groups = [];
  route.steps.forEach((st, i) => {
    if (st.type === 'arrive') return;
    const name = streetName(st);
    const last = groups[groups.length - 1];
    if (last && (!name || name === last.name)) return; // gleiche oder namenlose Strasse: weiter im selben Abschnitt
    groups.push({ name: name || 'Weiter geradeaus', s: i === 0 ? 0 : st.s, type: st.type, mod: st.mod });
  });
  groups.forEach((g, i) => { g.to = i + 1 < groups.length ? groups[i + 1].s : route.total; });
  return groups.filter((g) => g.to - g.s > 0);
}

/** Fahrtrichtung bei s: Blick 25 m voraus (am Ende 25 m zurueck). */
export function headingAt(route, s, look = 25) {
  const a = posAt(route, Math.min(s, Math.max(0, route.total - look)));
  const b = posAt(route, Math.min(route.total, Math.min(s, Math.max(0, route.total - look)) + look));
  return bearing(a, b);
}

/** Kuerzester Winkelweg von 'from' nach 'to' in Grad (-180..180). */
export function angleDiff(from, to) { return ((to - from + 540) % 360) - 180; }

export function streetName(step) { return step?.name || step?.ref || ''; }

/** Aktueller Schritt (letzter, dessen Start bei s oder davor liegt) – gibt die Strasse, auf der man gerade faehrt. */
export function currentStep(route, s) {
  let cur = route.steps[0];
  for (const st of route.steps) { if (st.s <= s) cur = st; else break; }
  return cur;
}

/** Naechste Entscheidungsstelle (Abbiegen, Kreisel, Auffahrt ...) nach s. */
export function nextDecision(route, s) {
  for (let i = 0; i < route.steps.length; i++) {
    const st = route.steps[i];
    if (st.k && st.s > s + 1 && st.type !== 'depart') return { step: st, index: i, dist: st.s - s };
  }
  return null;
}

const ANGLE = { left: -90, right: 90, 'slight left': -45, 'slight right': 45, 'sharp left': -135, 'sharp right': 135, uturn: 180, straight: 0 };
const DIR = {
  left: 'links abbiegen', right: 'rechts abbiegen', 'slight left': 'leicht links abbiegen', 'slight right': 'leicht rechts abbiegen',
  'sharp left': 'scharf links abbiegen', 'sharp right': 'scharf rechts abbiegen', uturn: 'wenden', straight: 'geradeaus weiterfahren',
};
const HOLD = { left: 'links halten', 'slight left': 'links halten', 'sharp left': 'links halten', right: 'rechts halten', 'slight right': 'rechts halten', 'sharp right': 'rechts halten', straight: 'geradeaus halten' };

/** Fahrhinweis zu einem Schritt: { text, angle, icon } – angle fuer den Pfeil, icon fuer Sonderfaelle. */
export function instruction(step) {
  const n = streetName(step);
  const inn = n ? ` in ${n}` : '';
  const angle = ANGLE[step.mod] ?? 0;
  switch (step.type) {
    case 'arrive': return { text: 'Ziel erreicht', angle: 0, icon: 'ziel' };
    case 'depart': return { text: n ? `Losfahren auf ${n}` : 'Losfahren', angle: 0 };
    case 'roundabout': case 'rotary':
      return { text: step.exit ? `Im Kreisel ${step.exit}. Ausfahrt nehmen${inn}` : `Kreisel: ${DIR[step.mod] || 'weiterfahren'}${inn}`, angle, icon: 'kreisel', exit: step.exit };
    case 'roundabout turn': return { text: `Im Kreisel ${DIR[step.mod] || 'weiterfahren'}${inn}`, angle, icon: 'kreisel' };
    case 'on ramp': return { text: `Auf die Autobahn auffahren${step.ref ? ` (${step.ref})` : ''}`, angle };
    case 'off ramp': return { text: `Autobahn verlassen${inn}`, angle };
    case 'merge': return { text: `Einspuren${inn}`, angle };
    case 'fork': return { text: `${HOLD[step.mod] || 'Halten'}${inn}`, angle };
    case 'end of road': return { text: `Am Ende der Strasse ${DIR[step.mod] || 'abbiegen'}${inn}`, angle };
    case 'turn': return { text: `${DIR[step.mod] || 'Abbiegen'}${inn}`, angle };
    default: return { text: `Weiter${inn}`, angle: 0 };
  }
}

/** "300 m" / "1.2 km" fuer die Anzeige "In ... m" (auf 10 m gerundet unter 1 km). */
export function shortDist(m) {
  if (m < 1000) return `${Math.max(10, Math.round(m / 10) * 10)} m`;
  return `${(m / 1000).toFixed(1)} km`;
}

/** Orte, die hoechstens maxOff Meter von der Strecke entfernt liegen, mit Meterstand s, sortiert nach s. */
export function placesAlong(route, places, maxOff = 150) {
  const out = [];
  for (const pl of places) {
    let best = null;
    for (let i = 0; i < route.pts.length; i++) {
      const d = distanceM(route.pts[i], pl);
      if (!best || d < best.d) best = { d, i };
    }
    // Punkte liegen bis ~150 m auseinander: Abstand zur Strecke grob nachpruefen, indem wir Nachbarsegmente abtasten
    let off = best.d, s = route.cum[best.i];
    for (const j of [best.i - 1, best.i]) {
      if (j < 0 || j >= route.pts.length - 1) continue;
      const a = route.pts[j], b = route.pts[j + 1], seg = route.cum[j + 1] - route.cum[j];
      for (let k = 1; k < 10; k++) {
        const t = k / 10, q = { lat: a.lat + (b.lat - a.lat) * t, lng: a.lng + (b.lng - a.lng) * t };
        const d = distanceM(q, pl); if (d < off) { off = d; s = route.cum[j] + seg * t; }
      }
    }
    if (off <= maxOff) out.push({ place: pl, s, off });
  }
  return out.sort((a, b) => a.s - b.s);
}

const TURN_Q_TYPES = new Set(['turn', 'end of road', 'fork']);
const sideOf = (mod) => (/left/.test(mod) ? 'Links' : /right/.test(mod) ? 'Rechts' : 'Geradeaus');

/**
 * Plant die Fragen fuer eine Fahrt (Meterstand, an dem das Auto anhaelt).
 * - 'turn': "Wohin geht es an der naechsten Kreuzung?" (Links/Rechts/Geradeaus) bzw. Kreisel-Ausfahrt
 * - 'next': "Welcher Ort kommt als naechstes?" (4 Orte)
 * repeatKeys: Schluessel aus der Wiederholliste, die unbedingt gefragt werden.
 */
export function planQuestions(route, along, allPlaces, { rng = Math.random, repeatKeys = new Set(), minGap = 600, maxCount = 8 } = {}) {
  const qs = [];
  route.steps.forEach((st) => {
    if (!st.k || st.s < 250 || st.s > route.total - 150) return;
    const key = `turn:${route.id}:${st.s}`;
    if (TURN_Q_TYPES.has(st.type) && ANGLE[st.mod] !== undefined && st.mod !== 'uturn') {
      qs.push({ kind: 'turn', at: Math.max(0, st.s - 120), key, step: st, answer: sideOf(st.mod), options: ['Links', 'Rechts', 'Geradeaus'], forced: repeatKeys.has(key), r: rng() });
    } else if ((st.type === 'roundabout' || st.type === 'rotary') && st.exit >= 1 && st.exit <= 4) {
      qs.push({ kind: 'turn', at: Math.max(0, st.s - 120), key, step: st, answer: `${st.exit}. Ausfahrt`, options: ['1. Ausfahrt', '2. Ausfahrt', '3. Ausfahrt', '4. Ausfahrt'], forced: repeatKeys.has(key), r: rng() });
    }
  });
  along.forEach((a, i) => {
    const prev = i ? along[i - 1].s : 0;
    const gap = a.s - prev;
    if (a.s < 700 || gap < 700) return;
    const key = `ort:${a.place.id}`;
    qs.push({ kind: 'next', at: a.s - Math.min(1500, gap / 2), key, place: a.place, answer: a.place.id, options: makeOptions(a.place, allPlaces, rng).map((p) => ({ id: p.id, label: p.label })), forced: repeatKeys.has(key), r: rng() });
  });
  // Auswahl: zuerst die erzwungenen, dann zufaellig; Mindestabstand einhalten
  qs.sort((a, b) => (b.forced - a.forced) || (a.r - b.r));
  const kept = [];
  for (const q of qs) {
    if (kept.length >= maxCount) break;
    if (kept.every((k) => Math.abs(k.at - q.at) >= minGap)) kept.push(q);
  }
  return kept.sort((a, b) => a.at - b.at);
}

/** Texte fuer eine Frage. current = Name der Strasse, auf der man gerade faehrt. */
export function questionText(q, current, destName) {
  if (q.kind === 'next') return 'Welcher Ort kommt als Nächstes?';
  if (q.step.type === 'roundabout' || q.step.type === 'rotary') return `Du kommst zum Kreisel${current ? ` (auf ${current})` : ''}. Welche Ausfahrt führt Richtung ${destName}?`;
  return `Du fährst${current ? ` auf ${current}` : ''}. Wohin geht es an der nächsten Kreuzung Richtung ${destName}?`;
}

export { shuffle };
