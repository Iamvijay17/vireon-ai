const config = require('../../../../config');
const { z } = require('zod');

/**
 * What the renderer is handed from the stored speech timeline.
 *
 * Shared by the legacy render-props builder (RemotionService) and the IR
 * compiler (ir/compile + toRenderProps) so the two stay identical - the
 * shadow-mode diff between them would flag any drift.
 *
 * Both functions return null unless ENABLE_SPEECH_DRIVEN_ANIMATION is on, so
 * with the flag off the render props are byte-for-byte what they always were.
 */

/** The timeline minus bookkeeping the renderer never reads (stats, fallback reasons, createdAt). */
function toRenderSpeech(audio) {
  if (!config.speech.drivenAnimationEnabled) return null;
  const t = audio?.speechTimeline;
  if (!t || !Array.isArray(t.segments) || t.segments.length === 0) return null;
  return {
    version: t.version,
    alignmentStatus: t.alignmentStatus,
    granularity: t.granularity,
    duration: t.duration,
    segments: t.segments,
    phrases: t.phrases || [],
    words: t.words || [],
    pauses: t.pauses || [],
  };
}

/**
 * Per-scene speech timing config. `timingMode` keeps the existing modes
 * working: only 'speech' is acted on by the renderer; 'fixed' | 'duration' |
 * 'manual' (or no config at all) render exactly as before.
 *
 *   { timingMode: 'speech', trigger: 'phrase', phrase: 'artificial intelligence',
 *     animation: 'scaleIn', target: 'title', fallbackDelayFrames: 12 }
 */
const speechTimingSchema = z.object({
  timingMode: z.enum(['fixed', 'duration', 'manual', 'speech']).default('duration'),
  trigger: z.enum(['phrase', 'word', 'segment', 'segmentEnd', 'pause', 'speechStart', 'speechEnd', 'time']).optional(),
  // phrase/word text to wait for (trigger: phrase | word)
  phrase: z.string().max(200).optional(),
  word: z.string().max(60).optional(),
  // 0-based segment index (trigger: segment | segmentEnd)
  segment: z.number().int().min(0).optional(),
  // 0-based pause index (trigger: pause)
  pause: z.number().int().min(0).optional(),
  // seconds (trigger: time - an explicit manual cue)
  time: z.number().min(0).optional(),
  // Seconds added after the trigger (negative = slightly early, e.g. anticipate the phrase).
  offset: z.number().min(-2).max(5).default(0),
  // A name from the existing Motion Design System (engine/motion).
  animation: z.string().max(40).default('fadeIn'),
  // Which layout slots follow the trigger (generative scenes): a role name or 'all'.
  target: z.string().max(40).default('title'),
  // When the trigger cannot be found in the speech, start after this many frames
  // (omit to keep the scene's own timing).
  fallbackDelayFrames: z.number().int().min(0).max(600).optional(),
}).strict();

function toRenderSpeechTiming(scene) {
  if (!config.speech.drivenAnimationEnabled) return null;
  const raw = scene?.speechTiming;
  if (!raw || typeof raw !== 'object') return null;
  const parsed = speechTimingSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

module.exports = { toRenderSpeech, toRenderSpeechTiming, speechTimingSchema };
