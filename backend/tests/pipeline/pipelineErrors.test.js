jest.mock('../../src/services/common/LoggerService', () => ({
  info: jest.fn(), warn: jest.fn(), error: jest.fn(), success: jest.fn(), debug: jest.fn(),
}));

const {
  StageTimeoutError, JobStalledError, CODES, toStructuredError, sanitizeMessage, isPermanent, publicError,
} = require('../../src/services/pipeline/pipelineErrors');
const { ValidationError, SchemaValidationError } = require('../../src/utils/errors');
const { STAGES } = require('../../src/services/pipeline/stages');

describe('toStructuredError', () => {
  it('produces exactly the documented shape (plus a sanitized detail)', () => {
    const e = toStructuredError(new Error('Remotion rendering failed after 2 attempts: exit 1'), { stage: STAGES.RENDER, attempt: 2 });
    expect(Object.keys(e).sort()).toEqual(['attempt', 'code', 'detail', 'message', 'retryable', 'stage', 'timestamp']);
    expect(e).toMatchObject({ code: CODES.RENDER_FAILED, stage: 'render', attempt: 2, retryable: true });
    expect(Number.isNaN(Date.parse(e.timestamp))).toBe(false);
  });

  it.each([
    [STAGES.SCRIPT, CODES.SCRIPT_FAILED],
    [STAGES.AUDIO, CODES.TTS_FAILED],
    [STAGES.IMAGES, CODES.IMAGE_FAILED],
    [STAGES.ASSETS, CODES.ASSETS_FAILED],
    [STAGES.RENDER, CODES.RENDER_FAILED],
    [STAGES.UPLOAD, CODES.UPLOAD_FAILED],
  ])('a generic failure in %s is %s and retryable', (stage, code) => {
    const e = toStructuredError(new Error('something odd'), { stage });
    expect(e.code).toBe(code);
    expect(e.retryable).toBe(true);
  });

  it('classifies a stage timeout as retryable STAGE_TIMEOUT', () => {
    const e = toStructuredError(new StageTimeoutError('audio', 90_000), { stage: 'audio' });
    expect(e).toMatchObject({ code: CODES.STAGE_TIMEOUT, retryable: true });
    expect(e.message).toMatch(/timed out/i);
  });

  it('classifies a stalled-worker failure as retryable JOB_STALLED', () => {
    expect(toStructuredError(new JobStalledError(), { stage: 'render' })).toMatchObject({ code: CODES.JOB_STALLED, retryable: true });
  });

  it('classifies connection errors as retryable NETWORK_ERROR', () => {
    const err = Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:11434'), { code: 'ECONNREFUSED' });
    expect(toStructuredError(err, { stage: 'script' })).toMatchObject({ code: CODES.NETWORK_ERROR, retryable: true });
  });

  it('never exposes a stack trace in message or detail', () => {
    const err = new Error('boom\n    at Object.<anonymous> (C:\\secret\\file.js:1:1)\n    at next (node:internal:2:2)');
    const e = toStructuredError(err, { stage: 'render' });
    expect(e.message).not.toMatch(/\bat .*\(/);
    expect(e.detail).not.toMatch(/\bat .*\(/);
    expect(JSON.stringify(e)).not.toContain('secret');
  });
});

describe('permanent vs retryable', () => {
  const permanent = [
    ['a ValidationError', new ValidationError('bad input')],
    ['a SchemaValidationError', new SchemaValidationError([{ path: 'x' }])],
    ['a zod error', Object.assign(new Error('invalid'), { name: 'ZodError' })],
    ['a configuration error flagged permanent', Object.assign(new Error('COMFYUI_CHECKPOINT is not set'), { permanent: true })],
    ['pre-render validation', new Error('Pre-render validation failed:\n- scene 2 has no audio')],
    ['a failed scene graph compile', new Error('SceneGraph compile failed at script:\n- scene 1 templateId')],
    ['a missing remotion binary', new Error("Remotion CLI not found at x. Run 'npm install'")],
    ['a full disk', Object.assign(new Error('write failed'), { code: 'ENOSPC' })],
  ];
  it.each(permanent)('%s cannot be retried', (_name, err) => {
    expect(isPermanent(err)).toBe(true);
    expect(toStructuredError(err, { stage: 'render' }).retryable).toBe(false);
  });

  const transient = [
    ['an LLM outage', new Error('Ollama failed after 3 attempts: socket hang up')],
    ['a TTS timeout', new Error('TTS failed: timed out')],
    ['a render crash', new Error('Remotion rendering failed after 2 attempts: exit 1')],
    ['an unknown error', new Error('???')],
  ];
  it.each(transient)('%s is retried', (_name, err) => {
    expect(isPermanent(err)).toBe(false);
    expect(toStructuredError(err, { stage: 'audio' }).retryable).toBe(true);
  });

  it('flags a full disk with its own code', () => {
    expect(toStructuredError(Object.assign(new Error('x'), { code: 'ENOSPC' }), { stage: 'upload' }).code).toBe(CODES.DISK_FULL);
  });
});

describe('helpers', () => {
  it('sanitizeMessage drops stack frames and truncates', () => {
    expect(sanitizeMessage('failed\n    at fn (file.js:1:1)\nnext line')).toBe('failed\nnext line');
    expect(sanitizeMessage('x'.repeat(900), 100)).toHaveLength(100);
  });

  it('publicError keeps only the contract fields', () => {
    const full = toStructuredError(new Error('x'), { stage: 'audio' });
    expect(Object.keys(publicError(full)).sort()).toEqual(['attempt', 'code', 'message', 'retryable', 'stage', 'timestamp']);
    expect(publicError(null)).toBeNull();
  });
});
