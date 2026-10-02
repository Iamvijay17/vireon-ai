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
    provider: z.enum(['lmstudio', 'ollama'], {
      errorMap: () => ({ message: 'LLM_PROVIDER must be "lmstudio" or "ollama"' }),
    }),
    timeout: positiveInt('LLM_TIMEOUT'),
    maxRetries: z.number().int().min(0).max(10),
  }),

  lmStudio: z.object({
    url: z.string().url('LM_STUDIO_URL must be a valid URL'),
    model: z.string().min(1),
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

  avatar: z.object({
    url: z.string().url('MUSETALK_URL must be a valid URL'),
    maxRetries: z.number().int().min(0).max(10),
    timeout: positiveInt('AVATAR_TIMEOUT'),
  }).passthrough(),

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

module.exports = { validateConfig, assertValidOrExit, ConfigValidationError, configSchema };

