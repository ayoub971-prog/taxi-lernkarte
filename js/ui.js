// Kleine Browser-Helfer: Elemente bauen, Hinweis-Toast, Bestaetigungsdialog, Sprachausgabe.
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

/** el('button', {class: 'btn', onclick: fn}, 'Text', childNode) – Text wird immer als Text eingesetzt (kein HTML). */
export function el(tag, attrs = {}, ...kids) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else if (k === 'class') node.className = v;
    else node.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) if (kid != null && kid !== false) node.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  return node;
}

let toastTimer;
export function toast(msg, ms = 2600) {
  const t = $('#toast'); t.textContent = msg; t.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, ms);
}

/** Bestaetigungsdialog; gibt true (OK) oder false (Abbrechen) zurueck. */
export function confirmDialog(text, yes = 'OK', no = 'Abbrechen') {
  return new Promise((resolve) => {
    const dlg = $('#dlg-msg');
    $('#msg-text').textContent = text; $('#msg-yes').textContent = yes; $('#msg-no').textContent = no;
    $('#msg-no').hidden = !no;
    const done = (v) => { dlg.close(); resolve(v); };
    $('#msg-yes').onclick = () => done(true); $('#msg-no').onclick = () => done(false);
    dlg.oncancel = () => resolve(false);
    dlg.showModal();
  });
}

/** Sprachausgabe (speechSynthesis), bevorzugt de-CH, sonst eine andere deutsche Stimme. Tut nichts, wenn nicht verfuegbar. */
export function speak(text) {
  try {
    const synth = window.speechSynthesis; if (!synth) return;
    synth.cancel();
    const u = new SpeechSynthesisUtterance(text);
    const voices = synth.getVoices();
    const v = voices.find((x) => x.lang === 'de-CH') || voices.find((x) => /^de/i.test(x.lang));
    if (v) { u.voice = v; u.lang = v.lang; } else u.lang = 'de-CH';
    u.rate = 1;
    synth.speak(u);
  } catch { /* Sprache ist optional */ }
}
