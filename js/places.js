// Feste Orte der Taxi-Lernkarte (aus dem Dossier). Reine Daten + kleine Hilfsfunktionen,
// bewusst OHNE Browser-Abhaengigkeit, damit "node --test" sie pruefen kann.
//
// Koordinaten: am 18.11.2026 bei Nominatim (OpenStreetMap) nachgeschlagen, jeweils der Punkt
// des Bahnhofs / Platzes / Gebaeudes. Bei «Zentrum»-Orten ist es die Ortsmitte laut OSM (ungefaehr). Die Spalte `osm` nennt das OSM-Objekt, damit man es
// nachpruefen kann: https://www.openstreetmap.org/<osm>  (z. B. node/3080372104).
// Neuen Ort ergaenzen: siehe README.md, Abschnitt "Feste Orte ergaenzen".

/** Rechteck um den Zuerichsee-Raum (Samstagern/Richterswil bis Zuerich Nord). Alle Orte muessen darin liegen. */
export const BOX = { south: 47.17, north: 47.40, west: 8.45, east: 8.74 };

/** Lernstufen aus dem Dossier. */
export const STUFEN = { 1: 'Nahgebiet', 2: 'Zürichseeachse', 3: 'Stadt Zürich' };
/** Erlaubte Ortstypen. */
export const TYPEN = ['Bahnhof', 'Spital', 'Platz', 'Einkauf', 'Hafen', 'Amt', 'Ort'];
export const TYP_ICON = { Bahnhof: '🚆', Spital: '🏥', Platz: '🏛️', Einkauf: '🛍️', Hafen: '⛴️', Amt: '🏢', Ort: '📍' };

/**
 * @typedef {Object} Place
 * @property {string} id      stabile Kennung (nie aendern, sonst gehen Statistiken verloren)
 * @property {1|2|3} stufe    Lernstufe (siehe STUFEN)
 * @property {string} type    Ortstyp (siehe TYPEN)
 * @property {string} name    voller Name (Quiz-Antwort, Liste)
 * @property {string} label   kurze Beschriftung auf der Karte
 * @property {string} address Adresse oder kurze Beschreibung (Popup)
 * @property {string} note    Lernhinweis
 * @property {number} lat
 * @property {number} lng
 * @property {string} osm     OSM-Objekt, aus dem die Koordinate stammt
 */
const p = (id, stufe, type, name, label, address, note, lat, lng, osm) => ({ id, stufe, type, name, label, address, note, lat, lng, osm });

