jest.mock('../../src/services/common/LoggerService', () => ({
  info: jest.fn(), warn: jest.fn(), error: jest.fn(), success: jest.fn(), debug: jest.fn(),
}));

const { CODES, toStructuredError } = require('../../src/services/pipeline/pipelineErrors');
const { decideRetry } = require('../../src/services/common/retryPolicy');
const {
  GpuServiceUnavailableError, DuplicateGpuTaskError, GpuAdmissionTimeoutError,
} = require('../../src/services/gpu/gpuErrors');

describe('GPU scheduler errors in the job pipeline', () => {
  it.each([
    ['unavailable', new GpuServiceUnavailableError('tts', { retryAfterMs: 30_000, reason: 'ECONNREFUSED' }), CODES.GPU_UNAVAILABLE],
    ['duplicate', new DuplicateGpuTaskError('job1:audio:tts'), CODES.GPU_DUPLICATE],
    ['admission timeout', new GpuAdmissionTimeoutError('comfyui', 120_000), CODES.GPU_BUSY],
  ])('%s gets its own code and is retryable', (_name, err, code) => {
    const structured = toStructuredError(err, { stage: 'audio', attempt: 1 });
    expect(structured.code).toBe(code);
    expect(structured.retryable).toBe(true); // never permanent: nothing is wrong with the job
    expect(decideRetry({ attempt: 1, maxRetries: 3, eligible: structured.retryable }).shouldRetry).toBe(true);
  });

  it('says how long to wait in the message', () => {
    const err = new GpuServiceUnavailableError('tts', { retryAfterMs: 30_000, reason: 'ECONNREFUSED' });
    expect(err.message).toMatch(/tts service is unavailable/);
    expect(err.message).toMatch(/30s/);
    expect(err.retryAfterMs).toBe(30_000);
  });
});
