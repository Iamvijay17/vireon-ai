const { AppError } = require('../../../utils/errors');
const { describeIssues } = require('./report');

/**
 * The finished video failed the output quality gate, so the job must not be
 * marked complete. Carries the full report for the API and UI.
 *
 * `permanent` follows the report: when every error is a fault in the *file*
 * (truncated, undecodable, black) the gate has already discarded the render, so
 * the job-level retry re-renders and may well succeed; when the faults are in the
 * *content* (silent narration, a dead image URL) a second render of the same
 * scenes would reproduce them, so retrying would only burn the budget - the job
 * fails straight away and the message says what to fix.
 */
class QualityCheckError extends AppError {
  constructor(report, { renderFault = false } = {}) {
    super(`Quality check failed: ${describeIssues(report) || 'the video did not pass its required checks'}`, 422);
    this.report = report;
    this.renderFault = renderFault;
    this.permanent = !renderFault;
  }
}

module.exports = { QualityCheckError };
