# Windows setup and recovery

Day-to-day operation and "something is stuck" recovery for the Windows PC that runs Vireon.
First-time install and deployment are in [DEPLOYMENT.md](../DEPLOYMENT.md); this page is what to
do when a job, a worker or the GPU misbehaves. Every command here exists in the repo; nothing
below was run against production while writing it unless it says so.

## What runs where

| Piece | How it runs | Name to look for |
|---|---|---|
| Redis, API, nginx | Docker Compose | `docker compose ps` (services `redis`, `backend`, `frontend`) |
| Video / course workers | native `node`, Task Scheduler, start at logon | `VireonVideoWorker`, `VireonCourseWorker` |
| Publishing workers (optional) | same | `VireonYouTubeWorker`, `VireonExportWorker`, `VireonSocialWorker` |
| MinIO (all media) | native, Task Scheduler | `VireonMinio` |
| TTS, ComfyUI | native, Task Scheduler | `VireonTTS`, `VireonComfyUI` |
| Ollama | native | `ollama` process |
| Watchdog (alerts, restarts stopped tasks) | Task Scheduler, every 2 minutes | `VireonWatchdog` |
| MongoDB | Atlas (cloud), shared by dev and prod | see `backend\.env` |

Scheduled tasks are registered by `deploy\install-workers.ps1`; re-run it if a task is missing or
console windows start flashing.

## Local development on the same PC

```powershell
npm install                       # repo root: covers frontend + Remotion
cd backend; npm install; cd ..
copy backend\.env.example backend\.env   # then fill in MONGODB_URI, MINIO_*, ...
npm run dev                       # API + video worker + course worker + frontend
```

UI `http://localhost:5173`, API `http://localhost:3000` (`/api-docs`).

> **Do not run `npm run dev` while the production workers are up.** Both use the same Docker Redis
> and would compete for jobs (see DEPLOYMENT.md, Troubleshooting). Stop the `Vireon*Worker` tasks first.
> Dev and prod also share one MongoDB on purpose, so a dev run can touch real jobs.

Needed before a render works: Redis, MinIO on `127.0.0.1:9000`, Ollama with the model pulled,
the TTS server (`TTS_API_URL`), and optionally ComfyUI. `ffmpeg` on `PATH` (or `FFMPEG_PATH`) lets the
post-render quality check run at full strength; without it the check reports `skipped` and never blocks.

## Health in one minute

```powershell
Invoke-RestMethod http://127.0.0.1:8080/health                       # API liveness
docker compose ps                                                      # redis, backend, frontend running?
Get-ScheduledTask Vireon* | Select TaskName, State                     # workers, MinIO, TTS, ComfyUI, watchdog
nvidia-smi                                                             # who holds VRAM
```

In the UI: **GPU & Resources** shows the scheduler (queue, breakers, VRAM budget, running GPU tasks) and
**Quality Control** shows the post-render reports. A figure the server cannot measure is shown as
"Unavailable" - never as zero.

## Recovery

### A job is stuck in a running state

1. Is a worker alive? `Get-ScheduledTask VireonVideoWorker` should be `Running`. If not:
   `Start-ScheduledTask VireonVideoWorker`.
2. Restart the PC or the worker: on boot the API sweeps jobs that were mid-stage when their process died.
   With `AUTO_RESUME_INTERRUPTED_JOBS` on (default) each is re-queued and **resumes at the stage that was
   running**, spending one retry from its `maxRetries`. A job that keeps killing its worker runs out of
   retries and is marked `FAILED`. With it set to `false` the job is parked as `FAILED` with the message
   "Job was interrupted by a server restart. Click Restart Job to resume."
