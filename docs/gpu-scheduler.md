# GPU scheduler

Every `gpu.withGPU(service, fn, opts)` call is a queued **task** instead of a race for the card.
Code: `backend/src/services/gpu/`. Tests: `backend/tests/gpu/`.

`GPUResourceManager` still owns the model lifecycle (load, warm reuse, eviction, the Redis lease).
The scheduler only decides **when** a task may ask it for the card.

```
withGPU → queue → [cross-process line → wait for free lease → memory check → breaker] → acquire → fn → release
```

## What it does

| Concern | Behaviour |
|---|---|
| **Order** | Priority + age (`score = enqueuedAt − priority × GPU_PRIORITY_WEIGHT_MS`). Interactive work (Image Studio, voice preview, regenerate-scene) jumps batch work, but a task that has waited long enough still runs, so nothing starves. |
| **Model affinity** | A task for the model already loaded may jump the line by up to `GPU_AFFINITY_WINDOW_MS` of queue age, to avoid Ollama ↔ TTS ↔ ComfyUI swaps. `0` = strict order. |
| **Admission** | A service runs one task at a time. The number of services resident at once is capped by `GPU_MAX_CONCURRENT_AI_SERVICES` **and** by VRAM (sum of per-service estimates ≤ card total − reserve). On a 6 GB card every service is exclusive; on a 24 GB card two can co-reside. `GPUResourceManager` uses the same rule to decide which idle model to evict. |
| **Busy GPU** | With `nvidia-smi`, a load waits while another application holds the VRAM it needs, then proceeds anyway after `GPU_ADMISSION_TIMEOUT_MS` (flagged `admittedUnderPressure`). A wrong estimate slows the pipeline; it never wedges it. |
| **Unavailable service** | Per-service circuit breaker: `GPU_BREAKER_THRESHOLD` consecutive failures open it; tasks then fail fast with a retry-after (`GPU_UNAVAILABLE`) instead of each paying a full startup timeout. One probe task is let through after the cooldown (doubling up to `GPU_BREAKER_MAX_COOLDOWN_MS`). Only service-down errors count — a bad prompt never trips it. |
| **Retries** | Job-level retry (backoff, resume at the failed stage) is unchanged. Inside a task, callers may opt in with `retries` for *idempotent* work (script generation does); the GPU is released while it backs off. |
| **Duplicates** | Key = `jobId:stage:service`. A second identical task, from this or another process, is rejected with a retryable `GPU_DUPLICATE`. |
| **Cancellation** | `signal` (Stop, stage timeout) drops a task still waiting in line and aborts the waits inside admission. |
| **Across processes** | With `GPU_COORDINATOR=redis`, tasks from the API, video worker and course worker first line up in a Redis ZSET with heartbeat tickets (a dead process drops out in `GPU_TICKET_TTL_MS`). The head contends for the lease only once it looks free **and** it is still next, so a higher-priority arrival can still overtake it. |
| **Recovery** | Each task is a `GpuTask` row (queue wait, attempts, pressure, error) with a 60 s heartbeat; boot/periodic sweep closes rows whose heartbeat went silent. Interrupted video jobs are re-queued automatically (see below). |

## Auto-resume of interrupted jobs

The boot sweep used to park every interrupted video job as `FAILED` until someone clicked Restart.
It now schedules a retry that resumes at the stage that was running, spending one retry from `maxRetries`
(so a job that keeps killing its worker runs out of budget and is failed). The transition is conditional,
so dev and prod booting at once cannot both schedule it. `AUTO_RESUME_INTERRUPTED_JOBS=false` restores the old behaviour.

## Settings

| Env | Default | |
|---|---|---|
| `GPU_SCHEDULER` | on | `false` = plain acquire → run → release, as before |
| `GPU_PRIORITY_WEIGHT_MS` | 120000 | head start per priority level |
| `GPU_AFFINITY_WINDOW_MS` | 120000 | warm-model jump limit |
| `GPU_TASK_RETRIES` / `GPU_TASK_RETRY_BASE_MS` | 2 / 3000 | for callers passing `retries: true` |
| `GPU_VRAM_ADMISSION` | on | `false` = slot counting only |
| `GPU_VRAM_TOTAL_MB` / `GPU_VRAM_RESERVE_MB` | 6144 / 512 | `nvidia-smi` total wins when available |
| `GPU_VRAM_MB_LLM` / `_TTS` / `_COMFYUI` | 5000 each | **estimates, not measurements — tune to your card** |
| `GPU_VRAM_LIVE_CHECK` / `GPU_VRAM_LIVE_FACTOR` | on / 0.8 | fraction of the estimate that must be free |
| `GPU_VRAM_POLL_MS` / `GPU_ADMISSION_TIMEOUT_MS` | 3000 / 120000 | |
| `GPU_BREAKER_THRESHOLD` / `_COOLDOWN_MS` / `_MAX_COOLDOWN_MS` | 3 / 30000 / 300000 | `0` disables |
| `GPU_TICKET_TTL_MS` / `GPU_LEASE_POLL_MS` | 15000 / 250 | redis coordinator only |
| `GPU_STALE_TASK_MS` | 300000 | ledger sweep |
| `AUTO_RESUME_INTERRUPTED_JOBS` | on | |

## Seeing it

`GET /api/system/ai-services` → `gpu.scheduler`: `queued`, `running`, `breakers`, last VRAM reading, and (redis mode) the global line.

## Known limits

- VRAM estimates are configuration. The defaults make each service exclusive on the 6 GB dev card; they were not measured per model.
- Breakers are per process, not shared through Redis.
- With `GPU_COORDINATOR=in-process`, a *second* process is invisible to the queue; the live VRAM check is the only thing that notices it.
- Task `retries` re-run the whole callback, so only pass it for idempotent work.
