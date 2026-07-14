const express = require('express');
const morgan = require('morgan');
const os = require('os');
const logger = require('./logger');

const app = express();
const PORT = process.env.PORT || 3000;

// ── Morgen HTTP request logger (streams into our custom logger) ──────────────
const stream = {
  write: (message) => {
    logger.http(message.trim());
  },
};

// Skip logging in test environments
const skip = () => process.env.NODE_ENV === 'test';

app.use(morgan(':method :url :status :res[content-length] - :response-time ms', {
  stream,
  skip,
}));

// ── Body parser ──────────────────────────────────────────────────────────────
app.use(express.json());

// ── Health Check Endpoint ────────────────────────────────────────────────────
app.get('/health', (req, res) => {
  const healthData = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: `${Math.floor(process.uptime())}s`,
    pid: process.pid,
    memory: {
      usage: `${(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2)} MB`,
      heapTotal: `${(process.memoryUsage().heapTotal / 1024 / 1024).toFixed(2)} MB`,
      rss: `${(process.memoryUsage().rss / 1024 / 1024).toFixed(2)} MB`,
    },
    cpu: {
      loadAvg: os.loadavg(),
      cpus: os.cpus().length,
    },
    platform: os.platform(),
    hostname: os.hostname(),
    nodeVersion: process.version,
    environment: process.env.NODE_ENV || 'development',
  };

  logger.border('🧠 HEALTH CHECK', 'success');
  logger.success('System is running smoothly', {
    status: healthData.status,
    uptime: healthData.uptime,
    memory: healthData.memory.usage,
    pid: healthData.pid,
    host: healthData.hostname,
  });

  res.status(200).json(healthData);
});

// ── 404 handler ──────────────────────────────────────────────────────────────
app.use((req, res) => {
  logger.warn(`Route not found: ${req.method} ${req.originalUrl}`);
  res.status(404).json({ error: 'Route not found', path: req.originalUrl });
});

// ── Global error handler ─────────────────────────────────────────────────────
app.use((err, req, res, _next) => {
  logger.error('Unhandled error', { message: err.message, stack: err.stack });
  res.status(500).json({ error: 'Internal server error' });
});

// ── Start server (only if not in test or module import) ──────────────────────
if (require.main === module) {
  app.listen(PORT, () => {
    logger.serverStart(PORT);
    logger.info('Server initialized', { port: PORT, env: process.env.NODE_ENV || 'development' });
  });
}

module.exports = app;
