const net = require('net');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const config = require('../config');
const LoggerService = require('../services/common/LoggerService');

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

// `localhost` resolves to ::1 first on Windows/Node, but a Redis published by
// Docker (127.0.0.1:6379) only listens on IPv4. Probing a single family made a
// perfectly healthy Redis look "missing", so a second, native redis-server was
// spawned next to it and the workers ended up on a different Redis than the API.
// Always check both loopback families for `localhost`.
function hostsToProbe(host) {
  return host === 'localhost' ? ['127.0.0.1', '::1'] : [host];
}

async function isRedisReachable(host, port) {
  for (const candidate of hostsToProbe(host)) {
    if (await isPortOpen(candidate, port)) return true;
  }
  return false;
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

  // Production runs Redis in Docker and starts this process at logon, possibly
  // before Docker is up. Spawning a second Redis then splits the queue (API on
  // Docker's, workers on this one); BullMQ simply retries until Docker's comes up.
  if (process.env.REDIS_AUTOSTART === 'false') return;

  const { host, port } = config.redis;
  if (host !== 'localhost' && host !== '127.0.0.1') return;
  if (await isRedisReachable(host, port)) return;

  LoggerService.warn(`Redis not reachable at ${host}:${port} - starting local redis-server`);

  const dataDir = path.resolve(__dirname, '../../../.redis-data');
  fs.mkdirSync(dataDir, { recursive: true });

  let child;
  try {
    child = spawn(
      'redis-server',
      // Loopback only (both families): the default binds every interface, which
      // exposed an unauthenticated Redis to the whole LAN.
      ['--port', String(port), '--bind', '127.0.0.1', '-::1', '--dir', dataDir, '--logfile', 'redis.log'],
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
    if (await isRedisReachable(host, port)) {
      LoggerService.success(`Local redis-server started automatically (pid ${child.pid})`);
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  LoggerService.error('redis-server did not come up within 6s of starting it');
}

module.exports = ensureRedisRunning;
module.exports.hostsToProbe = hostsToProbe;
