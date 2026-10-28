# Imagen de la web (Next.js en modo standalone). Se construye desde la raíz del repo:
#   docker build -f apps/web/Dockerfile -t red-social-web .

# ---------- Etapa 1: compilar ----------
FROM node:22-alpine AS build
# Corepack falla con pnpm 12 en Node 22: se instala con npm, versión fija
RUN npm install -g pnpm@12.11.2
WORKDIR /repo
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/web/package.json apps/web/
COPY packages/api-types/package.json packages/api-types/
RUN pnpm install --frozen-lockfile --filter web
COPY apps/web apps/web
COPY packages/api-types packages/api-types
# Next escribe las NEXT_PUBLIC_* dentro del JavaScript al compilar: tienen que existir aquí
ARG NEXT_PUBLIC_APP_URL
ARG NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME
ENV NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL \
    NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME=$NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME \
    NEXT_TELEMETRY_DISABLED=1
RUN pnpm --filter web build

# ---------- Etapa 2: imagen final ----------
FROM node:22-alpine AS runtime
LABEL org.opencontainers.image.source=https://github.com/EmilioAlonzo4587/red-social
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0
WORKDIR /app
# standalone trae server.js y el node_modules mínimo; los estáticos se copian aparte
COPY --from=build --chown=node:node /repo/apps/web/.next/standalone ./
COPY --from=build --chown=node:node /repo/apps/web/.next/static ./apps/web/.next/static
USER node
EXPOSE 3000
CMD ["node", "apps/web/server.js"]