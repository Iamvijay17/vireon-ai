# Generation-time audit, baseline and tooling

Date: 2026-10-20. Everything below was measured on this PC (Ryzen 5 5600G 12 threads, RTX 2060 6 GB,
16 GB RAM, Windows 11) or read from the repo. Where something was not measured it says so.

## 1. What already existed (so it was not rebuilt)

| Brief item | Where it lives | Gap found |
|---|---|---|
| GPU admission, VRAM checks, breaker, cancel, retries | `services/gpu/*`, `services/localAI/*Manager.js` (the provider adapters) | VRAM figures are config estimates; admission could stall on orphaned VRAM (section 5) |
| Stage tracking, timeouts, structured errors, resume | `services/pipeline/*`, `VideoJob.stages` | no memory data per stage |
| Dependency graph | `core/graph/*` | parked on purpose, see `src/core/README.md` |
| Smart Cache with provenance | `services/cache/*` | none changed |
| Output validation before COMPLETED | `services/qc/video/qualityGate.js` | none |
| Runtime readiness, queue, live memory | GPU & Resources page, `/api/system/resources`, `/api/system/ai-services` | none, reused as is |

So no new "runtime layer" was added: it would have duplicated these. Stage dependencies are already explicit
(`pipeline/stages.js` `DOWNSTREAM` / `STAGE_RESUME`) and every step skips work already stored.

## 2. Measured baseline

Same topic ("How a bill becomes a law"), 2 minutes requested, 1080p, 4 scenes, images on, full pipeline through the quality gate.
The LLM writes a different script each run, so audio length differs (97 s vs 84 s); one run of each is not a benchmark.
Differences under about 5% are noise.

| Run | Code | Result | Total | Script | Audio | Images | Render |
|---|---|---|---|---|---|---|---|
| 1 | production worker, cold (services stopped) | completed | 12.8 min | 157 s | 394 s (4.05x real time) | 78 s | 129 s |
| 3 | this branch, sampler on, warm | completed, quality gate passed | 12.6 min | 198 s | 376 s (4.45x) | 63 s | ~113 s |
| 5 | this branch, started with ~5 GB of VRAM stuck in the TTS server (the orphan case) | completed, quality gate passed | 17.5 min | 186 s | 625 s (5.48x) | 70 s | ~162 s |
| 2 | this branch | **failed** at render (see section 6) | n/a | | | | |
| 4 | this branch | **invalid, cancelled** (another process interfered, section 6) | n/a | 57 s | | | |

Run 1 to run 3 is 12.8 to 12.6 min: no measurable change, and none is claimed. Run 5 (the orphan case) is the slowest at 17.5 min, but it also had a longer script (114 s of audio), so it is only suggestive: its audio ran at 5.48x real time against 4.05x and 4.45x, and its script stage included the full 120 s memory wait. Audio is about half of active time in both.
Run 1's script and audio overlapped my own test runs; treat it as indicative.

Measured peaks, run 3 (machine-wide, so they include everything else open: browser, editor, this tool):

| Stage | VRAM at stage start | VRAM peak | RAM peak (of 15.9 GB) | CPU avg / peak |
|---|---|---|---|---|
| script | 3972 MiB | 5834 MiB | 16.1 GB | 13% / 34% |
| audio | 5834 MiB | 5900 MiB (of 6144) | 14.5 GB | 24% / 49% |
| images | 5846 MiB | 5846 MiB | 14.2 GB | 22% / 37% |
| render | 4059 MiB | 4084 MiB | 15.3 GB | up to 100% peak |

Reading: the card is within about 250 MiB of full during the three GPU stages, so there is no room to overlap a second GPU model.
RAM is close to exhausted by the whole machine, which is why the low-memory profile exists.

