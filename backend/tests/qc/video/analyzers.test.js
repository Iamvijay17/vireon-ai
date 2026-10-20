const a = require('../../../src/services/qc/video/analyzers');
const { buildTimeline, expectedDurationSec, sceneAt } = require('../../../src/services/qc/video/timeline');

const RATE = 8000;

/** Mono 16-bit PCM from segments of `[seconds, amplitude 0..1]`; non-zero segments are a 440Hz tone. */
function pcm(segments) {
  const total = segments.reduce((n, [sec]) => n + Math.round(sec * RATE), 0);
  const samples = new Int16Array(total);
  let at = 0;
  for (const [sec, amp] of segments) {
    const count = Math.round(sec * RATE);
    for (let i = 0; i < count; i += 1) samples[at + i] = Math.round(amp * 32767 * Math.sin((2 * Math.PI * 440 * i) / RATE));
    at += count;
  }
  return Buffer.from(samples.buffer);
}

const FRAME_BYTES = 32 * 18;
/** 8-bit gray frames from `[count, fill]` or `[count, fill, brightPixels]` - brightPixels are set to 255. */
function frames(spec) {
  const parts = [];
  for (const [count, fill, bright = 0] of spec) {
    for (let f = 0; f < count; f += 1) {
      const frame = Buffer.alloc(FRAME_BYTES, fill);
      for (let i = 0; i < bright; i += 1) frame[i] = 255;
      parts.push(frame);
    }
  }
  return Buffer.concat(parts);
}

const scene = (n, over = {}) => ({
  sceneNumber: n, duration: 2,
  audio: { text: 'Hello there world.', duration: 2 },
  ...over,
});
const timelineOf = (...scenes) => buildTimeline(scenes);

const silenceArgs = (timeline, windows) => ({
  windows, timeline, thresholdDb: -50, silentSceneError: 0.9, silentSceneWarn: 0.6, maxSilentGapSec: 1.5,
});

describe('timeline', () => {
  it('lays scenes out back to back at frame-rounded durations', () => {
    const t = buildTimeline([{ sceneNumber: 1, duration: 2.01 }, { sceneNumber: 2, duration: 3 }]);
    expect(t[0].startSec).toBe(0);
    expect(t[1].startSec).toBeCloseTo(2, 1);
    expect(expectedDurationSec(t)).toBeCloseTo(5, 1);
  });

  it('a scene without a duration renders for 8 seconds, like the composition', () => {
    expect(expectedDurationSec(buildTimeline([{ sceneNumber: 1 }]))).toBe(8);
  });

  it('the narration length wins over the scripted duration, exactly as prepareAssets does', () => {
    const t = buildTimeline([{ sceneNumber: 1, duration: 8, audio: { text: 'x', duration: 3 } }, { sceneNumber: 2, duration: 5 }]);
    expect(t[1].startSec).toBe(3);
    expect(expectedDurationSec(t)).toBe(8);
  });

  it('the total is rounded once, like calculateVideoMetadata, not scene by scene', () => {
    // 3 x 0.015s would each round to 0 frames; summed they are 1.5 frames -> never under one second anyway.
    const tiny = buildTimeline([{ sceneNumber: 1, duration: 10.016 }, { sceneNumber: 2, duration: 10.016 }]);
    expect(expectedDurationSec(tiny)).toBeCloseTo(Math.round(20.032 * 30) / 30, 6);
  });

  it('is never shorter than one second', () => {
    expect(expectedDurationSec(buildTimeline([{ sceneNumber: 1, duration: 0.1, audio: { duration: 0.1 } }]))).toBe(1);
  });

  it('only scenes with narration text AND audio are "narrated"', () => {
    const t = buildTimeline([
      scene(1),
      scene(2, { audio: { text: '', duration: 0 } }),
      scene(3, { audio: { text: 'words', duration: 0 } }),
    ]);
    expect(t.map((x) => x.narrated)).toEqual([true, false, false]);
  });

  it('sceneAt finds the scene playing at a second', () => {
    const t = timelineOf(scene(1), scene(2));
    expect(sceneAt(t, 0.5).sceneNumber).toBe(1);
    expect(sceneAt(t, 2.5).sceneNumber).toBe(2);
    expect(sceneAt(t, 99)).toBeNull();
  });
});

