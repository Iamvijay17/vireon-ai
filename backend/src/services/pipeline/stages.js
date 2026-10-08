const { JOB_STATUS } = require('../../constants');

/**
 * The six units of work the video worker runs, in order. These are the keys of
 * `VideoJob.stages` - persisted per-stage state (status, timing, attempt,
 * structured error) that outlives the BullMQ job, so a retry, a worker restart
 * or a stalled-job reclaim can see exactly what already finished.
 *
 * Distinct from JOB_STATUS (the coarse state the UI badges show) and from
 * constants/pipelineStages.js (a read-only 9-stage reporting view derived from
 * statusHistory): this one is what the worker itself writes and trusts.
 */
const STAGES = Object.freeze({
  SCRIPT: 'script',
  AUDIO: 'audio',
  IMAGES: 'images',
  ASSETS: 'assets',
  RENDER: 'render',
  UPLOAD: 'upload',
});

const STAGE_ORDER = Object.freeze(Object.values(STAGES));

const STAGE_STATE = Object.freeze({
  PENDING: 'pending',
  RUNNING: 'running',
  COMPLETED: 'completed',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
});

/**
 * Where a job resumes when only this stage has to run again. The worker's steps
 * are gated on what is stored (script exists, audio files exist, images exist),
 * so putting the job at the failed stage's status is what makes the retry
 * re-run that stage and nothing before it.
 */
const STAGE_RESUME = Object.freeze({
  [STAGES.SCRIPT]: { status: JOB_STATUS.QUEUED, progress: 0 },
  [STAGES.AUDIO]: { status: JOB_STATUS.GENERATING_AUDIO, progress: 40 },
  [STAGES.IMAGES]: { status: JOB_STATUS.GENERATING_IMAGES, progress: 56 },
  [STAGES.ASSETS]: { status: JOB_STATUS.PREPARING_ASSETS, progress: 60 },
  [STAGES.RENDER]: { status: JOB_STATUS.RENDERING, progress: 80 },
  [STAGES.UPLOAD]: { status: JOB_STATUS.UPLOADING, progress: 90 },
});

/** Stages whose output is invalidated when an earlier one is redone. */
const DOWNSTREAM = Object.freeze({
  [STAGES.SCRIPT]: STAGE_ORDER,
  [STAGES.AUDIO]: [STAGES.AUDIO, STAGES.ASSETS, STAGES.RENDER, STAGES.UPLOAD],
  [STAGES.IMAGES]: [STAGES.IMAGES, STAGES.ASSETS, STAGES.RENDER, STAGES.UPLOAD],
  [STAGES.ASSETS]: [STAGES.ASSETS, STAGES.RENDER, STAGES.UPLOAD],
  [STAGES.RENDER]: [STAGES.RENDER, STAGES.UPLOAD],
  [STAGES.UPLOAD]: [STAGES.UPLOAD],
});

const isStageKey = (key) => STAGE_ORDER.includes(key);

module.exports = { STAGES, STAGE_ORDER, STAGE_STATE, STAGE_RESUME, DOWNSTREAM, isStageKey };
