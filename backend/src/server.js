const express = require('express');
const http = require('http');
const morgan = require('morgan');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const path = require('path');
const swaggerUi = require('swagger-ui-express');
const config = require('./config');
const appVersion = require('./config/version');
// Validate the assembled config before anything connects to Mongo/Redis/MinIO
// below - a bad .env should be a startup crash naming the variable, not a
// confusing mid-job failure. See config/validate.js.
require('./config/validate').assertValidOrExit(config);
const swaggerSpec = require('./config/swagger');
const LoggerService = require('./services/common/LoggerService');

// Fire-and-forget: spawns a local redis-server if REDIS_HOST is localhost
// and nothing's listening there yet, so the queue connections below don't
// spend the next several minutes retrying against a dead port.
require('./utils/ensureRedis')();

const SocketService = require('./services/common/SocketService');
const errorHandler = require('./middleware/errorHandler');
const recovery = require('./startup/recovery');
const videoRoutes = require('./routes/videos');
const courseRoutes = require('./routes/courses');
const courseVideoRoutes = require('./routes/courseVideos');
const voiceRoutes = require('./routes/voices');
const audioRoutes = require('./routes/audio');
const ttsRoutes = require('./routes/tts');
const imageRoutes = require('./routes/images');
const jobRoutes = require('./routes/jobs');
const assetRoutes = require('./routes/assets');
const analyticsRoutes = require('./routes/analytics');
const logsRoutes = require('./routes/logs');
const aiServicesRoutes = require('./routes/aiServices');
const systemWorkerRoutes = require('./routes/systemWorkers');
const publishingRoutes = require('./routes/publishing');

// Binding to anything outside this set exposes an unauthenticated API to
// the network - see the warning at listen() below.
const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '::1']);

const app = express();
const server = http.createServer(app);

// Behind nginx / the Tailscale or Cloudflare tunnel, req.ip is the proxy
// unless Express is told to trust X-Forwarded-For - without this every
// client shares one rate-limit bucket. One hop (the nginx container) only.
if (config.isProd) app.set('trust proxy', 1);

// ── Security Middleware ──────────────────────────────────────────────────────
// Swagger UI's bundled HTML relies on inline scripts/styles, which helmet's
// default Content-Security-Policy blocks - skip the CSP-bearing default
// helmet() for /api-docs and apply a CSP-free helmet() there instead (still
// keeps the other security headers, just not the policy that'd break the UI).
app.use((req, res, next) => {
  if (req.path.startsWith('/api-docs')) return next();
  return helmet()(req, res, next);
});
app.use('/api-docs', helmet({ contentSecurityPolicy: false }));
app.use(
  cors({
    origin(origin, callback) {
      // Allow non-browser requests (no Origin header, e.g. curl/health checks)
      if (!origin || config.cors.origins.includes(origin)) {
        return callback(null, true);
      }
      return callback(new Error(`Origin ${origin} not allowed by CORS`));
    },
    credentials: true,
  })
);

// ── Rate Limiting ────────────────────────────────────────────────────────────
// Scoped to /api only - applying this globally also throttled /public static
// media (course video audio/render files), which a single lesson page can
// legitimately request well past this budget just from normal <audio>/<video>
// playback (seeking, preloading, many scenes). Static asset requests that hit
// the limiter also skipped past the static middleware's cross-origin
// Cross-Origin-Resource-Policy header below, so a rate-limited audio request
// surfaced in the browser as a confusing NotSameOrigin block instead of a
// visible 429.
const limiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.max,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later' },
});
app.use('/api', limiter);

// ── Body Parsing ─────────────────────────────────────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ── HTTP Request Logging ─────────────────────────────────────────────────────
app.use(morgan('short', { stream: LoggerService.stream() }));

// ── Static Files ──────────────────────────────────────────────────────────────
// helmet's default Cross-Origin-Resource-Policy: same-origin would block the
// frontend dev server (different port/origin) from loading this media in
// <audio>/<video> tags, so relax it for routes serving cross-origin-embedded
// media.
//
// (No longer serving backend/jobs/ here - it's pure scratch space now, wiped
// after every job. Scene audio/render output are all served straight
// from MinIO instead - see StorageProvider.getPublicUrl.)

// Reference .wav files used for voice cloning - also served publicly so the
// frontend voice picker can play them back as preview samples.
const voicesDir = path.resolve(__dirname, '../voices');
app.use(
  '/voice-samples',
  express.static(voicesDir, {
    setHeaders: (res) => res.set('Cross-Origin-Resource-Policy', 'cross-origin'),
  })
);
LoggerService.info('Voice sample files configured', { path: voicesDir });

// ── Health / Readiness ───────────────────────────────────────────────────────
// /health = liveness only: the process is up and the event loop answers. It
// deliberately reveals nothing about the host (no pid/memory/platform/paths)
// and doesn't log, since Docker polls it every few seconds.
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

// Which build is running (stamped per deploy, see config/version.js). Under
// /api so the nginx proxy forwards it; no host details, so it is fine unauthenticated.
app.get('/api/version', (req, res) => {
  res.json(appVersion);
});