3. Still stuck: **Stop** it in the UI (`POST /api/jobs/video/:id/cancel`), then **Restart**
   (`POST /api/videos/:id/restart`). Restart resumes at the step the job failed in (it picks the resume point from
   the job's error step, or from its current status if it was stuck mid-run) instead of starting over.

### The GPU is "busy" and nothing starts

The GPU scheduler queues tasks (see [gpu-scheduler.md](gpu-scheduler.md)). Before touching anything:

- **GPU & Resources → GPU tasks** shows what is running and queued. A long wait with a task *running* is
  normal on a 6 GB card: every service (LLM, TTS, ComfyUI) is treated as exclusive.
- A breaker showing **open** means that service failed repeatedly (Ollama/TTS/ComfyUI down). Fix the service;
  one probe task is let through after the cooldown, so no restart is needed.
- With `GPU_COORDINATOR=redis` the card is guarded by a Redis lease that expires on its own if its holder dies
  (30 s without renewal). To look at it:
  ```powershell
  docker compose exec redis redis-cli GET lease:gpu-slot
  docker compose exec redis redis-cli PTTL lease:gpu-slot
  ```
  Only delete it (`DEL lease:gpu-slot`) if the TTL is not counting down **and** no worker is running a GPU task.
- Another application holding VRAM (a game, a browser with hardware acceleration) delays admission up to
  `GPU_ADMISSION_TIMEOUT_MS` (2 minutes), after which the task runs anyway and is flagged as admitted under pressure.
- Windows lagging while a model runs: raise `GPU_VRAM_RESERVE_MB` (VRAM kept free for the desktop, default 512) and
  keep `VIDEO_WORKER_CONCURRENCY=1`. The per-service VRAM figures (`GPU_VRAM_MB_*`) are estimates, not
  measurements - adjust them if `nvidia-smi` shows otherwise.

### A job failed the quality check

The report is on the job page ("Quality report") and in **Quality Control**. Severity decides what happens
(see [quality-checker.md](quality-checker.md)):

- **File fault** (missing/undecodable/truncated/black): the render is deleted and the job retries from the render stage.
- **Content fault** (silent narration, dead image URL, bad caption timing): the job fails at once - a second render
  would reproduce it. Fix the scene in the Studio and regenerate that scene.
- Warnings never block.

To stop blocking while you investigate a suspected false positive, set `QC_VIDEO_MODE=report` in `backend\.env`
and restart the workers (`off` skips the check). Put it back to `enforce` afterwards.

### Cache looks wrong

**Analytics (Control Center) → Cache** shows hits, misses, and *why* lookups missed (new/changed inputs, stored
file missing, lookup failed, copy failed; for renders, inputs changed vs no previous render). Cache keys are content
hashes of the generation inputs, so changing a prompt, model or setting produces a new key - the old entry is not
"invalidated", it is simply not matched. A missing-file entry evicts itself and is regenerated on the next request.
Cache objects live in the `vireon-cache` MinIO bucket (`MINIO_CACHE_BUCKET`); deleting a job never touches them.
`SMART_CACHE_ENABLED=false` turns the cache off (always regenerate); `CACHE_RETENTION_DAYS` expires old entries.

### Redis, MinIO or Docker down

| Symptom | Fix |
|---|---|
| `/media/...` returns 502 | `Start-ScheduledTask VireonMinio` (takes ~10 s) |
| New jobs never start, UI says a worker is not running | Workers and API are on different Redis servers. `Get-NetTCPConnection -LocalPort 6379 -State Listen` must show only Docker; `Get-Process redis-server` must return nothing. Stop any stray `redis-server`, then restart both worker tasks. |
| Backend unhealthy | `docker compose logs backend` - usually the Atlas IP allow-list, `MONGODB_URI` or Redis |
| After a reboot nothing runs | Docker Desktop and the scheduled tasks start at **logon**; enable auto-login on an unattended PC |

Job events are written with retries and never block the pipeline: if Mongo stays unreachable, the event is dropped and
logged at error level (`[Job Event] persistence failed`, with jobId and eventId). The timeline can therefore have gaps after
an Atlas outage; the job's own status remains authoritative, so reload the job page.

### Rollback and backups

`deploy\deploy.ps1` keeps the previous image pair as a rollback target; `deploy\backup.ps1` takes the nightly Mongo
backup. See DEPLOYMENT.md sections 7, 8 and 8c.

## Settings quick reference

| What | Where |
|---|---|
| GPU scheduler (`GPU_*`, `AUTO_RESUME_INTERRUPTED_JOBS`) | [gpu-scheduler.md](gpu-scheduler.md) |
| Quality gate (`QC_*`) | [quality-checker.md](quality-checker.md) |
| Smart cache (`SMART_CACHE_ENABLED`, `CACHE_*`, `MINIO_CACHE_BUCKET`) | `backend\.env.example` |
| Stage timeouts (`STAGE_TIMEOUT_<STAGE>_MS`) | [ai-video-director.md](ai-video-director.md) |
| Alerts (ntfy, healthchecks.io) | DEPLOYMENT.md section 8b |

Environment changes need the API container (`docker compose up -d backend`) and the worker tasks
(`Stop-ScheduledTask` / `Start-ScheduledTask`) restarted - workers read `backend\.env` at start only.
