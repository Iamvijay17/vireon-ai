const { z } = require('zod');
const config = require('../../../config');

/**
 * Zod schemas for every value the narration pipeline accepts or persists.
 * Bounds that an operator can tune (speed, pitch, pauses, text length) come
 * from config.audio so the schema and the pipeline can never disagree.
 */

const STYLES = Object.freeze([
  'educational',
  'documentary',
  'conversational',
  'professional',
  'energetic',
  'dramatic',
  'cinematic',
  'inspirational',
  'calm',
  'storytelling',
]);

const EMOTIONS = Object.freeze([
  'neutral',
  'warm',
  'curious',
  'confident',
  'serious',
  'excited',
  'calm',
  'dramatic',
  'inspiring',
  'sad',
  'urgent',
]);

const DELIVERIES = Object.freeze([
  'professional',
  'conversational',
  'authoritative',
  'warm',
  'energetic',
  'soft',
  'dramatic',
]);

const AUDIO_FORMATS = Object.freeze(['wav', 'mp3']);

// Qwen3-TTS language names understood by the Gradio endpoints ("Auto" lets
// the model detect). Stored lowercase in profiles/requests.
const TTS_LANGUAGES = Object.freeze([
  'auto', 'english', 'chinese', 'japanese', 'korean', 'german', 'french', 'russian', 'portuguese', 'spanish', 'italian',
]);

const SEGMENT_STATUS = Object.freeze(['pending', 'generating', 'processing', 'completed', 'failed']);

const { pauses, speedMin, speedMax, pitchLimit, previewMaxChars } = config.audio;

const pauseMs = z.number().int().min(0).max(pauses.max);

const voiceInstructionSchema = z.object({
  emotion: z.enum(EMOTIONS).default('neutral'),
  energy: z.number().min(0).max(1).default(0.6),
  speed: z.number().min(speedMin).max(speedMax).default(1),
  pitch: z.number().min(-pitchLimit).max(pitchLimit).default(0),
  // null = "let the pause engine decide"; a number is a Voice Director
  // override that wins over the engine's defaults (still clamped to limits).
  pauseBefore: pauseMs.nullable().default(null),
  pauseAfter: pauseMs.nullable().default(null),
  // Words/phrases to stress. Bounded so a runaway LLM answer can't bloat a prompt.
  emphasis: z.array(z.string().min(1).max(60)).max(8).default([]),
  delivery: z.enum(DELIVERIES).default('professional'),
  style: z.enum(STYLES).default('professional'),
  // Free-text delivery note carried over from the script LLM (scene.audio.emotion),
  // e.g. "wry at first, then genuinely nervous". Folded into the TTS instruct.
  note: z.string().max(200).default(''),
});

const voiceStringSchema = z.string().min(1).max(260);

const voiceProfileSchema = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9-]{1,63}$/, 'id must be a lowercase slug'),
  name: z.string().min(1).max(80),
  description: z.string().max(300).default(''),
  model: z.string().min(1).max(60).default('Qwen3-TTS'),
  // Voice string in the format AudioService.resolveVoice understands:
  // "custom:<Speaker>", "clone:<file>", or "design:<description>".
  voice: voiceStringSchema,
  language: z.enum(TTS_LANGUAGES).default('auto'),
  defaultSpeed: z.number().min(speedMin).max(speedMax).default(1),
  defaultPitch: z.number().min(-pitchLimit).max(pitchLimit).default(0),
  defaultStyle: z.enum(STYLES).default('professional'),
  defaultEmotion: z.enum(EMOTIONS).default('neutral'),
  tags: z.array(z.string().max(30)).max(12).default([]),
});

const segmentErrorSchema = z.object({
  code: z.string(),
  message: z.string(),
  retryable: z.boolean().default(true),
  attempts: z.number().int().min(0).default(0),
});

const segmentSchema = z.object({
  id: z.string().min(1),
  index: z.number().int().min(0),
  sceneNumber: z.number().int().min(0).nullable().default(null),
  // Multi-speaker ready: a segment names its speaker and the profile that
  // voices it. A single-narrator scene just uses speaker "narrator".
  speaker: z.string().max(60).default('narrator'),
  voiceProfile: z.string().nullable().default(null),
  voice: voiceStringSchema,
  language: z.enum(TTS_LANGUAGES).default('auto'),
  // sourceText is the original, user-facing text (captions, UI, search).
  // spokenText is the pronunciation-processed copy and the ONLY text sent to TTS.
  sourceText: z.string().min(1),
  spokenText: z.string().min(1),
  instruction: voiceInstructionSchema,
  pauseBeforeMs: pauseMs.default(0),
  pauseAfterMs: pauseMs.default(0),
  status: z.enum(SEGMENT_STATUS).default('pending'),
  cache: z.enum(['hit', 'miss']).nullable().default(null),
  rawCacheKey: z.string().nullable().default(null),
  processedCacheKey: z.string().nullable().default(null),
  audioFile: z.string().nullable().default(null),
  rawAudioFile: z.string().nullable().default(null),
  durationMs: z.number().min(0).nullable().default(null),
  startMs: z.number().min(0).nullable().default(null),
  endMs: z.number().min(0).nullable().default(null),
  generationMs: z.number().min(0).nullable().default(null),
  processingMs: z.number().min(0).nullable().default(null),
  error: segmentErrorSchema.nullable().default(null),
});

// POST /api/tts/preview. Everything but text is optional - sensible defaults
// come from the voice profile, then from config.
const previewRequestSchema = z.object({
  text: z.string().trim().min(1, 'Text is required').max(previewMaxChars, `Preview text must be ${previewMaxChars} characters or fewer`),
  voiceProfile: z.string().max(64).optional(),
  voice: voiceStringSchema.optional(),
  style: z.enum(STYLES).optional(),
  emotion: z.enum(EMOTIONS).optional(),
  speed: z.number().min(speedMin).max(speedMax).optional(),
  pitch: z.number().min(-pitchLimit).max(pitchLimit).optional(),
  language: z.enum(TTS_LANGUAGES).optional(),
  format: z.enum(AUDIO_FORMATS).optional().default('wav'),
  // Extra respellings applied on top of the built-in dictionary for this request only.
  pronunciations: z.record(z.string().min(1).max(60), z.string().min(1).max(120)).optional(),
  fastMode: z.boolean().optional().default(false),
}).refine((v) => v.voiceProfile || v.voice, { message: 'Provide voiceProfile or voice', path: ['voice'] });

module.exports = {
  STYLES,
  EMOTIONS,
  DELIVERIES,
  AUDIO_FORMATS,
  TTS_LANGUAGES,
  SEGMENT_STATUS,
  voiceInstructionSchema,
  voiceProfileSchema,
  segmentSchema,
  previewRequestSchema,
};
