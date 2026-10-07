jest.mock('../../src/services/common/LoggerService', () => ({
  info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(), tts: jest.fn(), http: jest.fn(),
}));

const fs = require('fs');
const os = require('os');
const path = require('path');
const { buildPreFilters, parseLoudnormJson, processClip } = require('../../src/services/audio/pipeline/audioProcessor');
const ffmpeg = require('../../src/services/audio/pipeline/ffmpeg');
const { buildWavBuffer, parseWav } = require('../../src/utils/wavAudio');
const config = require('../../src/config');

const processing = (over = {}) => ({ ...config.audio.processing, enabled: true, noiseReduction: false, ...over });

describe('buildPreFilters', () => {
  it('applies speed with atempo and leaves pitch alone without rubberband', () => {
    const r = buildPreFilters({ speed: 1.1, pitch: 1, hasRubberband: false, processing: processing() });
    expect(r.filters[0]).toBe('atempo=1.1000');
    expect(r.appliedSpeed).toBe(1.1);
    expect(r.appliedPitch).toBe(0);
  });

  it('uses rubberband for pitch when available, and reports it as applied', () => {
    const r = buildPreFilters({ speed: 1, pitch: 2, hasRubberband: true, processing: processing() });
    expect(r.filters[0]).toMatch(/^rubberband=tempo=1\.0000:pitch=1\.1224/);
    expect(r.appliedPitch).toBe(2);
  });

  it('adds nothing for neutral speed/pitch', () => {
    const r = buildPreFilters({ speed: 1, pitch: 0, processing: processing({ trimSilence: false, eq: false, compression: false }) });
    expect(r.filters).toEqual([]);
  });

  it('honours each processing switch', () => {
    const on = buildPreFilters({ processing: processing({ noiseReduction: true }), hasAfftdn: true }).filters.join(',');
    expect(on).toContain('silenceremove');
    expect(on).toContain('highpass');
    expect(on).toContain('acompressor');
    expect(on).toContain('afftdn');

    const off = buildPreFilters({ processing: processing({ trimSilence: false, eq: false, compression: false }) }).filters.join(',');
    expect(off).toBe('');
  });

  it('applies no cleanup at all when processing is disabled, only speed', () => {
    const r = buildPreFilters({ speed: 1.05, processing: processing({ enabled: false }) });
    expect(r.filters).toEqual(['atempo=1.0500']);
  });
});

describe('parseLoudnormJson', () => {
  it('reads the measurement block from ffmpeg stderr', () => {
    const stderr = 'noise\n{\n "input_i" : "-24.31",\n "input_tp" : "-6.10",\n "input_lra" : "3.20",\n "input_thresh" : "-34.60",\n "target_offset" : "0.12"\n}\n';
    expect(parseLoudnormJson(stderr)).toEqual({ inputI: -24.31, inputTP: -6.1, inputLRA: 3.2, inputThresh: -34.6, targetOffset: 0.12 });
  });

  it('returns null for silence (-inf) or garbage', () => {
    expect(parseLoudnormJson('{ "input_i": "-inf", "input_tp": "-inf", "input_lra": "0", "input_thresh": "-70", "target_offset": "0" }')).toBeNull();
    expect(parseLoudnormJson('no json here')).toBeNull();
  });
});

// The remaining tests drive a real ffmpeg when one is installed.
const RATE = 24000;
const fmt = { audioFormat: 1, channels: 1, sampleRate: RATE, byteRate: RATE * 2, blockAlign: 2, bitsPerSample: 16 };

function speechLike(leadMs, toneMs, tailMs, amplitude) {
  const total = Math.round((RATE * (leadMs + toneMs + tailMs)) / 1000);
  const buf = Buffer.alloc(total * 2);
  const from = Math.round((RATE * leadMs) / 1000);
  const to = from + Math.round((RATE * toneMs) / 1000);
  for (let i = from; i < to; i++) buf.writeInt16LE(Math.round(amplitude * Math.sin((2 * Math.PI * 220 * i) / RATE)), i * 2);
  return buildWavBuffer(fmt, buf);
}


