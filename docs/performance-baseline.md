# Generation-time audit and baseline (Phase 1)

Date: 2026-10-20. Audit of the real repo plus read-only queries of the real job history.
Nothing here is estimated unless it says so. Machine: Ryzen 5 5600G (12 threads), 16 GB RAM
(about 4.7 GB free with the browser open), RTX 2060 6 GB (about 0.76 GB held by the desktop when idle).

## 1. What already exists (so it is not rebuilt)

The brief asks for a "Local Inference Runtime", dependency-aware orchestration and observability.
Most of the substance is already in the repo:

| Brief item | Where it already lives | Gap |
|---|---|---|
| Single GPU admission, VRAM thresholds, breaker, retries, cancel | `services/gpu/*` (`GpuScheduler`, `vram.js`, `CircuitBreaker`), `services/localAI/*Manager.js` are the provider adapters | VRAM figures are config estimates (5000 MB each), never measured per service |
| Model load/unload/warm reuse | `gpuResourceManager.js` (warm reuse, idle eviction, Redis lease) | no load-time vs inference-time split |
| Stage tracking, timeouts, structured errors, resume | `services/pipeline/*`, `VideoJob.stages`, `resumeLogic.js`, `startup/recovery.js` | **0 jobs have run since it shipped**, so no per-stage data exists yet |
| Dependency graph | `core/graph/DagRunner.js`, `videoStepGraph.js` | parked on purpose, see `src/core/README.md` (TTS and ComfyUI serialize on the one GPU slot) |
| Smart Cache with provenance | `services/cache/*` (`cacheKeys`, `CacheLedger`, `GenerationCoordinator`) | only 6 ledger entries so far, no hit-rate evidence |
| Output validation before COMPLETED | `services/qc/video/qualityGate.js` | none |
| Perf analytics | `scripts/perfAudit.js`, `/api/analytics/control-center`, `benchRemotionConcurrency.js` | no VRAM / RAM / CPU during a stage |

Recommendation: do **not** add a new runtime layer on top of these. Extend them.

## 2. Pipeline as it runs today

`runVideoJob` (`workers/videoWorker/processor.js`) runs six stages strictly in sequence, each wrapped in `runStage`:

`script` (Ollama, GPU) -> `audio` (Qwen3-TTS, GPU, caption alignment on CPU) -> `images` (ComfyUI, GPU) -> `assets` (CPU) -> `render` (Remotion, CPU) -> quality gate -> `upload` (MinIO).

`VIDEO_WORKER_CONCURRENCY=1`. The course-video worker is a separate process sharing the GPU through the Redis lease.

## 3. Baseline: 13 completed jobs (scripts/perfAudit.js, read-only)

| Stage | Holds | Mean | Median | Max | Share of active time |
|---|---|---|---|---|---|
| SCRIPT_GENERATION | GPU (Ollama) | 61.8 s | 57.9 s | 1.8 m | 5.9% |
| GENERATING_AUDIO | GPU (TTS) + CPU alignment | 8.3 m | 7.3 m | 30.0 m | **47.9%** |
| GENERATING_IMAGES | GPU (ComfyUI) | 3.7 m | 1.9 m | 18.9 m | **21.3%** |
| PREPARING_ASSETS | CPU / disk | 13 s | 7 s | 82 s | 1.2% |
| RENDERING | CPU (Remotion) | 4.1 m | 2.1 m | 12.0 m | **23.4%** |
| UPLOADING | network / disk | 2.8 s | 0.7 s | 25 s | 0.3% |

Active total about 17.4 m mean. Queue wait: median 0.2 s (mean 32 s, one 6.4 m outlier). Jobs are 3 to 6 scenes, all 1080p.

Caveats: the spread is wide (max values are 4 to 9x the median), the history mixes code versions, and only one
job in the current log has TTS timing (3 scenes, 63 s of audio in 238 s, about 3.8x real time; one job is an anecdote, not a benchmark).
Of the 18 recorded retries, none are in the 8 most recent completed jobs, so retries are not a current bottleneck.

