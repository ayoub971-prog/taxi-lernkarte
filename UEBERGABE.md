# Übergabe: Taxi-Lernkarte (Prompt für eine andere KI)

> Kopiere diese ganze Datei in ChatGPT, Claude, Gemini oder Copilot und hänge das Repo (oder die Dateien) an. Du bekommst dann eine KI, die das Projekt versteht und weiterbauen kann.

## 1. Deine Rolle und die Regeln

Du bist Entwickler:in für eine kleine, **kostenlose** Web-App. Halte dich an diese Regeln:

1. **Antworte in einfachem Deutsch** (Schweizer Schreibweise: **«ss» statt «ß»**, z. B. «Strasse», «gross»). Kurze Sätze, keine Fachwörter ohne Erklärung. Der Benutzer ist kein Programmierer.
2. **Keine Kosten.** Keine bezahlten Dienste, keine API-Schlüssel, keine Konten, keine Karten-Abos, keine Server. Nur was gratis und ohne Anmeldung geht.
3. **Keine KI in der App** (kein Chatbot, keine KI-Schnittstelle). Die App rechnet nur mit festem Code und Daten.
4. **Nichts kaputt machen:** Erst lesen, dann ändern. Vor jeder Änderung `npm test` laufen lassen, danach wieder. Alte Funktionen (Quiz, Prüfung, eigene Orte, Fahrmodus, Offline) müssen weiter gehen.
5. **Kein Build-Schritt, keine neuen Abhängigkeiten** (nur HTML, CSS, ES-Module). Fremde Bibliotheken liegen **lokal** in `vendor/`, nie von einem CDN.
6. **Quellen und Lizenzen** immer beachten und sichtbar angeben (OpenStreetMap, OpenFreeMap). **Keine Massen-Downloads** von Kartenkacheln.
7. Die App ist eine **Lernhilfe, kein Navi und kein Fahrtraining**. Das muss im Text so bleiben.
8. Nach jeder Änderung **Version erhöhen** (siehe Abschnitt 7), sonst sehen Handy und iPad die neue Version nicht.
9. Sag ehrlich, was du **nicht** testen konntest (echtes Samsung, echtes iPad).

## 1b. Stand: Fahrersicht an, 3D-Gebäude AUS, Fahrverbot-Markierung (Version 5)

* **Fahrverbot (ab Version 5):** `data/graph.json` enthält nur befahrbare Strassen (access/motor_vehicle=no|private sind ausgeschlossen, Einbahnen als Kanten ohne Rückrichtung `ow`). Deshalb kann das Spielauto nie in einen verbotenen Weg fahren. Verbotene Wege kommen aus `data/noentry.json` (gebaut mit `tools/fetch-noentry-raw.sh` + `tools/build-noentry.mjs`: Fusswege, Velowege, Wege, Treppen, Feldwege, Reitwege, Busways, Fussgängerzonen, access/motor_vehicle=no; nur Stücke ±90 m um Graph-Knoten, Douglas-Peucker 2 m; `gates` = `[Knotenindex, lat·1e5, lng·1e5, Peilung, Art]`). `js/restrict.js` (`ctx.restrict`: start/stop/update/isActive) zeichnet in der 2D-Karte rot-weisse Linien (`#d32f2f` + weiss gestrichelt) und `.ban-sign`-Zeichen im Umkreis (Zeichen 260 m, Linien 420 m, Update höchstens alle 1 s/40 m). In der Fahrersicht zeichnet `map3d.js` die Linien direkt aus den OpenFreeMap-Vektorkacheln (Quelle `openmaptiles`, Ebene `transportation`: class path/pedestrian/track/busway oder access=no, Ebenen `taxi-ban-red`/`taxi-ban-dash`) und die Zeichen als GeoJSON-Ebene `taxi-gates-sym` (`setGates`). Einbahn-Pfeile kommen vom Stil «liberty» selbst; das Zeichen «Einfahrt verboten» in Gegenrichtung stammt aus dem Graph (nur Spielmodus).
* **Sperre (nur Spielmodus):** `game.js` `buildBlocked` (Knoten → gesperrte Peilungen aus Einbahnköpfen und Gates) und im `step()` das Ereignis `noentry`, wenn an einer Kreuzung zu einer gesperrten Seite gelenkt wird und kein erlaubter Ast innerhalb 40° liegt. `gamemode.js`: Zähler `violations`, Banner `#ban-alert`, Ton, Vibration, `rate()` zieht 100 Punkte pro Verstoss ab. Das Taxi bleibt auf erlaubter Kante.
* **Knöpfe:** «Selber fahren» steht zuoberst im Panel «Fahren»; `#drv-self` im Fahrmodus startet `ctx.game.start({ targetId })` mit demselben Ziel (`destId` in `drivemode.js`).
* Test: `tests/browser-ban.mjs`, Node-Tests in `tests/game.test.mjs`. Grenzen: Busspuren nur als eigener Weg; OSM-Lücken; keine Abbiegeverbote/Zeiten; Fahrersicht in der Innenstadt rot-lastig; nicht auf echtem Gerät getestet.

