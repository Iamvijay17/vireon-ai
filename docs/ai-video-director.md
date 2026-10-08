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

## Phase 3 — Versioned scene graph

**The scene stays the working copy; versions are the history.** A scene
(`VideoJob.script.scenes[]`, id `sce-xxxxxxxx`) is what the Studio edits and the pipeline
fills in. `SceneVersion` (`models/SceneVersion.js`) holds immutable v1, v2, v3… of it.
`scene.activeVersion` says which one the working copy is. Nothing about existing jobs
changes: a scene with no versions gets its v1 the first time it settles.

**When a version is recorded.** `SceneVersionService.settle(jobId)` runs at the end of the
upload step (after the job is COMPLETED, best-effort — it never fails a finished render).
For each scene it fingerprints the parts and compares against the *active* version (not the
newest, so a reverted scene does not spawn a spurious version). Only a scene whose
fingerprint moved gets a new version, so unrelated scenes record nothing. Versions are
settle-points, not stage snapshots: you do not get a version per pipeline stage.

**Immutability is enforced**, not promised: the model's hooks refuse every update/replace
and any `save()` of an existing document. Changing something creates v(n+1) with
`parentVersion`. Version ids are `${jobId}:${sceneId}:v${n}` so a retried settle collides on
the key instead of duplicating.

**Reproducibility.** Each version stores the whole scene snapshot plus `provenance`: the
narration prompt, LLM model, TTS model + config, image model/prompt/params, template,
layout, motion, transition and asset references. Per-part `fingerprints` are what make
"what changed" a comparison (`services/scene/sceneFingerprint.js`). Outputs are deliberately
excluded from the fingerprints, with two exceptions that keep a re-take visible: the audio
fingerprint includes the clip duration, the image fingerprint includes the resolved URL.
Values the pipeline writes back into `elements` (word timings, the image URL) are stripped
from the layout fingerprint — otherwise every audio change would look like a layout change.

**Narration archive.** The renderer reads `scene{N}.mp3` and regenerating overwrites it, so
each distinct recording is server-side-copied to `{job}/audio/versions/scene{N}.{fp12}.mp3`
when its version is recorded. Images are already content-addressed (`img-{cacheKey}`), so
they need nothing. Revert copies the archived recording back; if it is gone, the current
recording is kept and the response says so.

**Dependency graph** (`services/scene/dependencyGraph.js`):

```
script ─▶ audio ─▶ captions ─┐
script ──────────────────────┤
image ───────────────────────┼─▶ scene-composition ─▶ render
layout / motion / transition ┘
```

`getRegenerationPlan(sceneId, changeType)` returns
`{ changed, regenerate, reusable, produce, stages }`. `produce` is the subset that needs a
model run (audio, captions, image); `stages` maps the plan onto the Phase 2 worker stages.
Change types: `script`, `voice`, `image`, `layout`, `motion`, `transition`, `style`
("more cinematic"), `scene`. Image changed → rebuild composition + render, reuse
script/audio/captions. Script changed → audio → captions → composition → render, not the
image. `restorePlan` is the revert case: only composition + render, nothing produced.

**API.** `GET /api/videos/:id/scenes/:n/versions`;
`GET /api/videos/:id/scenes/:n/regeneration-plan[?changeType=]` (without `changeType` it
diffs the working copy against the active version).

## Phase 4 + 5 — The AI Director, with strictly validated output

**Where the work is split.** The LLM *proposes*; deterministic code *decides*. That is what
makes the Director testable without a model and keeps a re-plan from reshuffling a video.

```
Topic ─▶ StoryStructureService   beats + style guide                 (LLM, Zod-validated)
      ─▶ ScenePlanningService    narration, chunked                  (LLM, unchanged)
      ─▶ StoryboardPlanningService  per scene: purpose, strategy,
                                 layout, picture, camera, transition (LLM, Zod-validated + repaired)
      ─▶ DirectorPlanner         settles the WHOLE video:
            layouts (neighbour-aware) → density guard → camera → transitions
            → picture prompts → DirectorPlan                         (pure, deterministic)
```

**What the Director decides** (`services/director/`):
- *Purpose* of every scene — hook, introduction, explanation, example, comparison, data,
  quote, summary, conclusion, cta, transition. The model's choice if valid; otherwise
  recovered from the scene's beat and position.
- *Visual strategy* — title, text, list, timeline, quote, statistics, comparison,
  split-visual, visual-explanation, full-screen-visual, podcast — mapped to one of the
  existing 12 engine layouts (`vocabulary.js`). No new templates.
- *Layout, camera and transition* from the existing registries only.
- *Image prompt*, written per scene from its subject, purpose, the shared palette, the
  audience (derived from the video type — a job has no audience field) and its neighbours'
  titles (`AssetPlanner.js`). Deterministic and idempotent, so the prompt-keyed image cache
  still recognises a picture it has made. Near-identical prompts get a different shot.
- *Duration estimate* from the narration at the script budget's 130 wpm. Stored as
  `storyboard.estimatedDuration`; the real duration is still the audio's.

**Variety** (`DiversityPlanner.js`). Left to its own heuristic the engine picks a layout per
scene with no knowledge of its neighbours. The Director now plans all scenes together:
a candidate must fit the content (a port of the engine's `isLayoutCompatible`, pinned by a
parity table) and, for layouts that mean something (timeline, comparison, stat), must be
earned by the content. It is scored on the Director's own preference, strategy fit, and
penalties for repeating the previous layout, repeating within the last four, and landing in
the same family. A breather is favoured after a stretch of dense text. Result: four picture
scenes alternate `split-image` / `image-fullbleed`; a run of list scenes rotates
`stack-list` / `grid` / `paragraph-stack`. Camera: still for dense text, never the same move
twice, never more than two moving scenes in a row, pans turn the other way. Transitions:
soft fade inside a beat, a firmer one at a beat boundary, never the same firm one twice,
the strongest rationed.

**Density.** A layout shows only so many points before text gets small
(`LAYOUT_ITEM_CAP`). Layouts that would overflow are penalised, and what still overflows has
its on-screen points merged (shortest neighbours first, order kept). Narration is never
touched. Visually empty and over-complicated scenes are flagged in `plan.diversity.warnings`.

**Validation** (`schemas.js`, `llmValidation.js`). Zod schemas for the story plan, scene plan,
visual plan, motion plan, asset plan and the assembled `DirectorPlan`. Response schemas are
strict about *values* (an unknown layout is an error, not a silent blank) and forgiving about
*shape and spelling* (`"Zoom In"`, `"iris wipe"`, `"splitImage"` resolve to the canonical id;
a missing optional field takes its default). The loop is:

1. validate each item on its own;
2. send the invalid ones back **once** (`DIRECTOR_MAX_REPAIRS`, default 1, `0` disables) with
   the exact problems, asking only for those corrected;
3. validate the answers again;
4. anything still invalid is dropped and that scene takes the deterministic default.

Malformed output never reaches Remotion: the planner only emits ids from the registries, and
`tests/director/invalidLlmOutput.test.js` drives the whole Director with a misbehaving model
and checks the script still validates and compiles clean.

**Behaviour changes worth knowing.** Scenes now carry an *explicit* planned layout
(`title-only` for a title card) where the engine used to decide, and image prompts gain the
framing/audience cues above. `directorFlow.test.js` was updated for those two intentional
changes; its other assertions are unchanged.

**Stored on the script's `brief`:** `directorPlan` (validated), `directorVersion`, `llmModel`.
Per scene: `storyboard.{purpose, strategy, layout, density, estimatedDuration}`.
