// Quiz-Logik ohne Browser: Fragen waehlen, Antwortoptionen, Auswertung. Zufall ist austauschbar (rng),
// damit die Tests deterministisch laufen.
import { distanceM, scorePoints, isHit } from './geo.js?v=5';

/** Fisher-Yates-Mischen (neues Array). */
export function shuffle(arr, rng = Math.random) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

/** Waehlt n verschiedene Orte aus dem Pool in zufaelliger Reihenfolge (n = 0 oder zu gross: alle). */
export function pickQuestions(pool, n, rng = Math.random) {
  const s = shuffle(pool, rng);
  return n > 0 ? s.slice(0, Math.min(n, s.length)) : s;
}

/**
 * Vier Antwortoptionen fuer "Welcher Ort ist das?": die richtige plus drei falsche.
 * Die falschen stammen bevorzugt aus den 7 naechstgelegenen Orten (damit es nicht zu leicht ist).
 */
export function makeOptions(correct, all, rng = Math.random) {
  const others = all.filter((p) => p.id !== correct.id)
    .sort((a, b) => distanceM(correct, a) - distanceM(correct, b));
  const near = others.slice(0, 7);
  const wrong = shuffle(near, rng).slice(0, 3);
  return shuffle([correct, ...wrong], rng);
}

/** Auswertung einer Runde "Wo ist ...?". results: [{id, distance}] */
export function summarizeWo(results) {
  const n = results.length;
  const points = results.reduce((s, r) => s + scorePoints(r.distance), 0);
  const hits = results.filter((r) => isHit(r.distance)).length;
  const avg = n ? results.reduce((s, r) => s + r.distance, 0) / n : 0;
  return { n, points, max: n * 100, hits, avgDistance: avg, pct: n ? Math.round((points / (n * 100)) * 100) : 0 };
}

/** Auswertung einer Runde "Welcher Ort?". results: [{id, correct}] */
export function summarizeName(results) {
  const n = results.length;
  const right = results.filter((r) => r.correct).length;
  return { n, right, pct: n ? Math.round((right / n) * 100) : 0 };
}
