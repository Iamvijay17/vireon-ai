const config = require('../../config');
const LoggerService = require('../common/LoggerService');
const ActivityLogService = require('../common/ActivityLogService');
const JobEventService = require('../common/JobEventService');
const LayoutQcService = require('./LayoutQcService');

const isCancel = (err) => err?.name === 'AbortError' || err?.cancelled === true;

/** One short line per problem, worst first, capped - the activity log is not a report. */
const describe = (issues, limit = 5) => {
  const lines = issues.slice(0, limit).map((i) => `scene ${i.scene}: ${i.message}`);
  if (issues.length > limit) lines.push(`...and ${issues.length - limit} more`);
  return lines.join('; ');
};

/**
 * The layout check as a pipeline step: runs just before a render when
 * QC_ENABLED=true, records what it found on the job (a `layoutQc` event plus an
 * activity-log line), and - only with QC_FAIL_ON_ERROR=true - refuses to render a
 * video with errors. By default it only reports: a layout warning never costs you
 * a video, and a QC that itself breaks never blocks one.
 *
 * Shared by the standalone-video worker and the course render stage.
 *
 * @returns {Promise<object|null>} the QC result, or null when disabled / unavailable
 */
async function runLayoutQc({ id, assets, signal }) {
  if (!config.qc.enabled) return null;

  let result;
  try {
    result = await LayoutQcService.run({ jobId: id, assets, signal });
  } catch (err) {
    if (isCancel(err)) throw err;
    LoggerService.warn('Layout check could not run - rendering anyway', { jobId: id, error: err.message });
    await ActivityLogService.add(id, `Layout check skipped: ${err.message.slice(0, 200)}`);
    return null;
  }

  await JobEventService.append(id, 'layoutQc', {
    jobId: id,
    scenesChecked: result.scenesChecked,
    errors: result.errors,
    warnings: result.warnings,
    durationMs: result.durationMs,
    issues: result.issues.slice(0, 40),
  }).catch((err) => LoggerService.warn('Could not record the layout check event', { jobId: id, error: err.message }));

  if (result.issues.length === 0) {
    await ActivityLogService.add(id, `Layout check passed (${result.scenesChecked} scenes).`);
    return result;
  }

  const errors = result.issues.filter((i) => i.severity === 'error');
  await ActivityLogService.add(
    id,
    `Layout check: ${result.errors} error(s), ${result.warnings} warning(s) across ${result.scenesChecked} scenes - ${describe(result.issues)}`
  );

  if (config.qc.failOnError && errors.length > 0) {
    throw new Error(`Layout check failed with ${errors.length} error(s): ${describe(errors, 3)}`);
  }
  return result;
}

module.exports = { runLayoutQc, describe };
