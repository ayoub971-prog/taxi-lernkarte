// Geografische Hilfsfunktionen (rein, ohne Browser) – vom Quiz und von den Tests benutzt.

const R = 6371008.8; // mittlerer Erdradius in Metern

/** Entfernung in Metern zwischen zwei Punkten {lat, lng} (Haversine-Formel). */
export function distanceM(a, b) {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** "340 m" unter einem Kilometer, sonst "1.25 km" (Schweizer Schreibweise mit Punkt). */
export function formatDistance(m) {
  if (!Number.isFinite(m)) return '–';
  if (m < 1000) return `${Math.round(m)} m`;
  return `${(m / 1000).toFixed(m < 10000 ? 2 : 1)} km`;
}

/** Punkte pro Frage im Modus "Wo ist ...?": 100 bis 50 m, dann linear fallend bis 0 bei 2000 m. */
export function scorePoints(distance) {
  if (!Number.isFinite(distance)) return 0;
  if (distance <= 50) return 100;
  return Math.max(0, Math.round(100 * (1 - (distance - 50) / 1950)));
}

/** Als "Treffer" zaehlt ein Tipp, der hoechstens 200 m daneben liegt. */
export const HIT_RADIUS_M = 200;
export function isHit(distance) { return distance <= HIT_RADIUS_M; }

/** Kurzer Kommentar zur Distanz. */
export function verdict(distance) {
  if (distance <= 50) return 'Perfekt!';
  if (distance <= HIT_RADIUS_M) return 'Treffer!';
  if (distance <= 500) return 'Knapp daneben.';
  if (distance <= 1500) return 'Noch in der Nähe.';
  return 'Weit daneben – schau dir den Ort an.';
}
