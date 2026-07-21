const AudioService = require('../services/TTS/audioService');

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

      res.status(200).json({ custom, clone });
    } catch (err) {
      next(err);
    }
  }
}

module.exports = VoiceController;
