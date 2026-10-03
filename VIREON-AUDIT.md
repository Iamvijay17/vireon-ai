# Vireon AI: Complete System Audit

Audit date: 2026-10-03. Branch: `v2`. Method: read-only. I read source, config and prompt files, and ran no code, installed nothing, and opened no `.env`. Versions are the ranges declared in `package.json`, not installed versions. Remotion is pinned exactly at 4.0.489. Anything I couldn't confirm from source is marked `UNKNOWN — NOT VERIFIED`.

**Not read in depth:** the 46 hand-coded Remotion template bodies, the frontend UI primitives, `JsonRepairService`, `RedisLease` internals, the Swagger annotations, and the Audio Studio panels. I read their headers or grepped them.

**Four findings that change planning:**
1. There is no image generation anywhere. `imagePrompt` is written but nothing consumes it.
2. A partial AI Director already exists, but only the video-job script path uses it.
3. The LLM's `cameraMotion` and `animation` fields are saved but never read by the renderer.
4. There is no background music, SFX, ducking or loudness normalization.

Legend: 🟢 implemented, 🟡 partial, 🔵 configured but unused, 🔴 missing, ⚪ dead/unused.

---

## 1. Technology stack

| Category | Technology | Version (declared) | Where used | Purpose | Status |
|---|---|---|---|---|---|
| Frontend | React | ^19.2.7 | `frontend/` | UI | 🟢 |
| Frontend | Vite | ^8.1.1 | `frontend/` | Build and dev server | 🟢 |
| Frontend | Tailwind | ^4.3.3 (`@tailwindcss/vite`) | `frontend/` | Styling | 🟢 |
| Frontend | react-router-dom | ^7.18.1 | `layout/index.jsx` | Routing, 17 lazy pages | 🟢 |
| Frontend | TanStack Query | ^5.103.2 | `lib/queryClient.js` | Server state | 🟢 |
| Frontend | socket.io-client | ^4.8.3 | `services/socket.js` | Realtime progress | 🟢 |
| Frontend | @remotion/player | 4.0.489 | `components/video/ScenePreview.jsx` | Live scene preview | 🟢 |
| Frontend | chart.js, react-chartjs-2 | ^4.5.1 / ^5.3.1 | analytics, dashboard | Charts | 🟢 |
| Frontend | lucide-react, clsx, axios | — | everywhere | Icons, class names, HTTP | 🟢 |
| Frontend | vitest, Testing Library | ^3.2.7 | 16 test files | Tests | 🟢 |
| Backend | Node and Express | Node 22 (Dockerfile), Express ^5.2.1 | `server.js` | API | 🟢 |
| Backend | MongoDB and Mongoose | ^8.9.5 | `models/` | Persistence. Atlas in prod per `DEPLOYMENT.md`. Server version UNKNOWN | 🟢 |
| Backend | BullMQ, ioredis | ^5.34.0 / ^5.5.0 | `queues/`, `workers/` | Jobs. Redis 7-alpine via docker-compose | 🟢 |
| Backend | Socket.IO | ^4.8.1 | `services/common/socketService/*` | Realtime, bridged across processes via Redis pub/sub | 🟢 |
| Backend | Zod | ^3.24.1 | `validators/`, `ir/`, `config/validate.js` | Validation | 🟢 |
| Backend | helmet, cors, express-rate-limit, morgan | ^8 / ^2.8 / ^7.5 / ^1.11 | `server.js` | Security and request logging | 🟢 |
| Backend | winston | ^3.17.0 | `LoggerService.js` | Logging, custom levels `tts`, `lmstudio`, `render`, `upload` | 🟢 |
| Backend | swagger-jsdoc, swagger-ui-express | — | `config/swagger.js`, `/api-docs` | OpenAPI | 🟢 |
| Backend | minio | ^8.0.7 | `MinioStorageProvider.js` | Object storage | 🟢 |
| Backend | @gradio/client | ^2.3.1 | TTS and avatar clients | Calls the Gradio apps | 🟢 |
| Backend | archiver, audio-decode | — | `courseController.js`, `getAudioDuration.mjs` | Course zip, audio duration | 🟢 |
| Backend | **multer, uuid** | ^1.4.5 / ^11 | nothing | Declared, never imported | ⚪ |
| Video | **Remotion** | 4.0.489 | `backend/remotion/` | Only renderer. CLI `render` and `still` via `RemotionService` | 🟢 |
| Video | Headless Chromium (via Remotion) | — | `RemotionService.js` | Remotion drives it itself. No direct Puppeteer/Playwright | 🟢 |
| Video | **GSAP** | ^3.13.0 | one file, `templates/003-title/index.jsx` | Single title template | 🟡 |
| Video | CSS / SVG / Canvas | — | engine backgrounds and decorations | Procedural backgrounds, decorations, waveform | 🟢 |
| Video | **FFmpeg** | external | TTS pydub dependency, `regenerateThumbnails.js` | Never called by the live pipeline. `ttsManager` only adds it to PATH | 🔵 |
| Video | WebGL, Three.js | none | — | Not present | 🔴 |
| Video | Remotion extras | `@remotion/google-fonts`, `tailwind-v4`, `zod` 4.3.6 | `backend/remotion` | Fonts, styling. Zod 4 use UNKNOWN | 🟡 |

**What each video engine does here:**
- **Remotion** is the whole render path. It composes scenes in `VideoComposition.jsx`, runs `remotion render` for the MP4 and `remotion still` for the thumbnail.
- **GSAP** drives one title template. All other animation is Remotion `interpolate` or `spring`.
- **FFmpeg** is not a pipeline stage. There is no post-processing, mux, loudnorm or concat step.

---

## 2. AI / ML engines

| Engine/Model | Version | Purpose | Input | Output | Local/API | GPU | Used by | Status |
|---|---|---|---|---|---|---|---|---|
| **Ollama + `gemma4:e4b-it-qat`** | model default in config | Script, curriculum, story plan | Prompt | JSON | Local, `/api/chat`, `format:json`, `num_ctx` 16384 | Yes (6GB) | `LLMService` | 🟢 default |
| **LM Studio** | `google/gemma-4-e4b` | Alternate LLM, OpenAI-compatible | same | same | Local | Yes | `LLMService`, `LLM_PROVIDER=lmstudio` | 🟡 alternate |
| **Qwen3-TTS** (Gradio) | 1.7B default, 0.6B "fast" | TTS: custom speaker (9 presets), voice clone (~70 reference files in `backend/voices/`), voice design | Text, voice, seed, instruct | MP3 | Local (`:7860`) | Yes | `ttsClient`, `sceneSynthesis` | 🟢 |
| **faster-whisper** | model `base`, CPU int8 | Forced alignment, per-word caption timestamps | MP3 | `[{word,start,end}]` | Local Python subprocess | No | `alignCaptions.py` | 🟢 |
| **MuseTalk** (Gradio) | UNKNOWN | Lip-synced avatar overlay | Bundled portrait + narration WAV | MP4 | Local (`:8890`) | Yes | `AvatarService` | 🟢 optional |
| **ComfyUI** | none installed | GPU slot only | — | — | — | — | `comfyUIManager` | 🔵 |
| Image gen, video gen, music gen, OCR, embeddings, vision | none | — | — | — | — | — | — | 🔴 |

