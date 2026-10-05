# API image only. Workers stay native on Windows (they spawn Ollama/TTS/
# ComfyUI and Remotion from local paths and need the GPU).
FROM node:22-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

FROM node:22-slim
ENV NODE_ENV=production
# Version stamp reported by /api/version (set by deploy.yml; "-dev" when unset).
ARG APP_VERSION=
ARG APP_COMMIT=
ARG APP_BUILD_DATE=
ENV APP_VERSION=$APP_VERSION APP_COMMIT=$APP_COMMIT APP_BUILD_DATE=$APP_BUILD_DATE
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN mkdir -p jobs logs && chown -R node:node /app
USER node
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=5s --start-period=40s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:3000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "src/server.js"]
