const { listProfiles, getProfile, resolveVoiceFor } = require('../../src/services/audio/pipeline/voiceProfiles');
const { QWEN_SPEAKERS } = require('../../src/services/audio/audioService/voiceCatalog');

describe('voice profiles', () => {
  it('ships the standard profiles, all valid', () => {
    const ids = listProfiles().map((p) => p.id);
    expect(ids).toEqual(expect.arrayContaining(['professional-narrator', 'educational-teacher', 'energetic-presenter', 'documentary-narrator']));
    listProfiles().forEach((p) => expect(p.model).toBe('Qwen3-TTS'));
  });

  it('only references speakers the TTS model actually has', () => {
    for (const p of listProfiles().filter((x) => x.voice.startsWith('custom:'))) {
      expect(QWEN_SPEAKERS).toContain(p.voice.slice('custom:'.length));
    }
  });

  it('resolves a profile to its voice', () => {
    expect(resolveVoiceFor({ voiceProfile: 'professional-narrator' })).toMatchObject({ voice: 'custom:Ryan', speaker: 'narrator' });
  });

  it('falls back to the caller voice (legacy keys keep working)', () => {
    expect(resolveVoiceFor({ voice: 'female-1' })).toMatchObject({ profile: null, voice: 'female-1' });
  });

  it('maps speakers to their own voices - multi-speaker without code changes', () => {
    const speakers = { teacher: 'professional-narrator', student: 'energetic-presenter', guest: 'custom:Vivian' };
    expect(resolveVoiceFor({ speaker: 'teacher', speakers }).voice).toBe(getProfile('professional-narrator').voice);
    expect(resolveVoiceFor({ speaker: 'student', speakers }).voice).toBe(getProfile('energetic-presenter').voice);
    expect(resolveVoiceFor({ speaker: 'guest', speakers }).voice).toBe('custom:Vivian');
    expect(resolveVoiceFor({ speaker: 'narrator', speakers, voice: 'custom:Eric' }).voice).toBe('custom:Eric');
  });
});
