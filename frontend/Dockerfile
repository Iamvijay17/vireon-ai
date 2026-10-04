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

FROM nginx:1.27-alpine
COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/frontend/dist /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=15s --timeout=3s --retries=5 \
  CMD wget -qO- http://127.0.0.1/nginx-health || exit 1
