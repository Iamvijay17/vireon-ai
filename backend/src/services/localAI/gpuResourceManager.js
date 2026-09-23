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

// The one cross-process lease name. Every GPU-heavy service contends for
// this single slot, matching the physical reality of one card.
const GPU_LEASE_NAME = 'gpu-slot';

class GPUResourceManager {
  /**
   * `lease` (a RedisLease) upgrades this from in-process-only sequencing to
   * cross-process sequencing. Without it, the state machine below is correct
   * only while exactly one process touches the GPU - `this.services` lives in
   * this process's memory, so a second worker process cannot see that LM
   * Studio is already loaded and will happily start TTS on top of it. With
   * it, a process must additionally hold a Redis lease before loading
   * anything, so the two serialize instead of racing.
   *
   * The lease is held by the *process*, not per service: a process that
   * already holds it can move between its own registered services freely
   * (that is what the in-process state machine is for), and only gives the
   * lease up once nothing local is holding a slot - or sooner, if another
   * process signals demand (see _handleDemand).
   */
  constructor({ lease = null } = {}) {
    this.services = new Map(); // name -> { manager, autoStop, state, idleTimer, since }
    this.waiters = []; // FIFO of { name, resolve }

    this._lease = lease;
    this._held = null; // the lease token this process currently holds, if any
    this._renewTimer = null;
    this._demandPending = false; // another process asked while we were busy
    // Bridges the window between claiming the lease and a service
    // reaching STARTING - see _hasActiveWork().
    this._pendingUse = 0;
    // Every lease mutation goes through this chain so an acquire racing a
    // demand-triggered release can't interleave into "released the lease but
    // kept the model loaded" (or the reverse, which is the dangerous one).
    this._leaseOps = Promise.resolve();
  }

