/**
 * Resolves which voice speaks a scene's line. Podcast dialogue turns pick
 * the per-scene voice from the "host"/"guest" speaker tag + the job's two
 * chosen voices, instead of relying on a single job-wide voice; other video
 * types just keep whatever the scene/job already specified.
 */
class VoicePlanningService {
  static resolve(scene, { hostVoice = '', guestVoice = '', videoType = '' } = {}) {
    const speaker = scene.speaker === 'guest' ? 'guest' : (scene.speaker === 'host' ? 'host' : '');
    const resolvedVoice = speaker && videoType === 'podcast'
      ? (speaker === 'guest' ? guestVoice : hostVoice) || scene.audio?.voice || ''
      : scene.audio?.voice || '';

    return { speaker, voice: resolvedVoice };
  }
}

module.exports = VoicePlanningService;
