# Vireon as an AI Video Director

How the v2 pipeline plans, builds, versions and recovers a video. One section per
phase of the work; each says what exists, where it lives, and the decisions that
are not obvious from the code. Read the relevant section before changing that area.

## What was already here (audit, 2026-10-08)

The repository already contained most of the plumbing this work builds on, so none
of it was rewritten:

| Area | Already present | Where |
| --- | --- | --- |
| Director | Story structure → scene narration → storyboard (layout, image, camera, transition) → voice → motion | `backend/src/services/director/` |
| Scene IR | Zod `SceneGraph` compiled from the stored script, validated at script and render time | `backend/src/ir/` |
| Composition registries | 12 scene layouts, 9 backgrounds, 8 decorations, 9 text motions, 9 transitions, 4 camera moves | `backend/remotion/src/engine/`, `transitions/`, `camera.js` |
| Resume / retry | Status-gated steps that skip stored work, exponential backoff, retry budget, cancellation bus, restart sweep | `workers/videoWorker/`, `retryPolicy.js`, `startup/recovery.js` |
| Event log | Durable per-job `JobEvent` stream + Socket.IO replay | `JobEventService`, `socketService/` |
| Cache | Content-addressed MinIO cache for TTS segments and images | `CacheService`, `audio/pipeline/cacheKeys.js` |
| DAG runner | Parked on purpose (GPU serialises the work) | `core/graph/`, `core/README.md` |

## Phase 2 — Pipeline reliability

**Persisted stage state.** `VideoJob.stages.{script,audio,images,assets,render,upload}`
each hold `{ status, startedAt, completedAt, durationMs, attempt, reused, error }`
(`services/pipeline/stages.js`, written by `stageTracker.js`). It outlives the BullMQ
job, so a retry, a restarted worker or a reclaimed stalled job reads what finished from
the database. Jobs created before this have no `stages`; every reader tolerates that.

**`runStage`** (`services/pipeline/stageRunner.js`) wraps each worker step. It records
start/finish/failure, enforces a per-stage time budget, and attaches a structured error
to whatever the step throws. Steps stay idempotent on stored data (they already skipped
finished work); they only set `ctx.reused = true` at their skip point so a reuse is
reported honestly rather than as a fast run.

**Stage-specific retry.** A failed stage stores `error.stage`; `getResumeStep` resumes
exactly there (`STAGE_RESUME`). The steps before it are skipped by their existing
"is this already stored" checks, so a TTS failure never regenerates the script and a
render failure never redoes audio or images.

**Structured errors** — `{ code, stage, message, retryable, attempt, timestamp }`
(`pipelineErrors.js`). `message` is user-facing and stack-stripped; the raw text is kept
server-side in `error.detail`. Codes: `SCRIPT_FAILED`, `TTS_FAILED`, `IMAGE_FAILED`,
`ASSETS_FAILED`, `RENDER_FAILED`, `UPLOAD_FAILED`, `STAGE_TIMEOUT`, `JOB_STALLED`,
`NETWORK_ERROR`, `VALIDATION_FAILED`, `CONFIG_INVALID`, `DISK_FULL`.

**Retryable vs permanent.** Validation errors, a failed SceneGraph compile, pre-render
validation, missing config and a full disk are permanent: the same attempt would fail the
same way, so the job goes straight to FAILED instead of burning the retry budget.
Everything else is retried with the existing exponential backoff. The default is
*retryable* — the old behaviour — so a new failure mode is never silently made fatal.

**Stage timeouts.** `config.pipeline.stageTimeoutMs` (env `STAGE_TIMEOUT_<STAGE>_MS`,
`0` disables). They are safety nets for a hung call, set far above a healthy stage on the
6 GB card — not tuning knobs. On expiry the stage's `AbortSignal` fires (so TTS, ComfyUI
and Remotion calls stop) and it fails as a retryable `STAGE_TIMEOUT`.

**Stalled / restarted workers.** BullMQ still reclaims stalled jobs; resume then picks up
at the stored stage. Two gaps are closed: `workers/videoWorker/failureHandler.js` marks a
job FAILED (retryable `JOB_STALLED`) when BullMQ gives up on it outside the pipeline, and
the boot sweep (`startup/recovery.js`) closes the stage that was mid-run.

**Events.** Every stage transition emits `stageUpdate` (recorded in the job timeline,
replayed on reconnect). The Job detail timeline renders it.

Not touched: the course-video worker keeps its own pipeline; it can adopt the same
`stageRunner`/`pipelineErrors` later (they take no VideoJob-specific input beyond the
tracker).