  /** Serialize a lease mutation behind any other in-flight one. */
  _serialize(fn) {
    const next = this._leaseOps.then(fn, fn);
    // Swallow here only to keep the chain alive; the returned promise still
    // rejects for the caller that queued this operation.
    this._leaseOps = next.catch(() => {});
    return next;
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

  // ── Cross-process lease ────────────────────────────────────────────────
  // All no-ops when constructed without a `lease`, so the single-process
  // path below is exactly what it was before.

  /**
   * Take the process-wide GPU lease if we don't already hold it. Blocks
   * until another process releases - which is the entire point: without
   * this, two worker processes both load a model onto a 6GB card.
   *
   * TTL is deliberately short relative to how long real work takes; the
   * renew timer below keeps it alive. A short TTL is what makes a *crashed*
   * holder's slot recoverable in seconds instead of hanging every other
   * process until someone clears Redis by hand.
   */
  async _acquireProcessLease(name) {
    if (!this._lease) return;

    await this._serialize(async () => {
      if (this._held) return; // this process already owns the card

      const ttlMs = config.gpu.leaseTtlMs;
      LoggerService.info(`[GPU] ${name} waiting for the cross-process GPU lease`);
      this._held = await this._lease.acquire(GPU_LEASE_NAME, { ttlMs });

      // Renew at a third of the TTL so one slow round-trip never costs us
      // the lease we are actively using.
      this._renewTimer = setInterval(async () => {
        const stillHeld = await this._lease.renew(this._held, ttlMs).catch(() => false);
        if (!stillHeld) {
          // Two processes may now both believe they own the card. Loud,
          // because the next symptom is a CUDA OOM with no obvious cause.
          LoggerService.error('[GPU] Lost the cross-process GPU lease during renewal - another process may now be loading a model concurrently');
        }
      }, Math.max(1000, Math.floor(ttlMs / 3)));
      this._renewTimer.unref?.();

      await this._subscribeToDemand();
      LoggerService.info(`[GPU] ${name} holds the cross-process GPU lease`);
    });
  }

  /** Give the card back to whoever is waiting. Safe to call when not held. */
  async _releaseProcessLease() {
    if (!this._lease) return;

    await this._serialize(async () => {
      if (!this._held) return;
      clearInterval(this._renewTimer);
      this._renewTimer = null;
      const held = this._held;
      this._held = null;
      this._demandPending = false;
      await this._lease.release(held).catch((err) =>
        LoggerService.error('[GPU] Failed to release the cross-process GPU lease', { error: err.message })
      );
      LoggerService.info('[GPU] Released the cross-process GPU lease');
    });
  }

  async _subscribeToDemand() {
    if (!this._lease || this._unsubscribeDemand) return;
    this._unsubscribeDemand = await this._lease.onDemand(GPU_LEASE_NAME, () => {
      this._handleDemand().catch((err) =>
        LoggerService.error('[GPU] Failed to hand off the GPU on demand', { error: err.message })
      );
    });
  }

  /**
   * Another process wants the card. This is what buys back the warm-reuse
   * that a plain "unload before every release" lease coordinator throws
   * away: we keep services loaded after release() as usual, and only pay
   * the unload cost when someone actually asks.
   *
   * If anything local is mid-operation (BUSY), we keep the lease - the
   * waiter queues, exactly as it should - but remember the request so
   * release() hands off immediately rather than making them wait out the
   * full idle timeout.
   */
  async _handleDemand() {
    if (!this._held) return;

    if (this._hasActiveWork()) {
      this._demandPending = true;
      LoggerService.info('[GPU] Another process wants the GPU - handing off as soon as the current operation finishes');
      return;
    }

    await this._evictAllIdle();
    await this._releaseProcessLease();
  }

  /**
   * Is this process actually *using* the card right now, as opposed to just
   * keeping something warm?
   *
   * Deliberately broader than getCurrentOwner() (which only sees BUSY).
   * STARTING counts: a demand signal can land between taking the lease and
   * finishing ensureRunning(), and releasing there would hand the card away
   * while this process is in the middle of loading a model onto it - the
   * precise double-load the lease exists to prevent. STOPPING counts for the
   * same reason the local slot accounting counts it: the VRAM is not free
   * until the unload returns.
   */
  _hasActiveWork() {
    // Covers the gap between taking the lease and marking a service
    // STARTING - a demand signal landing in that window would otherwise see
    // an idle-looking process and release a lease it is about to use.
    if (this._pendingUse > 0) return true;
    for (const entry of this.services.values()) {
      if (entry.state === STATE.STARTING || entry.state === STATE.BUSY || entry.state === STATE.STOPPING) return true;
    }
    return false;
  }

  /** Unload every warm-but-idle service, freeing the card for real. */
  async _evictAllIdle() {
    const idle = [...this.services.entries()]
      .filter(([, entry]) => entry.state === STATE.READY)
      .map(([name]) => name);
    for (const name of idle) await this._evict(name);
  }

  /**
   * Called after any transition that might have left this process holding
   * the card for no reason: nothing loaded at all, or nothing busy while
   * another process is waiting.
   */
  async _reconcileProcessLease() {
    if (!this._lease || !this._held) return;

    // Mid-operation: keep the card. release()/_evict() will call back here
    // once the work actually finishes.
    if (this._hasActiveWork()) return;

    if (this._usedSlots() === 0) return this._releaseProcessLease();

    if (this._demandPending) {
      await this._evictAllIdle();
      await this._releaseProcessLease();
    }
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

    // Nothing loaded here any more means the card is genuinely free - stop
    // holding the cross-process lease against it (e.g. the idle-timeout
    // path, which no other code would otherwise notice).
    await this._reconcileProcessLease().catch((err) =>
      LoggerService.error('[GPU] Failed to reconcile the cross-process lease after eviction', { error: err.message })
    );
  }

  /** Crash path: whatever state the service was in, treat its slot as free immediately. */
  _forceRelease(name, endState) {
    const entry = this.services.get(name);
    if (!entry) return;
    this._clearIdleTimer(entry);
    entry.state = endState;
    entry.since = Date.now();
    this._drainWaiters();

    // A crashed service is not holding VRAM any more, so keeping the
    // cross-process lease would block every other process behind a dead
    // owner - the exact failure this path exists to prevent locally.
    this._reconcileProcessLease().catch((err) =>
      LoggerService.error('[GPU] Failed to reconcile the cross-process lease after a crash', { error: err.message })
    );
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
    // straight to busy, no slot count change, no restart cost. A READY
    // service implies this process still holds the cross-process lease
    // (handing it off always unloads first), so there is nothing to
    // re-acquire here.
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

    // A local slot is free, but the card may still belong to another
    // process. Claim it before marking STARTING, so this service never
    // occupies a local slot while blocked on Redis - that would deadlock
    // every other service in this process behind a wait it can't influence.
    this._pendingUse += 1;
    try {
      await this._acquireProcessLease(name);

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
    } catch (err) {
      // Don't sit on the card after a failed start - if this was the only
      // thing holding it, another process should get it immediately. Runs
      // after _pendingUse is decremented below, so _hasActiveWork() sees
      // the truth.
      this._pendingUse -= 1;
      await this._reconcileProcessLease().catch(() => {});
      throw err;
    }
    this._pendingUse -= 1;
  }

  /**
   * Release `name`'s GPU slot back to "ready" (still loaded, just idle).
   * If autoStop is configured for it, schedule an unload/stop after
   * config.gpu.idleTimeoutMs of no further use; otherwise it stays warm
   * until another service's acquire() forces it out under contention.
   */
  async release(name) {
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

    // If another process asked for the card while this was mid-operation,
    // hand it over now rather than making them wait out idleTimeoutMs.
    await this._reconcileProcessLease().catch((err) =>
      LoggerService.error('[GPU] Failed to reconcile the cross-process lease after release', { error: err.message })
    );
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
      // Awaited because release() now also decides whether to hand the
      // cross-process lease over; not awaiting would let the next acquire()
      // in this process race that decision.
      await this.release(name);
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
        // Stays synchronous (the API's status endpoint calls this inline):
        // reports what THIS process knows, never a Redis round-trip.
        coordinator: this._lease ? 'redis' : 'in-process',
        holdsProcessLease: Boolean(this._held),
        handoffPending: this._demandPending,
      },
      services,
    };
  }

  /**
   * Release the card and close the lease connection on shutdown. Without
   * this, a worker that exits while holding the lease makes every other
   * process wait out the TTL for a card that is already free.
   */
  async shutdown() {
    await this._evictAllIdle().catch(() => {});
    await this._releaseProcessLease().catch(() => {});
    this._unsubscribeDemand?.();
    if (this._lease) await this._lease.close().catch(() => {});
  }
}

module.exports = { GPUResourceManager, STATE, GPU_LEASE_NAME };