Remotion `--concurrency` sweep (3-scene 1080p, idle machine, one sample each): 2 = 43.2 s (+1.4 GB RAM), 4 = 38.5 s (+1.8 GB),
6 = 38.1 s (+2.1 GB), 12 = 37.5 s (+2.9 GB). Beyond 4 the gain is within noise. Pre-bundling Remotion saves about 1.4 s a render (about 1%), so it was dropped.

## 3. Findings

1. **Orphaned VRAM stalls the next job for up to 2 minutes.** In run 3, 123 s of the 198 s script stage was the scheduler waiting for VRAM
   "held by another application" (1983 MiB free, 4000 needed), left behind after I force-killed a worker. The real LLM work was 32 s load plus
   about 41 s inference. In run 4 (no orphan) the same stage took 57 s. That wait is 16% of run 3's total. In run 5 the holder was the Qwen3-TTS
   server: its process held 5,040 MB while its model list was empty. The scheduler's new reclaim step fired within 0.3 s and asked TTS to
   unload, but the TTS app's own `unload_all_models` returned early ("No models are currently loaded") without releasing anything, so memory stayed
   held and the stage waited the full 120 s. Two changes address it: the scheduler reclaim (this repo) and a fix to the TTS app's unload
   (`local-ai/qwen3-tts/app.py`, outside this repo: `gc.collect()` plus `empty_cache()` on every unload, also when the model list is empty).
   **Measured after the fix:** loading the 1.7B model took the TTS process from 0 to 4,349 MB; `/unload_all_models` took it to 119 MB (card 5020 to 780 MiB);
   a second unload with nothing loaded is a safe no-op that reports releasing cached memory. **Not proven:** the old code also freed memory in the
   normal flow (5,040 MB to 351 MB after a normal audio stage), so this test does not separate old from new, and the stuck-memory state itself was not
   reproduced after the fix.
2. **Audio (TTS) is about half of active time**, GPU-bound, alignment already overlaps the next scene. No change made; component profiling of TTS chunk size and the faster-whisper model was not done.
3. **No safe overlap remains inside one job.** The remaining idea is overlapping the next video's GPU stages with this one's render.
   `scripts/benchOverlap.js` measures it; **it has not been run**, so the worker concurrency is unchanged.
4. A second stack's boot-time recovery sweep re-queues another stack's in-flight job (the database is shared). See section 6.

## 4. What was added

- **Per-stage resource sampling** (`services/pipeline/resourceSampler.js`): machine-wide VRAM (nvidia-smi), RAM, CPU every 3 s while a stage runs, saved to `VideoJob.stages.<key>.resources`. `null` means not measured, never 0. Cost: one nvidia-smi call is about 51 ms, under 2% of a core. Skipped for stages that reused stored output; a retried job keeps measurements only for the stages it re-ran.
- **Benchmark tooling**: `scripts/benchPipeline.js` (run one real video, store a `PerfBenchmark` record with hardware, model and workflow versions, settings, per-stage time and memory, cache change, quality-gate verdict; `--list`, `--compare a b`), `scripts/benchOverlap.js`, `scripts/perfAudit.js` (now prints per-stage memory), shared `scripts/lib/benchComposition.js`.
- **Analysis** (`services/perf/*`): slowest-stage explanation quoting only measured facts, before/after comparison that refuses to call runs comparable when the amount of work differs by more than a third.
- **Profiles** (`config/perfProfiles.js`, `PERF_PROFILE`): `balanced` (default, changes nothing), `low-memory` (render uses 2 tabs, about 13% slower, 0.7 GB less RAM), `throughput` (4 tabs, within noise of the default, 0.3 GB less RAM, no speed-up of its own), `preview` (advertises draft quality and the 0.6B voice for drafts only). Every set knob carries its evidence; knobs with no measurement are listed as unmeasured, not given values. A profile never changes output quality. `REMOTION_CONCURRENCY` overrides it. The recommendation (low-memory when under 3 GB RAM is free) is advice only and the threshold is a judgement.
- **API**: `GET /api/system/perf-profile`, `GET /api/analytics/benchmarks`, `GET /api/analytics/benchmarks/compare?before=&after=`; the control-center response gains per-stage `resources` and a `bottleneck`.
- **UI** (Analytics page): peak VRAM / RAM / CPU columns and a slowest-stage note in the timing table, plus a Performance panel (active profile with evidence, benchmark history, before/after). Component tests pass; **not yet looked at in a browser**.
- **GPU scheduler fix**: before waiting out foreign VRAM, ask idle services to drop their models once (only with `GPU_COORDINATOR=redis`, i.e. when the line proved nobody else is using the card).
- **TTS app fix** (`local-ai/qwen3-tts/app.py`, outside the repo, backup copy kept): unload now always collects garbage and empties the CUDA cache, also when no model is listed, and unloads the Whisper helper. Live since the VireonTTS service was restarted on 2026-10-20 22:00.
- **`VIDEO_QUEUE_PREFIX`** (unset by default): gives a dev API + worker a private queue so benchmarks do not race the production worker.

