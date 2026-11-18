// Speicher fuer eigene Orte, Einstellungen und Quiz-Bestwerte (localStorage) + JSON-Sicherung.
// Alles ausser createStore() ist rein und wird mit "node --test" geprueft.
// Der Speicher wird von aussen uebergeben (window.localStorage oder eine Test-Attrappe).

export const STORAGE_KEY = 'taxi-lernkarte-v1';
export const BACKUP_FORMAT = 1;

export const DEFAULT_STATE = () => ({ places: [], settings: { labels: true, voice: false, questions: true }, stats: {}, repeat: {}, progress: {} });

const clampStr = (v, max) => String(v ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max);

/** Prueft und bereinigt einen eigenen Ort. Gibt null zurueck, wenn er unbrauchbar ist. */
export function cleanPlace(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const lat = Number(raw.lat), lng = Number(raw.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  const name = clampStr(raw.name, 80);
  if (!name) return null;
  return {
    id: clampStr(raw.id, 40) || newId(),
    name, label: clampStr(raw.label, 40) || name,
    note: clampStr(raw.note, 500),
    lat: Math.round(lat * 1e7) / 1e7, lng: Math.round(lng * 1e7) / 1e7,
    created: Number.isFinite(Number(raw.created)) ? Number(raw.created) : Date.now(),
  };
}

export function newId(rng = Math.random, now = Date.now) {
  return 'u' + now().toString(36) + Math.floor(rng() * 36 ** 4).toString(36).padStart(4, '0');
}

/** Fuegt eingehende Orte hinzu. Doppelte (gleiche id oder gleicher Name + weniger als 30 m Abstand) werden uebersprungen. */
export function mergePlaces(existing, incoming) {
  const out = existing.slice();
  let added = 0, skipped = 0;
  for (const raw of incoming) {
    const p = cleanPlace(raw);
    if (!p) { skipped++; continue; }
    const dup = out.some((e) => e.id === p.id || (e.name.toLowerCase() === p.name.toLowerCase()
      && Math.abs(e.lat - p.lat) < 0.0003 && Math.abs(e.lng - p.lng) < 0.0003));
    if (dup) { skipped++; continue; }
    out.push(p); added++;
  }
  return { places: out, added, skipped };
}

/** Baut die JSON-Sicherung (Text). */
export function makeBackup(state, now = new Date()) {
  return JSON.stringify({
    app: 'taxi-lernkarte', format: BACKUP_FORMAT, exportedAt: now.toISOString(),
    places: state.places, stats: state.stats || {}, repeat: state.repeat || {}, progress: state.progress || {},
  }, null, 2);
}

/** Liest eine JSON-Sicherung. Gibt {places, stats, repeat, progress} oder {error} zurueck. */
export function parseBackup(text) {
  let data;
  try { data = JSON.parse(text); } catch { return { error: 'Die Datei ist keine gültige JSON-Datei.' }; }
  if (!data || data.app !== 'taxi-lernkarte' || !Array.isArray(data.places)) {
    return { error: 'Das ist keine Sicherung der Taxi-Lernkarte.' };
  }
  if (Number(data.format) > BACKUP_FORMAT) return { error: 'Die Sicherung stammt von einer neueren Version der App.' };
  const stats = data.stats && typeof data.stats === 'object' ? data.stats : {};
  const repeat = data.repeat && typeof data.repeat === 'object' ? data.repeat : {};
  const progress = data.progress && typeof data.progress === 'object' ? data.progress : {};
  return { places: data.places, stats, repeat, progress };
}

/** Speicher-Objekt: laedt beim Start, speichert nach jeder Aenderung. */
export function createStore(storage) {
  let state = DEFAULT_STATE();
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (raw) {
      const d = JSON.parse(raw);
      state.places = (Array.isArray(d.places) ? d.places : []).map(cleanPlace).filter(Boolean);
      state.settings = { ...state.settings, ...(d.settings && typeof d.settings === 'object' ? d.settings : {}) };
      state.stats = d.stats && typeof d.stats === 'object' ? d.stats : {};
      state.repeat = d.repeat && typeof d.repeat === 'object' ? d.repeat : {};
      state.progress = d.progress && typeof d.progress === 'object' ? d.progress : {};
    }
  } catch { /* kaputte Daten: mit leerem Zustand starten */ }

  const save = () => { try { storage.setItem(STORAGE_KEY, JSON.stringify(state)); return true; } catch { return false; } };

  return {
    get state() { return state; },
    save,
    addPlace(raw) { const p = cleanPlace({ ...raw, id: undefined, created: Date.now() }); if (!p) return null; state.places.push(p); save(); return p; },
    updatePlace(id, patch) {
      const i = state.places.findIndex((p) => p.id === id); if (i < 0) return null;
      const p = cleanPlace({ ...state.places[i], ...patch, id }); if (!p) return null;
      state.places[i] = p; save(); return p;
    },
    removePlace(id) { const n = state.places.length; state.places = state.places.filter((p) => p.id !== id); save(); return state.places.length < n; },
    importPlaces(incoming) { const r = mergePlaces(state.places, incoming); state.places = r.places; save(); return r; },
    /** Wiederholliste (siehe repeat.js) bearbeiten und speichern: store.mutateRepeat((rep) => recordWrong(rep, key)) */
    mutateRepeat(fn) { fn(state.repeat); save(); },
    /** Fortschritt pro Ort bearbeiten: store.mutateProgress((prog) => answer(prog, id, true)) */
    mutateProgress(fn) { fn(state.progress); save(); },
    resetProgress() { state.progress = {}; state.repeat = {}; state.stats = {}; save(); },
    setSetting(key, value) { state.settings[key] = value; save(); },
    recordBest(mode, pct) { const old = state.stats[mode]?.best ?? 0; state.stats[mode] = { best: Math.max(old, pct), last: pct, runs: (state.stats[mode]?.runs ?? 0) + 1 }; save(); return pct > old; },
  };
}
