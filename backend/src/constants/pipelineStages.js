const { JOB_STATUS } = require('./index');

/**
 * Groups the video pipeline's actual granular statuses (JOB_STATUS, defined
 * by what the worker really does - see workers/videoWorker/processor.js)
 * into the 9 named macro-stages product/ops think about the pipeline in
 * terms of. This is a read-only reporting view, not a replacement for
 * JOB_STATUS: renaming the persisted enum itself would break in-flight Mongo
 * documents, every frontend status-label switch, and the parallel
 * course-video status scale, for no functional gain over grouping it here.
 *
 * Two stages have no dedicated JOB_STATUS of their own, folded into a
 * neighboring stage rather than faked as separately-tracked work:
 * - PLANNING: the only thing resembling a "plan the video" phase is the
 *   scene-count/word-budget derivation in scriptStep.js (a synchronous,
 *   sub-second, in-process calculation) - nothing there is retryable,
 *   cacheable, or worth timing out, so it's reported as part of SCRIPTING.
 * - POST_PROCESSING: there's no processing step after the render itself -
 *   captions are burned in during RENDERING (Remotion) and audio alignment
 *   happens during TTS (faster-whisper, right after each scene's audio is
 *   downloaded) - so it's reported as part of RENDERING.
 */
const PIPELINE_STAGE_DEFS = Object.freeze([
  {
    key: 'QUEUED',
    label: 'Queued',
    statuses: [JOB_STATUS.QUEUED],
    cancellable: false,
    cacheable: false,
    retryable: false,
    timeoutConfigKey: null,
  },
  {
    key: 'PLANNING',
    label: 'Planning',
    // Folded into SCRIPTING - see file doc comment. Listed with no statuses
    // of its own so callers can still render all 9 requested stage names;
    // it always reports as an instantaneous pass-through.
    statuses: [],
    foldedInto: 'SCRIPTING',
    cancellable: false,
    cacheable: false,
    retryable: false,
    timeoutConfigKey: null,
  },
  {
    key: 'SCRIPTING',
    label: 'Scripting',
    statuses: [JOB_STATUS.SCRIPT_GENERATION, JOB_STATUS.SCRIPT_COMPLETED, JOB_STATUS.AWAITING_APPROVAL],
    cancellable: true,
    cacheable: true, // skipped entirely if a script already exists - scriptStep.js
    retryable: true,
    timeoutConfigKey: 'llm.timeout',
  },
  {
    key: 'TTS',
    label: 'Text-to-Speech',
    statuses: [JOB_STATUS.GENERATING_AUDIO, JOB_STATUS.AUDIO_COMPLETED],
    cancellable: true,
    cacheable: true, // per-scene: skips scenes that already have an audio file - audioStep.js
    retryable: true,
    timeoutConfigKey: 'tts.timeout',
  },
  {
    key: 'SCENE_GENERATION',
    label: 'Scene Generation',
    statuses: [
      JOB_STATUS.GENERATING_AVATAR,
      JOB_STATUS.GENERATING_IMAGES,
      JOB_STATUS.IMAGE_COMPLETED,
      JOB_STATUS.PREPARING_ASSETS,
    ],
    cancellable: true,
    cacheable: true, // avatar clips served from Smart Cache - avatarService.js
    retryable: true,
    timeoutConfigKey: 'avatar.timeout',
  },
  {
    key: 'RENDERING',
    label: 'Rendering',
    statuses: [JOB_STATUS.RENDERING],
    cancellable: true,
    cacheable: true, // skipped if the render's asset fingerprint is unchanged - RemotionService.isRenderCurrent
    retryable: true,
    timeoutConfigKey: 'remotion.timeout',
  },
  {
    key: 'POST_PROCESSING',
    label: 'Post-Processing',
    // Folded into RENDERING - see file doc comment.
    statuses: [],
    foldedInto: 'RENDERING',
    cancellable: false,
    cacheable: false,
    retryable: false,
    timeoutConfigKey: null,
  },
  {
    key: 'UPLOADING',
    label: 'Uploading',
    statuses: [JOB_STATUS.UPLOADING],
    cancellable: true,
    cacheable: false,
    retryable: true,
    timeoutConfigKey: 'minio.uploadTimeoutMs',
  },
  {
    key: 'COMPLETED',
    label: 'Completed',
    statuses: [JOB_STATUS.COMPLETED],
    cancellable: false,
    cacheable: false,
    retryable: false,
    timeoutConfigKey: null,
  },
]);

module.exports = { PIPELINE_STAGE_DEFS };
