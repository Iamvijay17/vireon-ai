const { ERROR, WARN } = require('./analyzers');

/**
 * The quality report: what was checked, what was found, and whether the video
 * may be marked complete.
 *
 * Shape (also what the API returns and the UI renders):
 *   { version, status, passed, mode, checkedAt, durationMs,
 *     summary: { errors, warnings },
 *     checks:  [{ id, name, status: 'pass' | 'warn' | 'fail' | 'skipped', note? }],
 *     issues:  [{ check, severity, scene?, atSec?, message, detail? }],
 *     media:   { ... what was measured } }
 */
const REPORT_VERSION = 1;
const MAX_ISSUES = 200;

/** Every check, in the order a person reads them. */
const CHECKS = Object.freeze([
  { id: 'video-file', name: 'Video file exists' },
  { id: 'video-decodable', name: 'Video decodes cleanly' },
  { id: 'audio-stream', name: 'Audio track present' },
  { id: 'duration', name: 'Duration matches the script' },
  { id: 'audio-silence', name: 'Narration is audible' },
  { id: 'video-black-frames', name: 'No black frames' },
  { id: 'audio-files', name: 'Scene audio files exist' },
  { id: 'images', name: 'Scene images load' },
  { id: 'captions', name: 'Captions are timed' },
  { id: 'subtitle-overflow', name: 'Subtitles fit' },
]);

/**
 * A failure in one of these means the *file* is wrong, so rendering again can
 * plausibly fix it (a crashed encoder, a truncated write). Everything else is a
 * fault in the content - missing narration, a dead image URL - which a second
 * render of the same scenes reproduces exactly.
 */
const RENDER_FAULT_CHECKS = Object.freeze(['video-file', 'video-decodable', 'audio-stream', 'duration', 'video-black-frames']);

/**
 * @param {object} args
 * @param {object[]} args.issues
 * @param {Object<string,string>} [args.skipped]  check id -> why it could not run
 * @param {object} [args.media]
 * @param {string} [args.mode]  enforce | report
 */
function buildReport({ issues, skipped = {}, media = {}, durationMs = 0, mode = 'enforce' }) {
  const ordered = [...issues].sort((a, b) => {
    const rank = (i) => (i.severity === ERROR ? 0 : 1);
    return rank(a) - rank(b) || (a.scene ?? 0) - (b.scene ?? 0) || (a.atSec ?? 0) - (b.atSec ?? 0);
  });

  const errors = ordered.filter((i) => i.severity === ERROR).length;
  const warnings = ordered.filter((i) => i.severity === WARN).length;

  const checks = CHECKS.map(({ id, name }) => {
    const found = ordered.filter((i) => i.check === id);
    // A check that could only run in part still shows what it did find.
    if (skipped[id] && found.length === 0) return { id, name, status: 'skipped', note: skipped[id] };
    if (found.some((i) => i.severity === ERROR)) return { id, name, status: 'fail' };
    if (found.length > 0) return { id, name, status: 'warn' };
    return { id, name, status: 'pass' };
  });

  const passed = errors === 0;
  return {
    version: REPORT_VERSION,
    status: !passed ? 'failed' : warnings > 0 ? 'passed-with-warnings' : 'passed',
    passed,
    mode,
    checkedAt: new Date().toISOString(),
    durationMs,
    summary: { errors, warnings },
    checks,
    issues: ordered.slice(0, MAX_ISSUES),
    media,
  };
}

/** A report for a check that could not run at all (the checker itself failed). */
function skippedReport(reason, mode = 'enforce') {
  return {
    version: REPORT_VERSION,
    status: 'skipped',
    passed: true, // an unavailable checker is not evidence of a bad video
    mode,
    checkedAt: new Date().toISOString(),
    durationMs: 0,
    summary: { errors: 0, warnings: 0 },
    checks: CHECKS.map(({ id, name }) => ({ id, name, status: 'skipped', note: reason })),
    issues: [],
    media: {},
    skippedReason: reason,
  };
}

/** Would re-rendering plausibly fix every error in this report? */
const isRenderFault = (report) => {
  const failing = report.issues.filter((i) => i.severity === ERROR);
  return failing.length > 0 && failing.every((i) => RENDER_FAULT_CHECKS.includes(i.check));
};

/** One short line per problem, worst first - for the activity log and error message. */
function describeIssues(report, { limit = 4, severity = ERROR } = {}) {
  const matching = report.issues.filter((i) => i.severity === severity);
  const lines = matching.slice(0, limit).map((i) => i.message);
  if (matching.length > limit) lines.push(`and ${matching.length - limit} more`);
  return lines.join('; ');
}

module.exports = { REPORT_VERSION, CHECKS, RENDER_FAULT_CHECKS, buildReport, skippedReport, isRenderFault, describeIssues };
