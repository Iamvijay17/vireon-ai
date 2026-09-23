# `src/core/` — status

Two things live here. They are at very different maturity levels, and this
file records which is which so neither gets read as more (or less) live than
it is.

## `leases/` — **live**

`RedisLease` is wired into `services/localAI/gpuResourceManager.js` and
active whenever `GPU_COORDINATOR=redis`.

It fixes a real defect: `GPUResourceManager`'s slot accounting lives in one
process's memory, so the video worker (concurrency up to 3) and the course
video worker (a separate process) could each believe the GPU was free and
load a model onto the same 6GB card. With the lease, a process must hold
`lease:gpu-slot` before loading anything.

Warm reuse is preserved rather than sacrificed: the holder keeps services
loaded after `release()` as usual, and only unloads when another process
publishes on `lease-wanted:gpu-slot` (`RedisLease.signalDemand`). A process
doing real work ignores the signal and hands off when it finishes — see
`GPUResourceManager._handleDemand` and `_hasActiveWork`.

Covered by `tests/services/gpuResourceManager.test.js`, which models two
processes contending over one shared fake Redis.

**Enable it whenever more than one process touches the GPU.** It is off by
default only because the default deployment runs one worker.

## `graph/` — **parked, deliberately**

`DagRunner` + `videoStepGraph` compile a job into a dependency graph so
independent scene work runs concurrently instead of in a for-loop. The code
is complete and correct — `tests/core/DagRunner.test.js` and
`tests/core/videoStepGraph.test.js` pin its failure semantics (skip
transitive dependents, keep sibling branches alive, short-circuit cache
hits) and its topology.

It is **not** wired into the live pipeline, and should not be yet. The
reason is specific:

> The graph's entire value is running N scenes' audio concurrently. But
> TTS runs under `gpu.withGPU('tts', ...)` with `GPU_MAX_CONCURRENT_AI_SERVICES=1`,
> so those N nodes would serialize on the GPU lease anyway. Worse,
> `audioStep.js` deliberately holds the GPU **once across the whole batch**;
> a per-scene graph node would acquire and release per scene, thrashing
> start/stop against LM Studio and ComfyUI for no throughput gain.

So switching today trades a real regression for a theoretical win.

### What would make it worth wiring

Any one of these removes the precondition above:

1. **Scene work that is not GPU-bound dominates.** Cache-hit-heavy jobs
   (`SMART_CACHE_ENABLED=true`, repeated narration) skip TTS entirely, so
   those nodes really are parallel. Measure first with
   `scripts/graphShadowRun.js`, which classifies every node as a predicted
   cache hit or miss using the same hash the real TTS call checks.
2. **Image generation gets a standalone service call.** `sceneImage` is the
   one handler in `videoStepGraph.realHandlers` that still throws; image and
   audio nodes for different scenes are genuinely independent work.
3. **The worker splits by capability** (the Phase 4 move `leases/` was built
   for). Once TTS and render run in different processes, the graph's
   cross-branch concurrency stops being fictional — and `leases/` is what
   makes that safe.

### If you wire it

`audioStep.js`'s batch-wide `withGPU('tts', ...)` is the constraint to
respect: wrap the whole scene-audio *level* in one GPU acquisition rather
than letting each node take its own.

## `models/Project.js`, `models/Render.js`

Same status as `graph/`: Phase 5 scaffolding with no production caller, read
only by `scripts/projectRenderMigrationPreview.js`. They are the intended
unification of `VideoJob` and `CourseVideo`, which today duplicate their
pipelines end to end. That migration has not started.

The retry policy those two pipelines shared has since been extracted to
`services/common/retryPolicy.js`, which is the de-duplication that was worth
doing without a schema migration behind it.
