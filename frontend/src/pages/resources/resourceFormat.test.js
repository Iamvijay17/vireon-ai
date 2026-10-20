import { describe, it, expect } from "vitest";
import { serviceState, breakerState, taskStatus, taskElapsedMs, gpuHeadline } from "./resourceFormat";

describe("serviceState", () => {
  it("treats a stopped service as a normal resting state, not a fault", () => {
    expect(serviceState("stopped")).toMatchObject({ label: "Stopped", variant: "neutral" });
  });

  it("flags failed and non-responding services", () => {
    expect(serviceState("failed").variant).toBe("danger");
    expect(serviceState("unhealthy").variant).toBe("warning");
  });

  it("does not invent a state for something unrecognised", () => {
    expect(serviceState(undefined).label).toBe("Unknown");
  });
});

describe("breakerState", () => {
  it("reports when an open breaker will retry, and the failure count", () => {
    const b = breakerState({ state: "open", retryAfterMs: 30000, consecutiveFailures: 3, lastError: "boom" });
    expect(b).toMatchObject({ label: "Paused after failures", retryInMs: 30000, failures: 3, lastError: "boom" });
  });

  it("has no retry time for a closed breaker", () => {
    expect(breakerState({ state: "closed", retryAfterMs: 0 }).retryInMs).toBeNull();
  });
});

describe("taskStatus", () => {
  it("calls out a task whose heartbeat has gone quiet", () => {
    expect(taskStatus({ status: "running", stale: true }).label).toBe("No heartbeat");
    expect(taskStatus({ status: "running", stale: false }).label).toBe("Running");
  });
});

describe("taskElapsedMs", () => {
  const now = Date.parse("2026-10-20T12:00:00Z");

  it("measures a running task from its start and a waiting one from when it queued", () => {
    expect(taskElapsedMs({ status: "running", startedAt: "2026-10-20T11:59:00Z" }, now)).toBe(60000);
    expect(taskElapsedMs({ status: "queued", enqueuedAt: "2026-10-20T11:58:00Z" }, now)).toBe(120000);
  });

  it("uses the recorded run time for finished tasks, and null when there is none", () => {
    expect(taskElapsedMs({ status: "completed", runMs: 5000 }, now)).toBe(5000);
    expect(taskElapsedMs({ status: "completed" }, now)).toBeNull();
  });
});

describe("gpuHeadline", () => {
  it("names the running task", () => {
    const resources = { gpuTasks: { available: true, active: [{ status: "running", service: "tts", label: "Narration" }] } };
    expect(gpuHeadline(resources)).toBe("Running: Narration");
  });

  it("says the history is unavailable rather than claiming the GPU is idle", () => {
    expect(gpuHeadline({ gpuTasks: { available: false, active: [] } })).toBe("GPU task history is unavailable");
  });

  it("reports an idle GPU only when the ledger could be read", () => {
    expect(gpuHeadline({ gpuTasks: { available: true, active: [] } })).toBe("No GPU task is running");
  });
});

describe("gpuHeadline without telemetry", () => {
  it("never calls the GPU idle when there is no task data at all", () => {
    expect(gpuHeadline(null)).toBe("GPU task history is unavailable");
    expect(gpuHeadline({})).toBe("GPU task history is unavailable");
  });
});
