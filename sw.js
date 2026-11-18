// Service Worker der Taxi-Lernkarte.
//  - App-Huelle (HTML, CSS, JS, Leaflet, Routen-Daten, Icons) wird beim Installieren zwischengespeichert -> App startet offline.
//  - OSM-Kartenkacheln: nur Kacheln, die du wirklich angesehen hast, werden gemerkt (max. 400, 7 Tage).
//    KEIN Vorab-Laden ganzer Gebiete (OSM-Kachelregeln). Beim allerersten Ansehen eines Ausschnitts braucht es Internet.
// NEUE VERSION VEROEFFENTLICHEN: VERSION erhoehen (am einfachsten: node tools/bump-version.mjs 2).
const VERSION = '1';
const SHELL = `taxi-lernkarte-shell-v${VERSION}`;
const TILES = 'taxi-lernkarte-tiles';
const MAX_TILES = 400;
const TILE_MAX_AGE_MS = 7 * 24 * 3600 * 1000;

const ASSETS = [
  './', 'index.html', 'styles.css?v=1', 'manifest.webmanifest?v=1',
  'icons/icon.svg?v=1', 'icons/icon-192.png?v=1', 'icons/icon-512.png?v=1', 'icons/icon-maskable-512.png?v=1',
  'vendor/leaflet/leaflet.css?v=1', 'vendor/leaflet/leaflet.js?v=1',
  'vendor/leaflet/images/layers.png', 'vendor/leaflet/images/layers-2x.png', 'vendor/leaflet/images/marker-icon.png', 'vendor/leaflet/images/marker-icon-2x.png', 'vendor/leaflet/images/marker-shadow.png',
  'js/app.js?v=1', 'js/places.js?v=1', 'js/geo.js?v=1', 'js/quiz.js?v=1', 'js/store.js?v=1', 'js/progress.js?v=1', 'js/repeat.js?v=1',
  'js/drive.js?v=1', 'js/drivemode.js?v=1', 'js/quizmode.js?v=1', 'js/ui.js?v=1',
  'data/routes-ab.json?v=1', 'data/pairs.json?v=1',
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
  if (url.hostname === 'tile.openstreetmap.org') return e.respondWith(tile(req));
  if (url.origin !== location.origin) return; // alles andere (z. B. Nominatim) nie anfassen
  if (req.mode === 'navigate') return e.respondWith(caches.match('index.html').then((r) => r || fetch(req)));
  e.respondWith(caches.match(req).then((r) => r || fetch(req)));
});

async function stamp(res) { // Zeitstempel in die zwischengespeicherte Antwort schreiben
  const h = new Headers(res.headers); h.set('x-cached-at', String(Date.now()));
  return new Response(await res.blob(), { status: res.status, statusText: res.statusText, headers: h });
}

async function tile(req) {
  const cache = await caches.open(TILES);
  const hit = await cache.match(req);
  if (hit && Date.now() - Number(hit.headers.get('x-cached-at') || 0) < TILE_MAX_AGE_MS) return hit;
  try {
    const res = await fetch(req);
    if (res.ok && res.type !== 'opaque') {
      await cache.put(req, await stamp(res.clone()));
      const keys = await cache.keys();
      if (keys.length > MAX_TILES) await Promise.all(keys.slice(0, keys.length - MAX_TILES + 40).map((k) => cache.delete(k)));
    }
    return res;
  } catch {
    return hit || Response.error(); // offline und nie gesehen: leere Kachel
  }
}
