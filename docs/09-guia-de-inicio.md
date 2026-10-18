# Guía de inicio

Pasos en orden para pasar de este documento a un proyecto funcionando. Los marcados con la issue correspondiente se cierran con esa issue.

## 1. Repositorio (Dev 3, S0-01)

1. Crear el repositorio en GitHub (privado o público) e invitar a los otros dos integrantes como colaboradores.
2. Descomprimir el paquete inicial en la raíz, hacer el primer commit en `main` y subirlo.
3. Comprobar en la pestaña Actions que el workflow **Documentación PDF** termina en verde. El PDF queda dentro de esa ejecución como artefacto descargable.

## 2. Tablero e issues (cualquiera, una sola vez)

1. Instalar y autenticar la CLI de GitHub: `gh auth login`, y luego `gh auth refresh -s project` para poder usar Projects.
2. Crear el tablero: `gh project create --owner <usuario-u-organización> --title "ChatInit"`. Anotar el número que devuelve.
3. En la web del tablero, configurar la vista Board con las columnas Backlog, Ready, In progress, In review y Done.
4. Crear etiquetas, milestones e issues y agregarlas al tablero:

```bash
pnpm install
pnpm issues:probar                     # simulación: muestra lo que hará sin crear nada
PROJECT_OWNER=<usuario-u-organización> PROJECT_NUMBER=<número> pnpm issues:crear
```

El script crea una etiqueta por integrante (`dev1`, `dev2`, `dev3`, `todos`) y otra por área, 5 milestones y 44 issues con sus criterios de aceptación, y enlaza las dependencias con el número real de cada issue. Si se vuelve a ejecutar, omite las issues que ya existen.

5. Asignar cada issue a su integrante según la etiqueta `dev1`, `dev2` o `dev3`.

## 3. Protección de main (Dev 3, S0-02)

En Settings → Branches → Add rule para `main`: exigir pull request, 1 aprobación, el check de estado obligatorio `verificar` (job del workflow CI) e incluir a los administradores.

## 4. Entorno local (todos)

Requisitos: Node 22, pnpm 12.11.2 (`npm install -g pnpm@12.11.2`), Docker y Git.

```bash
git clone <url-del-repo> && cd <repo>
cp .env.example .env               # completar las claves de Cloudinary
docker compose -f infra/docker-compose.dev.yml up -d
pnpm install
pnpm --filter api prisma migrate dev
pnpm --filter api prisma db seed
pnpm dev                            # web en :3001, api en :3000
```

Las apps se crean en las issues S0-04 (api) y S0-07 (web); hasta entonces solo funcionan los comandos de base de datos y de documentación.

## 5. Servidor (Dev 3, S0-03 y S1-01)

1. Crear el VPS con Ubuntu LTS y al menos 2 GB de RAM; agregar 2 GB de swap.
2. Crear el usuario `deploy`, copiar la llave SSH, desactivar el acceso por contraseña y el login de root.
3. Firewall: `ufw allow 22,80,443/tcp && ufw enable`.
4. Instalar Docker y el plugin de Compose; agregar `deploy` al grupo `docker`.
5. Apuntar el dominio a la IP del VPS.
6. Copiar `infra/` a `~/app` en el VPS y crear allí `.env` a partir de `.env.example` con valores reales.
7. Cargar los secrets `VPS_HOST`, `VPS_USER` y `VPS_SSH_KEY` en GitHub y mover `infra/plantillas/deploy.yml` a `.github/workflows/`.
8. Programar el respaldo: `crontab -e` con la línea indicada en `scripts/backup-db.sh`.

## 6. Mantener esta documentación

- Este documento vive en `docs/` y se edita con pull requests, como el código.
- Los diagramas son bloques Mermaid; GitHub los muestra directamente al abrir cada archivo.
- Para cambiar el backlog se edita `docs/plan/backlog.json` y se ejecuta `pnpm docs:sync`, que actualiza las historias y el backlog dentro de los capítulos. El CI falla si alguien olvida hacerlo.
- Cada cambio en `docs/` regenera el PDF automáticamente. Para la entrega final, se crea un release (por ejemplo `v1.0`) y el PDF queda adjunto en esa página.
- Para generarlo en local: `pnpm docs:pdf`, que deja el archivo en `dist/documentacion.pdf`.