* **Fahrersicht (ab Version 4):** Im Spielmodus und Fahrmodus fährt eine MapLibre-Kamera hinter dem Taxi: `Bearing = Heading` (weich geglättet in `gamemode.js`/`drivemode.js`), `Pitch` 58°, das Taxi im unteren Drittel, pro Bild ein `jumpTo` (`gl.follow` in `js/map3d.js`, keine gestapelten Animationen). Standard an (`settings.driverView`, Umschalter `.view-toggle`: `#g-view` im Spiel, `#drv-3d` im Fahrmodus, Funktion `ctx.toggleDriverView`). Aus = Leaflet-Karte mit Norden oben und drehendem Auto. Die Gebäude-Ebene `building-3d` ist versteckt (`settings.buildings3d` oder `ENABLE_3D` schalten sie ein), Strassen werden mit eigenen Ebenen `taxi-road-*` verstärkt (`boldRoads`).
* **Rückfälle auf die 2D-Karte** (die auch mitdreht): kein WebGL, Stil nicht ladbar (kein Internet), `webglcontextlost`, zu langsam (`slowWatch` in `app.js`: zwei Messfenster à 4 s unter 14 fps, nicht bei `navigator.webdriver`, setzt `ctx.glSlow`), Übersichtskarte offen (immer 2D).
* **`want3d()` in `js/app.js`** entscheidet, welche Karte aktiv ist. Die normale Karte, Quiz und Prüfung sind immer 2D. `ENABLE_3D` (Standard `false`, oder `?3d=1`) schaltet nur die alte 3D-Ansicht der normalen Karte frei. `node tests/browser-3d.mjs` testet diese alte Ansicht (zuletzt 18 von 19 grün, der Fehler ist per CSS behoben, voller Lauf steht aus).
* Offen: Test auf echtem Samsung/iPad (Bildrate der Fahrersicht), Knopf «Gebäude 3D» (nur Einstellung `buildings3d`), Strassennamen-Lesbarkeit in der Fahrersicht prüfen.

## 2. Ziel und Benutzer

* **Benutzer:** Ayoub Weder, lernt für die Taxi-Ortskenntnis im Raum **Wädenswil – Zürich** (linkes Zürichseeufer und Stadt Zürich).
* **Geräte:** **Samsung Galaxy S25 Ultra (Chrome)** und **iPad (Safari, zum Home-Bildschirm hinzugefügt)**. Hochformat und Querformat (iPad 1024×768, 1366×1024).
* **Die App soll:** Orte und ihre Lage auf der Karte lernen (Lernen → Üben → Prüfen), Routen und Strassennamen «callen» üben, und im **Spielmodus** mit Bildschirm-Knöpfen (wie ein Nintendo, auf dem Sofa) selber auf dem echten Strassennetz fahren.
* **Immer gratis, ohne KI, ohne Schlüssel.** Daten bleiben nur auf dem Gerät (localStorage).
* Offizielle Prüfungsregeln: nicht Teil der App. Laut cab24.ch gibt es im Kanton Zürich keine Ortskundeprüfung mehr (nicht amtlich bestätigt, beim Strassenverkehrsamt Zürich erfragen). Die App ist eine freiwillige Lernhilfe.