describe('processClip (real ffmpeg)', () => {
  let ffmpegOk = false;
  let dir;

  beforeAll(async () => {
    ffmpeg._resetForTests();
    ffmpegOk = await ffmpeg.isAvailable();
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vireon-proc-'));
  });
  afterAll(() => { fs.rmSync(dir, { recursive: true, force: true }); });

  const run = async (name, wav, opts) => {
    const input = path.join(dir, `${name}-in.wav`);
    const output = path.join(dir, `${name}-out.wav`);
    fs.writeFileSync(input, wav);
    const result = await processClip({ inputPath: input, outputPath: output, ...opts });
    return { result, output };
  };

  it('trims silence, normalises, and keeps the sample rate', async () => {
    if (!ffmpegOk) return;
    const { result, output } = await run('trim', speechLike(800, 1500, 800, 3000), { processing: processing() });
    expect(result).toMatchObject({ processed: true, degraded: false, normalized: true });
    // 3.1s in; the long lead/tail silences are trimmed to ~60ms padding each.
    expect(result.durationMs).toBeLessThan(2000);
    expect(result.durationMs).toBeGreaterThan(1400);
    expect(parseWav(fs.readFileSync(output)).fmt.sampleRate).toBe(RATE);
  }, 30000);

  it('brings quiet and loud clips to the same loudness', async () => {
    if (!ffmpegOk) return;
    const quiet = await run('quiet', speechLike(100, 2000, 100, 800), { processing: processing() });
    const loud = await run('loud', speechLike(100, 2000, 100, 20000), { processing: processing() });
    const peak = (file) => {
      const { data } = parseWav(fs.readFileSync(file));
      let max = 0;
      for (let i = 0; i < data.length; i += 2) max = Math.max(max, Math.abs(data.readInt16LE(i)));
      return max / 32768;
    };
    const ratio = peak(quiet.output) / peak(loud.output);
    // Same loudness target -> similar level, where the inputs were 28 dB apart.
    expect(ratio).toBeGreaterThan(0.5);
    expect(ratio).toBeLessThan(2);
    // And nothing exceeds the true-peak ceiling.
    expect(peak(loud.output)).toBeLessThanOrEqual(Math.pow(10, config.audio.processing.truePeakLimit / 20) + 0.02);
  }, 60000);

  it('changes duration for speed and reports the speed it applied', async () => {
    if (!ffmpegOk) return;
    const wav = speechLike(0, 2000, 0, 8000);
    const base = await run('s1', wav, { speed: 1, processing: processing({ trimSilence: false, normalization: false, eq: false, compression: false }) });
    const fast = await run('s2', wav, { speed: 1.25, processing: processing({ trimSilence: false, normalization: false, eq: false, compression: false }) });
    expect(fast.result.appliedSpeed).toBe(1.25);
    expect(fast.result.durationMs).toBeLessThan(base.result.durationMs * 0.85);
  }, 30000);

  it('passes audio through untouched when processing is off and speed is neutral', async () => {
    const wav = speechLike(0, 500, 0, 8000);
    const { result, output } = await run('off', wav, { processing: processing({ enabled: false }) });
    expect(result).toMatchObject({ processed: false, degraded: false, reason: 'processing-disabled' });
    expect(fs.readFileSync(output).equals(wav)).toBe(true);
  });
});

describe('processClip without ffmpeg', () => {
  it('degrades to the raw clip and says so, instead of failing', async () => {
    const noFfmpeg = { isAvailable: async () => false, hasFilter: async () => false, runFfmpeg: jest.fn() };
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vireon-noff-'));
    const input = path.join(dir, 'in.wav');
    const output = path.join(dir, 'out.wav');
    const wav = speechLike(0, 500, 0, 8000);
    fs.writeFileSync(input, wav);

    const result = await processClip({ inputPath: input, outputPath: output, speed: 1.1, processing: processing(), ffmpegApi: noFfmpeg });
    expect(result).toMatchObject({ processed: false, degraded: true, reason: 'ffmpeg-unavailable', appliedSpeed: 1 });
    expect(fs.readFileSync(output).equals(wav)).toBe(true);
    expect(noFfmpeg.runFfmpeg).not.toHaveBeenCalled();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('falls back to the raw clip when ffmpeg itself fails', async () => {
    const broken = { isAvailable: async () => true, hasFilter: async () => false, runFfmpeg: jest.fn().mockRejectedValue(new Error('boom')) };
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vireon-bad-'));
    const input = path.join(dir, 'in.wav');
    const output = path.join(dir, 'out.wav');
    const wav = speechLike(0, 500, 0, 8000);
    fs.writeFileSync(input, wav);

    const result = await processClip({ inputPath: input, outputPath: output, processing: processing(), ffmpegApi: broken });
    expect(result).toMatchObject({ processed: false, degraded: true, reason: 'ffmpeg-failed' });
    expect(fs.readFileSync(output).equals(wav)).toBe(true);
    fs.rmSync(dir, { recursive: true, force: true });
  });
});
