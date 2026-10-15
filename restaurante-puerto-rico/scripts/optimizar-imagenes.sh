#!/usr/bin/env bash
# Convierte las fotografías REALES del restaurante a AVIF, WebP y JPG optimizados
# en los tamaños que usa la web (800 px y 1600 px de ancho).
#
# Uso:
#   1. Copia las fotos originales en  fotos-originales/  con el nombre base exacto
#      que aparece en assets/img/LEEME.md  (p. ej. paella-restaurante-puerto-rico-madrid.jpg)
#   2. Ejecuta:  bash scripts/optimizar-imagenes.sh
#
# Requiere ImageMagick 7 (magick) o 6 (convert) con soporte WebP/AVIF.
# Alternativa sin instalar nada: https://squoosh.app (mismos tamaños y nombres).
set -euo pipefail
cd "$(dirname "$0")/.."

ORIGEN="fotos-originales"
DESTINO="assets/img"
IM="$(command -v magick || command -v convert || true)"
[ -n "$IM" ] || { echo "Necesitas ImageMagick (magick o convert)."; exit 1; }
mkdir -p "$DESTINO"

shopt -s nullglob nocaseglob
for f in "$ORIGEN"/*.{jpg,jpeg,png,heic,webp}; do
  base="$(basename "${f%.*}" | tr '[:upper:]' '[:lower:]')"
  for w in 800 1600; do
    # Sin metadatos (EXIF/GPS), perfil sRGB, enfoque suave tras el reescalado
    "$IM" "$f" -auto-orient -strip -colorspace sRGB -resize "${w}x>" -unsharp 0x0.6+0.6+0.02 \
          -quality 80 -interlace Plane "$DESTINO/$base-$w.jpg"
    "$IM" "$f" -auto-orient -strip -colorspace sRGB -resize "${w}x>" -quality 76 "$DESTINO/$base-$w.webp"
    "$IM" "$f" -auto-orient -strip -colorspace sRGB -resize "${w}x>" -quality 55 "$DESTINO/$base-$w.avif" \
      || echo "  (AVIF no disponible en tu ImageMagick: se usará WebP/JPG)"
  done
  echo "✓ $base"
done
echo "Listo. Revisa $DESTINO/"