## 3. Live und Repo

* **Live:** <https://ayoub971-prog.github.io/taxi-lernkarte/>
* **Repo (öffentlich):** <https://github.com/ayoub971-prog/taxi-lernkarte> (Branch `main`, GitHub Pages veröffentlicht den Ordner `/` automatisch nach jedem Push, dauert ca. 1 Minute).
* **Aktuelle Version:** 5 (`VERSION` in `sw.js`, `APP_VERSION` in `js/app.js`, `?v=5` in HTML und Modulen).
* Lizenz: MIT.

## 4. Architektur

* **Statische PWA**, reines JavaScript (ES-Module), **kein Build**, kein Framework. Zum Testen: `python3 -m http.server` im Repo-Ordner und `http://localhost:8000` öffnen.
* **Hybrid-Karte:**
  * **Leaflet 1.9.4** (2D, `vendor/leaflet/`) ist die Basis: Quiz-Tippen, Prüfung, eigene Orte, Routen, alles in 2D.
  * **MapLibre GL JS 5.24.1** (3D, `vendor/maplibre/`, UMD-Datei, wird erst beim ersten 3D-Gebrauch geladen) liegt als Overlay `#map3d` darüber. Stil: `https://tiles.openfreemap.org/styles/liberty`. Quelle «building-3d» wird als Körper (`fill-extrusion`) gezeichnet, Farbe nach Höhe, POI-Ebenen versteckt. MapLibre-Zoom = Leaflet-Zoom − 1.
  * `#app[data-gl="3d"|"2d"]` zeigt, welche Karte aktiv ist. `ctx.gl` (aus `js/map3d.js`) hat u. a. `ensure`, `setPlaces`, `setLine`, `setEnd`, `follow`, `flyTo`, `fitPoints`, `syncFrom2D`, `syncTo2D`.
  * 3D ist an, wenn `settings.view3d !== false`, WebGL da ist und keine Übersicht offen ist, in den Modi normal, Fahren, Spiel. Quiz und Prüfung sind immer 2D.
  * **Rückfall auf 2D:** kein WebGL, Stil nicht ladbar (eine Wiederholung nach 1,5 s), `webglcontextlost`.
  * Grenzen für Handy/iPad: Pixeldichte max. 2, `maxTileCacheSize` 80, `maxPitch` 75, `fadeDuration` 0, `renderWorldCopies` false.
* **Globales Objekt `ctx`** (in `js/app.js`, im Browser als `window.__taxi` erreichbar, wird von den Tests benutzt) verbindet die Module: `ctx.map`, `ctx.gl`, `ctx.quiz`, `ctx.drive`, `ctx.game`, `ctx.overview`, `ctx.store`, `ctx.progress`, `ctx.applyView()`, `ctx.viewListeners`.
* **Spielmodus:**
  * `data/graph.json`: kompaktes Strassennetz aus OSM (10 911 Knoten, 12 687 Kanten, ca. 1500 km, 660 KB). Format: `{v, src, cls, n:[lat1e5,lng1e5,…], names, e:[[a,b,cls,maxspeed,nameIdx,oneway,len,innerDeltas]]}`.
  * `js/game.js` (rein, ohne DOM, in Node getestet): Graph aufbauen, nächster Knoten, Dijkstra (Meter oder Sekunden), Abzweig-Auswahl (`optionsAt`, `pickOption`), Fahrphysik `step` (Gas 4,2 m/s², Bremse −10, Rückwärts nach 0,35 s, Auslaufen, Fahrhilfe bremst vor Kreuzungen, Lenk-Eingabe gilt 2,5 s), Fehler-Erkennung (Abzweig >80 m schlechter als der beste), Missionen, Punkte und Sterne.
  * `js/gamemode.js`: Oberfläche, Spielschleife (`requestAnimationFrame`), Menüs (Intro, Pause, Ergebnis), Anzeige (Strasse, Ort, km/h, Tempolimit-Schild nur bei OSM-`maxspeed`, Kreuzungsvorschau, Kompassfeil), Hinweis (kürzester Weg 12 s, −150 Punkte), Wenden (nur unter 20 km/h, nicht auf Einbahnstrassen), Ergebnis geht in den Lernstand (`progress.answer`).
  * `js/controls.js`: Eingabe. Pointer-Events mit `setPointerCapture` je Finger (Multitouch), Tastatur, Gamepad-API, Vibration und Ton nur wenn vorhanden.
  * Punkte: `1000 − Überzeit·4 − Fehler·120 − Hinweise·150 − Rasen·8` (mind. 100). 3 Sterne: Zeit ≤ 1,7·Richtzeit + 15 s, 0 Fehler, 0 Hinweise. 2 Sterne: ≤ 2,6·Richtzeit + 30 s und ≤ 2 Fehler. Ankunft: 70 m Luftlinie zum Ort. «Tempo ×» (1–4, Standard 2) macht die Spielzeit schneller, nicht die angezeigten km/h.
