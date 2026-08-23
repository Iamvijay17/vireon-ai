const AudioService = require('../services/audio/audioService');
const FavoriteVoice = require('../models/FavoriteVoice');

// Fallback for the rare custom-voice preset with no matching reference .wav
// in backend/voices/ (see AudioService.listCustomVoices) - keeps every
// option previewable even before a dedicated sample exists for it.
const PLACEHOLDER_PREVIEW_URL = '/voice-samples/default_female_voice.wav';

class VoiceController {
  /**
   * GET /api/voices - List available TTS voices: built-in custom-voice
   * presets and cloneable reference voices discovered from backend/voices/,
   * each flagged with isFavorite from the DB-backed favorites list.
   */
  static async list(req, res, next) {
    try {
      const [custom, clone, favorites] = await Promise.all([
        AudioService.listCustomVoices(),
        AudioService.listCloneVoices(),
        FavoriteVoice.find().lean(),
      ]);

      const favoriteIds = new Set(favorites.map((f) => f.voiceId));

      const withPreview = (voice) => ({
        ...voice,
        previewUrl: voice.file ? `/voice-samples/${voice.file}` : PLACEHOLDER_PREVIEW_URL,
        isFavorite: favoriteIds.has(voice.id),
      });

      res.status(200).json({ custom: custom.map(withPreview), clone: clone.map(withPreview) });
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/voices/favorites - List favorited voice ids.
   */
  static async listFavorites(req, res, next) {
    try {
      const favorites = await FavoriteVoice.find().lean();
      res.status(200).json({ favorites: favorites.map((f) => f.voiceId) });
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/voices/favorites { voiceId } - Mark a voice as favorite.
   */
  static async addFavorite(req, res, next) {
    try {
      const { voiceId } = req.body;
      if (!voiceId || typeof voiceId !== 'string') {
        return res.status(400).json({ message: 'voiceId is required' });
      }

      await FavoriteVoice.updateOne(
        { voiceId },
        { $setOnInsert: { voiceId } },
        { upsert: true }
      );

      const favorites = await FavoriteVoice.find().lean();
      res.status(200).json({ favorites: favorites.map((f) => f.voiceId) });
    } catch (err) {
      next(err);
    }
  }

  /**
   * DELETE /api/voices/favorites { voiceId } - Unmark a voice as favorite.
   */
  static async removeFavorite(req, res, next) {
    try {
      const { voiceId } = req.body;
      if (!voiceId || typeof voiceId !== 'string') {
        return res.status(400).json({ message: 'voiceId is required' });
      }

      await FavoriteVoice.deleteOne({ voiceId });

      const favorites = await FavoriteVoice.find().lean();
      res.status(200).json({ favorites: favorites.map((f) => f.voiceId) });
    } catch (err) {
      next(err);
    }
  }
}

module.exports = VoiceController;
