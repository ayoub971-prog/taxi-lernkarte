# Taxi-Lernkarte

Eine kleine, **kostenlose** Web-App (PWA) zum Lernen der Orte zwischen **Wädenswil und Zürich** (linkes Zürichseeufer und Stadt Zürich). Sie läuft im Chrome-Browser (zum Beispiel auf dem Samsung Galaxy S25 Ultra), lässt sich auf den Startbildschirm installieren und braucht **kein Konto, keine Werbung, keine API-Schlüssel und keinen Server**.

Live: <https://ayoub971-prog.github.io/taxi-lernkarte/>

> **Wichtig:** Die App ist eine **freiwillige Lernhilfe**. Sie ist **nicht offiziell** und **nicht zum Navigieren** gedacht. Prüfungsregeln müssen beim **Strassenverkehrsamt Zürich** geprüft werden. Laut cab24.ch gibt es im Kanton Zürich keine Ortskundeprüfung mehr – das ist nicht amtlich bestätigt und muss beim Strassenverkehrsamt Zürich erfragt werden. Die Routen sind Lernskizzen, **keine Prüfungsrouten**.

## Funktionen

> **Stand Version 2: Die 3D-Ansicht ist vorläufig ABGESCHALTET** (Schalter `ENABLE_3D = false` in `js/map3d.js`, Code und Tests bleiben). Zum Ausprobieren: Adresse mit `?3d=1` öffnen (`…/taxi-lernkarte/?3d=1`) – noch nicht fertig getestet (Bildrate/Layout im 3D-Spiel offen). Alle Punkte unten mit «3D» gelten nur dann. Grosse Namen, Spielmodus, Übersicht und Minikarte laufen in 2D.

* **Karte** mit OpenStreetMap-Kacheln (Quellenangabe immer sichtbar), Leaflet **lokal im Repo** (kein CDN).
* **3D-Ansicht** (Knopf «3D»/«2D»): geneigte Karte mit **echten OSM-Gebäuden als Körper** (MapLibre GL JS lokal im Repo + OpenFreeMap-Vektorkacheln, siehe Quellen). Ohne WebGL oder ohne Internet bleibt automatisch die 2D-Karte. Quiz und Prüfung laufen immer in 2D (genaues Tippen).
* **Grosse Namen**: weisse Schrift mit dunklem Rand, 17 px, mit Symbol je Ortstyp (🚆 Bahnhof, 🏥 Spital, 🏛️ Platz, 🏢 Amt, ⛴️ Hafen, 🛍️ Einkauf). Jeder Name probiert vier Plätze um den Pin (rechts, links, oben, unten). Gibt es keinen freien Platz (z. B. Enge/Tessinerplatz, nur 59 m auseinander), bleibt nur der Pin sichtbar, bis man näher zoomt. Wichtige Orte (Amt, Bahnhof, Spital) werden zuerst platziert. «Namen» schaltet alles aus (für Üben/Prüfen).
* **34 feste Orte** in drei Lernstufen (aus dem Lern-Dossier), jeweils mit Typ (Bahnhof, Spital, Platz, Einkauf, Hafen, Amt, Ort), Adresse und Hinweis:
  * Stufe 1 Nahgebiet: Wädenswil, Au ZH, Käpfnach, Horgen, Samstagern, Richterswil, Schönenberg …
  * Stufe 2 Zürichseeachse: Oberrieden, Thalwil, Rüschlikon, Kilchberg, Wollishofen …
  * Stufe 3 Stadt Zürich: Enge, Tessinerplatz, Sihlcity, Brunau, Wiedikon, HB, Bürkliplatz, Paradeplatz, Bellevue, Triemli, Albisgütli (Tram 13 und Strassenverkehrsamt)
* **Pins mit Namen**. Die Farbe zeigt den Lernstand: **rot** = neu oder schwach, **gelb** = unterwegs, **grün** = sicher. Namen lassen sich ein- und ausschalten (zum Selbsttest).
* **Orte**: Liste mit Suche (ohne Umlaute tippbar), Filter Stufe 1/2/3/Eigene und «Nur schwache», Fortschrittsbalken pro Stufe. Antippen fliegt zum Ort.
* **Lernen → Üben → Prüfen** pro Stufe:
  * *Lernen*: Karte mit sichtbaren Namen.
  * *Üben*: «Wo ist …?» (auf die Karte tippen, Distanz in Metern, Punkte) und «Welcher Ort?» (4 Namen zur Auswahl).
  * *Prüfen*: gleiche Fragen ohne Hilfe und ohne Rückmeldung, Auswertung am Ende.
