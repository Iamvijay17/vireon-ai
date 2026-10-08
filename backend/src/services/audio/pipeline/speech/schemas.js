const { z } = require('zod');

/**
 * The canonical speech timeline: ONE description of when everything in a
 * scene's narration is spoken. Captions, Remotion animation, scene timing,
 * ducking and analytics all read this and nothing else, so they cannot drift
 * apart.
 *
 * Units: SECONDS from the start of the scene's audio track, everywhere.
 * (Pipeline-internal segment fields elsewhere are milliseconds; they are
 * converted exactly once, in timelineBuilder.)
 *
 * Honesty rules baked into the shape:
 *  - `words` only ever contains words the aligner actually measured. A word
 *    it could not place is absent, never given an invented time.
 *  - a segment says how precisely it is timed (`granularity`): 'word' when
 *    its words are measured, 'segment' when only its clip bounds are known.
 *    Clip bounds are real (they come from the assembled audio), so segment
 *    level timing is a safe fallback, not a guess.
 *
 * Extensible on purpose: segments name their `speaker`/`voice`, and the
 * `direction` block carries Voice Director metadata, so multi-speaker scenes
 * and AI Director 2.0 need no schema change.
 */
const TIMELINE_VERSION = 1;

const ALIGNMENT_STATUS = Object.freeze(['complete', 'partial', 'failed']);
const GRANULARITY = Object.freeze(['word', 'mixed', 'segment']);
const IMPORTANCE = Object.freeze(['normal', 'high']);
const PAUSE_KIND = Object.freeze(['segment', 'word']);

const seconds = z.number().finite().min(0);
const confidence = z.number().min(0).max(1).nullable();

const wordSchema = z.object({
  wordId: z.string().min(1),
  segmentId: z.string().min(1),
  // Position in the segment's caption words (what CaptionRenderer splits the text into).
  index: z.number().int().min(0),
  // Position in the whole scene's caption words (segments concatenated) - the
  // index CaptionRenderer uses, so captions need no re-matching by text.
  captionIndex: z.number().int().min(0),
  text: z.string().min(1),
  start: seconds,
  end: seconds,
  duration: seconds,
  confidence,
  emphasis: z.boolean().default(false),
});

const phraseSchema = z.object({
  phraseId: z.string().min(1),
  segmentId: z.string().min(1),
  text: z.string().min(1),
  start: seconds,
  end: seconds,
  duration: seconds,
  firstWordId: z.string().min(1),
  lastWordId: z.string().min(1),
  wordCount: z.number().int().min(1),
  emphasis: z.boolean().default(false),
  importance: z.enum(IMPORTANCE).default('normal'),
});

const directionSchema = z.object({
  emotion: z.string().nullable().default(null),
  energy: z.number().min(0).max(1).nullable().default(null),
  speed: z.number().positive().nullable().default(null),
  emphasis: z.array(z.string()).default([]),
  importance: z.enum(IMPORTANCE).default('normal'),
});

const segmentSchema = z.object({
  segmentId: z.string().min(1),
  index: z.number().int().min(0),
  text: z.string(),
  // How many caption words the segment's text has (measured or not).
  wordCount: z.number().int().min(0),
  start: seconds,
  end: seconds,
  duration: seconds,
  speaker: z.string().default('narrator'),
  voice: z.string().nullable().default(null),
  voiceProfile: z.string().nullable().default(null),
  confidence,
  alignmentStatus: z.enum(ALIGNMENT_STATUS),
  granularity: z.enum(['word', 'segment']),
  direction: directionSchema,
});

const pauseSchema = z.object({
  pauseId: z.string().min(1),
  start: seconds,
  end: seconds,
  duration: seconds,
  kind: z.enum(PAUSE_KIND),
  // What the silence follows / precedes (a word id for 'word', a segment id for 'segment').
  afterId: z.string().nullable().default(null),
  beforeId: z.string().nullable().default(null),
});

const fallbackReasonSchema = z.object({
  segmentId: z.string(),
  reason: z.string(),
});

const audioTimelineSchema = z.object({
  version: z.literal(TIMELINE_VERSION),
  sceneNumber: z.number().int().min(0).nullable().default(null),
  alignmentStatus: z.enum(ALIGNMENT_STATUS),
  alignmentProvider: z.string(),
  alignmentVersion: z.string(),
  granularity: z.enum(GRANULARITY),
  // Why any segment fell back to segment-level timing - for debugging, never shown to users.
  fallbackReasons: z.array(fallbackReasonSchema).default([]),
  duration: seconds,
  createdAt: z.string(),
  segments: z.array(segmentSchema),
  phrases: z.array(phraseSchema),
  words: z.array(wordSchema),
  pauses: z.array(pauseSchema),
  stats: z.object({
    wordCount: z.number().int().min(0),
    alignedWordCount: z.number().int().min(0),
    alignedRatio: z.number().min(0).max(1),
    phraseCount: z.number().int().min(0),
    pauseCount: z.number().int().min(0),
  }),
});

// GET /api/videos/:id/speech-timeline
const speechTimelineQuerySchema = z.object({
  scene: z.coerce.number().int().positive().optional(),
});

// Tolerance when comparing floating point seconds that were rounded to ms.
const EPSILON = 0.0015;

/**
 * Checks the invariants every consumer relies on. Returns a list of problems
 * (empty = sound). The builder is written so it cannot emit these, so this is
 * a guard for tests, the API and anything that loads an older stored timeline.
 */
function validateTimeline(timeline) {
  const issues = [];
  const limit = timeline.duration + EPSILON;
  const check = (kind, item, strict) => {
    const id = item.wordId || item.phraseId || item.segmentId || item.pauseId;
    if (strict ? !(item.start < item.end) : !(item.start <= item.end)) issues.push(`${kind} ${id}: start ${item.start} is not before end ${item.end}`);
    if (Math.abs(item.duration - (item.end - item.start)) > EPSILON) issues.push(`${kind} ${id}: duration ${item.duration} != end - start`);
    if (item.start < 0 || item.end > limit) issues.push(`${kind} ${id}: ${item.start}-${item.end} outside the audio (0-${timeline.duration})`);
  };

  timeline.words.forEach((w) => check('word', w, true));
  timeline.phrases.forEach((p) => check('phrase', p, true));
  timeline.segments.forEach((s) => check('segment', s, false));
  timeline.pauses.forEach((p) => check('pause', p, true));

  for (let i = 1; i < timeline.words.length; i++) {
    if (timeline.words[i].start < timeline.words[i - 1].start - EPSILON) {
      issues.push(`word ${timeline.words[i].wordId}: starts before the previous word`);
    }
  }
  for (let i = 1; i < timeline.segments.length; i++) {
    if (timeline.segments[i].start < timeline.segments[i - 1].end - EPSILON) {
      issues.push(`segment ${timeline.segments[i].segmentId}: overlaps the previous segment`);
    }
  }
  const segmentById = new Map(timeline.segments.map((s) => [s.segmentId, s]));
  for (const w of timeline.words) {
    const seg = segmentById.get(w.segmentId);
    if (!seg) issues.push(`word ${w.wordId}: unknown segment ${w.segmentId}`);
    else if (w.start < seg.start - EPSILON || w.end > seg.end + EPSILON) issues.push(`word ${w.wordId}: outside its segment`);
  }
  return issues;
}

module.exports = {
  TIMELINE_VERSION,
  ALIGNMENT_STATUS,
  GRANULARITY,
  EPSILON,
  wordSchema,
  phraseSchema,
  segmentSchema,
  pauseSchema,
  audioTimelineSchema,
  speechTimelineQuerySchema,
  validateTimeline,
};
