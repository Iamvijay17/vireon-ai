const config = require('../../../config');
const { JOB_STATUS, JOB_STEPS } = require('../../../constants');
const { PIPELINE_STAGE_DEFS } = require('../../../constants/pipelineStages');
const ActivityLogService = require('../../common/ActivityLogService');

// Reverse lookup: JOB_STATUS value -> owning stage key, built once from the
// non-folded stage defs (PLANNING/POST_PROCESSING own no statuses - see
// pipelineStages.js).
const STATUS_TO_STAGE = new Map();
for (const def of PIPELINE_STAGE_DEFS) {
  for (const status of def.statuses) STATUS_TO_STAGE.set(status, def.key);
}

const STAGE_ORDER = PIPELINE_STAGE_DEFS.map((d) => d.key);

/** Dotted-path lookup into `config` (e.g. 'lmStudio.timeout') - null-safe. */
function resolveTimeout(configKey) {
  if (!configKey) return null;
  return configKey.split('.').reduce((obj, part) => (obj == null ? obj : obj[part]), config) ?? null;
}

/**
 * A completed/failed/cancelled job's terminal status (COMPLETED aside) isn't
 * itself one of a stage's tracked statuses - RETRY_SCHEDULED and CANCELLED
 * can happen from any stage, and FAILED/CANCELLED overwrite whatever status
 * the job was actually in. Resolve which stage the job was really in when
 * that happened: prefer the recorded error step (set by processor.js right
 * before marking FAILED/RETRY_SCHEDULED), falling back to the last
 * "real" pipeline status seen in statusHistory.
 */
function resolveEffectiveStatus(videoJob) {
  const { status } = videoJob;
  if (STATUS_TO_STAGE.has(status)) return status;

  if (videoJob.error?.step && STATUS_TO_STAGE.has(videoJob.error.step)) {
    return videoJob.error.step;
  }

  const history = videoJob.statusHistory || [];
  for (let i = history.length - 1; i >= 0; i--) {
    if (STATUS_TO_STAGE.has(history[i].to)) return history[i].to;
  }

  return JOB_STATUS.QUEUED;
}

/** Stage-level status for the CURRENT stage, reflecting the job's overall outcome. */
function currentStageStatus(videoJob) {
  if (videoJob.status === JOB_STATUS.CANCELLED) return 'cancelled';
  if (videoJob.status === JOB_STATUS.FAILED) return 'failed';
  if (videoJob.status === JOB_STATUS.RETRY_SCHEDULED) return 'failed';
  if (videoJob.status === JOB_STATUS.COMPLETED) return 'completed';
  return 'running';
}

/** Sum of statusHistory[].durationMs spent in any of `statuses`, plus live time if currently in one of them. */
function durationForStage(videoJob, statuses, isCurrent) {
  const history = videoJob.statusHistory || [];
  let total = history.reduce((sum, entry) => {
    if (statuses.includes(entry.from) && typeof entry.durationMs === 'number') {
      return sum + entry.durationMs;
    }
    return sum;
  }, 0);

  if (isCurrent && videoJob.status !== JOB_STATUS.COMPLETED && videoJob.lastTransitionAt) {
    total += Date.now() - new Date(videoJob.lastTransitionAt).getTime();
  }

  return total;
}

/** How many times this stage failed and triggered an automatic retry. */
function retryCountForStage(videoJob, statuses) {
  const history = videoJob.statusHistory || [];
  return history.filter((entry) => statuses.includes(entry.from) && entry.to === JOB_STATUS.RETRY_SCHEDULED).length;
}

/**
 * Time windows (start, end) this stage was actually active in, derived from
 * consecutive statusHistory entries - a stage re-entered after a retry
 * produces multiple windows. `end` is `null` for a still-open window (the
 * stage currently running).
 */
