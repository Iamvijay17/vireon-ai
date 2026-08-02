const AudioService = require('../services/TTS/audioService');

// TODO: replace with a real per-voice sample once distinct recordings/TTS
// clips exist for each preset - every voice option shares this one file for
// now so the frontend can preview "a voice" before dedicated samples land.
const PLACEHOLDER_PREVIEW_URL = '/voice-samples/default_female_voice.wav';

class VoiceController {
  /**
   * GET /api/voices - List available TTS voices: built-in custom-voice
   * presets and cloneable reference voices discovered from backend/voices/.
   */
  static async list(req, res, next) {
    try {
      const [custom, clone] = await Promise.all([
        AudioService.listCustomVoices(),
        AudioService.listCloneVoices(),
      ]);

      const withPreview = (voice) => ({ ...voice, previewUrl: PLACEHOLDER_PREVIEW_URL });

      res.status(200).json({ custom: custom.map(withPreview), clone: clone.map(withPreview) });
    } catch (err) {
      next(err);
    }
  }
}

module.exports = VoiceController;
