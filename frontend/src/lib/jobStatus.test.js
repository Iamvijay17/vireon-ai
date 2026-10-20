import { describe, it, expect } from "vitest";
import { isJobRunning, jobPhase, isJobOpen, staleForMs, STALE_AFTER_MS } from "./jobStatus";

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

describe("jobPhase", () => {
  it.each([
    ["RENDERING", "running"],
    ["GENERATING_AUDIO", "running"],
    ["QUEUED", "queued"],
    ["RETRY_SCHEDULED", "queued"],
    ["AWAITING_APPROVAL", "waiting"],
    ["AUDIO_COMPLETED", "waiting"],
    ["COMPLETED", "completed"],
    ["FAILED", "failed"],
    ["CANCELLED", "cancelled"],
  ])("%s -> %s", (status, phase) => {
    expect(jobPhase(status)).toBe(phase);
  });

  it("resolves the course and audio-studio vocabularies through the keyword classifier", () => {
    expect(jobPhase("In Progress")).toBe("running");
    expect(jobPhase("Completed")).toBe("completed");
    expect(jobPhase("Failed")).toBe("failed");
    expect(jobPhase("Draft")).toBe("queued");
    expect(jobPhase("Archived")).toBe("cancelled");
  });
});

describe("isJobOpen", () => {
  it("is true until the job reaches a terminal phase", () => {
    expect(isJobOpen("RENDERING")).toBe(true);
    expect(isJobOpen("AWAITING_APPROVAL")).toBe(true);
    expect(isJobOpen("COMPLETED")).toBe(false);
    expect(isJobOpen("FAILED")).toBe(false);
  });
});

describe("staleForMs", () => {
  const now = Date.parse("2026-10-20T12:00:00Z");

  it("reports how long a running job has been silent once past the threshold", () => {
    const updatedAt = new Date(now - STALE_AFTER_MS - 5000).toISOString();
    expect(staleForMs({ status: "RENDERING", updatedAt }, now)).toBe(STALE_AFTER_MS + 5000);
  });

  it("is null for a recently updated job, and for jobs that are not running", () => {
    expect(staleForMs({ status: "RENDERING", updatedAt: new Date(now - 1000).toISOString() }, now)).toBeNull();
    const old = new Date(now - 10 * STALE_AFTER_MS).toISOString();
    expect(staleForMs({ status: "QUEUED", updatedAt: old }, now)).toBeNull();
    expect(staleForMs({ status: "COMPLETED", updatedAt: old }, now)).toBeNull();
    expect(staleForMs(null, now)).toBeNull();
  });
});