- **ComfyUI:** `comfyUIManager.js` starts and stops a process, and nothing sends it a prompt. Its own header comment says so.
- **Lip sync:** MuseTalk is the only path, and it only drives a small circular overlay.
- **Model weights, tokenizer and TTS server version:** `UNKNOWN — NOT VERIFIED`. They live outside this repo, in `C:\Programs\Video Generation\local-ai\qwen3-tts` and Ollama.

---

## 3. Actual video pipeline

```
User → Wizard (frontend/pages/wizard)  [type, duration, language, voice(s), resolution, quality,
        │                               fontPairing, captionAnimation, avatar, fastGeneration, fastAudio]
        ▼
POST /api/videos            videoController.create → Zod createVideoSchema → VideoService.create → enqueueJob
        ▼
BullMQ 'video-rendering'    one job = whole pipeline in one processor (workers/videoWorker/processor.js)
        ▼
[1] scriptStep   scene count and word budget from duration (2 scenes/min; podcast ~1 turn/20 words)
                 gpu.withGPU('llm') → AIDirectorService.direct()
                   StoryStructureService.plan   (1 LLM call: beats, styleGuide, title, tags)
                   ScenePlanningService.generate (chunked LLM calls, ≤30 scenes/chunk)
                   VisualPlanningService / VoicePlanningService / MotionPlanningService (deterministic)
                 ScriptParserService.validate → picks templateId, builds `elements`
                 checkSceneGraph (IR compile, shadow mode)
                 → saves script, status AWAITING_APPROVAL, PAUSES for manual approval
        ▼  (user edits in Studio, POST /:id/approve re-enqueues)
[2] audioStep    gpu.withGPU('tts') held across the whole batch
                 Qwen3-TTS per scene → MP3 → duration via audio-decode
                 → faster-whisper alignment overlapped with the next scene's TTS
                 → upload to MinIO immediately; Smart Cache by content hash
        ▼  (manual mode fastGeneration=false pauses here)
[3] avatarStep   optional: concat narration WAV → MuseTalk → MP4 → MinIO
[4] prepareAssets  RemotionService.prepareAssets → assets.json (IR reconciled against legacy builder)
[5] render       validateAssets → `remotion render VideoComposition` (h264, CRF by quality, yuv420p)
                 → `remotion still` thumbnail (jpeg, half scale); fingerprint skips redundant re-render
[6] uploadStep   render dir → MinIO `vireon-video`; VideoService.complete; scratch dir wiped
        ▼
Preview/download   <video> from MinIO public URL (frontend re-homes to /media); Socket.IO progress
```

There is no image-generation step. Statuses `GENERATING_IMAGES` and `IMAGE_COMPLETED` exist, but nothing in the worker sets them. `updateSceneImage()` has zero callers. `RemotionService.validateAssets` still fails a job when `imagePrompt` is set and `imageUrl` is empty, so the only way past it is pasting a URL by hand in the Studio.

---

## 4. AI Director capabilities

An AI Director layer exists in `backend/src/services/director/`. It is script-time only.

| Capability | Status | Evidence |
|---|---|---|
| Video structure / story | 🟡 | `StoryStructureService` produces beats and tone notes. Beats only steer the prompts. |
| Script | 🟢 | `ScenePlanningService`: chunking, recap continuity, JSON repair |
| Scene count | 🟡 | Computed by formula from duration, not decided by AI |
| Scene types | 🟡 | LLM picks `title/content/image/contentwithimage/podcast` via the prompt. The educational prompt offers only title, content, image. |
| Scene duration | 🔴 | Always derived from TTS audio length |
| Visual style | 🟡 | `visualPalette` text is appended to image prompts that never render. The real look comes from a seeded `generateStyle(jobId)`, not AI. |
| Motion | 🔴 | LLM `cameraMotion` is saved and ignored by the renderer (see §6) |
| Transitions | 🟡 | LLM may emit `fade`/`slide`. The renderer honors it, otherwise a seeded random pick. |
| Layout / template choice | 🔴 | Deterministic: `chooseStrategy` routes by content shape with seeded tie-breaks |
| Assets / images | 🔴 | No generation or selection |
| Charts / diagrams | 🔴 | None. `stat-highlight` renders a single number. |
| Narration and emotion | 🟢 | `audio.emotion` written per line and fed to TTS `instruct` |
| Captions | 🟡 | Style and animation are user-chosen. Spoken captions default on for podcast only. |
| Background music / audio | 🔴 | None |
| Pacing | 🟡 | Word budget only |
| Audience / tone | 🟡 | `voiceTone` and `toneNote` per beat, prompt-level |
| Aspect ratio | 🔴 | User picks resolution. Aspect is derived. |
| Course path | 🔴 | `scriptPipeline.js` calls `LLMService.generateScript` directly and does not use `AIDirectorService` |

---

## 5. Scene system

All 12 scene names exist, as the generative engine's "Scene Components" in `backend/remotion/src/engine/scenes/`. They are layout builders (`build(profile, rng) → slots`), not React components. A single React component, `templates/generative/GeneratedScene.jsx`, renders all of them.

| Scene | File | Purpose | Inputs | Animation | Asset support | Status |
|---|---|---|---|---|---|---|
| titleOnly | `scenes/titleOnly.js` | Title card | title | per-slot seeded | none | 🟢 |
| stackList | `stackList.js` | Vertical items | items | stagger | none | 🟢 |
| grid | `grid.js` | Item grid | items (≥4) | stagger | none | 🟢 |
| timeline | `timeline.js` | Numbered sequence | items | stagger | none | 🟢 |
| paragraphStack | `paragraphStack.js` | ≤3 long paragraphs | items | stagger | none | 🟢 |
| splitImage | `splitImage.js` | Text plus image | body, image | mask or scale | image URL only | 🟡 image never auto-generated |
| imageFullbleed | `imageFullbleed.js` | Image with scrim and headline | image, caption, label | scale or fade | image URL only | 🟡 same |
| podcastSplit | `podcastSplit.js` | Host card, waveform | hostName, hostImage | stagger | image URL | 🟢 |
| podcastCentered | `podcastCentered.js` | Centered variant | same | stagger | image URL | 🟢 |
| quoteFeature | `quoteFeature.js` | Long body as a quote | body ≥60 chars | stagger | none | 🟢 |
| statHighlight | `statHighlight.js` | Big number plus label | one item matching a numeric regex | stagger | none | 🟢 (regex-triggered) |
| comparisonSplit | `comparisonSplit.js` | Two-column | exactly 2 items | stagger | none | 🟢 |

