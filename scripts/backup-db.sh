#!/usr/bin/env bash
# Respaldo diario de PostgreSQL (issue S2-02). Programar en el VPS con cron:
#   0 3 * * * /home/deploy/app/scripts/backup-db.sh >> /home/deploy/backup.log 2>&1
# Copia el respaldo fuera del VPS con el comando definido en BACKUP_UPLOAD_CMD (por ejemplo rclone).
set -euo pipefail
cd "$(dirname "$0")/../infra"
source .env
STAMP=$(date -u +%Y%m%d-%H%M)
OUT="$HOME/backups/minired-$STAMP.sql.gz"
mkdir -p "$HOME/backups"
docker compose exec -T db pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --no-owner | gzip > "$OUT"
if [ -n "${BACKUP_UPLOAD_CMD:-}" ]; then eval "$BACKUP_UPLOAD_CMD \"$OUT\""; fi
ls -1t "$HOME"/backups/minired-*.sql.gz | tail -n +8 | xargs -r rm --
echo "Respaldo creado: $OUT"
