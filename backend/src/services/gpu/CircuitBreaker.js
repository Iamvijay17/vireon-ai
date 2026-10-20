/**
 * One breaker per model service (llm / tts / comfyui).
 *
 * Without it, a service that is down costs every queued task a full startup
 * timeout (TTS alone is 3 minutes) one after another, while the card sits idle
 * and every job behind them waits. After `threshold` consecutive failures the
 * breaker opens: tasks for that service fail immediately with a retry-after,
 * so the scheduler keeps serving the services that work. After the cooldown it
 * lets exactly one task through (half-open); that task's outcome closes the
 * breaker or re-opens it with a doubled cooldown.
 *
 * Pure of I/O and time sources (`now` is injectable): the policy is the thing
 * worth testing, and a real clock would make that flaky.
 */
const STATE = Object.freeze({ CLOSED: 'closed', OPEN: 'open', HALF_OPEN: 'half-open' });

class CircuitBreaker {
  constructor({ threshold = 3, cooldownMs = 30_000, maxCooldownMs = 300_000, now = Date.now } = {}) {
    this.threshold = threshold;
    this.baseCooldownMs = cooldownMs;
    this.maxCooldownMs = maxCooldownMs;
    this.now = now;
    this.failures = 0;
    this.openedAt = 0;
    this.cooldownMs = cooldownMs;
    this.probing = false; // a half-open probe task is in flight
    this.lastError = null;
  }

  get enabled() {
    return this.threshold > 0;
  }

  /** closed | open | half-open - open turns half-open on its own once the cooldown has passed. */
  get state() {
    if (!this.enabled || this.failures < this.threshold) return STATE.CLOSED;
    return this.now() - this.openedAt >= this.cooldownMs ? STATE.HALF_OPEN : STATE.OPEN;
  }

  /** Milliseconds until a task may be let through; 0 when one may go now. */
  retryAfterMs() {
    if (this.state !== STATE.OPEN) return 0;
    return Math.max(0, this.cooldownMs - (this.now() - this.openedAt));
  }

  /**
   * Ask permission to run a task. Returns `{ allowed, probe }`; a `probe: true`
   * admission is the single half-open trial, and its outcome must be reported
   * through recordSuccess()/recordFailure() (or abandonProbe() if it never ran).
   */
  tryAcquire() {
    const state = this.state;
    if (state === STATE.CLOSED) return { allowed: true, probe: false };
    if (state === STATE.HALF_OPEN && !this.probing) {
      this.probing = true;
      return { allowed: true, probe: true };
    }
    return { allowed: false, probe: false };
  }

  /** A probe was admitted but the task never reached the service (cancelled while queued). */
  abandonProbe() {
    this.probing = false;
  }

  recordSuccess() {
    this.failures = 0;
    this.probing = false;
    this.cooldownMs = this.baseCooldownMs;
    this.lastError = null;
  }

  recordFailure(error) {
    if (!this.enabled) return;
    const wasHalfOpen = this.probing || this.state === STATE.HALF_OPEN;
    this.lastError = error?.message || String(error || '');
    this.probing = false;
    this.failures += 1;
    if (this.failures < this.threshold) return;
    // A failed trial means the service is still down: wait twice as long next time.
    if (wasHalfOpen) this.cooldownMs = Math.min(this.cooldownMs * 2, this.maxCooldownMs);
    this.openedAt = this.now();
  }

  snapshot() {
    return {
      state: this.state,
      consecutiveFailures: this.failures,
      retryAfterMs: this.retryAfterMs(),
      lastError: this.lastError,
    };
  }
}

module.exports = { CircuitBreaker, BREAKER_STATE: STATE };