**Legacy hand-coded templates:** 46 files registered in `TemplateRegistry.js`: 10 title, 15 content, 9 contentwithimage, 10 image, 2 podcast. They are used only if `GENERATIVE_ENGINE_ENABLED=false` (and by old jobs). Otherwise every new script uses `templateId:"generative"`.

- **Registry:** `engine/scenes/index.js` (`SCENE_REGISTRY`), `templates/TemplateRegistry.js`, `templates/TemplateCategories.js`, and a mirrored backend registry in `ir/templateRegistry.js`. That is three copies to keep in sync.
- **Schema and validation:** Zod `ELEMENTS_SCHEMAS` per family in `ir/templateRegistry.js`, plus `ir/compile.js`. The IR runs in `shadow` mode (log only) by default. `IR_MODE=authoritative` would fail jobs at script time.
- **Fallback:** `VideoComposition.resolveTemplate` falls back to `DefaultTemplate` on an unknown id. An unknown strategy falls back to `stack-list`.
- **Limit:** the LLM never names a scene layout. Quote, stat, comparison and timeline are reachable only by content-shape heuristics.

---

## 6. Motion / animation

| Animation | Engine | File | Used by | Configurable | AI controlled |
|---|---|---|---|---|---|
| 10 entrance motions (fadeIn, fadeSlideUp, fadeSlideLeft, scaleIn, bounceIn, popIn, blurIn, rotateIn, maskWipe, typewriterReveal) | Remotion `interpolate`/`spring` | `engine/motion/*` | generative scenes | Some, via Studio `styleConfig` | No, seeded pick |
| Stagger and jitter | Seeded RNG | `engine/choreograph.js` | generative | No | No |
| 9 scene transitions (fade, dissolve, cut, none, slide, slideUp, wipe, irisWipe, zoom) | Remotion `Sequence` overlap | `transitions/*`, `VideoComposition.jsx` | all scenes | Yes, per scene in Studio | Partial |
| 9 caption animations | Remotion | `captions/captionAnimations.js` | captions | Yes (wizard) | No |
| 8 backgrounds, 8 decorations | Remotion / SVG / CSS | `engine/backgrounds/*`, `decorations/*` | generative | Via `visualStyle` | No |
| Legacy hook library | Remotion | `animations/*` | hand-coded templates | No | No |
| GSAP timeline | GSAP | `003-title` | one template | No | No |
| **Camera motion** (zoom, pan) | none | — | **nothing reads it** | UI dropdown exists | LLM emits it, `MotionPlanningService` cycles it, **renderer ignores it** (`cameraMotion` appears only in a test file) |
| Parallax, masks as camera, 3D | none | — | — | — | — |

Motion is a mix of **template-based**, **hardcoded** and **seeded-random**, plus limited **user-controlled** overrides in the Studio. It is not AI-selected or AI-generated.

---

## 7. Audio engine

**Pipeline:** script text → `resolveVoice` (custom, clone or design) → content-derived seed (text + voice) → `CacheService` lookup (SHA-256 of text, mode, speaker, clone file, description, instruct, seed, model size) → Qwen3-TTS via Gradio, 3 retries → MP3 → duration via `audio-decode` → faster-whisper alignment on CPU → MinIO upload → `captionTimestamps` stored on the scene.

| Capability | Status |
|---|---|
| TTS | 🟢 Qwen3-TTS |
| Voice selection | 🟢 9 presets, ~70 clone references, voice design, favorites, previews |
| Voice cloning | 🟢 reference file and auto-transcript, cached |
| Multiple voices | 🟢 podcast host/guest per turn |
| Narration emotion | 🟢 per-line `instruct` |
| Background music | 🔴 |
| Sound effects | 🔴 |
| Normalization / loudness | 🔴 |
| Volume control | 🔴 `<Audio src>` has no volume prop in the generative scene |
| Ducking | 🔴 |
| Silence detection | 🔴 (podcast turns get a padded gap) |
| Beat detection | 🔴 |
| Lip sync | 🟡 MuseTalk overlay only |
| Waveform | 🟡 decorative in podcast scenes. The frontend `AudioPlayer` has a real waveform. |
| Caching | 🟢 TTS audio and reference transcripts in `vireon-cache` |

**Audio Studio** is a separate feature: synchronous `POST /api/audio/generate` and `/generate-dialogue`, no queue. A boot sweep marks orphaned `PENDING` rows `FAILED`.

---

## 8. Caption system

| Feature | Status |
|---|---|
| Word-level timing | 🟢 faster-whisper forced alignment. Fallback is steady estimated pace. |
| Sentence-level | 🔴 |
| Karaoke highlight | 🟢 `highlightCurrent`, `glowActive` |
| Animated | 🟢 9 animations |
| Styles | 🟢 4 named presets: `minimalClean`, `boldKaraoke`, `popPunch`, `neonGlow` |
| Position, font | 🟡 top/center/bottom in `styleConfig`. Fonts follow the job's font pairing. |
| Burn-in | 🟢 rendered by Remotion into the MP4 |
| Export (SRT/VTT) | 🔴 none found by search |
| Multiple languages | 🟡 7 languages in UI and prompt. TTS `language:"Auto"`. Quality UNKNOWN. |

Captions default **on for podcast scenes only**. Other scene types show narration as on-screen text instead.

---

## 9. Image / visual asset engine

- **AI image generation:** 🔴 none. ComfyUI is a GPU slot that never receives a request.
- **Stock assets, icons:** 🔴. The `unsplash` hits are sample data only.
- **SVG / charts / diagrams:** 🔴 for content. Only decorative SVG shapes exist.
- **Backgrounds:** 🟢 8 procedural backgrounds plus gradient palettes.
- **Asset caching and reuse:** 🟡 the `Asset` model records uploads with `contentHash` and `cacheKey`, but only audio and avatar assets exist.

Actual flow: `LLM imagePrompt → (palette suffix) → saved on the scene → dead end`. The image only appears if the user pastes a URL into the Studio's "Image URL (manual override)". That field's placeholder says "skips AI image generation", which does not exist.

---

## 10. Storage

| Item | Detail |
|---|---|
| MongoDB | Atlas in prod. Local fallback `mongodb://localhost:27017/vireon-ai` in config. |
| MinIO buckets | `vireon-scenes` (audio, avatar, audio-studio), `vireon-video` (render, thumbnail), `vireon-cache` (TTS audio, metadata, reference transcripts). All get a **public-read** policy. |
| Paths | `{id}/audio/sceneN.mp3`, `{id}/avatar/avatar.mp4`, `{videoBucket}/{id}/video.mp4`, `tts/{hash}.mp3` |
| URLs | `MINIO_PUBLIC_URL` + `/bucket/key`, stored in Mongo. The frontend re-homes them to `/media`. |
| Local | `backend/jobs/{id}/` is scratch (script, assets.json, render). Wiped on completion by `StorageService.cleanupJob`. |
| Cleanup | `deleteJob` removes scenes and video prefixes. The cache bucket is untouched. |
| Expiration / lifecycle | 🔴 none found. The cache bucket grows without bound. |
| Dedup | `Asset.contentHash` is recorded. Reuse relies on the TTS cache key, not byte dedup. |

