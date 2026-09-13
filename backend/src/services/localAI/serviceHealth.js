const axios = require('axios');

/**
 * The five states an AI service can be in, as returned by
 * LocalAIService.getStatus/the /api/system/ai-services dashboard endpoint.
 */
const SERVICE_STATE = Object.freeze({
  STOPPED: 'stopped',
  STARTING: 'starting',
  READY: 'ready',
  UNHEALTHY: 'unhealthy',
  FAILED: 'failed',
});

/**
 * Single health-check attempt against a service's HTTP endpoint. Any 2xx-4xx
 * response counts as "the process is up and answering" (a 404 on the wrong
 * path still proves the server itself is alive) - only a connection
 * failure/timeout/5xx counts as not healthy.
 */
async function checkHealth(url, { timeout = 3000 } = {}) {
  if (!url) return false;
  try {
    const res = await axios.get(url, { timeout, validateStatus: () => true });
    return res.status < 500;
  } catch {
    return false;
  }
}

/**
 * Polls checkHealth until it succeeds or timeoutMs elapses. Used by each
 * manager's waitUntilReady() right after spawning the process.
 */
async function waitUntilHealthy(url, { timeoutMs, intervalMs = 2000, timeout = 3000 } = {}) {
  const deadline = Date.now() + timeoutMs;
  do {
    if (await checkHealth(url, { timeout })) return true;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  } while (Date.now() < deadline);
  return false;
}

module.exports = { SERVICE_STATE, checkHealth, waitUntilHealthy };
