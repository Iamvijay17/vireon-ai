/**
 * The output quality report (backend/src/services/qc/video/report.js) as the
 * job page shows it: a verdict, one row per check, and the problems found.
 * Pure - the card only renders what this returns - so the wording is testable.
 */

const VERDICTS = {
  passed: { label: "Passed", variant: "success" },
  "passed-with-warnings": { label: "Passed with warnings", variant: "warning" },
  failed: { label: "Failed", variant: "danger" },
  skipped: { label: "Skipped", variant: "neutral" },
};

/** 75.2 -> "1:15" */
export function formatTimestamp(seconds) {
  const total = Math.max(0, Math.round(Number(seconds) || 0));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

function summaryLine(report) {
  if (report.status === "skipped") return report.skippedReason || "The quality check did not run";
  const { errors = 0, warnings = 0 } = report.summary || {};
  if (errors === 0 && warnings === 0) return "Every check passed";
  const parts = [];
  if (errors) parts.push(plural(errors, "error"));
  if (warnings) parts.push(plural(warnings, "warning"));
  return parts.join(", ");
}

/**
 * @returns {null | {
 *   label: string, variant: string, summary: string, passed: boolean,
 *   checks: {id, name, state: 'pass'|'warn'|'fail'|'skipped', note?: string}[],
 *   issues: {key: string, severity: 'error'|'warn', text: string, when: string|null}[],
 * }} null when the job has no report yet (not rendered, or from before QC existed)
 */
export function describeQualityReport(report) {
  if (!report || typeof report !== "object" || !report.status) return null;
  const verdict = VERDICTS[report.status] || VERDICTS.skipped;

  return {
    label: verdict.label,
    variant: verdict.variant,
    summary: summaryLine(report),
    passed: report.passed !== false,
    checks: (report.checks || []).map((c) => ({ id: c.id, name: c.name, state: c.status, note: c.note })),
    issues: (report.issues || []).map((i, index) => ({
      key: `${i.check}-${index}`,
      severity: i.severity === "error" ? "error" : "warn",
      text: i.message,
      when: Number.isFinite(i.atSec) ? formatTimestamp(i.atSec) : null,
    })),
  };
}
