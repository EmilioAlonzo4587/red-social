#!/usr/bin/env bash
# Despliega una versión en el VPS. Lo ejecuta deploy.yml por SSH después de copiar infra/ a ~/app/infra-nuevo:
#   bash ~/app/infra-nuevo/deploy.sh <etiqueta-de-imagen>
# Si /api/health no responde, vuelve a la etiqueta anterior. El rollback no deshace migraciones:
# cada migración tiene que funcionar también con la imagen anterior.
set -euo pipefail

NEW_TAG="$1"
APP_DIR="${APP_DIR:-$HOME/app}"
cd "$APP_DIR"

PREV_TAG=$(grep '^IMAGE_TAG=' .env | cut -d= -f2)
DOMAIN=$(grep '^DOMAIN=' .env | cut -d= -f2)
HEALTH_URL="${HEALTH_URL:-https://$DOMAIN/api/health}"

# 1. El repo es la fuente de verdad de compose, Caddyfile y el script de respaldo.
#    cp escribe sobre el mismo archivo, así el montaje de Caddy ve el cambio.
cp infra-nuevo/docker-compose.yml docker-compose.yml
# El script de respaldo (S2-02) también viene del repo; install lo deja ejecutable aunque la copia no conserve permisos
install -m 755 infra-nuevo/backup-db.sh backup-db.sh
CADDY_CHANGED=0
if ! cmp -s infra-nuevo/Caddyfile Caddyfile; then
  cp infra-nuevo/Caddyfile Caddyfile
  CADDY_CHANGED=1
fi

# 2. Descargar las imágenes nuevas. IMAGE_TAG del entorno manda sobre el de .env,
#    que solo se actualiza cuando el despliegue sale bien.
export IMAGE_TAG="$NEW_TAG"
docker compose pull web api

# 3. Migraciones con la CLI de Prisma que trae la imagen (versión fija, sin npx).
#    Si fallan, el script se detiene y siguen corriendo los contenedores anteriores.
docker compose run --rm api ./node_modules/.bin/prisma migrate deploy

rollback() {
  echo "Falló el despliegue de $NEW_TAG; volviendo a $PREV_TAG"
  export IMAGE_TAG="$PREV_TAG"
  docker compose up -d --remove-orphans
  exit 1
}

# 4. Reiniciar con la versión nueva
docker compose up -d --remove-orphans || rollback
if [ "$CADDY_CHANGED" = 1 ]; then
  docker compose exec -T caddy caddy reload --config /etc/caddy/Caddyfile || rollback
fi

# 5. Comprobar /api/health durante un minuto
for _ in $(seq 1 20); do
  if curl -fsS "$HEALTH_URL" >/dev/null; then
    sed -i "s/^IMAGE_TAG=.*/IMAGE_TAG=$NEW_TAG/" .env
    echo "Desplegado $NEW_TAG"
    exit 0
  fi
  sleep 3
done
rollback