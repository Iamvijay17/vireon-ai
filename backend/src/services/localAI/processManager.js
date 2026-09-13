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
  spawn({ command, args = [], cwd, env } = {}) {
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
      windowsHide: true,
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
   * Graceful shutdown of this instance's own tracked process only: SIGTERM
   * first, then (Windows doesn't deliver SIGTERM to arbitrary processes) a
   * `taskkill` scoped to this exact PID if it hasn't exited within
   * `timeout`ms.
   */
  async stop({ timeout = 5000 } = {}) {
    if (!this.isAlive()) return true;
    const pid = this.pid;

    LoggerService.info(`[AI SERVICE] Stopping ${this.name}`, { pid });
    this._expectedExit = true;
    try {
      this.child?.kill('SIGTERM');
    } catch (err) {
      LoggerService.warn(`[AI SERVICE] SIGTERM failed for ${this.name}`, { pid, error: err.message });
    }

    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      if (!this.isAlive()) return true;
      await new Promise((resolve) => setTimeout(resolve, 200));
    }

    if (!this.isAlive()) return true;

    try {
      // /T also kills the child's own child processes (e.g. python.exe
      // spawned from a cmd wrapper) - scoped strictly to this PID's tree.
      execFileSync('taskkill', ['/PID', String(pid), '/T', '/F'], { windowsHide: true });
      LoggerService.warn(`[AI SERVICE] Force-stopped ${this.name} via taskkill`, { pid });
      this.child = null;
      this.pid = null;
      return true;
    } catch (err) {
      LoggerService.error(`[AI SERVICE] Failed to force-stop ${this.name}`, { pid, error: err.message });
      return false;
    }
  }
}

module.exports = { ManagedProcess, parseCommand };
