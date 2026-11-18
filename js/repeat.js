// Einfache Wiederholung (Leitner-System) fuer falsch beantwortete Fragen. Rein, ohne Browser.
// Die Wiederholliste ist ein Objekt { schluessel: {box, due, wrong} }. Schluessel:
//   'ort:<placeId>'            Ort im Quiz (Wo ist ...? / Welcher Ort?) oder "naechster Ort" beim Fahren
//   'turn:<routeId>:<meter>'   falsch beantwortete Abbiege-Frage an einer Stelle einer Route
//   'pair:<von>|<nach>'        Pruefungsaufgabe, die nicht gewusst wurde
// Falsch -> Box 0, in 2 Minuten wieder faellig. Richtig (wenn faellig) -> naechste Box mit
// laengerem Abstand. Nach der letzten Box richtig: Eintrag verschwindet.

export const INTERVALS_MS = [2 * 60e3, 10 * 60e3, 24 * 3600e3, 3 * 24 * 3600e3, 7 * 24 * 3600e3];

export function recordWrong(rep, key, now = Date.now()) {
  rep[key] = { box: 0, due: now + INTERVALS_MS[0], wrong: (rep[key]?.wrong ?? 0) + 1 };
}

/** Richtige Antwort: nur zaehlen, wenn der Eintrag existiert. Gibt true zurueck, wenn er jetzt geloescht wurde. */
export function recordRight(rep, key, now = Date.now()) {
  const e = rep[key]; if (!e) return false;
  if (e.box >= INTERVALS_MS.length - 1) { delete rep[key]; return true; }
  e.box += 1; e.due = now + INTERVALS_MS[e.box]; return false;
}

/** Schluessel (mit Praefix), die jetzt faellig sind, aelteste zuerst. */
export function dueKeys(rep, prefix = '', now = Date.now()) {
  return Object.keys(rep).filter((k) => k.startsWith(prefix) && rep[k].due <= now).sort((a, b) => rep[a].due - rep[b].due);
}

/** Alle gemerkten Schluessel mit Praefix (faellig oder nicht). */
export function allKeys(rep, prefix = '') {
  return Object.keys(rep).filter((k) => k.startsWith(prefix)).sort((a, b) => rep[a].due - rep[b].due);
}

/** Gemerkte Ort-Ids (fuer das Quiz), nur faellige oder alle. */
export function placeIds(rep, onlyDue = true, now = Date.now()) {
  return (onlyDue ? dueKeys(rep, 'ort:', now) : allKeys(rep, 'ort:')).map((k) => k.slice(4));
}
