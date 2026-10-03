const config = require('../../config');
const LoggerService = require('../common/LoggerService');
const { ManagedProcess, parseCommand } = require('./processManager');
const { SERVICE_STATE, checkHealth, waitUntilHealthy } = require('./serviceHealth');

/**
 * Process manager for ComfyUI, the scene-image generator (services/image/
 * does the actual generating over its HTTP API). No ComfyUI install ships
 * with this project: until you install it and set COMFYUI_ENABLED=true (plus
 * COMFYUI_START_COMMAND/COMFYUI_WORKDIR if Vireon should launch it, and
 * COMFYUI_CHECKPOINT - see backend/workflows/README.md), `enabled` is false
 * and ensureRunning() below is a no-op, same as for any other disabled
 * service. With it off, scenes that wanted an image render as text-only.
 */
const managed = new ManagedProcess('ComfyUI');
let inFlightEnsure = null;

function cfg() {
  return config.localAI.comfyUI;
}

async function isRunning() {
  return checkHealth(cfg().healthUrl, { timeout: cfg().healthCheckTimeoutMs });
}

async function start() {
  const { startCommand, workdir } = cfg();
  if (!startCommand) {
    throw new Error(
      'ComfyUI is not configured - set COMFYUI_ENABLED=true and COMFYUI_START_COMMAND/COMFYUI_WORKDIR in .env once it is installed, or start it manually.'
    );
  }

  const { command, args } = parseCommand(startCommand);
  LoggerService.info('[AI SERVICE] Starting ComfyUI', { command: startCommand, cwd: workdir });
  managed.spawn({ command, args, cwd: workdir || undefined });
}

async function stop() {
  LoggerService.info('[AI SERVICE] Stopping ComfyUI');
  return managed.stop();
}

/**
 * Hand the card back. ComfyUI keeps checkpoints resident between jobs, and it is
 * often started by hand rather than by us (so stop() below would do nothing) -
 * asking it to free its models first is what actually returns the VRAM before TTS
 * loads. Best effort: an unreachable server has nothing loaded anyway.
 */
async function freeModels() {
  const apiUrl = config.imageGen.apiUrl;
  try {
    const axios = require('axios');
    await axios.post(`${apiUrl}/free`, { unload_models: true, free_memory: true }, { timeout: 10000 });
    LoggerService.info('[AI SERVICE] ComfyUI models freed');
  } catch (err) {
    LoggerService.warn('[AI SERVICE] Could not ask ComfyUI to free its models', { error: err.message });
  }
}

async function unload() {
  await freeModels();
  return stop();
}

async function restart() {
  await stop();
  await start();
  return waitUntilReady();
}

async function waitUntilReady() {
  const { healthUrl, startupTimeoutMs, healthCheckIntervalMs, healthCheckTimeoutMs } = cfg();
  LoggerService.info('[AI SERVICE] Waiting for ComfyUI');

  const ready = await waitUntilHealthy(healthUrl, {
    timeoutMs: startupTimeoutMs,
    intervalMs: healthCheckIntervalMs,
    timeout: healthCheckTimeoutMs,
  });

  if (!ready) {
    throw new Error(`ComfyUI failed to become ready after ${Math.round(startupTimeoutMs / 1000)} seconds.`);
  }

  LoggerService.info('[AI SERVICE] ComfyUI ready', { pid: managed.pid });
  return true;
}

async function ensureRunning() {
  if (cfg().enabled === false) {
    return true;
  }

  LoggerService.info('[AI SERVICE] Checking ComfyUI');

  if (await isRunning()) {
    LoggerService.info('[AI SERVICE] ComfyUI already running');
    return true;
  }

  if (cfg().autoStart === false) {
    throw new Error('ComfyUI is not running and COMFYUI_AUTO_START=false - start it manually.');
  }

  if (inFlightEnsure) {
    return inFlightEnsure;
  }

  const startedAt = Date.now();
  inFlightEnsure = (async () => {
    try {
      await start();
      await waitUntilReady();
      LoggerService.info('[AI SERVICE] ComfyUI startup complete', {
        durationMs: Date.now() - startedAt,
        pid: managed.pid,
      });
      return true;
    } catch (err) {
      LoggerService.error('[AI SERVICE] ComfyUI failed to start', { error: err.message });
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

  if (cfg().enabled === false) {
    state = SERVICE_STATE.STOPPED;
  } else if (inFlightEnsure) {
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
  process: managed,
};
