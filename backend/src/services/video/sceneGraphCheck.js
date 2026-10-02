const config = require('../../config');
const LoggerService = require('../common/LoggerService');
const JobEventService = require('../common/JobEventService');
const { compile, formatIssues } = require('../../ir');

const MAX_RECORDED_ISSUES = 25;

/**
 * Compile a job's SceneGraph, report what it found, and - only in
 * authoritative mode - refuse to continue on errors.
 *
 * Called twice per job: at 'script' stage right after the script is
 * validated (so a template-props mismatch surfaces before any TTS or GPU
 * time is spent) and at 'render' stage from RemotionService.prepareAssets
 * (with audio/image data present). In shadow mode this only ever logs and
 * records an `irCompiled` event on the job's timeline, so the numbers can
 * be read back per job before the compiler is trusted to block anything.
 *
 * Returns the compile result, or null when IR is off.
 */
async function checkSceneGraph({ jobId, script, jobConfig, stage, audioUrlFor }) {
  if (config.ir.mode === 'off') return null;

  const result = compile({ jobId, script, jobConfig, stage, audioUrlFor });
  const errors = result.issues.filter((i) => i.severity === 'error');
  const warnings = result.issues.length - errors.length;

  await JobEventService.append(jobId, 'irCompiled', {
    jobId,
    stage,
    mode: config.ir.mode,
    ok: result.ok,
    errors: errors.length,
    warnings,
    issues: result.issues.slice(0, MAX_RECORDED_ISSUES),
  });

  if (result.issues.length > 0) {
    const log = result.ok ? LoggerService.warn : LoggerService.error;
    log.call(LoggerService, `SceneGraph compile (${stage}): ${errors.length} error(s), ${warnings} warning(s)`, {
      jobId,
      mode: config.ir.mode,
      issues: formatIssues(result.issues).slice(0, MAX_RECORDED_ISSUES),
    });
  } else {
    LoggerService.info(`SceneGraph compile (${stage}): clean`, { jobId, scenes: result.ir.scenes.length });
  }

  if (config.ir.mode === 'authoritative' && !result.ok) {
    throw new Error(
      `SceneGraph compile failed at ${stage}:\n- ${formatIssues(errors).join('\n- ')}`
    );
  }

  return result;
}

module.exports = { checkSceneGraph };
