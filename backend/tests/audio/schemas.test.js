const config = require('../../src/config');
const {
  voiceInstructionSchema, voiceProfileSchema, previewRequestSchema, segmentSchema,
} = require('../../src/services/audio/pipeline/schemas');
const { classifySegmentError, toSegmentError, SegmentError, SEGMENT_ERROR_CODES } = require('../../src/services/audio/pipeline/errors');

describe('voiceInstructionSchema', () => {
  it('fills natural, professional defaults from an empty object', () => {
    const v = voiceInstructionSchema.parse({});
    expect(v).toMatchObject({ emotion: 'neutral', speed: 1, pitch: 0, style: 'professional', delivery: 'professional', emphasis: [], pauseBefore: null, pauseAfter: null });
  });

  it.each([
    ['emotion', { emotion: 'furious' }],
    ['style', { style: 'robotic' }],
    ['energy', { energy: 1.5 }],
    ['speed too fast', { speed: config.audio.speedMax + 0.5 }],
    ['speed too slow', { speed: config.audio.speedMin - 0.3 }],
    ['pitch', { pitch: config.audio.pitchLimit + 1 }],
    ['pause', { pauseAfter: config.audio.pauses.max + 1 }],
    ['negative pause', { pauseBefore: -5 }],
    ['fractional pause', { pauseBefore: 10.5 }],
  ])('rejects invalid %s', (_label, input) => {
    expect(voiceInstructionSchema.safeParse(input).success).toBe(false);
  });
});

describe('voiceProfileSchema', () => {
  const base = { id: 'professional-narrator', name: 'Professional Narrator', voice: 'custom:Ryan' };

  it('accepts a minimal profile and defaults the model to Qwen3-TTS', () => {
    expect(voiceProfileSchema.parse(base)).toMatchObject({ model: 'Qwen3-TTS', language: 'auto', defaultStyle: 'professional' });
  });

  it('rejects a non-slug id and an unknown language', () => {
    expect(voiceProfileSchema.safeParse({ ...base, id: 'Bad Id!' }).success).toBe(false);
    expect(voiceProfileSchema.safeParse({ ...base, language: 'klingon' }).success).toBe(false);
  });
});

describe('previewRequestSchema', () => {
  it('requires a voice or a profile', () => {
    expect(previewRequestSchema.safeParse({ text: 'hi' }).success).toBe(false);
    expect(previewRequestSchema.safeParse({ text: 'hi', voice: 'custom:Ryan' }).success).toBe(true);
    expect(previewRequestSchema.safeParse({ text: 'hi', voiceProfile: 'professional-narrator' }).success).toBe(true);
  });

  it('rejects empty and over-long text', () => {
    expect(previewRequestSchema.safeParse({ text: '   ', voice: 'custom:Ryan' }).success).toBe(false);
    const long = 'a'.repeat(config.audio.previewMaxChars + 1);
    expect(previewRequestSchema.safeParse({ text: long, voice: 'custom:Ryan' }).success).toBe(false);
  });

  it('rejects an unsupported audio format', () => {
    expect(previewRequestSchema.safeParse({ text: 'hi', voice: 'custom:Ryan', format: 'ogg' }).success).toBe(false);
  });
});

describe('segmentSchema', () => {
  it('keeps original and spoken text as separate fields', () => {
    const seg = segmentSchema.parse({
      id: 'seg_001', index: 0, voice: 'custom:Ryan',
      sourceText: 'Node.js is fast.', spokenText: 'Node JS is fast.', instruction: {},
    });
    expect(seg.sourceText).toBe('Node.js is fast.');
    expect(seg.spokenText).toBe('Node JS is fast.');
    expect(seg.status).toBe('pending');
  });
});

describe('segment error classification', () => {
  it.each([
    ['CUDA out of memory. Tried to allocate', 'GPU_OOM'],
    ['TTS generation timed out', 'TIMEOUT'],
    ['connect ECONNREFUSED 127.0.0.1:7860', 'MODEL_UNAVAILABLE'],
    ['TTS service failed to become ready after 180 seconds.', 'MODEL_UNAVAILABLE'],
    ['Clone voice file not found: x.wav', 'INVALID_INPUT'],
    ['Not a valid WAV file', 'PROCESSING_FAILED'],
    ['something odd', 'UNKNOWN'],
  ])('%s -> %s', (message, code) => {
    expect(classifySegmentError(new Error(message))).toBe(code);
  });

  it('honours an explicit SegmentError code and abort errors', () => {
    expect(classifySegmentError(new SegmentError(SEGMENT_ERROR_CODES.CACHE_FAILED))).toBe('CACHE_FAILED');
    const abort = Object.assign(new Error('x'), { name: 'AbortError' });
    expect(classifySegmentError(abort)).toBe('CANCELLED');
  });

  it('never leaks the raw message or stack into the stored error', () => {
    const stored = toSegmentError(new Error('CUDA out of memory at /secret/path/model.py line 99'));
    expect(JSON.stringify(stored)).not.toMatch(/secret|model\.py/);
    expect(stored.retryable).toBe(true);
    expect(toSegmentError(new Error('Invalid input')).retryable).toBe(false);
  });
});
