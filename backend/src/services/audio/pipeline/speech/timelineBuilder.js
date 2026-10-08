const config = require('../../../../config');
const { normalize } = require('../alignment/mapWords');
const { captionTokens } = require('../pronunciation');
const { TIMELINE_VERSION, EPSILON } = require('./schemas');

/**
 * Builds the canonical speech timeline of one scene from its assembled
 * segments and their alignment results. Pure and deterministic - the only
 * clock reading is `createdAt`, which a caller may pin.
 *
 *   assembled segments (startMs/endMs, real)   per-segment AlignmentResult
 *                 \                                   /
 *                  `----------- buildAudioTimeline ---'
 *                                    |
 *        segments[] + words[] (measured only) + phrases[] + pauses[]
 *
 * Everything is converted from the pipeline's milliseconds to seconds here,
 * exactly once, and rounded to 1 ms so equality checks are stable.
 */

const round3 = (n) => Math.round(n * 1000) / 1000;
const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

const SENTENCE_END = /[.!?…]["')\]]*$/;
const CLAUSE_END = /[,;:—–]["')\]]*$/;

/** Voice Director metadata + the pause engine's own "this line matters" signal -> normal | high. */
function importanceOf(segment) {
  const instruction = segment.instruction || {};
  if ((instruction.emphasis || []).length > 0) return 'high';
  if ((instruction.energy ?? 0) >= 0.8) return 'high';
  // The pause engine puts a beat before important statements (see pauseEngine.isImportantStatement).
  if ((segment.pauseBeforeMs ?? 0) >= config.audio.pauses.sentence * 1.2) return 'high';
  return 'normal';
}

/** Indexes of words that belong to one of the director's emphasis terms. */
function emphasisIndexes(words, terms) {
  const marked = new Set();
  const normalizedWords = words.map((w) => normalize(w.text));
  for (const term of terms || []) {
    const parts = String(term).split(/\s+/).map(normalize).filter(Boolean);
    if (parts.length === 0) continue;
    for (let i = 0; i + parts.length <= normalizedWords.length; i++) {
      if (parts.every((p, k) => normalizedWords[i + k] === p)) parts.forEach((_, k) => marked.add(words[i + k].index));
    }
  }
  return marked;
}

/** Splits a segment's measured words into phrases at punctuation, real silences and a size cap. */
function buildPhrases(segmentId, words, { phraseGapSec, maxPhraseWords, importance }) {
  const phrases = [];
  let current = [];

  const flush = () => {
    if (current.length === 0) return;
    const first = current[0];
    const last = current[current.length - 1];
    phrases.push({
      phraseId: `${segmentId}-p${String(phrases.length + 1).padStart(2, '0')}`,
      segmentId,
      text: current.map((w) => w.text).join(' '),
      start: first.start,
      end: last.end,
      duration: round3(last.end - first.start),
      firstWordId: first.wordId,
      lastWordId: last.wordId,
      wordCount: current.length,
      emphasis: current.some((w) => w.emphasis),
      importance: importance === 'high' || current.some((w) => w.emphasis) ? 'high' : 'normal',
    });
    current = [];
  };

  words.forEach((word, i) => {
    current.push(word);
    const next = words[i + 1];
    const breakHere =
      !next ||
      SENTENCE_END.test(word.text) ||
      CLAUSE_END.test(word.text) ||
      next.start - word.end >= phraseGapSec ||
      current.length >= maxPhraseWords;
    if (breakHere) flush();
  });
  return phrases;
}

/**
 * @param {object} o
 * @param {number|null} o.sceneNumber
 * @param {object[]} o.segments  assembled segments, in order: { id, index, sourceText, speaker, voice, voiceProfile, startMs, endMs, instruction?, pauseBeforeMs? }
 * @param {Map<string, object>} o.alignments segment id -> AlignmentResult (seconds from the clip start)
 * @param {number} o.durationMs  assembled track length
 * @param {string} o.provider    alignment provider name
 * @param {string} o.version     alignment version
 * @param {string} [o.createdAt]
 * @returns {object} an audioTimelineSchema-shaped timeline
 */
function buildAudioTimeline({ sceneNumber = null, segments, alignments, durationMs, provider, version, createdAt = new Date().toISOString() }) {
  const duration = round3(durationMs / 1000);
  const { minPauseMs, phraseGapMs, maxPhraseWords } = config.speech;

  const outSegments = [];
  const words = [];
  const phrases = [];
  const pauses = [];
  const fallbackReasons = [];
  let totalWords = 0;
  // Caption words before the current segment: turns a segment-local word index
  // into the scene-wide index CaptionRenderer uses.
  let captionOffset = 0;

  segments.forEach((seg) => {
    const alignment = alignments.get(seg.id) || null;
    const segStart = round3(clamp(seg.startMs / 1000, 0, duration));
    const segEnd = round3(clamp(seg.endMs / 1000, segStart, duration));
    const importance = importanceOf(seg);

    // Measured words, shifted from clip time to scene time and kept inside
    // their own clip (an aligner can overshoot the clip end by a few ms).
    const segWords = [];
    for (const w of alignment?.words || []) {
      const start = round3(clamp(segStart + w.start, segStart, segEnd));
      const end = round3(clamp(segStart + w.end, segStart, segEnd));
      if (!(end > start)) continue;
      segWords.push({
        wordId: `${seg.id}-w${String(w.index + 1).padStart(3, '0')}`,
        segmentId: seg.id,
        index: w.index,
        captionIndex: captionOffset + w.index,
        text: w.text,
        start,
        end,
        duration: round3(end - start),
        confidence: w.confidence ?? null,
        emphasis: false,
      });
    }
    // Words must be monotonic; a timing that starts before its predecessor is dropped, not "fixed".
    const ordered = [];
    for (const w of segWords) {
      const prev = ordered[ordered.length - 1];
      if (prev && w.start < prev.start) continue;
      ordered.push(w);
    }

    const marked = emphasisIndexes(ordered, seg.instruction?.emphasis);
    ordered.forEach((w) => { w.emphasis = marked.has(w.index); });

    const wordLevel = ordered.length > 0;
    const confidences = ordered.map((w) => w.confidence).filter((c) => c !== null);
    const segWordCount = alignment?.totalWords ?? captionTokens(seg.sourceText || '').length;
    totalWords += segWordCount;
    captionOffset += segWordCount;

    if (!wordLevel || alignment?.status !== 'complete') {
      fallbackReasons.push({ segmentId: seg.id, reason: alignment?.reason || 'not-aligned' });
    }

    outSegments.push({
      segmentId: seg.id,
      index: seg.index,
      text: seg.sourceText,
      wordCount: segWordCount,
      start: segStart,
      end: segEnd,
      duration: round3(segEnd - segStart),
      speaker: seg.speaker || 'narrator',
      voice: seg.voice ?? null,
      voiceProfile: seg.voiceProfile ?? null,
      confidence: confidences.length ? round3(confidences.reduce((a, b) => a + b, 0) / confidences.length) : null,
      alignmentStatus: wordLevel ? (alignment.status === 'complete' ? 'complete' : 'partial') : 'failed',
      granularity: wordLevel ? 'word' : 'segment',
      direction: {
        emotion: seg.instruction?.emotion ?? null,
        energy: seg.instruction?.energy ?? null,
        speed: seg.instruction?.speed ?? null,
        emphasis: seg.instruction?.emphasis || [],
        importance,
      },
    });

    words.push(...ordered);
    phrases.push(...buildPhrases(seg.id, ordered, { phraseGapSec: phraseGapMs / 1000, maxPhraseWords, importance }));

    // Silence inside the segment, between two measured words.
    for (let i = 1; i < ordered.length; i++) {
      // Only between neighbours in the transcript: a gap beside a word the aligner could
      // not time is that word's time, not silence.
      if (ordered[i].index !== ordered[i - 1].index + 1) continue;
      const gap = round3(ordered[i].start - ordered[i - 1].end);
      if (gap * 1000 >= minPauseMs) {
        pauses.push({
          start: ordered[i - 1].end, end: ordered[i].start, duration: gap, kind: 'word',
          afterId: ordered[i - 1].wordId, beforeId: ordered[i].wordId,
        });
      }
    }
  });

  // Silence between segments: the pause the assembler placed, measured from the real clip bounds.
  for (let i = 1; i < outSegments.length; i++) {
    const prev = outSegments[i - 1];
    const next = outSegments[i];
    const gap = round3(next.start - prev.end);
    if (gap * 1000 >= minPauseMs) {
      pauses.push({ start: prev.end, end: next.start, duration: gap, kind: 'segment', afterId: prev.segmentId, beforeId: next.segmentId });
    }
  }
  pauses.sort((a, b) => a.start - b.start);
  pauses.forEach((p, i) => { p.pauseId = `pause-${String(i + 1).padStart(3, '0')}`; });

  const wordLevelSegments = outSegments.filter((s) => s.granularity === 'word').length;
  const completeSegments = outSegments.filter((s) => s.alignmentStatus === 'complete').length;
  const alignmentStatus =
    outSegments.length > 0 && completeSegments === outSegments.length ? 'complete' : wordLevelSegments > 0 ? 'partial' : 'failed';
  const granularity = wordLevelSegments === outSegments.length ? 'word' : wordLevelSegments === 0 ? 'segment' : 'mixed';

  return {
    version: TIMELINE_VERSION,
    sceneNumber,
    alignmentStatus,
    alignmentProvider: provider,
    alignmentVersion: version,
    granularity,
    fallbackReasons,
    duration,
    createdAt,
    segments: outSegments,
    phrases,
    words,
    pauses,
    stats: {
      wordCount: totalWords,
      alignedWordCount: words.length,
      alignedRatio: totalWords > 0 ? round3(words.length / totalWords) : 0,
      phraseCount: phrases.length,
      pauseCount: pauses.length,
    },
  };
}

module.exports = { buildAudioTimeline, buildPhrases, importanceOf, emphasisIndexes, EPSILON };
