#!/usr/bin/env bash
# Copia de seguridad de PostgreSQL (formato custom, comprimida) con rotación.
# Uso: DATABASE_URL=... BACKUP_DIR=/var/backups/resenalo KEEP_DAYS=14 ./scripts/backup-db.sh
# Programar con cron (p. ej. 02:30 diario) y copiar BACKUP_DIR a un almacenamiento externo cifrado.
set -euo pipefail
: "${DATABASE_URL:?Falta DATABASE_URL}"
BACKUP_DIR="${BACKUP_DIR:-./backups}"
KEEP_DAYS="${KEEP_DAYS:-14}"
mkdir -p "$BACKUP_DIR"
FILE="$BACKUP_DIR/resenalo-$(date -u +%Y%m%dT%H%M%SZ).dump"
pg_dump --format=custom --no-owner --no-privileges --dbname="$DATABASE_URL" --file="$FILE"
pg_restore --list "$FILE" > /dev/null   # verificación de integridad del volcado
chmod 600 "$FILE"
find "$BACKUP_DIR" -name 'resenalo-*.dump' -mtime +"$KEEP_DAYS" -delete
echo "Copia creada: $FILE"
# Restaurar: pg_restore --clean --if-exists --no-owner --dbname="$DATABASE_URL" "$FILE"
