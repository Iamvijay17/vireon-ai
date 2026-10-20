jest.mock('../../../src/services/common/LoggerService', () => ({
  info: jest.fn(), warn: jest.fn(), error: jest.fn(), success: jest.fn(), debug: jest.fn(),
}));

const VideoQualityService = require('../../../src/services/qc/video/VideoQualityService');

const RATE = 8000;
const FRAME_BYTES = 32 * 18;

const tone = (sec) => {
  const s = new Int16Array(sec * RATE);
  for (let i = 0; i < s.length; i += 1) s[i] = Math.round(0.3 * 32767 * Math.sin((2 * Math.PI * 440 * i) / RATE));
  return Buffer.from(s.buffer);
};
const silence = (sec) => Buffer.alloc(sec * RATE * 2);
const bright = (frames) => Buffer.alloc(frames * FRAME_BYTES, 120);
const black = (frames) => Buffer.alloc(frames * FRAME_BYTES, 0);

const goodProbe = { formatName: 'mp4', durationSec: 6, sizeBytes: 5000, video: { codec: 'h264', width: 320, height: 180, fps: 30, durationSec: 6 }, audio: { codec: 'aac', channels: 2, sampleRate: 44100, durationSec: 6 } };

const scenes = [1, 2, 3].map((n) => ({ sceneNumber: n, duration: 2, audio: { text: 'Some narration here.', duration: 2, file: `scene${n}.mp3` } }));

/** Injected media layer: a healthy 6s video unless a test overrides a piece. */
function deps(over = {}) {
  return {
    stat: jest.fn(async () => ({ size: 5000 })),
    resolveTools: jest.fn(async () => ({ ffmpeg: 'ffmpeg', ffprobe: 'ffprobe', source: 'system' })),
    probe: jest.fn(async () => goodProbe),
    decodeAudio: jest.fn(async () => ({ pcm: tone(6), sampleRate: RATE, errors: [] })),
    decodeFrames: jest.fn(async () => ({ gray: bright(12), frameBytes: FRAME_BYTES, fps: 2, errors: [] })),
    objectExists: jest.fn(async () => true),
    probeImage: jest.fn(async () => null),
    ...over,
  };
}

const run = (over = {}, args = {}) => VideoQualityService.run({ jobId: 'job1', scenes, videoPath: '/jobs/job1/render/video.mp4', resolution: '320x180', deps: deps(over), ...args });
const byCheck = (report, id) => report.checks.find((c) => c.id === id);

