const { RedisLease } = require('./RedisLease');
const LoggerService = require('../../services/common/LoggerService');
const config = require('../../config');

// One shared lease guards the whole GPU, mirroring config.gpu.maxConcurrent
// slots on this single physical card - "llm" and "tts" contend for the
// SAME slot, not independent ones, exactly like GPUResourceManager today.
const GPU_LEASE_NAME = 'gpu-slot';

/**
 * Same acquire(name)/release(name)/withGPU(name, fn) calling convention as
 * GPUResourceManager, backed by RedisLease instead of an in-process Map -
 * so a second worker process on the same box actually serializes against
 * the first instead of racing it (in-process state is invisible across
 * processes; Redis is the one thing both can see). Not a full drop-in:
 * isLocked()/getStatus() here are async (Redis round-trip) where
 * GPUResourceManager's are sync, and there is no getCurrentOwner() or
 * per-service state machine - see getStatus() below. Swapping the two
 * still needs the call sites checked, not just a config flip.
 *
 * Known trade-off vs. GPUResourceManager, by design: no cross-process
 * idle-keep-warm. GPUResourceManager can leave a service loaded for
 * config.gpu.idleTimeoutMs after release() because it can see every other
 * service's state in the same process and evict the right victim on
 * demand. A second process has no cheap way to know "is llm still warm
 * somewhere else" without a shared warmth registry this pass doesn't
 * build - so release() here always unloads before freeing the lease. This
 * is strictly correct (never two services loaded at once, across any
 * number of processes) but gives up same-service warm reuse between back-
 * to-back acquire/release pairs. Worth revisiting with a pub/sub
 * "someone else wants the slot" notify-to-evict protocol if that latency
 * turns out to matter in practice - not needed to prove the coordination
 * primitive itself.
 */
class GPULeaseCoordinator {
  constructor({ lease = new RedisLease() } = {}) {
    this._lease = lease;
    this._services = new Map(); // name -> manager
    this._held = new Map(); // name -> { token } for a slot this process currently holds
  }

  register(name, manager) {
    this._services.set(name, manager);
  }

  _manager(name) {
    const manager = this._services.get(name);
    if (!manager) throw new Error(`GPU service "${name}" is not registered with GPULeaseCoordinator`);
    return manager;
  }

  async acquire(name) {
    this._manager(name); // validates registration before waiting on Redis
    const lease = await this._lease.acquire(GPU_LEASE_NAME, {
      ttlMs: config.gpu.idleTimeoutMs || 30000,
    });
    this._held.set(name, lease);

    LoggerService.info(`[GPULease] ${name} acquired the GPU slot`);
    try {
      await this._manager(name).ensureRunning();
    } catch (err) {
      await this._lease.release(lease).catch(() => {});
      this._held.delete(name);
      throw err;
    }
  }

  /**
   * Release `name`'s hold on the GPU. Always unloads first (see class doc)
   * so the slot is genuinely free - not just unlocked - before anyone else
   * can acquire it.
   */
  async release(name) {
    const lease = this._held.get(name);
    if (!lease) return;

    const manager = this._manager(name);
    try {
      if (typeof manager.unload === 'function') await manager.unload();
      else await manager.stop();
    } catch (err) {
      LoggerService.error(`[GPULease] Failed to unload ${name} before releasing slot`, { error: err.message });
    }

    await this._lease.release(lease);
    this._held.delete(name);
    LoggerService.info(`[GPULease] ${name} released the GPU slot`);
  }

  async withGPU(name, fn) {
    await this.acquire(name);
    try {
      return await fn();
    } finally {
      await this.release(name);
    }
  }

  async isLocked() {
    return (await this._lease._client.exists(`lease:${GPU_LEASE_NAME}`)) === 1;
  }

  async waitForAvailable() {
    // A throwaway acquire+release is the simplest correct "block until
    // free" - it briefly takes the slot, but any real caller was about to
    // acquire() for actual work next anyway.
    if (!(await this.isLocked())) return;
    const lease = await this._lease.acquire(GPU_LEASE_NAME, { ttlMs: 1000 });
    await this._lease.release(lease);
  }

  /**
   * Deliberately thinner than GPUResourceManager.getStatus(): there is no
   * per-service state to report (starting/ready/stopping don't exist here -
   * see the class doc's no-idle-keep-warm trade-off), only whether the one
   * shared slot is currently held by *some* process.
   */
  async getStatus() {
    return { gpu: { locked: await this.isLocked(), coordinator: 'redis' } };
  }

  async close() {
    await this._lease.close();
  }
}

module.exports = { GPULeaseCoordinator, GPU_LEASE_NAME };