## 4. Findings (verified), most valuable first

1. **No per-stage resource data exists.** The scheduler admits on 5000 MB estimates and nothing records real VRAM, RAM or CPU during a stage. Every profile or concurrency decision in the brief needs this first. *Addressed in section 6.*
2. **Audio is about half the active time and is GPU-bound.** Alignment is already pipelined with the next scene's synthesis (`sceneSynthesis.js`), so the remaining lever is the TTS itself (chunk size, warm model, cache hits), not scheduling.
3. **Within one job there is no safe overlap left.** TTS and ComfyUI both need the GPU (the 6 GB card fits one), render needs all audio and images, and alignment already overlaps. A per-scene DAG would not shorten wall time (this is why the graph was parked).
4. **The remaining overlap is across jobs**: job N+1's GPU stages while job N renders on the CPU. Untested. The risk is that TTS and Remotion compete for the same 12 threads, so it must be measured before changing `VIDEO_WORKER_CONCURRENCY`.
5. **Remotion bundling is not worth optimising.** Measured: pre-bundling saves about 1.4 s per render (6.0 s to 4.6 s on a 3 s clip, warm webpack cache; first-ever bundle about 4 s). Against a 2.1 m median render that is about 1%. Not pursued.
6. **Image generation (21%, mean 3.7 m) is unexamined.** ComfyUI version, workflows and cache hit rate were not inspected yet.

## 5. Baseline measurement plan (needs your go-ahead)

Running real jobs writes to your live Atlas DB and holds the GPU for tens of minutes, so I have not done it.

Proposed: one fixed 4-scene 1080p script with images on, run 3 times, first run cold and the next two warm, via the normal API.
Per run the pipeline now records, per stage: duration, peak VRAM, VRAM baseline, peak RAM, CPU peak and average.
`node scripts/perfAudit.js` prints them. Later changes are compared against the same script. Report medians, not best runs.

## 6. What changed in this step

Per-stage resource sampling, behaviour-neutral:

- `services/pipeline/resourceSampler.js` samples machine-wide VRAM (nvidia-smi), RAM and CPU every 3 s while a stage runs.
  Unavailable readings are `null`, never 0. It never throws into the stage, never overlaps its own reads, and its timer is unref'd.
- `stageRunner` starts/stops it per stage; `stageTracker` persists it to `VideoJob.stages.<key>.resources` on completion, failure and cancellation. A reused stage records nothing; a new attempt clears the old record.
- `config.pipeline.resourceSampling`: `PIPELINE_RESOURCE_SAMPLING=false` disables it, `PIPELINE_RESOURCE_SAMPLE_MS` sets the interval (minimum 1000). Always off under Jest.
- `scripts/perfAudit.js` prints a per-stage resource table (`n/a` where not measured).

Rollback: set `PIPELINE_RESOURCE_SAMPLING=false`. The new field is additive and optional; no migration; old jobs are unaffected.

Cost, measured: one `nvidia-smi` query is about 51 ms wall; at 3 s that is under 2% of one core. In a 12 s real-machine run the sampler recorded VRAM 761 MiB baseline (matches `nvidia-smi`), RAM and CPU readings.

Not verified: a real job end to end through the worker with sampling on (no job was run), and the Socket.IO `stageUpdate` payload now carries `resources` (small, but the frontend ignores unknown fields; not exercised in a browser).

## 7. Next steps, in order

1. Run the section 5 baseline (needs approval).
2. Read the VRAM/RAM data. If peak VRAM during TTS or ComfyUI is well under 6 GB, only then revisit the 5000 MB estimates and the cross-job overlap in finding 4.
3. Inspect ComfyUI (version, `workflows/`, cache hits) and the TTS settings against that baseline.
4. Surface the resources in the Analytics control center (Phase 5), once real data exists to show.
