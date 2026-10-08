# Build context is the REPO ROOT (the frontend imports the shared
# vireon-remotion-templates workspace package from backend/remotion):
#   docker build -f frontend/Dockerfile .
FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY frontend/package.json frontend/
COPY backend/remotion/package.json backend/remotion/
# Full workspace install: the frontend also needs backend/remotion's deps (gsap, fonts...)
RUN npm ci
COPY deploy/install-linux-natives.cjs deploy/
RUN node deploy/install-linux-natives.cjs
COPY frontend frontend
COPY backend/remotion backend/remotion
# Version stamp shown in the UI (set by deploy.yml; "dev" when built by hand).
ARG APP_VERSION=dev
ARG APP_COMMIT=
ARG APP_BUILD_DATE=
ENV APP_VERSION=$APP_VERSION APP_COMMIT=$APP_COMMIT APP_BUILD_DATE=$APP_BUILD_DATE
# No VITE_* needed: the production build uses same-origin /api, /socket.io, /media.
RUN npm run build --workspace=frontend
# Same stamp as a static file (GET /version.json) so a deploy can prove which
# build nginx is serving without parsing the JS bundle.
RUN printf '{"version":"%s","commit":"%s","buildDate":"%s"}\n' \
      "$APP_VERSION" "$APP_COMMIT" "$APP_BUILD_DATE" > frontend/dist/version.json

# Unprivileged nginx: master and workers run as uid 101 and listen on 8080
# (no root, no privileged port). The host-facing port is still 127.0.0.1:8080,
# mapped in docker-compose.yml.
FROM nginxinc/nginx-unprivileged:1.27-alpine
ARG APP_VERSION=dev
ARG APP_COMMIT=
ARG APP_BUILD_DATE=
ENV APP_VERSION=$APP_VERSION APP_COMMIT=$APP_COMMIT APP_BUILD_DATE=$APP_BUILD_DATE
LABEL org.opencontainers.image.title="vireon-frontend" \
      org.opencontainers.image.version=$APP_VERSION \
      org.opencontainers.image.revision=$APP_COMMIT \
      org.opencontainers.image.created=$APP_BUILD_DATE
COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/frontend/dist /usr/share/nginx/html
EXPOSE 8080
HEALTHCHECK --interval=15s --timeout=3s --retries=5 \
  CMD wget -qO- http://127.0.0.1:8080/nginx-health || exit 1
