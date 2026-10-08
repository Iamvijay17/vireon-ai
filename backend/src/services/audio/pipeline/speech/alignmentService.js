const config = require('../../../../config');
const { alignBatch, getProvider, getAlignmentVersion: getProviderVersion } = require('../alignment');
const { mapToOriginalWords } = require('../alignment/mapWords');

/**
 * SpeechAlignmentService - the one door between the pipeline and whatever
 * measures speech. It owns everything that must not depend on the engine:
 * the normalised result shape, the status rules, and the "never invent a
 * timestamp" guarantee.
 *
 *   audio clip --provider--> heard words --mapWords--> caption words
 *                                                          |
 *                      measured (kept) / unmeasured (dropped, counted)
 *
 * A provider only has to return `[{ word, start, end, probability? }]` in
 * seconds (or null). Swapping faster-whisper for another aligner is a
 * `registerProvider` call; nothing here or downstream changes.
 *
 * Result of aligning one clip (`AlignmentResult`, seconds from the clip start):
 *   status      'complete' | 'partial' | 'failed'
 *   provider    provider name          version  provider+mapper version
 *   words       MEASURED caption words only: { index, text, start, end, confidence }
 *   totalWords  caption words in the clip   alignedWords  how many were measured
 *   reason      why it is not 'complete' (debugging only), else null
 *   captionWords  every caption word incl. interpolated ones flagged
 *               `estimated:true` - the legacy captionTimestamps shape. It is
 *               NOT part of the canonical timeline.
 *
 * Status rules:
 *   complete  >= config.speech.completeRatio of the caption words were measured
 *   partial   some, but fewer (and at least the mapper's minimum match)
 *   failed    the aligner produced nothing usable, or too little matched to
 *             trust any of it
 */

// Bump when the heard-words -> caption-words mapping changes in a way that
// can move timestamps; it is part of the stored alignment version.
const MAPPER_VERSION = 1;

const round3 = (n) => Math.round(n * 1000) / 1000;

function getAlignmentVersion() {
  return `${getProviderVersion()}/m${MAPPER_VERSION}`;
}

/** Whitespace tokens, the same unit pronunciation.captionTokens produces for plain text. */
function plainTokens(text) {
  return (String(text || '').match(/\S+/g) || []).map((t) => ({ text: t }));
}

function identityWordMap(tokens) {
  return tokens.map((t, index) => ({ index, text: t.text, spokenStart: index, spokenEnd: index }));
}

/**
 * Turn what an aligner heard into a normalised result. Pure - exported for tests.
 *
 * @param {object|null} heard aligner output for the clip, or null when it produced nothing
 * @param {object} clip { text, spokenTokens, wordMap, durationSec }
 */
function normalizeAlignment(heard, clip) {
  const provider = getProvider().name;
  const version = getAlignmentVersion();
  const spokenTokens = clip.spokenTokens || plainTokens(clip.spokenText ?? clip.text);
  const wordMap = clip.wordMap || identityWordMap(plainTokens(clip.text));
  const totalWords = wordMap.length;
  const base = { provider, version, totalWords, alignedWords: 0, matchedRatio: 0, words: [], captionWords: null, reason: null };

  if (totalWords === 0) return { ...base, status: 'failed', reason: 'no-words' };
  if (!heard || heard.length === 0) return { ...base, status: 'failed', reason: 'no-timings-from-provider' };

  const mapped = mapToOriginalWords(heard, spokenTokens, wordMap);
  if (!mapped) return { ...base, status: 'failed', reason: 'low-match' };

  const limit = Number.isFinite(clip.durationSec) ? clip.durationSec : Infinity;
  const words = [];
  mapped.words.forEach((w, index) => {
    // Interpolated words (estimated) are deliberately left out: the canonical
    // timeline only holds what was measured. A zero-length or out-of-clip
    // timing is not a measurement either.
    if (w.estimated || !Number.isFinite(w.start) || !Number.isFinite(w.end)) return;
    const start = Math.max(0, Math.min(w.start, limit));
    const end = Math.min(w.end, limit);
    if (!(end > start)) return;
    words.push({ index, text: w.word, start: round3(start), end: round3(end), confidence: w.confidence ?? null });
  });

  // A caption token with no letter or digit (a stray "—" or "&") has no spoken form,
  // so it can never be measured and must not count against completeness.
  const speakable = wordMap.filter((e) => /[\p{L}\p{N}]/u.test(e.text)).length || totalWords;
  const ratio = words.length / speakable;
  const status = words.length === 0 ? 'failed' : ratio >= config.speech.completeRatio ? 'complete' : 'partial';
  return {
    ...base,
    status,
    words,
    alignedWords: words.length,
    matchedRatio: mapped.matchedRatio,
    captionWords: mapped.words,
    reason: status === 'complete' ? null : status === 'failed' ? 'no-measured-words' : 'partial-match',
  };
}

/**
 * Align several clips with the configured provider, in one provider call (the
 * model loads once) and under the alignment concurrency limit.
 *
 * @param {{ id?: string, audioPath: string, text: string, spokenText?: string, spokenTokens?: object[], wordMap?: object[], language?: string, durationSec?: number }[]} clips
 * @param {{ signal?: AbortSignal }} [opts]
 * @returns {Promise<object[]>} one AlignmentResult per clip, in order. Never throws for a per-clip problem.
 */
async function alignClips(clips, { signal } = {}) {
  if (clips.length === 0) return [];

  const provider = getProvider();
  if (provider.name === 'none') {
    return clips.map((c) => ({
      ...normalizeAlignment(null, c), reason: 'alignment-disabled',
    }));
  }

  const heard = await alignBatch(
    clips.map((c) => c.audioPath),
    {
      signal,
      languages: clips.map((c) => c.language || 'auto'),
      prompts: clips.map((c) => c.spokenText ?? c.text),
    }
  );
  return clips.map((clip, i) => normalizeAlignment(heard[i], clip));
}

/**
 * Align one audio file against its text.
 *
 * @param {object} o
 * @param {string} o.audioPath
 * @param {string} o.text      the words as shown (captions); what timings are reported for
 * @param {string} [o.language] Qwen3-TTS language name, 'auto' to detect
 * @param {object} [o.options] { spokenText, spokenTokens, wordMap, durationSec, signal }
 *                             - supply the pronunciation-processed spoken text/map when `text` was respelled before TTS
 * @returns {Promise<object>} AlignmentResult
 */
async function alignAudio({ audioPath, text, language, options = {} }) {
  const { signal, ...clipOptions } = options;
  const [result] = await alignClips([{ audioPath, text, language, ...clipOptions }], { signal });
  return result;
}

/** True when a cached/stored alignment was measured by what would measure it today. */
function isCurrentAlignment(alignment) {
  return Boolean(alignment) && alignment.version === getAlignmentVersion() && (alignment.status === 'complete' || alignment.status === 'partial');
}

module.exports = { alignAudio, alignClips, normalizeAlignment, getAlignmentVersion, isCurrentAlignment, MAPPER_VERSION };
