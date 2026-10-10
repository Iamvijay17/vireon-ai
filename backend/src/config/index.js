const dotenv = require('dotenv');
const path = require('path');
const os = require('os');

// override: true - .env is this project's single source of truth (every
// value here is documented/tuned for this machine's specific hardware and
// Pinokio install paths). Without it, dotenv silently keeps whatever a
// terminal session happens to already have exported (e.g. a stray
// TTS_TIMEOUT from an earlier `set`), so editing .env and restarting the
// dev server can look like it did nothing - confirmed live: a shell-level
// TTS_TIMEOUT kept overriding a freshly-raised .env value across multiple
// node --watch restarts on 2026-09-13.
dotenv.config({ path: path.resolve(__dirname, '../../.env'), override: true });

// STAGE_TIMEOUT_<NAME>_MS: a non-negative integer; 0 turns that stage's timeout
// off. Anything unparseable falls back to the default rather than silently
// disabling the safety net.
function stageTimeout(name, fallback) {
  const raw = process.env[`STAGE_TIMEOUT_${name}_MS`];
  if (raw === undefined || raw === '') return fallback;
  const n = Number(raw);
  return Number.isInteger(n) && n >= 0 ? n : fallback;
}

const config = Object.freeze({
  port: parseInt(process.env.PORT, 10) || 3000,
  // Interface to bind. Defaults to 0.0.0.0 because LAN access is an
  // intended workflow here (CORS_ORIGIN ships with LAN origins, and the
  // frontend runs `vite --host`). That is only safe on a trusted network:
  // middleware/auth.js is a documented pass-through, so anything that can
  // reach this port can drive the whole API. Set HOST=127.0.0.1 to make it
  // loopback-only. server.js warns on every non-loopback bind.
  host: process.env.HOST || '0.0.0.0',
  nodeEnv: process.env.NODE_ENV || 'development',
  isDev: (process.env.NODE_ENV || 'development') === 'development',
  isProd: process.env.NODE_ENV === 'production',
  isTest: process.env.NODE_ENV === 'test',

  mongodb: {
    uri: process.env.MONGODB_URI || 'mongodb://localhost:27017/vireon-ai',
  },

  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT, 10) || 6379,
  },

  // timeout/maxRetries apply to every script/curriculum generation call
  // (LLMService), which talks to Ollama - see config.ollama below.
  llm: {
    timeout: parseInt(process.env.LLM_TIMEOUT, 10) || 60000,
    maxRetries: parseInt(process.env.LLM_MAX_RETRIES, 10) || 3,
  },

  // Ollama is called through its native /api/chat (not the OpenAI-compat
  // /v1 endpoint) because only the native API accepts per-request
  // options.num_ctx, format:"json" and think:false. Ollama's default context
  // window is far smaller than our largest scene-planning responses
  // (maxTokens up to 32k), so without num_ctx long scripts get cut off
  // mid-JSON.
  ollama: {
    url: (process.env.OLLAMA_URL || 'http://localhost:11434').replace(/\/+$/, ''),
    model: process.env.OLLAMA_MODEL || 'gemma4:e4b-it-qat',
    numCtx: parseInt(process.env.OLLAMA_NUM_CTX, 10) || 16384,
    // Thinking models (qwen3.x, ...) otherwise spend the token budget on a
    // hidden reasoning trace before the JSON - off by default for our
    // structured-output calls.
    think: process.env.OLLAMA_THINK === 'true',
    // How long Ollama keeps the model in VRAM after a request. GPU handoff
    // to TTS/ComfyUI unloads explicitly (keep_alive:0), so this only matters
    // between back-to-back LLM calls.
    keepAlive: process.env.OLLAMA_KEEP_ALIVE || '30m',
  },

  tts: {
    url: process.env.TTS_API_URL || 'http://localhost:7860',
    modelSize: process.env.TTS_MODEL_SIZE || '1.7B',
    // Smaller/faster model used when the caller opts into "fast generation"
    // (see AudioService.generateStandaloneAudio's fastMode param) - trades
    // some quality for speed.
    fastModelSize: process.env.TTS_FAST_MODEL_SIZE || '0.6B',
    timeout: parseInt(process.env.TTS_TIMEOUT, 10) || 120000,
    maxRetries: parseInt(process.env.TTS_MAX_RETRIES, 10) || 3,
  },

  // Narration pipeline (services/audio/pipeline/): Voice Director ->
  // segmentation -> pronunciation -> TTS -> post-processing -> assembly.
  // Every stage is additive and individually switchable, so a bad setting
  // degrades to "narration as before" instead of failing a job.
  audio: {
    // Master switch for the segmented pipeline. Off (default) keeps the
    // original one-TTS-call-per-scene path (sceneSynthesis.js) exactly as
    // it was; the preview endpoint always uses the pipeline regardless.
    //
    // ENABLE_SPEECH_ALIGNMENT implies it: the canonical speech timeline is
    // built from the per-segment clips, which only this path produces.
    segmentedTts: process.env.TTS_SEGMENTED === 'true' || process.env.ENABLE_SPEECH_ALIGNMENT === 'true',
    // Narration is packed into sentence-boundary segments no longer than
    // this. Qwen3-TTS reads whole sentences best, so this is deliberately
    // not "one request per sentence" - a short scene stays a single segment.
    segmentMaxChars: parseInt(process.env.TTS_SEGMENT_MAX_CHARS, 10) || 240,
    // Pieces shorter than this are merged into a neighbour rather than
    // synthesized alone (tiny clips sound clipped and waste a GPU round trip).
    segmentMinChars: parseInt(process.env.TTS_SEGMENT_MIN_CHARS, 10) || 40,
    // Upper bound on text accepted by the preview endpoint.
    previewMaxChars: parseInt(process.env.TTS_PREVIEW_MAX_CHARS, 10) || 600,
    // ffmpeg/ffprobe are only needed for post-processing and speed changes.
    // Bare names resolve through PATH; point these at the .exe when the
    // worker's PATH lacks them (scheduled-task workers often do).
    ffmpegPath: process.env.FFMPEG_PATH || 'ffmpeg',
    ffprobePath: process.env.FFPROBE_PATH || 'ffprobe',
    // Playback-speed limits. Qwen3-TTS has no speed control, so speed is an
    // ffmpeg tempo change; beyond this range it audibly degrades the voice.
    speedMin: parseFloat(process.env.TTS_SPEED_MIN) || 0.85,
    speedMax: parseFloat(process.env.TTS_SPEED_MAX) || 1.2,
    // Pitch is in semitones. Applied only when ffmpeg has rubberband.
    pitchLimit: parseFloat(process.env.TTS_PITCH_LIMIT) || 2,
    // Pause lengths in ms. See pauseEngine.js.
    pauses: {
      min: parseInt(process.env.PAUSE_MIN_MS, 10) || 0,
      max: parseInt(process.env.PAUSE_MAX_MS, 10) || 1500,
      comma: parseInt(process.env.PAUSE_COMMA_MS, 10) || 120,
      sentence: parseInt(process.env.PAUSE_SENTENCE_MS, 10) || 320,
      paragraph: parseInt(process.env.PAUSE_PARAGRAPH_MS, 10) || 700,
      sceneTransition: parseInt(process.env.PAUSE_SCENE_TRANSITION_MS, 10) || 400,
    },
    director: {
      // Optional LLM refinement of the rule-based director. Costs an Ollama
      // call, so off unless asked for.
      llmEnabled: process.env.VOICE_DIRECTOR_LLM === 'true',
      defaultStyle: process.env.VOICE_DEFAULT_STYLE || 'professional',
    },
    pronunciation: {
      enabled: process.env.PRONUNCIATION_ENABLED !== 'false',
    },
    // Word-level timing for captions. 'faster-whisper' transcribes the
    // finished clip on CPU; 'none' disables alignment (captions fall back to
    // estimated pacing). Providers are pluggable - see pipeline/alignment.
    alignment: {
      provider: process.env.ALIGNMENT_PROVIDER || 'faster-whisper',
      model: process.env.ALIGNMENT_MODEL || 'base',
      // The aligner runs on CPU and shares the box with the GPU workers and
      // Remotion. One at a time, below-normal priority, and a thread cap keep
      // it from freezing the machine while a render is going.
      concurrency: parseInt(process.env.ALIGNMENT_CONCURRENCY, 10) || 1,
      cpuThreads: parseInt(process.env.ALIGNMENT_CPU_THREADS, 10) || 4,
      // Bias the recogniser toward the script's own vocabulary (product names,
      // acronyms). Still measures real audio - it only improves what is heard.
      textPrompt: process.env.ALIGNMENT_TEXT_PROMPT !== 'false',
    },
    // Post-processing chain (audioProcessor.js). Needs ffmpeg; when ffmpeg
    // is missing the chain is skipped with a warning, never failing a job.
    processing: {
      enabled: process.env.AUDIO_PROCESSING_ENABLED !== 'false',
      trimSilence: process.env.AUDIO_TRIM_SILENCE !== 'false',
      noiseReduction: process.env.AUDIO_NOISE_REDUCTION === 'true',
      eq: process.env.AUDIO_EQ_ENABLED !== 'false',
      compression: process.env.COMPRESSION_ENABLED !== 'false',
      normalization: process.env.NORMALIZATION_ENABLED !== 'false',
      // Integrated loudness target (LUFS) and true-peak ceiling (dBTP).
      targetLoudness: parseFloat(process.env.TARGET_LOUDNESS) || -16,
      truePeakLimit: parseFloat(process.env.TRUE_PEAK_LIMIT) || -1.5,
    },
    // Music ducking envelope parameters (timeline.buildDuckingEnvelope).
    ducking: {
      duckAmount: parseFloat(process.env.DUCK_AMOUNT) || 0.65,
      attackMs: parseInt(process.env.DUCK_ATTACK_MS, 10) || 120,
      releaseMs: parseInt(process.env.DUCK_RELEASE_MS, 10) || 400,
    },
  },

  // Speech-driven timing (services/audio/pipeline/speech): real word/phrase
  // timestamps from the finished audio become ONE canonical timeline that
  // captions, Remotion animation and scene timing all read. Both flags are
  // off by default - off means Vireon behaves exactly as before.
  speech: {
    // Build + persist the canonical speech timeline (implies the segmented
    // narration pipeline, see audio.segmentedTts).
    alignmentEnabled: process.env.ENABLE_SPEECH_ALIGNMENT === 'true',
    // Hand the timeline to Remotion so captions/animation follow the voice.
    // Without a timeline for a scene it silently falls back to fixed timing.
    drivenAnimationEnabled: process.env.ENABLE_SPEECH_DRIVEN_ANIMATION === 'true',
    // Fail the job when a scene cannot be word-aligned. Off: alignment is a
    // refinement and the (valid) audio still renders with segment-level timing.
    alignmentRequired: process.env.SPEECH_ALIGNMENT_REQUIRED === 'true',
    // A segment counts as fully aligned when at least this share of its caption
    // words got a measured (not estimated) timestamp.
    completeRatio: parseFloat(process.env.SPEECH_COMPLETE_RATIO) || 0.9,
    // Silence inside a segment at least this long is reported as a pause.
    minPauseMs: parseInt(process.env.SPEECH_PAUSE_MIN_MS, 10) || 250,
    // A silence this long inside a sentence also starts a new phrase.
    phraseGapMs: parseInt(process.env.SPEECH_PHRASE_GAP_MS, 10) || 180,
    maxPhraseWords: parseInt(process.env.SPEECH_MAX_PHRASE_WORDS, 10) || 8,
  },

  // Local AI Service Manager (backend/src/services/localAI): auto-starts
  // Ollama and the Qwen3-TTS Gradio server (normally launched by hand)
  // so a job never fails just because the user forgot to open them first.
  // Health-check URLs default to derivations of
  // the existing ollama.url/tts.url above rather than separate hardcoded
  // host/port literals, so the two stay in sync.
  localAI: {
    ollama: {
      enabled: process.env.OLLAMA_ENABLED !== 'false',
      autoStart: process.env.OLLAMA_AUTO_START !== 'false',
      autoStop: process.env.OLLAMA_AUTO_STOP !== 'false',
      // The Windows tray app normally has `ollama serve` running already;
      // this is only spawned when nothing answers the health check.
      startCommand: process.env.OLLAMA_START_COMMAND || 'ollama serve',
      healthUrl:
        process.env.OLLAMA_HEALTH_URL ||
        `${(process.env.OLLAMA_URL || 'http://localhost:11434').replace(/\/+$/, '')}/api/version`,
      startupTimeoutMs: parseInt(process.env.OLLAMA_STARTUP_TIMEOUT_MS, 10) || 60000,
      // Loading a model into VRAM (the /api/generate preload) - separate
      // from server startup since a 9B model can take a while from disk.
      modelLoadTimeoutMs: parseInt(process.env.OLLAMA_MODEL_LOAD_TIMEOUT_MS, 10) || 180000,
      healthCheckIntervalMs: parseInt(process.env.OLLAMA_HEALTH_CHECK_INTERVAL_MS, 10) || 2000,
      healthCheckTimeoutMs: parseInt(process.env.OLLAMA_HEALTH_CHECK_TIMEOUT_MS, 10) || 3000,
    },
    tts: {
      enabled: process.env.TTS_ENABLED !== 'false',
      autoStart: process.env.TTS_AUTO_START !== 'false',
      autoStop: process.env.TTS_AUTO_STOP !== 'false',
      // No safe cross-machine default exists for these two - they point at
      // this machine's actual standalone Qwen3-TTS checkout (a clone of
      // github.com/sup3rmass1ve/qwen3-tts, run via `python app.py` from its
      // own venv - see backend/README.md). Leave unset (auto-start disabled,
      // falls back to "start it manually") rather than guessing a path that
      // doesn't exist.
      startCommand: process.env.TTS_START_COMMAND || '',
      workdir: process.env.TTS_WORKDIR || '',
      // Voice-cloning reads a reference .mp3 via pydub, which shells out to
      // ffprobe/ffmpeg - not on PATH for a bare spawn() of the venv's
      // python.exe (confirmed live: every clone-mode request failed with
      // "ffprobe not found" even though the server itself was healthy).
      // Directory containing ffmpeg.exe/ffprobe.exe to prepend to PATH;
      // leave unset if they're already globally on PATH.
      ffmpegPath: process.env.TTS_FFMPEG_PATH || '',
      healthUrl: process.env.TTS_HEALTH_URL || `${(process.env.TTS_API_URL || 'http://localhost:7860').replace(/\/$/, '')}/`,
      // Loading the TTS model onto the GPU is slower than Ollama's model
      // load, hence the longer default startup budget.
      startupTimeoutMs: parseInt(process.env.TTS_STARTUP_TIMEOUT_MS, 10) || 180000,
      healthCheckIntervalMs: parseInt(process.env.TTS_HEALTH_CHECK_INTERVAL_MS, 10) || 3000,
      healthCheckTimeoutMs: parseInt(process.env.TTS_HEALTH_CHECK_TIMEOUT_MS, 10) || 5000,
    },
    // ComfyUI, the scene-image generator (see config.imageGen below and
    // services/image/). No install was found on this machine, so `enabled`
    // defaults to false and nothing will try to start it; install it and point
    // COMFYUI_START_COMMAND/COMFYUI_WORKDIR at it to turn image generation on.
    comfyUI: {
      enabled: process.env.COMFYUI_ENABLED === 'true',
      autoStart: process.env.COMFYUI_AUTO_START !== 'false',
      autoStop: process.env.COMFYUI_AUTO_STOP !== 'false',
      startCommand: process.env.COMFYUI_START_COMMAND || '',
      workdir: process.env.COMFYUI_WORKDIR || '',
      healthUrl: process.env.COMFYUI_HEALTH_URL || `${(process.env.COMFYUI_API_URL || 'http://127.0.0.1:8188').replace(/\/$/, '')}/system_stats`,
      startupTimeoutMs: parseInt(process.env.COMFYUI_STARTUP_TIMEOUT_MS, 10) || 180000,
      healthCheckIntervalMs: parseInt(process.env.COMFYUI_HEALTH_CHECK_INTERVAL_MS, 10) || 3000,
      healthCheckTimeoutMs: parseInt(process.env.COMFYUI_HEALTH_CHECK_TIMEOUT_MS, 10) || 5000,
    },
  },

  // GPU Resource Manager (backend/src/services/localAI/gpuResourceManager):
  // this dev machine has a single 6GB RTX 2060, so Ollama + Qwen3-TTS +
  // ComfyUI running their models at the same time reliably freezes/OOMs it.
  // maxConcurrent defaults to 1 - only one GPU-heavy local AI service is
  // allowed to hold its model loaded at a time; everything else either
  // reuses its own already-warm slot or queues until the current owner
  // finishes its stage and releases (see scriptStep.js/audioStep.js).
  gpu: {
    mode: process.env.AI_SERVICE_MODE || 'sequential',
    maxConcurrent: parseInt(process.env.GPU_MAX_CONCURRENT_AI_SERVICES, 10) || 1,
    // How long a released-but-not-yet-evicted service is left warm (model
    // still loaded) before an idle service with autoStop enabled is
    // unloaded/stopped to free VRAM/RAM. A service with autoStop=false
    // instead stays warm indefinitely until another service's acquire()
    // forces it out (GPU capacity is a hard limit either way).
    idleTimeoutMs: (parseInt(process.env.AI_SERVICE_IDLE_TIMEOUT, 10) || 60) * 1000,
    // Coordination backend for LocalAIService.gpu (Ollama/TTS/ComfyUI
    // sequencing). 'in-process' (default) is today's
    // GPUResourceManager, correct only because exactly one worker process
    // runs. 'redis' additionally backs it with core/leases/RedisLease, so a
    // second worker process on the same GPU actually serializes against
    // the first rather than racing it - required before Phase 4's "split
    // the worker binary by capability" can run more than one worker.
    // Warm reuse survives: the holder only unloads when another process
    // signals demand (RedisLease.signalDemand), not on every release.
    coordinator: process.env.GPU_COORDINATOR === 'redis' ? 'redis' : 'in-process',
    // TTL on the cross-process GPU lease (coordinator: 'redis' only). Held
    // leases renew at a third of this, so it does NOT need to cover a long
    // TTS/render call - it only bounds how long a *crashed* holder's claim
    // lingers before another process can reclaim the card. Short is good;
    // too short risks a renewal round-trip losing a race it should win.
    leaseTtlMs: parseInt(process.env.GPU_LEASE_TTL_MS, 10) || 30000,
  },

  remotion: {
    binary: process.env.REMOTION_BINARY || 'npx remotion',
    timeout: parseInt(process.env.REMOTION_TIMEOUT, 10) || 300000,
    maxRetries: parseInt(process.env.REMOTION_MAX_RETRIES, 10) || 2,
    // Encode settings passed to the Remotion CLI's `render` command - before
    // this, no codec/crf/pixel-format flags were passed at all, so every
    // render used Remotion's own built-in defaults with no way to tune
    // quality vs. file size.
    codec: process.env.REMOTION_CODEC || 'h264',
    pixelFormat: process.env.REMOTION_PIXEL_FORMAT || 'yuv420p',
    // CRF per VideoJob.quality preset (lower = higher quality/larger file).
    // 'standard' (18) matches Remotion's own h264 default, so existing jobs
    // that don't set a quality preset keep today's behavior unchanged.
    // 'draft' is a fast, cheap preview-quality encode; 'hd' is the
    // highest-quality encode. Falls back to 'standard' for an unrecognized
    // or missing preset - see RemotionService.renderVideo.
    qualityCrf: {
      draft: parseInt(process.env.REMOTION_CRF_DRAFT, 10) || 28,
      standard: parseInt(process.env.REMOTION_CRF_STANDARD, 10) || 18,
      hd: parseInt(process.env.REMOTION_CRF_HD, 10) || 12,
    },
  },

  // Generative Scene Engine (remotion/src/engine/*.js): computes layout,
  // style, and motion procedurally from scene content instead of picking
  // one of the ~46 hand-coded template files. Defaults on; set
  // GENERATIVE_ENGINE_ENABLED=false to roll back new scripts to the legacy
  // random-pick-from-fixed-templates behavior (see
  // ScriptParserService._getDefaultTemplateForType).
  generativeEngine: {
    enabled: process.env.GENERATIVE_ENGINE_ENABLED !== 'false',
  },

  // SceneGraph IR (src/ir/): typed compile of script + job config that
  // validates every scene against its template's props schema.
  //   'shadow'        (default) compile, log issues, diff against the legacy
  //                   render-props builder - legacy output is still what renders
  //   'authoritative' IR-derived props render; compile errors fail the job
  //                   at script time, before any TTS/GPU spend
  //   'off'           skip entirely
  ir: {
    mode: ['off', 'shadow', 'authoritative'].includes(process.env.IR_MODE) ? process.env.IR_MODE : 'shadow',
  },

  minio: {
    endpoint: process.env.MINIO_ENDPOINT || '127.0.0.1',
    port: parseInt(process.env.MINIO_PORT, 10) || 9000,
    useSSL: process.env.MINIO_USE_SSL === 'true',
    accessKey: process.env.MINIO_ROOT_USER || '',
    secretKey: process.env.MINIO_ROOT_PASSWORD || '',
    // Two buckets instead of one flat namespace: scenes = scene-level data
    // (audio), video = final video-level output (render/thumbnail).
    // script.json/assets.json are local scratch only, never uploaded - the
    // script content lives in MongoDB. See MinioStorageProvider.
    scenesBucket: process.env.MINIO_SCENES_BUCKET || 'vireon-scenes',
    videoBucket: process.env.MINIO_VIDEO_BUCKET || 'vireon-video',
    // Content-addressed Smart Cache storage (TTS audio) - kept
    // separate from scenesBucket/videoBucket so a job's delete/cleanup never
    // touches cached entries shared across jobs. See CacheService.
    cacheBucket: process.env.MINIO_CACHE_BUCKET || 'vireon-cache',
    // Base URL used to build public download links returned to callers
    // (e.g. http://127.0.0.1:9000). Override for LAN access or a reverse proxy.
    publicUrl:
      process.env.MINIO_PUBLIC_URL ||
      `http${process.env.MINIO_USE_SSL === 'true' ? 's' : ''}://${process.env.MINIO_ENDPOINT || '127.0.0.1'}:${process.env.MINIO_PORT || 9000}`,
    uploadRetries: parseInt(process.env.MINIO_UPLOAD_RETRIES, 10) || 3,
    // Guards against a wedged MinIO connection (TCP connect succeeds but the
    // PUT never completes/rejects) hanging the UPLOADING step forever - see
    // withTimeout's doc comment. Each retry attempt gets its own fresh
    // timeout window.
    uploadTimeoutMs: parseInt(process.env.MINIO_UPLOAD_TIMEOUT_MS, 10) || 120000,
  },

  // Smart Cache: content-addressed reuse of TTS audio
  // across jobs, so identical inputs skip the GPU/TTS call entirely. Set
  // SMART_CACHE_ENABLED=false to fall back to always-regenerate for
  // debugging. See CacheService.
  cache: {
    enabled: process.env.SMART_CACHE_ENABLED !== 'false',
    // Cached objects older than this many days are expired by MinIO. 0 (the
    // default) keeps them forever. Age counts from creation, so a popular
    // entry is regenerated once after it expires - costs a re-run, never a
    // broken video. See services/storage/cacheRetention.js.
    retentionDays: Math.max(0, parseInt(process.env.CACHE_RETENTION_DAYS, 10) || 0),
    // How identical in-flight generations are recognised across processes (the video worker,
    // the course worker, the API): 'redis' (default) uses a short per-key lock so a second
    // process waits for the first instead of generating the same artifact again; 'memory'
    // dedupes within one process only. Redis being unreachable degrades to 'memory' on its
    // own - the lock is an optimisation, never a gate. See services/cache/GenerationCoordinator.
    // Unit tests default to 'memory' so they never open a Redis socket. Detected by Jest's own
    // worker id rather than NODE_ENV, because .env overrides NODE_ENV here (see the dotenv call).
    coordination: (process.env.CACHE_COORDINATION || (process.env.JEST_WORKER_ID ? 'memory' : 'redis')) === 'memory' ? 'memory' : 'redis',
    // The per-key lock's lifetime (renewed while the holder works; a dead holder frees it
    // within one TTL) and the longest a follower waits on another process before generating.
    lockTtlMs: parseInt(process.env.CACHE_LOCK_TTL_MS, 10) || 120000,
    waitMs: parseInt(process.env.CACHE_WAIT_MS, 10) || 20 * 60_000,
  },

  cors: {
    // CORS_ORIGIN accepts a comma-separated list (e.g. for LAN access from multiple hosts)
    origins: (process.env.CORS_ORIGIN || 'http://localhost:5173,http://172.24.0.1:5173,http://192.168.1.7:5173')
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
  },

  // Scene image generation through ComfyUI (services/image/). Off unless
  // ComfyUI itself is enabled (COMFYUI_ENABLED=true) - with it off, scenes the
  // Director wanted an image for are rendered as text-only scenes instead of
  // failing the job (see services/image/sceneImages.js).
  imageGen: {
    enabled: process.env.COMFYUI_ENABLED === 'true' && process.env.IMAGE_GEN_ENABLED !== 'false',
    // true: a scene whose image can't be generated fails the job instead of
    // quietly falling back to a text-only scene.
    required: process.env.IMAGE_GEN_REQUIRED === 'true',
    // Cap on generated images per video. A 6GB card renders one image in tens of
    // seconds, and the Director is told this budget so it spends it where a
    // picture matters.
    maxPerVideo: parseInt(process.env.IMAGE_MAX_PER_VIDEO, 10) || 6,
    apiUrl: (process.env.COMFYUI_API_URL || 'http://127.0.0.1:8188').replace(/\/+$/, ''),
    // ComfyUI "API format" workflow with {{placeholders}} - see
    // backend/workflows/README.md. Swap it to change model or pipeline.
    workflowPath: process.env.IMAGE_WORKFLOW_PATH || path.resolve(__dirname, '../../workflows/txt2img.api.json'),
    // Checkpoint filename as ComfyUI lists it (models/checkpoints/). No default:
    // which model fits your card is your call, and a wrong name only fails at
    // generation time.
    checkpoint: process.env.COMFYUI_CHECKPOINT || '',
    steps: parseInt(process.env.IMAGE_STEPS, 10) || 25,
    cfg: parseFloat(process.env.IMAGE_CFG) || 7,
    // CFG used when Image Studio is given an "avoid" (negative) prompt. Qwen-Image runs at CFG 1
    // (no negative pass) and ignores a negative there; above 1 each step runs the model twice, so
    // it is ~50% slower and the picture can change a lot. See workflows/README.md.
    guidedCfg: parseFloat(process.env.IMAGE_NEGATIVE_CFG) || 3,
    sampler: process.env.IMAGE_SAMPLER || 'euler',
    scheduler: process.env.IMAGE_SCHEDULER || 'normal',
    negativePrompt:
      process.env.IMAGE_NEGATIVE_PROMPT ||
      'text, letters, words, watermark, logo, signature, blurry, low quality, deformed, extra fingers',
    // Native generation size by orientation. The image is cover-fitted into its
    // slot, so these only need the right aspect, not the render's resolution -
    // keep them inside what the model was trained for.
    landscapeSize: process.env.IMAGE_SIZE_LANDSCAPE || '1024x576',
    portraitSize: process.env.IMAGE_SIZE_PORTRAIT || '576x1024',
    squareSize: process.env.IMAGE_SIZE_SQUARE || '768x768',
    timeoutMs: parseInt(process.env.IMAGE_TIMEOUT_MS, 10) || 300000,
    maxRetries: parseInt(process.env.IMAGE_MAX_RETRIES, 10) || 2,
  },

  // Layout QC (services/qc/): renders each scene in headless Chromium just before the
  // video render and reports text that is cut off or off-frame, overlapping text,
  // images that did not load. Off by default - it adds a Remotion bundle + a few
  // seconds per video. It only reports; QC_FAIL_ON_ERROR=true makes errors stop the render.
  qc: {
    enabled: process.env.QC_ENABLED === 'true',
    failOnError: process.env.QC_FAIL_ON_ERROR === 'true',
    timeoutMs: parseInt(process.env.QC_TIMEOUT_MS, 10) || 300000,
  },

  // Multi-platform publishing (services/publishing/): YouTube upload through the
  // official Data API v3 + Udemy course export. Everything is opt-in - with no
  // Google credentials the module simply reports "not configured" and nothing
  // is ever uploaded. Secrets come from the environment only.
  publishing: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID || '',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
      // The BACKEND callback Google redirects the browser to, e.g.
      // https://<host>/api/publishing/oauth/google/callback. Must match the
      // "Authorized redirect URIs" entry in Google Cloud exactly.
      redirectUri: process.env.GOOGLE_REDIRECT_URI || '',
    },
    // 32-byte key (64 hex chars or base64) used to encrypt refresh tokens and
    // upload-session URLs at rest. Without it nothing can be connected.
    encryptionKey: process.env.PUBLISHING_TOKEN_ENCRYPTION_KEY || '',
    // Where the browser is sent after the OAuth callback. Fixed config, never
    // taken from the request, so the callback cannot be used as an open redirect.
    frontendUrl: (process.env.PUBLISHING_FRONTEND_URL || (process.env.CORS_ORIGIN || 'http://localhost:5173').split(',')[0].trim()).replace(/\/+$/, ''),
    youtube: {
      // YouTube locks videos uploaded through an UNVERIFIED API project to
      // private (and that cannot be appealed per video). Until the project has
      // passed YouTube's API audit, leave this false: the module then only
      // accepts private uploads instead of letting people think a video is public.
      apiVerified: process.env.YOUTUBE_API_VERIFIED === 'true',
      // Refuse files larger than this before uploading a byte (YouTube's own
      // ceiling is 256 GB; the default is deliberately far lower).
      // Added to the end of every new draft's description (editable before publishing), so viewers
      // are told the video is AI-generated. Set YOUTUBE_AI_DISCLOSURE= (empty) to turn it off.
      aiDisclosure: process.env.YOUTUBE_AI_DISCLOSURE !== undefined
        ? process.env.YOUTUBE_AI_DISCLOSURE.trim()
        : 'This video was created with AI: the script, narration and visuals are AI-generated. Made with Vireon AI.',
      maxUploadBytes: parseInt(process.env.YOUTUBE_MAX_UPLOAD_BYTES, 10) || 4 * 1024 ** 3,
      // Local guard on the project's daily videos.insert allowance, so we stop
      // before Google does. Check your real figure in Google Cloud > Quotas.
      dailyUploadLimit: parseInt(process.env.YOUTUBE_DAILY_UPLOAD_LIMIT, 10) || 100,
      // Resumable-upload chunk. Must be a multiple of 256 KiB.
      chunkSizeBytes: parseInt(process.env.YOUTUBE_UPLOAD_CHUNK_BYTES, 10) || 8 * 1024 * 1024,
      requestTimeoutMs: parseInt(process.env.YOUTUBE_REQUEST_TIMEOUT_MS, 10) || 120000,
      // Bounded automatic retries for transient failures, with exponential backoff.
      maxAttempts: parseInt(process.env.PUBLISHING_MAX_ATTEMPTS, 10) || 5,
      // How long one worker run polls YouTube for "processed" before handing
      // the check back to the queue, and how many hand-backs are allowed.
      processingPollMs: parseInt(process.env.YOUTUBE_PROCESSING_POLL_MS, 10) || 10000,
      processingWindowMs: parseInt(process.env.YOUTUBE_PROCESSING_WINDOW_MS, 10) || 10 * 60_000,
      processingMaxChecks: parseInt(process.env.YOUTUBE_PROCESSING_MAX_CHECKS, 10) || 24,
    },
    export: {
      // Upper bound on a Udemy package ZIP (sum of the media it would contain).
      maxBytes: parseInt(process.env.PUBLISHING_EXPORT_MAX_BYTES, 10) || 20 * 1024 ** 3,
    },
    // Separate, tighter limiter for the publishing routes that change state.
    rateLimit: {
      windowMs: parseInt(process.env.PUBLISHING_RATE_LIMIT_WINDOW_MS, 10) || 60 * 1000,
      max: parseInt(process.env.PUBLISHING_RATE_LIMIT_MAX, 10) || 60,
    },
  },

  security: {
    // Extra hosts a scene image URL may point at even though they are (or
    // resolve to) a private address - comma-separated hostnames or host:port.
    // MinIO's own public URL is always allowed (see utils/assetUrlGuard.js),
    // so this is only needed for e.g. an internal image server on the LAN.
    imageAllowedHosts: (process.env.IMAGE_URL_ALLOWED_HOSTS || '')
      .split(',')
      .map((host) => host.trim())
      .filter(Boolean),
  },

  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) || 60 * 1000,
    max: parseInt(process.env.RATE_LIMIT_MAX, 10) || 600,
  },

  // Each concurrent video job spends most of its time on network/GPU-bound
  // TTS calls, but also runs a CPU-heavy Remotion render (see renderStep.js)
  // as one step of the same job - so worker concurrency doubles as a cap on
  // how many simultaneous Remotion renders a single host can take. A flat
  // "3" was fine on the dev machine it was tuned on but oversubscribes a
  // smaller host (e.g. a 2-core box hitting 3 concurrent renders) and
  // under-uses a bigger one. Default scales with core count instead;
  // VIDEO_WORKER_CONCURRENCY still overrides it directly when you know the
  // right number for a given deployment (e.g. after splitting render into
  // its own queue).
  videoWorker: {
    concurrency:
      parseInt(process.env.VIDEO_WORKER_CONCURRENCY, 10) ||
      Math.max(1, Math.min(os.cpus().length - 1, 3)),
  },

  // AI Director (services/director/): how many times the model is asked to correct
  // output that failed validation before the deterministic default is used instead.
  // 0 turns correction off (invalid output goes straight to the default).
  director: {
    maxRepairs: (() => {
      const n = Number(process.env.DIRECTOR_MAX_REPAIRS);
      return Number.isInteger(n) && n >= 0 && process.env.DIRECTOR_MAX_REPAIRS !== '' ? n : 1;
    })(),
  },

  // Per-stage wall-clock budgets for the video worker (services/pipeline/
  // stageRunner.js). These are safety nets for a hung call, NOT tuning knobs:
  // each sits far above what a healthy stage takes on the 6GB dev card, so a
  // slow-but-progressing stage is never killed. A stage over budget is aborted
  // and retried like any other transient failure. 0 disables a stage's
  // timeout; STAGE_TIMEOUT_<STAGE>_MS overrides it.
  pipeline: {
    stageTimeoutMs: {
      script: stageTimeout('SCRIPT', 30 * 60_000),
      audio: stageTimeout('AUDIO', 120 * 60_000),
      images: stageTimeout('IMAGES', 120 * 60_000),
      assets: stageTimeout('ASSETS', 15 * 60_000),
      render: stageTimeout('RENDER', 120 * 60_000),
      upload: stageTimeout('UPLOAD', 30 * 60_000),
    },
  },
});

module.exports = config;
