# Vireon AI - Backend

Express API and BullMQ workers for the Vireon AI video pipeline. The API creates and edits jobs; the workers do the heavy lifting (LLM script, TTS, images, Remotion render) against local AI services and MinIO.

For the project overview and deployment, see the [root README](../README.md).

## Tech stack

- **Runtime / framework:** Node.js 22, Express 5
- **Database:** MongoDB (Mongoose)
- **Queues:** BullMQ on Redis (`video-rendering`, plus a course queue)
- **Realtime:** Socket.IO
- **LLM:** Ollama
- **TTS:** self-hosted Qwen3-TTS; faster-whisper forced alignment (`services/audio/alignCaptions.py`) for caption timing
- **Images (optional):** ComfyUI
- **Rendering:** Remotion (templates live in [`remotion/`](remotion/README.md))
- **Storage:** MinIO (the only storage backend)
- **Validation / logging / docs:** Zod, Winston, Swagger UI (`/api-docs`)

## Layout

```
src/
├── config/        # env config + Zod validation at boot (validate.js), DB, swagger
├── constants/     # JOB_STATUS, pipeline stages, allowed job transitions
├── controllers/   # thin request handlers
├── core/          # GPU lease (live) and scene-graph runner (parked) - see core/README.md
├── ir/            # scene IR: schema, compile, template registry, toRenderProps
├── middleware/    # auth stub, error handler, requireCourseWorker
├── models/        # Mongoose models (VideoJob, Course, CourseVideo, Asset, ActivityLog, JobEvent, ...)
├── queues/        # BullMQ queues (videoQueue, courseQueue)
├── routes/        # Express routers (one per resource, Swagger-annotated)
├── services/
│   ├── video/     # VideoService (crud, lifecycle, resume logic), ScriptParser, RemotionService
│   ├── course/    # courses, curricula, course videos
│   ├── audio/     # TTS client, caption alignment
│   ├── director/  # AI director: scene, visual, motion and voice planning
│   ├── localAI/   # start/stop/health managers for Ollama, TTS, ComfyUI + GPU slot manager
│   ├── storage/   # StorageService + MinIO provider
│   ├── asset/     # asset library
│   ├── job/       # cross-type job aggregation
│   └── common/    # LLM, prompts, cache, logger, sockets, metrics, retry policy
├── validators/    # Zod request schemas
├── workers/       # videoWorker/ (script, audio, images, render, upload steps) and courseVideoWorker.js
└── server.js
templates/         # LLM prompt templates per video type
scripts/           # one-off maintenance scripts (backfills, artifact stats, ...)
voices/            # reference .wav files for voice cloning, served at /voice-samples
tests/             # Jest suites
```

## Video pipeline

Statuses are defined in [`src/constants/index.js`](src/constants/index.js) (`JOB_STATUS`):

1. `QUEUED` - job created and added to the queue
2. `SCRIPT_GENERATION` → `SCRIPT_COMPLETED` - the LLM writes the script, which is validated and saved in MongoDB
3. `AWAITING_APPROVAL` - the script is reviewed/edited, then approved (`POST /api/videos/:id/approve`)
4. `GENERATING_AUDIO` → `AUDIO_COMPLETED` - TTS per scene, caption timing aligned with faster-whisper, each file uploaded to MinIO as soon as it exists
5. `GENERATING_IMAGES` → `IMAGE_COMPLETED` - optional step when the job uses generated images
6. `PREPARING_ASSETS` - `assets.json` built for Remotion (local scratch only)
7. `RENDERING` - Remotion renders the video and thumbnail
8. `UPLOADING` → `COMPLETED` - output uploaded to MinIO, local scratch wiped

Terminal/recovery states: `FAILED`, `CANCELLED`, `RETRY_SCHEDULED` (a step failed with retries left; the job re-enters the pipeline after a backoff). BullMQ's own retry is off (`attempts: 1`); retries are handled at the app level, see [`videoQueue.js`](src/queues/videoQueue.js).

The same stages are grouped into 9 named macro-stages for reporting in [`pipelineStages.js`](src/constants/pipelineStages.js). Course videos follow a parallel flow handled by `courseVideoWorker.js`.

### Storage

Three MinIO buckets (names overridable via `MINIO_*_BUCKET`):

| Bucket | Contents |
|--------|----------|
| `vireon-scenes` | per-scene audio, keyed by video id |
| `vireon-video` | render output, keyed by video id |
| `vireon-cache` | content-addressed cache shared across jobs (TTS etc.); disable with `SMART_CACHE_ENABLED=false` |

