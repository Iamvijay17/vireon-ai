const { fingerprintScene, diffFingerprints, sameFingerprints, PARTS } = require('../../src/services/scene/sceneFingerprint');

const scene = (over = {}) => ({
  sceneId: 'sce-1',
  sceneNumber: 3,
  sceneType: 'contentwithimage',
  templateId: 'generative',
  title: 'Why the sky is blue',
  subtitle: 'Rayleigh scattering',
  imagePrompt: 'a clear blue sky over a field',
  imageUrl: 'http://x/img-aaa.png',
  cameraMotion: 'zoom-in',
  transition: 'fade',
  elements: { title: 'Why the sky is blue', body: 'Rayleigh scattering', image: 'http://x/img-aaa.png', captionTimestamps: [{ w: 'a', s: 0 }] },
  storyboard: { layout: 'split-image', visual: { kind: 'image', variant: 0 } },
  audio: { text: 'The sky looks blue because of scattering.', voice: 'female-1', emotion: 'warm', duration: 6.25, file: 'scene3.mp3' },
  ...over,
});

const diff = (a, b, job) => diffFingerprints(fingerprintScene(a, job), fingerprintScene(b, job));

describe('stability', () => {
  it('is deterministic', () => {
    expect(fingerprintScene(scene())).toEqual(fingerprintScene(scene()));
  });

  it('does not depend on the key order of user content', () => {
    const a = scene({ elements: { title: 'T', items: [{ heading: 'a', text: 'b' }] } });
    const b = scene({ elements: { items: [{ text: 'b', heading: 'a' }], title: 'T' } });
    expect(sameFingerprints(fingerprintScene(a), fingerprintScene(b))).toBe(true);
  });

  it('identifies every part', () => {
    expect(Object.keys(fingerprintScene(scene())).sort()).toEqual([...PARTS, 'scene-composition'].sort());
  });

  it('treats a scene with nothing in it as a valid input', () => {
    expect(() => fingerprintScene({})).not.toThrow();
  });
});

describe('a change moves exactly the parts it should', () => {
  it('narration text: script, audio and captions', () => {
    const next = scene({ audio: { ...scene().audio, text: 'Different words entirely.' } });
    expect(diff(scene(), next)).toEqual(['script', 'audio', 'captions']);
  });

  it('a new voice: audio and captions only', () => {
    const next = scene({ audio: { ...scene().audio, voice: 'male-2' } });
    expect(diff(scene(), next)).toEqual(['audio', 'captions']);
  });

  it('a fresh take of the same text and voice (different recording): audio and captions', () => {
    const next = scene({ audio: { ...scene().audio, duration: 6.61 } });
    expect(diff(scene(), next)).toEqual(['audio', 'captions']);
  });

  it('the job-level voice settings feed audio', () => {
    expect(diff(scene(), scene(), { fastAudio: false })).toEqual([]);
    expect(diffFingerprints(fingerprintScene(scene(), { fastAudio: false }), fingerprintScene(scene(), { fastAudio: true }))).toEqual(['audio', 'captions']);
  });

  it('a re-rolled image (new variant and URL): the image alone', () => {
    const next = scene({
      imageUrl: 'http://x/img-bbb.png',
      storyboard: { layout: 'split-image', visual: { kind: 'image', variant: 1 } },
      elements: { ...scene().elements, image: 'http://x/img-bbb.png' },
    });
    expect(diff(scene(), next)).toEqual(['image']);
  });

  it('a different image prompt: the image alone', () => {
    expect(diff(scene(), scene({ imagePrompt: 'a sunset over the sea' }))).toEqual(['image']);
  });

  it('a different layout: the layout alone', () => {
    const next = scene({ storyboard: { layout: 'image-fullbleed', visual: { kind: 'image', variant: 0 } } });
    expect(diff(scene(), next)).toEqual(['layout']);
  });

  it('a different template: the layout alone', () => {
    expect(diff(scene(), scene({ templateId: '003-contentwithimage' }))).toEqual(['layout']);
  });

  it('camera motion: motion alone', () => {
    expect(diff(scene(), scene({ cameraMotion: 'pan-left' }))).toEqual(['motion']);
  });

  it('transition: transition alone', () => {
    expect(diff(scene(), scene({ transition: 'wipe' }))).toEqual(['transition']);
  });

  it('the composable motion spec feeds motion / layout / transition', () => {
    expect(diff(scene(), scene({ composition: { imageMotion: 'slowZoom' } }))).toEqual(['motion']);
    expect(diff(scene(), scene({ composition: { background: 'aurora' } }))).toEqual(['layout']);
    expect(diff(scene(), scene({ composition: { transition: 'wipe' } }))).toEqual(['transition']);
  });
});

describe('derived values do not masquerade as edits', () => {
  it('word timings written back into elements are not a layout change', () => {
    const next = scene({ elements: { ...scene().elements, captionTimestamps: [{ w: 'different', s: 1 }] } });
    expect(diff(scene(), next)).toEqual([]);
  });

  it('the resolved image URL written into elements is not a layout change', () => {
    const next = scene({ elements: { ...scene().elements, image: 'http://x/else.png' } });
    expect(diff(scene(), next)).toEqual([]);
  });

  it('but editing the on-screen text is', () => {
    const next = scene({ elements: { ...scene().elements, body: 'New on-screen copy' } });
    expect(diff(scene(), next)).toEqual(['layout']);
  });
});

describe('scene-composition', () => {
  it('moves whenever any contributing part does, and only then', () => {
    const base = fingerprintScene(scene())['scene-composition'];
    for (const changed of [
      scene({ transition: 'wipe' }),
      scene({ cameraMotion: 'pan-left' }),
      scene({ imageUrl: 'http://x/z.png' }),
      scene({ audio: { ...scene().audio, duration: 9 } }),
      scene({ title: 'Another title' }),
    ]) {
      expect(fingerprintScene(changed)['scene-composition']).not.toBe(base);
    }
    expect(fingerprintScene(scene())['scene-composition']).toBe(base);
  });
});

describe('diffFingerprints', () => {
  it('everything is new against nothing', () => {
    expect(diffFingerprints(null, fingerprintScene(scene()))).toEqual(PARTS);
  });
});
