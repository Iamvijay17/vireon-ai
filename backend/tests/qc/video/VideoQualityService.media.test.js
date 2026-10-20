jest.mock('../../../src/services/common/LoggerService', () => ({
  info: jest.fn(), warn: jest.fn(), error: jest.fn(), success: jest.fn(), debug: jest.fn(),
}));

const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

/**
 * End-to-end over REAL files: ffmpeg generates short videos with a known defect
 * each, and the service must catch exactly that defect through the real probe and
 * decode path. Skipped (not failed) where ffmpeg is not installed - the pure
 * analysers and the injected-media tests cover the logic on every machine.
 */
const hasFfmpeg = (() => {
  try {
    execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' });
    execFileSync('ffprobe', ['-version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
})();

const describeIfFfmpeg = hasFfmpeg ? describe : describe.skip;

describeIfFfmpeg('VideoQualityService on real media', () => {
  jest.setTimeout(60_000);

  const mediaTools = require('../../../src/services/qc/video/mediaTools');
  const VideoQualityService = require('../../../src/services/qc/video/VideoQualityService');

  let dir;
  const file = (name) => path.join(dir, `${name}.mp4`);
  const ff = (args) => execFileSync('ffmpeg', ['-v', 'error', '-y', ...args], { stdio: 'pipe' });

  const picture = 'testsrc2=size=320x180:rate=30:duration=6';
  const tone = 'aevalsrc=0.5*sin(2*PI*440*t):d=6:s=44100';
  const toneWithGap = "aevalsrc='if(between(t,2,4),0,0.5*sin(2*PI*440*t))':d=6:s=44100";
  const encode = ['-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest'];

  const make = (name, { vf, audio = tone } = {}) => {
    ff(['-f', 'lavfi', '-i', picture, '-f', 'lavfi', '-i', audio, ...(vf ? ['-vf', vf] : []), ...encode, file(name)]);
  };

  const scenes = (durations = [2, 2, 2]) => durations.map((d, i) => ({
    sceneNumber: i + 1, duration: d, audio: { text: 'Some narration for this scene.', duration: d, file: `scene${i + 1}.mp3` },
  }));

  const check = (name, sceneList = scenes()) => VideoQualityService.run({
    jobId: 'real', scenes: sceneList, videoPath: file(name), resolution: '320x180', deps: { objectExists: async () => true },
  });

  beforeAll(() => {
    mediaTools._resetForTests();
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vireon-qc-test-'));
    make('good');
    make('silentScene', { audio: toneWithGap });
    make('black2s', { vf: "drawbox=x=0:y=0:w=iw:h=ih:color=black:t=fill:enable='between(t,2,4)'" });
    make('black4s', { vf: "drawbox=x=0:y=0:w=iw:h=ih:color=black:t=fill:enable='between(t,1,5)'" });
    ff(['-f', 'lavfi', '-i', 'color=c=0x101010:size=320x180:rate=30:duration=6', '-f', 'lavfi', '-i', tone,
      '-vf', 'drawbox=x=100:y=60:w=120:h=60:color=white:t=fill', ...encode, file('darkSlide')]);

    const good = fs.readFileSync(file('good'));
    const corrupt = Buffer.from(good);
    const from = Math.floor(corrupt.length * 0.35);
    for (let i = from; i < from + 3000; i += 1) corrupt[i] = (i * 31) & 255;
    fs.writeFileSync(file('corrupt'), corrupt);
    fs.writeFileSync(file('truncated'), good.subarray(0, Math.floor(good.length * 0.4)));
    fs.writeFileSync(file('empty'), '');
  });

  afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('passes a healthy video', async () => {
    const report = await check('good');
    expect(report.status).toBe('passed');
    expect(report.media).toMatchObject({ width: 320, height: 180, videoCodec: 'h264', audioCodec: 'aac' });
    expect(report.media.durationSec).toBeCloseTo(6, 0);
  });

  it('catches a silent scene and names it', async () => {
    const report = await check('silentScene');
    expect(report.issues).toEqual([expect.objectContaining({ check: 'audio-silence', severity: 'error', scene: 2 })]);
  });

  it('warns on 2s of black and blocks on 4s', async () => {
    expect((await check('black2s')).status).toBe('passed-with-warnings');
    const long = await check('black4s');
    expect(long.passed).toBe(false);
    expect(long.issues[0]).toMatchObject({ check: 'video-black-frames', severity: 'error' });
  });

  it('does not mistake a dark slide with a bright shape for black', async () => {
    expect((await check('darkSlide')).status).toBe('passed');
  });

  it('catches corruption in the middle of the file', async () => {
    const report = await check('corrupt');
    expect(report.passed).toBe(false);
    expect(report.issues.some((i) => i.check === 'video-decodable')).toBe(true);
  });

  it('catches a file that cannot be opened at all', async () => {
    const report = await check('truncated');
    expect(report.issues[0]).toMatchObject({ check: 'video-decodable', severity: 'error' });
    expect(report.issues[0].message).not.toMatch(/[0-9a-f]{8,}/); // no allocator addresses
  });

  it('catches an empty file', async () => {
    expect((await check('empty')).issues[0]).toMatchObject({ check: 'video-file', severity: 'error' });
  });

  it('judges the real length against the script', async () => {
    expect((await check('good', scenes([2.1, 2.1, 2.2]))).status).toBe('passed'); // within tolerance
    expect((await check('good', scenes([4, 4, 4]))).issues.find((i) => i.check === 'duration')).toMatchObject({ severity: 'error' });
  });
});
