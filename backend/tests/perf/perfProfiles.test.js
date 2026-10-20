const { PROFILES, resolveProfile, recommendProfile, describeProfiles } = require('../../src/config/perfProfiles');

describe('resolveProfile', () => {
  it('defaults to balanced, which overrides nothing (the pre-profile behaviour)', () => {
    const p = resolveProfile({});
    expect(p).toMatchObject({ name: 'balanced', requested: null, recognised: true });
    expect(p.knobs.remotionConcurrency).toBeNull();
    expect(p.source.remotionConcurrency).toBe('remotion-default');
  });

  it('applies a profile\'s measured knob and says where it came from', () => {
    const p = resolveProfile({ PERF_PROFILE: 'low-memory' });
    expect(p.knobs.remotionConcurrency).toBe(2);
    expect(p.source.remotionConcurrency).toBe('profile:low-memory');
  });

  it('lets an explicit REMOTION_CONCURRENCY beat the profile', () => {
    const p = resolveProfile({ PERF_PROFILE: 'low-memory', REMOTION_CONCURRENCY: '5' });
    expect(p.knobs.remotionConcurrency).toBe(5);
    expect(p.source.remotionConcurrency).toBe('REMOTION_CONCURRENCY');
  });

  it('ignores a nonsense explicit value instead of passing it to Remotion', () => {
    for (const bad of ['0', '-3', 'abc', '2.5x', ' ']) {
      expect(resolveProfile({ PERF_PROFILE: 'throughput', REMOTION_CONCURRENCY: bad }).knobs.remotionConcurrency).toBe(4); // falls back to the profile
    }
    expect(resolveProfile({ REMOTION_CONCURRENCY: 'abc' }).knobs.remotionConcurrency).toBeNull();
  });

  it('falls back to balanced for an unknown name and reports that it did', () => {
    const p = resolveProfile({ PERF_PROFILE: 'turbo' });
    expect(p).toMatchObject({ name: 'balanced', requested: 'turbo', recognised: false });
  });

  it('is case-insensitive and tolerates whitespace', () => {
    expect(resolveProfile({ PERF_PROFILE: '  Throughput ' }).name).toBe('throughput');
  });

  it('does not let a prototype key masquerade as a profile', () => {
    expect(resolveProfile({ PERF_PROFILE: 'constructor' }).name).toBe('balanced');
    expect(resolveProfile({ PERF_PROFILE: '__proto__' }).name).toBe('balanced');
  });
});

describe('profile contents', () => {
  it('gives every set knob an evidence note, and never touches output quality', () => {
    for (const [name, p] of Object.entries(PROFILES)) {
      for (const knob of Object.keys(p.knobs)) expect(p.evidence[knob]).toBeTruthy();
      expect(Object.keys(p.knobs)).not.toEqual(expect.arrayContaining(['quality', 'resolution', 'crf', 'fastAudio']));
      expect(name).toBeTruthy();
    }
  });

  it('keeps the cheaper draft settings in the preview profile only, as per-job defaults', () => {
    expect(PROFILES.preview.jobDefaults).toEqual({ quality: 'draft', fastAudio: true });
    for (const name of ['low-memory', 'balanced', 'throughput']) expect(PROFILES[name].jobDefaults).toBeUndefined();
  });
});

describe('recommendProfile', () => {
  it('suggests low-memory when free RAM is tight, with the reasons', () => {
    const r = recommendProfile({ ramFreeMb: 2000, ramTotalMb: 16000 });
    expect(r.profile).toBe('low-memory');
    expect(r.reasons.join(' ')).toMatch(/judgement/);
  });

  it('suggests nothing special when there is room', () => {
    expect(recommendProfile({ ramFreeMb: 6000, ramTotalMb: 16000 }).profile).toBe('balanced');
  });

  it('makes no suggestion when memory could not be read', () => {
    const r = recommendProfile({});
    expect(r.profile).toBe('balanced');
    expect(r.reasons[0]).toMatch(/could not be read/);
  });
});

describe('describeProfiles', () => {
  it('lists all four profiles, marks the active one, and carries the recommendation', () => {
    const d = describeProfiles({ PERF_PROFILE: 'throughput' }, { ramFreeMb: 8000, ramTotalMb: 16000 });
    expect(d.profiles.map((p) => p.name).sort()).toEqual(['balanced', 'low-memory', 'preview', 'throughput']);
    expect(d.profiles.filter((p) => p.active).map((p) => p.name)).toEqual(['throughput']);
    expect(d.recommendation.profile).toBe('balanced');
  });
});