* **Zoom während der Fahrt** (`js/zoomctl.js`, ab Version 3): Plus/Minus-Knöpfe `#zoom-ctl` (links), Pinch (Touch-Ereignisse in der Capture-Phase auf `#stage`, damit Leaflet nicht mitzoomt), Mausrad, Tasten +/-/0. Gewählter Zuschlag `delta` (−5…+2, Schritte 0,25) wird zum Standardzoom von `drivemode.js`/`gamemode.js` addiert (`ctx.zoomctl.zoom(base)`, Grenzen 12–18) und in `settings.driveZoom` gespeichert. Nur 2D (3D-Kamera unverändert).
* **Übersicht** (`js/overview.js`): Knopf «Karte» pausiert, wechselt in 2D (ohne die Einstellung zu ändern), zeigt Auto und Ziel (+ Hinweisweg), frei zoomen/schieben. «Weiterfahren» bringt die Kamera zurück. **Minikarte** (eigene kleine Leaflet-Karte) ist optional.
* **Grosse Namen** (`js/labels.js`): `layoutLabels(container)` probiert je Pin vier Plätze (rechts, links, oben, unten), nach Wichtigkeit (Amt, Bahnhof, Spital, Platz, Hafen, Einkauf, Ort), alle Pins sind Hindernisse, ohne freien Platz bekommt der Name die Klasse `.hide`. Gleicher Code für Leaflet und MapLibre.
* **Service Worker** (`sw.js`): App-Hülle vorab im Cache (Liste `ASSETS`), OSM-Kacheln max. 400 (7 Tage), OpenFreeMap-Dateien max. 600 (7 Tage, Cache `taxi-lernkarte-vtiles`), Stil/Schriften «Netz zuerst».
* **iPad/Safari-Härtung:** Meta-Tags `apple-mobile-web-app-*`, `viewport-fit=cover`, Sicherheitsabstände (`env(safe-area-inset-*)`), `100vh` mit `100dvh`, `touch-action: none` + `user-select: none` + `-webkit-touch-callout: none` auf Spielknöpfen, `gesturestart` unterdrückt, Manifest `orientation: any`.

### Dateien

