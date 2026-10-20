/**
 * Output quality, as the Quality Control page needs it. The checks themselves
 * run on the server right after a render (backend/src/services/qc/video); this
 * module only reads the reports they leave on each job.
 *
 * The rule it enforces: a video is "passed" only if a report says so. A
 * finished video with no report is "Not checked" - never assumed fine.
 */

/**
 * The ten checks the backend runs, in the order its report lists them, with
 * what each verifies. Names must match backend/src/services/qc/video/report.js.
 */
export const CHECK_CATALOG = [
  { id: "video-file", name: "Video file exists", what: "The rendered file is present and not empty." },
  { id: "video-decodable", name: "Video decodes cleanly", what: "The file can be read end to end without decoder errors." },
  { id: "audio-stream", name: "Audio track present", what: "The video contains an audio stream." },
  { id: "duration", name: "Duration matches the script", what: "The video is as long as the scenes add up to." },
  { id: "audio-silence", name: "Narration is audible", what: "Narrated scenes are not silent or mostly silent, and have no long dead gaps." },
  { id: "video-black-frames", name: "No black frames", what: "The picture is not black for long stretches." },
  { id: "audio-files", name: "Scene audio files exist", what: "Every narrated scene has its audio file in storage." },
  { id: "images", name: "Scene images load", what: "Every scene image exists, loads and is the size it should be." },
  { id: "captions", name: "Captions are timed", what: "Caption words have valid timing that follows the narration." },
  { id: "subtitle-overflow", name: "Subtitles fit", what: "Captions and subtitles stay on screen and within line limits." },
];

export const VERDICTS = [
  { value: "all", label: "All" },
  { value: "failed", label: "Failed" },
  { value: "passed-with-warnings", label: "Warnings" },
  { value: "passed", label: "Passed" },
  { value: "skipped", label: "Skipped" },
  { value: "unchecked", label: "Not checked" },
];

const KNOWN = new Set(["passed", "passed-with-warnings", "failed", "skipped"]);

/**
 * Has this video been through the renderer's output stage? Only those belong
 * on the page: a queued or half-made video has nothing to check yet.
 */
export const isCheckable = (job) => Boolean(job?.qualityReport) || job?.status === "COMPLETED";

/** One job's quality standing. `unchecked` = finished but no report exists. */
export function qualityOf(job) {
  const report = job?.qualityReport && typeof job.qualityReport === "object" ? job.qualityReport : null;
  const verdict = report && KNOWN.has(report.status) ? report.status : "unchecked";
  return { verdict, report: verdict === "unchecked" ? null : report };
}

/** Everything the page lists: checkable jobs, each with its standing, newest first. */
export function buildQualityRows(jobs) {
  return (jobs || [])
    .filter(isCheckable)
    .map((job) => {
      const { verdict, report } = qualityOf(job);
      return {
        id: job._id,
        title: job.topic || "Untitled video",
        jobStatus: job.status,
        verdict,
        report,
        checkedAt: report?.checkedAt || null,
        mode: report?.mode || null,
        errors: report?.summary?.errors ?? 0,
        warnings: report?.summary?.warnings ?? 0,
        job,
      };
    })
    .sort((a, b) => new Date(b.job.updatedAt || 0) - new Date(a.job.updatedAt || 0));
}

export function countVerdicts(rows) {
  const counts = { all: rows.length, failed: 0, "passed-with-warnings": 0, passed: 0, skipped: 0, unchecked: 0 };
  for (const row of rows) counts[row.verdict] += 1;
  return counts;
}

export function filterRows(rows, { verdict = "all", search = "" } = {}) {
  const q = search.trim().toLowerCase();
  return rows.filter((r) => (verdict === "all" || r.verdict === verdict) && (!q || r.title.toLowerCase().includes(q)));
}

/**
 * Per check: on how many videos did it actually run, and with what result?
 * A check that was skipped (e.g. no ffprobe) did not run and does not count.
 */
export function checkCoverage(rows) {
  const coverage = Object.fromEntries(CHECK_CATALOG.map((c) => [c.id, { ran: 0, pass: 0, warn: 0, fail: 0, skipped: 0 }]));
  for (const row of rows) {
    for (const check of row.report?.checks || []) {
      const entry = coverage[check.id];
      if (!entry) continue;
      if (check.status === "skipped") entry.skipped += 1;
      else {
        entry.ran += 1;
        entry[check.status === "pass" ? "pass" : check.status === "warn" ? "warn" : "fail"] += 1;
      }
    }
  }
  return coverage;
}