## 5. Setup, configuration, rollback

| Setting | Default | Effect | Rollback |
|---|---|---|---|
| `PIPELINE_RESOURCE_SAMPLING` | on | per-stage memory sampling | `=false` |
| `PIPELINE_RESOURCE_SAMPLE_MS` | 3000 (min 1000) | sample interval | unset |
| `PERF_PROFILE` | balanced | see section 4 | unset |
| `REMOTION_CONCURRENCY` | unset | Chrome tabs per render | unset |
| `VIDEO_QUEUE_PREFIX` | unset | private queue for dev benchmarks; API and worker must agree | unset |

New database field is additive (`stages.<key>.resources`, collection `perfbenchmarks`); nothing is migrated and nothing is deleted. The scheduler fix has no switch: revert `GpuScheduler.js` `_waitForMemory` and `GPUResourceManager.reclaimUnownedModels` to undo it.

Run a benchmark: start the API and video worker, then `node scripts/benchPipeline.js --label baseline`. It creates a normal job in the database the API uses.
Do it on a quiet machine: nothing else generating, no other worker running.

## 6. Troubleshooting (all hit while measuring)

- **Render fails with `ECONNREFUSED 192.168.1.2:9000`**: the dev `backend/.env` has `MINIO_PUBLIC_URL=http://192.168.1.2:9000` but this PC's LAN address is now `192.168.1.3`, and Remotion downloads assets from that URL. Update it (or use `http://127.0.0.1:9000`). I did not edit your `.env`; the benchmark runs overrode it from outside the repo.
- **A benchmark job ran on the production worker**: the production workers (scheduled tasks, `vireon-prod` clone) share the Redis queue. Use `VIDEO_QUEUE_PREFIX` on both the dev API and worker. Production only gets this code after you push and deploy.
- **A job is marked "interrupted by a server restart" while still running**: any process that starts and runs the recovery sweep (including `npm run dev`) treats in-flight jobs in the shared database as orphaned and re-queues them, and the duplicate-task guard then fails the second attempt (`GPU_DUPLICATE`). Do not start a second stack while a job is running.
- **Port 3000 busy**: a benchmark API from this work is still running; stop the `node ... src/server.js` process.

## 7. Not done / not verified

- The scheduler reclaim has unit tests (including a mutation check) and was seen firing on a real job, but it did not free memory there; the TTS app fix is what should. The original stuck-memory state was **not reproduced after the fix**, so end-to-end it is unconfirmed.
- `benchOverlap.js` not run, so no conclusion on overlapping jobs and no concurrency change.
- No clean second baseline of the production code, so there is no before/after speed comparison and the 20% target is neither met nor shown to be reachable. The only measured avoidable cost is finding 1 (16% in that scenario, none in a normal run).
- ComfyUI version and workflows not inspected; ComfyUI, TTS chunk size and faster-whisper not profiled independently; the draft-preview time saving not measured; no cache-key changes.
- UI not viewed in a browser.