// /ready = can this instance actually serve requests (Mongo + Redis up)?
// Returns only per-dependency ok/down - no hostnames, URIs or error text.
app.get('/ready', async (req, res) => {
  const mongoose = require('mongoose');
  const videoQueue = require('./queues/videoQueue');
  const checks = { mongo: mongoose.connection.readyState === 1, redis: false };
  try {
    const client = await videoQueue.client;
    checks.redis = (await Promise.race([
      client.ping(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 2000)),
    ])) === 'PONG';
  } catch {
    checks.redis = false;
  }
  const ready = checks.mongo && checks.redis;
  res.status(ready ? 200 : 503).json({ status: ready ? 'ready' : 'degraded', checks });
});

// ── API Documentation ────────────────────────────────────────────────────────
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
app.get('/api-docs.json', (req, res) => res.json(swaggerSpec));

// ── API Routes ───────────────────────────────────────────────────────────────
app.use('/api/videos', videoRoutes);
app.use('/api/courses', courseRoutes);
app.use('/api/course-videos', courseVideoRoutes);
app.use('/api/voices', voiceRoutes);
app.use('/api/audio', audioRoutes);
app.use('/api/tts', ttsRoutes);
app.use('/api/images', imageRoutes);
app.use('/api/jobs', jobRoutes);
app.use('/api/assets', assetRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/logs', logsRoutes);
app.use('/api/system/ai-services', aiServicesRoutes);
app.use('/api/system/workers', systemWorkerRoutes);
app.use('/api/publishing', publishingRoutes);

// ── 404 Handler ──────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found', path: req.originalUrl });
});

// ── Global Error Handler ─────────────────────────────────────────────────────
app.use(errorHandler);

// ── Start Server ─────────────────────────────────────────────────────────────
async function startServer() {
  try {
    const { connectDatabase } = require('./config/database');
    await connectDatabase();
    SocketService.init(server);
    SocketService.initRedis();
    await recovery.reapOrphanedAudioGenerations();
    await recovery.reapStuckVideoJobs();
    await recovery.recoverStrandedRetries();
    setInterval(() => {
      recovery.recoverStrandedRetries().catch((err) => LoggerService.warn('Retry sweep failed', { error: err.message }));
    }, recovery.RETRY_SWEEP_MS).unref();
    await recovery.reapStuckCourseVideoJobs();
    await recovery.healCancelledStageStatuses();

    // Bound explicitly rather than relying on listen(port)'s implicit
    // all-interfaces default, so the exposure is a visible decision.
    if (!LOOPBACK_HOSTS.has(config.host)) {
      LoggerService.warn(
        `Listening on ${config.host} - this API has no authentication (middleware/auth.js is a pass-through stub), so anything that can reach port ${config.port} can drive it. Intended for a trusted LAN only; set HOST=127.0.0.1 to restrict it to this machine.`
      );
    }

    server.listen(config.port, config.host, () => {
      LoggerService.border('🚀 VIREON AI SERVER STARTING', 'event');
      LoggerService.info('Server initialized', {
        port: config.port,
        environment: config.nodeEnv,
        version: appVersion.version,
        commit: appVersion.commit,
        pid: process.pid,
      });
      console.log(`\n  \x1b[32m➜\x1b[0m  \x1b[1mLocal:\x1b[0m    \x1b[4;36mhttp://localhost:${config.port}\x1b[0m`);
      console.log(`  \x1b[32m➜\x1b[0m  \x1b[1mHealth:\x1b[0m  \x1b[4;36mhttp://localhost:${config.port}/health\x1b[0m`);
      console.log(`  \x1b[32m➜\x1b[0m  \x1b[1mAPI:\x1b[0m     \x1b[4;36mhttp://localhost:${config.port}/api\x1b[0m`);
      console.log(`  \x1b[32m➜\x1b[0m  \x1b[1mDocs:\x1b[0m    \x1b[4;36mhttp://localhost:${config.port}/api-docs\x1b[0m`);
      console.log(`  \x1b[32m➜\x1b[0m  \x1b[1mEnv:\x1b[0m     \x1b[37m${config.nodeEnv}\x1b[0m`);
      console.log(`  \x1b[32m➜\x1b[0m  \x1b[1mVersion:\x1b[0m \x1b[37mv${appVersion.version}${appVersion.commit ? ` (${appVersion.commit})` : ''}\x1b[0m`);
      console.log();
    });
  } catch (err) {
    LoggerService.error('Failed to start server', { error: err.message });
    process.exit(1);
  }
}

// Graceful shutdown: stop accepting connections, let in-flight requests and
// socket clients drain, then exit. database.js separately closes Mongo on
// SIGINT. Hard-exits after 10s so a hung connection can't block `docker stop`.
let shuttingDown = false;
function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  LoggerService.info(`${signal} received - shutting down API`);
  setTimeout(() => process.exit(1), 10000).unref();
  server.close(async () => {
    try {
      await require('mongoose').connection.close();
    } catch {
      // already closed
    }
    process.exit(0);
  });
}
if (require.main === module) {
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

process.on('uncaughtException', (err) => {
  LoggerService.error('Uncaught exception', { error: err.message, stack: err.stack });
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  LoggerService.error('Unhandled rejection', { reason: reason?.message || reason });
});

if (require.main === module) {
  startServer();
}

module.exports = { app, server, startServer };