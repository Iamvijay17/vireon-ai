# API image only. Workers stay native on Windows (they spawn Ollama/TTS/
# ComfyUI and Remotion from local paths and need the GPU).
FROM node:22-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

FROM node:22-slim
ENV NODE_ENV=production
WORKDIR /app
# --chown on COPY instead of a trailing `chown -R /app`: the recursive form
# rewrites every file into a second layer and doubles the image size.
COPY --from=deps --chown=node:node /app/node_modules ./node_modules
COPY --chown=node:node . .
# /app itself must stay writable for the node user (the API creates files next
# to the sources at runtime), as it was before; jobs/ and logs/ are bind-mounted
# over by docker-compose.
RUN mkdir -p jobs logs && chown node:node /app jobs logs
USER node
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=5s --start-period=40s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:3000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
# Node is PID 1 and handles SIGTERM itself (server.js shutdown()); compose adds
# `init: true` for zombie reaping.
CMD ["node", "src/server.js"]

# Build stamp reported by /api/version and the OCI labels deploy.ps1 verifies
# ("-dev" when unset). Declared LAST on purpose: ARG values are part of the
# layer cache key of everything after them, and APP_BUILD_DATE changes on every
# build, so declaring them above `COPY . .` re-ran the copy on every build.
ARG APP_VERSION=
ARG APP_COMMIT=
ARG APP_BUILD_DATE=
ENV APP_VERSION=$APP_VERSION APP_COMMIT=$APP_COMMIT APP_BUILD_DATE=$APP_BUILD_DATE
LABEL org.opencontainers.image.title="vireon-backend" \
      org.opencontainers.image.version=$APP_VERSION \
      org.opencontainers.image.revision=$APP_COMMIT \
      org.opencontainers.image.created=$APP_BUILD_DATE
