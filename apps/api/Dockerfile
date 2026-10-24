# Imagen de la api (NestJS + Prisma). Se construye desde la raíz del repo:
#   docker build -f apps/api/Dockerfile -t red-social-api .

# ---------- Etapa 1: compilar ----------
FROM node:22-alpine AS build
# Corepack falla con pnpm 12 en Node 22: se instala con npm, versión fija
RUN npm install -g pnpm@12.11.2
WORKDIR /repo
# Primero solo los archivos de dependencias: si no cambian, Docker reutiliza la capa del install
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/api/package.json apps/api/
# El postinstall corre "prisma generate", que necesita el esquema
COPY apps/api/prisma apps/api/prisma
RUN pnpm install --frozen-lockfile --filter api
COPY apps/api apps/api
RUN pnpm --filter api build
# Carpeta /out con la api y solo sus dependencias de producción, sin enlaces al monorepo
RUN pnpm --filter api deploy --prod --legacy /out \
 && cd /out && ./node_modules/.bin/prisma generate

# ---------- Etapa 2: imagen final ----------
# node:22-alpine ya trae libssl 3, que es lo que Prisma necesita (motor linux-musl-openssl-3.0.x)
FROM node:22-alpine AS runtime
LABEL org.opencontainers.image.source=https://github.com/EmilioAlonzo4587/red-social
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build --chown=node:node /out/node_modules ./node_modules
COPY --from=build --chown=node:node /out/package.json ./package.json
COPY --from=build --chown=node:node /out/prisma ./prisma
COPY --from=build --chown=node:node /repo/apps/api/dist ./dist
# Usuario sin privilegios que ya trae la imagen de Node
USER node
EXPOSE 3000
CMD ["node", "dist/main"]