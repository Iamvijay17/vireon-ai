const { spawn, execFileSync } = require('child_process');
const { EventEmitter } = require('events');
const LoggerService = require('../common/LoggerService');

/**
 * Splits a single command-line string (as stored in e.g.
 * LM_STUDIO_START_COMMAND/TTS_START_COMMAND) into a { command, args } pair
 * suitable for child_process.spawn(command, args) - i.e. WITHOUT shell:true,
 * so a value coming from a .env file is never interpreted by a shell.
 * Supports double/single-quoted segments so a Windows path with spaces
 * (e.g. "C:\Program Files\...") survives as one argument.
 */
function parseCommand(commandString) {
  const tokens = [];
  const re = /"([^"]*)"|'([^']*)'|(\S+)/g;
  let match;
  while ((match = re.exec(commandString)) !== null) {
    tokens.push(match[1] ?? match[2] ?? match[3]);
  }
  const [command, ...args] = tokens;
  return { command, args };
}

/**
 * Tracks and controls exactly one long-running local process (LM Studio's
 * server, the Qwen3-TTS Gradio app, ...). One instance per service - never
 * shared - so stop()/isAlive() can only ever act on a PID this instance
 * itself spawned, never an unrelated process that happens to occupy the
 * same port.
 */
class ManagedProcess extends EventEmitter {
  constructor(name) {
    super();
    this.name = name;
    this.child = null;
    this.pid = null;
    this.startedAt = null;
    this.lastExit = null;
    this.lastError = null;
  }

  /** True only if this instance's own spawned child is still alive. */
  isAlive() {
    if (!this.pid) return false;
    try {
      // Signal 0 sends nothing - it just probes whether the PID exists,
      // on Windows as well as POSIX.
      process.kill(this.pid, 0);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Spawn the process if this instance doesn't already have a live one.
   * Detached + unref'd (matching utils/ensureRedis.js's existing pattern)
   * so the service keeps running - and keeps its GPU/model state warm -
   * across backend restarts instead of dying with the Node process.
   */
  spawn({ command, args = [], cwd, env, windowsHide = true } = {}) {
    if (!command) {
      throw new Error(`No start command configured for ${this.name}`);
    }

    if (this.isAlive()) {
      LoggerService.warn(`[AI SERVICE] ${this.name} spawn skipped - already tracking a live process`, { pid: this.pid });
      return this.child;
    }

    this.lastError = null;
    const child = spawn(command, args, {
      cwd,
      // Merged over the inherited environment (not replacing it) - callers
      // pass this for things like a conda env's DLL search path additions
      // (see avatarManager.js) that a normal shell activation would set up
      // but a direct spawn() doesn't.
      env: env ? { ...process.env, ...env } : undefined,
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      // Confirmed live: Qwen3-TTS's process crashed mid-generation with
      // "forrtl: error (200): program aborting due to window-CLOSE event" -
      // an Intel Fortran/MKL runtime (pulled in by torch/numpy) treating its
      // hidden console window as closed. ttsManager passes windowsHide:
      // false to avoid this; other services keep the default hidden window
      // since none of them showed this failure mode.
      windowsHide,
    });

    this.child = child;
    this.pid = child.pid;
    this.startedAt = Date.now();
    this.lastExit = null;

    child.stdout?.on('data', (chunk) => {
      LoggerService.debug(`[${this.name}] ${chunk.toString().trim()}`);
    });
    child.stderr?.on('data', (chunk) => {
      LoggerService.debug(`[${this.name}:stderr] ${chunk.toString().trim()}`);
    });

    child.on('exit', (code, signal) => {
      LoggerService.warn(`[AI SERVICE] ${this.name} process exited`, { pid: this.pid, code, signal });
      this.lastExit = { code, signal, at: Date.now() };
      const wasExpected = this._expectedExit === true;
      this._expectedExit = false;
      this.child = null;
      this.pid = null;
      // GPUResourceManager listens for this to force-release a stuck slot
      // and drain queued waiters when a service crashes mid-use instead of
      // being deliberately stopped (stop() sets _expectedExit first).
      this.emit('exit', { code, signal, expected: wasExpected });
    });

    child.on('error', (err) => {
      LoggerService.error(`[AI SERVICE] ${this.name} failed to start`, { error: err.message });
      this.lastError = err.message;
      this.child = null;
      this.pid = null;
      this.emit('exit', { code: null, signal: null, expected: false, error: err.message });
    });

    // Detached so it outlives this process; unref so it doesn't itself
    // keep the backend process alive.
    child.unref();

    return child;
  }

  /**
   * Shutdown of this instance's tracked process AND everything it spawned.
   *
   * Originally tried a graceful `child.kill('SIGTERM')` first, only falling
   * back to `taskkill /T` after a timeout. That's wrong on Windows for
   * these specific services: LM Studio/Qwen3-TTS/LivePortrait's venv
   * python.exe re-execs itself as a CHILD process under a different
   * interpreter (e.g. Qwen3-TTS's venv python.exe launches
   * `...\miniforge\python.exe app.py` as a child, which is the one that
   * actually binds the Gradio port) - killing only the tracked parent PID
   * leaves that real server child running and orphaned. `isAlive()` then
   * reports "stopped" (the parent is gone) while the actual service is
   * still up, wedged, and still holding its port - `restart()` would spawn
   * a second instance that can't even bind, while every request kept
   * hitting the original orphan. Confirmed live: this exact scenario left
   * a wedged Qwen3-TTS process running for nearly an hour through multiple
   * "successful" restarts. `taskkill /PID <pid> /T /F` kills the whole
   * process tree unconditionally - no soft attempt first, since none of
   * these services expose a clean shutdown hook worth waiting for anyway.
   */
  async stop() {
    if (!this.isAlive()) return true;
    const pid = this.pid;

    LoggerService.info(`[AI SERVICE] Stopping ${this.name}`, { pid });
    this._expectedExit = true;

    try {
      execFileSync('taskkill', ['/PID', String(pid), '/T', '/F'], { windowsHide: true });
    } catch (err) {
      // ERROR: The process "X" not found - already dead, not a real failure.
      if (!/not found/i.test(err.message)) {
        LoggerService.error(`[AI SERVICE] Failed to stop ${this.name}`, { pid, error: err.message });
        return false;
      }
    }

    this.child = null;
    this.pid = null;
    return true;
  }
}

module.exports = { ManagedProcess, parseCommand };
