#!/usr/bin/env bash
# Respaldo diario de PostgreSQL (S2-02). deploy.sh lo copia a ~/app y cron lo corre a las 03:00 UTC:
#   0 3 * * * $HOME/app/backup-db.sh >> $HOME/backups/backup.log 2>&1
# Guarda los últimos 7 en BACKUP_DIR y, si BACKUP_REMOTE tiene un remoto de rclone, también allí.
set -euo pipefail
# Los respaldos tienen datos personales: solo el dueño puede leerlos (600 en archivos, 700 en carpetas)
umask 077

APP_DIR="${APP_DIR:-$HOME/app}"
BACKUP_DIR="${BACKUP_DIR:-$HOME/backups}"
KEEP=7
cd "$APP_DIR"
mkdir -p "$BACKUP_DIR"

# Una sola ejecución a la vez. flock viene en Ubuntu; en macOS no existe y en local se omite.
if command -v flock >/dev/null; then
  exec 9>"$BACKUP_DIR/.lock"
  flock -n 9 || { echo "Ya hay un respaldo en curso"; exit 1; }
fi

# Sin source .env: solo se lee esta línea. La variable del entorno manda (pruebas locales).
if [ -z "${BACKUP_REMOTE+x}" ]; then
  BACKUP_REMOTE=$( (grep '^BACKUP_REMOTE=' .env 2>/dev/null || true) | cut -d= -f2-)
fi

STAMP=$(date -u +%Y%m%d-%H%M%S)
OUT="$BACKUP_DIR/chatinit-$STAMP.dump"
TMP="$OUT.parcial"
trap 'rm -f "$TMP"' EXIT

# pg_dump corre dentro del contenedor con sus propias variables: la clave no pasa por aquí.
# Formato custom (-Fc): ya viene comprimido y pg_restore puede revisarlo y restaurarlo (S4-03).
docker compose exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc --no-owner' > "$TMP"

# Leer el archivo completo sin restaurarlo: si está cortado o dañado, no cuenta como respaldo
docker compose exec -T db pg_restore -f /dev/null < "$TMP"
mv "$TMP" "$OUT"

# Los nombres llevan la fecha UTC: ordenados al revés, los primeros KEEP son los más nuevos
sobrantes() { sort -r | tail -n +$((KEEP + 1)); }

if [ -n "$BACKUP_REMOTE" ]; then
  rclone copy "$OUT" "$BACKUP_REMOTE"
  rclone lsf "$BACKUP_REMOTE" --include 'chatinit-*.dump' | sobrantes |
    while read -r f; do rclone deletefile "$BACKUP_REMOTE/$f"; done
else
  echo "AVISO: BACKUP_REMOTE está vacío; este respaldo no salió del servidor"
fi

# Rotar en local solo después de tener un respaldo nuevo, válido y (si aplica) ya copiado fuera
find "$BACKUP_DIR" -maxdepth 1 -name 'chatinit-*.dump' | sobrantes |
  while read -r f; do rm -- "$f"; done
echo "$(date -u +%FT%TZ) Respaldo creado: $(basename "$OUT")"
