const { classifyError } = require('../../src/utils/errorMessages');
const { computeBackoffMs } = require('../../src/utils/backoff');
const {
  AppError, NotFoundError, ValidationError, ConflictError, SchemaValidationError, RenderError,
} = require('../../src/utils/errors');

describe('classifyError', () => {
  /**
   * These patterns match the exact message shapes LLMService, sceneSynthesis,
   * avatarService and RemotionService throw. If one of those services
   * rewords its retry-exhausted message, the corresponding case here fails -
   * which is the point: the UI silently degrades to raw stack-trace text
   * otherwise, with nothing to notice it.
   */
  it.each([
    ['LM Studio failed after 3 attempts: socket hang up', 'AI model server'],
    ['Ollama failed after 3 attempts: timeout', 'AI model server'],
    ['TTS failed after 3 attempts: connection reset', 'text-to-speech'],
    ['Avatar generation failed after 2 attempts', 'animation service'],
    ['Remotion rendering failed: exit code 1', 'render engine'],
  ])('maps %s to a friendly message mentioning %s', (message, expected) => {
    const { friendly, detail } = classifyError(new Error(message), 'RENDERING');
    expect(friendly).toContain(expected);
    expect(detail).toBe(message); // the raw text is always kept for logs
  });

  it.each(['ECONNREFUSED', 'ENOTFOUND', 'ETIMEDOUT', 'ECONNRESET'])(
    'treats %s as a connectivity problem',
    (code) => {
      expect(classifyError(new Error(`connect ${code} 127.0.0.1:1234`)).friendly)
        .toContain('temporary connectivity');
    }
  );

  it('falls back to a step-labelled message for an unrecognised failure', () => {
    expect(classifyError(new Error('something odd'), 'UPLOADING').friendly)
      .toBe('UPLOADING failed: something odd');
  });

  it('labels a failure with no step generically', () => {
    expect(classifyError(new Error('something odd')).friendly)
      .toBe('Job failed: something odd');
  });

  it('survives a non-Error throw', () => {
    // Nothing should throw *inside* the error path - that turns a job
    // failure into a worker crash.
    expect(classifyError('plain string', 'RENDERING').detail).toBe('plain string');
    expect(() => classifyError(null)).not.toThrow();
    expect(() => classifyError(undefined)).not.toThrow();
  });
});

describe('computeBackoffMs', () => {
  it('doubles per attempt starting at the base delay', () => {
    expect(computeBackoffMs(1)).toBe(5000);
    expect(computeBackoffMs(2)).toBe(10000);
    expect(computeBackoffMs(3)).toBe(20000);
  });

  it('caps so a high attempt count cannot schedule a retry hours out', () => {
    expect(computeBackoffMs(10)).toBe(60_000);
    expect(computeBackoffMs(100)).toBe(60_000);
  });

  it('honours custom base and max', () => {
    expect(computeBackoffMs(1, { base: 100, max: 500 })).toBe(100);
    expect(computeBackoffMs(4, { base: 100, max: 500 })).toBe(500);
  });
});

describe('typed errors', () => {
  it('carries the status the error handler responds with', () => {
    expect(new NotFoundError('Job not found').status).toBe(404);
    expect(new ValidationError('bad input').status).toBe(400);
    expect(new ConflictError('already running').status).toBe(409);
    expect(new RenderError().status).toBe(500);
  });

  it('is a real Error with a stack - the reason these replaced object literals', () => {
    const err = new NotFoundError('Job not found');
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(AppError);
    expect(typeof err.stack).toBe('string');
    expect(err.stack.length).toBeGreaterThan(0);
  });

  it('names itself after its own class, not AppError', () => {
    expect(new NotFoundError().name).toBe('NotFoundError');
    expect(new ValidationError().name).toBe('ValidationError');
  });

  it('keeps per-field details on a SchemaValidationError', () => {
    const details = [{ field: 'title', message: 'Required' }];
    const err = new SchemaValidationError(details);
    expect(err.status).toBe(400);
    expect(err.details).toBe(details);
    expect(err).toBeInstanceOf(AppError);
  });
});
