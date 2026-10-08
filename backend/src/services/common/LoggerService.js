const winston = require('winston');
const Transport = require('winston-transport');
const Redis = require('ioredis');
const path = require('path');
const fs = require('fs');
const { AsyncLocalStorage } = require('async_hooks');
const config = require('../../config');
const { REDIS_CHANNEL } = require('../../constants');

const logDir = path.resolve(__dirname, '../../../logs');
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

const customLevels = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  debug: 4,
  tts: 5,
  llm: 6,
  render: 7,
  upload: 8,
};

const customColors = {
  error: 'red',
  warn: 'yellow',
  info: 'cyan',
  http: 'blue',
  debug: 'magenta',
  tts: 'green',
  llm: 'white',
  render: 'gray',
  upload: 'yellow',
};

winston.addColors(customColors);

// ─── Timestamps ─────────────────────────────────────────────────────────────
// The one place a log timestamp is produced: ISO-8601, millisecond precision,
// local wall-clock time WITH its UTC offset (2026-10-08T10:44:08.123+05:30).
// Every sink - console, log files, the Redis broadcast to the Live Logs page -
// uses it, so a line means the same instant wherever it is read, and it
// round-trips through `new Date(...)`. Other modules log through
// LoggerService instead of formatting their own.
function isoTimestamp(date = new Date()) {
  const pad = (n, width = 2) => String(n).padStart(width, '0');
  const offsetMin = -date.getTimezoneOffset();
  const sign = offsetMin >= 0 ? '+' : '-';
  const abs = Math.abs(offsetMin);
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${pad(date.getMilliseconds(), 3)}` +
    `${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`
  );
}

// ─── Per-job log context ────────────────────────────────────────────────────
// A job's pipeline runs through dozens of modules (LLM, TTS, ComfyUI, GPU
// lease, render, upload). Rather than threading jobId into every call, the
// worker runs a job inside LoggerService.runWithContext({ jobId }, ...) and
// every log line emitted anywhere in that async call chain picks it up here.
// A `jobId` in a call's own metadata always wins.
const contextStore = new AsyncLocalStorage();

const injectContext = winston.format((info) => {
  const ctx = contextStore.getStore();
  if (ctx) {
    for (const [key, value] of Object.entries(ctx)) {
      if (info[key] === undefined && value !== undefined) info[key] = value;
    }
  }
  return info;
})();

// `debug` is opt-in (LOG_LEVEL=debug): lock polling, lease state transitions
// and other low-level diagnostics stay out of the normal stream. The domain
// levels (tts/llm/render/upload) sit numerically below debug in this level
// table, so debug can't be gated by the level threshold alone.
const debugEnabled = String(process.env.LOG_LEVEL || '').toLowerCase() === 'debug';
const gateDebug = winston.format((info) => (info.level === 'debug' && !debugEnabled ? false : info))();

// ─── Live log broadcast (Frontend "Live Logs" page) ─────────────────────────
// Forwards a subset of log entries to Redis pub/sub, which SocketService (in
// the main server process) picks up and pushes to connected browser clients.
// Reuses the same channel/envelope as job-progress events. http/debug are
// excluded - too noisy to be useful in a pipeline-activity console.
const BROADCAST_LEVELS = new Set(['error', 'warn', 'info', 'tts', 'llm', 'render', 'upload']);

let logPublisher = null;
function getLogPublisher() {
  if (config.isTest) return null;
  if (logPublisher) return logPublisher;
  try {
    logPublisher = new Redis({
      host: config.redis.host,
      port: config.redis.port,
      maxRetriesPerRequest: null,
    });
  } catch {
    return null;
  }
  return logPublisher;
}

class SocketBroadcastTransport extends Transport {
  log(info, callback) {
    setImmediate(() => this.emit('logged', info));

    if (BROADCAST_LEVELS.has(info.level)) {
      const { level, message, timestamp, ...meta } = info;
      const publisher = getLogPublisher();
      if (publisher) {
        const payload = {
          type: 'serverLog',
          data: { level, message, timestamp: timestamp || isoTimestamp(), meta },
        };
        publisher.publish(REDIS_CHANNEL, JSON.stringify(payload)).catch(() => {});
      }
    }

    callback();
  }
}

// Console renders metadata as key=value pairs (logfmt) so a line is greppable
// and readable at a glance; the file transports keep the same fields as JSON.
const logfmtValue = (value) => {
  if (typeof value === 'string') return /[\s"=]/.test(value) || value === '' ? JSON.stringify(value) : value;
  return JSON.stringify(value);
};
const toLogfmt = (meta) =>
  Object.entries(meta)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => `${key}=${logfmtValue(value)}`)
    .join(' ');

const consoleFormat = winston.format.combine(
  winston.format.colorize({ all: true }),
  winston.format.printf(({ timestamp, level, message, jobId, ...meta }) => {
    const jobTag = jobId ? `[${jobId}] ` : '';
    const metaStr = Object.keys(meta).length ? ` ${toLogfmt(meta)}` : '';
    return `${timestamp} │ ${level} │ ${jobTag}${message}${metaStr}`;
  })
);

const logger = winston.createLogger({
  levels: customLevels,
  level: config.isDev ? 'upload' : 'info',
  // Shared by every transport (gate -> job context -> timestamp -> JSON);
  // the console transport re-renders it as one readable line below.
  format: winston.format.combine(
    gateDebug,
    injectContext,
    winston.format.timestamp({ format: () => isoTimestamp() }),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({
      filename: path.join(logDir, 'error.log'),
      level: 'error',
      maxsize: 10 * 1024 * 1024,
      maxFiles: 5,
    }),
    new winston.transports.File({
      filename: path.join(logDir, 'combined.log'),
      maxsize: 10 * 1024 * 1024,
      maxFiles: 10,
    }),
    new winston.transports.File({
      filename: path.join(logDir, 'llm.log'),
      level: 'llm',
      maxsize: 10 * 1024 * 1024,
      maxFiles: 5,
    }),
    new winston.transports.File({
      filename: path.join(logDir, 'tts.log'),
      level: 'tts',
      maxsize: 10 * 1024 * 1024,
      maxFiles: 5,
    }),
    new winston.transports.File({
      filename: path.join(logDir, 'render.log'),
      level: 'render',
      maxsize: 10 * 1024 * 1024,
      maxFiles: 5,
    }),
    new winston.transports.File({
      filename: path.join(logDir, 'upload.log'),
      level: 'upload',
      maxsize: 10 * 1024 * 1024,
      maxFiles: 5,
    }),
    new SocketBroadcastTransport({ level: 'upload' }),
  ],
});

if (config.isDev) {
  logger.add(
    new winston.transports.Console({
      format: consoleFormat,
      level: 'upload',
    })
  );
}

/**
 * Structured logger service following Single Responsibility.
 * Only handles logging concerns.
 */
class LoggerService {
  static info(message, meta = {}) {
    logger.info(message, meta);
  }

  static success(message, meta = {}) {
    logger.info(`✅ ${message}`, meta);
  }

  static warn(message, meta = {}) {
    logger.warn(message, meta);
  }

  static error(message, meta = {}) {
    logger.error(message, meta);
  }

  static debug(message, meta = {}) {
    logger.debug(message, meta);
  }

  static http(message, meta = {}) {
    logger.http(message, meta);
  }

  static tts(message, meta = {}) {
    logger.log('tts', message, meta);
  }

  static llm(message, meta = {}) {
    logger.log('llm', message, meta);
  }

  static render(message, meta = {}) {
    logger.log('render', message, meta);
  }

  static upload(message, meta = {}) {
    logger.log('upload', message, meta);
  }

  /**
   * Run `fn` with `ctx` (e.g. { jobId }) attached to every log line emitted
   * anywhere in its async call chain.
   */
  static runWithContext(ctx, fn) {
    return contextStore.run({ ...(contextStore.getStore() || {}), ...ctx }, fn);
  }

  static border(message, level = 'info') {
    const line = '═'.repeat(Math.min(message.length + 6, 60));
    const icon = level === 'success' ? '✅' : level === 'event' ? '📢' : 'ℹ️';
    console.log(`\n╔${line}╗`);
    console.log(`║   ${icon} ${message}   ║`);
    console.log(`╚${line}╝\n`);
  }

  static stream() {
    return {
      write: (message) => logger.http(message.trim()),
    };
  }
}

LoggerService.isoTimestamp = isoTimestamp;

module.exports = LoggerService;
