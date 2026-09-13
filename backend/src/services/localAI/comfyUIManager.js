const config = require('../../config');
const LoggerService = require('../common/LoggerService');
const { ManagedProcess, parseCommand } = require('./processManager');
const { SERVICE_STATE, checkHealth, waitUntilHealthy } = require('./serviceHealth');

/**
 * NOT wired to a real install - no ComfyUI was found on this machine and
 * nothing in this codebase generates images via ComfyUI yet (see the
 * comment on config.localAI.comfyUI). This manager exists so
 * GPUResourceManager has a slot to sequence image generation against the
 * moment you do install ComfyUI and set COMFYUI_ENABLED=true plus
 * COMFYUI_START_COMMAND/COMFYUI_WORKDIR - until then `enabled` is false and
 * ensureRunning() below is a no-op, same as it would be for any other
 * disabled service.
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

async function unload() {
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
