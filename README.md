# Taxi-Lernkarte

Eine kleine, **kostenlose** Web-App (PWA) zum Lernen der Orte zwischen **Wädenswil und Zürich** (linkes Zürichseeufer und Stadt Zürich). Sie läuft im Chrome-Browser (zum Beispiel auf dem Samsung Galaxy S25 Ultra), lässt sich auf den Startbildschirm installieren und braucht **kein Konto, keine Werbung, keine API-Schlüssel und keinen Server**.

Live: <https://ayoub971-prog.github.io/taxi-lernkarte/>

> **Wichtig:** Die App ist eine **freiwillige Lernhilfe**. Sie ist **nicht offiziell** und **nicht zum Navigieren** gedacht. Prüfungsregeln müssen beim **Strassenverkehrsamt Zürich** geprüft werden. Laut cab24.ch gibt es im Kanton Zürich keine Ortskundeprüfung mehr – das ist nicht amtlich bestätigt und muss beim Strassenverkehrsamt Zürich erfragt werden. Die Routen sind Lernskizzen, **keine Prüfungsrouten**.

## Funktionen

* **Karte** mit OpenStreetMap-Kacheln (Quellenangabe immer sichtbar), Leaflet **lokal im Repo** (kein CDN).
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
* **Eigene Orte**: lange auf die Karte drücken (ca. 0.6 Sekunden) → Name und Notiz → speichern. Bearbeiten und Löschen im Popup. Sie sind auch im Quiz dabei.
* **Mein Standort** (Geolocation) mit Liste «In der Nähe» (die drei nächsten Lernorte).
* **Sicherung**: alle eigenen Orte und der Lernstand als lesbare JSON-Datei speichern und wieder laden (Menü «Mehr»).
* **Offline-fähig**: App-Hülle, Routen und Daten sind im Service Worker. Kartenkacheln, die du angesehen hast, bleiben moderat gespeichert (max. 400 Kacheln, 7 Tage).

## Grenzen

* **Kartenkacheln brauchen beim ersten Ansehen eines Ausschnitts Internet.** Es gibt bewusst *kein* Vorab-Laden ganzer Gebiete (OSM-Kachelregeln). Ohne Netz sind nur schon gesehene Ausschnitte sichtbar.
* Die Routen sind **Lernskizzen** aus einer einmaligen Abfrage des öffentlichen OSRM-Demo-Servers (Stand 18.11.2026). Verkehr, Baustellen und spätere Strassenänderungen sind nicht berücksichtigt. Route B führt über die Bahnhöfe der Orte (sie wurde so gebaut, dass sie an jedem Ort vorbeikommt) und folgt deshalb nicht überall genau der Hauptstrasse. Die Fahrhinweise stammen aus OSRM und sind auf Deutsch zusammengesetzt, nicht amtlich.
* Die Koordinaten sind Punkte von OSM-Objekten (Bahnhof, Platz, Gebäude). «Zentrum»-Orte sind ungefähre Ortsmitten. «Spital Kilchberg» ist die Bushaltestelle «Kilchberg Spital».
* Im Fahrmodus ist das Auto schnell: ab 6× wird die Karte weniger stark herangezoomt, und Kacheln laden verzögert nach.
* Sprachansagen hängen von den Stimmen des Geräts ab. Ohne deutsche Stimme bleibt es still.
* Getestet in headless Chrome (412 × 915, Hoch- und Querformat). Echte Samsung-Hardware (S Pen, GPS, Mehrfinger) wurde nicht getestet.

## Installieren (Samsung / Chrome)

1. <https://ayoub971-prog.github.io/taxi-lernkarte/> in Chrome öffnen.
2. Menü (drei Punkte) → «Zum Startbildschirm hinzufügen» → «Installieren».

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

Nur HTML, CSS und ES-Module, keine Build-Schritte, keine Abhängigkeiten ausser Leaflet (in `vendor/leaflet/`, BSD-2-Lizenz).

| Datei | Inhalt |
|---|---|
| `index.html`, `styles.css` | Oberfläche (Hochformat zuerst, grosse Tippflächen) |
| `js/app.js` | Karte, Pins, Orte-Liste, eigene Orte, Sicherung, Navigation |
| `js/places.js` | feste Orte (Daten + Suche), Stufen, Typen, Rechteck |
| `js/geo.js` | Distanz (Haversine), Punkte, Formatierung |
| `js/quiz.js`, `js/quizmode.js` | Quiz-Logik (rein) und Bedienung: Lernen/Üben/Prüfen/Heute/Stufe 4 |
| `js/progress.js`, `js/repeat.js` | Lernstand (6 Boxen, Ampel) und Fehlerliste für Abbiegefragen/Aufgaben |
| `js/drive.js`, `js/drivemode.js` | Fahr-Rechenkern (rein) und Fahrmodus (Karte drehen, Navi-Balken, Fragen) |
| `js/store.js` | localStorage, JSON-Sicherung |
| `js/ui.js` | kleine DOM-Helfer, Sprachausgabe |
| `sw.js`, `manifest.webmanifest` | Offline und Installation |
| `data/*.json` | vorberechnete Routen (gebaut von `tools/fetch-routes.mjs`) |
| `tests/` | `places.test.mjs`, `logic.test.mjs`, `static.test.mjs`, `browser-smoke.mjs` |

Speicher im Browser: `localStorage`-Schlüssel `taxi-lernkarte-v1` (eigene Orte, Einstellungen, Lernstand, Bestwerte, Fehlerliste).

## Tests

```
npm test          # Node-Tests: Orte (Rechteck, Dubletten), Distanz/Quiz, Lernstand, Sicherung, Routen, Fahrlogik, Service Worker
npm run smoke     # echter Chrome (headless) im Handyformat, macht Screenshots
```

## Lizenz und Quellen

MIT-Lizenz (siehe `LICENSE`). Kartendaten © OpenStreetMap-Mitwirkende (ODbL, <https://www.openstreetmap.org/copyright>). Leaflet © Volodymyr Agafonkin (BSD-2-Clause). Routen: OSRM-Demo-Server auf OSM-Daten, einmalig abgerufen.