Script content lives in MongoDB. `backend/jobs/` is scratch space only and is wiped after each job.

### Scene IR

`src/ir/` compiles scenes into a validated intermediate representation and converts it to Remotion render props. `IR_MODE` controls it: `shadow` (default, compile and diff without affecting output), `authoritative`, or `off`.

## Running

Prerequisites: MongoDB, Redis, MinIO, Ollama and the TTS server. See the root README.

```bash
npm install
cp .env.example .env     # then fill in MONGODB_URI, MINIO_ROOT_USER, MINIO_ROOT_PASSWORD, ...

npm run dev              # API with watch (also starts MinIO)
npm run worker:dev       # video worker (separate terminal)
npm run course-worker:dev
```

`start`, `dev`, `worker*` and `course-worker*` run MinIO alongside the process through the `minio` script, which points at `D:\Programs\minio\start-minio.ps1`. Edit that path in `package.json` if MinIO is elsewhere. If MinIO is already running, the extra start attempt fails to bind the port and exits harmlessly. To skip MinIO, use the `:only` scripts (`server:only`, `server:only:dev`, `worker:only`, `worker:only:dev`, `course-worker:only`, `course-worker:only:dev`).

| Script | Purpose |
|--------|---------|
| `npm test` / `test:watch` / `test:coverage` | Jest |
| `npm run lint` | ESLint over `src/` |

Local AI services (Ollama, TTS, ComfyUI) can be started on demand by the workers via the `*_AUTO_START` and `*_START_COMMAND` settings, and controlled through `/api/system/ai-services`. When more than one process uses the GPU, set `GPU_COORDINATOR=redis` (see [`src/core/README.md`](src/core/README.md)).

## API

Interactive docs: `http://localhost:3000/api-docs` (raw spec at `/api-docs.json`). Health: `GET /health` (liveness), `GET /ready` (MongoDB + Redis).

| Prefix | Description |
|--------|-------------|
| `/api/videos` | create/list/get/update/delete videos; `approve`, `regenerate-script`, `generate-audio`, `generate-render`, `rerender`, `restart`, `stop`, `bulk-delete`; scene editing (`PUT /:id/scenes`, per-scene audio regeneration, template remap); `activity-logs` |
| `/api/courses` | courses, curriculum generation/drafts/history, course videos, `download-all` |
| `/api/course-videos` | course video lifecycle (script generate/approve/regenerate, audio, render, retry, stop, bulk actions, download). Generation endpoints require the course worker to be running (`GET /worker-status`) |
| `/api/jobs` | cross-type job list, detail, events, cancel, retry, bulk actions |
| `/api/audio` | standalone TTS: `generate`, `generate-dialogue`, history |
| `/api/voices` | available voices and favorites |
| `/api/assets` | asset library (list, delete) |
| `/api/analytics` | `overview`, `videos` |
| `/api/logs` | `recent` application logs |
| `/api/system/ai-services` | list and start/stop/restart local AI services |

### Auth

There is none. `src/middleware/auth.js` is a pass-through, so every route is open. Run the API only on localhost, a trusted LAN, or a private network such as Tailscale; real authentication would have to be built from scratch before exposing it more widely.

## Configuration

Configuration is read from `.env` and validated with Zod at startup ([`src/config/validate.js`](src/config/validate.js)); a bad value stops the process with a readable error. Start from [`.env.example`](.env.example). Commonly used variables:

```
PORT=3000
HOST=127.0.0.1
CORS_ORIGIN=http://localhost:5173

MONGODB_URI=mongodb://localhost:27017/vireon-ai
REDIS_HOST=localhost
REDIS_PORT=6379

MINIO_ENDPOINT=127.0.0.1
MINIO_PORT=9000
MINIO_ROOT_USER=
MINIO_ROOT_PASSWORD=
MINIO_PUBLIC_URL=http://127.0.0.1:9000

OLLAMA_URL=http://localhost:11434
OLLAMA_MODEL=gemma4:e4b-it-qat
OLLAMA_NUM_CTX=16384
TTS_API_URL=http://localhost:7860

VIDEO_WORKER_CONCURRENCY=1       # keep at 1 on a 6 GB GPU
```

Other knobs live in [`src/config/index.js`](src/config/index.js): Remotion codec/CRF/timeout (`REMOTION_*`), TTS and LLM timeouts/retries, rate limiting (`RATE_LIMIT_*`), GPU concurrency (`GPU_MAX_CONCURRENT_AI_SERVICES`, `GPU_LEASE_TTL_MS`), `IR_MODE`, `SMART_CACHE_ENABLED`.
