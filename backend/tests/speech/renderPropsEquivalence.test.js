/**
 * Speech timing reaches Remotion through two builders (the legacy one in
 * RemotionService.prepareAssets and the IR compiler). They must stay identical
 * with the speech flags on, and the flag-off output must be exactly what it was
 * before this feature existed.
 */
jest.mock('../../src/services/common/LoggerService', () => ({
  info: jest.fn(), warn: jest.fn(), debug: jest.fn(), error: jest.fn(), success: jest.fn(), render: jest.fn(),
}));
jest.mock('../../src/services/common/MetricsService', () => ({ recordDuration: jest.fn(), increment: jest.fn() }));
jest.mock('../../src/services/common/JobEventService', () => ({ append: jest.fn().mockResolvedValue() }));
jest.mock('../../src/services/storage/providers', () => ({
  getStorageProvider: () => ({ getPublicUrl: (id, category, file) => `http://minio/${id}/${category}/${file}` }),
}));

const fs = require('fs');
const config = require('../../src/config');
const RemotionService = require('../../src/services/video/RemotionService');
const ScriptParserService = require('../../src/services/video/ScriptParserService');
const { compile } = require('../../src/ir');
const { toRenderProps, diffRenderProps } = require('../../src/ir/toRenderProps');

const flags = { ...config.speech };
beforeEach(() => {
  jest.spyOn(fs.promises, 'mkdir').mockResolvedValue();
  jest.spyOn(fs.promises, 'writeFile').mockResolvedValue();
});
afterEach(() => {
  jest.restoreAllMocks();
  Object.assign(config.speech, flags);
});

const timeline = (n) => ({
  version: 1, sceneNumber: n, alignmentStatus: 'complete', alignmentProvider: 'faster-whisper', alignmentVersion: 'v', granularity: 'word',
  duration: 6, createdAt: '2026-10-08T00:00:00.000Z', fallbackReasons: [], stats: { wordCount: 2 },
  segments: [{ segmentId: `s0${n}-seg001`, index: 0, text: `Narration ${n}.`, wordCount: 2, start: 0, end: 2, duration: 2, granularity: 'word' }],
  words: [
    { wordId: 'w1', segmentId: `s0${n}-seg001`, index: 0, captionIndex: 0, text: 'Narration', start: 0, end: 0.8, duration: 0.8 },
    { wordId: 'w2', segmentId: `s0${n}-seg001`, index: 1, captionIndex: 1, text: `${n}.`, start: 0.9, end: 1.2, duration: 0.3 },
  ],
  phrases: [], pauses: [],
});

const script = (withSpeech) => {
  const base = ScriptParserService.validate({
    title: 'A video', description: 'About things', tags: ['a'],
    scenes: [1, 2].map((n) => ({
      sceneNumber: n, sceneType: n === 1 ? 'title' : 'content', title: `Scene ${n}`, subtitle: '', backgroundColor: '#112233', transition: 'fade',
      imagePrompt: '', cameraMotion: 'static', animation: '', scene_meta: { content: ['One.', 'Two.'] },
      audio: { text: `Narration ${n}.`, voice: 'custom:Ryan', emotion: 'calm' },
    })),
  }, 'educational', { seed: 'job-1' });
  return {
    ...base,
    scenes: base.scenes.map((s) => ({
      ...s,
      duration: 6,
      audio: {
        ...s.audio, file: `scene${s.sceneNumber}.mp3`, duration: 6,
        ...(withSpeech ? { speechTimeline: timeline(s.sceneNumber) } : {}),
      },
      ...(withSpeech && s.sceneNumber === 2 ? { speechTiming: { timingMode: 'speech', trigger: 'phrase', phrase: 'narration', animation: 'scaleIn' } } : {}),
    })),
  };
};

const jobConfig = { type: 'educational', language: 'english', resolution: '1920x1080', aspectRatio: '16:9', quality: 'standard', fontPairing: 'modern-sans', captionAnimation: 'popScale' };
const both = async (s) => {
  const legacy = await RemotionService.prepareAssets('job-1', s, jobConfig);
  const { ir } = compile({ jobId: 'job-1', script: s, jobConfig, stage: 'render', audioUrlFor: (n) => `http://minio/job-1/audio/scene${n}.mp3` });
  return { legacy, fromIr: toRenderProps(ir) };
};

describe('speech render props', () => {
  it('flags off: a script carrying speech data renders props identical to one without it', async () => {
    config.speech.drivenAnimationEnabled = false;
    const withSpeech = await both(script(true));
    const without = await both(script(false));
    expect(withSpeech.legacy).toEqual(without.legacy);
    expect(withSpeech.fromIr).toEqual(without.fromIr);
    expect(JSON.stringify(withSpeech.legacy)).not.toMatch(/"speech"|speechTiming/);
  });

  it('flag on: the timeline and the scene timing config reach the renderer', async () => {
    config.speech.drivenAnimationEnabled = true;
    const { legacy } = await both(script(true));
    expect(legacy.scenes[0].audio.speech.words).toHaveLength(2);
    expect(legacy.scenes[0].audio.speech).not.toHaveProperty('createdAt');
    expect(legacy.scenes[0]).not.toHaveProperty('speechTiming');
    expect(legacy.scenes[1].speechTiming).toMatchObject({ timingMode: 'speech', trigger: 'phrase', phrase: 'narration', animation: 'scaleIn' });
  });

  it('flag on: the legacy builder and the IR compiler agree field for field', async () => {
    config.speech.drivenAnimationEnabled = true;
    const { legacy, fromIr } = await both(script(true));
    expect(diffRenderProps(legacy, fromIr)).toEqual([]);
  });

  it('flag on but a scene has no timeline (legacy audio): that scene is unchanged', async () => {
    config.speech.drivenAnimationEnabled = true;
    const { legacy, fromIr } = await both(script(false));
    expect(legacy.scenes.every((s) => !s.audio.speech && !s.speechTiming)).toBe(true);
    expect(diffRenderProps(legacy, fromIr)).toEqual([]);
  });
});
