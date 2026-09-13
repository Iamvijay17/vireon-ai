const { execFile } = require('child_process');
const { promisify } = require('util');
const axios = require('axios');
const config = require('../../config');
const LoggerService = require('../common/LoggerService');
const { ManagedProcess, parseCommand } = require('./processManager');
const { SERVICE_STATE, checkHealth, waitUntilHealthy } = require('./serviceHealth');

const execFileAsync = promisify(execFile);

const managed = new ManagedProcess('LM Studio');

// Concurrency guard (#11 in the spec): if job A, B and C all call
// ensureRunning() while LM Studio is still cold, only the first actually
// starts it - the rest just await this same promise instead of racing each
// other into duplicate `lms server start` calls.
let inFlightEnsure = null;

function cfg() {
  return config.localAI.lmStudio;
}

async function isRunning() {
  return checkHealth(cfg().healthUrl, { timeout: cfg().healthCheckTimeoutMs });
}

/**
 * LM Studio's server can be up with no model loaded (or a different one
 * loaded) - a chat-completions call would then fail even though the health
 * check above passed. `lms load` is idempotent enough for this purpose: it
 * no-ops quickly if the requested identifier is already loaded, so it's
 * safe to call on every ensureRunning(), not just right after a fresh
 * start.
 */
async function ensureModelLoaded() {
  const { cliPath, healthUrl } = cfg();
  const model = config.lmStudio.model;
  if (!model) return;

  try {
    const { data } = await axios.get(healthUrl, { timeout: cfg().healthCheckTimeoutMs });
    const loadedIds = Array.isArray(data?.data) ? data.data.map((m) => m.id) : [];
    if (loadedIds.includes(model)) return;
  } catch {
    // /v1/models itself failed - fall through and let `lms load` surface
    // the real error below.
  }

  LoggerService.lmstudio(`[AI SERVICE] Loading LM Studio model ${model}`);
  try {
    await execFileAsync(cliPath, ['load', model, '-y', '--identifier', model], {
      timeout: cfg().startupTimeoutMs,
      windowsHide: true,
    });
    LoggerService.lmstudio(`[AI SERVICE] LM Studio model ${model} loaded`);
  } catch (err) {
    throw new Error(`Failed to load LM Studio model "${model}": ${err.stderr || err.message}`);
  }
}

async function start() {
  const { startCommand } = cfg();
  const { command, args } = parseCommand(startCommand);
  LoggerService.lmstudio('[AI SERVICE] Starting LM Studio', { command: startCommand });
  managed.spawn({ command, args });
}

async function stop() {
  LoggerService.lmstudio('[AI SERVICE] Stopping LM Studio');
  return managed.stop();
}

/**
 * Lighter than stop(): frees the model's VRAM via `lms unload --all` while
 * leaving the server process itself running, so the next ensureRunning()
 * only pays a model-reload cost instead of a full cold process start. Used
 * by GPUResourceManager when releasing the GPU for another service.
 */
async function unload() {
  const { cliPath } = cfg();
  LoggerService.lmstudio('[AI SERVICE] Unloading LM Studio model to free GPU');
  try {
    await execFileAsync(cliPath, ['unload', '--all'], { timeout: 30000, windowsHide: true });
  } catch (err) {
    LoggerService.warn('[AI SERVICE] LM Studio unload failed (may already be unloaded)', { error: err.message });
  }
}

async function restart() {
  await stop();
  await start();
  return waitUntilReady();
}

async function waitUntilReady() {
  const { healthUrl, startupTimeoutMs, healthCheckIntervalMs, healthCheckTimeoutMs } = cfg();
  LoggerService.lmstudio('[AI SERVICE] Waiting for LM Studio');

  const ready = await waitUntilHealthy(healthUrl, {
    timeoutMs: startupTimeoutMs,
    intervalMs: healthCheckIntervalMs,
    timeout: healthCheckTimeoutMs,
  });

  if (!ready) {
    throw new Error(`LLM service failed to become ready after ${Math.round(startupTimeoutMs / 1000)} seconds.`);
  }

  await ensureModelLoaded();
  LoggerService.lmstudio('[AI SERVICE] LM Studio ready', { pid: managed.pid });
  return true;
}

/**
 * The single entry point every LM Studio caller (LMStudioService, video
 * jobs, curriculum generation) should call before making a request. Reuses
 * an already-running server untouched; only starts one when nothing
 * answers the health check.
 */
async function ensureRunning() {
  if (cfg().enabled === false) {
    return true;
  }

  LoggerService.lmstudio('[AI SERVICE] Checking LM Studio');

  if (await isRunning()) {
    LoggerService.lmstudio('[AI SERVICE] LM Studio already running');
    await ensureModelLoaded();
    return true;
  }

  if (cfg().autoStart === false) {
    throw new Error('LM Studio is not running and LM_STUDIO_AUTO_START=false - start it manually.');
  }

  if (inFlightEnsure) {
    return inFlightEnsure;
  }

  const startedAt = Date.now();
  inFlightEnsure = (async () => {
    try {
      await start();
      await waitUntilReady();
      LoggerService.lmstudio('[AI SERVICE] LM Studio startup complete', {
        durationMs: Date.now() - startedAt,
        pid: managed.pid,
      });
      return true;
    } catch (err) {
      LoggerService.error('[AI SERVICE] LM Studio failed to start', { error: err.message });
      throw err;
    } finally {
      inFlightEnsure = null;
    }
  })();

  return inFlightEnsure;
}

async function getStatus() {
  const url = cfg().healthUrl;
  let state;

  if (inFlightEnsure) {
    state = SERVICE_STATE.STARTING;
  } else if (await isRunning()) {
    state = SERVICE_STATE.READY;
  } else if (managed.isAlive()) {
    state = SERVICE_STATE.UNHEALTHY;
  } else if (managed.lastError) {
    state = SERVICE_STATE.FAILED;
  } else {
    state = SERVICE_STATE.STOPPED;
  }

  return {
    status: state,
    pid: managed.pid,
    url,
    lastChecked: new Date().toISOString(),
    lastError: managed.lastError,
  };
}

module.exports = {
  ensureRunning,
  isRunning,
  start,
  stop,
  restart,
  unload,
  waitUntilReady,
  getStatus,
  // Exposes the underlying ManagedProcess so GPUResourceManager can listen
  // for an unexpected exit (crash) and force-release this service's slot.
  process: managed,
};