* **Heute üben**: kurze Runde mit ca. 10 Fragen, zuerst was fällig ist.
* **Wiederholung (Leitner-System)**: falsche Antworten kommen bald wieder, sichere Orte seltener. Der Lernstand liegt nur auf dem Gerät.
* **Routen A und B** einzeln ein-/ausschaltbar: A = Autobahn A3 (Wädenswil → Albisgütli), B = Seestrasse (Wädenswil → Zürich). Echte Strassengeometrie aus OpenStreetMap, gekennzeichnet als «Lernskizze, keine Prüfungsroute».
* **Stufe 4 – Prüfungssimulation**: zufällige Aufgabe «Fahre von … nach …». Route erst überlegen und laut sagen, dann **Strasse für Strasse aufdecken** («Callen») oder alles auflösen. «Gewusst» / «Noch nicht» steuert die Wiederholung. 132 vorberechnete Routen zwischen 12 häufigen Orten.
* **Fahrmodus**: Ein Taxi fährt auf der echten Route. Die Karte folgt dem Auto, ist stark herangezoomt und **dreht sich in Fahrtrichtung**. Navi-Balken mit nächstem Abbiegen, Distanz und aktueller Strasse. Start/Pause, Tempo 1×–10×, Zurück/Vor. Während der Fahrt hält das Auto an und fragt: «Wohin geht es an der nächsten Kreuzung?», «Welche Ausfahrt im Kreisel?» oder «Welcher Ort kommt als Nächstes?». Fehler kommen in die Wiederholung. Optional **Sprachansagen** (Sprachsynthese des Browsers, de-CH oder de-DE). Hochformat und Querformat.
* **Fahrmodus in 3D**: Kamera hinter dem Taxi, geneigt, dreht sich mit der Fahrtrichtung, Gebäude als Körper. Knöpfe «3D/2D», **«Karte»** (Übersicht) und **«Mini»** (Minikarte in der Ecke).
* **🎮 Spielmodus «Selber fahren»** (Menü «Fahren»): Du steuerst das Taxi selbst auf dem **echten Strassennetz** (OSM, 1500 Strassen-km, nur Hauptstrassen und Quartierstrassen rund um die Orte).
  * **Bedienung (quer halten):** rechts **GAS** und **Bremse/Rückwärts**, links **Links**/**Rechts**, dazu **Wenden** und **Neu berechnen**. Mehrere Finger gleichzeitig (z. B. Gas + Rechts), Vibration (wo das Gerät es kann, abschaltbar). **Bluetooth-Gamepad** (Gas = RT/A, Bremse = LT/B, Lenken = Stick/Steuerkreuz, Wenden = Y, Hinweis = X, Karte = Select, Pause = Start) und **Pfeiltasten** (W/A/S/D, Leertaste = Bremse, U = Wenden, H = Hinweis, M = Karte, Esc = Pause) gehen auch.
  * **Das Auto bleibt auf der Strasse:** Es fährt auf einem Graphen aus Kreuzungen und Strassenstücken. Vor einer Kreuzung wählt Links/Rechts (ein kurzes Antippen genügt) den Abzweig, ohne Eingabe geht es geradeaus. Eine Fahrhilfe bremst vor Kurven ab. Oben siehst du die möglichen Abzweige mit Strassennamen.
  * **Anzeige:** Strassenname, «📍 bei <Ort>», Tempo in km/h, **Tempolimit nur wenn OSM ein `maxspeed` hat** (rotes Schild, blinkt bei zu schnell), Pfeil und Luftlinie zum Ziel, Zeit, Fehler.
  * **Missionen:** «Fahre zum Paradeplatz» (Ziel wählbar oder zufällig, schwache Orte kommen öfter). Bei der Ankunft gibt es **Punkte und 1–3 Sterne** (Zeit, Fehler, Hinweise, Rasen). «Neu berechnen» zeigt den kürzesten Weg 12 s lang (−150 Punkte). Falsch abgebogen = Fehler. Wer 2+ Sterne holt, macht den Zielort im Lernstand sicherer, sonst bleibt er «schwach» (Wiederholung).
  * **Übersicht:** «🗺️ Karte» pausiert, wechselt in die 2D-Karte (frei zoomen/verschieben), zeigt Auto, Ziel und auf Wunsch den kürzesten Weg. «Weiterfahren» bringt die Kamera genau zurück. Optional **Minikarte** in der Ecke (Pause-Menü).
  * **Karte zoomen während der Fahrt** (Fahrmodus und Spielmodus): grosse **+ / −**-Knöpfe links (mind. 58 px, 64 px auf dem iPad), **Zwei-Finger-Pinch** auf der Karte, Mausrad und Tasten **+ / − / 0**. Die Kamera folgt dem Taxi weiter und behält den gewählten Zoom (ein Zuschlag auf den Standardzoom, Bereich Zoom 12–18, wird im Gerät gemerkt). «Standard» setzt zurück. Die Übersichtskarte funktioniert wie bisher.
  * Spieltempo ×1–4 (Pause-Menü), Ton (Piepser, standardmässig aus), Pause-Menü.
* **Eigene Orte**: lange auf die Karte drücken (ca. 0.6 Sekunden) → Name und Notiz → speichern. Bearbeiten und Löschen im Popup. Sie sind auch im Quiz dabei.
* **Mein Standort** (Geolocation) mit Liste «In der Nähe» (die drei nächsten Lernorte).
* **Sicherung**: alle eigenen Orte und der Lernstand als lesbare JSON-Datei speichern und wieder laden (Menü «Mehr»).
* **Offline-fähig**: App-Hülle, Routen, Strassennetz und MapLibre sind im Service Worker. Kartenkacheln, die du angesehen hast, bleiben moderat gespeichert (OSM-Kacheln max. 400, OpenFreeMap-Dateien max. 600, je 7 Tage). Die 3D-Karte braucht beim ersten Ansehen eines Ausschnitts Internet.
* **Stabil auf Samsung (Chrome) und iPad (Safari, «Zum Home-Bildschirm»)**: `100dvh`, Sicherheitsabstände (Notch), kein Doppeltipp-/Pinch-Zoom der Seite, `touch-action: none` und keine Textauswahl/Lupe auf den Spielknöpfen, Vibration/Gamepad/Vollbild/Ausrichtungssperre nur wenn vorhanden, Pixeldichte der 3D-Karte höchstens 2, begrenzter Kachelspeicher, bei Verlust des WebGL-Kontexts Rückfall auf 2D. Querformat für Handy und iPad (1024×768, 1366×1024). Mindestens iPadOS/iOS 15.4.

## Grenzen

* **Kartenkacheln brauchen beim ersten Ansehen eines Ausschnitts Internet.** Es gibt bewusst *kein* Vorab-Laden ganzer Gebiete (OSM-Kachelregeln). Ohne Netz sind nur schon gesehene Ausschnitte sichtbar.
* Die Routen sind **Lernskizzen** aus einer einmaligen Abfrage des öffentlichen OSRM-Demo-Servers (Stand 18.11.2026). Verkehr, Baustellen und spätere Strassenänderungen sind nicht berücksichtigt. Route B führt über die Bahnhöfe der Orte (sie wurde so gebaut, dass sie an jedem Ort vorbeikommt) und folgt deshalb nicht überall genau der Hauptstrasse. Die Fahrhinweise stammen aus OSRM und sind auf Deutsch zusammengesetzt, nicht amtlich.
* Die Koordinaten sind Punkte von OSM-Objekten (Bahnhof, Platz, Gebäude). «Zentrum»-Orte sind ungefähre Ortsmitten. «Spital Kilchberg» ist die Bushaltestelle «Kilchberg Spital».
* **3D:** Die OpenFreeMap-Kacheln haben Gebäude bis Zoom 14 und keine Höhenlinien: Das Gelände ist flach, Gebäudehöhen sind OSM-Angaben oder Schätzwerte. Unter etwa Zoom 14 sieht man keine Körper. Ein eigenes 3D-Taxi gibt es nicht (flaches Symbol).
* **Spielmodus:** Das Strassennetz ist ein einmaliger Abzug (Overpass, 19.11.2026), ohne Ampeln, Vortritt, Abbiegeverbote und Verkehr. Einbahnstrassen werden beachtet. Wohnstrassen gibt es nur im Umkreis von 450 m um die Orte und Routen. Tempolimits ohne OSM-Angabe sind Annahmen und werden nicht angezeigt. Ankunft = 70 m Luftlinie zum Ort. Das ist Spiel und Lernhilfe, **kein Fahrtraining**.
* Im Fahrmodus ist das Auto schnell: ab 6× wird die Karte weniger stark herangezoomt, und Kacheln laden verzögert nach.
* Sprachansagen hängen von den Stimmen des Geräts ab. Ohne deutsche Stimme bleibt es still.
* Getestet in headless Chrome (Software-WebGL) mit echten Touch-Ereignissen (Handy hoch/quer, iPad 1024×768 und 1366×1024) und in WebKit (Playwright). Echte Samsung-/iPad-Hardware (GPU, S Pen, GPS, Bluetooth-Gamepad, Vibration) wurde nicht getestet. Bildraten siehe `/workspace/taxi-shots/v2/fps.txt` (Software-Grafik, auf echten Geräten höher).

## Installieren (Samsung / Chrome)

1. <https://ayoub971-prog.github.io/taxi-lernkarte/> in Chrome öffnen.
2. Menü (drei Punkte) → «Zum Startbildschirm hinzufügen» → «Installieren».

**iPad/iPhone (Safari):** Seite öffnen → Teilen-Symbol → «Zum Home-Bildschirm». Die App darf in alle Richtungen drehen (Manifest `orientation: any`), für den Spielmodus quer halten. Auf Android nach dem Update die installierte App einmal neu installieren, falls sie noch im Hochformat festhängt.

## Feste Orte ergänzen

1. Koordinate bei OpenStreetMap prüfen: auf <https://www.openstreetmap.org> Rechtsklick («Adresse anzeigen») oder Nominatim `https://nominatim.openstreetmap.org/search?q=...&format=jsonv2` (höchstens 1 Anfrage pro Sekunde, eigener User-Agent; Hilfsskript `tools/nominatim-lookup.sh`).
2. In `js/places.js` eine Zeile in `PLACES` ergänzen: `p('id', stufe, 'Typ', 'Name', 'Kurzname', 'Adresse', 'Hinweis', lat, lng, 'node/123')`. Die `id` bleibt für immer gleich.
3. `npm test` (prüft Rechteck, Dubletten, Pflichtfelder).
4. Sollen für den neuen Ort Prüfungsaufgaben entstehen: in `tools/fetch-routes.mjs` die Liste `ids` erweitern und das Skript neu laufen lassen (siehe unten).
5. Neue Version veröffentlichen (siehe unten).

Eigene Orte (nur auf deinem Gerät) legst du in der App mit langem Drücken an – dafür ist kein Code nötig.

## Routen neu berechnen (selten nötig)

`node tools/fetch-routes.mjs` fragt einmalig den öffentlichen OSRM-Demo-Server (höchstens 1 Anfrage pro Sekunde, ca. 3 Minuten) und schreibt `data/routes-ab.json` und `data/pairs.json`. Die App selbst fragt **nie** einen Routendienst. Die Daten stammen aus OpenStreetMap (© OpenStreetMap-Mitwirkende, ODbL).

## Neue Version veröffentlichen

1. Änderungen machen.
2. Versionsnummer überall gleichzeitig erhöhen: `node tools/bump-version.mjs 2` (setzt `VERSION` in `sw.js`, `APP_VERSION` in `js/app.js` und alle `?v=` in `index.html`, `manifest.webmanifest` und den Modulen). Von Hand: `VERSION` in `sw.js`, `APP_VERSION` in `js/app.js` und überall `?v=N`.
3. Neue Dateien in die Liste `ASSETS` in `sw.js` eintragen (`npm test` meldet fehlende).
4. `npm test` und optional `npm run smoke` (Browser-Test, braucht Chrome; Screenshots in `/workspace/taxi-shots`).
5. `git add -A && git commit && git push`. GitHub Pages (Branch `main`, Ordner `/`) veröffentlicht automatisch. Auf dem Handy die App einmal schliessen und neu öffnen, damit die neue Version aktiv wird.

## Code-Überblick (für die Weiterentwicklung)

Nur HTML, CSS und ES-Module, keine Build-Schritte, keine Abhängigkeiten ausser Leaflet (`vendor/leaflet/`, BSD-2) und MapLibre GL JS 5.24.1 (`vendor/maplibre/`, BSD-3, die UMD-Datei mit eingebettetem Worker; Version 6 gibt es nur als ES-Modul).

| Datei | Inhalt |
|---|---|
| `index.html`, `styles.css` | Oberfläche (Hochformat zuerst, grosse Tippflächen) |
| `js/app.js` | Karte, Pins, Orte-Liste, eigene Orte, Sicherung, Navigation |
| `js/places.js` | feste Orte (Daten + Suche), Stufen, Typen, Rechteck |
| `js/geo.js` | Distanz (Haversine), Punkte, Formatierung |
| `js/quiz.js`, `js/quizmode.js` | Quiz-Logik (rein) und Bedienung: Lernen/Üben/Prüfen/Heute/Stufe 4 |
| `js/progress.js`, `js/repeat.js` | Lernstand (6 Boxen, Ampel) und Fehlerliste für Abbiegefragen/Aufgaben |
| `js/drive.js`, `js/drivemode.js` | Fahr-Rechenkern (rein) und Fahrmodus (Karte drehen oder 3D-Kamera, Navi-Balken, Fragen) |
| `js/map3d.js` | 3D-Karte (MapLibre + OpenFreeMap): Gebäude, Pins, Linien, Kamera, Rückfall bei fehlendem WebGL |
| `js/labels.js` | grosse Namen: vier Plätze pro Pin, Überlappungen vermeiden (für Leaflet und MapLibre) |
| `js/game.js`, `js/gamemode.js`, `js/controls.js` | Spielmodus: Graph, Fahrphysik, Missionen, Dijkstra (rein, Node-getestet) · Bedienung/HUD/Menüs · Eingabe (Touch, Tastatur, Gamepad) |
| `js/overview.js` | Übersichtskarte und Minikarte (Fahr- und Spielmodus) |
| `js/zoomctl.js` | Zoom während der Fahrt: Knöpfe, Pinch, Mausrad, Tasten, Zuschlag `settings.driveZoom` |
| `js/store.js` | localStorage, JSON-Sicherung |
| `js/ui.js` | kleine DOM-Helfer, Sprachausgabe |
| `sw.js`, `manifest.webmanifest` | Offline und Installation |
| `data/*.json` | vorberechnete Routen (`tools/fetch-routes.mjs`) und Strassennetz `graph.json` (`tools/fetch-graph-raw.sh` + `tools/build-graph.mjs`) |
| `tests/` | `places`/`logic`/`static`/`game` `.test.mjs` (Node), `browser-smoke.mjs` (2D), `browser-3d.mjs` (3D, Spiel, Übersicht, iPad), `cdp.mjs` (Helfer), `webkit-smoke.py` |

Speicher im Browser: `localStorage`-Schlüssel `taxi-lernkarte-v1` (eigene Orte, Einstellungen, Lernstand, Bestwerte, Fehlerliste).

## Tests

```
npm test          # Node-Tests: Orte (Rechteck, Dubletten), Distanz/Quiz, Lernstand, Sicherung, Routen, Fahrlogik, Service Worker
npm run smoke     # echter Chrome (headless): 2D-Test und Spiel-Test in 2D (Touch, Übersicht, iPad-Grössen, Bildrate); Screenshots in /workspace/taxi-shots und /workspace/taxi-shots/v2
node tests/browser-3d.mjs   # nur für 3D (braucht Internet, öffnet die App mit ?3d=1)
python3 tests/webkit-smoke.py   # WebKit (Playwright): Fehler, Layout, Touch-Eigenschaften (braucht `python3 -m playwright install webkit`)
```

## Lizenz und Quellen

MIT-Lizenz (siehe `LICENSE`). Kartendaten © OpenStreetMap-Mitwirkende (ODbL, <https://www.openstreetmap.org/copyright>). Leaflet © Volodymyr Agafonkin (BSD-2-Clause). Routen: OSRM-Demo-Server auf OSM-Daten, einmalig abgerufen.

**3D-Karte – OpenFreeMap** (<https://openfreemap.org>): kostenlos, **ohne Schlüssel und ohne Konto**. Nutzungsbedingungen (Stand 14.10.2026, <https://openfreemap.org/tos/>): öffentlicher Dienst «as-is» ohne Garantie, kein automatisches Abgreifen von Daten, Offline-Downloads nur bis 3000 Kacheln/50 MB mit höchstens 4 parallelen Anfragen und eigenem User-Agent. Die App lädt **nur, was gerade angezeigt wird** (kein Vorab-Laden) und merkt sich höchstens 600 Dateien 7 Tage. Pflicht-Quellenangabe «OpenFreeMap © OpenMapTiles, Daten von OpenStreetMap» steht in der Karte. Der Dienst kann jederzeit eingestellt werden: dann bleibt die 2D-Karte. Eigene Hosting-Option: <https://github.com/hyperknot/openfreemap>. Vektordaten © OpenMapTiles (CC-BY 4.0) / OpenStreetMap-Mitwirkende (ODbL). MapLibre GL JS © MapLibre-Mitwirkende (BSD-3-Clause).

**Strassennetz für den Spielmodus** (`data/graph.json`): OpenStreetMap-Daten (ODbL), einmalig am 19.11.2026 in 6 Abfragen mit 20 s Pause über den Overpass-Server `overpass.openstreetmap.fr` geholt (`tools/fetch-graph-raw.sh`) und mit `tools/build-graph.mjs` in einen kleinen Graphen umgewandelt (Kreuzungen/Kanten, grösste zusammenhängende Komponente, 660 KB). Die App selbst fragt nie einen Overpass-Server.
