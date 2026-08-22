const express = require('express');
const http = require('http');
const morgan = require('morgan');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const path = require('path');
const swaggerUi = require('swagger-ui-express');
const config = require('./config');
const swaggerSpec = require('./config/swagger');
const LoggerService = require('./services/LoggerService');

// Fire-and-forget: spawns a local redis-server if REDIS_HOST is localhost
// and nothing's listening there yet, so the queue connections below don't
// spend the next several minutes retrying against a dead port.
require('./utils/ensureRedis')();

const SocketService = require('./services/SocketService');
const errorHandler = require('./middleware/errorHandler');
const videoRoutes = require('./routes/videos');
const courseRoutes = require('./routes/courses');
const courseVideoRoutes = require('./routes/courseVideos');
const voiceRoutes = require('./routes/voices');
const audioRoutes = require('./routes/audio');
const analyticsRoutes = require('./routes/analytics');
const logsRoutes = require('./routes/logs');

const app = express();
const server = http.createServer(app);

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
// after every job. Scene audio/avatar/render output are all served straight
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

// ── Health Check ─────────────────────────────────────────────────────────────
app.get('/health', (req, res) => {
  const healthData = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: `${Math.floor(process.uptime())}s`,
    pid: process.pid,
    memory: `${(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2)} MB`,
    platform: process.platform,
    nodeVersion: process.version,
    environment: config.nodeEnv,
  };

  LoggerService.border('🧠 HEALTH CHECK', 'success');
  LoggerService.success('System is running smoothly', {
    uptime: healthData.uptime,
    memory: healthData.memory,
    pid: healthData.pid,
  });

  res.status(200).json(healthData);
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
app.use('/api/analytics', analyticsRoutes);
app.use('/api/logs', logsRoutes);

// ── 404 Handler ──────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found', path: req.originalUrl });
});

// ── Global Error Handler ─────────────────────────────────────────────────────
app.use(errorHandler);

// ── Start Server ─────────────────────────────────────────────────────────────
// Audio Studio generation (backend/src/controllers/audioController.js) is
// fully synchronous per-request, not queued like video jobs - so a record
// left in PENDING status can only mean the process died mid-generation
// (crash, restart, nodemon reload) while a client was waiting on it. Nothing
// resumes it, so it would otherwise sit there forever looking "in progress".
// Sweep those into FAILED on every boot so the history list reflects reality
// and the user can just regenerate instead of watching a stuck spinner.
async function reapOrphanedAudioGenerations() {
  const AudioGeneration = require('./models/AudioGeneration');
  const result = await AudioGeneration.updateMany(
    { status: 'PENDING' },
    { $set: { status: 'FAILED', error: 'Generation was interrupted by a server restart. Please try again.' } }
  );
  if (result.modifiedCount > 0) {
    LoggerService.warn(`Marked ${result.modifiedCount} orphaned audio generation(s) as failed after restart`);
  }
}

async function startServer() {
  try {
    const { connectDatabase } = require('./config/database');
    await connectDatabase();
    await reapOrphanedAudioGenerations();
    SocketService.init(server);
    SocketService.initRedis();

    server.listen(config.port, () => {
      LoggerService.border('🚀 VIREON AI SERVER STARTING', 'event');
      LoggerService.info('Server initialized', {
        port: config.port,
        environment: config.nodeEnv,
        pid: process.pid,
      });
      console.log(`\n  \x1b[32m➜\x1b[0m  \x1b[1mLocal:\x1b[0m    \x1b[4;36mhttp://localhost:${config.port}\x1b[0m`);
      console.log(`  \x1b[32m➜\x1b[0m  \x1b[1mHealth:\x1b[0m  \x1b[4;36mhttp://localhost:${config.port}/health\x1b[0m`);
      console.log(`  \x1b[32m➜\x1b[0m  \x1b[1mAPI:\x1b[0m     \x1b[4;36mhttp://localhost:${config.port}/api\x1b[0m`);
      console.log(`  \x1b[32m➜\x1b[0m  \x1b[1mDocs:\x1b[0m    \x1b[4;36mhttp://localhost:${config.port}/api-docs\x1b[0m`);
      console.log(`  \x1b[32m➜\x1b[0m  \x1b[1mEnv:\x1b[0m     \x1b[37m${config.nodeEnv}\x1b[0m`);
      console.log();
    });
  } catch (err) {
    LoggerService.error('Failed to start server', { error: err.message });
    process.exit(1);
  }
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