| Datei / Ordner | Inhalt |
|---|---|
| `index.html`, `styles.css` | Oberfläche, alle Ansichten und Dialoge, Spiel-HUD und Knöpfe |
| `js/app.js` | Start, Karte, Pins, `ctx`, 2D/3D-Umschalten (`applyView`), Orte-Liste, eigene Orte, Sicherung |
| `js/places.js` | die 34 festen Orte (Daten, Typ, Stufe, Suche), Rechteck |
| `js/geo.js` | Distanz, Punkte, Formatierung |
| `js/quiz.js`, `js/quizmode.js` | Quiz-Logik (rein) und Bedienung: Lernen/Üben/Prüfen/Heute/Stufe 4 |
| `js/progress.js`, `js/repeat.js` | Lernstand (6 Boxen, Ampel), Wiederholung |
| `js/drive.js`, `js/drivemode.js` | Fahrmodus (Taxi fährt Route, Navi-Balken, Fragen), mit 3D-Kamera |
| `js/map3d.js` | MapLibre-Steuerung (Gebäude, Pins, Linien, Kamera) |
| `js/labels.js` | Namen ohne Überlappung |
| `js/game.js`, `js/gamemode.js`, `js/controls.js` | Spielmodus (siehe oben) |
| `js/restrict.js` | Fahrverbot-Markierung (2D-Linien, Zeichen, Daten für die Fahrersicht) |
| `js/overview.js` | Übersichtskarte und Minikarte |
| `js/zoomctl.js` | Zoom während der Fahrt (Knöpfe, Pinch, Mausrad, Tasten) |
| `js/store.js`, `js/ui.js` | localStorage (Schlüssel `taxi-lernkarte-v1`), kleine DOM-Helfer, Sprachausgabe |
| `sw.js`, `manifest.webmanifest`, `icons/` | Offline und Installation |
| `data/routes-ab.json`, `data/pairs.json`, `data/graph.json`, `data/noentry.json` | Routen A/B, Aufgabenpaare (Stufe 4), Strassennetz |
| `vendor/leaflet/`, `vendor/maplibre/` | Fremdcode lokal samt Lizenz |
| `tools/` | `bump-version.mjs`, `fetch-routes.mjs`, `fetch-graph-raw.sh`, `build-graph.mjs`, `fetch-noentry-raw.sh`, `build-noentry.mjs`, `nominatim-lookup.sh` |
| `tests/` | siehe Abschnitt 6 |
| `README.md` | Anleitung für den Benutzer (Deutsch) |

## 5. Datenquellen und ihre Bedingungen

