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
const LoggerService = require('./services/common/LoggerService');
const VideoService = require('./services/video/VideoService');
const { JOB_STATUS, VIDEO_STATUS, STAGE_STATUS, SOCKET_EVENTS } = require('./constants');

// Fire-and-forget: spawns a local redis-server if REDIS_HOST is localhost
// and nothing's listening there yet, so the queue connections below don't
// spend the next several minutes retrying against a dead port.
require('./utils/ensureRedis')();

const SocketService = require('./services/common/SocketService');
const errorHandler = require('./middleware/errorHandler');
const videoRoutes = require('./routes/videos');
const courseRoutes = require('./routes/courses');
const courseVideoRoutes = require('./routes/courseVideos');
const voiceRoutes = require('./routes/voices');
const audioRoutes = require('./routes/audio');
const jobRoutes = require('./routes/jobs');
const assetRoutes = require('./routes/assets');
const analyticsRoutes = require('./routes/analytics');
const logsRoutes = require('./routes/logs');
const aiServicesRoutes = require('./routes/aiServices');

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
app.use('/api/jobs', jobRoutes);
app.use('/api/assets', assetRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/logs', logsRoutes);
app.use('/api/system/ai-services', aiServicesRoutes);

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
// and the user can just regenerate instead of watching a stuck spinner. No
// queue to check here (there's no BullMQ job backing a synchronous request),
// so unlike the video/course sweeps below, every PENDING record found at
// boot is unconditionally orphaned. Marks records one at a time (rather than
// AudioGeneration.updateMany) and emits AUDIO_STUDIO_FAILED per record so a
// client still watching that job's socket room sees the same failure event
// audioController.generate's own catch block would have sent it.
async function reapOrphanedAudioGenerations() {
  const AudioGeneration = require('./models/AudioGeneration');
  const message = 'Generation was interrupted by a server restart. Please try again.';

  const stuck = await AudioGeneration.find({ status: 'PENDING' });
  for (const record of stuck) {
    record.status = 'FAILED';
    record.error = message;
    await record.save();
    SocketService.emitToJob(record._id, SOCKET_EVENTS.AUDIO_STUDIO_FAILED, { id: record._id, error: message });
  }

  if (stuck.length > 0) {
    LoggerService.warn(`Marked ${stuck.length} orphaned audio generation(s) as failed after restart`);
  }
}

// Video jobs run their entire pipeline (script -> audio -> avatar/images ->
// render -> upload) inside a single BullMQ job execution (see
// videoWorker/processor.js) that writes its current step to Mongo as it
// goes, purely for progress display. If the process hosting that execution
// dies (crash, restart, `ensureRedis` spinning up a fresh unpersisted local
// Redis) the Mongo doc is left pointing at whatever step it was on, with no
// guarantee BullMQ still has a matching job to resume it - so on every boot,
// for each job sitting in one of these transient "actively processing"
// statuses, check whether a live BullMQ job still backs it (active/waiting/
// delayed/paused all mean the worker will still pick it up normally) and
// only reap the ones that don't. Reaping means FAILED, not auto-retried -
// same reasoning as the audio sweep above: surface it as failed so the user
// can hit Restart Job (which already knows how to resume each of these
// statuses - see resumeLogic.js's getStepForResume) instead of it silently
// looking "in progress" forever.
const STUCK_VIDEO_STATUSES = [
  JOB_STATUS.QUEUED,
  JOB_STATUS.SCRIPT_GENERATION,
  JOB_STATUS.GENERATING_AUDIO,
  JOB_STATUS.GENERATING_AVATAR,
  JOB_STATUS.GENERATING_IMAGES,
  JOB_STATUS.PREPARING_ASSETS,
  JOB_STATUS.RENDERING,
  JOB_STATUS.UPLOADING,
];

async function reapStuckVideoJobs() {
  const VideoJob = require('./models/VideoJob');
  const videoQueue = require('./queues/videoQueue');
  const ActivityLogService = require('./services/common/ActivityLogService');

  const candidates = await VideoJob.find({ status: { $in: STUCK_VIDEO_STATUSES } });
  let reaped = 0;

  for (const job of candidates) {
    let liveJob;
    try {
      liveJob = await videoQueue.getJob(job._id);
    } catch (err) {
      LoggerService.warn('Could not check BullMQ state for stuck job during boot sweep', { jobId: job._id, error: err.message });
      continue;
    }

    if (liveJob) {
      const state = await liveJob.getState();
      if (['active', 'waiting', 'delayed', 'paused'].includes(state)) {
        continue; // Worker will still pick this up normally - not orphaned.
      }
      await liveJob.remove().catch(() => {});
    }

    const previousStatus = job.status;
    const failedJob = await VideoService.fail(
      job._id,
      'Job was interrupted by a server restart. Click Restart Job to resume.',
      previousStatus
    );
    SocketService.emitJobFailed(failedJob, failedJob.error.message);
    await ActivityLogService.add(job._id, `Interrupted by server restart while ${previousStatus} - marked failed`);
    reaped += 1;
  }

  if (reaped > 0) {
    LoggerService.warn(`Marked ${reaped} stuck video job(s) as failed after restart`);
  }
}

// Same problem as STUCK_VIDEO_STATUSES above, for course videos - each
// stage (script/audio/render) is a single BullMQ job execution (see
// courseVideoWorker.js) that can be interrupted mid-flight. Unlike
// videoQueue, courseQueue jobs aren't keyed by the video's id (see the
// `courseQueue.add(...)` call sites in courseVideoController.js - no
// `{ jobId }` option), so there's no direct getJob(videoId) lookup;
// instead this pulls every job BullMQ still considers live and matches on
// `job.data.videoId`. Maps each stuck status to the step label and
// per-stage field (scriptStatus/audioStatus/videoStatus) that
// retryStep/scriptPipeline/audioPipeline/renderPipeline already use, so a
// reaped video looks exactly like one that failed normally and Retry
// (retry.js's retryStep) picks it up the same way.
const STUCK_COURSE_VIDEO_STEP = {
  [VIDEO_STATUS.GENERATING_SCRIPT]: { step: 'Script Generation', stageField: 'scriptStatus' },
  [VIDEO_STATUS.GENERATING_AUDIO]: { step: 'Audio Generation', stageField: 'audioStatus' },
  [VIDEO_STATUS.GENERATING_SCENES]: { step: 'Rendering', stageField: 'videoStatus' },
  [VIDEO_STATUS.GENERATING_IMAGES]: { step: 'Rendering', stageField: 'videoStatus' },
  [VIDEO_STATUS.RENDERING_VIDEO]: { step: 'Rendering', stageField: 'videoStatus' },
  [VIDEO_STATUS.UPLOADING]: { step: 'Rendering', stageField: 'videoStatus' },
};

async function reapStuckCourseVideoJobs() {
  const CourseVideo = require('./models/CourseVideo');
  const courseQueue = require('./queues/courseQueue');
  const ActivityLogService = require('./services/common/ActivityLogService');

  const stuckStatuses = Object.keys(STUCK_COURSE_VIDEO_STEP);
  const candidates = await CourseVideo.find({ status: { $in: stuckStatuses } });
  if (candidates.length === 0) return;

  let liveVideoIds = new Set();
  try {
    const liveJobs = await courseQueue.getJobs(['active', 'waiting', 'delayed', 'paused'], 0, -1);
    liveVideoIds = new Set(liveJobs.map((j) => j.data?.videoId));
  } catch (err) {
    LoggerService.warn('Could not check BullMQ state for stuck course video jobs during boot sweep', { error: err.message });
    return;
  }

  let reaped = 0;
  for (const video of candidates) {
    if (liveVideoIds.has(video._id)) continue; // Worker will still pick this up normally - not orphaned.

    const { step, stageField } = STUCK_COURSE_VIDEO_STEP[video.status];
    const message = 'Video was interrupted by a server restart. Click Retry to resume.';

    video.status = VIDEO_STATUS.FAILED;
    video[stageField] = STAGE_STATUS.FAILED;
    video.error = {
      message,
      step,
      retryCount: video.error?.retryCount || 0,
    };
    await video.save();

    SocketService.emitCourseVideoFailed(video, message, step);
    await ActivityLogService.add(video._id, `Interrupted by server restart during ${step} - marked failed`);
    reaped += 1;
  }

  if (reaped > 0) {
    LoggerService.warn(`Marked ${reaped} stuck course video job(s) as failed after restart`);
  }
}

async function startServer() {
  try {
    const { connectDatabase } = require('./config/database');
    await connectDatabase();
    SocketService.init(server);
    SocketService.initRedis();
    await reapOrphanedAudioGenerations();
    await reapStuckVideoJobs();
    await reapStuckCourseVideoJobs();

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