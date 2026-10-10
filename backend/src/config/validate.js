const { z } = require('zod');

/**
 * Fail-fast validation of the assembled config object (not raw env).
 *
 * config/index.js is ~350 lines of `process.env.X || default`, which means
 * a typo'd MinIO endpoint, an unparseable timeout, or a missing Mongo URI
 * never surfaces at boot - it surfaces mid-job, as a render failure with a
 * misleading message, after the pipeline already spent TTS/GPU time. This
 * schema turns every one of those into a startup crash naming the exact
 * env var to fix.
 *
 * Deliberately validates *shape and range*, not reachability: whether
 * MongoDB/Redis/MinIO are actually up is a runtime concern their own
 * clients already report. This only catches config that cannot possibly
 * work no matter what is running.
 */

// `parseInt(...) || default` in config/index.js already collapses NaN to a
// default, so anything that reaches here as a non-positive number came from
// an explicit 0 or a negative - both real misconfigurations for a timeout.
const positiveInt = (label) =>
  z.number().int().positive({ message: `${label} must be a positive integer` });

const port = (label) =>
  z.number().int().min(1).max(65535, { message: `${label} must be a valid TCP port (1-65535)` });

const configSchema = z.object({
  port: port('PORT'),
  host: z.string().min(1, 'HOST must not be empty'),
  nodeEnv: z.enum(['development', 'production', 'test']),

  mongodb: z.object({
    // Catches the most common .env typo: a host/port with no scheme.
    uri: z.string().regex(/^mongodb(\+srv)?:\/\//, 'MONGODB_URI must start with mongodb:// or mongodb+srv://'),
  }),

  redis: z.object({
    host: z.string().min(1, 'REDIS_HOST must not be empty'),
    port: port('REDIS_PORT'),
  }),

  llm: z.object({
    timeout: positiveInt('LLM_TIMEOUT'),
    maxRetries: z.number().int().min(0).max(10),
  }),

  ollama: z.object({
    url: z.string().url('OLLAMA_URL must be a valid URL'),
    model: z.string().min(1),
    numCtx: positiveInt('OLLAMA_NUM_CTX'),
  }).passthrough(),

  gpu: z.object({
    mode: z.string().min(1),
    maxConcurrent: positiveInt('GPU_MAX_CONCURRENT_AI_SERVICES'),
    idleTimeoutMs: positiveInt('AI_SERVICE_IDLE_TIMEOUT'),
    coordinator: z.enum(['in-process', 'redis']),
    leaseTtlMs: positiveInt('GPU_LEASE_TTL_MS'),
  }),

  remotion: z.object({
    binary: z.string().min(1),
    timeout: positiveInt('REMOTION_TIMEOUT'),
    maxRetries: z.number().int().min(0).max(10),
    codec: z.string().min(1),
    pixelFormat: z.string().min(1),
    // CRF is an h264 concept with a hard 0-51 range; anything outside it is
    // silently clamped by ffmpeg, producing a quality preset that does not
    // do what its name says.
    qualityCrf: z.object({
      draft: z.number().int().min(0).max(51),
      standard: z.number().int().min(0).max(51),
      hd: z.number().int().min(0).max(51),
    }),
  }).passthrough(),

  ir: z.object({
    mode: z.enum(['off', 'shadow', 'authoritative']),
  }),

  minio: z.object({
    endpoint: z.string().min(1, 'MINIO_ENDPOINT must not be empty'),
    port: port('MINIO_PORT'),
    useSSL: z.boolean(),
    // MinIO refuses to start (and the SDK refuses to sign) with empty
    // credentials - an empty value here means the .env was never filled in.
    accessKey: z.string().min(1, 'MINIO_ROOT_USER is required'),
    secretKey: z.string().min(8, 'MINIO_ROOT_PASSWORD is required (MinIO requires at least 8 characters)'),
    scenesBucket: z.string().min(1),
    videoBucket: z.string().min(1),
    cacheBucket: z.string().min(1),
    publicUrl: z.string().url('MINIO_PUBLIC_URL must be a valid URL'),
    uploadRetries: z.number().int().min(0).max(10),
    uploadTimeoutMs: positiveInt('MINIO_UPLOAD_TIMEOUT_MS'),
  }).passthrough(),

  cors: z.object({
    origins: z.array(z.string().url('each CORS_ORIGIN entry must be a valid URL')).min(1, 'CORS_ORIGIN must list at least one origin'),
  }),

  rateLimit: z.object({
    windowMs: positiveInt('RATE_LIMIT_WINDOW_MS'),
    max: positiveInt('RATE_LIMIT_MAX'),
  }),

  videoWorker: z.object({
    concurrency: positiveInt('VIDEO_WORKER_CONCURRENCY'),
  }),

  publishing: z.object({
    google: z.object({
      clientId: z.string(),
      clientSecret: z.string(),
      redirectUri: z.string(),
    }),
    encryptionKey: z.string(),
    frontendUrl: z.string().url('PUBLISHING_FRONTEND_URL must be a valid URL'),
    youtube: z.object({
      apiVerified: z.boolean(),
      maxUploadBytes: positiveInt('YOUTUBE_MAX_UPLOAD_BYTES'),
      dailyUploadLimit: positiveInt('YOUTUBE_DAILY_UPLOAD_LIMIT'),
      chunkSizeBytes: positiveInt('YOUTUBE_UPLOAD_CHUNK_BYTES'),
      requestTimeoutMs: positiveInt('YOUTUBE_REQUEST_TIMEOUT_MS'),
      maxAttempts: z.number().int().min(1).max(20, 'PUBLISHING_MAX_ATTEMPTS must be at most 20'),
      processingPollMs: positiveInt('YOUTUBE_PROCESSING_POLL_MS'),
      processingWindowMs: positiveInt('YOUTUBE_PROCESSING_WINDOW_MS'),
      processingMaxChecks: positiveInt('YOUTUBE_PROCESSING_MAX_CHECKS'),
    }),
    export: z.object({ maxBytes: positiveInt('PUBLISHING_EXPORT_MAX_BYTES') }),
    rateLimit: z.object({
      windowMs: positiveInt('PUBLISHING_RATE_LIMIT_WINDOW_MS'),
      max: positiveInt('PUBLISHING_RATE_LIMIT_MAX'),
    }),
  }),

  social: z.object({
    meta: z.object({ appId: z.string(), appSecret: z.string(), redirectUri: z.string(), graphVersion: z.string().regex(/^v\d+\.\d+$/, 'META_GRAPH_VERSION must look like v25.0') }),
    threads: z.object({ appId: z.string(), appSecret: z.string(), redirectUri: z.string() }),
    publicMediaBaseUrl: z.string(),
    mediaTokenTtlMs: positiveInt('SOCIAL_MEDIA_TOKEN_TTL_MS'),
    maxImageBytes: positiveInt('SOCIAL_MAX_IMAGE_BYTES'),
    maxVideoBytes: positiveInt('SOCIAL_MAX_VIDEO_BYTES'),
    requestTimeoutMs: positiveInt('SOCIAL_REQUEST_TIMEOUT_MS'),
    uploadChunkBytes: positiveInt('SOCIAL_UPLOAD_CHUNK_BYTES'),
    maxAttempts: z.number().int().min(1).max(20, 'SOCIAL_MAX_ATTEMPTS must be at most 20'),
    processingPollMs: positiveInt('SOCIAL_PROCESSING_POLL_MS'),
    processingWindowMs: positiveInt('SOCIAL_PROCESSING_WINDOW_MS'),
    processingMaxChecks: positiveInt('SOCIAL_PROCESSING_MAX_CHECKS'),
    schedulerIntervalMs: positiveInt('SOCIAL_SCHEDULER_INTERVAL_MS'),
    minScheduleLeadMs: z.number().int().min(0, 'SOCIAL_MIN_SCHEDULE_LEAD_MS must not be negative'),
    maxScheduleAheadDays: positiveInt('SOCIAL_MAX_SCHEDULE_AHEAD_DAYS'),
    tokenRefreshWindowMs: positiveInt('SOCIAL_TOKEN_REFRESH_WINDOW_MS'),
    insightsCacheMs: positiveInt('SOCIAL_INSIGHTS_CACHE_MS'),
    dailyLimits: z.object({ instagram: positiveInt('SOCIAL_INSTAGRAM_DAILY_LIMIT'), facebook: positiveInt('SOCIAL_FACEBOOK_DAILY_LIMIT'), threads: positiveInt('SOCIAL_THREADS_DAILY_LIMIT') }),
  }),

  speech: z.object({
    alignmentEnabled: z.boolean(),
    drivenAnimationEnabled: z.boolean(),
    alignmentRequired: z.boolean(),
    completeRatio: z.number().gt(0).max(1, 'SPEECH_COMPLETE_RATIO must be between 0 and 1'),
    minPauseMs: positiveInt('SPEECH_PAUSE_MIN_MS'),
    phraseGapMs: positiveInt('SPEECH_PHRASE_GAP_MS'),
    maxPhraseWords: positiveInt('SPEECH_MAX_PHRASE_WORDS'),
  }).passthrough(),

  audio: z.object({
    segmentedTts: z.boolean(),
    segmentMaxChars: z.number().int().min(40).max(1000, 'TTS_SEGMENT_MAX_CHARS must be at most 1000'),
    segmentMinChars: z.number().int().min(1),
    previewMaxChars: positiveInt('TTS_PREVIEW_MAX_CHARS'),
    ffmpegPath: z.string().min(1),
    ffprobePath: z.string().min(1),
    speedMin: z.number().min(0.5).max(1),
    speedMax: z.number().min(1).max(2),
    pitchLimit: z.number().min(0).max(12),
    pauses: z.object({
      min: z.number().int().min(0),
      max: z.number().int().min(0).max(10000, 'PAUSE_MAX_MS must be at most 10000'),
      comma: z.number().int().min(0),
      sentence: z.number().int().min(0),
      paragraph: z.number().int().min(0),
      sceneTransition: z.number().int().min(0),
    }),
    processing: z.object({
      targetLoudness: z.number().min(-40).max(-5, 'TARGET_LOUDNESS must be between -40 and -5 LUFS'),
      truePeakLimit: z.number().min(-9).max(0, 'TRUE_PEAK_LIMIT must be between -9 and 0 dBTP'),
    }).passthrough(),
    ducking: z.object({
      duckAmount: z.number().min(0).max(1, 'DUCK_AMOUNT must be between 0 and 1'),
      attackMs: z.number().int().min(0),
      releaseMs: z.number().int().min(0),
    }),
  }).passthrough(),
}).passthrough();

/**
 * Cross-field rules no single field's schema can express. Returned in the
 * same `{ path, message }` shape as zod issues so both sources format
 * identically below.
 */
function crossFieldIssues(cfg) {
  const issues = [];

  // publicUrl is what gets handed to the browser as a download link. If its
  // scheme disagrees with what the SDK actually uploads over, every artifact
  // URL fails in the UI while uploads look successful - a failure that shows
  // up far from its cause.
  try {
    const parsed = new URL(cfg.minio.publicUrl);
    const expectedProtocol = cfg.minio.useSSL ? 'https:' : 'http:';
    if (parsed.protocol !== expectedProtocol) {
      issues.push({
        path: 'minio.publicUrl',
        message: `MINIO_PUBLIC_URL uses ${parsed.protocol}// but MINIO_USE_SSL implies ${expectedProtocol}//`,
      });
    }
  } catch {
    // A malformed URL is already reported by the schema above.
  }

  // Ordering the quality presets wrong (draft sharper than hd) silently
  // inverts what the UI's quality picker does.
  const { draft, standard, hd } = cfg.remotion.qualityCrf;
  if (!(draft >= standard && standard >= hd)) {
    issues.push({
      path: 'remotion.qualityCrf',
      message: `CRF presets must satisfy draft >= standard >= hd (lower CRF = higher quality); got draft=${draft}, standard=${standard}, hd=${hd}`,
    });
  }

  // Pause bounds the audio pipeline clamps against - an inverted range would
  // make every computed pause collapse to one end.
  const { min: pauseMin, max: pauseMax, sentence, paragraph, comma, sceneTransition } = cfg.audio.pauses;
  if (pauseMin > pauseMax) {
    issues.push({ path: 'audio.pauses', message: `PAUSE_MIN_MS (${pauseMin}) must not exceed PAUSE_MAX_MS (${pauseMax})` });
  }
  for (const [name, value] of Object.entries({ comma, sentence, paragraph, sceneTransition })) {
    if (value > pauseMax) {
      issues.push({ path: `audio.pauses.${name}`, message: `pause "${name}" (${value}ms) exceeds PAUSE_MAX_MS (${pauseMax}ms)` });
    }
  }
  if (cfg.audio.segmentMinChars >= cfg.audio.segmentMaxChars) {
    issues.push({ path: 'audio.segmentMinChars', message: 'TTS_SEGMENT_MIN_CHARS must be smaller than TTS_SEGMENT_MAX_CHARS' });
  }

  issues.push(...publishingIssues(cfg.publishing));
  issues.push(...socialIssues(cfg.social, cfg.publishing.encryptionKey));

  return issues;
}

// Publishing is optional, so an entirely empty section is fine. A *partly*
// filled one is a half-finished setup that would only fail at the OAuth
// callback, with Google's error page instead of ours - catch it at boot.
const KEY_BYTES = 32;
function decodeEncryptionKey(raw) {
  if (/^[0-9a-fA-F]{64}$/.test(raw)) return Buffer.from(raw, 'hex');
  if (/^[A-Za-z0-9+/_-]+={0,2}$/.test(raw)) {
    const buf = Buffer.from(raw.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
    if (buf.length === KEY_BYTES) return buf;
  }
  return null;
}

function publishingIssues(pub) {
  const issues = [];
  const { google, encryptionKey, youtube } = pub;

  if (youtube.chunkSizeBytes % (256 * 1024) !== 0) {
    issues.push({ path: 'publishing.youtube.chunkSizeBytes', message: 'YOUTUBE_UPLOAD_CHUNK_BYTES must be a multiple of 262144 (256 KiB) - YouTube rejects other chunk sizes' });
  }

  if (encryptionKey && !decodeEncryptionKey(encryptionKey)) {
    issues.push({ path: 'publishing.encryptionKey', message: 'PUBLISHING_TOKEN_ENCRYPTION_KEY must be 32 bytes, as 64 hex characters or base64 (see docs/publishing.md for a one-line generator)' });
  }

  const anyGoogle = google.clientId || google.clientSecret || google.redirectUri;
  if (anyGoogle) {
    if (!google.clientId) issues.push({ path: 'publishing.google.clientId', message: 'GOOGLE_CLIENT_ID is required when any Google OAuth setting is present' });
    if (!google.clientSecret) issues.push({ path: 'publishing.google.clientSecret', message: 'GOOGLE_CLIENT_SECRET is required when any Google OAuth setting is present' });
    if (!google.redirectUri) {
      issues.push({ path: 'publishing.google.redirectUri', message: 'GOOGLE_REDIRECT_URI is required when any Google OAuth setting is present' });
    } else {
      try {
        const url = new URL(google.redirectUri);
        const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
        if (url.protocol !== 'https:' && !(url.protocol === 'http:' && local)) {
          issues.push({ path: 'publishing.google.redirectUri', message: 'GOOGLE_REDIRECT_URI must be https (http is only accepted for localhost) - Google rejects anything else' });
        }
        if (url.hash) issues.push({ path: 'publishing.google.redirectUri', message: 'GOOGLE_REDIRECT_URI must not contain a #fragment' });
      } catch {
        issues.push({ path: 'publishing.google.redirectUri', message: 'GOOGLE_REDIRECT_URI must be a valid URL' });
      }
    }
    if (!encryptionKey) {
      issues.push({ path: 'publishing.encryptionKey', message: 'PUBLISHING_TOKEN_ENCRYPTION_KEY is required when Google OAuth is configured (refresh tokens are stored encrypted)' });
    }
  }
  return issues;
}

// Redirect URIs must be https (http only for localhost) with no fragment - Meta rejects anything else.
function redirectUriIssues(path, envVar, value) {
  const issues = [];
  try {
    const url = new URL(value);
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    if (url.protocol !== 'https:' && !(url.protocol === 'http:' && local)) {
      issues.push({ path, message: `${envVar} must be https (http is only accepted for localhost)` });
    }
    if (url.hash) issues.push({ path, message: `${envVar} must not contain a #fragment` });
  } catch {
    issues.push({ path, message: `${envVar} must be a valid URL` });
  }
  return issues;
}

// Like publishing, the social hub is optional; a PARTLY filled app section is the thing to catch at boot.
function socialIssues(social, encryptionKey) {
  const issues = [];
  const apps = [
    ['meta', 'META', [['appId', 'META_APP_ID'], ['appSecret', 'META_APP_SECRET'], ['redirectUri', 'META_REDIRECT_URI']]],
    ['threads', 'THREADS', [['appId', 'THREADS_APP_ID'], ['appSecret', 'THREADS_APP_SECRET'], ['redirectUri', 'THREADS_REDIRECT_URI']]],
  ];
  for (const [key, label, fields] of apps) {
    const section = social[key];
    if (!fields.some(([f]) => section[f])) continue;
    for (const [f, envVar] of fields) {
      if (!section[f]) issues.push({ path: `social.${key}.${f}`, message: `${envVar} is required when any ${label}_* setting is present` });
    }
    if (section.redirectUri) issues.push(...redirectUriIssues(`social.${key}.redirectUri`, `${label}_REDIRECT_URI`, section.redirectUri));
    if (!encryptionKey) {
      issues.push({ path: 'publishing.encryptionKey', message: `PUBLISHING_TOKEN_ENCRYPTION_KEY is required when ${key === 'meta' ? 'Meta' : 'Threads'} is configured (access tokens are stored encrypted)` });
    }
  }
  if (social.publicMediaBaseUrl) {
    try {
      const url = new URL(social.publicMediaBaseUrl);
      if (url.protocol !== 'https:') issues.push({ path: 'social.publicMediaBaseUrl', message: 'SOCIAL_PUBLIC_MEDIA_BASE_URL must be an https origin - Meta will not fetch media over plain http' });
      if (url.search || url.hash) issues.push({ path: 'social.publicMediaBaseUrl', message: 'SOCIAL_PUBLIC_MEDIA_BASE_URL must be an origin (no query or #fragment)' });
    } catch {
      issues.push({ path: 'social.publicMediaBaseUrl', message: 'SOCIAL_PUBLIC_MEDIA_BASE_URL must be a valid URL' });
    }
    if (!encryptionKey) {
      issues.push({ path: 'publishing.encryptionKey', message: 'PUBLISHING_TOKEN_ENCRYPTION_KEY is required when SOCIAL_PUBLIC_MEDIA_BASE_URL is set (media links are signed with it)' });
    }
  }
  return issues;
}

class ConfigValidationError extends Error {
  constructor(issues) {
    const lines = issues.map((i) => `  - ${i.path}: ${i.message}`).join('\n');
    super(`Invalid configuration - fix these in backend/.env and restart:\n${lines}`);
    this.name = 'ConfigValidationError';
    this.issues = issues;
  }
}

/**
 * Throws ConfigValidationError listing *every* problem at once rather than
 * failing on the first - fixing a .env one restart at a time is the worst
 * version of this.
 */
function validateConfig(cfg) {
  const result = configSchema.safeParse(cfg);

  const issues = result.success
    ? []
    : result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message }));

  // Cross-field checks only run on a config that already type-checks -
  // otherwise they would throw on the very fields the schema just rejected.
  if (result.success) issues.push(...crossFieldIssues(cfg));

  if (issues.length > 0) throw new ConfigValidationError(issues);
  return cfg;
}

/**
 * Entrypoint guard: validate or die, before anything else in the process
 * has a chance to connect to a misconfigured service.
 *
 * Writes straight to stderr rather than through LoggerService on purpose -
 * LoggerService reads config itself, so a config bad enough to reach here
 * is exactly the case where the logger may not be trustworthy yet.
 */
function assertValidOrExit(cfg) {
  try {
    return validateConfig(cfg);
  } catch (err) {
    if (!(err instanceof ConfigValidationError)) throw err;
    process.stderr.write(`\n${err.message}\n\n`);
    process.exit(1);
  }
}

module.exports = { decodeEncryptionKey, validateConfig, assertValidOrExit, ConfigValidationError, configSchema };

