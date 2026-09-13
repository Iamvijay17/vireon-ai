const path = require('path');
const config = require('../../config');
const LoggerService = require('../common/LoggerService');
const { ManagedProcess, parseCommand } = require('./processManager');
const { SERVICE_STATE, checkHealth, waitUntilHealthy } = require('./serviceHealth');

const managed = new ManagedProcess('Qwen3-TTS');

// Same in-flight-promise concurrency guard as lmStudioManager - see there
// for why (#11 in the spec: only one caller actually starts the process).
let inFlightEnsure = null;

function cfg() {
  return config.localAI.tts;
}

async function isRunning() {
  return checkHealth(cfg().healthUrl, { timeout: cfg().healthCheckTimeoutMs });
}

async function start() {
  const { startCommand, workdir, ffmpegPath } = cfg();
  if (!startCommand) {
    // Pinokio may only be the launcher, but this repo has no way to know
    // *which* Pinokio app folder/venv holds Qwen3-TTS on an arbitrary
    // machine - see config/index.js's comment. Fail loudly with the exact
    // fix instead of silently doing nothing.
    throw new Error(
      'TTS_START_COMMAND is not configured - set TTS_START_COMMAND and TTS_WORKDIR in .env to the Qwen3-TTS venv python.exe and app.py (see the Pinokio app\'s install.json/pinokio.js for the exact paths), or start Qwen3-TTS manually via Pinokio.'
    );
  }

  const { command, args } = parseCommand(startCommand);
  LoggerService.tts('[AI SERVICE] Starting Qwen3-TTS', { command: startCommand, cwd: workdir });
  managed.spawn({
    command,
    args,
    cwd: workdir || undefined,
    env: {
      ...(ffmpegPath ? { PATH: `${ffmpegPath}${path.delimiter}${process.env.PATH || ''}` } : {}),
      // Model weights auto-download through HF's Xet transfer backend on
      // first use - confirmed live (~/.cache/huggingface/hub has only a
      // stub refs/main for every Qwen3-TTS model, no snapshots/blobs) that
      // Xet's adaptive-concurrency logs show a struggling connection on
      // this machine, and every generation call silently hangs forever
      // inside that auto-download instead of erroring. Force the plain
      // HTTP downloader instead.
      HF_HUB_DISABLE_XET: '1',
    },
    // See processManager.js's ManagedProcess.spawn doc comment - a hidden
    // console window crashed this specific process's native runtime
    // mid-generation. Confirmed live via the "forrtl: error (200)" crash.
    windowsHide: false,
  });
}

async function stop() {
  LoggerService.tts('[AI SERVICE] Stopping Qwen3-TTS');
  return managed.stop();
}

/**
 * A Gradio app has no "unload model, keep server up" operation the way
 * LM Studio's CLI does - the only way to actually free its VRAM is to kill
 * the process. Aliased so GPUResourceManager can call unload() uniformly
 * across every registered service.
 */
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
  LoggerService.tts('[AI SERVICE] Waiting for TTS');

  const ready = await waitUntilHealthy(healthUrl, {
    timeoutMs: startupTimeoutMs,
    intervalMs: healthCheckIntervalMs,
    timeout: healthCheckTimeoutMs,
  });

  if (!ready) {
    throw new Error(`TTS service failed to become ready after ${Math.round(startupTimeoutMs / 1000)} seconds.`);
  }

  LoggerService.tts('[AI SERVICE] TTS ready', { pid: managed.pid });
  return true;
}

/**
 * The single entry point every TTS caller (sceneSynthesis, standaloneSynthesis
 * / Audio Studio) should call before connecting the Gradio client. Reuses an
 * already-running Qwen3-TTS server untouched; only starts one when nothing
 * answers the health check.
 */
async function ensureRunning() {
  if (cfg().enabled === false) {
    return true;
  }

  LoggerService.tts('[AI SERVICE] Checking TTS');

  // Trust our own tracked child before hitting the network. Qwen3-TTS's
  // Gradio server answers "/" fine while idle, but its single Python
  // process can go unresponsive to ANY request - including this health
  // check - while it's synchronously busy loading the model onto the GPU
  // or running an inference (confirmed live: healthCheckTimeoutMs=5s health
  // checks timed out mid-generation on 2026-09-13, making ensureRunning()
  // believe the service was down and spawn a SECOND process that fought the
  // first over the same 6GB GPU - both then crashed together, see
  // "[GPU] tts process crashed" at 14:01:48 and 15:08:59 in tts logs). A
  // live tracked PID means the process we started is still up no matter how
  // slow it is to answer right now, so skip the HTTP round trip entirely.
  if (managed.isAlive()) {
    LoggerService.tts('[AI SERVICE] TTS already running', { pid: managed.pid });
    return true;
  }

  if (await isRunning()) {
    LoggerService.tts('[AI SERVICE] TTS already running');
    return true;
  }

  if (cfg().autoStart === false) {
    throw new Error('Qwen3-TTS is not running and TTS_AUTO_START=false - start it manually via Pinokio.');
  }

  if (inFlightEnsure) {
    return inFlightEnsure;
  }

  const startedAt = Date.now();
  inFlightEnsure = (async () => {
    try {
      await start();
      await waitUntilReady();
      LoggerService.tts('[AI SERVICE] TTS startup complete', {
        durationMs: Date.now() - startedAt,
        pid: managed.pid,
      });
      return true;
    } catch (err) {
      LoggerService.error('[AI SERVICE] TTS failed to start', { error: err.message });
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
  process: managed,
};
