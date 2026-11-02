#!/usr/bin/env sh
# Nightly backup: PostgreSQL dump + object storage mirror. Run by the `backup` service.
set -eu
STAMP=$(date -u +%Y%m%dT%H%M%SZ)
DEST=/backups/$STAMP
mkdir -p "$DEST"
pg_dump --format=custom --no-owner "$DATABASE_URL_SYNC" > "$DEST/db.dump"
if [ -n "${S3_ENDPOINT_URL:-}" ]; then
  mc alias set src "$S3_ENDPOINT_URL" "$S3_ACCESS_KEY" "$S3_SECRET_KEY" >/dev/null
  mc mirror --overwrite --quiet "src/$S3_BUCKET" "$DEST/storage"
fi
# keep the last N backups
ls -1d /backups/*/ 2>/dev/null | sort | head -n -"${BACKUP_KEEP:-7}" | xargs -r rm -rf
echo "backup ok: $DEST"
