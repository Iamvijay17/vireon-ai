const { seedForSegment, rawCacheKey, processedCacheKey, processingFingerprint, KEY_VERSION } = require('../../src/services/audio/pipeline/cacheKeys');

const resolved = { mode: 'custom', speaker: 'Ryan' };
const base = { spokenText: 'Hello there.', resolved, instruct: 'Speak naturally.', seed: 42, modelSize: '1.7B', language: 'auto', format: 'wav' };

describe('rawCacheKey', () => {
  it('is stable for identical inputs', () => {
    expect(rawCacheKey(base)).toBe(rawCacheKey({ ...base }));
    expect(rawCacheKey(base)).toMatch(/^[0-9a-f]{64}$/);
  });

  it.each([
    ['spoken text', { spokenText: 'Hello there!' }],
    ['speaker', { resolved: { mode: 'custom', speaker: 'Serena' } }],
    ['instruct', { instruct: 'Speak slowly.' }],
    ['seed', { seed: 43 }],
    ['model size', { modelSize: '0.6B' }],
    ['language', { language: 'english' }],
    ['format', { format: 'mp3' }],
  ])('changes when %s changes', (_n, patch) => {
    expect(rawCacheKey({ ...base, ...patch })).not.toBe(rawCacheKey(base));
  });

  it('ignores instruct for voice-clone mode, where the model does not use it', () => {
    const clone = { mode: 'clone', file: 'a.wav' };
    expect(rawCacheKey({ ...base, resolved: clone, instruct: 'A' })).toBe(rawCacheKey({ ...base, resolved: clone, instruct: 'B' }));
  });

  it('is versioned so all entries can be retired at once', () => {
    expect(KEY_VERSION).toBeGreaterThanOrEqual(2);
  });
});

describe('processedCacheKey', () => {
  const rawKey = rawCacheKey(base);

  it('depends on the raw key, speed, pitch and the processing settings', () => {
    const k = processedCacheKey({ rawKey, speed: 1, pitch: 0 });
    expect(processedCacheKey({ rawKey, speed: 1, pitch: 0 })).toBe(k);
    expect(processedCacheKey({ rawKey: 'other', speed: 1, pitch: 0 })).not.toBe(k);
    expect(processedCacheKey({ rawKey, speed: 1.1, pitch: 0 })).not.toBe(k);
    expect(processedCacheKey({ rawKey, speed: 1, pitch: 1 })).not.toBe(k);
    expect(processedCacheKey({ rawKey, speed: 1, pitch: 0, processing: { ...processingFingerprint(), targetLoudness: -14 } })).not.toBe(k);
  });

  it('does not equal the raw key (separate cache entries)', () => {
    expect(processedCacheKey({ rawKey })).not.toBe(rawKey);
  });
});

describe('seedForSegment', () => {
  it('is deterministic per (voice, text) and distinct across texts', () => {
    expect(seedForSegment('custom:Ryan', 'a')).toBe(seedForSegment('custom:Ryan', 'a'));
    expect(seedForSegment('custom:Ryan', 'a')).not.toBe(seedForSegment('custom:Ryan', 'b'));
  });

  it('pins designed voices to the description so identity stays consistent', () => {
    expect(seedForSegment('design:deep calm man', 'a')).toBe(seedForSegment('design:deep calm man', 'b'));
  });
});
