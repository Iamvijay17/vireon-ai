const { buildCues, buildSubtitles, timestamp, groupWords } = require('../../src/utils/subtitles');

const words = (list, startAt = 0, each = 0.5) =>
  list.map((word, i) => ({ word, start: startAt + i * each, end: startAt + (i + 1) * each - 0.05 }));

describe('timestamp', () => {
  it('formats SRT and VTT separators', () => {
    expect(timestamp(3661.5, ',')).toBe('01:01:01,500');
    expect(timestamp(0.007, '.')).toBe('00:00:00.007');
  });
  it('never goes negative', () => {
    expect(timestamp(-2, ',')).toBe('00:00:00,000');
  });
});

describe('groupWords', () => {
  it('breaks at sentence ends', () => {
    const cues = groupWords([
      { text: 'Hello', start: 0, end: 0.4 },
      { text: 'there.', start: 0.5, end: 0.9 },
      { text: 'Next', start: 1, end: 1.4 },
      { text: 'one', start: 1.5, end: 1.9 },
    ]);
    expect(cues.map((c) => c.text)).toEqual(['Hello there.', 'Next one']);
  });

  it('breaks on a long pause and on word count', () => {
    const slow = groupWords([
      { text: 'a', start: 0, end: 0.2 },
      { text: 'b', start: 3, end: 3.2 },
    ]);
    expect(slow).toHaveLength(2);

    const many = groupWords(Array.from({ length: 10 }, (_, i) => ({ text: 'w', start: i * 0.3, end: i * 0.3 + 0.25 })));
    expect(many[0].text.split(' ')).toHaveLength(8);
    expect(many).toHaveLength(2);
  });
});

describe('buildCues', () => {
  const scenes = [
    { duration: 4, audio: { duration: 4, captionTimestamps: words(['One', 'two', 'three.']) } },
    { duration: 5, audio: { duration: 5, captionTimestamps: words(['Four', 'five', 'six.']) } },
  ];

  it('offsets each scene by the summed durations of the scenes before it', () => {
    const cues = buildCues(scenes);
    expect(cues).toHaveLength(2);
    expect(cues[0].start).toBe(0);
    expect(cues[1].start).toBeCloseTo(4, 5);
    expect(cues[1].text).toBe('Four five six.');
  });

  it('rounds scene length to whole frames like the renderer does', () => {
    const cues = buildCues([{ duration: 1.01, audio: { duration: 1.01, text: 'a b' } }, { duration: 2, audio: { duration: 2, text: 'c d' } }]);
    expect(cues[1].start).toBeCloseTo(Math.round(1.01 * 30) / 30, 5);
  });

  it('spreads narration evenly when a scene has no alignment', () => {
    const cues = buildCues([{ duration: 4, audio: { duration: 4, text: 'one two three four' } }]);
    expect(cues).toHaveLength(1);
    expect(cues[0].start).toBe(0);
    expect(cues[0].end).toBeCloseTo(4, 5);
  });

  it('skips scenes with no narration and tolerates junk', () => {
    expect(buildCues([{ duration: 3 }, { duration: 3, audio: { text: '' } }, null])).toEqual([]);
    expect(buildCues(undefined)).toEqual([]);
  });

  it('keeps cues from overlapping and from running past their scene', () => {
    const cues = buildCues([
      { duration: 2, audio: { duration: 2, captionTimestamps: [{ word: 'late', start: 1.9, end: 5 }] } },
      { duration: 2, audio: { duration: 2, captionTimestamps: [{ word: 'next', start: 0, end: 0.1 }] } },
    ]);
    expect(cues[0].end).toBeLessThanOrEqual(2);
    expect(cues[1].start).toBeGreaterThanOrEqual(cues[0].end);
    expect(cues[1].end - cues[1].start).toBeGreaterThan(0.1); // short cue is held
  });
});

describe('buildSubtitles', () => {
  const scenes = [{ duration: 3, audio: { duration: 3, captionTimestamps: words(['Hello', 'world.']) } }];

  it('writes SRT with numbered cues and comma milliseconds', () => {
    const { text, cues } = buildSubtitles(scenes, 'srt');
    expect(cues).toBe(1);
    expect(text).toBe('1\n00:00:00,000 --> 00:00:00,950\nHello world.\n');
  });

  it('writes VTT with a header and dot milliseconds', () => {
    const { text } = buildSubtitles(scenes, 'vtt');
    expect(text.startsWith('WEBVTT\n\n')).toBe(true);
    expect(text).toContain('00:00:00.000 --> 00:00:00.950\nHello world.');
  });

  it('keeps arrows and newlines in narration from breaking a cue', () => {
    const { text } = buildSubtitles([{ duration: 3, audio: { duration: 3, text: 'a --> b' } }], 'vtt');
    expect(text).not.toMatch(/a -->/);
  });
});