describe('audio silence', () => {
  const t = timelineOf(scene(1), scene(2), scene(3)); // 0-2, 2-4, 4-6

  it('passes when narration is audible throughout', () => {
    const windows = a.measureWindows(pcm([[6, 0.3]]), RATE);
    expect(a.checkAudioSilence(silenceArgs(t, windows))).toEqual([]);
  });

  it('reports a dead track once, not once per scene', () => {
    const windows = a.measureWindows(pcm([[6, 0]]), RATE);
    const issues = a.checkAudioSilence(silenceArgs(t, windows));
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ check: 'audio-silence', severity: 'error' });
    expect(issues[0].message).toMatch(/silent/);
  });

  it('names the scene whose narration is silent while the rest is fine', () => {
    const windows = a.measureWindows(pcm([[2, 0.3], [2, 0], [2, 0.3]]), RATE);
    const issues = a.checkAudioSilence(silenceArgs(t, windows));
    expect(issues).toEqual([expect.objectContaining({ severity: 'error', scene: 2 })]);
  });

  it('warns when a narrated scene is mostly (not entirely) silent', () => {
    const windows = a.measureWindows(pcm([[2, 0.3], [0.5, 0.3], [1.5, 0], [2, 0.3]]), RATE); // scene 2: 25% audible
    const issues = a.checkAudioSilence(silenceArgs(t, windows));
    expect(issues).toEqual([expect.objectContaining({ severity: 'warn', scene: 2 })]);
  });

  it('warns about a long silent gap inside otherwise audible narration', () => {
    // Four-second scenes so the 1.6s hole is a minority of scene 2 (40% silent): a gap, not "mostly silent".
    const four = (n) => scene(n, { duration: 4, audio: { text: 'Hello there world.', duration: 4 } });
    const longScenes = timelineOf(four(1), four(2), four(3));
    const windows = a.measureWindows(pcm([[4, 0.3], [1, 0.3], [1.6, 0], [1.4, 0.3], [4, 0.3]]), RATE);
    const issues = a.checkAudioSilence(silenceArgs(longScenes, windows));
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ severity: 'warn', scene: 2 });
    expect(issues[0].message).toMatch(/silent gap/);
  });

  it('a silent scene with no narration is fine', () => {
    const quiet = timelineOf(scene(1), scene(2, { audio: { text: '', duration: 0 } }));
    const windows = a.measureWindows(pcm([[2, 0.3], [2, 0]]), RATE);
    expect(a.checkAudioSilence(silenceArgs(quiet, windows))).toEqual([]);
  });

  it('expects nothing to be audible when no scene has narration', () => {
    const none = timelineOf(scene(1, { audio: { text: '', duration: 0 } }));
    const windows = a.measureWindows(pcm([[2, 0]]), RATE);
    expect(a.checkAudioSilence(silenceArgs(none, windows))).toEqual([]);
  });

  it('treats audio with no samples as an error when narration was expected', () => {
    const windows = a.measureWindows(Buffer.alloc(0), RATE);
    expect(a.checkAudioSilence(silenceArgs(t, windows))[0]).toMatchObject({ severity: 'error' });
  });

  it('handles a Buffer at an odd byte offset (as read from a pipe)', () => {
    const padded = Buffer.concat([Buffer.from([0]), pcm([[1, 0.3]])]);
    const odd = padded.subarray(1);
    expect(odd.byteOffset % 2).toBe(1);
    expect(() => a.measureWindows(odd, RATE)).not.toThrow();
    expect(a.measureWindows(odd, RATE).peakDb).toBeGreaterThan(-20);
  });

  it('measures a full-scale tone near -3 dBFS RMS and silence at the floor', () => {
    expect(a.measureWindows(pcm([[1, 1]]), RATE).rmsDb[0]).toBeCloseTo(-3, 0);
    expect(a.measureWindows(pcm([[1, 0]]), RATE).peakDb).toBe(-120);
  });
});

