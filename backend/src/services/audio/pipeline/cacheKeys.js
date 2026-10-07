const config = require('../../../config');
const hashInputs = require('../../../utils/hashInputs');
const { seedFromJobId } = require('../audioService/seeding');

/**
 * Cache keys for the segmented narration pipeline.
 *
 * Two layers, so a cheap change never repeats the expensive GPU step:
 *
 *   raw key        what the TTS model was asked for: spoken text, voice
 *                  (mode/speaker/clone file/description), instruct text,
 *                  seed, model size, language, audio format.
 *   processed key  raw key + everything the CPU post-processing did on top:
 *                  speed, pitch and the processing settings (loudness target,
 *                  EQ, compression, ...).
 *
 * Changing the loudness target therefore invalidates processed audio only -
 * the raw clips stay cached and re-processing takes seconds, not GPU time.
 *
 * The pronunciation version is deliberately not hashed: the spoken text is,
 * and it is the stricter key (a dictionary bump that does not change a given
 * line leaves that line's audio valid). The version is stored beside each
 * entry for traceability instead.
 *
 * Bump KEY_VERSION to retire every segment entry at once.
 */
const KEY_VERSION = 2;
const PROCESSING_FILTER_VERSION = 1;

/** Content-derived seed: same voice + same spoken text always sounds the same. */
function seedForSegment(voice, spokenText) {
  if (typeof voice === 'string' && voice.startsWith('design:')) {
    // A designed voice has no reference anchor - pin the seed to the voice
    // description so every line stays the same speaker (see seeding.seedForVoice).
    return seedFromJobId(`design:${voice}`);
  }
  return seedFromJobId(`${voice || ''}:${spokenText}`);
}

function rawCacheKey({ spokenText, resolved, instruct, seed, modelSize, language = 'auto', format = 'wav' }) {
  return hashInputs({
    v: KEY_VERSION,
    kind: 'raw',
    spokenText,
    mode: resolved.mode,
    speaker: resolved.speaker || null,
    cloneFile: resolved.file || null,
    description: resolved.description || null,
    // Voice-clone mode ignores instruct entirely - keying on it would only
    // cause misses between identical audio.
    instruct: resolved.mode === 'clone' ? '' : instruct,
    seed,
    modelSize,
    language,
    format,
  });
}

/** The processing settings that change the output audio, as a stable object. */
function processingFingerprint(processing = config.audio.processing) {
  return {
    filterVersion: PROCESSING_FILTER_VERSION,
    enabled: processing.enabled,
    trimSilence: processing.trimSilence,
    noiseReduction: processing.noiseReduction,
    eq: processing.eq,
    compression: processing.compression,
    normalization: processing.normalization,
    targetLoudness: processing.targetLoudness,
    truePeakLimit: processing.truePeakLimit,
  };
}

function processedCacheKey({ rawKey, speed = 1, pitch = 0, processing }) {
  return hashInputs({
    v: KEY_VERSION,
    kind: 'processed',
    raw: rawKey,
    speed: Math.round(speed * 1000) / 1000,
    pitch: Math.round(pitch * 100) / 100,
    processing: processingFingerprint(processing),
  });
}

module.exports = { KEY_VERSION, seedForSegment, rawCacheKey, processedCacheKey, processingFingerprint };
