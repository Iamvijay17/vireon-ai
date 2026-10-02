const {
  decideRetry, describeRetry, describeExhausted, retryJobId,
} = require('../../src/services/common/retryPolicy');

describe('decideRetry', () => {
  it('retries while the attempt is within budget', () => {
    for (const attempt of [1, 2, 3]) {
      expect(decideRetry({ attempt, maxRetries: 3 }).shouldRetry).toBe(true);
    }
  });

  it('stops once the budget is spent', () => {
    expect(decideRetry({ attempt: 4, maxRetries: 3 }).shouldRetry).toBe(false);
    expect(decideRetry({ attempt: 99, maxRetries: 3 }).shouldRetry).toBe(false);
  });

  it('does not retry attempt 0 - nothing has failed yet', () => {
    // The course worker reads an already-incremented counter, so a 0 there
    // means the pipeline never recorded a failure and this is not a retry
    // situation at all.
    expect(decideRetry({ attempt: 0, maxRetries: 3 }).shouldRetry).toBe(false);
  });

  it('honours the callers veto regardless of budget', () => {
    // e.g. a manual `retry` action must not start its own automatic loop.
    expect(decideRetry({ attempt: 1, maxRetries: 3, eligible: false }).shouldRetry).toBe(false);
  });

  it('defaults to a 3-retry budget', () => {
    expect(decideRetry({ attempt: 3 }).shouldRetry).toBe(true);
    expect(decideRetry({ attempt: 4 }).shouldRetry).toBe(false);
  });

  it('backs off exponentially across attempts', () => {
    expect(decideRetry({ attempt: 1 }).delayMs).toBe(5000);
    expect(decideRetry({ attempt: 2 }).delayMs).toBe(10000);
    expect(decideRetry({ attempt: 3 }).delayMs).toBe(20000);
  });

  it('returns a nextRetryAt consistent with the delay', () => {
    const before = Date.now();
    const { nextRetryAt, delayMs } = decideRetry({ attempt: 1 });
    expect(nextRetryAt).toBeInstanceOf(Date);
    expect(nextRetryAt.getTime()).toBeGreaterThanOrEqual(before + delayMs);
  });

  it('omits scheduling fields when it is not retrying', () => {
    const decision = decideRetry({ attempt: 4, maxRetries: 3 });
    expect(decision.delayMs).toBeUndefined();
    expect(decision.nextRetryAt).toBeUndefined();
  });

  it('rejects a non-integer attempt rather than scheduling a NaN delay', () => {
    expect(decideRetry({ attempt: undefined }).shouldRetry).toBe(false);
    expect(decideRetry({ attempt: 1.5 }).shouldRetry).toBe(false);
    expect(decideRetry({}).shouldRetry).toBe(false);
  });
});

describe('retry messages', () => {
  it('reads the same for both pipelines', () => {
    expect(describeRetry({ step: 'GENERATING_AUDIO', attempt: 2, maxRetries: 3, delayMs: 10000 }))
      .toBe('GENERATING_AUDIO failed (attempt 2/3) - retrying in 10s');
  });

  it('includes the friendly cause when one is available', () => {
    expect(describeRetry({
      step: 'RENDERING', attempt: 1, maxRetries: 3, delayMs: 5000, reason: 'Video rendering failed',
    })).toBe('RENDERING failed (attempt 1/3): Video rendering failed - retrying in 5s');
  });

  it('describes an exhausted budget', () => {
    expect(describeExhausted({ step: 'RENDERING', attempt: 4, reason: 'render engine error' }))
      .toBe('RENDERING failed after 4 attempts: render engine error');
    expect(describeExhausted({ step: 'RENDERING', attempt: 4 }))
      .toBe('RENDERING failed after 4 attempts');
  });
});

describe('retryJobId', () => {
  it('never collides with the entity id itself', () => {
    // BullMQ drops a duplicate job id silently - a retry that is "scheduled"
    // and then never runs.
    expect(retryJobId('job-ABCD1234', 1)).toBe('job-ABCD1234:retry:1');
    expect(retryJobId('job-ABCD1234', 1)).not.toBe('job-ABCD1234');
  });

  it('is distinct per attempt', () => {
    expect(retryJobId('v1', 1)).not.toBe(retryJobId('v1', 2));
  });
});
