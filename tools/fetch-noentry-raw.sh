#!/bin/bash
# Holt OSM-Rohdaten fuer tools/build-noentry.mjs: Wege, auf denen Autos NICHT fahren duerfen (Fussgaengerzonen, Fuss-/Velowege, Treppen,
# Feldwege, Busspuren). Einmalig, nacheinander, mit Pause und eigenem User-Agent (Overpass: overpass.openstreetmap.fr).
# Benutzung: bash tools/fetch-noentry-raw.sh /pfad/zu/osm-noentry
mkdir -p "${1:-osm-noentry}" && cd "${1:-osm-noentry}" || exit 1
UA="taxi-lernkarte-build/1.0 (https://github.com/ayoub971-prog/taxi-lernkarte)"
i=0
for lat in 47.17 47.2467 47.3233; do
  for lon in 8.45 8.595; do
    lat2=$(python3 -c "print(round($lat+0.0767,4))"); lon2=$(python3 -c "print(round($lon+0.145,4))")
    out=chunk$i.json
    if [ ! -s $out ]; then
      curl -s -m 170 -A "$UA" --data-urlencode "data=[out:json][timeout:150];way[\"highway\"~\"^(pedestrian|footway|cycleway|path|steps|track|bridleway|busway|bus_guideway)\$\"]($lat,$lon,$lat2,$lon2);out tags geom;" https://overpass.openstreetmap.fr/api/interpreter -o $out
      echo "chunk $i $lat,$lon,$lat2,$lon2 -> $(stat -c %s $out) bytes"
      sleep 20
    fi
    i=$((i+1))
  done
done
