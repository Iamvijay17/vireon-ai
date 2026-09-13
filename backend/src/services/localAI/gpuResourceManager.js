const config = require('../../config');
const LoggerService = require('../common/LoggerService');

/**
 * Enforces sequential (or capped-concurrent) GPU usage across LM Studio,
 * Qwen3-TTS, ComfyUI, etc. on hardware too small to run them all loaded at
 * once (this project's target: an RTX 2060 6GB). Registered services move
 * through: stopped -> starting -> busy -> ready -> (idle timeout or
 * contention) -> stopping -> stopped.
 *
 * "ready" means loaded and healthy but not currently doing work - it still
 * occupies a GPU slot. Only "stopped"/"failed" free a slot. This is what
 * lets acquire() reuse a still-warm service instantly while still forcing
 * it out the moment another service needs the GPU and no slot is free.
 */
const STATE = Object.freeze({
  STOPPED: 'stopped',
  STARTING: 'starting',
  READY: 'ready',
  BUSY: 'busy',
  STOPPING: 'stopping',
  FAILED: 'failed',
});

// States that count against config.gpu.maxConcurrent. A "ready" (warm but
// idle) service still holds its model in VRAM, so it counts the same as a
// busy one - and critically, so does "stopping": the slot isn't actually
// free until unload()/stop() has finished, so a service mid-eviction must
// keep blocking other acquire() calls, not just the ones that come after
// it starts unloading. Without this, a second acquire() could sneak in and
// call ensureRunning() on a DIFFERENT service while the first is still
// mid-unload, defeating the whole point of sequencing.
const SLOT_HOLDING_STATES = new Set([STATE.STARTING, STATE.BUSY, STATE.READY, STATE.STOPPING]);

class GPUResourceManager {
  constructor() {
    this.services = new Map(); // name -> { manager, autoStop, state, idleTimer, since }
    this.waiters = []; // FIFO of { name, resolve }
  }

  /**
   * Register a GPU-heavy service. `manager` must expose ensureRunning()
   * (start + wait until healthy) and either unload() (free VRAM, keep the
   * process/server up) or stop() (unload falls back to this). Passing the
   * manager's underlying ManagedProcess as `process` wires crash recovery -
   * an unexpected exit force-releases this service's slot instead of
   * wedging every other service behind a dead owner forever.
   */
  register(name, manager, { autoStop = true, process: managedProcess = null } = {}) {
    this.services.set(name, {
      manager,
      autoStop,
      state: STATE.STOPPED,
      idleTimer: null,
      since: Date.now(),
    });

    if (managedProcess && typeof managedProcess.on === 'function') {
      managedProcess.on('exit', ({ expected }) => {
        if (expected) return; // stop()/eviction already accounts for this
        LoggerService.error(`[GPU] ${name} process crashed - force-releasing its GPU slot`);
        this._forceRelease(name, STATE.FAILED);
      });
    }
  }

  _entry(name) {
    const entry = this.services.get(name);
    if (!entry) throw new Error(`GPU service "${name}" is not registered with GPUResourceManager`);
    return entry;
  }

  _usedSlots() {
    let count = 0;
    for (const entry of this.services.values()) {
      if (SLOT_HOLDING_STATES.has(entry.state)) count += 1;
    }
    return count;
  }

  isLocked() {
    return this._usedSlots() >= config.gpu.maxConcurrent;
  }

  getCurrentOwner() {
    for (const [name, entry] of this.services) {
      if (entry.state === STATE.BUSY) return name;
    }
    return null;
  }

  /** Oldest "ready" (warm, idle) service other than `excluding` - the one evicted first when a slot is needed. */
  _oldestIdleService(excluding) {
    let oldest = null;
    for (const [name, entry] of this.services) {
      if (name === excluding || entry.state !== STATE.READY) continue;
      if (!oldest || entry.since < this.services.get(oldest).since) oldest = name;
    }
    return oldest;
  }

  _clearIdleTimer(entry) {
    if (entry.idleTimer) {
      clearTimeout(entry.idleTimer);
      entry.idleTimer = null;
    }
  }

  _wait(name) {
    return new Promise((resolve) => {
      this.waiters.push({ name, resolve });
      LoggerService.warn(`[GPU] ${name} waiting for GPU`, {
        currentOwner: this.getCurrentOwner(),
        queueLength: this.waiters.length,
      });
    });
  }

