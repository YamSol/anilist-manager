# syntax=docker/dockerfile:1
#
# Imagem do AniList Manager: o mesmo dist/ do site estático, servido por nginx.
# Não há backend (AD-01, RNF-01) — a imagem é um servidor de arquivos e nada mais.
#
# Build a partir da RAIZ do repositório:
#   docker build -f deploy/Dockerfile -t anilist-manager .
#   docker run --rm -p 3000:8080 anilist-manager

# --- estágio 1: build --------------------------------------------------------
FROM node:22-alpine AS build

WORKDIR /app

# Husky instala git hooks no `prepare`; dentro da imagem não há .git nem para quê.
ENV HUSKY=0
ENV CI=true

# Os manifests primeiro: a camada do `npm ci` só é invalidada quando as
# dependências mudam, não a cada alteração de código.
COPY package.json package-lock.json ./
COPY packages/core/package.json packages/core/package.json
COPY apps/web/package.json apps/web/package.json
RUN npm ci --no-audit --no-fund

COPY . .
RUN npm run build

# --- estágio 2: runtime ------------------------------------------------------
FROM nginx:alpine AS runtime

# Substitui a config principal: o default de conf.d/ não é incluído por ela.
COPY deploy/nginx.conf /etc/nginx/nginx.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html

# O usuário `nginx` (uid 101) já existe na imagem base. Rodar sem privilégio
# implica escutar acima de 1024: a porta publicada continua sendo a 3000 no host.
USER nginx
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --quiet --spider http://127.0.0.1:8080/healthz || exit 1

CMD ["nginx", "-g", "daemon off;"]
