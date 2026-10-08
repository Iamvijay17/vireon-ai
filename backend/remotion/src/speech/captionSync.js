import {
  getCaptionGroupAt,
  getCurrentWordIndex,
  groupCaptionWords,
  normalizeSpeechTimeline,
} from './timeline';

/**
 * Captions on the canonical speech timeline.
 *
 * CaptionRenderer used to be handed a separate per-word list
 * (`elements.captionTimestamps`). With speech timing on it reads the SAME
 * timeline as the animation primitives, so a highlighted word and an
 * animation keyed to that word can never drift apart.
 *
 * `buildCaptionModel` decides whether the timeline really describes the text
 * being captioned (a caption that is not the scene narration - e.g. an
 * on-screen headline - must not borrow its timing) and pre-computes the
 * caption groups. It returns null when it cannot be trusted; the caller then
 * uses the legacy timestamps untouched.
 *
 * `resolveCaptionState` is the per-frame lookup.
 */

const normalizeToken = (w) => String(w ?? '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');

/** Share of timeline words whose text equals the caption word at their captionIndex. */
export const matchRatio = (captionWords, timelineWords) => {
  if (timelineWords.length === 0) return 0;
  let hits = 0;
  for (const w of timelineWords) {
    if (w.captionIndex < captionWords.length && normalizeToken(captionWords[w.captionIndex]) === normalizeToken(w.text)) hits++;
  }
  return hits / timelineWords.length;
};

/**
 * @param {object} timeline raw/normalised speech timeline
 * @param {string[]} captionWords the words CaptionRenderer shows, in order
 * @param {{ maxWordsPerLine?: number, maxCaptionDuration?: number, breakOnPause?: number, minMatch?: number }} [opts]
 * @returns {{ groups: object[], wordsByIndex: Map<number, object>, phraseEndIndexByWord: Map<string, number> } | null}
 */
export const buildCaptionModel = (timeline, captionWords, opts = {}) => {
  const tl = normalizeSpeechTimeline(timeline);
  if (!tl || !Array.isArray(captionWords) || captionWords.length === 0) return null;

  const measured = tl.words.filter((w) => Number.isFinite(w.captionIndex));
  if (measured.length === 0) return null;

  // The timeline describes the scene narration; if its transcript is not the
  // same length as this caption, the caption is some other text.
  const transcriptLength = tl.segments.reduce((sum, s) => sum + (Number.isFinite(s.wordCount) ? s.wordCount : 0), 0);
  if (transcriptLength > 0 && transcriptLength !== captionWords.length) return null;
  if (matchRatio(captionWords, measured) < (opts.minMatch ?? 0.9)) return null;

  const groups = groupCaptionWords(tl, { ...opts, totalWords: captionWords.length });
  if (groups.length === 0) return null;

  const wordsByIndex = new Map(measured.map((w) => [w.captionIndex, w]));
  const byId = new Map(measured.map((w) => [w.wordId, w]));
  const phraseEndIndexByWord = new Map();
  for (const p of tl.phrases) {
    const last = byId.get(p.lastWordId);
    if (!last) continue;
    for (const w of measured) {
      if (w.segmentId === p.segmentId && w.start >= p.start && w.end <= p.end) phraseEndIndexByWord.set(w.wordId, last.captionIndex);
    }
  }

  return { timeline: tl, groups, wordsByIndex, phraseEndIndexByWord };
};

/**
 * What a caption should show at time t.
 *
 * @param {object} model from buildCaptionModel
 * @param {number} t seconds
 * @param {{ highlight?: 'word'|'phrase', hold?: number }} [opts]
 * @returns {{ firstIndex: number, lastIndex: number, activeIndex: number, emphasisIndexes: Set<number> } | null}
 *   null = show no caption right now (before speech starts, or well after a group ended)
 */
export const resolveCaptionState = (model, t, { highlight = 'word', hold = 0.5 } = {}) => {
  const { group } = getCaptionGroupAt(model.groups, t, { hold });
  if (!group) return null;

  const currentIdx = getCurrentWordIndex(model.timeline, t);
  const current = currentIdx >= 0 ? model.timeline.words[currentIdx] : null;
  let activeIndex = current && Number.isFinite(current.captionIndex) ? current.captionIndex : group.firstIndex;
  if (highlight === 'phrase' && current) activeIndex = model.phraseEndIndexByWord.get(current.wordId) ?? activeIndex;
  // Never light words beyond the group on screen.
  activeIndex = Math.min(Math.max(activeIndex, group.firstIndex), group.lastIndex);

  const emphasisIndexes = new Set();
  for (const w of group.words) if (w.emphasis) emphasisIndexes.add(w.captionIndex);

  return { firstIndex: group.firstIndex, lastIndex: group.lastIndex, activeIndex, emphasisIndexes };
};