describe('black frames', () => {
  const FPS = 2;
  const args = (spec, timeline = timelineOf(scene(1), scene(2), scene(3))) => ({
    frames: a.measureFrames(frames(spec), FRAME_BYTES), sampleFps: FPS, timeline,
    meanMax: 12, brightMax: 40, minSec: 1, errorSec: 3,
  });

  it('passes ordinary content', () => {
    expect(a.checkBlackFrames(args([[12, 120]]))).toEqual([]);
  });

  it('does not mistake a dark slide with bright text for black', () => {
    expect(a.checkBlackFrames(args([[12, 8, 120]]))).toEqual([]); // dark overall, 120px of white
  });

  it('ignores a brief fade or cut to black', () => {
    expect(a.checkBlackFrames(args([[4, 120], [1, 0], [7, 120]]))).toEqual([]); // 0.5s
  });

  it('warns on a stretch of black and says which scene it is in', () => {
    const issues = a.checkBlackFrames(args([[4, 120], [4, 0], [4, 120]])); // 2s black from 2s
    expect(issues).toEqual([expect.objectContaining({ check: 'video-black-frames', severity: 'warn', scene: 2, atSec: 2 })]);
  });

  it('blocks on a long black stretch', () => {
    const issues = a.checkBlackFrames(args([[2, 120], [8, 0], [2, 120]])); // 4s black
    expect(issues[0].severity).toBe('error');
  });

  it('blocks on an all-black video with a single message', () => {
    const issues = a.checkBlackFrames(args([[12, 0]]));
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ severity: 'error', message: expect.stringMatching(/black from start to end/) });
  });

  it('reports each separate stretch', () => {
    const issues = a.checkBlackFrames(args([[2, 120], [3, 0], [2, 120], [3, 0], [2, 120]]));
    expect(issues).toHaveLength(2);
  });

  it('has nothing to say about a file with no frames', () => {
    expect(a.checkBlackFrames(args([]))).toEqual([]);
  });

  it('measures mean and p99 per frame', () => {
    const [f] = a.measureFrames(frames([[1, 10, 100]]), FRAME_BYTES);
    expect(f.mean).toBeGreaterThan(10);
    expect(f.p99).toBe(255); // 100 of 576 pixels (17%) are white, so the 99th percentile is white
  });
});

describe('duration', () => {
  const base = { toleranceSec: 1, tolerancePct: 0.015 };

  it('accepts a length within tolerance', () => {
    expect(a.checkDuration({ ...base, actualSec: 60.5, expectedSec: 60 })).toEqual([]);
  });

  it('scales the tolerance with the length of the video', () => {
    expect(a.checkDuration({ ...base, actualSec: 603, expectedSec: 600 })).toEqual([]); // 1.5% of 600 = 9s
  });

  it('warns on a moderately wrong length', () => {
    const [i] = a.checkDuration({ ...base, actualSec: 58, expectedSec: 60 });
    expect(i).toMatchObject({ check: 'duration', severity: 'warn' });
    expect(i.message).toMatch(/shorter/);
  });

  it('blocks a truncated render (short is judged harder than long)', () => {
    expect(a.checkDuration({ ...base, actualSec: 6, expectedSec: 9 })[0].severity).toBe('error');
    expect(a.checkDuration({ ...base, actualSec: 9, expectedSec: 6 })[0].severity).toBe('warn'); // long: tolerated
  });

  it('blocks a video wildly longer than the script', () => {
    expect(a.checkDuration({ ...base, actualSec: 30, expectedSec: 10 })[0].severity).toBe('error');
  });

  it('errors when the file reports no duration', () => {
    expect(a.checkDuration({ ...base, actualSec: 0, expectedSec: 10 })[0].severity).toBe('error');
  });

  it('flags audio and picture of different lengths', () => {
    const issues = a.checkDuration({ ...base, actualSec: 10, expectedSec: 10, videoSec: 10, audioSec: 7 });
    expect(issues[0]).toMatchObject({ severity: 'warn', message: expect.stringMatching(/Audio and picture differ/) });
    expect(a.checkDuration({ ...base, actualSec: 20, expectedSec: 20, videoSec: 20, audioSec: 12 })[0].severity).toBe('error');
  });

  it('skips the script comparison when the script has no length', () => {
    expect(a.checkDuration({ ...base, actualSec: 10, expectedSec: 0 })).toEqual([]);
  });
});