describe('VideoQualityService orchestration', () => {
  it('passes a healthy video and records what it measured', async () => {
    const report = await run();
    expect(report.status).toBe('passed');
    expect(report.checks.every((c) => ['pass', 'skipped'].includes(c.status))).toBe(true);
    expect(report.media).toMatchObject({ durationSec: 6, width: 320, height: 180, videoCodec: 'h264', audioCodec: 'aac', expectedSec: 6, tools: 'system' });
  });

  it('fails a missing file and skips everything that needs one', async () => {
    const report = await run({ stat: jest.fn().mockRejectedValue(Object.assign(new Error('nope'), { code: 'ENOENT' })) });
    expect(report.passed).toBe(false);
    expect(byCheck(report, 'video-file').status).toBe('fail');
    expect(byCheck(report, 'video-decodable')).toMatchObject({ status: 'skipped', note: expect.stringMatching(/no video file/) });
  });

  it('fails an empty file', async () => {
    const report = await run({ stat: jest.fn(async () => ({ size: 0 })) });
    expect(report.issues[0]).toMatchObject({ check: 'video-file', severity: 'error', message: expect.stringMatching(/empty/) });
  });

  it('fails when the container cannot be read, with ffmpeg\'s noise tidied away', async () => {
    const probe = jest.fn().mockRejectedValue(Object.assign(new Error('Command failed'), {
      stderr: Buffer.from('[mov,mp4,m4a,3gp,3g2,mj2 @ 000002ee12a369c0] moov atom not found\n/jobs/job1/render/video.mp4: Invalid data found when processing input\n'),
    }));
    const report = await run({ probe });
    const [issue] = report.issues;
    expect(issue).toMatchObject({ check: 'video-decodable', severity: 'error' });
    expect(issue.message).toContain('moov atom not found');
    expect(issue.message).not.toMatch(/000002ee/); // the allocator address
    expect(issue.message).not.toContain('/jobs/job1'); // the file path
    expect(byCheck(report, 'duration').status).toBe('skipped');
  });

  it('fails a file with decode errors partway through', async () => {
    const report = await run({
      decodeFrames: jest.fn(async () => ({ gray: bright(12), frameBytes: FRAME_BYTES, fps: 2, errors: ['[h264 @ 0000aabb] Invalid NAL unit size'] })),
    });
    expect(byCheck(report, 'video-decodable').status).toBe('fail');
    expect(report.issues[0].message).toMatch(/picture has decoding errors: Invalid NAL unit size/);
  });

  it('turns a decoder crash into a finding rather than an exception', async () => {
    const report = await run({ decodeAudio: jest.fn().mockRejectedValue(Object.assign(new Error('boom'), { stderr: Buffer.from('Error opening input') })) });
    expect(report.issues.find((i) => i.check === 'video-decodable').message).toMatch(/audio could not be decoded/);
    expect(byCheck(report, 'audio-silence').status).toBe('skipped');
  });

  it('fails a video with no audio track when the script has narration', async () => {
    const report = await run({ probe: jest.fn(async () => ({ ...goodProbe, audio: null })) });
    expect(byCheck(report, 'audio-stream').status).toBe('fail');
  });

  it('does not require audio when the script has no narration', async () => {
    const silentScript = scenes.map((s) => ({ ...s, audio: { text: '', duration: 0 } }));
    const report = await run({ probe: jest.fn(async () => ({ ...goodProbe, audio: null })) }, { scenes: silentScript });
    expect(report.passed).toBe(true);
    expect(byCheck(report, 'audio-silence')).toMatchObject({ status: 'skipped', note: expect.stringMatching(/no narration/) });
  });

  it('fails silent narration', async () => {
    const report = await run({ decodeAudio: jest.fn(async () => ({ pcm: silence(6), sampleRate: RATE, errors: [] })) });
    expect(byCheck(report, 'audio-silence').status).toBe('fail');
  });

  it('fails a black video', async () => {
    const report = await run({ decodeFrames: jest.fn(async () => ({ gray: black(12), frameBytes: FRAME_BYTES, fps: 2, errors: [] })) });
    expect(byCheck(report, 'video-black-frames').status).toBe('fail');
  });

  it('fails a truncated render', async () => {
    const report = await run({ probe: jest.fn(async () => ({ ...goodProbe, durationSec: 3, video: { ...goodProbe.video, durationSec: 3 }, audio: { ...goodProbe.audio, durationSec: 3 } })) });
    expect(byCheck(report, 'duration').status).toBe('fail');
  });

  it('degrades when ffmpeg is unavailable: file checks still run, decode checks are skipped, nothing fails', async () => {
    const report = await run({ resolveTools: jest.fn(async () => null) });
    expect(report.passed).toBe(true);
    for (const id of ['video-decodable', 'audio-stream', 'duration', 'audio-silence', 'video-black-frames']) {
      expect(byCheck(report, id)).toMatchObject({ status: 'skipped', note: expect.stringMatching(/ffmpeg is not available/) });
    }
    expect(byCheck(report, 'video-file').status).toBe('pass');
  });

  it('still fails a missing file when ffmpeg is unavailable', async () => {
    const report = await run({ resolveTools: jest.fn(async () => null), stat: jest.fn().mockRejectedValue(new Error('x')) });
    expect(report.passed).toBe(false);
  });

  it('does not decode audio at all when nothing was meant to be heard', async () => {
    const d = deps();
    const silentScript = scenes.map((s) => ({ ...s, audio: { text: '', duration: 0 } }));
    await VideoQualityService.run({ jobId: 'j', scenes: silentScript, videoPath: '/v.mp4', deps: d });
    expect(d.decodeAudio).not.toHaveBeenCalled();
  });

  describe('audio files in storage', () => {
    it('fails a narrated scene whose audio file is missing', async () => {
      const report = await run({ objectExists: jest.fn(async (_job, file) => file !== 'scene2.mp3') });
      expect(report.issues).toEqual([expect.objectContaining({ check: 'audio-files', severity: 'error', scene: 2 })]);
    });

    it('only warns when storage cannot be queried', async () => {
      const report = await run({ objectExists: jest.fn().mockRejectedValue(new Error('minio unreachable')) });
      expect(report.passed).toBe(true);
      expect(byCheck(report, 'audio-files').status).toBe('warn');
    });

    it('is skipped when no storage is wired in', async () => {
      const report = await run({ objectExists: null });
      expect(byCheck(report, 'audio-files').status).toBe('skipped');
    });
  });

  describe('images', () => {
    const withImages = scenes.map((s) => ({ ...s, imageUrl: `http://cdn/${s.sceneNumber}.png` }));

    it('fetches each distinct image once', async () => {
      const probeImage = jest.fn(async () => null);
      const shared = scenes.map((s) => ({ ...s, imageUrl: 'http://cdn/shared.png' }));
      await run({ probeImage }, { scenes: shared });
      expect(probeImage).toHaveBeenCalledTimes(1);
    });

    it('fails a scene whose image does not load', async () => {
      const probeImage = jest.fn(async (url) => (url.endsWith('/2.png') ? 'returned HTTP 404' : null));
      const report = await run({ probeImage }, { scenes: withImages });
      expect(report.issues).toEqual([expect.objectContaining({ check: 'images', severity: 'error', scene: 2 })]);
    });

    it('a probe that throws is a finding about that image, not a crash', async () => {
      const report = await run({ probeImage: jest.fn().mockRejectedValue(new Error('socket hang up')) }, { scenes: withImages });
      expect(report.issues.filter((i) => i.check === 'images')).toHaveLength(3);
    });
  });

  it('includes caption and subtitle findings from the script', async () => {
    const captioned = scenes.map((s) => ({ ...s, elements: { caption: 'x' }, audio: { ...s.audio, captionTimestamps: null } }));
    const report = await run({}, { scenes: captioned });
    expect(report.issues.filter((i) => i.check === 'captions')).toHaveLength(3);
    expect(report.passed).toBe(true); // missing word timing is a warning
  });
});
