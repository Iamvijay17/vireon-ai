const { PRESETS, listPresets, presetPatch } = require('../../src/services/scene/stylePresets');
const registry = require('../../src/ir/compositionRegistry');

const textScene = (items = 3) => ({
  sceneType: 'content', title: 'T', audio: { text: 'x' },
  elements: { items: Array.from({ length: items }, (_, i) => ({ heading: '', text: `Point ${i}.` })) },
});
const pictureScene = () => ({ sceneType: 'contentwithimage', title: 'T', imagePrompt: 'a harbour', imageUrl: 'http://x/a.png', elements: { body: 'Body.' } });

describe('presets are made only of what the renderer has', () => {
  it.each(Object.keys(PRESETS))('%s', (id) => {
    for (const scene of [textScene(), textScene(8), pictureScene()]) {
      const patch = presetPatch(id, scene);
      expect(registry.CAMERA_REGISTRY).toContain(patch.cameraMotion);
      expect(registry.TRANSITION_REGISTRY).toContain(patch.transition);
      expect(registry.sanitizeComposition(patch.composition)).toEqual(patch.composition);
    }
  });
});

describe('presetPatch', () => {
  it('cinematic: push-in for text, the picture does the moving for a picture scene', () => {
    expect(presetPatch('cinematic', textScene())).toMatchObject({ cameraMotion: 'zoom-in', transition: 'fade' });
    const p = presetPatch('cinematic', pictureScene());
    expect(p.cameraMotion).toBe('static');
    expect(p.composition.imageMotion).toBe('slowZoom');
  });

  it('never moves the camera and the picture at once', () => {
    for (const id of Object.keys(PRESETS)) {
      const p = presetPatch(id, pictureScene());
      if (p.cameraMotion !== 'static') expect(p.composition.imageMotion).toBe('none');
    }
  });

  it('keeps crowded text still and quiet, whatever the preset', () => {
    for (const id of Object.keys(PRESETS)) {
      const p = presetPatch(id, textScene(7));
      expect(p.cameraMotion).toBe('static');
      expect(p.composition.decoration).toBe('dots');
      expect(['fadeIn', 'fadeSlideUp', 'fadeSlideLeft', 'blurIn']).toContain(p.composition.textMotion);
    }
  });

  it('keeps slots the preset does not set (a deliberate choice survives)', () => {
    const scene = { ...textScene(), composition: { background: 'aurora' } };
    expect(presetPatch('minimal', scene).composition.background).toBe('gradient'); // the preset's own pick wins
    const keeps = presetPatch('minimal', { ...textScene(), composition: { imageMotion: 'slowPan' } });
    expect(keeps.composition.imageMotion).toBe('slowPan');
  });

  it('does not change the layout unless the preset asks and the content fits', () => {
    for (const id of Object.keys(PRESETS)) expect(presetPatch(id, textScene())).not.toHaveProperty('layout');
  });

  it('returns null for an unknown preset', () => {
    expect(presetPatch('neon', textScene())).toBeNull();
  });
});

describe('listPresets', () => {
  it('describes each preset for the Studio', () => {
    const list = listPresets();
    expect(list.map((p) => p.id)).toEqual(['cinematic', 'minimal', 'dynamic']);
    for (const p of list) expect(p).toEqual({ id: expect.any(String), label: expect.any(String), description: expect.any(String) });
  });
});
