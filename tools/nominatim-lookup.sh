#!/bin/bash
# Einmaliges Nachschlagen von Koordinaten bei Nominatim (OSM). Nutzungsregeln: max. 1 Anfrage/Sekunde,
# eigener User-Agent, keine Massenabfragen. Benutzung: tools/nominatim-lookup.sh "Suchtext" ...
for q in "$@"; do
  echo "### $q"
  for try in 1 2; do
    out=$(curl -s -A "taxi-lernkarte-datencheck/1.0 (privat, github ayoub971-prog)" -G "https://nominatim.openstreetmap.org/search" \
      --data-urlencode "q=$q" -d "format=jsonv2&limit=3&countrycodes=ch")
    echo "$out" | python3 -c 'import json,sys
for r in json.load(sys.stdin): print(r["lat"], r["lon"], r["category"]+"/"+r["type"], "|", r["display_name"][:100], "| osm", r["osm_type"], r["osm_id"])' 2>/dev/null && break
    sleep 3
  done
  sleep 1.3
done