describe('captions', () => {
  const captioned = (n, words, over = {}) => scene(n, {
    elements: { caption: 'Hello there world.' },
    audio: { text: 'Hello there world.', duration: 2, captionTimestamps: words },
    ...over,
  });
  const goodWords = [{ word: 'Hello', start: 0, end: 0.5 }, { word: 'there', start: 0.6, end: 1.1 }, { word: 'world.', start: 1.2, end: 1.9 }];
  const check = (...scenes) => a.checkCaptions({ timeline: timelineOf(...scenes) });

  it('passes well-timed captions', () => {
    expect(check(captioned(1, goodWords))).toEqual([]);
  });

  it('ignores scenes that show no captions', () => {
    expect(check(scene(1))).toEqual([]);
  });

  it('warns (does not block) when word timing is missing: captions fall back to an even pace', () => {
    const [i] = check(captioned(1, null));
    expect(i).toMatchObject({ check: 'captions', severity: 'warn', scene: 1 });
    expect(i.message).toMatch(/even pace/);
  });

  it('blocks on invalid timing values', () => {
    const bad = [{ word: 'Hello', start: 0, end: 0.5 }, { word: 'x', start: NaN, end: 1 }, { word: 'y', start: 2, end: 1 }];
    expect(check(captioned(1, bad))[0]).toMatchObject({ severity: 'error', message: expect.stringMatching(/invalid timing/) });
  });

  it('blocks on out-of-order words', () => {
    const bad = [{ word: 'a', start: 1, end: 1.5 }, { word: 'b', start: 0.2, end: 0.4 }];
    expect(check(captioned(1, bad))[0]).toMatchObject({ severity: 'error', message: expect.stringMatching(/out of order/) });
  });

  it('blocks on captions running well past the audio', () => {
    const late = [{ word: 'Hello', start: 0, end: 0.5 }, { word: 'there', start: 0.6, end: 3.9 }];
    expect(check(captioned(1, late))[0]).toMatchObject({ severity: 'error', message: expect.stringMatching(/past the end/) });
  });

  it('warns when captions stop long before the narration does', () => {
    const early = [{ word: 'Hello', start: 0, end: 0.4 }, { word: 'there', start: 0.4, end: 0.8 }, { word: 'world.', start: 0.8, end: 1.0 }];
    expect(check(captioned(1, early))[0]).toMatchObject({ severity: 'warn', message: expect.stringMatching(/stop at/) });
  });

  it('warns when far fewer words are timed than are spoken', () => {
    const few = [{ word: 'Hello', start: 0, end: 1.9 }];
    expect(check(captioned(1, few))[0]).toMatchObject({ severity: 'warn', message: expect.stringMatching(/timed caption words/) });
  });

  it('warns about a caption on a scene with no narration', () => {
    const t = scene(1, { elements: { caption: 'Caption' }, audio: { text: '', duration: 0 } });
    expect(check(t)[0]).toMatchObject({ severity: 'warn' });
  });
});

describe('subtitle cues', () => {
  const args = (cues, over = {}) => ({ cues, totalSec: 60, maxChars: 42, maxCueSec: 7, maxCharsPerSec: 21, ...over });
  const cue = (start, end, text) => ({ start, end, text });

  it('passes comfortable cues', () => {
    expect(a.checkSubtitleCues(args([cue(0, 2, 'Hello there world.'), cue(2.1, 4, 'Second line here.')]))).toEqual([]);
  });

  it('flags a cue over the line limit', () => {
    const [i] = a.checkSubtitleCues(args([cue(0, 6, 'x'.repeat(50))]));
    expect(i).toMatchObject({ check: 'subtitle-overflow', severity: 'warn', message: expect.stringMatching(/50 characters/) });
  });

  it('flags a cue that lingers too long', () => {
    expect(a.checkSubtitleCues(args([cue(0, 9, 'Short.')]))[0].message).toMatch(/stays on screen/);
  });

  it('flags a cue too fast to read', () => {
    const [i] = a.checkSubtitleCues(args([cue(0, 1, 'y'.repeat(40))]));
    expect(i.message).toMatch(/too fast to read/);
  });

  it('flags overlapping cues', () => {
    expect(a.checkSubtitleCues(args([cue(0, 3, 'One.'), cue(2, 4, 'Two.')]))[0].message).toMatch(/overlaps/);
  });

  it('reports cues past the end of the video as one finding', () => {
    const issues = a.checkSubtitleCues(args([cue(0, 2, 'One.'), cue(58, 62, 'Late one.'), cue(63, 66, 'Late two.')], { totalSec: 60 }));
    const late = issues.filter((i) => /run past the end/.test(i.message));
    expect(late).toHaveLength(1);
    expect(late[0].message).toMatch(/2 subtitle/);
    expect(late[0].severity).toBe('warn'); // the duration check is what blocks
  });
});

