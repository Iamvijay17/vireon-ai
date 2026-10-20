const { CircuitBreaker, BREAKER_STATE } = require('../../src/services/gpu/CircuitBreaker');

function make(opts = {}) {
  const clock = { t: 1000 };
  const breaker = new CircuitBreaker({ threshold: 3, cooldownMs: 1000, maxCooldownMs: 4000, now: () => clock.t, ...opts });
  return { breaker, clock };
}

const trip = (breaker) => {
  for (let i = 0; i < 3; i += 1) breaker.recordFailure(new Error('x'));
};

describe('CircuitBreaker', () => {
  it('stays closed below the failure threshold', () => {
    const { breaker } = make();
    breaker.recordFailure(new Error('x'));
    breaker.recordFailure(new Error('x'));
    expect(breaker.state).toBe(BREAKER_STATE.CLOSED);
    expect(breaker.tryAcquire()).toEqual({ allowed: true, probe: false });
  });

  it('opens at the threshold and reports how long to wait', () => {
    const { breaker, clock } = make();
    for (let i = 0; i < 3; i += 1) breaker.recordFailure(new Error('tts down'));
    expect(breaker.state).toBe(BREAKER_STATE.OPEN);
    expect(breaker.tryAcquire().allowed).toBe(false);
    expect(breaker.retryAfterMs()).toBe(1000);
    clock.t += 400;
    expect(breaker.retryAfterMs()).toBe(600);
    expect(breaker.lastError).toBe('tts down');
  });

  it('a success resets the failure count', () => {
    const { breaker } = make();
    breaker.recordFailure(new Error('x'));
    breaker.recordFailure(new Error('x'));
    breaker.recordSuccess();
    breaker.recordFailure(new Error('x'));
    expect(breaker.state).toBe(BREAKER_STATE.CLOSED);
  });

  it('lets exactly one probe through after the cooldown', () => {
    const { breaker, clock } = make();
    trip(breaker);
    clock.t += 1000;
    expect(breaker.state).toBe(BREAKER_STATE.HALF_OPEN);
    expect(breaker.tryAcquire()).toEqual({ allowed: true, probe: true });
    expect(breaker.tryAcquire().allowed).toBe(false); // a second caller waits for the probe's verdict
  });

  it('closes again when the probe succeeds', () => {
    const { breaker, clock } = make();
    trip(breaker);
    clock.t += 1000;
    breaker.tryAcquire();
    breaker.recordSuccess();
    expect(breaker.state).toBe(BREAKER_STATE.CLOSED);
  });

  it('re-opens with a doubled cooldown (capped) when the probe fails', () => {
    const { breaker, clock } = make();
    trip(breaker);

    clock.t += 1000;
    breaker.tryAcquire();
    breaker.recordFailure(new Error('still down'));
    expect(breaker.state).toBe(BREAKER_STATE.OPEN);
    expect(breaker.retryAfterMs()).toBe(2000);

    clock.t += 2000;
    breaker.tryAcquire();
    breaker.recordFailure(new Error('still down'));
    expect(breaker.retryAfterMs()).toBe(4000);

    clock.t += 4000;
    breaker.tryAcquire();
    breaker.recordFailure(new Error('still down'));
    expect(breaker.retryAfterMs()).toBe(4000); // capped at maxCooldownMs
  });

  it('abandonProbe frees the half-open slot without judging the service', () => {
    const { breaker, clock } = make();
    trip(breaker);
    clock.t += 1000;
    breaker.tryAcquire();
    breaker.abandonProbe();
    expect(breaker.tryAcquire().probe).toBe(true);
  });

  it('threshold 0 disables the breaker', () => {
    const { breaker } = make({ threshold: 0 });
    for (let i = 0; i < 10; i += 1) breaker.recordFailure(new Error('x'));
    expect(breaker.state).toBe(BREAKER_STATE.CLOSED);
  });
});