  /** Wake every queued waiter; each re-checks slot availability itself (see acquire's loop) and re-queues if it still can't get one. */
  _drainWaiters() {
    const pending = this.waiters;
    this.waiters = [];
    pending.forEach(({ resolve }) => resolve());
  }

  /** Actually free a service's GPU slot: unload (preferred) or fully stop it. */
  async _evict(name) {
    const entry = this._entry(name);
    if (entry.state !== STATE.READY) return;

    this._clearIdleTimer(entry);
    entry.state = STATE.STOPPING;
    LoggerService.info(`[GPU] Releasing ${name} GPU resources`);

    try {
      if (typeof entry.manager.unload === 'function') {
        await entry.manager.unload();
      } else {
        await entry.manager.stop();
      }
    } catch (err) {
      LoggerService.error(`[GPU] Failed to unload/stop ${name}`, { error: err.message });
    }

    entry.state = STATE.STOPPED;
    entry.since = Date.now();
    this._drainWaiters();
  }

  /** Crash path: whatever state the service was in, treat its slot as free immediately. */
  _forceRelease(name, endState) {
    const entry = this.services.get(name);
    if (!entry) return;
    this._clearIdleTimer(entry);
    entry.state = endState;
    entry.since = Date.now();
    this._drainWaiters();
  }

  /**
   * Claim the GPU for `name`, starting it (via its manager's
   * ensureRunning()) if needed and evicting/waiting out other services
   * first so config.gpu.maxConcurrent is never exceeded. Resolves once
   * `name` is loaded, healthy, and marked busy.
   */
  async acquire(name) {
    const entry = this._entry(name);
    this._clearIdleTimer(entry);

    // Already warm and idle (e.g. reused within the idle window) - promote
    // straight to busy, no slot count change, no restart cost.
    if (entry.state === STATE.READY) {
      entry.state = STATE.BUSY;
      return;
    }

    for (;;) {
      if (this._usedSlots() < config.gpu.maxConcurrent) break;

      const victim = this._oldestIdleService(name);
      if (victim) {
        await this._evict(victim);
        continue; // re-check - another waiter may have grabbed the freed slot first
      }

      await this._wait(name);
    }

    entry.state = STATE.STARTING;
    LoggerService.info(`[GPU] ${name} acquiring GPU`, { mode: config.gpu.mode });
    try {
      await entry.manager.ensureRunning();
      entry.state = STATE.BUSY;
    } catch (err) {
      entry.state = STATE.FAILED;
      this._drainWaiters();
      throw err;
    }
  }

  /**
   * Release `name`'s GPU slot back to "ready" (still loaded, just idle).
   * If autoStop is configured for it, schedule an unload/stop after
   * config.gpu.idleTimeoutMs of no further use; otherwise it stays warm
   * until another service's acquire() forces it out under contention.
   */
  release(name) {
    const entry = this._entry(name);
    if (entry.state !== STATE.BUSY) return;

    entry.state = STATE.READY;
    entry.since = Date.now();

    if (entry.autoStop) {
      entry.idleTimer = setTimeout(() => {
        this._evict(name).catch((err) => LoggerService.error(`[GPU] Idle-timeout eviction of ${name} failed`, { error: err.message }));
      }, config.gpu.idleTimeoutMs);
      entry.idleTimer.unref?.();
    }

    this._drainWaiters();
  }

  /**
   * Convenience wrapper: acquire -> run fn -> always release, even on
   * error. Ensures a service is only ever considered for eviction after
   * its current operation has actually finished (never mid-generation).
   */
  async withGPU(name, fn) {
    await this.acquire(name);
    try {
      return await fn();
    } finally {
      this.release(name);
    }
  }

  async waitForAvailable(name) {
    if (!this.isLocked() || this._entry(name).state === STATE.READY) return;
    await this._wait(name);
  }

  getStatus() {
    const services = {};
    for (const [name, entry] of this.services) {
      services[name] = { status: entry.state };
    }
    return {
      gpu: {
        currentService: this.getCurrentOwner(),
        mode: config.gpu.mode,
        maxConcurrent: config.gpu.maxConcurrent,
      },
      services,
    };
  }
}

module.exports = { GPUResourceManager, STATE };
