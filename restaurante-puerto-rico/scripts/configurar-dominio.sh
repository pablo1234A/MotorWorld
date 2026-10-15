#!/usr/bin/env bash
# Sustituye el dominio provisional (www.tudominio.es) por el dominio real en
# canonical, Open Graph, Twitter, JSON-LD, robots.txt, sitemap.xml y .htaccess.
# Uso:  bash scripts/configurar-dominio.sh www.restaurante-ejemplo.es
set -euo pipefail
cd "$(dirname "$0")/.."
NUEVO="${1:?Indica el dominio, p. ej.: www.midominio.es}"
NUEVO="${NUEVO#https://}"; NUEVO="${NUEVO#http://}"; NUEVO="${NUEVO%/}"
grep -rl "www.tudominio.es" --include="*.html" --include="*.xml" --include="*.txt" --include=".htaccess" . \
  | while read -r f; do sed -i.bak "s#www\.tudominio\.es#${NUEVO}#g" "$f" && rm -f "$f.bak"; echo "✓ $f"; done
echo "Dominio actualizado a https://${NUEVO}/"
