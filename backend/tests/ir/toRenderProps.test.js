const { toRenderProps, diffRenderProps } = require('../../src/ir/toRenderProps');

const irScene = (over = {}) => ({
  sceneNumber: 1,
  sceneId: 'sce-ABCD1234',
  sceneType: 'title',
  title: 'T',
  subtitle: 'S',
  timing: { durationSeconds: 8 },
  backgroundColor: '#fff',
  transition: 'fade',
  imagePrompt: '',
  cameraMotion: 'none',
  animation: 'none',
  imageUrl: '',
  templateId: 'generative',
  elements: {},
  audio: { url: 'http://x/a.mp3', durationSeconds: 8 },
  ...over,
});

const ir = (scenes) => ({
  title: 'V',
  description: '',
  video: { resolution: '1080p', aspectRatio: '16:9', quality: 'standard', fontPairing: 'default', type: 'educational', captionAnimation: 'fadeInUp' },
  scenes,
});

describe('toRenderProps sceneId', () => {
  it('passes the script\'s real sceneId through, so the render seeds like the preview', () => {
    const props = toRenderProps(ir([irScene()]));
    expect(props.scenes[0].sceneId).toBe('sce-ABCD1234');
  });

  it('omits the synthesized scene-N id, matching the legacy builder for scripts that never had one', () => {
    const props = toRenderProps(ir([irScene({ sceneId: 'scene-1' })]));
    expect(props.scenes[0].sceneId).toBeUndefined();
  });

  it('does not create a shadow diff against a legacy scene that carries the same id', () => {
    const fromIr = toRenderProps(ir([irScene()]));
    const legacy = JSON.parse(JSON.stringify(fromIr));
    expect(diffRenderProps(legacy, fromIr)).toEqual([]);
  });
});
