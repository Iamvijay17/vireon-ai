# Vireon AI

Self-hosted AI video generation. Give it a topic (or a course outline) and it writes a scene-by-scene script with a local LLM, narrates it with a local TTS model, optionally adds generated images, and renders the final video with Remotion. Everything runs on your own machine; there is no paid API in the pipeline.

## How it works

```
Topic ──► Script (Ollama) ──► Narration (Qwen3-TTS) ──► Caption alignment (faster-whisper)
                                                 │
                              optional images (ComfyUI)
                                                 ▼
                         assets.json ──► Remotion render (50 templates) ──► MinIO
```

Job stages, in order: `QUEUED` → `SCRIPT_GENERATION` → `SCRIPT_COMPLETED` → `GENERATING_AUDIO` → `AUDIO_COMPLETED` → `PREPARING_ASSETS` → `RENDERING` → `UPLOADING` → `COMPLETED`. Progress is pushed to the UI over Socket.IO.

## Repository layout

| Path | What it is |
|------|------------|
| `frontend/` | React 19 + Vite + Tailwind 4 UI (wizard, studio, render progress, courses, assets, analytics, logs). Embeds `@remotion/player` for live previews. |
| `backend/` | Express 5 API, BullMQ workers, Mongoose models, local-AI service managers. |
| `backend/remotion/` | Remotion project: the video templates and caption engine (npm workspace `vireon-remotion-templates`). |
| `backend/src/workers/` | `videoWorker` (single videos) and `courseVideoWorker` (course lessons). |
| `backend/templates/` | LLM prompt templates per video type (story, educational, marketing, podcast, ...). |
| `deploy/` | PowerShell scripts for the production PC: deploy, backup, watchdog, worker install, Tailscale config. |
| `docker-compose.yml` | Production stack: Redis, API, frontend (nginx), optional Tailscale / quick tunnel. |
| `DEPLOYMENT.md` | Full deployment guide. |
| `docs/` | Audits (`docs/audits/`), the course-workflow design prompt, Pinokio API notes, and the [publishing guide](docs/publishing.md) (YouTube upload + Udemy course package). |

The root `package.json` is an npm workspace (`frontend`, `backend/remotion`) with scripts that start everything at once.

## Stack

- **API:** Node.js 22, Express 5, Zod, Winston, Swagger UI at `/api-docs`
- **Data:** MongoDB (Atlas or local), Redis + BullMQ for queues
- **Storage:** MinIO (S3-compatible) — buckets `vireon-scenes` (audio) and `vireon-video` (renders)
- **LLM:** Ollama (`gemma4:e4b-it-qat`)
- **TTS:** Qwen3-TTS, with forced alignment via faster-whisper for caption timing
- **Render:** Remotion 4
- **Frontend:** React 19, Vite, Tailwind CSS 4, TanStack Query, Socket.IO client

## Prerequisites

