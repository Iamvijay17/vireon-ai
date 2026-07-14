const express = require('express');
const http = require('http');
const morgan = require('morgan');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const config = require('./config');
const LoggerService = require('./services/LoggerService');
const SocketService = require('./services/SocketService');
const errorHandler = require('./middleware/errorHandler');
const authRoutes = require('./routes/auth');
const videoRoutes = require('./routes/videos');

const app = express();
const server = http.createServer(app);

// ── Security Middleware ──────────────────────────────────────────────────────
app.use(helmet());
app.use(cors({ origin: config.cors.origin, credentials: true }));

// ── Rate Limiting ────────────────────────────────────────────────────────────
const limiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.max,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later' },
});
app.use(limiter);

// ── Body Parsing ─────────────────────────────────────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ── HTTP Request Logging ─────────────────────────────────────────────────────
app.use(morgan('short', { stream: LoggerService.stream() }));

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

// ── API Routes ───────────────────────────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/videos', videoRoutes);

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
