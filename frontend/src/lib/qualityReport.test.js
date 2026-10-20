import { describe, it, expect } from "vitest";
import { describeQualityReport, formatTimestamp } from "./qualityReport";

const report = (over) => ({
  status: "passed",
  passed: true,
  summary: { errors: 0, warnings: 0 },
  checks: [{ id: "video-file", name: "Video file exists", status: "pass" }],
  issues: [],
  ...over,
});

describe("describeQualityReport", () => {
  it("has nothing to show for a job with no report", () => {
    expect(describeQualityReport(null)).toBeNull();
    expect(describeQualityReport(undefined)).toBeNull();
    expect(describeQualityReport({})).toBeNull();
  });

  it("a clean pass is a success", () => {
    expect(describeQualityReport(report())).toMatchObject({ label: "Passed", variant: "success", summary: "Every check passed", passed: true });
  });

  it("warnings pass, but say so", () => {
    const v = describeQualityReport(report({ status: "passed-with-warnings", summary: { errors: 0, warnings: 2 } }));
    expect(v).toMatchObject({ label: "Passed with warnings", variant: "warning", summary: "2 warnings", passed: true });
  });

  it("a failure counts errors and warnings, singular and plural", () => {
    const v = describeQualityReport(report({ status: "failed", passed: false, summary: { errors: 1, warnings: 3 } }));
    expect(v).toMatchObject({ label: "Failed", variant: "danger", summary: "1 error, 3 warnings", passed: false });
  });

  it("a skipped check explains why", () => {
    const v = describeQualityReport(report({ status: "skipped", skippedReason: "The quality check could not run: ffmpeg crashed" }));
    expect(v).toMatchObject({ label: "Skipped", variant: "neutral", summary: "The quality check could not run: ffmpeg crashed" });
  });

  it("lists each check with its state and note", () => {
    const v = describeQualityReport(report({ checks: [
      { id: "video-file", name: "Video file exists", status: "pass" },
      { id: "audio-silence", name: "Narration is audible", status: "skipped", note: "ffmpeg is not available" },
    ] }));
    expect(v.checks).toEqual([
      { id: "video-file", name: "Video file exists", state: "pass", note: undefined },
      { id: "audio-silence", name: "Narration is audible", state: "skipped", note: "ffmpeg is not available" },
    ]);
  });

  it("lists problems in the order the server sent them, with a time when there is one", () => {
    const v = describeQualityReport(report({ status: "failed", passed: false, summary: { errors: 1, warnings: 1 }, issues: [
      { check: "audio-silence", severity: "error", message: "Scene 2 has narration but its audio is silent", atSec: 75 },
      { check: "captions", severity: "warn", message: "Scene 3 has no word timing" },
    ] }));
    expect(v.issues).toEqual([
      { key: "audio-silence-0", severity: "error", text: "Scene 2 has narration but its audio is silent", when: "1:15" },
      { key: "captions-1", severity: "warn", text: "Scene 3 has no word timing", when: null },
    ]);
  });

  it("treats an unknown status as skipped rather than crashing", () => {
    expect(describeQualityReport(report({ status: "mystery" }))).toMatchObject({ label: "Skipped" });
  });
});

describe("formatTimestamp", () => {
  it.each([[0, "0:00"], [5, "0:05"], [75.2, "1:15"], [3600, "60:00"], [-3, "0:00"], [undefined, "0:00"]])("%p -> %s", (input, out) => {
    expect(formatTimestamp(input)).toBe(out);
  });
});
