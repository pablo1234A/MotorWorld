#!/usr/bin/env bash
# Restaura una copia creada con ops/backup.sh en una base de datos VACÍA.
#
#   RESTORE_DATABASE_URL=postgres://…/presupio_restaurada ops/restore.sh presupio-….dump
#
# - Nunca restaures encima de la base de datos de producción en uso: restaura en una base
#   nueva, compruébala y después apunta la aplicación a ella (docs/operacion.md).
# - Tras restaurar, ejecuta `npm run db:migrate:prod` (o `npm run db:migrate` en desarrollo) con el
#   rol propietario: vuelve a conceder los permisos del rol de aplicación (la copia no incluye privilegios).
set -euo pipefail
: "${RESTORE_DATABASE_URL:?Define RESTORE_DATABASE_URL}"
FILE="${1:?Indica el archivo .dump}"
if [ -f "$FILE.sha256" ]; then sha256sum --check --quiet "$FILE.sha256"; fi
TABLES=$(psql "$RESTORE_DATABASE_URL" -tAc "select count(*) from information_schema.tables where table_schema = 'public'")
if [ "$TABLES" != "0" ]; then echo "La base de datos de destino no está vacía ($TABLES tablas). Aborto." >&2; exit 1; fi
# Sin las extensiones de la base de origen: Presupio no usa ninguna, y las de un PostgreSQL
# gestionado (pg_stat_statements…) solo puede crearlas un superusuario. Con ellas en la copia, la
# restauración como propietario fallaba entera («permission denied to create extension»).
LIST="$(mktemp)"
trap 'rm -f "$LIST"' EXIT
pg_restore --list "$FILE" | grep -v -E '^[0-9]+; [0-9]+ [0-9]+ (EXTENSION|COMMENT - EXTENSION) ' > "$LIST"
pg_restore --no-owner --no-privileges --exit-on-error --single-transaction --use-list="$LIST" --dbname="$RESTORE_DATABASE_URL" "$FILE"
psql "$RESTORE_DATABASE_URL" -tAc "select 'empresas: ' || count(*) from companies union all select 'presupuestos: ' || count(*) from quotes union all select 'migraciones: ' || string_agg(version, ', ' order by version) from schema_migrations"
echo "Restauración completada. Ejecuta ahora npm run db:migrate:prod contra esta base de datos."
