# Build context is the repo root (not backend/) because the Remotion render
# process shells out to backend/remotion's own node_modules - see
# RemotionService.getRemotionProjectRoot(). Debian (not Alpine) is required:
# Remotion's bundled headless Chromium needs glibc + the shared libs below.
FROM node:20-bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    libnss3 \
    libdbus-1-3 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libgbm1 \
    libasound2 \
    libxrandr2 \
    libxkbcommon0 \
    libxfixes3 \
    libxcomposite1 \
    libxdamage1 \
    libcups2 \
    libpango-1.0-0 \
    libcairo2 \
    fonts-liberation \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install backend deps
COPY backend/package.json backend/package-lock.json ./backend/
RUN cd backend && npm ci --omit=dev

# Install the Remotion render project's own deps (separate from backend/,
# see comment above - RemotionService looks for its CLI under
# backend/remotion/node_modules specifically)
COPY backend/remotion/package.json backend/remotion/package-lock.json ./backend/remotion/
RUN cd backend/remotion && npm ci

# Pre-download Remotion's headless browser so the first render doesn't pay
# for it and doesn't need network access at runtime.
RUN cd backend/remotion && npx remotion browser ensure

COPY backend/src ./backend/src
COPY backend/templates ./backend/templates
COPY backend/remotion ./backend/remotion

WORKDIR /app/backend

RUN mkdir -p jobs logs voices

EXPOSE 3000

CMD ["node", "src/server.js"]
