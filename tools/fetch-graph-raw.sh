#!/bin/bash
# Holt die OSM-Rohdaten fuer tools/build-graph.mjs (einmalig, nacheinander, mit Pause und eigenem User-Agent).
# Benutzung: bash tools/fetch-graph-raw.sh /pfad/zu/osm-raw     (Overpass-Server: overpass.openstreetmap.fr)
mkdir -p "${1:-osm-raw}" && cd "${1:-osm-raw}" || exit 1
# one-time, sequential, respectful: 6 chunks, 20 s between requests
UA="taxi-lernkarte-build/1.0 (https://github.com/ayoub971-prog/taxi-lernkarte)"
i=0
for lat in 47.17 47.2467 47.3233; do
  for lon in 8.45 8.595; do
    lat2=$(python3 -c "print(round($lat+0.0767,4))"); lon2=$(python3 -c "print(round($lon+0.145,4))")
    out=chunk$i.json
    if [ ! -s $out ]; then
      curl -s -m 170 -A "$UA" --data-urlencode "data=[out:json][timeout:150];way[\"highway\"~\"^(motorway|motorway_link|trunk|trunk_link|primary|primary_link|secondary|secondary_link|tertiary|tertiary_link|unclassified|residential|living_street)\$\"]($lat,$lon,$lat2,$lon2);out tags geom;" https://overpass.openstreetmap.fr/api/interpreter -o $out
      echo "chunk $i $lat,$lon,$lat2,$lon2 -> $(stat -c %s $out) bytes"
      sleep 20
    fi
    i=$((i+1))
  done
done
