const { buildReport, skippedReport, isRenderFault, describeIssues, CHECKS } = require('../../../src/services/qc/video/report');
const { parseProbe } = require('../../../src/services/qc/video/mediaTools');

const err = (check, message = check, extra = {}) => ({ check, severity: 'error', message, ...extra });
const warn = (check, message = check, extra = {}) => ({ check, severity: 'warn', message, ...extra });

describe('buildReport', () => {
  it('passes cleanly with no issues', () => {
    const r = buildReport({ issues: [] });
    expect(r).toMatchObject({ status: 'passed', passed: true, summary: { errors: 0, warnings: 0 } });
    expect(r.checks).toHaveLength(CHECKS.length);
    expect(r.checks.every((c) => c.status === 'pass')).toBe(true);
  });

  it('passes with warnings: warnings never block', () => {
    const r = buildReport({ issues: [warn('captions')] });
    expect(r).toMatchObject({ status: 'passed-with-warnings', passed: true, summary: { errors: 0, warnings: 1 } });
    expect(r.checks.find((c) => c.id === 'captions').status).toBe('warn');
  });

  it('fails on any error', () => {
    const r = buildReport({ issues: [warn('captions'), err('audio-silence')] });
    expect(r).toMatchObject({ status: 'failed', passed: false, summary: { errors: 1, warnings: 1 } });
    expect(r.checks.find((c) => c.id === 'audio-silence').status).toBe('fail');
  });

  it('lists errors before warnings, then by scene and time', () => {
    const r = buildReport({ issues: [warn('captions', 'w', { scene: 1 }), err('images', 'e2', { scene: 4 }), err('images', 'e1', { scene: 2 })] });
    expect(r.issues.map((i) => i.message)).toEqual(['e1', 'e2', 'w']);
  });

  it('marks checks that could not run as skipped, with the reason', () => {
    const r = buildReport({ issues: [], skipped: { 'audio-silence': 'ffmpeg is not available' } });
    expect(r.checks.find((c) => c.id === 'audio-silence')).toMatchObject({ status: 'skipped', note: 'ffmpeg is not available' });
    expect(r.passed).toBe(true); // a check that could not run does not fail the video
  });

  it('still shows findings from a check that only partly ran', () => {
    const r = buildReport({ issues: [warn('images')], skipped: { images: 'not fetched' } });
    expect(r.checks.find((c) => c.id === 'images').status).toBe('warn');
  });

  it('caps the stored issues', () => {
    const many = Array.from({ length: 500 }, (_, i) => warn('captions', `w${i}`));
    const r = buildReport({ issues: many });
    expect(r.issues).toHaveLength(200);
    expect(r.summary.warnings).toBe(500); // the count is still true
  });

  it('records the mode and what was measured', () => {
    const r = buildReport({ issues: [], mode: 'report', media: { durationSec: 12 }, durationMs: 340 });
    expect(r).toMatchObject({ mode: 'report', media: { durationSec: 12 }, durationMs: 340, version: 1 });
  });
});

describe('skippedReport', () => {
  it('is passing: a broken checker is not evidence of a bad video', () => {
    const r = skippedReport('ffmpeg crashed');
    expect(r).toMatchObject({ status: 'skipped', passed: true, skippedReason: 'ffmpeg crashed' });
    expect(r.checks.every((c) => c.status === 'skipped')).toBe(true);
  });
});

describe('isRenderFault', () => {
  it('is true when every error is a fault in the file', () => {
    expect(isRenderFault(buildReport({ issues: [err('video-decodable'), err('duration')] }))).toBe(true);
    expect(isRenderFault(buildReport({ issues: [err('video-black-frames')] }))).toBe(true);
  });

  it('is false when any error is in the content, which a second render reproduces', () => {
    expect(isRenderFault(buildReport({ issues: [err('video-decodable'), err('audio-silence')] }))).toBe(false);
    expect(isRenderFault(buildReport({ issues: [err('images')] }))).toBe(false);
  });

  it('is false when there are no errors', () => {
    expect(isRenderFault(buildReport({ issues: [warn('duration')] }))).toBe(false);
  });
});

describe('describeIssues', () => {
  it('summarises the worst problems and counts the rest', () => {
    const r = buildReport({ issues: ['a', 'b', 'c', 'd', 'e', 'f'].map((m) => err('images', m)) });
    expect(describeIssues(r)).toBe('a; b; c; d; and 2 more');
  });

  it('can describe warnings instead', () => {
    const r = buildReport({ issues: [err('images', 'e'), warn('captions', 'w')] });
    expect(describeIssues(r, { severity: 'warn' })).toBe('w');
  });
});

describe('parseProbe', () => {
  const json = {
    format: { format_name: 'mov,mp4', duration: '12.480000', size: '2048000' },
    streams: [
      { codec_type: 'video', codec_name: 'h264', width: 1920, height: 1080, avg_frame_rate: '30/1', duration: '12.4', nb_frames: '372' },
      { codec_type: 'audio', codec_name: 'aac', channels: 2, sample_rate: '44100', duration: '12.48' },
    ],
  };

  it('extracts the facts the checks use', () => {
    expect(parseProbe(json)).toEqual({
      formatName: 'mov,mp4', durationSec: 12.48, sizeBytes: 2048000,
      video: { codec: 'h264', width: 1920, height: 1080, fps: 30, durationSec: 12.4, frames: 372 },
      audio: { codec: 'aac', channels: 2, sampleRate: 44100, durationSec: 12.48 },
    });
  });

  it('reports a missing stream as null', () => {
    const noAudio = parseProbe({ format: { duration: '5' }, streams: [json.streams[0]] });
    expect(noAudio.audio).toBeNull();
    expect(noAudio.video.durationSec).toBe(12.4);
  });

  it('falls back to the container duration when a stream has none', () => {
    const p = parseProbe({ format: { duration: '9' }, streams: [{ codec_type: 'audio', codec_name: 'aac' }] });
    expect(p.audio.durationSec).toBe(9);
  });

  it('copes with an empty document', () => {
    expect(parseProbe({})).toMatchObject({ durationSec: null, video: null, audio: null });
  });
});
