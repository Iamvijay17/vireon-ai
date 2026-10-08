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

## Phase 6 — Composable motion engine

**No new templates.** The 50 templates stay; the generative engine's pieces become
independently selectable slots, each from an existing registry:

```
Scene
├── layout       where things go             12 layouts          scene.layout  (storyboard.layout)
├── background   environment behind          8  backgrounds      scene.composition.background
├── decoration   vector accents              7  decorations      scene.composition.decoration
├── textMotion   how text enters             10 entrances        scene.composition.textMotion
├── imageMotion  how a picture drifts        4  (new)            scene.composition.imageMotion
├── camera       slow whole-scene move       5  moves            scene.cameraMotion
└── transition   how the scene ends          9  transitions      scene.transition
```

The brief's example names map onto existing ids: `gradientMesh` → `meshGradient`,
`floatingParticles` → `particles`/`floatingShapes`, `subtlePushIn` → camera `zoom-in`,
`slowZoom` → imageMotion `slowZoom`. The registries (`LAYOUT/BACKGROUND/DECORATION/
TEXT_MOTION/IMAGE_MOTION/CAMERA/TRANSITION_REGISTRY`) live in
`backend/src/ir/compositionRegistry.js` (backend) and `remotion/src/engine/` (renderer),
and the id lists are pinned by tests on both sides.

**What is new.** Only `imageMotion` (`engine/imageMotion.js`: `slowZoom`, `slowPan`,
`driftUp`, `none`) and `composition.js`, which resolves the overrides. GSAP and Remotion are
untouched.

**Backwards compatible.** `scene.composition` is optional; an unset slot keeps the engine's
deterministic pick, so every existing scene renders exactly as before. Unknown ids are
dropped (`sanitizeComposition`) at every boundary — script validation, the IR compile, the
legacy props builder — so a stored composition can never name something Remotion would have
to guess at. The numbered legacy templates have their own fixed look and ignore it.
Verified with real stills: a scene with an invalid composition renders byte-identical to one
with none; a valid one renders aurora + orbit and a zoomed picture.

**Avoiding conflicts and excess motion.**
- Picture drift and camera move would compound, so the Director picks `imageMotion: none`
  when the camera is moving, and the engine halves a drift if both ever coincide.
- Every image move keeps `scale >= 1` (no empty edges) and is a pure function of progress —
  preview, final render and thumbnail agree on every frame.
- `textMotion` replaces only the *type* of each text slot's entrance; the choreographer's
  delay, duration and reading-order stagger are kept. Speech-driven timing still applies on
  top of it.
- A Director-chosen background/decoration replaces the id but keeps the engine's intensity,
  which already scales down as content covers more of the canvas.

**The Director fills the slots** (`CompositionPlanner.js`): backgrounds and decorations from
the engine's own mood pools for the layout, rotated so neighbours differ; text motion by the
scene's purpose (loud entrances only for hooks and calls to action; dense text gets only the
quiet ones and the plainest decoration); a picture drifts only when the camera is still.
Podcasts keep their fixed look.

**Render props.** `composition` rides in `assets.json` per scene (omitted when empty), through
both the legacy builder and the IR, which `shadowEquivalence.test.js` keeps identical.

## Phase 7 — Scene-level regeneration

Change or redo ONE part of ONE scene and rebuild only what depends on it. Nothing else is
regenerated, and every result is a new immutable version.

