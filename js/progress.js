// Lernfortschritt pro Ort (Leitner-System mit 6 Boxen) – rein, ohne Browser.
// prog = { <placeId>: { box: 0..5, due: Zeitstempel, right: n, wrong: n } }
//
// Idee (wie bei Seterra / London-Knowledge-Apps): schwache Orte kommen oefter, sichere seltener.
//   falsch  -> Box 0, in 2 Minuten wieder faellig
//   richtig -> eine Box hoeher, Abstand wird laenger (Box 1: 10 Min., 2: 1 Tag, 3: 3 Tage, 4: 7 Tage, 5: 21 Tage)
// Ampel: rot = noch nicht gelernt oder schwach (Box 0-1), gelb = unterwegs (Box 2-3), gruen = sicher (Box 4-5).

export const MAX_BOX = 5;
export const WAIT_MS = [2 * 60e3, 10 * 60e3, 24 * 3600e3, 3 * 24 * 3600e3, 7 * 24 * 3600e3, 21 * 24 * 3600e3];

export function answer(prog, id, correct, now = Date.now()) {
  const e = prog[id] ?? { box: 0, due: now, right: 0, wrong: 0 };
  if (correct) { e.box = Math.min(MAX_BOX, e.box + 1); e.right += 1; } else { e.box = 0; e.wrong += 1; }
  e.due = now + WAIT_MS[e.box];
  prog[id] = e;
  return e;
}

export function box(prog, id) { return prog[id]?.box ?? 0; }

/** 'rot' | 'gelb' | 'gruen' */
export function mastery(prog, id) {
  const b = box(prog, id);
  return b >= 4 ? 'gruen' : b >= 2 ? 'gelb' : 'rot';
}

export function isDue(prog, id, now = Date.now()) { return !prog[id] || prog[id].due <= now; }

/** Gewicht fuer die Auswahl: neu/schwach und faellig = hoch, sicher und nicht faellig = sehr niedrig. */
export function weight(prog, id, now = Date.now()) {
  const e = prog[id];
  if (!e) return 3;                       // noch nie gefragt
  const base = [5, 4, 2.5, 1.5, 0.8, 0.4][e.box];
  return e.due <= now ? base : base * 0.15; // noch nicht faellig: selten
}

/** Gewichtete Auswahl ohne Zuruecklegen. */
export function pickWeighted(pool, prog, n, now = Date.now(), rng = Math.random) {
  const items = pool.map((p) => ({ p, w: weight(prog, p.id, now) }));
  const out = [];
  const count = n > 0 ? Math.min(n, items.length) : items.length;
  while (out.length < count) {
    const total = items.reduce((s, x) => s + x.w, 0);
    let r = rng() * total, idx = 0;
    for (; idx < items.length - 1; idx++) { r -= items[idx].w; if (r <= 0) break; }
    out.push(items.splice(idx, 1)[0].p);
  }
  return out;
}

/** "Heute ueben": zuerst faellige gelernte Orte (schwaechste zuerst), dann neue/schwache bis n voll ist. */
export function dailySet(pool, prog, n = 10, now = Date.now()) {
  const due = pool.filter((p) => prog[p.id] && prog[p.id].due <= now).sort((a, b) => prog[a.id].box - prog[b.id].box || prog[a.id].due - prog[b.id].due);
  const fresh = pool.filter((p) => !prog[p.id]);
  const weak = pool.filter((p) => prog[p.id] && prog[p.id].due > now && prog[p.id].box <= 1);
  return [...due, ...fresh, ...weak].slice(0, n);
}

/** Anzahl heute faelliger Orte (gelernt und faellig). Neue Orte zaehlen bis zum Tagesziel mit. */
export function dueTodayCount(pool, prog, n = 10, now = Date.now()) { return dailySet(pool, prog, n, now).length; }

/** Fortschritt eines Pools: { n, rot, gelb, gruen, pct } – pct = Anteil sicherer Orte. */
export function summary(pool, prog) {
  const r = { n: pool.length, rot: 0, gelb: 0, gruen: 0, pct: 0 };
  for (const p of pool) r[mastery(prog, p.id)] += 1;
  r.pct = r.n ? Math.round((r.gruen / r.n) * 100) : 0;
  return r;
}