function windowsForStage(videoJob, statuses) {
  const history = videoJob.statusHistory || [];
  const windows = [];
  let openStart = null;

  for (const entry of history) {
    const enteringStage = statuses.includes(entry.to);
    const leavingStage = openStart && !statuses.includes(entry.to);

    if (enteringStage && !openStart) openStart = entry.timestamp;
    if (leavingStage) {
      windows.push({ start: openStart, end: entry.timestamp });
      openStart = null;
    }
  }

  if (openStart) windows.push({ start: openStart, end: null });
  return windows;
}

function logsInWindows(logs, windows) {
  if (windows.length === 0) return [];
  return logs.filter((log) => {
    const t = new Date(log.timestamp).getTime();
    // End is exclusive so a log written exactly at a stage-boundary
    // transition (the common case - each step logs right as it starts the
    // next status) attributes to the stage it just entered, not the one it
    // just left.
    return windows.some((w) => t >= new Date(w.start).getTime() && (w.end === null || t < new Date(w.end).getTime()));
  });
}

// Per-stage substrings that this codebase's own ActivityLog lines use when a
// step skips real work because a previous result is still valid - see
// scriptStep/audioStep/avatarStep/renderStep's own comments for each skip
// path. Only a logged, textual signal counts as "cached" here (no guessing
// from timing) - a skip that isn't logged today just won't be flagged yet.
const CACHE_HIT_PATTERNS = /already generated|skipping|using existing|served from smart cache/i;

/**
 * Builds the 9-stage resilience timeline (progress/retry/cancellation/
 * timeout/error-recovery/cached-results/logs/duration) for a single video
 * job, entirely from data the pipeline already records - see
 * constants/pipelineStages.js for why PLANNING and POST_PROCESSING have no
 * statuses of their own.
 */
async function getPipelineTimeline(videoJob) {
  const logs = await ActivityLogService.getByVideo(videoJob._id, 200);
  const effectiveStatus = resolveEffectiveStatus(videoJob);
  const currentStageKey = STATUS_TO_STAGE.get(effectiveStatus) || 'QUEUED';
  const currentIndex = STAGE_ORDER.indexOf(currentStageKey);

  const stagesByKey = new Map();

  for (const def of PIPELINE_STAGE_DEFS) {
    if (def.foldedInto) continue; // filled in after its target is computed, below

    const index = STAGE_ORDER.indexOf(def.key);
    const isCurrent = index === currentIndex;
    const windows = windowsForStage(videoJob, def.statuses);
    const stageProgress = def.statuses.map((s) => JOB_STEPS[s]?.progress ?? 0);
    const maxProgress = stageProgress.length ? Math.max(...stageProgress) : 0;

    let status;
    if (isCurrent) status = currentStageStatus(videoJob);
    else if (index < currentIndex) status = 'completed';
    else status = 'pending';

    stagesByKey.set(def.key, {
      key: def.key,
      label: def.label,
      status,
      progress: status === 'completed' ? maxProgress : status === 'pending' ? 0 : (videoJob.progress ?? 0),
      durationMs: durationForStage(videoJob, def.statuses, isCurrent),
      retryCount: retryCountForStage(videoJob, def.statuses),
      cached: logsInWindows(logs, windows).some((log) => CACHE_HIT_PATTERNS.test(log.text)),
      cancellable: def.cancellable && status === 'running',
      retryable: def.retryable,
      timeoutMs: resolveTimeout(def.timeoutConfigKey),
      logs: logsInWindows(logs, windows).map((log) => ({ text: log.text, timestamp: log.timestamp })),
    });
  }

  for (const def of PIPELINE_STAGE_DEFS) {
    if (!def.foldedInto) continue;
    const target = stagesByKey.get(def.foldedInto);
    stagesByKey.set(def.key, {
      key: def.key,
      label: def.label,
      status: target.status,
      progress: target.progress,
      durationMs: 0,
      retryCount: 0,
      cached: false,
      cancellable: false,
      retryable: false,
      timeoutMs: null,
      logs: [],
      mergedWith: def.foldedInto,
    });
  }

  return STAGE_ORDER.map((key) => stagesByKey.get(key));
}

module.exports = { getPipelineTimeline };