- Node.js 22+
- MongoDB (local or Atlas) and Redis
- [MinIO](https://min.io/) running on `127.0.0.1:9000`
- [Ollama](https://ollama.com/) with a model pulled (`ollama pull gemma4:e4b-it-qat`)
- A running Qwen3-TTS server (default `http://localhost:7860`)
- Optional: ComfyUI (image generation)

A GPU with ~6 GB VRAM is enough for the default setup, which is why the worker runs one job at a time (`VIDEO_WORKER_CONCURRENCY=1`).

## Quick start (local development)

```bash
# 1. Install (root install covers the frontend and Remotion workspaces)
npm install
cd backend && npm install && cd ..

# 2. Configure the backend
cp backend/.env.example backend/.env
# fill in MONGODB_URI, MINIO_ROOT_USER, MINIO_ROOT_PASSWORD, ...

# 3. Run API + video worker + course worker + frontend together
npm run dev
```

The UI is at <http://localhost:5173> and the API at <http://localhost:3000> (docs at `/api-docs`).

Run only part of the stack:

| Command | Starts |
|---------|--------|
| `npm run dev` | API, video worker, course worker, frontend |
| `npm run dev:video` | frontend, API, video worker |
| `npm run dev:course` | frontend, API, course worker |
| `npm run dev:api` / `dev:worker` / `dev:course-worker` / `dev:frontend` | one process |
| `npm run dev:youtube-worker` / `dev:export-worker` | the optional [publishing](docs/publishing.md) workers (YouTube uploads, Udemy packages). Not part of `npm run dev` - see the shared-queue note in that guide |

The backend scripts also launch MinIO through `backend/package.json` → `minio` (`backend/scripts/start-minio.js`), which reads `MINIO_EXE` and `MINIO_DATA_DIR` from `backend/.env` (leave `MINIO_DATA_DIR` empty to skip it), or use the `*:only` scripts (e.g. `npm run server:only:dev --prefix backend`) to skip it.

### Remotion Studio

To work on templates in isolation:

```bash
npm run dev --prefix backend/remotion -- --port 3111
```

## Configuration

Key variables (see [`backend/.env.example`](backend/.env.example) and [`.env.example`](.env.example) for the full set):

| Variable | Purpose |
|----------|---------|
| `MONGODB_URI` | MongoDB connection string |
| `REDIS_HOST` / `REDIS_PORT` | Redis for BullMQ |
| `MINIO_ENDPOINT`, `MINIO_PORT`, `MINIO_ROOT_USER`, `MINIO_ROOT_PASSWORD` | Object storage |
| `MINIO_PUBLIC_URL` | URL stored in Mongo for media; the frontend re-homes it to `/media` in production |
| `CORS_ORIGIN` | Must match the URL users open |
| `OLLAMA_URL`, `OLLAMA_MODEL`, `OLLAMA_NUM_CTX` | Ollama settings |
| `TTS_API_URL` | Qwen3-TTS server |
| `VIDEO_WORKER_CONCURRENCY` | Parallel video jobs (keep at 1 on a 6 GB GPU) |
| `GPU_COORDINATOR=redis` | Enable the Redis GPU lease when more than one process uses the GPU |

## Resource IDs

Vireon Resource ID Format:

```text
<prefix>-<lowercase-alphanumeric-id>     e.g. aud-btclnx2w
```

The suffix is 8 characters from `a-z0-9` (36^8 ≈ 2.8 trillion per prefix), drawn from a cryptographically secure generator (`nanoid`'s `customAlphabet`, already a dependency). IDs are safe as URL segments, MongoDB `_id` strings, Redis/BullMQ keys, MinIO object keys and file names. All new IDs are made by `generateId(prefix)` in [`backend/src/utils/id.js`](backend/src/utils/id.js), the only place ID generation lives; the per-model helpers (`generateAudioGenerationId`, ...) are thin wrappers around it.

| Prefix | Resource |
| --- | --- |
| `aud-` | Audio Studio generation |
| `img-` | Image Studio generation |
| `job-` | Video job (`VideoJob` / `Project`) |
| `vid-` | Course video |
| `sce-` | Scene |
| `cou-` | Course |
| `crc-` | Course curriculum |
| `fav-` | Favourite voice |

Prefixes are the ones the app already used; they were not renamed. A prefix is only added when a persisted resource needs an ID (`generateId` throws on an unregistered prefix). Segment, word and similar IDs inside a timeline (e.g. `s03-seg002`) are positional, not resource IDs.

**Legacy IDs.** IDs created before this convention were uppercase (`aud-BTCLNX2W`). They were not migrated: they remain valid in the database, URLs, MinIO keys and API routes, and every validator accepts both forms (`ID_PATTERN` / `idPatternFor(prefix)`). A suffix is either all-lowercase or all-uppercase; mixed case is rejected. Nothing case-normalizes an ID, so `GET /api/audio/aud-BTCLNX2W` still resolves the old record and `aud-btclnx2w` is a different one. Use `NEW_ID_PATTERN` only to assert freshly generated IDs, never to validate input.

## Testing

```bash
npm test --prefix backend      # Jest
npm test --prefix frontend     # Vitest
npm run lint --prefix backend
npm run lint --prefix frontend
```

CI (`.github/workflows/ci.yml`) syntax-checks and tests the backend, tests and builds the frontend, and validates the compose file and Docker builds, on pushes to `main` and on pull requests.

## Deployment

Production runs on a single Windows PC: Redis, the API and nginx in Docker; MinIO, Ollama, TTS, ComfyUI and the two BullMQ workers natively (they need the GPU); MongoDB on Atlas. Remote access is through Tailscale Serve, so no ports are opened to the internet. Deploys are pull-based via `deploy/deploy.ps1`.

See [DEPLOYMENT.md](DEPLOYMENT.md) for the step-by-step guide.

> **The app has no login.** `backend/src/middleware/auth.js` is a stub. Keep it on a private network (Tailscale Serve) and do not expose it with Tailscale Funnel or a public tunnel until real auth exists.

## More documentation

- [backend/README.md](backend/README.md) — backend architecture and API notes
- [frontend/README.md](frontend/README.md) — frontend pages and setup
- [backend/remotion/README.md](backend/remotion/README.md) — Remotion templates
- [backend/src/core/README.md](backend/src/core/README.md) — GPU lease and parked scene-graph work
