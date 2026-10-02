import { describe, it, expect } from "vitest";
import { isJobRunning } from "./jobStatus";

describe("isJobRunning", () => {
  it("is true while the worker is executing a step", () => {
    for (const s of ["SCRIPT_GENERATION", "GENERATING_AUDIO", "PREPARING_ASSETS", "RENDERING", "UPLOADING"]) {
      expect(isJobRunning(s)).toBe(true);
    }
  });

  it("is false for jobs that are waiting rather than working", () => {
    for (const s of ["QUEUED", "AWAITING_APPROVAL", "AUDIO_COMPLETED", "RETRY_SCHEDULED"]) {
      expect(isJobRunning(s)).toBe(false);
    }
  });

  it("is false for finished jobs and missing statuses", () => {
    for (const s of ["COMPLETED", "FAILED", "CANCELLED", "", null, undefined]) {
      expect(isJobRunning(s)).toBe(false);
    }
  });

  it("ignores case", () => {
    expect(isJobRunning("rendering")).toBe(true);
  });
});
