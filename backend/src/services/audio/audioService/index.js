const voiceCatalog = require('./voiceCatalog');
const seeding = require('./seeding');
const { alignCaptions } = require('./captionAlignment');
const sceneSynthesis = require('./sceneSynthesis');
const standaloneSynthesis = require('./standaloneSynthesis');

/**
 * Service for generating audio via Pinokio Qwen3-TTS API.
 * Supports two voice modes:
 *  - "custom:<Speaker>"  -> one of Qwen3-TTS's built-in speaker presets
 *  - "clone:<file>.wav"  -> voice cloning from a reference .wav file in backend/voices/
 * Legacy bare keys (male-1, female-1, ...) are still accepted and mapped to a preset.
 * Single Responsibility: Text-to-speech generation.
 *
 * Split across voiceCatalog.js (voice listing/resolution), seeding.js
 * (deterministic seed derivation), ttsClient.js (Gradio endpoint calls),
 * captionAlignment.js (forced alignment), sceneSynthesis.js (the
 * video-job scene pipeline) and standaloneSynthesis.js (the Audio Studio
 * pipeline) - this file composes their exports into the one object every
 * caller requires as AudioService.
 */
module.exports = {
  QWEN_SPEAKERS: voiceCatalog.QWEN_SPEAKERS,
  listCustomVoices: voiceCatalog.listCustomVoices,
  listCloneVoices: voiceCatalog.listCloneVoices,
  resolveVoice: voiceCatalog.resolveVoice,
  resolveGenderSync: voiceCatalog.resolveGenderSync,
  turnGapSeconds: seeding.turnGapSeconds,
  alignCaptions,
  generateSceneAudio: sceneSynthesis.generateSceneAudio,
  generateAllAudio: sceneSynthesis.generateAllAudio,
  generateStandaloneAudio: standaloneSynthesis.generateStandaloneAudio,
  generateStandaloneAudioChunk: standaloneSynthesis.generateStandaloneAudioChunk,
  generateDialogueTurnAudio: standaloneSynthesis.generateDialogueTurnAudio,
};