| Quelle | Wofür | Bedingungen |
|---|---|---|
| **OpenStreetMap-Kacheln** `tile.openstreetmap.org` | 2D-Karte | Tile Usage Policy: keine Massen-Downloads, kein Vorab-Laden, Quellenangabe «© OpenStreetMap-Mitwirkende» sichtbar. Die App speichert nur angesehene Kacheln (max. 400). |
| **OpenFreeMap** `tiles.openfreemap.org` (Stil «liberty») | 3D-Gebäude und Vektorkarte | Gratis, **ohne Schlüssel und Konto** (Stand 19.11.2026, <https://openfreemap.org/tos/>). Pflicht-Quellenangabe «OpenFreeMap © OpenMapTiles, Daten von OpenStreetMap» (steht in der Karte). Automatisches Abgreifen verboten, Offline-Download nur bis 3000 Kacheln/50 MB, max. 4 parallel, eigener User-Agent. Die App lädt nur, was angezeigt wird. Dienst ohne Garantie, kann wegfallen (dann 2D). Vektordaten © OpenMapTiles (CC-BY 4.0) und OSM (ODbL). |
| **OSM-Daten über Overpass** (`overpass.openstreetmap.fr`) | einmalig für `data/graph.json` | ODbL. Nur zur Bauzeit, 6 Abfragen mit 20 s Pause, eigener User-Agent. Die App fragt nie selber Overpass. |
| **OSM-Daten über Overpass** (zweite Abfrage) | einmalig für `data/noentry.json` | wie oben (ODbL, 6 Abfragen, 20 s Pause, eigener User-Agent). Die App fragt auch dafür nie selber. |
| **OSRM-Demo-Server** | einmalig für `data/routes-ab.json` | Wenige Abfragen von Hand, Daten bleiben im Repo. |
| **Nominatim** | einmalig für Adressen/Koordinaten der Orte | 1 Abfrage pro Sekunde, eigener User-Agent. |
| **Leaflet** (BSD-2), **MapLibre GL JS** (BSD-3) | Karten-Bibliotheken | Lizenzdateien liegen in `vendor/`. |

Die App selber ruft im Betrieb **nur** `tile.openstreetmap.org` und `tiles.openfreemap.org` auf. Der Test `tests/static.test.mjs` prüft, dass im Code keine anderen Server stehen.

## 6. Tests ausführen

```bash
npm test                              # Node-Tests (34): Orte, Quiz, Lernstand, Routen, Service Worker, Spiel-Kern (Graph, Dijkstra, Physik, Autopilot, Missionen)
node tests/browser-smoke.mjs          # echter Chrome headless, 2D, Handyformat, Screenshots nach /workspace/taxi-shots
node tests/browser-2d.mjs             # Auslieferung ohne 3D: Namen, Spielmodus 2D (Touch, Mehrfinger), Zoom während der Fahrt, Übersicht, Minikarte, iPad-/Handy-Layouts, Bildrate (12 Schritte)
node tests/browser-ban.mjs           # Fahrverbot: Panel, «Selber steuern», Sperre, Markierung 2D und Fahrersicht (Fahrersicht braucht Internet)
node tests/browser-view.mjs           # Fahrersicht (braucht Internet): Bearing = Heading, Pitch, Umschalter, Fallback, Zoom, Übersicht, Layouts, Bildrate
node tests/browser-3d.mjs             # alte 3D-Ansicht (öffnet die App mit ?3d=1) 3D, Namen, Fahrmodus 3D, Spielmodus mit echten Touch-Ereignissen, Übersicht, Minikarte, iPad-/Handy-Layouts, Bildrate; Screenshots nach /workspace/taxi-shots/v2 (SHOTS_DIR änderbar)
python3 tests/webkit-smoke.py         # WebKit (Playwright): Fehler, Layout, Touch-Eigenschaften, Spielstart
```

* Die Browser-Tests brauchen Chrome/Chromium (suchen `google-chrome`/`chromium`) und starten selbst einen kleinen Webserver. Sie nutzen **Software-WebGL** (SwiftShader). Bildraten daraus sind nur relative Werte (auf echten Geräten viel höher).
* `tests/cdp.mjs` ist der gemeinsame Helfer (Chrome DevTools Protocol): `ev`, `waitFor`, `shot`, `click`, `touch(type, points)`, `viewport`, `step`.
* WebKit: `python3 -m playwright install webkit` (unter Linux fehlen evtl. Systembibliotheken). Das Testbuild hat **kein TLS und kein WebGL mit Netz**: 3D-Stil wird dort nicht geladen, es bleibt bei 2D. Das ist **nicht Safari selbst**.
* Der Willkommensdialog `#dlg-intro` erscheint 300 ms nach dem Start und blockiert Klicks: Tests setzen `introSeen` oder klicken «Verstanden».
* Hinweis: Wenn du Dateien hinzufügst, trage sie in `ASSETS` in `sw.js` ein (der Test meldet fehlende).

## 7. Neue Version veröffentlichen

1. Änderungen machen, `npm test` und die Browser-Tests laufen lassen.
2. `node tools/bump-version.mjs 6` (Zahl = neue Version; aktuell ist 5). Das setzt `VERSION` in `sw.js`, `APP_VERSION` in `js/app.js` und alle `?v=` in `index.html`, `manifest.webmanifest` und den Modulen.
3. `git add -A && git commit -m "..." && git push` (Branch `main`). GitHub Pages baut automatisch.
4. Prüfen: <https://ayoub971-prog.github.io/taxi-lernkarte/sw.js> zeigt die neue `VERSION`; Dateien wie `js/app.js?v=5` geben 200.
5. Auf Handy/iPad die App einmal ganz schliessen und neu öffnen (Service Worker wechselt beim zweiten Start). Bei Manifest-Änderungen (z. B. Ausrichtung) die installierte App neu installieren.
6. Strassennetz neu bauen (selten): `bash tools/fetch-graph-raw.sh /pfad/osm-raw` (6 Abfragen, ca. 3 Minuten, Pausen nicht kürzen), dann `node tools/build-graph.mjs /pfad/osm-raw` → `data/graph.json`, dann `npm test`.

## 8. Bekannte Grenzen

* **3D:** OpenFreeMap-Gebäude gibt es ab Zoom 14, Höhen sind OSM-Angaben oder Schätzwerte. Das Gelände ist flach. Das Taxi ist ein flaches Symbol, kein 3D-Modell. 3D braucht beim ersten Ansehen Internet. Der Dienst kann ändern oder wegfallen.
* **Spielmodus:** keine Ampeln, kein Vortritt, keine Abbiegeverbote, kein Verkehr. Einbahnstrassen werden beachtet. Wohnstrassen sind nur im Umkreis von 450 m um Orte und Routen im Netz. Tempolimits ohne OSM-`maxspeed` werden nicht angezeigt. Das Netz ist ein Abzug vom 19.11.2026.
* **Nicht auf echter Hardware getestet:** Samsung S25 Ultra, iPad (GPU, Bildrate, Gamepad, Vibration, Home-Bildschirm-App). Gemessen wurde nur mit Software-Grafik. Safari auf dem iPad kann sich anders verhalten als WebKit-Testbuilds (z. B. Vollbild/Ausrichtungssperre gibt es auf dem iPhone nicht; iPadOS 15.4+ nötig).
* Vibration (`navigator.vibrate`) gibt es auf iOS nicht. Das ist gewollt (nur wenn vorhanden).
* Quiz und Prüfung gibt es nur in 2D.
* Das Strassennetz-Routing ist ein Spielhilfsmittel, nicht für echte Navigation.
* Die Bildrate wurde nur in Software-GL gemessen (z. B. ca. 11–17 fps im Handyformat, 6–9 fps auf iPad-Grössen). Auf echten GPUs sollte es deutlich besser sein, ist aber **nicht bestätigt**.

## 9. Offene Ideen und nächste Schritte

1. **Echte Geräte testen** (S25 Ultra, iPad): Bildrate, Griffigkeit der Knöpfe, Lesbarkeit der Namen in der Sonne. Fehler als Screenshot festhalten. Wenn nötig `maxPitch`, Pixeldichte oder Gebäude-Zoom weiter senken.
2. **Karten-Stil leichter machen** (nur Gebäude, Wasser, Strassen), wenn die Bildrate auf dem iPad zu tief ist.
3. **Fahrspass:** Ampeln und Vortritt als einfache Regeln, Verkehr als wenige fahrende Autos, Taxi-Gäste (Abholen/Absetzen), Tageszeit.
4. **Missionsarten:** «Fahre Route A/B», «Fahre über …», Zeitlimit-Modus, Tageshighscore.
5. **Lernen mit dem Spiel verknüpfen:** Fehlermissionen automatisch aus schwachen Orten, Wiederholungs-Plan «Heute fahren».
6. **Bessere Namen in 3D:** Strassennamen im Spiel auf der Karte (nur sichtbare), Platz-Beschriftung nach Wichtigkeit je Zoom.
7. **Eigenes Hosting der Vektorkacheln** (OpenFreeMap ist selbst hostbar), falls der öffentliche Dienst wegfällt. Nur wenn es gratis bleibt.
8. **Offline-Paket für 3D** (kleine Region, bis 3000 Kacheln/50 MB, 4 parallel, eigener User-Agent, einmalig und nur auf Wunsch des Benutzers).
9. **Zugänglichkeit:** grössere Schrift als Einstellung, Farbenblind-Modus für rot/gelb/grün.
10. **Aufräumen:** `js/app.js` ist gross und könnte in kleinere Module geteilt werden (ohne Funktionen zu verlieren).

## 10. So arbeitest du mit dem Projekt (Kurz-Ablauf für dich)

1. Lies `README.md`, diese Datei und die Dateien, die du ändern willst.
2. Starte `npm test`. Alles muss grün sein.
3. Mach **kleine** Änderungen, erkläre dem Benutzer in einfachem Deutsch, was du tust.
4. Teste nach jeder Änderung. Browser-Tests mit `node tests/browser-3d.mjs`, wenn Karte, Spiel oder Layout betroffen sind.
5. Version erhöhen, committen, pushen, live prüfen (Abschnitt 7).
6. Schreibe am Ende eine kurze Zusammenfassung: Was ist neu, was wurde getestet, was **nicht**.
