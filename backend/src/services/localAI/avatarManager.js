const path = require('path');
const config = require('../../config');
const LoggerService = require('../common/LoggerService');
const { ManagedProcess, parseCommand } = require('./processManager');
const { SERVICE_STATE, checkHealth, waitUntilHealthy } = require('./serviceHealth');

/**
 * LivePortrait (talking-head avatar overlay - see services/avatar/avatarService.js)
 * is another Gradio app launched via its own Pinokio app on this machine
 * (C:\pinokio\api\liveportrait.git). Same shape as ttsManager.js - see that
 * file for why there's no lightweight "unload" for a Gradio process.
 */
const managed = new ManagedProcess('LivePortrait');
let inFlightEnsure = null;

function cfg() {
  return config.localAI.avatar;
}

async function isRunning() {
  return checkHealth(cfg().healthUrl, { timeout: cfg().healthCheckTimeoutMs });
}

/**
 * LivePortrait's env (see the comment above ManagedProcess) is a conda
 * environment, not a plain venv - its `_ssl`/etc. native modules load DLLs
 * (e.g. libssl-1_1-x64.dll) out of <env>\Library\bin, which is only on
 * PATH after a real `conda activate`. Pinokio's own launcher does that
 * activation; a bare spawn() of python.exe does not, and fails with
 * "DLL load failed while importing _ssl". Reproduce the same PATH
 * prepend `conda activate` would do, derived from the python.exe path in
 * AVATAR_START_COMMAND so this isn't hardcoded to one machine's exact env.
 */
function condaEnvPathAdditions(pythonExePath) {
  const envRoot = path.dirname(pythonExePath);
  const additions = [
    envRoot,
    path.join(envRoot, 'Library', 'mingw-w64', 'bin'),
    path.join(envRoot, 'Library', 'usr', 'bin'),
    path.join(envRoot, 'Library', 'bin'),
    path.join(envRoot, 'Scripts'),
  ];
  return `${additions.join(path.delimiter)}${path.delimiter}${process.env.PATH || ''}`;
}

async function start() {
  const { startCommand, workdir } = cfg();
  if (!startCommand) {
    throw new Error(
      'AVATAR_START_COMMAND is not configured - set AVATAR_START_COMMAND and AVATAR_WORKDIR in .env to LivePortrait\'s venv python.exe and app.py (see C:\\pinokio\\api\\liveportrait.git\\start.js for the exact paths), or start it manually via Pinokio.'
    );
  }

  const { command, args } = parseCommand(startCommand);
  LoggerService.info('[AI SERVICE] Starting LivePortrait', { command: startCommand, cwd: workdir });
  managed.spawn({ command, args, cwd: workdir || undefined, env: { PATH: condaEnvPathAdditions(command) } });
}

async function stop() {
  LoggerService.info('[AI SERVICE] Stopping LivePortrait');
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
  LoggerService.info('[AI SERVICE] Waiting for LivePortrait');

  const ready = await waitUntilHealthy(healthUrl, {
    timeoutMs: startupTimeoutMs,
    intervalMs: healthCheckIntervalMs,
    timeout: healthCheckTimeoutMs,
  });

  if (!ready) {
    throw new Error(`Avatar service failed to become ready after ${Math.round(startupTimeoutMs / 1000)} seconds.`);
  }

  LoggerService.info('[AI SERVICE] LivePortrait ready', { pid: managed.pid });
  return true;
}

async function ensureRunning() {
  if (cfg().enabled === false) {
    return true;
  }

  LoggerService.info('[AI SERVICE] Checking LivePortrait');

  if (await isRunning()) {
    LoggerService.info('[AI SERVICE] LivePortrait already running');
    return true;
  }

  if (cfg().autoStart === false) {
    throw new Error('LivePortrait is not running and AVATAR_AUTO_START=false - start it manually via Pinokio.');
  }

  if (inFlightEnsure) {
    return inFlightEnsure;
  }

  const startedAt = Date.now();
  inFlightEnsure = (async () => {
    try {
      await start();
      await waitUntilReady();
      LoggerService.info('[AI SERVICE] LivePortrait startup complete', {
        durationMs: Date.now() - startedAt,
        pid: managed.pid,
      });
      return true;
    } catch (err) {
      LoggerService.error('[AI SERVICE] LivePortrait failed to start', { error: err.message });
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
