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

const config = Object.freeze({
  port: parseInt(process.env.PORT, 10) || 3000,
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

  // Which local LLM server backs script/curriculum generation. Both are
  // driven through the same LLMService + GPU 'llm' slot; only the process
  // manager (localAI/lmStudioManager vs ollamaManager) and the request shape
  // differ. timeout/maxRetries are provider-neutral - LLM_* wins, the older
  // LM_STUDIO_* names still work so an existing .env keeps its tuning.
  llm: {
    provider: (process.env.LLM_PROVIDER || 'lmstudio').toLowerCase(),
    timeout: parseInt(process.env.LLM_TIMEOUT || process.env.LM_STUDIO_TIMEOUT, 10) || 60000,
    maxRetries: parseInt(process.env.LLM_MAX_RETRIES || process.env.LM_STUDIO_MAX_RETRIES, 10) || 3,
  },

  lmStudio: {
    url: process.env.LM_STUDIO_URL || 'http://localhost:1234/v1/chat/completions',
    model: process.env.LM_STUDIO_MODEL || 'google/gemma-4-e4b',
  },

  // Ollama is called through its native /api/chat (not the OpenAI-compat
  // /v1 endpoint) because only the native API accepts per-request
  // options.num_ctx, format:"json" and think:false. Ollama's default context
  // window is far smaller than our largest scene-planning responses
  // (maxTokens up to 32k), so without num_ctx long scripts get cut off
  // mid-JSON.
  ollama: {
    url: (process.env.OLLAMA_URL || 'http://localhost:11434').replace(/\/+$/, ''),
    model: process.env.OLLAMA_MODEL || 'qwen3.5:9b',
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

  // Local AI Service Manager (backend/src/services/localAI): auto-starts
  // LM Studio and the Qwen3-TTS Gradio server (normally launched by hand)
  // so a job never fails just because the user forgot to open them first.
  // Health-check URLs default to derivations of
  // the existing lmStudio.url/tts.url above rather than separate hardcoded
  // host/port literals, so the two stay in sync.
  localAI: {
    lmStudio: {
      enabled: process.env.LM_STUDIO_ENABLED !== 'false',
      // ENABLED is the master on/off switch for the whole integration;
      // AUTO_START/AUTO_STOP separately govern the GPU-sequential lifecycle
      // (GPUResourceManager) - AUTO_START gates whether ensureRunning() may
      // spawn it at all (false = health-check only, error if not already
      // up), AUTO_STOP gates whether releasing the GPU actively
      // unloads/stops it or leaves it warm indefinitely.
      autoStart: process.env.LM_STUDIO_AUTO_START !== 'false',
      autoStop: process.env.LM_STUDIO_AUTO_STOP !== 'false',
      // Where LM Studio's CLI (`lms`, ships on PATH with LM Studio's
      // desktop app - see https://lmstudio.ai/docs/cli) lives. Used both to
      // start the server and to JIT-load the configured model afterward.
      cliPath: process.env.LM_STUDIO_CLI_PATH || 'lms',
      // "lms server start" reuses whatever port the server last ran on if
      // none is given - pass the configured one explicitly so a first-ever
      // start also lands on the port lmStudio.url above expects.
      startCommand:
        process.env.LM_STUDIO_START_COMMAND ||
        `lms server start --port ${new URL(process.env.LM_STUDIO_URL || 'http://localhost:1234').port || 1234}`,
      healthUrl:
        process.env.LM_STUDIO_HEALTH_URL ||
        (process.env.LM_STUDIO_URL || 'http://localhost:1234/v1/chat/completions').replace(
          /\/v1\/chat\/completions\/?$/,
          '/v1/models'
        ),
      startupTimeoutMs: parseInt(process.env.LM_STUDIO_STARTUP_TIMEOUT_MS, 10) || 60000,
      healthCheckIntervalMs: parseInt(process.env.LM_STUDIO_HEALTH_CHECK_INTERVAL_MS, 10) || 2000,
      healthCheckTimeoutMs: parseInt(process.env.LM_STUDIO_HEALTH_CHECK_TIMEOUT_MS, 10) || 3000,
    },
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
      // Loading the TTS model onto the GPU is slower than LM Studio's model
      // load, hence the longer default startup budget.
      startupTimeoutMs: parseInt(process.env.TTS_STARTUP_TIMEOUT_MS, 10) || 180000,
      healthCheckIntervalMs: parseInt(process.env.TTS_HEALTH_CHECK_INTERVAL_MS, 10) || 3000,
      healthCheckTimeoutMs: parseInt(process.env.TTS_HEALTH_CHECK_TIMEOUT_MS, 10) || 5000,
    },
    // NOT wired to any real process on this machine - no ComfyUI install
    // was found here (checked C:\pinokio\api and C:\, D:\ top-level) and
    // nothing in this codebase currently generates images via ComfyUI (no
    // ComfyUI references exist anywhere in the repo). This block exists so
    // GPUResourceManager has a slot to sequence against once you do install
    // it and point COMFYUI_START_COMMAND/COMFYUI_WORKDIR at it - until then
    // `enabled` defaults to false and nothing will try to start it.
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
    // MuseTalk (audio-driven lip-sync avatar overlay - AvatarService) is the
    // same shape as TTS: a Gradio app, launched via its own Pinokio app
    // (C:\pinokio\api\musetalk.git\{start.js,app\app.py} - point
    // AVATAR_START_COMMAND/AVATAR_WORKDIR at wherever that app's own
    // start.js resolves its venv python.exe + app.py). Was LivePortrait
    // (canned stock-driving-video motion, audio-agnostic) until the avatar
    // overlay's mouth needed to actually match the TTS narration - see
    // services/avatar/avatarService.js.
    avatar: {
      enabled: process.env.AVATAR_SERVICE_ENABLED !== 'false',
      autoStart: process.env.AVATAR_AUTO_START !== 'false',
      autoStop: process.env.AVATAR_AUTO_STOP !== 'false',
      startCommand: process.env.AVATAR_START_COMMAND || '',
      workdir: process.env.AVATAR_WORKDIR || '',
      healthUrl: process.env.AVATAR_HEALTH_URL || `${(process.env.MUSETALK_URL || 'http://127.0.0.1:8890').replace(/\/$/, '')}/`,
      startupTimeoutMs: parseInt(process.env.AVATAR_STARTUP_TIMEOUT_MS, 10) || 180000,
      healthCheckIntervalMs: parseInt(process.env.AVATAR_HEALTH_CHECK_INTERVAL_MS, 10) || 3000,
      healthCheckTimeoutMs: parseInt(process.env.AVATAR_HEALTH_CHECK_TIMEOUT_MS, 10) || 5000,
    },
  },

  // GPU Resource Manager (backend/src/services/localAI/gpuResourceManager):
  // this dev machine has a single 6GB RTX 2060, so LM Studio + Qwen3-TTS +
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
    // Coordination backend for LocalAIService.gpu (LM Studio/TTS/ComfyUI/
    // avatar sequencing). 'in-process' (default) is today's
    // GPUResourceManager, correct only because exactly one worker process
    // runs. 'redis' uses core/leases (GPULeaseCoordinator) instead, so a
    // second worker process on the same GPU actually serializes against
    // the first rather than racing it - required before Phase 4's "split
    // the worker binary by capability" can run more than one worker.
    coordinator: process.env.GPU_COORDINATOR === 'redis' ? 'redis' : 'in-process',
  },

  avatar: {
    url: process.env.MUSETALK_URL || 'http://127.0.0.1:8890',
    // No user-uploaded photo - the avatar's source portrait is always one of
    // these two bundled defaults, picked by the job's voice's gender (see
    // AvatarService.resolveDefaultSourceImage). MuseTalk animates the mouth
    // region of this still image directly from the job's own narration
    // audio (see AvatarService.animatePortrait) - no separate driving video.
    defaultMaleImagePath: path.resolve(__dirname, '../../assets/avatar/default-male.jpg'),
    defaultFemaleImagePath: path.resolve(__dirname, '../../assets/avatar/default-female.jpg'),
    maxRetries: parseInt(process.env.AVATAR_MAX_RETRIES, 10) || 3,
    timeout: parseInt(process.env.AVATAR_TIMEOUT, 10) || 120000,
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
    // (audio/avatar), video = final video-level output (render/thumbnail).
    // script.json/assets.json are local scratch only, never uploaded - the
    // script content lives in MongoDB. See MinioStorageProvider.
    scenesBucket: process.env.MINIO_SCENES_BUCKET || 'vireon-scenes',
    videoBucket: process.env.MINIO_VIDEO_BUCKET || 'vireon-video',
    // Content-addressed Smart Cache storage (avatar clips, TTS audio) - kept
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

  // Smart Cache: content-addressed reuse of avatar clips and TTS audio
  // across jobs, so identical inputs skip the GPU/TTS call entirely. Set
  // SMART_CACHE_ENABLED=false to fall back to always-regenerate for
  // debugging. See CacheService.
  cache: {
    enabled: process.env.SMART_CACHE_ENABLED !== 'false',
  },

  cors: {
    // CORS_ORIGIN accepts a comma-separated list (e.g. for LAN access from multiple hosts)
    origins: (process.env.CORS_ORIGIN || 'http://localhost:5173,http://172.24.0.1:5173,http://192.168.1.7:5173')
      .split(',')
      .map((origin) => origin.trim())
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
});

module.exports = config;
