const crypto = require('crypto');
const hashInputs = require('../../utils/hashInputs');
const { rawCacheKey, processedCacheKey } = require('../audio/pipeline/cacheKeys');

/**
 * The one place that says what each kind of cached artifact is keyed on.
 *
 * A cache key must name EVERYTHING that changes the artifact and nothing that does not:
 * too little and a stale or wrong result is served; too much and identical work is
 * never recognised. Resource ids (job-xxxx, sce-xxxx) are deliberately not inputs -
 * the same prompt asked for by two jobs is one image.
 *
 *   image        prompt, negative prompt, seed, sampling size, output size, steps, cfg,
 *                sampler, scheduler, checkpoint, and the workflow file's own bytes
 *   tts          spoken text, voice (mode / speaker / clone file / description), delivery
 *                instruction, seed, model size            (legacy one-call-per-scene path)
 *   tts segment  raw: the above for one segment; processed: raw + speed, pitch and the
 *                post-processing settings                 (segmented narration pipeline)
 *   alignment    the audio it was measured from + the aligner (provider, model, version)
 *   composition  every part of a scene that feeds its on-screen result, + render settings
 *   render       the whole render-props payload (RemotionService.isRenderCurrent)
 *   script       topic, type, language, length, the model and the planning rules
 *
 * Key versions are bumped here to retire a whole kind at once.
 */

const sha = (value) => crypto.createHash('sha256').update(String(value)).digest('hex');

/**
 * Image key. MUST stay byte-identical to what ImageGenerationService has always computed
 * (hashInputs of the generation params plus the workflow hash): every picture already in
 * the cache bucket is addressed by it, and changing it would silently orphan all of them.
 * tests/cache/cacheKeys.test.js pins this.
 */
function imageKey(params, workflowBytes) {
  return hashInputs({ ...params, workflow: sha(workflowBytes) });
}

/** Legacy whole-scene TTS key: same function CacheService.hashTtsInputs has always been. */
function ttsKey(inputs) {
  return hashInputs(inputs);
}

/** Segmented pipeline: the raw (GPU) clip and the post-processed clip. */
const ttsSegmentRawKey = rawCacheKey;
const ttsSegmentProcessedKey = processedCacheKey;

const ALIGNMENT_KEY_VERSION = 1;

/**
 * Word timing for a clip. Depends on the audio it was measured from and on what measured
 * it, so a new aligner model or mapper version re-measures instead of trusting old timings.
 */
function alignmentKey({ audioKey, spokenText, provider, model, version }) {
  return hashInputs({ v: ALIGNMENT_KEY_VERSION, kind: 'alignment', audioKey, spokenText, provider, model, version });
}

const COMPOSITION_KEY_VERSION = 1;

/**
 * A scene's composition: its per-part fingerprints (services/scene/sceneFingerprint.js,
 * which already name every input of each part) plus the video-level settings that change
 * how it is drawn.
 */
function compositionKey({ fingerprints, video = {} }) {
  return hashInputs({
    v: COMPOSITION_KEY_VERSION,
    kind: 'composition',
    parts: {
      script: fingerprints.script,
      captions: fingerprints.captions,
      image: fingerprints.image,
      layout: fingerprints.layout,
      motion: fingerprints.motion,
      transition: fingerprints.transition,
    },
    video: {
      aspectRatio: video.aspectRatio || '16:9',
      resolution: video.resolution || '1920x1080',
      fontPairing: video.fontPairing || 'default',
      captionAnimation: video.captionAnimation || 'fadeInUp',
    },
  });
}

/**
 * The finished video, keyed on the exact render-props payload. This is the same
 * fingerprint RemotionService records beside a render, so "is this render still
 * current?" and "is there a cached render for this?" are one question.
 */
function renderKey(assets, { quality = 'standard' } = {}) {
  return hashInputs({ v: 1, kind: 'render', quality, assets: sha(JSON.stringify(assets)) });
}

const SCRIPT_KEY_VERSION = 1;

/**
 * A script is the one deliberately NON-cached artifact: sampling is creative on purpose
 * (temperature 0.7), so serving an old script for a new request would defeat
 * "regenerate". The key exists so a script's inputs are recorded with it
 * (brief.inputKey) and two videos made from the same inputs can be recognised as such.
 */
function scriptKey({ topic, videoType, language, durationMinutes, llmModel, directorVersion }) {
  return hashInputs({
    v: SCRIPT_KEY_VERSION,
    kind: 'script',
    topic: String(topic || '').trim().toLowerCase(),
    videoType,
    language,
    durationMinutes,
    llmModel,
    directorVersion,
  });
}

module.exports = {
  imageKey,
  ttsKey,
  ttsSegmentRawKey,
  ttsSegmentProcessedKey,
  alignmentKey,
  compositionKey,
  renderKey,
  scriptKey,
};
