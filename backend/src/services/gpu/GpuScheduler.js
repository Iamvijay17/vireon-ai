const crypto = require('crypto');
const { abortableDelay, makeAbortError } = require('../../utils/abortableDelay');
const { computeBackoffMs } = require('../../utils/backoff');
const { GpuTaskQueue, BLOCK } = require('./GpuTaskQueue');
const { CircuitBreaker, BREAKER_STATE } = require('./CircuitBreaker');
const { budgetMb, fits } = require('./vram');
const { PRIORITY } = require('./priorities');
const {
  GpuServiceUnavailableError,
  DuplicateGpuTaskError,
} = require('./gpuErrors');

const NETWORK_ERRNO = new Set(['ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'EAI_AGAIN', 'EPIPE']);

/**
 * Did this fail because a model service is down or not ready - as opposed to
 * the caller's input being wrong? Only the former should trip a breaker or be
 * retried inside a GPU task: re-running a bad prompt just fails the same way.
 */
function isServiceFailure(err) {
  if (!err || err.name === 'AbortError' || err.cancelled) return false;
  if (err.permanent === true) return false;
  if (NETWORK_ERRNO.has(err.code)) return true;
  const status = err.response?.status;
  if (status === 502 || status === 503 || status === 504) return true;
  return /econnrefused|econnreset|socket hang up|failed to become ready|is not running|failed to load/i.test(String(err.message || ''));
}

/**
 * The global GPU task queue.
 *
 * Every `gpu.withGPU(service, fn)` call is routed here and becomes a *task*
 * with a place in line, instead of a race for whatever the card is doing:
 *
 *   enqueue -> (turn) -> [ticket -> memory check -> breaker] -> acquire -> run -> release
 *
 *   turn      GpuTaskQueue picks the next task by priority + age, with a
 *             bounded preference for the model that is already loaded. A
 *             service runs one task at a time and the number of services
 *             resident at once is capped by slots AND by VRAM.
 *   ticket    with GPU_COORDINATOR=redis, tasks from different processes line up
 *             in RedisTicketQueue before touching the lease, so the card goes to
 *             whoever is next rather than whoever polled first.
 *   memory    with nvidia-smi, a load waits while another application is holding
 *             the VRAM it needs (bounded - see config.gpu.vram.admissionTimeoutMs).
 *   breaker   a service that keeps failing is skipped for a cooldown instead of
 *             costing every queued task a full startup timeout.
 *
 * GPUResourceManager still owns the model lifecycle (load, warm reuse, evict,
 * the cross-process lease); the scheduler only decides *when* a task may ask
 * it for the card. Nothing here knows about video jobs - `jobId`/`stage` are
 * labels for the dedupe key, the task ledger and the status view.
 */
class GpuScheduler {
  /**
   * `gpu` is the GPUResourceManager. Everything else is injectable so the
   * policy can be tested without Redis, Mongo, nvidia-smi or a real clock.
   */
  constructor({
    gpu,
    settings,
    maxConcurrent = 1,
    probe = null,
    global = null,
    ledger = null,
    metrics = null,
    logger = null,
    now = Date.now,
    worker = `proc-${process.pid}`,
    heartbeatMs = 60_000,
  }) {
    this.gpu = gpu;
    this.settings = settings;
    this.maxConcurrent = maxConcurrent;
    this.probe = probe;
    this.global = global;
    this.ledger = ledger;
    this.metrics = metrics;
    this.log = logger || { info() {}, warn() {}, error() {}, debug() {} };
    this.now = now;
    this.worker = worker;
    this.heartbeatMs = heartbeatMs;

    this.queue = new GpuTaskQueue({
      priorityWeightMs: settings.scheduler.priorityWeightMs,
      affinityWindowMs: settings.scheduler.affinityWindowMs,
    });
    this.running = new Map(); // task id -> task: admitted, holding a scheduling slot
    this._keys = new Set(); // dedupe keys of tasks anywhere in their lifecycle
    this._breakers = new Map(); // service -> CircuitBreaker
    this._lastProbe = null;
    this._seq = 0;
  }

  // ── Public API ─────────────────────────────────────────────────────────

  /**
   * Run `fn` holding the GPU for `service`. Resolves with fn's result.
   *
   * opts:
   *   jobId, stage   labels; with a service they form the dedupe key
   *   key            override the dedupe key (null/'' = never deduped)
   *   priority       PRIORITY.* (default NORMAL)
   *   signal         AbortSignal - aborts a task still waiting in line and the
   *                  waits inside admission (Stop, stage timeout)
   *   retries        extra attempts when fn fails because the SERVICE did
   *                  (default 0; `true` = config.gpu.scheduler.taskRetries).
   *                  Only for idempotent work - the task restarts from the top.
   *                  Backoff is exponential, with the GPU released meanwhile.
   */
  async run(service, fn, opts = {}) {
    const task = this._createTask(service, opts);

    // A service that is known to be down should not even wait in line.
    const breaker = this._breaker(service);
    if (breaker.state === BREAKER_STATE.OPEN) {
      throw new GpuServiceUnavailableError(service, { retryAfterMs: breaker.retryAfterMs(), reason: breaker.lastError || 'repeated failures' });
    }

    if (task.key) {
      if (this._keys.has(task.key)) throw new DuplicateGpuTaskError(task.key);
      this._keys.add(task.key);
    }

    let keyHold = null;
    let heartbeat = null;
    try {
      keyHold = await this._holdKey(task);
      this._ledger('queued', task, this.worker);
      // Keeps the ledger row provably alive; a crash stops it, which is what
      // lets the boot sweep tell an orphaned row from a long-running task.
      if (this.ledger && this.heartbeatMs > 0) {
        heartbeat = setInterval(() => this._ledger('touch', task), this.heartbeatMs);
        heartbeat.unref?.();
      }

      const result = await this._runWithRetries(task, fn);
      this._ledger('finished', task, 'completed', { runMs: this.now() - (task.startedAt || task.enqueuedAt) });
      this._metric('increment', 'gpu.tasks.completed');
      return result;
    } catch (err) {
      const cancelled = err?.name === 'AbortError' || err?.cancelled === true;
      this._ledger('finished', task, cancelled ? 'cancelled' : 'failed', {
        runMs: task.startedAt ? this.now() - task.startedAt : undefined,
        error: cancelled ? undefined : err,
      });
      this._metric('increment', cancelled ? 'gpu.tasks.cancelled' : 'gpu.tasks.failed');
      throw err;
    } finally {
      if (heartbeat) clearInterval(heartbeat);
      if (keyHold) await keyHold.release().catch(() => {});
      if (task.key) this._keys.delete(task.key);
    }
  }

  /** What is queued, running and broken right now - for the status endpoint. */
  async snapshot() {
    const t = this.now();
    const view = (task) => ({
      id: task.id,
      service: task.service,
      jobId: task.jobId || null,
      stage: task.stage || null,
      label: task.label || null,
      priority: task.priority,
      waitingMs: t - task.enqueuedAt,
      attempt: task.attempt,
    });

    const breakers = {};
    for (const [service, breaker] of this._breakers) breakers[service] = breaker.snapshot();

    let global = null;
    if (this.global) global = await this.global.snapshot().catch(() => null);

    return {
      policy: {
        maxConcurrent: this.maxConcurrent,
        vramAdmission: this.settings.vram.admission,
        budgetMb: this._budget(),
        affinityWindowMs: this.settings.scheduler.affinityWindowMs,
      },
      queued: this.queue.list().map(view),
      running: [...this.running.values()].map(view),
      breakers,
      vram: this._lastProbe,
      // Only present with GPU_COORDINATOR=redis: everyone in line, any process.
      global,
    };
  }

  async close() {
    await this.global?.close?.();
  }

  // ── Task lifecycle ─────────────────────────────────────────────────────

  _createTask(service, opts) {
    const key = opts.key !== undefined ? opts.key : opts.jobId ? `${opts.jobId}:${opts.stage || '-'}:${service}` : null;
    this._seq += 1;
    return {
      id: crypto.randomUUID(),
      seq: this._seq,
      key: key || null,
      jobId: opts.jobId ? String(opts.jobId) : null,
      stage: opts.stage || null,
      label: opts.label || null,
      service,
      priority: opts.priority ?? PRIORITY.NORMAL,
      signal: opts.signal || null,
      retries: Math.max(0, opts.retries === true ? this.settings.scheduler.taskRetries : opts.retries ?? 0),
      enqueuedAt: this.now(),
      attempt: 0,
      startedAt: null,
      underPressure: false,
    };
  }

  async _runWithRetries(task, fn) {
    for (;;) {
      task.attempt += 1;
      try {
        return await this._attempt(task, fn);
      } catch (err) {
        const budgetLeft = task.attempt <= task.retries;
        if (!budgetLeft || !isServiceFailure(err) || task.signal?.aborted) throw err;

        // The service failed (and its breaker has been told). Back off with the
        // GPU released, so another service's task can use the card meanwhile.
        const delayMs = computeBackoffMs(task.attempt, { base: this.settings.scheduler.taskRetryBaseMs, max: 60_000 });
        this.log.warn('[GPU] Task failed on a service error - retrying', {
          service: task.service, jobId: task.jobId, stage: task.stage, attempt: task.attempt, retryInMs: delayMs, error: err.message,
        });
        this._ledger('retrying', task, err);
        this._metric('increment', 'gpu.tasks.retried');
        await abortableDelay(delayMs, task.signal);
      }
    }
  }

  async _attempt(task, fn) {
    await this._waitForTurn(task);

    const breaker = this._breaker(task.service);
    let acquired = false;

    try {
      await this._claimCard(task, breaker);
      acquired = true;

      task.startedAt = this.now();
      const waitMs = task.startedAt - task.enqueuedAt;
      this._metric('recordDuration', 'gpu.queueWait', waitMs);
      this._ledger('started', task, { attempt: task.attempt, waitMs, admittedUnderPressure: task.underPressure });
      this.log.info('[GPU] Task started', {
        service: task.service, jobId: task.jobId, stage: task.stage, attempt: task.attempt, waitMs, underPressure: task.underPressure || undefined,
      });

      try {
        const result = await fn();
        breaker.recordSuccess();
        return result;
      } catch (err) {
        // Bad input and cancellations say nothing about the service's health.
        if (isServiceFailure(err)) breaker.recordFailure(err);
        else breaker.recordSuccess();
        throw err;
      }
    } finally {
      if (acquired) await this.gpu.release(task.service);
      this.running.delete(task.id);
      this._pump();
    }
  }

  // ── Local queue ────────────────────────────────────────────────────────

  /** Join this process's queue; resolves once the task holds a scheduling slot. */
  _waitForTurn(task) {
    return new Promise((resolve, reject) => {
      const { signal } = task;
      if (signal?.aborted) return reject(makeAbortError());

      const onAbort = () => {
        if (this.queue.remove(task.id)) reject(makeAbortError());
      };
      task.admit = () => {
        signal?.removeEventListener('abort', onAbort);
        resolve();
      };
      signal?.addEventListener('abort', onAbort, { once: true });

      this.queue.add(task);
      this._pump();
    });
  }

  /** Start every waiting task that is allowed to start now. */
  _pump() {
    for (;;) {
      const next = this.queue.pick({
        warm: this.gpu.warmServices(),
        check: (task) => this._check(task),
      });
      if (!next) return;
      this.queue.remove(next.id);
      this.running.set(next.id, next);
      next.admit();
    }
  }

  _check(task) {
    const running = [...this.running.values()];
    if (running.some((r) => r.service === task.service)) return BLOCK.SERVICE_BUSY;
    if (running.length >= this.maxConcurrent) return BLOCK.CAPACITY;
    if (this.settings.vram.admission) {
      const resident = running.map((r) => this._estimateMb(r.service));
      if (!fits({ candidateMb: this._estimateMb(task.service), residentMb: resident, budget: this._budget() })) return BLOCK.CAPACITY;
    }
    return BLOCK.NONE;
  }

  // ── Admission: cross-process line, memory, breaker ─────────────────────

  /**
   * Get the card for `task`: stand in the cross-process line, wait out foreign
   * VRAM, pass the breaker, then take the GPU (which loads the model).
   *
   * The ticket is held until acquire() returns. Giving it up earlier would
   * make the next process in line start contending for the lease while this
   * one still is - the free-for-all the line exists to prevent.
   */
  async _claimCard(task, breaker) {
    let ticket = null;
    if (this.global && !this.gpu.holdsProcessLease()) {
      try {
        ticket = await this.global.enter({
          id: task.id,
          score: this.queue.score(task),
          meta: { service: task.service, jobId: task.jobId, stage: task.stage },
        });
      } catch (err) {
        // Ordering is an optimisation over the lease, not the safety: with
        // Redis unreachable the lease would fail loudly on its own.
        this.log.warn('[GPU] Could not join the cross-process queue - continuing without it', { error: err.message });
      }
    }

    let probeHeld = false;
    try {
      await ticket?.waitForHead({ signal: task.signal });
      if (ticket) await this._waitForCard(task, ticket);
      // After the card is free: before that, a sibling process's own models
      // would read as "another application holding the VRAM".
      await this._waitForMemory(task);

      const verdict = breaker.tryAcquire();
      if (!verdict.allowed) {
        throw new GpuServiceUnavailableError(task.service, { retryAfterMs: breaker.retryAfterMs(), reason: breaker.lastError || 'repeated failures' });
      }
      probeHeld = verdict.probe;

      try {
        await this.gpu.acquire(task.service);
      } catch (err) {
        // Only a service that failed to START is the breaker's business; a lost
        // lease or a Redis error says nothing about the service.
        if (this.gpu.serviceState(task.service) === 'failed') breaker.recordFailure(err);
        else if (probeHeld) breaker.abandonProbe();
        probeHeld = false;
        throw err;
      }
    } catch (err) {
      // A probe admitted but never sent to the service (cancelled while waiting
      // for memory) must not leave the breaker half-open on an outcome that
      // is never coming.
      if (probeHeld) breaker.abandonProbe();
      throw err;
    } finally {
      await ticket?.leave();
    }
  }

  /**
   * Contend for the lease only once it looks free *and* this task is still
   * next. Waiting on the lease while merely first in line would commit this
   * task to the card: a higher-priority task arriving a moment later could no
   * longer overtake it, and the priority would only apply to tasks that happen
   * to arrive while the card is idle. So the head waits on the ticket instead,
   * nudging an idle holder to hand off, and re-checks its place each round.
   */
  async _waitForCard(task, ticket) {
    const pollMs = this.settings.scheduler.leasePollMs ?? 250;
    let announced = false;

    for (;;) {
      if (await this.gpu.cardIsFree()) return;
      if (!announced) {
        announced = true;
        this.log.info('[GPU] Waiting for another process to hand off the GPU', { service: task.service, jobId: task.jobId });
      }
      await this.gpu.requestCard();
      await abortableDelay(pollMs, task.signal);
      await ticket.waitForHead({ signal: task.signal }); // a more urgent task may have overtaken us
    }
  }

  /**
   * Hold the task back while another application occupies the VRAM it needs.
   * Only checked when this process has nothing loaded itself - otherwise the
   * reading would just be our own models. Bounded: past the timeout the task
   * goes ahead and is flagged, because a wrong estimate must slow the
   * pipeline down, never wedge it.
   */
  async _waitForMemory(task) {
    const { vram } = this.settings;
    if (!this.probe || !vram.admission || !vram.liveCheck) return;
    if (this.gpu.localSlotCount() > 0) return;

    const deadline = this.now() + vram.admissionTimeoutMs;
    let announced = false;
    let reclaimed = false;

    for (let polls = 0; ; polls += 1) {
      const reading = await this.probe.read({ fresh: polls > 0 });
      if (!reading) return; // no nvidia-smi: slot accounting only
      this._lastProbe = { ...reading, at: this.now() };

      const needed = Math.round(Math.min(this._estimateMb(task.service), this._budget()) * (vram.liveFactor ?? 1));
      if (reading.freeMb >= needed) return;

      // Still occupied although the cross-process line proved no other Vireon process is using the
      // card: the likeliest holder is a model left resident by a worker that died (ComfyUI and
      // Qwen3-TTS outlive their workers). Ask the idle services to drop it once, rather than
      // sitting out the whole admission wait. Needs the Redis line - without it nothing proves
      // the card is not in use by another process, so this stays a plain wait.
      if (!reclaimed && this.global && typeof this.gpu.reclaimUnownedModels === 'function') {
        reclaimed = true;
        this.log.info('[GPU] GPU memory is occupied with no other Vireon task in line - asking idle services to drop their models', {
          service: task.service, freeMb: reading.freeMb, neededMb: needed, jobId: task.jobId,
        });
        try {
          await this.gpu.reclaimUnownedModels();
          this._metric('increment', 'gpu.admission.reclaimed');
        } catch (err) {
          this.log.warn('[GPU] Could not reclaim idle models', { error: err.message });
        }
        continue; // read again, fresh
      }

      if (this.now() >= deadline) {
        task.underPressure = true;
        this._metric('increment', 'gpu.admission.underPressure');
        this.log.warn('[GPU] GPU memory still occupied after the admission wait - proceeding anyway', {
          service: task.service, freeMb: reading.freeMb, neededMb: needed, waitedMs: vram.admissionTimeoutMs,
        });
        return;
      }

      if (!announced) {
        announced = true;
        this.log.info('[GPU] Waiting for GPU memory held by another application', {
          service: task.service, freeMb: reading.freeMb, neededMb: needed, jobId: task.jobId,
        });
      }
      await abortableDelay(vram.pollMs, task.signal);
    }
  }

  _estimateMb(service) {
    return this.settings.vram.estimateMb?.[service] ?? 0;
  }

  _budget() {
    return budgetMb({ totalMb: this._lastProbe?.totalMb || this.settings.vram.totalMb, reserveMb: this.settings.vram.reserveMb });
  }

  /** Does `name` fit alongside the services in `holders`? Used by GPUResourceManager's eviction loop. */
  vramFits(name, holders) {
    if (!this.settings.vram.admission) return true;
    return fits({
      candidateMb: this._estimateMb(name),
      residentMb: holders.map((h) => this._estimateMb(h)),
      budget: this._budget(),
    });
  }

  // ── Plumbing ───────────────────────────────────────────────────────────

  _breaker(service) {
    if (!this._breakers.has(service)) {
      const { threshold, cooldownMs, maxCooldownMs } = this.settings.breaker;
      this._breakers.set(service, new CircuitBreaker({ threshold, cooldownMs, maxCooldownMs, now: this.now }));
    }
    return this._breakers.get(service);
  }

  /** Claim the cross-process "this task is in flight" key; fail-open if Redis is unreachable. */
  async _holdKey(task) {
    if (!this.global || !task.key) return null;
    let hold;
    try {
      hold = await this.global.holdKey(task.key);
    } catch (err) {
      this.log.warn('[GPU] Could not check for duplicate tasks across processes', { error: err.message });
      return null;
    }
    if (!hold) throw new DuplicateGpuTaskError(task.key);
    return hold;
  }

  _ledger(method, ...args) {
    if (!this.ledger) return;
    try {
      Promise.resolve(this.ledger[method](...args)).catch(() => {});
    } catch {
      // the ledger is a record, never a dependency
    }
  }

  _metric(method, ...args) {
    if (!this.metrics) return;
    try {
      Promise.resolve(this.metrics[method](...args)).catch(() => {});
    } catch {
      // metrics are best-effort
    }
  }
}

module.exports = { GpuScheduler, isServiceFailure };
