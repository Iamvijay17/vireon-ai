const { direct, resolveStyle, emotionFromNote, extractEmphasis, buildInstruct } = require('../../src/services/audio/pipeline/voiceDirector');
const { voiceInstructionSchema, STYLES } = require('../../src/services/audio/pipeline/schemas');
const { STYLE_PRESETS } = require('../../src/services/audio/pipeline/voiceDirector/styles');

describe('resolveStyle', () => {
  it('prefers explicit style, then profile, then video type, then the default', () => {
    expect(resolveStyle({ style: 'calm', profile: { defaultStyle: 'energetic' }, videoType: 'story' })).toBe('calm');
    expect(resolveStyle({ profile: { defaultStyle: 'documentary' }, videoType: 'story' })).toBe('documentary');
    expect(resolveStyle({ videoType: 'story' })).toBe('storytelling');
    expect(resolveStyle({})).toBe('professional');
  });

  it('ignores unknown styles', () => {
    expect(resolveStyle({ style: 'robotic' })).toBe('professional');
  });

  it('has a preset for every supported style', () => {
    for (const s of STYLES) expect(STYLE_PRESETS[s]).toBeDefined();
  });
});

describe('direct', () => {
  it('returns schema-valid instructions, one per text', () => {
    const out = direct(['Hello there.', 'This is great!', 'Why does it work?']);
    expect(out).toHaveLength(3);
    out.forEach((i) => expect(voiceInstructionSchema.safeParse(i).success).toBe(true));
  });

  it('keeps ordinary sentences natural - not every line is emotional', () => {
    const out = direct(['Databases store data.', 'Indexes make queries faster.'], { style: 'professional' });
    expect(out.every((i) => i.emotion === 'neutral')).toBe(true);
    expect(out[0]).toEqual(out[1]);
  });

  it('lifts energy on exclamations and colours questions with curiosity', () => {
    const [plain, bang, question] = direct(['It works.', 'It works!', 'Does it work?']);
    expect(bang.energy).toBeGreaterThan(plain.energy);
    expect(question.emotion).toBe('curious');
  });

  it('does not override a stronger emotion with a question', () => {
    const [q] = direct(['Are you ready?'], { style: 'dramatic' });
    expect(q.emotion).toBe('dramatic');
  });

  it('keeps the script LLM note verbatim and maps it to an emotion', () => {
    const [i] = direct(['Fine.'], { note: 'wry at first, then genuinely nervous' });
    expect(i.note).toBe('wry at first, then genuinely nervous');
    expect(emotionFromNote('sounding excited and upbeat')).toBe('excited');
    expect(emotionFromNote('')).toBeNull();
  });

  it('applies user overrides last and clamps them to the configured range', () => {
    const [i] = direct(['Hello.'], { overrides: { speed: 9, emotion: 'sad', pauseAfter: 700 } });
    expect(i.speed).toBeLessThanOrEqual(1.2);
    expect(i.emotion).toBe('sad');
    expect(i.pauseAfter).toBe(700);
  });

  it('slows the closing line slightly', () => {
    const [mid, last] = direct(['One.', 'Two.'], { isLastScene: true });
    expect(last.speed).toBeLessThan(mid.speed);
  });

  it('leaves pauses to the pause engine unless overridden', () => {
    const [i] = direct(['Hello.']);
    expect(i.pauseBefore).toBeNull();
    expect(i.pauseAfter).toBeNull();
  });
});

describe('extractEmphasis', () => {
  it('finds *marked* words and SHOUTED words but not acronyms', () => {
    expect(extractEmphasis('This is *really* important and NEVER optional.')).toEqual(['really', 'never']);
    expect(extractEmphasis('We parse JSON over HTTP with the API.')).toEqual([]);
  });

  it('caps the list at three', () => {
    expect(extractEmphasis('*a* *b* *c* *d* *e*')).toHaveLength(3);
  });
});

describe('buildInstruct', () => {
  const base = voiceInstructionSchema.parse({});

  it('is deterministic', () => {
    expect(buildInstruct(base)).toBe(buildInstruct({ ...base }));
  });

  it('never mentions speed or pitch (those are applied as audio processing)', () => {
    const s = buildInstruct({ ...base, speed: 1.15, pitch: 1 });
    expect(s).not.toMatch(/speed|pitch the|semitone/i);
  });

  it('includes emphasis, note and energy cues when present', () => {
    const s = buildInstruct({ ...base, energy: 0.9, emphasis: ['really'], note: 'with a smile.' });
    expect(s).toContain('energy high');
    expect(s).toContain('"really"');
    expect(s).toContain('Delivery note: with a smile.');
  });

  it('uses conversational openings for podcast roles and named speakers', () => {
    expect(buildInstruct(base, { role: 'host' })).toMatch(/podcast host/);
    expect(buildInstruct(base, { role: 'guest' })).toMatch(/podcast guest/);
    expect(buildInstruct(base, { speakerName: 'Maya' })).toMatch(/like Maya/);
  });
});
