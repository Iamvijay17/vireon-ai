const crypto = require('crypto');
const hashInputs = require('../../src/utils/hashInputs');
const keys = require('../../src/services/cache/cacheKeys');
const { fingerprintScene } = require('../../src/services/scene/sceneFingerprint');

const imageParams = (over = {}) => ({
  prompt: 'a lighthouse at dusk', negative: 'text', seed: 12345, width: 1024, height: 576, outWidth: 1024, outHeight: 576,
  steps: 25, cfg: 7, sampler: 'euler', scheduler: 'normal', checkpoint: 'model.safetensors', ...over,
});
const WORKFLOW = '{"3":{"class_type":"KSampler"}}';

describe('image key', () => {
  it('is byte-identical to the formula the cache bucket was built with', () => {
    // If this fails, every picture already cached becomes unreachable. Do not "fix" the test.
    const legacy = hashInputs({ ...imageParams(), workflow: crypto.createHash('sha256').update(WORKFLOW).digest('hex') });
    expect(keys.imageKey(imageParams(), WORKFLOW)).toBe(legacy);
  });

  it('does not depend on property order', () => {
    const reordered = Object.fromEntries(Object.entries(imageParams()).reverse());
    expect(keys.imageKey(reordered, WORKFLOW)).toBe(keys.imageKey(imageParams(), WORKFLOW));
  });

  it.each([
    ['prompt', { prompt: 'a different scene' }],
    ['negative prompt', { negative: 'blurry' }],
    ['seed', { seed: 999 }],
    ['sampling width', { width: 576 }],
    ['sampling height', { height: 1024 }],
    ['output width', { outWidth: 2048 }],
    ['steps', { steps: 15 }],
    ['cfg', { cfg: 3 }],
    ['sampler', { sampler: 'dpmpp' }],
    ['scheduler', { scheduler: 'karras' }],
    ['model', { checkpoint: 'other.safetensors' }],
  ])('changes when the %s changes', (_name, patch) => {
    expect(keys.imageKey(imageParams(patch), WORKFLOW)).not.toBe(keys.imageKey(imageParams(), WORKFLOW));
  });

  it('changes when the workflow file changes', () => {
    expect(keys.imageKey(imageParams(), '{"3":{"class_type":"Other"}}')).not.toBe(keys.imageKey(imageParams(), WORKFLOW));
  });

  it('is a 64-character hex digest', () => {
    expect(keys.imageKey(imageParams(), WORKFLOW)).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('tts keys', () => {
  it('the legacy key is the shared stable hash', () => {
    const inputs = { text: 'Hello.', mode: 'custom', speaker: 'Ryan', seed: 1, modelSize: '1.7B' };
    expect(keys.ttsKey(inputs)).toBe(hashInputs(inputs));
    expect(keys.ttsKey({ ...inputs, text: 'Goodbye.' })).not.toBe(keys.ttsKey(inputs));
    expect(keys.ttsKey({ ...inputs, modelSize: '0.6B' })).not.toBe(keys.ttsKey(inputs));
  });

  it('segment keys are the pipeline\'s own raw and processed keys, and a processing change only moves the processed one', () => {
    const raw = keys.ttsSegmentRawKey({ spokenText: 'Hi there.', resolved: { mode: 'custom', speaker: 'Ryan' }, instruct: 'warm', seed: 7, modelSize: '1.7B' });
    const rawLouder = keys.ttsSegmentRawKey({ spokenText: 'Hi there.', resolved: { mode: 'custom', speaker: 'Ryan' }, instruct: 'warm', seed: 7, modelSize: '1.7B' });
    expect(raw).toBe(rawLouder);
    const slow = keys.ttsSegmentProcessedKey({ rawKey: raw, speed: 0.9, pitch: 0 });
    const fast = keys.ttsSegmentProcessedKey({ rawKey: raw, speed: 1.1, pitch: 0 });
    expect(slow).not.toBe(fast);
  });
});

describe('alignment key', () => {
  const base = { audioKey: 'abc', spokenText: 'Hello world', provider: 'faster-whisper', model: 'small', version: 1 };
  it('depends on the audio and on what measured it', () => {
    const k = keys.alignmentKey(base);
    expect(keys.alignmentKey({ ...base })).toBe(k);
    for (const patch of [{ audioKey: 'def' }, { spokenText: 'Hello there' }, { provider: 'other' }, { model: 'large' }, { version: 2 }]) {
      expect(keys.alignmentKey({ ...base, ...patch })).not.toBe(k);
    }
  });
});

describe('composition key', () => {
  const scene = (over = {}) => ({
    sceneId: 'sce-1', sceneNumber: 1, sceneType: 'content', templateId: 'generative', title: 'T', cameraMotion: 'static', transition: 'fade',
    elements: { title: 'T', items: [{ text: 'a' }] }, storyboard: { layout: 'stack-list' }, audio: { text: 'Hi.', voice: 'v', duration: 4 }, ...over,
  });
  const key = (s, video) => keys.compositionKey({ fingerprints: fingerprintScene(s), video });

  it('is stable for the same scene', () => {
    expect(key(scene())).toBe(key(scene()));
  });

  it('does not depend on the scene\'s id or position (resource ids are not inputs)', () => {
    expect(key(scene({ sceneId: 'sce-other', sceneNumber: 9 }))).toBe(key(scene()));
  });

  it.each([
    ['its narration', { audio: { text: 'Different.', voice: 'v', duration: 4 } }],
    ['its layout', { storyboard: { layout: 'grid' } }],
    ['its camera', { cameraMotion: 'zoom-in' }],
    ['its transition', { transition: 'wipe' }],
    ['its picture', { imageUrl: 'http://x/a.png' }],
  ])('changes with %s', (_name, patch) => {
    expect(key(scene(patch))).not.toBe(key(scene()));
  });

  it('changes with the video-level settings that change how it is drawn', () => {
    expect(key(scene(), { aspectRatio: '9:16' })).not.toBe(key(scene(), { aspectRatio: '16:9' }));
    expect(key(scene(), { fontPairing: 'modern-sans' })).not.toBe(key(scene()));
  });
});

describe('render key', () => {
  const assets = { title: 'A', scenes: [{ sceneNumber: 1, layout: 'grid' }] };
  it('is the same for the same render-props and changes with any of them', () => {
    expect(keys.renderKey(assets)).toBe(keys.renderKey({ ...assets }));
    expect(keys.renderKey({ ...assets, scenes: [{ sceneNumber: 1, layout: 'timeline' }] })).not.toBe(keys.renderKey(assets));
  });
  it('changes with quality', () => {
    expect(keys.renderKey(assets, { quality: 'draft' })).not.toBe(keys.renderKey(assets, { quality: 'hd' }));
  });
});

describe('script key', () => {
  const base = { topic: 'How tides work', videoType: 'educational', language: 'english', durationMinutes: 5, llmModel: 'gemma', directorVersion: 2 };
  it('normalises the topic and changes with every input', () => {
    expect(keys.scriptKey({ ...base, topic: '  how TIDES work ' })).toBe(keys.scriptKey(base));
    for (const patch of [{ topic: 'other' }, { videoType: 'story' }, { language: 'hindi' }, { durationMinutes: 10 }, { llmModel: 'qwen' }, { directorVersion: 3 }]) {
      expect(keys.scriptKey({ ...base, ...patch })).not.toBe(keys.scriptKey(base));
    }
  });
});
