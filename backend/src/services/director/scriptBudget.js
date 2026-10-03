/**
 * How many scenes and how many words a video of a given length needs.
 * Shared by the standalone video pipeline (workers/videoWorker/scriptStep.js)
 * and the course-lesson pipeline, so both size scripts the same way.
 */

const WORDS_PER_MINUTE = 130;

// Measured across real runs, the model consistently UNDERSHOOTS a soft "about
// N words" instruction rather than hitting it - a "small scenes, more of
// them" podcast script came in at ~78% of its target, an aggregate-target
// podcast script at ~67%, and an educational script at ~55%. A flat 1.5x
// buffer on the target fed into the prompt compensates for the typical case
// without being so aggressive it inflates the token/context budget (which
// scales off this same number) past what's actually needed.
const WORD_COUNT_UNDERSHOOT_BUFFER = 1.5;

// Podcast turns are cheap to add (every turn reuses the same shared cover
// image) and read more naturally as many short back-and-forth exchanges than
// a few long monologues, so duration scales by adding MORE turns at a ~20
// words/turn baseline (matching real measured TTS timing).
const PODCAST_WORDS_PER_TURN = 20;

// Other types render a unique visual per scene, so scene count stays modest
// (~2/min) and duration is scaled via longer narration per scene instead,
// with a floor of 3 for an intro/content/summary shape.
const SCENES_PER_MINUTE = 2;
const MIN_SCENES = 3;

/**
 * Scene COUNT is derived from the unbuffered word count so it stays anchored
 * to the original ratios - only wordsPerScene picks up the buffer. Buffering
 * scene count too would have compounded with podcast's "more, shorter
 * scenes" mechanism (a 30min podcast would ask for ~293 turns instead of
 * ~195, blowing past the token budget again).
 */
function planScriptBudget({ type, durationMinutes }) {
  const minutes = Number(durationMinutes) > 0 ? Number(durationMinutes) : 5;
  const baseWordCount = Math.round(minutes * WORDS_PER_MINUTE);
  const wordCount = Math.round(baseWordCount * WORD_COUNT_UNDERSHOOT_BUFFER);

  const sceneCount = type === 'podcast'
    ? Math.max(MIN_SCENES, Math.round(baseWordCount / PODCAST_WORDS_PER_TURN))
    : Math.max(MIN_SCENES, Math.round(minutes * SCENES_PER_MINUTE));

  return { durationMinutes: minutes, sceneCount, wordCount, wordsPerScene: Math.round(wordCount / sceneCount) };
}

module.exports = { planScriptBudget, WORDS_PER_MINUTE, WORD_COUNT_UNDERSHOOT_BUFFER };
