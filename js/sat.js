// Satellit: Luftbild swisstopo SWISSIMAGE (OGD, ohne Schluessel und Konto) statt der Strassenkarte.
//   Quelle/Bedingungen: https://www.swisstopo.admin.ch/de/nutzungsbedingungen-kostenlose-geodaten-und-geodienste  (Quellenangabe «© swisstopo» Pflicht)
//   Fair Use des Kartendienstes wmts.geo.admin.ch: 1'200 Anfragen pro Minute, wir laden nur, was auf dem Bildschirm ist.
// 2D (Leaflet): eigene Kachelebene statt der OSM-Kacheln. Fahrersicht (MapLibre): Rasterquelle unter den Vektorebenen (map3d.js).
// Die Wahl steht in settings.satellite und wird gemerkt. Knoepfe: alle Elemente mit der Klasse .sat-btn.
import { SAT_URL } from './map3d.js?v=6';

export function initSat(ctx) {
  const { L, map, store, gl } = ctx;
  let layer = null;
  const isOn = () => store.state.settings.satellite === true;

  function apply() {
    const on = isOn();
    if (on && !layer) {
      layer = L.tileLayer(SAT_URL, {
        maxZoom: 19, crossOrigin: true, updateInterval: 120, keepBuffer: 3,
        attribution: '© <a href="https://www.swisstopo.admin.ch/de/nutzungsbedingungen-kostenlose-geodaten-und-geodienste" target="_blank" rel="noopener">swisstopo</a>',
      }).addTo(map);
      layer.bringToBack();
      if (ctx.osmLayer) map.removeLayer(ctx.osmLayer);
    } else if (!on && layer) {
      map.removeLayer(layer); layer = null;
      if (ctx.osmLayer) { ctx.osmLayer.addTo(map); ctx.osmLayer.bringToBack(); }
    }
    gl.setSatellite();
    document.querySelector('#app').dataset.sat = on ? '1' : '0';
    document.querySelectorAll('.sat-btn').forEach((b) => {
      b.setAttribute('aria-pressed', String(on));
      const t = b.querySelector("small, span"); if (t) t.textContent = on ? '© swisstopo' : 'Satellit';
      const i = b.querySelector('b'); if (i) i.textContent = on ? '🗺️' : '🛰️';
    });
  }
  const set = (on) => { store.setSetting('satellite', !!on); apply(); };
  document.addEventListener('click', (e) => { if (e.target.closest?.('.sat-btn')) set(!isOn()); });
  apply();
  return { isOn, set, toggle: () => set(!isOn()), url: SAT_URL };
}
