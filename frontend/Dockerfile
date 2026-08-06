# Build context is the repo root: frontend depends on the
# "vireon-remotion-templates" workspace package (backend/remotion), which
# only resolves via the root npm workspace install (see root node_modules/
# vireon-remotion-templates symlink) - `npm ci` inside frontend/ alone
# would fail to find it.
FROM node:20-bookworm-slim AS build

WORKDIR /app

# package-lock.json is intentionally NOT copied here: it was generated on
# Windows and only has a resolved package entry for
# @rolldown/binding-win32-x64-msvc (vite 8's rolldown bundler ships
# per-platform native binaries as optionalDependencies). Both `npm ci` and
# `npm install` refuse to add the missing linux-x64-gnu binding while that
# lockfile is present - a known npm bug (npm/cli#4828) where optional
# platform deps not already in the lock aren't re-resolved. Installing
# without a lockfile lets npm resolve fresh for the container's platform.
COPY package.json ./
COPY frontend/package.json ./frontend/
COPY backend/remotion/package.json ./backend/remotion/

RUN npm install

COPY frontend ./frontend
COPY backend/remotion ./backend/remotion

RUN npm run build --workspace=frontend

FROM nginx:1.27-alpine

COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/frontend/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