describe('caption box overflow', () => {
  const args = (timeline, over = {}) => ({
    timeline, frameWidth: 1920, frameHeight: 1080, fontSize: 48, maxWidthPct: 0.8, maxVisibleWords: 6,
    glyphWidthRatio: 0.55, lineHeightRatio: 1.3, maxLines: 2, maxHeightPct: 0.25, ...over,
  });
  const captionScene = (text) => scene(1, { elements: { caption: text }, audio: { text, duration: 2 } });

  it('passes ordinary captions', () => {
    expect(a.checkCaptionBox(args(timelineOf(captionScene('A short sentence for the viewer to read.'))))).toEqual([]);
  });

  it('ignores scenes with no burned-in caption', () => {
    expect(a.checkCaptionBox(args(timelineOf(scene(1))))).toEqual([]);
  });

  it('warns when a chunk of words would wrap past the line limit', () => {
    const huge = Array.from({ length: 6 }, () => 'internationalization').join(' '); // 6 very long words
    const [i] = a.checkCaptionBox(args(timelineOf(captionScene(huge))));
    expect(i).toMatchObject({ check: 'subtitle-overflow', severity: 'warn', scene: 1 });
    expect(i.detail.estimatedLines).toBeGreaterThan(2);
  });

  it('a narrow vertical frame overflows sooner than a wide one', () => {
    const text = 'Quite a few words appear in this caption chunk here';
    const wide = a.checkCaptionBox(args(timelineOf(captionScene(text))));
    const narrow = a.checkCaptionBox(args(timelineOf(captionScene(text)), { frameWidth: 360, frameHeight: 640 }));
    expect(wide).toEqual([]);
    expect(narrow.length).toBe(1);
  });
});

describe('images', () => {
  const t = (...scenes) => timelineOf(...scenes);
  const ok = new Map();

  it('passes scenes whose images load', () => {
    const s = scene(1, { imageUrl: 'http://x/a.png' });
    expect(a.checkImages({ timeline: t(s), probeResults: new Map([['http://x/a.png', null]]) })).toEqual([]);
  });

  it('blocks on an image that cannot be fetched', () => {
    const s = scene(1, { imageUrl: 'http://x/a.png' });
    const [i] = a.checkImages({ timeline: t(s), probeResults: new Map([['http://x/a.png', 'returned HTTP 404']]) });
    expect(i).toMatchObject({ check: 'images', severity: 'error', scene: 1, message: expect.stringMatching(/404/) });
  });

  it('checks every image a scene uses', () => {
    const s = scene(1, { imageUrl: 'http://x/a.png', elements: { image: 'http://x/a.png', hostImage: 'http://x/b.png' } });
    const issues = a.checkImages({ timeline: t(s), probeResults: new Map([['http://x/a.png', null], ['http://x/b.png', 'returned HTTP 500']]) });
    expect(issues).toHaveLength(1);
  });

  it('warns - never blocks - when the pipeline deliberately fell back to text', () => {
    const s = scene(1, { storyboard: { visual: { status: 'degraded', reason: 'ComfyUI is not running' } } });
    const [i] = a.checkImages({ timeline: t(s), probeResults: ok });
    expect(i).toMatchObject({ severity: 'warn', message: expect.stringMatching(/text instead of its planned image/) });
  });

  it('blocks on an image prompt that never produced an image', () => {
    const s = scene(1, { imagePrompt: 'a lighthouse at dusk' });
    expect(a.checkImages({ timeline: t(s), probeResults: ok })[0]).toMatchObject({ severity: 'error', message: expect.stringMatching(/no image/) });
  });

  it('scenes with no image and no prompt are fine', () => {
    expect(a.checkImages({ timeline: t(scene(1)), probeResults: ok })).toEqual([]);
  });

  it('lists each distinct URL once', () => {
    expect(a.sceneImageUrls({ imageUrl: 'u', elements: { image: 'u', hostImage: ' ' } })).toEqual(['u']);
  });
});
