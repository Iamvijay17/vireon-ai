const winston = require('winston');
const path = require('path');
const fs = require('fs');
const config = require('../config');

const logDir = path.resolve(__dirname, '../../logs');
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
  lmstudio: 6,
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
  lmstudio: 'white',
  render: 'gray',
  upload: 'yellow',
};

winston.addColors(customColors);

const consoleFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.colorize({ all: true }),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    const metaStr = Object.keys(meta).length ? `\n  ${JSON.stringify(meta, null, 2)}` : '';
    return `${timestamp} │ ${level} │ ${message}${metaStr}`;
  })
);

const fileFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.json()
);

const logger = winston.createLogger({
  levels: customLevels,
  level: config.isDev ? 'upload' : 'info',
  format: fileFormat,
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
      filename: path.join(logDir, 'lmstudio.log'),
      level: 'lmstudio',
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

  static lmstudio(message, meta = {}) {
    logger.log('lmstudio', message, meta);
  }

  static render(message, meta = {}) {
    logger.log('render', message, meta);
  }

  static upload(message, meta = {}) {
    logger.log('upload', message, meta);
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

module.exports = LoggerService;
