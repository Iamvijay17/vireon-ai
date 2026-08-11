const net = require('net');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const config = require('../config');
const LoggerService = require('../services/LoggerService');

function isPortOpen(host, port, timeout = 500) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port });
    const finish = (result) => {
      socket.removeAllListeners();
      socket.destroy();
      resolve(result);
    };
    socket.setTimeout(timeout, () => finish(false));
    socket.once('error', () => finish(false));
    socket.once('connect', () => finish(true));
  });
}

let ensured = false;

/**
 * Dev convenience: if REDIS_HOST points at localhost and nothing is
 * listening there, spawn `redis-server` ourselves instead of leaving BullMQ
 * to spam ECONNREFUSED forever. No-ops against a remote/managed host (e.g.
 * REDIS_HOST=redis in docker-compose) - that's not this process's to start.
 * Fire-and-forget is intentional: ioredis's own retry backoff (capped at
 * 2s) gives this plenty of time to spawn redis-server before callers need
 * a working connection, so nothing here needs to block module load.
 */
async function ensureRedisRunning() {
  if (ensured) return;
  ensured = true;

  const { host, port } = config.redis;
  if (host !== 'localhost' && host !== '127.0.0.1') return;
  if (await isPortOpen(host, port)) return;

  LoggerService.warn(`Redis not reachable at ${host}:${port} - starting local redis-server`);

  const dataDir = path.resolve(__dirname, '../../../.redis-data');
  fs.mkdirSync(dataDir, { recursive: true });

  let child;
  try {
    child = spawn(
      'redis-server',
      ['--port', String(port), '--dir', dataDir, '--logfile', 'redis.log'],
      { cwd: dataDir, detached: true, stdio: 'ignore', windowsHide: true }
    );
  } catch (err) {
    LoggerService.error('Failed to spawn redis-server automatically - install Redis and ensure it is on PATH', { error: err.message });
    return;
  }

  child.on('error', (err) => {
    LoggerService.error('Failed to spawn redis-server automatically - install Redis and ensure it is on PATH', { error: err.message });
  });
  // Detached + unref'd so redis-server outlives this process (e.g. worker
  // restarts under --watch) instead of dying with it.
  child.unref();

  for (let i = 0; i < 20; i++) {
    if (await isPortOpen(host, port)) {
      LoggerService.success(`Local redis-server started automatically (pid ${child.pid})`);
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  LoggerService.error('redis-server did not come up within 6s of starting it');
}

module.exports = ensureRedisRunning;