| Action | Endpoint body | What it does | Rebuilds | Reuses |
| --- | --- | --- | --- | --- |
| Regenerate image | `{target:"image", prompt?}` | redraws the picture (existing image regeneration; handles a podcast's shared cover) | composition, render | script, voice, captions |
| Regenerate voice | `{target:"voice", voice?}` | clears this scene's narration; the worker records it again | captions, composition, render | script, image |
| Change script | `{target:"script", text}` | new narration, then voice | voice, captions, composition, render | image |
| Change layout | `{target:"layout", layout}` | sets the layout (must fit the content) | composition, render | everything generated |
| Apply a look | `{target:"style", preset}` | cinematic / minimal / dynamic: camera, transition, composable slots | composition, render | everything generated |
| Regenerate scene | `{target:"scene"}` | a fresh voice and picture; script and layout kept | voice, image, … | script, layout |
| Revert | `POST …/revert {version}` | restores the scene from a version (neither version is modified) | composition, render | everything |

`POST /api/videos/:id/scenes/:n/regenerate` answers with the plan from the dependency graph
(`{changed, regenerate, reusable, produce, stages}`); `GET …/options` says what the Studio may
offer right now (and why not), which layouts can show the scene's content, and the looks.

**How it stays correct and cheap** (`services/scene/SceneRegenerationService.js`):
- The scene's current state is recorded as a version *before* it is changed, so the change can
  always be undone — including for videos finished before versions existed (this is their v1).
  Revert records the state it leaves, too, so you can go back and forth.
- Only the target scene's fields change. The worker's audio and image steps skip any scene whose
  output is already stored, so unrelated scenes cost nothing; `audioStep.test.js` pins that
  clearing one scene's narration re-records exactly that scene.
- The job is rewound to the first stage the plan needs, never further, and the Phase 2 stage
  state from there on is invalidated, so everything before it is reused. Voice resumes at
  `AUDIO_COMPLETED` (the audio step still runs — it is gated on what is stored) so a manual-mode
  job does not stop and wait for a "Generate Render" click it never needed.
- The previous video stays in place until the new render replaces it; a failed regeneration does
  not lose it. (The older image-only endpoint blanked the URL; the new path does not.)
- Same text and voice would be served from the TTS cache, so "regenerate voice" with an unchanged
  voice sets `scene.audio.fresh` and the audio step bypasses the cache for it. A *different*
  voice is a different recording on its own and may be served from the cache. Honest limit: TTS
  seeds are content-derived, so a fresh synthesis is not guaranteed to differ from the last.
- A layout is only accepted if the engine can show the scene's content in it — otherwise 400 with
  the list that fits — so a click can never silently drop on-screen text. `image-fullbleed` shows
  only the headline over the picture, so the Director never picks it on its own for a scene with
  a paragraph beside the picture (an explicit user/Director choice still can).
- Refused while the video is mid-pipeline or being processed (no clobbering a live worker).

**Studio.** A "Regenerate scene N" card in the inspector: Image / Voice / Scene buttons, Change
layout, Change the look, Revert to version. It is disabled while there are unsaved edits (the
actions work from what is saved) and says why. After an action the toast reports what is being
rebuilt and what is reused, then the page moves to the render view, which already follows the job.

## Phase 8 — Smart asset cache

The MinIO content-addressed cache, MongoDB and Redis are unchanged; nothing new is introduced.
What is added is a catalogue of keys, a ledger, stale-entry handling and single-flight generation.

**Keys** (`services/cache/cacheKeys.js`). One place says what each artifact is keyed on, and
resource ids (`job-…`, `sce-…`) are never inputs — the same prompt from two jobs is one image.

| Artifact | Keyed on |
| --- | --- |
| image | prompt, negative prompt, seed, sampling size, output size, steps, cfg, sampler, scheduler, checkpoint, **the workflow file's own bytes** |
| tts (legacy per scene) | text, voice (mode / speaker / clone file / description), delivery instruction, seed, model size |
| tts segment | raw: the above per segment; processed: raw + speed, pitch, post-processing settings |
| alignment | the audio it was measured from + aligner provider / model / version |
| composition | the scene's per-part fingerprints + aspect ratio, resolution, font pairing, caption animation |
| render | the whole render-props payload + quality (the same fingerprint `isRenderCurrent` records) |
| script | topic, type, language, length, LLM model, Director version |

The image key is **byte-identical** to the formula the bucket was built with — a test pins it, because
changing it would silently orphan every cached picture. The script key exists for provenance
(`brief.inputKey`), not for serving: sampling is creative on purpose, so a cached script would defeat
"regenerate".

**Ledger** (`CacheEntry`, `CacheLedger`). Per artifact: `hits`, `misses`, `shared`, `stale`, `generations`,
`generationMs`, `lastGenerationMs`, `sizeBytes`, `firstStoredAt`, `lastHitAt` (the "reusedAt"). Writes are
atomic upserts, fire-and-forget, and skipped when Mongo is not connected — a statistic never slows or fails
a generation. `stats()` derives hit rate, average generation time and time saved from these counters; an
artifact nobody generated through the ledger contributes hits but no "time saved" (unknown cost is not zero).
Renders are recorded too (a current render is a hit).

**Missing and stale objects.** A cache entry is a pair: bytes + a JSON sidecar read first. *No sidecar* is a
plain miss. *A sidecar but no bytes* is a **stale** entry: the sidecar is evicted so it stops being trusted,
the staleness is recorded, and the lookup reports a miss — the caller regenerates and the entry heals. A
backend error (not "no such key") is a miss that evicts nothing, so a flaky MinIO cannot destroy healthy entries.

**Single-flight** (`GenerationCoordinator`). Two simultaneous requests for the same artifact generate it once:

```
A: miss -> generate -> store          B (same key, meanwhile): wait for A -> read what A stored
```
In-process via a map of in-flight generations; across processes via a short per-key Redis lock
(`CACHE_COORDINATION=redis`, default; `memory` for in-process only). The follower does **not** receive the
leader's result object — it runs its own cache lookup after the leader finishes, which materialises the
artifact in the follower's own job. A failed leader never fails a follower (it takes the lead), and Redis
being down only loses the cross-process layer: the lock is an optimisation, never a gate.
Wired around image generation and the segmented TTS raw clip (the expensive GPU result).

**What it deliberately does not wrap.** The default per-scene TTS path pipelines alignment of scene N with
synthesis of scene N+1 and stores to the cache later, so a follower could not read the leader's result when
the coordinator expects it. It does not need to: that path runs under the exclusive GPU lease and looks up
the cache after taking it, so a second process waits for the card and finds the first's result. Likewise
images and segments. The coordinator covers what the lease does not — identical requests racing inside one
lease window or outside any lease (Image Studio double-submits, a bigger `GPU_MAX_CONCURRENT_AI_SERVICES`).

## Phase 9 — Control Center (analytics)

`GET /api/analytics/control-center?days=30` and a "Control center" section on the Analytics page.
Everything comes from data the system already persists; nothing is estimated.

| Section | Source | Notes |
| --- | --- | --- |
| Videos: total / successful / failed / cancelled / processing | `VideoJob.status` in the window | "waiting on you" (approval, next step) is separate from "processing" |
| Pipeline: per-stage avg / slowest / timed runs / reused | `VideoJob.stages` (Phase 2) | only completed, non-reused runs are timed — a reuse did no work, so it is not averaged in as a fast one |
| Pipeline: avg generation time, queue wait | `statusHistory` active time; `queue.wait` metric | |
| Cache: hits, misses, shared, stale, hit rate, time saved, per kind | `CacheEntry` ledger (Phase 8) | time saved = reuses × measured average generation time; unknown cost is not 0 |
| Failures: attempts, failures, failure rate, retries per stage | `JobEvent` stage stream | rate is over attempts that reached a result (cancelled is neither) |
| Failures: top errors | `JobEvent` failed stage events (code, stage, last message, retryable) | falls back to failed jobs by code for jobs that predate the stream |
| Workers: depth, active, completed, failed, workers online | BullMQ `getJobCounts` / `getWorkers` | a queue that cannot be read says "Unavailable", not an empty healthy queue |

**Honesty rules, enforced in code and tests.** A figure with nothing behind it is `null` and shows "—",
never 0; the UI distinguishes a measured `0%` from no data. Jobs from before stage tracking are *counted*
(`jobsWithoutStageData`) and *left out* of the stage averages, and the page says so ("Stage averages cover
5 jobs; 14 earlier jobs predate stage tracking and are not included"). On the real database at the time of
writing all 19 existing jobs predate it, so the stage table is empty until new jobs run — that is the
correct answer, not a bug.

**Indexes added** for the new reads: `JobEvent {type, at}` (the stage stream across jobs),
`VideoJob {createdAt}` (windowed counts); `CacheEntry` carries `{kind, status}` and `{lastHitAt}`.

**Verified against a real MongoDB.** `scripts/verifyControlCenter.js` runs every pipeline on inline
synthetic documents (`$documents`) — nothing read from or written to a collection, `autoIndex` off —
so the aggregation expressions are checked by Mongo itself, and a run against the live data confirmed the
overview's real figures. Unit tests pin each pipeline's windowing and the pure shapers.

## Phase 10 — Performance audit (measured, not guessed)

Two read-only tools, then the numbers they produced on this machine (RTX 2060 6 GB, 12 logical cores,
16 GB RAM) from the 19 real jobs in the database.

- `node backend/scripts/perfAudit.js [--watch 60]` — per-stage time share, queue wait, time parked on a
  person, retries and the time they cost, active time per scene, and a snapshot of CPU / RAM / VRAM / disk
  (`--watch` also samples peak CPU/RAM/VRAM every 2 s while a job runs). Reads `statusHistory`/`stages`;
  writes nothing.
- `node backend/scripts/benchRemotionConcurrency.js` — render wall time and RAM cost at several
  `--concurrency` values on a fixed self-contained composition (no GPU, no network, no DB).

**Where a finished video's time goes** (13 completed jobs, mean active time 17.4 min):

| Stage | Mean | Median | Max | Share | Holds |
| --- | --- | --- | --- | --- | --- |
| Voice (TTS) | 8.3 min | 7.3 min | 30 min | **47.9 %** | GPU + CPU alignment |
| Render | 4.1 min | 2.1 min | 12 min | 23.4 % | CPU |
| Images | 3.7 min | 1.9 min | 18.9 min | 21.3 % | GPU (ComfyUI) |
| Script | 62 s | 58 s | 1.8 min | 5.9 % | GPU (Ollama) |
| Assets | 13 s | 7 s | 82 s | 1.2 % | CPU / disk |
| Upload | 2.8 s | 0.7 s | 25 s | 0.3 % | network |

Queue wait: median 0.2 s, mean 32 s, max 6.4 min. Active time per scene: median 3.0 min. 6 of 19 jobs
were retried (18 retries): 11 in the voice stage (a TTS server that was not up — `ECONNREFUSED :9000`),
3 in render, **4 in the assets stage that failed instantly**. 6.6 % of all active time was spent in
attempts that failed. Logs are bounded by Winston rotation (245 MB on disk, cap ~350 MB) and the job
scratch directory is 9 MB, so cleanup is working.

**What the measurements say to do — and not do.**

1. *Keep `VIDEO_WORKER_CONCURRENCY=1`.* 77 % of active time (script, voice, images) holds the one GPU and is
   serialized by the lease regardless; the queue almost never builds (median wait 0.2 s). Nothing here
   proves a second concurrent job would help.
2. *Do not add a Remotion `--concurrency` flag.* Measured on this machine: 3 / 6 (default) / 9 / 12 →
   36.6 / 34.5 / 34.7 / 35.2 s — flat — while peak extra RAM rose 1.7 → 2.2 → 2.5 → 3.0 GB with only
   ~4.5 GB free. More Chrome tabs buy nothing and cost memory headroom.
3. *The four instant assets-stage retries were avoidable work.* They were validation-type failures that
   the old loop retried with growing backoff; Phase 2 now classifies them as permanent and fails them
   immediately. That is the one measurable waste this audit found, and it was fixed in Phase 2.
4. *Voice is the bottleneck (48 %), and nothing in the persisted data says why.* Legacy cache hit rate is
   14 %; the Phase 8 ledger and Phase 2 stage state have no data yet, so there is no honest basis for
   changing TTS now. Next step is measurement, not code: after some jobs run, read the Control Center's
   per-stage timings and cache table, and run `perfAudit.js --watch` during a voice stage to see whether it
   is GPU-bound or alignment-bound.

No optimisation was applied on speculation; the only changes in this phase are the two measurement tools.
