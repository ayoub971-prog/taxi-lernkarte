// Beschriftungen der Orte: gross, weiss mit dunklem Rand, immer lesbar.
// Damit sich nichts ueberdeckt, probiert jede Beschriftung vier Plaetze um den Pin
// (rechts, links, oben, unten). Findet sich kein freier Platz, bleibt nur der Pin sichtbar,
// bis man naeher heranzoomt. Wichtigere Orte (Amt, Bahnhof, Spital …) werden zuerst platziert.
// Die Funktion arbeitet nur mit DOM-Rechtecken und gilt darum fuer Leaflet UND MapLibre.
import { TYPEN } from './places.js?v=6';

/** Je kleiner, desto frueher platziert (und desto eher sichtbar, wenn es eng wird). */
export function labelPriority(p) {
  if (p.own) return 9;
  const i = ['Amt', 'Bahnhof', 'Spital', 'Platz', 'Hafen', 'Einkauf', 'Ort'].indexOf(p.type);
  return (i < 0 ? TYPEN.length : i) + (p.stufe || 0) / 10;
}

const PIN_W = 44, PIN_H = 48, GAP = 3;
const SLOTS = ['pos-r', 'pos-l', 'pos-t', 'pos-b'];

/** Rechteck der Beschriftung in Bildschirm-Koordinaten fuer einen Platz. L/T = linke obere Ecke des Pins. */
export function slotRect(slot, L, T, w, h) {
  switch (slot) {
    case 'pos-l': return { left: L - w, top: T + 21 - h / 2, right: L, bottom: T + 21 + h / 2 };
    case 'pos-t': return { left: L + 22 - w / 2, top: T + 2 - h, right: L + 22 + w / 2, bottom: T + 2 };
    case 'pos-b': return { left: L + 22 - w / 2, top: T + 48, right: L + 22 + w / 2, bottom: T + 48 + h };
    default: return { left: L + PIN_W, top: T + 21 - h / 2, right: L + PIN_W + w, bottom: T + 21 + h / 2 };
  }
}

const hit = (a, b) => a.left - GAP < b.right && a.right + GAP > b.left && a.top - GAP < b.bottom && a.bottom + GAP > b.top;

/** Platziert alle Beschriftungen innerhalb von `container` neu. Gibt die Zahl sichtbarer Beschriftungen zurueck. */
export function layoutLabels(container) {
  if (!container || !container.offsetWidth) return 0;
  const pins = [...container.querySelectorAll('.pin')];
  const items = pins.map((pin) => ({ pin, lab: pin.querySelector('.pin-label'), prio: Number(pin.dataset.prio || 5) }));
  for (const it of items) it.lab?.classList.remove('hide', ...SLOTS);
  if (container.classList.contains('labels-off')) return 0;
  const cr = container.getBoundingClientRect();
  const dots = items.map((it) => {
    const r = it.pin.getBoundingClientRect();
    return { it, L: r.left, T: r.top, box: { left: r.left + 5, top: r.top + 4, right: r.left + 39, bottom: r.top + 44 } };
  });
  const placed = [];
  let shown = 0;
  for (const d of [...dots].sort((a, b) => a.it.prio - b.it.prio)) {
    const lab = d.it.lab; if (!lab) continue;
    const onScreen = d.L > cr.left - 60 && d.L < cr.right + 20 && d.T > cr.top - 60 && d.T < cr.bottom + 20;
    const w = lab.offsetWidth, h = lab.offsetHeight;
    let ok = false;
    if (onScreen) {
      for (const slot of SLOTS) {
        const r = slotRect(slot, d.L, d.T, w, h);
        const inside = r.left >= cr.left + 2 && r.right <= cr.right - 2 && r.top >= cr.top + 2 && r.bottom <= cr.bottom - 2;
        if (!inside) continue;
        if (placed.some((p) => hit(r, p)) || dots.some((o) => o !== d && hit(r, o.box))) continue;
        lab.classList.add(slot); placed.push(r); ok = true; shown += 1; break;
      }
    }
    if (!ok) lab.classList.add('hide');
  }
  return shown;
}
