/**
 * Speech timeline utilities - the ONE place timing questions are answered.
 *
 * A "speech timeline" is the canonical record of when narration is spoken
 * (see backend/src/services/audio/pipeline/speech/schemas.js). Captions,
 * Remotion animation, scene transitions, ducking and analytics all call these
 * functions instead of re-deriving timing from raw numbers, so they cannot
 * disagree with each other.
 *
 * Conventions:
 *  - times are SECONDS from the start of the scene's audio (frame / fps);
 *  - an item is "at" time t when start <= t < end;
 *  - every function is pure, allocation-light (binary search over sorted
 *    arrays) and returns a neutral value (null / [] / 0) when there is no
 *    timeline, so a template can call them unconditionally;
 *  - nothing here invents timing: only measured words are in `words`, and
 *    a segment without word timing is still timed by its real clip bounds.
 *
 * Shape (all arrays sorted by start):
 *   words:    { wordId, segmentId, index, captionIndex, text, start, end, duration, confidence, emphasis }
 *   phrases:  { phraseId, segmentId, text, start, end, firstWordId, lastWordId, wordCount, emphasis, importance }
 *   segments: { segmentId, index, text, wordCount, start, end, granularity, direction, ... }
 *   pauses:   { pauseId, start, end, duration, kind, afterId, beforeId }
 */

const isNum = (n) => typeof n === 'number' && Number.isFinite(n);

const normalizeToken = (w) => String(w ?? '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');

// ---------------------------------------------------------------------------
// Normalisation
// ---------------------------------------------------------------------------

const cache = new WeakMap();

const cleanItems = (items, required) =>
  (Array.isArray(items) ? items : [])
    .filter((x) => x && isNum(x.start) && isNum(x.end) && x.end >= x.start && required.every((k) => x[k] !== undefined && x[k] !== null))
    .sort((a, b) => a.start - b.start || a.end - b.end);

/**
 * Validates and sorts a raw timeline (render props / stored JSON). Returns a
 * normalised timeline, or null when there is nothing usable - callers treat
 * null as "no speech timing" and fall back to their fixed timing.
 * Memoised per object, so calling it every frame is free.
 */
export const normalizeSpeechTimeline = (raw) => {
  if (!raw || typeof raw !== 'object') return null;
  const hit = cache.get(raw);
  if (hit !== undefined) return hit;

  const segments = cleanItems(raw.segments, ['segmentId']);
  const result =
    segments.length === 0
      ? null
      : {
          duration: isNum(raw.duration) ? raw.duration : segments[segments.length - 1].end,
          alignmentStatus: raw.alignmentStatus || 'partial',
          granularity: raw.granularity || 'segment',
          segments,
          // A word must have positive length to be "active" at any instant.
          words: cleanItems(raw.words, ['wordId', 'text']).filter((w) => w.end > w.start),
          phrases: cleanItems(raw.phrases, ['phraseId']).filter((p) => p.end > p.start),
          pauses: cleanItems(raw.pauses, ['pauseId']).filter((p) => p.end > p.start),
        };
  cache.set(raw, result);
  return result;
};

// ---------------------------------------------------------------------------
// Point queries
// ---------------------------------------------------------------------------

