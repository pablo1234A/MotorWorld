#!/usr/bin/env bash
# Copia de seguridad lógica de la base de datos de Presupio (formato personalizado de pg_dump).
#
#   BACKUP_DATABASE_URL=postgres://… ops/backup.sh [directorio]
#
# - Usa un rol con permiso de lectura de todo el esquema (el propietario, MIGRATION_DATABASE_URL).
# - Escribe presupio-AAAAmmdd-HHMMSS.dump y su suma SHA-256; no imprime la URL ni la clave.
# - Complementa (no sustituye) las copias automáticas y la recuperación a un punto en el
#   tiempo (PITR) del proveedor de PostgreSQL gestionado. Ver docs/operacion.md.
set -euo pipefail
: "${BACKUP_DATABASE_URL:?Define BACKUP_DATABASE_URL}"
DIR="${1:-./backups}"
mkdir -p "$DIR"
umask 077
FILE="$DIR/presupio-$(date -u +%Y%m%d-%H%M%S).dump"
pg_dump --format=custom --compress=6 --no-owner --no-privileges --file="$FILE" "$BACKUP_DATABASE_URL"
sha256sum "$FILE" > "$FILE.sha256"
# Comprobación mínima: el archivo se puede leer y contiene las tablas principales.
# grep -c (no -q): lee todo el listado. Con «grep -q» y pipefail, pg_restore recibía SIGPIPE si
# grep terminaba antes y la copia (correcta) fallaba de forma intermitente (~7 % en la auditoría).
pg_restore --list "$FILE" | grep -c "TABLE public quotes" >/dev/null || { echo "La copia no contiene la tabla quotes" >&2; exit 1; }
echo "Copia creada: $FILE ($(du -h "$FILE" | cut -f1))"
