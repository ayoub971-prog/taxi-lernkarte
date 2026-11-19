// Service Worker der Taxi-Lernkarte.
//  - App-Huelle (HTML, CSS, JS, Leaflet, Routen-Daten, Icons) wird beim Installieren zwischengespeichert -> App startet offline.
//  - OSM-Kartenkacheln: nur Kacheln, die du wirklich angesehen hast, werden gemerkt (max. 400, 7 Tage).
//    KEIN Vorab-Laden ganzer Gebiete (OSM-Kachelregeln). Beim allerersten Ansehen eines Ausschnitts braucht es Internet.
//  - 3D-Ansicht: Vektorkacheln, Stil, Schriften und Symbole von tiles.openfreemap.org werden ebenfalls nur gemerkt, wenn du sie
//    angesehen hast (max. 600 Dateien, 7 Tage). Auch hier: kein Vorab-Laden.
// NEUE VERSION VEROEFFENTLICHEN: VERSION erhoehen (am einfachsten: node tools/bump-version.mjs 2).
const VERSION = '2';
const SHELL = `taxi-lernkarte-shell-v${VERSION}`;
const TILES = 'taxi-lernkarte-tiles';
const MAX_TILES = 400;
const VTILES = 'taxi-lernkarte-vtiles';
const MAX_VTILES = 600;
const TILE_MAX_AGE_MS = 7 * 24 * 3600 * 1000;

const ASSETS = [
  './', 'index.html', 'styles.css?v=2', 'manifest.webmanifest?v=2',
  'icons/icon.svg?v=2', 'icons/icon-192.png?v=2', 'icons/icon-512.png?v=2', 'icons/icon-maskable-512.png?v=2',
  'vendor/leaflet/leaflet.css?v=2', 'vendor/leaflet/leaflet.js?v=2',
  'vendor/leaflet/images/layers.png', 'vendor/leaflet/images/layers-2x.png', 'vendor/leaflet/images/marker-icon.png', 'vendor/leaflet/images/marker-icon-2x.png', 'vendor/leaflet/images/marker-shadow.png',
  'js/app.js?v=2', 'js/places.js?v=2', 'js/geo.js?v=2', 'js/quiz.js?v=2', 'js/store.js?v=2', 'js/progress.js?v=2', 'js/repeat.js?v=2',
  'js/drive.js?v=2', 'js/drivemode.js?v=2', 'js/map3d.js?v=2', 'js/labels.js?v=2', 'js/game.js?v=2', 'js/gamemode.js?v=2', 'js/overview.js?v=2', 'js/controls.js?v=2', 'js/quizmode.js?v=2', 'js/ui.js?v=2',
  'vendor/maplibre/maplibre-gl.css?v=2', 'vendor/maplibre/maplibre-gl.js?v=2',
  'data/routes-ab.json?v=2', 'data/pairs.json?v=2', 'data/graph.json?v=2',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(SHELL).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith('taxi-lernkarte-shell-') && k !== SHELL) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.hostname === 'tile.openstreetmap.org') return e.respondWith(tile(req, TILES, MAX_TILES));
  if (url.hostname === 'tiles.openfreemap.org') {
    const isTile = /\.(pbf|png)$/.test(url.pathname) && /^\/(planet|natural_earth)\//.test(url.pathname);
    return e.respondWith(isTile ? tile(req, VTILES, MAX_VTILES) : networkFirst(req));   // Stil/TileJSON/Schriften: aktuell bevorzugen
  }
  if (url.origin !== location.origin) return; // alles andere (z. B. Nominatim) nie anfassen
  if (req.mode === 'navigate') return e.respondWith(caches.match('index.html').then((r) => r || fetch(req)));
  e.respondWith(caches.match(req).then((r) => r || fetch(req)));
});

async function stamp(res) { // Zeitstempel in die zwischengespeicherte Antwort schreiben
  const h = new Headers(res.headers); h.set('x-cached-at', String(Date.now()));
  return new Response(await res.blob(), { status: res.status, statusText: res.statusText, headers: h });
}

async function tile(req, name, max) {
  const cache = await caches.open(name);
  const hit = await cache.match(req);
  if (hit && Date.now() - Number(hit.headers.get('x-cached-at') || 0) < TILE_MAX_AGE_MS) return hit;
  try {
    const res = await fetch(req);
    if (res.ok && res.type !== 'opaque') {
      await cache.put(req, await stamp(res.clone()));
      const keys = await cache.keys();
      if (keys.length > max) await Promise.all(keys.slice(0, keys.length - max + 40).map((k) => cache.delete(k)));
    }
    return res;
  } catch {
    return hit || Response.error(); // offline und nie gesehen: leere Kachel
  }
}

async function networkFirst(req) {
  const cache = await caches.open(VTILES);
  try {
    const res = await fetch(req);
    if (res.ok && res.type !== 'opaque') await cache.put(req, await stamp(res.clone()));
    return res;
  } catch {
    return (await cache.match(req)) || Response.error();
  }
}