/** @type {Place[]} */
export const PLACES = [
  // ---- Stufe 1: Nahgebiet ----
  p('waedenswil', 1, 'Bahnhof', 'Wädenswil (Bahnhof)', 'Wädenswil', 'Bahnhofstrasse, 8820 Wädenswil', 'Ausgangspunkt der Seestrasse-Route am linken Zürichseeufer.', 47.2292959, 8.6751853, 'node/3080372104'),
  p('waedenswil-zentrum', 1, 'Ort', 'Wädenswil (Zentrum)', 'Wädenswil Zentrum', 'Ortsmitte Wädenswil, 8820', 'Ortsmitte laut OSM, ungefähre Lage.', 47.2278988, 8.6701365, 'relation/1682244'),
  p('au-zh', 1, 'Bahnhof', 'Au ZH (Bahnhof)', 'Au ZH', 'Seestrasse, 8804 Au ZH', 'Auf der Halbinsel Au, Gemeinde Wädenswil.', 47.2467896, 8.6436487, 'node/1345694391'),
  p('schloss-au', 1, 'Ort', 'Schloss Au (Halbinsel Au)', 'Schloss Au', 'Auweg 1, 8804 Au ZH', 'Schloss auf der Halbinsel Au.', 47.2502318, 8.6394023, 'way/31313997'),
  p('kaepfnach', 1, 'Ort', 'Käpfnach (Horgen)', 'Käpfnach', 'Käpfnach, 8810 Horgen', 'Ortsteil von Horgen an der Seestrasse, ungefähre Lage.', 47.2535793, 8.6150133, 'way/44669480'),
  p('horgen', 1, 'Bahnhof', 'Horgen (Bahnhof)', 'Horgen', 'Bahnhofstrasse, 8810 Horgen', 'Bezirkshauptort am linken Seeufer.', 47.2614564, 8.5968943, 'node/3080372090'),
  p('see-spital-horgen', 1, 'Spital', 'See-Spital Horgen', 'See-Spital Horgen', 'Asylstrasse 19, 8810 Horgen', 'Spital oberhalb des Bahnhofs Horgen.', 47.2626515, 8.5898039, 'way/317763534'),
  p('faehre-horgen', 1, 'Hafen', 'Fähre Horgen–Meilen', 'Fähre Horgen', 'Fähre Horgen–Meilen, Anlegestelle Horgen', 'Autofähre über den See nach Meilen (Lage laut OSM-Werkareal der Fähre).', 47.2575815, 8.6084233, 'way/846003429'),
  p('samstagern', 1, 'Bahnhof', 'Samstagern (Bahnhof)', 'Samstagern', 'Stationsstrasse, 8833 Samstagern', 'Ortsteil von Richterswil, oberhalb des Sees.', 47.1916017, 8.6860081, 'node/3074774947'),
  p('richterswil', 1, 'Bahnhof', 'Richterswil (Bahnhof)', 'Richterswil', 'Strandweg, 8805 Richterswil', 'Am See, Richtung Pfäffikon SZ.', 47.2085520, 8.7074819, 'node/1345880152'),
  p('schoenenberg', 1, 'Ort', 'Schönenberg ZH', 'Schönenberg', 'Dorf Schönenberg, 8824', 'Dorf auf der Anhöhe über Wädenswil.', 47.1937464, 8.6415425, 'node/1079514369'),
  // ---- Stufe 2: Zuerichseeachse ----
  p('oberrieden', 2, 'Bahnhof', 'Oberrieden (Bahnhof)', 'Oberrieden', 'Fachstrasse, 8942 Oberrieden', 'Zwischen Horgen und Thalwil.', 47.2796641, 8.5784107, 'node/3074886742'),
  p('thalwil', 2, 'Bahnhof', 'Thalwil (Bahnhof)', 'Thalwil', 'Bahnhofstrasse, 8800 Thalwil', 'Zwischen Oberrieden und Rüschlikon am linken Seeufer.', 47.2959669, 8.5650384, 'way/701919128'),
  p('thalwil-zentrum', 2, 'Ort', 'Thalwil (Zentrum)', 'Thalwil Zentrum', 'Ortsmitte Thalwil, 8800', 'Ortsmitte laut OSM, ungefähre Lage.', 47.2944325, 8.5635762, 'relation/1682216'),
  p('rueschlikon', 2, 'Bahnhof', 'Rüschlikon (Bahnhof)', 'Rüschlikon', 'Nidelbadstrasse, 8803 Rüschlikon', 'Zwischen Thalwil und Kilchberg.', 47.3084492, 8.5535237, 'way/156582031'),
  p('kilchberg', 2, 'Bahnhof', 'Kilchberg (Bahnhof)', 'Kilchberg', 'Bahnhofstrasse, 8802 Kilchberg ZH', 'Letzte Gemeinde vor der Stadtgrenze Zürich.', 47.3245141, 8.5481967, 'node/372733726'),
  p('kilchberg-zentrum', 2, 'Ort', 'Kilchberg (Zentrum)', 'Kilchberg Zentrum', 'Ortsmitte Kilchberg ZH, 8802', 'Ortsmitte laut OSM, ungefähre Lage.', 47.3225316, 8.5459483, 'relation/1682152'),
  p('spital-kilchberg', 2, 'Spital', 'Spital Kilchberg (Haltestelle)', 'Spital Kilchberg', 'Grütstrasse, 8802 Kilchberg ZH (Bushaltestelle «Kilchberg Spital»)', 'Lage der Haltestelle «Kilchberg Spital» laut OSM.', 47.3218526, 8.5352537, 'node/984784826'),
  p('wollishofen', 2, 'Bahnhof', 'Wollishofen (Bahnhof)', 'Wollishofen', 'Staubstrasse, 8038 Zürich-Wollishofen', 'Erster Stadtteil von Zürich am linken Seeufer (Kreis 2).', 47.3477819, 8.5337381, 'node/3080372106'),
  p('hafen-wollishofen', 2, 'Hafen', 'Hafen Wollishofen', 'Hafen Wollishofen', 'Seestrasse 495b, 8038 Zürich', 'Bootshafen am See in Wollishofen.', 47.3380727, 8.5396332, 'node/2926136479'),
  p('morgental', 2, 'Ort', 'Morgental (Wollishofen)', 'Morgental', 'Morgentalstrasse, 8038 Zürich-Wollishofen', 'Quartierteil in Wollishofen; Lage anhand der Morgentalstrasse.', 47.3434762, 8.5229401, 'way/863158464'),
  // ---- Stufe 3: Stadt Zuerich ----
  p('enge', 3, 'Bahnhof', 'Enge (Bahnhof)', 'Enge', 'Bahnhof Zürich Enge, Bleicherweg / Seestrasse, 8002 Zürich', 'Quartier Enge (Kreis 2).', 47.3641833, 8.5307605, 'node/1270614835'),
  p('tessinerplatz', 3, 'Platz', 'Tessinerplatz', 'Tessinerplatz', 'Tessinerplatz, 8002 Zürich', 'Platz beim Bahnhof Enge.', 47.3642348, 8.5315375, 'way/541012853'),
  p('brunau', 3, 'Bahnhof', 'Brunau (Bahnhof)', 'Brunau', 'Allmendstrasse, 8002 Zürich-Brunau', 'Zwischen Wollishofen und Enge (Kreis 2).', 47.3515976, 8.5262233, 'node/1264882620'),
  p('brunaupark', 3, 'Einkauf', 'Brunaupark', 'Brunaupark', 'Brunaupark, Uetlibergstrasse, 8045 Zürich', 'Einkaufs- und Wohnareal in Alt-Wiedikon (Kreis 3).', 47.3581284, 8.5179265, 'way/37471897'),
  p('schmiede-wiedikon', 3, 'Ort', 'Schmiede Wiedikon', 'Schmiede Wiedikon', 'Birmensdorferstrasse, 8003 Zürich (Tramhaltestelle)', 'Tramhaltestelle in Wiedikon an der Birmensdorferstrasse.', 47.3699769, 8.5195391, 'way/524679370'),
  p('hb', 3, 'Bahnhof', 'Zürich HB', 'Zürich HB', 'Bahnhofplatz, 8001 Zürich', 'Hauptbahnhof, Beginn der Bahnhofstrasse.', 47.3781008, 8.5393635, 'node/1236383343'),
  p('buerkliplatz', 3, 'Platz', 'Bürkliplatz', 'Bürkliplatz', 'Bürkliplatz, 8001 Zürich (Seebecken)', 'Am Seebecken, Ende der Bahnhofstrasse; Schiffstation.', 47.3663783, 8.5411918, 'way/60447876'),
  p('paradeplatz', 3, 'Platz', 'Paradeplatz', 'Paradeplatz', 'Paradeplatz, 8001 Zürich', 'Bahnhofstrasse, Tramknoten, Banken-Zentrum.', 47.3696557, 8.5388307, 'relation/905841'),
  p('bellevue', 3, 'Platz', 'Bellevue', 'Bellevue', 'Bellevueplatz, 8001 Zürich', 'Knoten Limmatquai / Rämistrasse / Theaterstrasse, Tramknoten.', 47.3671646, 8.5448477, 'way/503589437'),
  p('sihlcity', 3, 'Einkauf', 'Sihlcity', 'Sihlcity', 'Kalanderplatz 1, 8045 Zürich', 'Einkaufs- und Freizeitzentrum in Alt-Wiedikon (Kreis 3).', 47.3586784, 8.5226141, 'way/30611737'),
  p('triemli', 3, 'Spital', 'Stadtspital Triemli', 'Triemli', 'Birmensdorferstrasse 497, 8063 Zürich', 'Stadtspital am Fuss des Uetlibergs (Kreis 3).', 47.3664471, 8.4972902, 'way/555945140'),
  p('albisguetli-tram', 3, 'Ort', 'Albisgütli (Tram-Endstation 13)', 'Albisgütli Tram 13', 'Uetlibergstrasse, 8045 Zürich (Endstation Tram 13)', 'Endstation der Tramlinie 13 im Albisgütli.', 47.3519636, 8.5074010, 'node/3878078020'),
  p('albisguetli', 3, 'Amt', 'Albisgütli (Strassenverkehrsamt)', 'Albisgütli (STVA)', 'Strassenverkehrsamt Zürich, Uetlibergstrasse 301, 8045 Zürich', 'Strassenverkehrsamt Zürich im Albisgütli, Friesenberg (Kreis 3).', 47.3536616, 8.5128897, 'relation/5465475'),
];

/** Kleinschreibung, ohne Akzente/Umlaute, ss statt dem scharfen s: damit "burkli" auch "Bürkliplatz" findet. */
export function normalize(s) {
  return String(s ?? '').toLowerCase().replace(/ß/g, 'ss')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
}

/** Filtert Orte nach Suchtext (alle Woerter muessen in Name, Beschriftung, Adresse oder Notiz vorkommen). */
export function filterPlaces(list, query) {
  const words = normalize(query).split(/\s+/).filter(Boolean);
  if (!words.length) return list.slice();
  return list.filter((p) => {
    const hay = normalize([p.name, p.label, p.address, p.note].join(' '));
    return words.every((w) => hay.includes(w));
  });
}

/** Liegt der Punkt im Rechteck BOX? */
export function inBox(lat, lng, box = BOX) {
  return Number.isFinite(lat) && Number.isFinite(lng) && lat >= box.south && lat <= box.north && lng >= box.west && lng <= box.east;
}