/** Index of the last item with start <= t, or -1. Items must be sorted by start. */
const lastStartedIndex = (items, t) => {
  let lo = 0;
  let hi = items.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (items[mid].start <= t) {
      found = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return found;
};

/**
 * The item whose [start, end) contains t, or null. Items of one kind (words,
 * phrases, segments, pauses) don't nest, so only the last few that started
 * can contain t - the look-back covers an aligner reporting a small overlap.
 */
const itemAt = (items, t) => {
  const last = lastStartedIndex(items, t);
  for (let i = last; i >= 0 && i > last - 4; i--) {
    if (t < items[i].end) return items[i];
  }
  return null;
};

/** The word being spoken at t, or null (in a gap, a pause, or without a timeline). */
export const getWordAtTime = (timeline, t) => {
  const tl = normalizeSpeechTimeline(timeline);
  return tl ? itemAt(tl.words, t) : null;
};

/** Every word being spoken at t (normally 0 or 1; more only if an aligner reports overlap). */
export const getActiveWords = (timeline, t) => {
  const tl = normalizeSpeechTimeline(timeline);
  if (!tl) return [];
  const last = lastStartedIndex(tl.words, t);
  const out = [];
  for (let i = last; i >= 0 && i > last - 4; i--) {
    if (t < tl.words[i].end) out.unshift(tl.words[i]);
  }
  return out;
};

/** Index (into timeline.words) of the last word that has started by t; -1 before the first. */
export const getCurrentWordIndex = (timeline, t) => {
  const tl = normalizeSpeechTimeline(timeline);
  return tl ? lastStartedIndex(tl.words, t) : -1;
};

/** Words overlapping [start, end). */
export const getWordsInRange = (timeline, start, end) => {
  const tl = normalizeSpeechTimeline(timeline);
  if (!tl || !(end > start)) return [];
  return tl.words.filter((w) => w.start < end && w.end > start);
};

/** The phrase being spoken at t, or null. */
export const getPhraseAtTime = (timeline, t) => {
  const tl = normalizeSpeechTimeline(timeline);
  return tl ? itemAt(tl.phrases, t) : null;
};

/** The segment whose clip contains t (a segment is real even when only segment-level timed), or null. */
export const getSegmentAtTime = (timeline, t) => {
  const tl = normalizeSpeechTimeline(timeline);
  return tl ? itemAt(tl.segments, t) : null;
};

/**
 * The phrase that comes after the current moment: the one after the phrase
 * being spoken at t, or the first phrase starting after t when t is in a gap.
 */
export const getNextPhrase = (timeline, t) => {
  const tl = normalizeSpeechTimeline(timeline);
  if (!tl) return null;
  const idx = tl.phrases.findIndex((p) => p.start > t);
  return idx === -1 ? null : tl.phrases[idx];
};

/**
 * The phrase before the current moment: the one preceding the phrase being
 * spoken at t, or the last phrase that already ended when t is in a gap.
 */
export const getPreviousPhrase = (timeline, t) => {
  const tl = normalizeSpeechTimeline(timeline);
  if (!tl) return null;
  const current = itemAt(tl.phrases, t);
  const before = (p) => (current ? p.start < current.start : p.end <= t);
  for (let i = tl.phrases.length - 1; i >= 0; i--) {
    if (before(tl.phrases[i])) return tl.phrases[i];
  }
  return null;
};

/** The pause t falls inside, or null. */
export const getPauseAtTime = (timeline, t) => {
  const tl = normalizeSpeechTimeline(timeline);
  return tl ? itemAt(tl.pauses, t) : null;
};

/** The first pause starting after t, or null. */
export const getNextPause = (timeline, t) => {
  const tl = normalizeSpeechTimeline(timeline);
  return tl ? tl.pauses.find((p) => p.start > t) || null : null;
};

/** True while the narrator is speaking: inside a segment and not inside a pause. */
export const isSpeaking = (timeline, t) => {
  const tl = normalizeSpeechTimeline(timeline);
  return Boolean(tl) && itemAt(tl.segments, t) !== null && itemAt(tl.pauses, t) === null;
};

const clamp01 = (n) => Math.min(1, Math.max(0, n));

/** First and last moment the narrator speaks (segment bounds), or null. */
export const getSpeechBounds = (timeline) => {
  const tl = normalizeSpeechTimeline(timeline);
  if (!tl) return null;
  return { start: tl.segments[0].start, end: tl.segments[tl.segments.length - 1].end };
};

/** 0..1 through the whole narration (0 before it starts, 1 after it ends; 0 without a timeline). */
export const getSpeechProgress = (timeline, t) => {
  const bounds = getSpeechBounds(timeline);
  if (!bounds || bounds.end <= bounds.start) return 0;
  return clamp01((t - bounds.start) / (bounds.end - bounds.start));
};

/** 0..1 through a specific item (word / phrase / segment / pause), 0 before and 1 after. */
export const getItemProgress = (item, t) => (item && item.end > item.start ? clamp01((t - item.start) / (item.end - item.start)) : 0);

// ---------------------------------------------------------------------------
// Finding things in the speech (for triggers)
// ---------------------------------------------------------------------------

/**
 * Finds the first place the narration says `text` (any words, across phrase
 * boundaries), at or after `fromTime`. Matching ignores case and punctuation.
 * Only measured words can match - an unmeasured word never produces a time.
 * Returns { start, end, words } or null.
 */
export const findPhrase = (timeline, text, { fromTime = 0 } = {}) => {
  const tl = normalizeSpeechTimeline(timeline);
  const parts = String(text ?? '').split(/\s+/).map(normalizeToken).filter(Boolean);
  if (!tl || parts.length === 0) return null;

  const tokens = tl.words.map((w) => normalizeToken(w.text));
  for (let i = 0; i + parts.length <= tl.words.length; i++) {
    if (tl.words[i].start < fromTime) continue;
    if (!parts.every((p, k) => tokens[i + k] === p)) continue;
    // Words that are adjacent in the transcript, not merely adjacent among the measured ones.
    const run = tl.words.slice(i, i + parts.length);
    const contiguous = run.every((w, k) => k === 0 || w.captionIndex === undefined || run[k - 1].captionIndex === undefined || w.captionIndex === run[k - 1].captionIndex + 1);
    if (!contiguous) continue;
    return { start: run[0].start, end: run[run.length - 1].end, words: run };
  }
  return null;
};

export const findWord = (timeline, text, options) => findPhrase(timeline, text, options);

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

export const SPEECH_EVENT = Object.freeze({
  WORD_START: 'WORD_START',
  WORD_END: 'WORD_END',
  PHRASE_START: 'PHRASE_START',
  PHRASE_END: 'PHRASE_END',
  SEGMENT_START: 'SEGMENT_START',
  SEGMENT_END: 'SEGMENT_END',
  PAUSE_START: 'PAUSE_START',
  PAUSE_END: 'PAUSE_END',
});

// At the same instant, things end before the next things start, and the
// wider unit opens first / closes last (segment > phrase > word).
const EVENT_ORDER = {
  WORD_END: 0, PHRASE_END: 1, SEGMENT_END: 2, PAUSE_END: 3,
  PAUSE_START: 4, SEGMENT_START: 5, PHRASE_START: 6, WORD_START: 7,
};

const eventsCache = new WeakMap();

/**
 * Every speech event of the timeline, sorted by time:
 *   { type: 'PHRASE_START', time: 4.82, phraseId: 'phrase-12', ... }
 * The id field is wordId / phraseId / segmentId / pauseId by event kind.
 */
export const buildSpeechEvents = (timeline) => {
  const tl = normalizeSpeechTimeline(timeline);
  if (!tl) return [];
  const hit = eventsCache.get(tl);
  if (hit) return hit;

  const events = [];
  const add = (prefix, idKey, items) => {
    for (const item of items) {
      events.push({ type: `${prefix}_START`, time: item.start, [idKey]: item[idKey], segmentId: item.segmentId });
      events.push({ type: `${prefix}_END`, time: item.end, [idKey]: item[idKey], segmentId: item.segmentId });
    }
  };
  add('WORD', 'wordId', tl.words);
  add('PHRASE', 'phraseId', tl.phrases);
  add('SEGMENT', 'segmentId', tl.segments);
  add('PAUSE', 'pauseId', tl.pauses);

  events.sort((a, b) => a.time - b.time || EVENT_ORDER[a.type] - EVENT_ORDER[b.type]);
  eventsCache.set(tl, events);
  return events;
};

/** Events with from <= time < to, optionally only of the given type(s). */
export const getEventsInRange = (timeline, from, to, types = null) => {
  const wanted = types ? new Set([].concat(types)) : null;
  return buildSpeechEvents(timeline).filter((e) => e.time >= from && e.time < to && (!wanted || wanted.has(e.type)));
};

/** The first event of `type` at or after `fromTime`, or null. */
export const getNextEvent = (timeline, type, fromTime = 0) => buildSpeechEvents(timeline).find((e) => e.type === type && e.time >= fromTime) || null;

// ---------------------------------------------------------------------------
// Caption support
// ---------------------------------------------------------------------------

const SENTENCE_END = /[.!?…]["')\]]*$/;

/**
 * Splits the narration into caption groups: the units a caption shows at a time.
 *
 * Breaks happen at: the line's word limit, the maximum caption duration, a
 * real pause between words, the end of a sentence, and segment boundaries.
 * A phrase boundary is a soft break (taken once the group is at least half full)
 * so captions read naturally instead of cutting phrases in two.
 *
 * Groups are built over measured words but cover caption words by index:
 * `firstIndex..lastIndex` (inclusive, in `captionIndex` space) spans words the
 * aligner could not time too, and the groups tile the whole transcript.
 *
 * @param {object} timeline
 * @param {{ maxWordsPerLine?: number, maxCaptionDuration?: number, breakOnPause?: number, totalWords?: number }} [opts]
 *   breakOnPause: seconds of silence that force a new group (default 0.35)
 *   totalWords:   caption word count, so trailing unmeasured words join the last group
 */
export const groupCaptionWords = (timeline, opts = {}) => {
  const tl = normalizeSpeechTimeline(timeline);
  if (!tl) return [];
  const { maxWordsPerLine = 6, maxCaptionDuration = 4, breakOnPause = 0.35, totalWords = null } = opts;
  const words = tl.words.filter((w) => isNum(w.captionIndex));
  if (words.length === 0) return [];

  const phraseEnds = new Set(tl.phrases.map((p) => p.lastWordId));
  const groups = [];
  let current = [];

  const flush = () => {
    if (current.length === 0) return;
    groups.push({ words: current, start: current[0].start, end: current[current.length - 1].end });
    current = [];
  };

  words.forEach((word, i) => {
    current.push(word);
    const next = words[i + 1];
    const span = current[current.length - 1].captionIndex - current[0].captionIndex + 1;
    const hard =
      !next ||
      next.segmentId !== word.segmentId ||
      span >= maxWordsPerLine ||
      next.end - current[0].start > maxCaptionDuration ||
      // Silence only counts between neighbours in the transcript: a gap next to a word
      // the aligner could not time is that word, not a pause.
      (next.captionIndex === word.captionIndex + 1 && next.start - word.end >= breakOnPause) ||
      SENTENCE_END.test(word.text);
    const soft = phraseEnds.has(word.wordId) && span >= Math.ceil(maxWordsPerLine / 2);
    if (hard || soft) flush();
  });

  // Tile the transcript: each group runs up to the next group's first word.
  return groups.map((g, i) => {
    const firstIndex = i === 0 ? 0 : g.words[0].captionIndex;
    const nextFirst = groups[i + 1]?.words[0].captionIndex;
    const lastIndex = nextFirst !== undefined ? nextFirst - 1 : totalWords !== null ? totalWords - 1 : g.words[g.words.length - 1].captionIndex;
    return { id: `group-${i + 1}`, firstIndex, lastIndex, start: g.start, end: g.end, words: g.words };
  });
};

/**
 * Which caption group is on screen at t. A group stays up for `hold` seconds
 * after its last word (never past the next group's start) and then clears, so
 * captions don't sit on screen through a long silence. A group appears exactly
 * when its first word starts (`lead` > 0 would show an empty caption box first).
 *
 * Returns { group, index } or { group: null, index: -1 }.
 */
export const getCaptionGroupAt = (groups, t, { hold = 0.5, lead = 0 } = {}) => {
  if (!Array.isArray(groups) || groups.length === 0) return { group: null, index: -1 };
  let started = -1;
  for (let i = 0; i < groups.length && groups[i].start - lead <= t; i++) started = i;
  if (started < 0) return { group: null, index: -1 };
  const group = groups[started];
  // The next group takes over at its own start, so only the hold after the last word matters.
  return t < group.end + hold ? { group, index: started } : { group: null, index: -1 };
};

// ---------------------------------------------------------------------------
// Targets
// ---------------------------------------------------------------------------

/**
 * Resolves a "what to react to" description to its time interval:
 *   { wordId } | { phraseId } | { segmentId } | { pauseId }
 *   { phrase: 'artificial intelligence' } | { word: 'AI' }   (first spoken occurrence)
 *   { start, end }                                           (an explicit manual interval)
 * Returns { start, end } or null when it is not in the speech - callers
 * render their normal, un-animated state for null.
 */
export const resolveTarget = (timeline, target) => {
  if (!target || typeof target !== 'object') return null;
  if (isNum(target.start) && isNum(target.end)) return { start: target.start, end: target.end };

  const tl = normalizeSpeechTimeline(timeline);
  if (!tl) return null;

  const byId = (items, key, id) => items.find((x) => x[key] === id) || null;
  const item =
    (target.wordId && byId(tl.words, 'wordId', target.wordId)) ||
    (target.phraseId && byId(tl.phrases, 'phraseId', target.phraseId)) ||
    (target.segmentId && byId(tl.segments, 'segmentId', target.segmentId)) ||
    (target.pauseId && byId(tl.pauses, 'pauseId', target.pauseId)) ||
    null;
  if (item) return { start: item.start, end: item.end };

  const text = target.phrase || target.word;
  if (text) {
    const hit = findPhrase(tl, text, { fromTime: target.fromTime || 0 });
    return hit ? { start: hit.start, end: hit.end } : null;
  }
  return null;
};