---

## 11. Job / queue system

| Queue | Worker | Job | Concurrency | Retry | Purpose |
|---|---|---|---|---|---|
| `video-rendering` | `videoWorker/index.js` | `render-video` (whole pipeline) | `VIDEO_WORKER_CONCURRENCY`, default `min(cpus−1, 3)`. `.env.example` pins 1. | App-level: `maxRetries` 3, backoff via `retryPolicy`, new delayed job. BullMQ `attempts: 1`. | Standalone videos |
| `course-video-processing` | `courseVideoWorker.js` | `generate-script`, `regenerate-script`, `generate-audio`, `render`, `retry` | 1 | App-level, same policy | Course lessons |

**Lifecycle:** `QUEUED → SCRIPT_GENERATION → AWAITING_APPROVAL → (user approves) → GENERATING_AUDIO → AUDIO_COMPLETED → [GENERATING_AVATAR] → PREPARING_ASSETS → RENDERING → UPLOADING → COMPLETED`, with `FAILED`, `CANCELLED` and `RETRY_SCHEDULED` off to the side.

- **Progress:** persisted on the job, emitted over Socket.IO, and stored as a `JobEvent` timeline with sequence numbers for replay.
- **Cancellation:** `cancellationBus` over Redis aborts in-flight TTS or Remotion via `AbortController`.
- **Recovery:** `lockDuration` 5 minutes, stalled detection, resumable steps. On API boot, `reapStuckVideoJobs`, `reapStuckCourseVideoJobs` and `reapOrphanedAudioGenerations` mark orphans `FAILED`.
- **Priorities:** 🔴 none.
- **Gap:** stages inside one job run serially in one worker. Render is not a separate queue.

---

## 12. GPU / resource management

A real implementation, slot-based, not VRAM-aware.

- `GPUResourceManager` registers 4 services (`llm`, `tts`, `comfyui`, `avatar`) with `GPU_MAX_CONCURRENT_AI_SERVICES=1`. State machine: stopped → starting → ready/busy → stopping. Services stay warm until the idle timeout, are evicted on contention, and waiters queue FIFO.
- **Cross-process:** `RedisLease` (TTL 30 s, renewed) is active only when `GPU_COORDINATOR=redis`. The default is `in-process`.
- **Not found:** VRAM measurement (no `nvidia-smi`), CPU fallback, per-model VRAM sizing. `UNKNOWN` whether the managers pass any GPU-pinning flags.
- **Remotion is not GPU-managed.** `RemotionStatus` is only a status flag.

**Overload points:**
1. With the default in-process coordinator, the video worker and course worker are separate processes that can each load a model onto the same 6GB card. The fix exists (`GPU_COORDINATOR=redis`) but is off by default. Production `.env` not verified.
2. With video worker concurrency above 1, two jobs run CPU-heavy Remotion renders at once.
3. MuseTalk and Qwen3-TTS contend for the single GPU slot, so avatar jobs serialize behind TTS.
4. Remotion render runs while another job's TTS may hold the GPU.
5. Audio Studio generates synchronously in the API process and bypasses the queue. `UNKNOWN` whether it goes through `gpu.withGPU`.

---

## 13. Caching

| Cache | Key | Invalidation | Status |
|---|---|---|---|
| TTS audio | SHA-256 of sorted inputs incl. content-derived seed | None. `skipCache` bypass only. | 🟢 |
| Reference transcript | Clone filename | None | 🟢 |
| Render skip | `.render-fingerprint`, SHA-256 of assets.json | Changes when assets change. Lives in scratch, wiped on completion. | 🟡 |
| `PromptService` template cache | File mtime | Automatic | 🟢 |
| LLM responses | — | — | 🔴 deliberately not cached |
| Images, scenes, assets | — | — | 🔴 |
| Redis as cache | — | — | 🔴 used for queues, pub/sub, log buffer, lease only |

Avatar clips are explicitly not cached, because they depend on the narration. The cache hit rate is real: `cache.hits` / `cache.misses` counters feed Analytics.

---

## 14. Video export

| Item | Status |
|---|---|
| MP4 / h264 / yuv420p | 🟢 only output. Codec, pixel format and CRF are env-configurable. |
| WebM, other codecs | 🔴 |
| Resolutions | 🟢 8 presets: 1920×1080, 1080×1920, 1080×1080, 1080×1350, 1280×720, 720×1280, 3840×2160, 2160×3840 |
| Aspect ratios | 🟢 16:9, 9:16, 1:1, 4:5, derived from resolution |
| FPS | 🔴 fixed 30 |
| Quality presets | 🟢 draft CRF 28, standard 18, hd 12 |
| Audio codec | Remotion default. No explicit setting. |
| Custom resolution | 🔴 enum only |
| FFmpeg post-processing | 🔴 none |
| Portrait support | 🟡 hand-coded templates branch by orientation. The generative scene scales the 1920×1080 layout by width and does not reflow. Output quality not verified. |

---

## 15. Frontend features

| Feature | Status | Notes |
|---|---|---|
| Dashboard | 🟢 | |
| Create video (wizard) | 🟢 | 763 lines, all job options |
| Render page (progress, queue) | 🟢 | |
| Studio editor (scene edit, template remap, preview) | 🟢 | Remotion Player preview. Image tab is prompt plus manual URL. |
| Voice / Audio Studio | 🟢 | Single and dialogue, history, favorites |
| Courses, curriculum, course videos, course studio | 🟢 | Draft autosave, bulk actions |
| Jobs (unified) | 🟢 | Bulk cancel, retry, delete |
| Projects, Completed videos | 🟢 | |
| Assets | 🟡 | Lists and deletes only |
| Analytics | 🟢 | Backed by real aggregations |
| Live Logs | 🟢 | Socket stream plus Redis buffer |
| Settings | 🟡 | Mostly client-side `localStorage` preferences plus service status |
| Captions UI | 🟡 | Animation chosen in wizard. No caption editor or export. |
| Background music UI | 🔴 | |
| AI image generation UI | 🔵 | Prompt field exists, no backend |
| `/v2/*` shell | 🟡 | CreateVideo, Jobs, JobDetail, Overview |
| `pages/placeholder` | ⚪ | Imported nowhere |
| Auth / login | 🔴 | none |

---

## 16. Course generation

```
Course (title, category, difficulty, language)
 → generate-curriculum        LLMService.generateCurriculum (one prompt: 12–20 lessons + promo trailer +
                              objectives, requirements, welcome/congrats messages) → CourseCurriculum (history, draft)
 → curriculum-videos          creates CourseVideo rows (lessons + isPromo trailer)
 → per lesson, 3 stages:      script → [approval] → audio → render
     courseVideoWorker (concurrency 1) → courseVideo/{scriptPipeline, audioPipeline, renderPipeline}
 → stored per stage (scriptStatus / audioStatus / videoStatus), MinIO, download single or zip (archiver)
```

