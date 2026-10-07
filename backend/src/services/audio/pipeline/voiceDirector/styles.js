/**
 * Style presets for the Voice Director. A style sets the *baseline* delivery
 * for a whole video/scene; per-sentence cues (questions, exclamations, scene
 * position) only nudge it. Defaults stay close to neutral so narration reads
 * as natural and professional rather than theatrical.
 *
 * `phrase` is the stable wording handed to Qwen3-TTS's instruct prompt -
 * keep it fixed per style, because the instruct text is part of the cache key.
 * `pauseScale` stretches/compresses the pause engine's defaults.
 */
const STYLE_PRESETS = Object.freeze({
  professional: {
    emotion: 'neutral', energy: 0.55, speed: 1.0, delivery: 'professional', pauseScale: 1.0,
    phrase: 'clear, steady and confident, like a professional narrator',
  },
  educational: {
    emotion: 'warm', energy: 0.55, speed: 0.98, delivery: 'professional', pauseScale: 1.1,
    phrase: 'clear, patient and engaging, like a good teacher explaining an idea',
  },
  documentary: {
    emotion: 'serious', energy: 0.45, speed: 0.97, delivery: 'authoritative', pauseScale: 1.2,
    phrase: 'measured, authoritative and thoughtful, like a documentary narrator',
  },
  conversational: {
    emotion: 'warm', energy: 0.6, speed: 1.02, delivery: 'conversational', pauseScale: 0.9,
    phrase: 'relaxed, friendly and natural, as if talking to a friend',
  },
  energetic: {
    emotion: 'excited', energy: 0.8, speed: 1.06, delivery: 'energetic', pauseScale: 0.8,
    phrase: 'upbeat, lively and enthusiastic, with real momentum',
  },
  dramatic: {
    emotion: 'dramatic', energy: 0.7, speed: 0.95, delivery: 'dramatic', pauseScale: 1.4,
    phrase: 'intense and dramatic, with weight on the key moments',
  },
  cinematic: {
    emotion: 'dramatic', energy: 0.5, speed: 0.93, delivery: 'dramatic', pauseScale: 1.5,
    phrase: 'deep, cinematic and unhurried, like a movie trailer narrator',
  },
  inspirational: {
    emotion: 'inspiring', energy: 0.7, speed: 1.0, delivery: 'warm', pauseScale: 1.2,
    phrase: 'uplifting, sincere and motivating',
  },
  calm: {
    emotion: 'calm', energy: 0.3, speed: 0.94, delivery: 'soft', pauseScale: 1.3,
    phrase: 'calm, soft and soothing, with an unhurried pace',
  },
  storytelling: {
    emotion: 'warm', energy: 0.6, speed: 0.98, delivery: 'warm', pauseScale: 1.2,
    phrase: 'warm and expressive, like a storyteller drawing the listener in',
  },
});

/** Default style for each video type (constants.VIDEO_TYPES). */
const VIDEO_TYPE_STYLE = Object.freeze({
  educational: 'educational',
  marketing: 'energetic',
  story: 'storytelling',
  youtube_shorts: 'energetic',
  podcast: 'conversational',
  motivational: 'inspirational',
  business: 'professional',
});

/** Phrases for each emotion, appended to the style phrase when it differs from the style's own. */
const EMOTION_PHRASES = Object.freeze({
  neutral: '',
  warm: 'with warmth',
  curious: 'with curiosity',
  confident: 'with quiet confidence',
  serious: 'in a serious tone',
  excited: 'with genuine excitement',
  calm: 'in a calm tone',
  dramatic: 'with dramatic weight',
  inspiring: 'with an inspiring tone',
  sad: 'with a subdued, sad tone',
  urgent: 'with a sense of urgency',
});

module.exports = { STYLE_PRESETS, VIDEO_TYPE_STYLE, EMOTION_PHRASES };
