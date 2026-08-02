const AudioService = require('../services/TTS/audioService');

// Fallback for the rare custom-voice preset with no matching reference .wav
// in backend/voices/ (see AudioService.listCustomVoices) - keeps every
// option previewable even before a dedicated sample exists for it.
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

      const withPreview = (voice) => ({
        ...voice,
        previewUrl: voice.file ? `/voice-samples/${voice.file}` : PLACEHOLDER_PREVIEW_URL,
      });

      res.status(200).json({ custom: custom.map(withPreview), clone: clone.map(withPreview) });
    } catch (err) {
      next(err);
    }
  }
}

module.exports = VoiceController;