- **Does not use the AI Director.** It uses its own inline prompt with a fixed scene mix (1 title, mostly content, ~1 in 8 contentwithimage), the same dead-end image path, and one LLM call with no chunking. A long lesson depends on one response.
- **Duplication:** `VideoJob` and `CourseVideo` duplicate the pipeline end to end. `Project` and `Render` are unused scaffolding for unifying them.
- **Extras:** `ActivityLog` per lesson, bulk generate and approve, `requireCourseWorker` guard, worker-status socket event.

---

## 17. Analytics

| Metric | Status |
|---|---|
| Total / success / failed videos, status and type breakdowns | 🟢 Mongo aggregates |
| Avg generation time (whole pipeline) | 🟢 |
| Per-stage durations (planning, TTS, avatar, scene build, render, upload) | 🟢 from `statusHistory` |
| TTS time, render time, queue wait | 🟢 `Metric` collection |
| Cache hit rate | 🟢 |
| Storage usage by category | 🟢 from `Asset` |
| Retry rate, worker queue counts | 🟢 |
| Daily trends | 🟢 |
| Template usage | 🟡 aspect ratio and resolution tracked, per-template is not (generative scenes hide it anyway) |
| Model usage / GPU usage | 🔴 |
| Error statistics | 🟡 recent failures list only |

No placeholder charts found. `Metric.recordDuration` swallows errors by design.

---

## 18. Security

| Area | Finding |
|---|---|
| **Authentication** | 🔴 **None.** `middleware/auth.js` is a pass-through, so every `authenticate` call does nothing. Production relies on Tailscale Serve. The API binds `0.0.0.0` by default (`.env.example` sets loopback) and logs a warning. |
| Helmet | 🟢, CSP disabled only for `/api-docs` |
| CORS | 🟡 allowlist, but defaults include hardcoded LAN IPs. Non-browser requests are always allowed. |
| Rate limit | 🟡 600/min on `/api` only, per IP. Needs `trust proxy` (set in prod). |
| Input validation | 🟡 Zod on video create/update and id params. Other bodies checked ad hoc. `PUT /videos/:id/scenes` accepts any array, so scene content (`imageUrl`, `elements`) is trusted. |
| Uploads | 🟢 no multipart endpoint (multer unused). nginx `client_max_body_size 100m`, 10 MB JSON limit. |
| Public storage | 🟡 all three buckets are public-read. Anyone who can reach MinIO can read all audio and video. |
| Path traversal | 🟢 ids are regex-validated before becoming file or storage paths. Not every route verified. |
| Command injection | 🟢 `execFile` / `spawn` with argv arrays, no shell. `startCommand` env values are operator-controlled. |
| Remotion props | 🟡 a user-supplied `imageUrl` is fetched by headless Chromium during render (SSRF-shaped), since scene URLs aren't allowlisted. |
| Secrets | 🟢 `.env` not committed. A `backup-before-remove-secret` branch exists, so a secret was once committed. History cleanup and rotation: UNKNOWN. |
| Dependencies | `UNKNOWN` — no audit run. |

---

## 19. Observability

| Item | Status |
|---|---|
| Winston, 4 rotating files (10 MB each) plus console | 🟢 |
| Request logging | 🟢 morgan to Winston |
| Structured job logs | 🟢 `JobEvent` timeline, `ActivityLog` for course videos |
| Live log stream | 🟢 Redis pub/sub to `serverLog` socket event, buffer in Redis |
| Metrics | 🟡 Mongo counters, no Prometheus or OpenTelemetry |
| Health | 🟢 `/health` (liveness), `/ready` (Mongo and Redis) |
| Debug endpoints | `/api/logs/recent` (unauthenticated), `/api-docs` |
| Tracing, alerting | 🔴. `deploy/watchdog.ps1` exists, not read. |

---

## 20. API inventory

