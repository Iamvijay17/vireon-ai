const axios = require('axios');
const config = require('../../config');
const LoggerService = require('../common/LoggerService');
const { ManagedProcess, parseCommand } = require('./processManager');
const { SERVICE_STATE, checkHealth, waitUntilHealthy } = require('./serviceHealth');

/**
 * Ollama counterpart to lmStudioManager.js - same exported surface, so
 * localAI/index.js can register whichever one LLM_PROVIDER selects as the
 * GPU 'llm' slot. Differences from LM Studio:
 * - Model load/unload goes through the HTTP API (/api/ps, /api/generate
 *   with keep_alive) instead of a CLI.
 * - On Windows the tray app usually has `ollama serve` running already, so
 *   start() is only a fallback for when nothing answers the health check.
 */
const managed = new ManagedProcess('Ollama');

// Same concurrency guard as lmStudioManager: concurrent ensureRunning()
// calls while Ollama is cold share one start instead of racing.
let inFlightEnsure = null;

function cfg() {
  return config.localAI.ollama;
}

async function isRunning() {
  return checkHealth(cfg().healthUrl, { timeout: cfg().healthCheckTimeoutMs });
}

async function listLoadedModels() {
  const { data } = await axios.get(`${config.ollama.url}/api/ps`, { timeout: cfg().healthCheckTimeoutMs });
  return Array.isArray(data?.models) ? data.models.map((m) => m.model || m.name) : [];
}

/**
 * Ollama loads a model lazily on the first request, which would count the
 * whole disk->VRAM load against that request's generation timeout. Preload
 * it here instead (an /api/generate with no prompt just loads), with the
 * same num_ctx LLMService sends - a different num_ctx would make Ollama
 * reload the model on the first real call anyway.
 */
async function ensureModelLoaded() {
  const { model, numCtx, keepAlive, url } = config.ollama;
  if (!model) return;

  try {
    if ((await listLoadedModels()).includes(model)) return;
  } catch {
    // /api/ps failed - fall through and let the load surface the real error.
  }

  LoggerService.lmstudio(`[AI SERVICE] Loading Ollama model ${model}`);
  try {
    await axios.post(
      `${url}/api/generate`,
      { model, keep_alive: keepAlive, options: { num_ctx: numCtx } },
      { timeout: cfg().modelLoadTimeoutMs }
    );
    LoggerService.lmstudio(`[AI SERVICE] Ollama model ${model} loaded`);
  } catch (err) {
    const detail = err.response?.data?.error || err.message;
    throw new Error(`Failed to load Ollama model "${model}": ${detail}`);
  }
}

async function start() {
  const { startCommand } = cfg();
  const { command, args } = parseCommand(startCommand);
  LoggerService.lmstudio('[AI SERVICE] Starting Ollama', { command: startCommand });
  managed.spawn({ command, args });
}

async function stop() {
  LoggerService.lmstudio('[AI SERVICE] Stopping Ollama');
  // Only kills a server this backend spawned itself - a tray-app-owned
  // server is left alone, so unload first to free VRAM either way.
  await unload();
  return managed.stop();
}

/**
 * Frees VRAM (keep_alive:0 evicts immediately) while leaving the server up,
 * so the next ensureRunning() only pays a model reload. Unloads everything
 * /api/ps reports, not just the configured model, so a model loaded some
 * other way (e.g. `ollama run` in a terminal) doesn't starve TTS/ComfyUI.
 */
async function unload() {
  LoggerService.lmstudio('[AI SERVICE] Unloading Ollama model(s) to free GPU');
  try {
    const loaded = await listLoadedModels();
    await Promise.all(
      loaded.map((model) =>
        axios.post(`${config.ollama.url}/api/generate`, { model, keep_alive: 0 }, { timeout: 30000 })
      )
    );
  } catch (err) {
    LoggerService.warn('[AI SERVICE] Ollama unload failed (may already be unloaded)', { error: err.message });
  }
}

async function restart() {
  await stop();
  await start();
  return waitUntilReady();
}

async function waitUntilReady() {
  const { healthUrl, startupTimeoutMs, healthCheckIntervalMs, healthCheckTimeoutMs } = cfg();
  LoggerService.lmstudio('[AI SERVICE] Waiting for Ollama');

  const ready = await waitUntilHealthy(healthUrl, {
    timeoutMs: startupTimeoutMs,
    intervalMs: healthCheckIntervalMs,
    timeout: healthCheckTimeoutMs,
  });

  if (!ready) {
    throw new Error(`LLM service failed to become ready after ${Math.round(startupTimeoutMs / 1000)} seconds.`);
  }

  await ensureModelLoaded();
  LoggerService.lmstudio('[AI SERVICE] Ollama ready', { pid: managed.pid });
  return true;
}

async function ensureRunning() {
  if (cfg().enabled === false) {
    return true;
  }

  LoggerService.lmstudio('[AI SERVICE] Checking Ollama');

  if (await isRunning()) {
    LoggerService.lmstudio('[AI SERVICE] Ollama already running');
    await ensureModelLoaded();
    return true;
  }

  if (cfg().autoStart === false) {
    throw new Error('Ollama is not running and OLLAMA_AUTO_START=false - start it manually.');
  }

  if (inFlightEnsure) {
    return inFlightEnsure;
  }

  const startedAt = Date.now();
  inFlightEnsure = (async () => {
    try {
      await start();
      await waitUntilReady();
      LoggerService.lmstudio('[AI SERVICE] Ollama startup complete', {
        durationMs: Date.now() - startedAt,
        pid: managed.pid,
      });
      return true;
    } catch (err) {
      LoggerService.error('[AI SERVICE] Ollama failed to start', { error: err.message });
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
    provider: 'ollama',
    model: config.ollama.model,
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
