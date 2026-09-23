const { validateConfig, ConfigValidationError } = require('../../src/config/validate');

/**
 * A minimal config that passes, so each test can break exactly one thing
 * and assert the message names the env var a human has to go edit.
 */
const validConfig = () => ({
  port: 3000,
  host: '0.0.0.0',
  nodeEnv: 'development',
  mongodb: { uri: 'mongodb://localhost:27017/vireon-ai' },
  redis: { host: 'localhost', port: 6379 },
  llm: { provider: 'lmstudio', timeout: 60000, maxRetries: 3 },
  lmStudio: { url: 'http://localhost:1234/v1/chat/completions', model: 'gemma' },
  ollama: { url: 'http://localhost:11434', model: 'gemma', numCtx: 16384 },
  gpu: { mode: 'sequential', maxConcurrent: 1, idleTimeoutMs: 60000, coordinator: 'in-process', leaseTtlMs: 30000 },
  avatar: { url: 'http://127.0.0.1:8890', maxRetries: 3, timeout: 120000 },
  remotion: {
    binary: 'npx remotion', timeout: 300000, maxRetries: 2,
    codec: 'h264', pixelFormat: 'yuv420p',
    qualityCrf: { draft: 28, standard: 18, hd: 12 },
  },
  ir: { mode: 'shadow' },
  minio: {
    endpoint: '127.0.0.1', port: 9000, useSSL: false,
    accessKey: 'minioadmin', secretKey: 'minioadmin',
    scenesBucket: 'vireon-scenes', videoBucket: 'vireon-video', cacheBucket: 'vireon-cache',
    publicUrl: 'http://127.0.0.1:9000', uploadRetries: 3, uploadTimeoutMs: 120000,
  },
  cors: { origins: ['http://localhost:5173'] },
  rateLimit: { windowMs: 60000, max: 600 },
  videoWorker: { concurrency: 3 },
});

/** Run validateConfig on a config mutated by `mutate`, return the issues. */
const issuesFor = (mutate) => {
  const cfg = validConfig();
  mutate(cfg);
  try {
    validateConfig(cfg);
    return null;
  } catch (err) {
    expect(err).toBeInstanceOf(ConfigValidationError);
    return err.issues;
  }
};

describe('validateConfig', () => {
  it('accepts a well-formed config', () => {
    expect(() => validateConfig(validConfig())).not.toThrow();
  });

  it('accepts the real config this repo boots with', () => {
    // Guards against the schema drifting ahead of config/index.js - the
    // failure mode where every process refuses to start.
    expect(() => validateConfig(require('../../src/config'))).not.toThrow();
  });

  it('rejects a MONGODB_URI with no scheme', () => {
    const issues = issuesFor((c) => { c.mongodb.uri = 'localhost:27017/vireon'; });
    expect(issues[0].path).toBe('mongodb.uri');
    expect(issues[0].message).toContain('MONGODB_URI');
  });

  it('rejects empty MinIO credentials', () => {
    const issues = issuesFor((c) => { c.minio.accessKey = ''; c.minio.secretKey = ''; });
    const paths = issues.map((i) => i.path);
    expect(paths).toContain('minio.accessKey');
    expect(paths).toContain('minio.secretKey');
  });

  it('rejects a MinIO password shorter than MinIO itself accepts', () => {
    const issues = issuesFor((c) => { c.minio.secretKey = 'short'; });
    expect(issues[0].message).toContain('8 characters');
  });

  it('rejects an out-of-range port', () => {
    expect(issuesFor((c) => { c.port = 70000; })[0].path).toBe('port');
    expect(issuesFor((c) => { c.redis.port = 0; })[0].path).toBe('redis.port');
  });

  it('rejects a non-positive timeout', () => {
    // parseInt(...) || default collapses NaN, so a 0 here means someone
    // explicitly set the env var to 0 - which disables the guard entirely.
    expect(issuesFor((c) => { c.minio.uploadTimeoutMs = 0; })[0].path).toBe('minio.uploadTimeoutMs');
  });

  it('rejects an unknown LLM provider', () => {
    const issues = issuesFor((c) => { c.llm.provider = 'openai'; });
    expect(issues[0].message).toContain('LLM_PROVIDER');
  });

  it('rejects an unknown IR mode and GPU coordinator', () => {
    expect(issuesFor((c) => { c.ir.mode = 'authoritive'; })[0].path).toBe('ir.mode');
    expect(issuesFor((c) => { c.gpu.coordinator = 'rediss'; })[0].path).toBe('gpu.coordinator');
  });

  it('rejects a CRF outside the h264 range', () => {
    expect(issuesFor((c) => { c.remotion.qualityCrf.hd = -1; })[0].path).toBe('remotion.qualityCrf.hd');
    expect(issuesFor((c) => { c.remotion.qualityCrf.draft = 99; })[0].path).toBe('remotion.qualityCrf.draft');
  });

  it('rejects an empty CORS origin list', () => {
    expect(issuesFor((c) => { c.cors.origins = []; })[0].path).toBe('cors.origins');
  });

  it('reports every problem at once, not just the first', () => {
    const issues = issuesFor((c) => {
      c.mongodb.uri = 'nope';
      c.minio.accessKey = '';
      c.redis.port = 99999;
      c.ir.mode = 'bogus';
    });
    expect(issues.length).toBeGreaterThanOrEqual(4);
  });

  it('formats the thrown message as an actionable list', () => {
    try {
      validateConfig({ ...validConfig(), mongodb: { uri: 'nope' } });
    } catch (err) {
      expect(err.message).toContain('backend/.env');
      expect(err.message).toContain('mongodb.uri');
    }
  });

  describe('cross-field rules', () => {
    it('catches a MINIO_PUBLIC_URL whose scheme disagrees with MINIO_USE_SSL', () => {
      const issues = issuesFor((c) => { c.minio.useSSL = true; });
      expect(issues[0].path).toBe('minio.publicUrl');
      expect(issues[0].message).toContain('MINIO_USE_SSL');
    });

    it('catches inverted CRF quality presets', () => {
      // draft must be the *blurriest* (highest CRF); flipping these silently
      // inverts what the UI quality picker does.
      const issues = issuesFor((c) => { c.remotion.qualityCrf = { draft: 12, standard: 18, hd: 28 }; });
      expect(issues[0].path).toBe('remotion.qualityCrf');
    });

    it('does not run cross-field checks on a config that already failed typing', () => {
      // Otherwise they would throw on the very fields the schema rejected.
      const issues = issuesFor((c) => { c.minio.publicUrl = 'not a url'; c.remotion.qualityCrf.hd = 'x'; });
      expect(issues.every((i) => i.path !== 'remotion.qualityCrf')).toBe(true);
    });
  });
});