All routes use `authenticate`, which is a no-op.

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/health`, `/ready`, `/api-docs`, `/api-docs.json` | Probes and docs |
| GET | `/voice-samples/*` | Voice reference files (static) |
| POST/GET | `/api/videos` | Create, list |
| GET/PUT/DELETE | `/api/videos/:id` | Read, edit, delete |
| POST | `/api/videos/bulk-delete` | Bulk delete |
| POST | `/api/videos/:id/{restart, regenerate-script, approve, generate-audio, generate-render, rerender, stop}` | Pipeline control |
| PUT | `/api/videos/:id/scenes` | Studio save |
| POST | `/api/videos/:id/scenes/:n/{regenerate-audio, remap-template}` | Scene ops |
| GET | `/api/videos/:id/activity-logs` | Activity |
| POST/GET | `/api/courses` | Create, list |
| GET/PUT/DELETE | `/api/courses/:id` | CRUD |
| POST | `/api/courses/:id/{stop, generate-curriculum, curriculum-videos}` | Course ops |
| GET/POST | `/api/courses/:id/videos` | Lessons |
| GET | `/api/courses/:id/{download-all, curriculum-history}` | Zip, history |
| PUT/DELETE | `/api/courses/:id/curriculum-draft` | Draft |
| GET | `/api/course-videos/worker-status` | Worker status |
| POST | `/api/course-videos/{bulk-generate, bulk-approve-script, bulk-delete}` | Bulk |
| GET/PUT/DELETE | `/api/course-videos/:id` | CRUD |
| POST | `/api/course-videos/:id/{generate-script, regenerate-script, approve-script, generate-audio, render, retry, stop}` | Stage control |
| PUT | `/api/course-videos/:id/script` | Edit script |
| POST | `/api/course-videos/:id/scenes/:n/regenerate-audio` | Scene audio |
| GET | `/api/course-videos/:id/{activity-logs, download}` | Logs, MP4 |
| GET | `/api/jobs`, `/api/jobs/:type/:id`, `/…/events` | Unified jobs |
| POST | `/api/jobs/bulk`, `/api/jobs/:type/:id/{cancel, retry}` | Unified actions |
| GET | `/api/voices`, `/api/voices/favorites` | Voice catalog |
| POST/DELETE | `/api/voices/favorites` | Favorites |
| POST | `/api/audio/{generate, generate-dialogue}` | Audio Studio (synchronous) |
| GET/DELETE | `/api/audio`, `/api/audio/:id` | History |
| GET/DELETE | `/api/assets`, `/api/assets/:id` | Asset list, remove |
| GET | `/api/analytics/{overview, videos}` | Metrics |
| GET | `/api/logs/recent` | Log buffer |
| GET | `/api/system/ai-services` | Service and GPU status |
| POST | `/api/system/ai-services/:service/{start, stop, restart}` | Process control |

**Socket.IO client → server:** `join`, `leave`, `joinCourse`, `leaveCourse`, `getStatus`.

**Socket.IO server → client:** `jobCreated`, `jobProgress`, `jobCompleted`, `jobFailed`, `sceneAudioReady`, `jobStatus`, `courseUpdated/Deleted`, `courseVideoCreated/Updated/Deleted/Progress/ScriptReady/AudioReady/SceneAudioReady/RenderReady`, `courseWorkerStatus`, `serverLog`, `audioStudioTurnReady/ChunkReady/Completed/Failed`.

---

## 21. Database inventory

| Model | Key fields | Relationships | Purpose | Used by |
|---|---|---|---|---|
| **VideoJob** | topic, type, language, voices, duration, resolution, quality, fontPairing, captionAnimation, fast flags, avatar, status, progress, `script{scenes[]}`, `statusHistory`, retry fields | none | Standalone video | video pipeline, analytics |
| **Course** | title, description, category, difficulty, language, status, counts, `curriculumDraft` | has many CourseVideo | Course | course APIs |
| **CourseCurriculum** | courseId, subtitle, objectives, requirements, audience, messages, `promo`, `lessons[]`, source | → Course | Curriculum history | curriculum service |
| **CourseVideo** | courseId, title, topic, isPromo, order, duration, voice, style, resolution, quality, per-stage statuses and errors, `script`, `renderUrl`, retry | → Course | Lesson | course pipeline |
| **AudioGeneration** | mode, text, voice, speakers, `turns[]`, `chunks[]`, status, audioUrl | none | Audio Studio history | `audioController` |
| **Asset** | ownerType, ownerId, category, bucket, key, url, size, mimeType, contentHash, cacheKey | by owner id | Storage ledger | AssetService, analytics |
| **JobEvent** | jobId, seq, type, data | by job id | Event timeline and replay | JobEventService |
| **ActivityLog** | videoId (ref CourseVideo), text, timestamp | → CourseVideo | Activity log | both pipelines |
| **Metric** | `_id`, count, sum | none | Counters | MetricsService |
| **FavoriteVoice** | voiceId | none | Favorites | voices |
| **Project / Render** | unified job and attempt schema | Render → Project | scaffolding, no production caller | `projectRenderMigrationPreview.js` only (🔵) |

Shared `sceneSchema`: `sceneId`, `sceneNumber`, `sceneType`, `speaker`, `title`, `subtitle`, `duration`, `backgroundColor`, `transition`, `imagePrompt`, `cameraMotion`, `animation`, `imageUrl`, `templateId`, `elements`, `scene_meta`, `audio{text, file, duration, voice, emotion, captionTimestamps}`.

---

## 22. Environment / infrastructure

| Area | Detail |
|---|---|
| Ports | API 3000, frontend 8080 (nginx, 127.0.0.1), Redis 6379 (127.0.0.1), MinIO 9000, TTS 7860, Ollama 11434, MuseTalk 8890, LM Studio 1234, ComfyUI 8188 |
| MongoDB | `MONGODB_URI`, required in prod compose |
| Redis | `REDIS_HOST`, `REDIS_PORT`, `REDIS_AUTOSTART` (`ensureRedis` can spawn a local Redis, which can split the queue if Docker isn't up. `.env.example` warns and sets false.) |
| MinIO | `MINIO_*` incl. three bucket names, `MINIO_PUBLIC_URL`, upload retries and timeout |
| LLM | `LLM_PROVIDER`, `OLLAMA_*` (URL, model, `NUM_CTX`, `THINK`, `KEEP_ALIVE`), `LM_STUDIO_*`, `LLM_TIMEOUT`, `LLM_MAX_RETRIES` |
| TTS | `TTS_API_URL`, `TTS_MODEL_SIZE`, `TTS_FAST_MODEL_SIZE`, `TTS_START_COMMAND`, `TTS_WORKDIR`, `TTS_FFMPEG_PATH`, timeouts |
| Remotion | `REMOTION_BINARY`, `TIMEOUT` (5 min), `MAX_RETRIES`, `CODEC`, `PIXEL_FORMAT`, `CRF_*` |
| Engine flags | `GENERATIVE_ENGINE_ENABLED`, `IR_MODE`, `SMART_CACHE_ENABLED` |
| GPU | `AI_SERVICE_MODE`, `GPU_MAX_CONCURRENT_AI_SERVICES`, `AI_SERVICE_IDLE_TIMEOUT`, `GPU_COORDINATOR`, `GPU_LEASE_TTL_MS` |
| Workers | `VIDEO_WORKER_CONCURRENCY` |
| Security | `CORS_ORIGIN`, `RATE_LIMIT_*`, `HOST` |
| Deployment | `docker-compose.yml` runs Redis, backend, frontend, plus optional Tailscale or Cloudflare quick-tunnel. Workers, MinIO, Ollama, TTS, MuseTalk and ComfyUI run native on Windows via scheduled tasks (`deploy/install-workers.ps1`, `watchdog.ps1`). CI is GitHub Actions: syntax check, jest, eslint, vitest, frontend build. |

Config is validated at boot by `config/validate.js`.

---

## 23. Duplication, dead code, unused systems

| Item | Kind |
|---|---|
| `core/graph/` (`DagRunner`, `videoStepGraph`) | Complete and tested but deliberately parked, not wired in |
| `models/Project.js`, `Render.js` | Scaffolding, no caller |
| ComfyUI manager, GPU slot, `/api/system/ai-services/comfyui` | Configured, nothing to run |
| `GENERATING_IMAGES` / `IMAGE_COMPLETED` and the "Scene Build" analytics bucket | Never set |
| `imagePrompt`, `thumbnailPrompt`, `visualPalette` | Written, never consumed |
| `cameraMotion`, `animation`, `MotionPlanningService` | Computed and saved, ignored by renderer |
| 46 legacy templates | Reachable only with `GENERATIVE_ENGINE_ENABLED=false`, plus old jobs |
| `multer`, `uuid` | Unused dependencies |
| `pages/placeholder` | Unused |
| `HelloWorld` composition, `sampleData`, 5+ "check" compositions in `Root.jsx` | Dev only |
| `lmStudio` provider | Kept as alternate |
| `v2` frontend | Parallel shell alongside v1 |
| **Duplicate pipelines** | `VideoJob` and `CourseVideo`, duplicated retry/audio/render logic. `retryPolicy` was extracted to share one piece. |
| **Duplicate template registries** | Three copies (Remotion registry, `TemplateCategories`, backend `ir/templateRegistry`) |
| **Duplicate script paths** | Video jobs use `AIDirectorService`. Course videos use inline prompts. |
| Two preview pipelines | Browser Player vs CLI render. The IR shadow diff exists to catch drift. |
| Scene-type wording | Educational prompt offers only title/content/image. The parser also supports contentwithimage. |
| Frontend transition list | Studio dropdown vs engine ids only spot-checked |

---

## 24. Current architecture

```
 Browser (React 19 / Vite / TanStack Query / Socket.IO client / @remotion/player preview)
        │  nginx :8080  ── /api, /media (MinIO re-home), /voice-samples
        ▼
 Express 5 API :3000  (helmet, CORS, rate-limit, Zod, Swagger, no auth)
   ├─ MongoDB Atlas (VideoJob, Course*, Asset, JobEvent, Metric, ...)
   ├─ Redis ── BullMQ queues: video-rendering | course-video-processing
   │         └─ pub/sub bridge → Socket.IO ;  cancellation bus ;  GPU RedisLease (optional)
   └─ MinIO :9000  [vireon-scenes | vireon-video | vireon-cache]   (public-read)
        ▲
 Native Windows workers (scheduled tasks)
   videoWorker ───────────────┐     courseVideoWorker (concurrency 1)
     script → AIDirector        │       script → inline LLM prompt (no Director)
       Story → ScenePlan →      │       audio  → TTS
       Visual/Voice/Motion      │       render → Remotion
     audio  → Qwen3-TTS         │
     avatar → MuseTalk          │
     assets → IR compile        │
     render → Remotion CLI ─────┘── headless Chromium → MP4 + JPEG still
     upload → MinIO
        │
 GPUResourceManager (1 slot): llm(Ollama) | tts(Qwen3-TTS) | comfyui(unused) | avatar(MuseTalk)
 faster-whisper (CPU, python subprocess)        FFmpeg: dependency only, no stage
```

---

## 25. Feature matrix

| Feature | Implemented | Partial | Backend | Frontend | Engine | Quality |
|---|---|---|---|---|---|---|
| Script generation (video) | ✔ | | ✔ | ✔ | Ollama/gemma4 | Chunked, JSON-repaired, Director-planned |
| Script generation (course) | ✔ | | ✔ | ✔ | Ollama | Single-shot, no Director |
| Curriculum | ✔ | | ✔ | ✔ | Ollama | Rich output (objectives, messages) |
| Manual script approval | ✔ | | ✔ | ✔ | — | Solid |
| Scene editing (Studio) | ✔ | | ✔ | ✔ | Remotion Player | Good |
| TTS (3 modes, ~79 voices) | ✔ | | ✔ | ✔ | Qwen3-TTS | Strong |
| Podcast (2 voices) | ✔ | | ✔ | ✔ | Qwen3-TTS | Solid |
| Word-synced captions | ✔ | | ✔ | ✔ | faster-whisper, Remotion | Strong |
| Avatar overlay | ✔ | | ✔ | ✔ | MuseTalk | Optional, limited (2 stock faces) |
| Procedural scene engine | ✔ | | — | ✔ | Remotion | Deterministic, varied |
| Image generation | | | ✘ | prompt-only UI | none | Missing |
| Background music / SFX | | | ✘ | ✘ | none | Missing |
| Camera motion | | UI and data only | ✘ | dropdown | none | Not rendered |
| Charts / diagrams | | | ✘ | ✘ | none | Missing |
| Export formats | | MP4 only | ✔ | ✔ | Remotion | Basic |
| Retry / recovery / cancel | ✔ | | ✔ | ✔ | BullMQ | Strong |
| GPU sequencing | ✔ | cross-process opt-in | ✔ | status UI | custom | Strong for one card |
| Analytics | ✔ | no GPU/model/template metrics | ✔ | ✔ | Mongo | Good |
| Auth / multi-user | | | ✘ | ✘ | — | Missing |
| Tests | | thin | 11 backend, 1 engine, 16 frontend | | Jest/Vitest | Core logic covered. Pipeline steps are not. |

---

## 26. Engine matrix

| Engine | Purpose | Current role | Alternative | Keep? | Reason |
|---|---|---|---|---|---|
| Remotion | Deterministic compositor and renderer | Sole renderer, 47 templates and a procedural engine | HyperFrames (tried and reverted) | Yes | It already is the product's backbone |
| Ollama + gemma4 | Script and plan | Default LLM | LM Studio (already wired) | Yes | Provider switch exists |
| Qwen3-TTS | Narration | Only TTS | Fish Speech S2 Pro (needs 12GB+ VRAM, blocked) | Yes | Works on the 6GB card |
| faster-whisper | Caption alignment | CPU, `base` | — | Yes | Cheap and accurate on synthetic speech |
| MuseTalk | Avatar | Optional overlay | — | Optional | Narrow use |
| ComfyUI | Image generation | Slot only, no workflow | — | Decide | The missing image layer needs something. This is the stub waiting for it. |
| GSAP | Title template | One file | Remotion `interpolate`/`spring` | Drop candidate | One consumer |
| FFmpeg | Audio post and mux | Not used | — | Likely add | Needed for music mixing and loudnorm |
| BullMQ/Redis, MinIO, MongoDB | Infra | In use | — | Yes | |

---

## 27. Missing AI Director layer

Target: "an AI Video Director that uses Remotion as its rendering engine."

| Layer | Exists | Missing |
|---|---|---|
| **Director** | `AIDirectorService` orchestrates 5 steps for video jobs | Not used by courses. No reasoning about audience or goal. No shared "creative brief" that every later layer reads. |
| **Script** | Chunked generation, per-line emotion | No self-critique or rewrite loop. Continuity is a 4-scene recap. |
| **Storyboard** | `beats` with purpose and tone | No per-scene visual intent (shot type, focal element, on-screen data). No storyboard artifact to review or edit. |
| **Scene planning** | `sceneType` from the LLM, layout via `chooseStrategy` heuristics | The LLM can't choose layout (quote, stat, comparison, timeline). Scene count and duration are formulaic. |
| **Visual planning** | `visualPalette` string, seeded palette and style | Nothing turns the plan into actual visuals (image, chart, diagram). The palette text feeds a prompt that never runs. |
| **Motion planning** | `MotionPlanningService` | Connected to nothing. Renderer ignores `cameraMotion`, `animation` is unused. |
| **Audio planning** | Voice per speaker, emotion | No music, SFX, ducking, loudness or pacing marks |
| **Timeline planning** | Duration equals audio duration, fixed 0.5 s crossfade | No holds, beats or word-level cues. Transition choice is a seeded pick. |
| **Asset planning** | `imagePrompt` per scene | No generator, no stock search, no reuse index, no per-scene asset decision |
| **Quality control** | IR compile (shadow), `validateAssets` | No visual QC (blank frames, text overflow, caption overlap). No LLM review of the script. Overflow handled only by `textFit`. |
| **Regeneration** | Per-scene audio, whole-script, re-render | No per-scene script or visual regeneration with feedback. No record of why a scene looks as it does. |

Two structural facts matter for ordering: the IR is the natural contract to extend, because it already validates scenes against template schemas, and the Director has no home in the course path today.

---

## 28. Final report

### A. What Vireon is today
Vireon is a local-first, single-user video factory for faceless explainer, podcast and course videos. An LLM (Ollama, gemma4) plans and writes a script, you review and edit it, then Qwen3-TTS narrates it with per-word caption timing from faster-whisper. Remotion renders the result as MP4 using a seeded procedural scene engine, with an optional MuseTalk talking-head overlay. A course workflow turns a topic into a curriculum and per-lesson videos. The platform around that is mature: resumable queues, GPU sequencing for a 6GB card, MinIO storage, Socket.IO progress, analytics and a Windows deployment. It has no visuals beyond text, shapes and gradients, no music, no auth, and an "AI Director" that only plans the script.

### B. Current pipeline
Prompt → Zod → BullMQ → Director (story plan, chunked scenes, deterministic post-passes) → validate → pause for approval → TTS, alignment, MinIO → optional avatar → assets and IR → Remotion render → MinIO → complete.

### C. All engines
Remotion, Ollama (gemma4:e4b-it-qat), LM Studio (alternate), Qwen3-TTS, faster-whisper, MuseTalk, ComfyUI (slot only), GSAP (one file), FFmpeg (indirect dependency), BullMQ, MinIO, MongoDB.

### D. Major implemented features
Video and podcast generation, course curriculum and lessons, scene Studio with live preview, voice library and Audio Studio, word-synced animated captions, caching, retry and recovery, GPU sequencing, analytics, live logs, Windows and Docker deployment, CI.

### E. Partial features
Director (script only), IR (shadow mode), portrait reflow in the generative scene, cross-process GPU safety (off by default), avatar (two stock faces), assets page, template analytics.

### F. Unused / dead systems
ComfyUI, the step graph, `Project` and `Render`, image statuses, `cameraMotion`, `animation`, `imagePrompt`, `thumbnailPrompt`, 46 legacy templates, `multer`, `uuid`.

### G. Missing capabilities
Image or video generation, charts and diagrams, music, SFX, ducking, loudness, auth, SRT/VTT export, WebM, variable FPS, retention policy for buckets, visual QC, VRAM awareness.

### H. AI Director gap
A director output contract (creative brief plus storyboard) must exist, be stored per job, and be read by every later step. Scenes need explicit visual intent and a layout choice made by the planner. The planner's decisions need to reach Remotion through the IR (camera motion, music, asset requests). The course path needs to go through the same director.

### I. Architecture risks
1. No auth. Safety relies on the network edge (Tailscale).
2. Public-read buckets, and unvalidated scene `imageUrl` fetched by headless Chromium.
3. Two uncoordinated worker processes can overload the 6GB GPU unless `GPU_COORDINATOR=redis` is set. Production env not verified.
4. A whole job is one BullMQ execution, so render and GPU stages can't scale independently.
5. Duplicated video and course pipelines, plus three template registries, will drift.
6. Output quality depends on one local 4B-class model.
7. Preview (Player) and final render (CLI) are separate paths. The IR shadow diff only monitors it, and I did not see its results.
8. Tests cover the infrastructure core but not the worker steps, Remotion rendering, or the Director.
9. A secret was committed once, per the `backup-before-remove-secret` branch name. `UNKNOWN` whether it was rotated.

### J. Recommended development order (by dependency, not by score)

1. **Foundation:** decide the Director's output contract (creative brief and storyboard) and extend the IR to carry it. Set `GPU_COORDINATOR=redis` if both workers run. Add a render-side URL allowlist for scene images.
2. **Core:** route the course path through `AIDirectorService`. Make the renderer consume `cameraMotion`, or delete it. Let the planner choose scene layouts instead of heuristics.
3. **Integration:** wire a real image path (the ComfyUI slot and `imagePrompt` already exist), plus an asset decision step. Add music and SFX mixing, which is where FFmpeg earns a place. Add chart and diagram scene types.
4. **Quality:** pipeline-step and Director tests, visual QC (overflow, blank frames, caption overlap), IR switched to authoritative once the shadow diff is clean, per-scene regeneration with feedback.
5. **Advanced:** wire the step graph if non-GPU work comes to dominate, split workers by capability, unify `VideoJob` and `CourseVideo` onto `Project` and `Render`, VRAM awareness.
6. **Optional:** WebM or other exports, SRT/VTT, auth if it leaves a trusted network, retention policy for buckets, remove dead packages and legacy templates.

---

# VIREON CURRENT STATE

```text
Product:            Local-first AI explainer / podcast / course video generator (single user, no auth)
Frontend:           React 19 + Vite 8 + Tailwind 4 + TanStack Query + Socket.IO + @remotion/player; v1 UI plus a /v2 shell
Backend:            Node 22 + Express 5; API plus two native BullMQ workers; Zod, helmet, winston, Swagger
Database:           MongoDB (Atlas in prod) via Mongoose; 11 models, 2 of them unused scaffolding
Queue:              BullMQ on Redis: video-rendering (one job = whole pipeline) and course-video-processing (concurrency 1)
Storage:            MinIO only: vireon-scenes, vireon-video, vireon-cache (all public-read); jobs/ is scratch
LLM:                Ollama gemma4:e4b-it-qat (default), LM Studio selectable; JSON mode, no response cache
Image Engine:       NONE. ComfyUI is a configured GPU slot only; imagePrompt is a dead end; manual URL paste only
TTS Engine:         Qwen3-TTS (1.7B / 0.6B) via Gradio: 9 presets, ~70 clone refs, voice design; content-hash cached
Audio Engine:       TTS plus faster-whisper alignment only; no music, SFX, ducking, normalization or volume control
Video Engine:       Remotion 4.0.489 (headless Chromium), MP4 h264 only, 8 resolutions, 4 aspect ratios, 30 fps fixed
Animation Engine:   Remotion interpolate/spring, seeded-random choreography; 10 motions, 9 transitions, 8 backgrounds, 8 decorations; GSAP in one file; cameraMotion ignored
Caption Engine:     Word-level forced alignment, 9 animations, 4 named styles, burned in; default on for podcast only; no SRT/VTT
Course Engine:      Curriculum LLM prompt, lessons and trailer, per-lesson script, audio and render stages; does not use the AI Director
Analytics:          Real Mongo aggregates plus Metric counters (stage times, cache hit rate, storage, retries); no GPU, model or template metrics
Caching:            TTS audio and reference transcripts (MinIO), render fingerprint skip; nothing else cached
Security:           No authentication; helmet, CORS allowlist, rate limit and Zod present; public-read buckets; scene imageUrl unvalidated
Observability:      Winston files, live log stream, JobEvent timeline, /health and /ready, Mongo counters; no tracing or alerting
AI Director:        Partial: script-time only (story beats, chunked scenes, deterministic visual/voice/motion passes), video jobs only; motion pass has no effect
Overall Pipeline:   Prompt → plan → script → approve → TTS and captions → [avatar] → Remotion render → MinIO. Solid and resumable, text-only visuals
Main Missing Layer: A director-owned storyboard and asset layer: visual intent per scene, image/chart/music generation, and the renderer contract to consume it
```
