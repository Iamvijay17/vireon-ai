import { describe, it, expect } from "vitest";
import { buildQueue, waitReason, personAction } from "./queue";

const job = (id, status, createdAt, title = id) => ({ id, status, createdAt, title });

describe("buildQueue", () => {
  const jobs = [
    job("c", "QUEUED", "2026-10-06T10:02:00Z"),
    job("a", "RENDERING", "2026-10-06T10:00:00Z"),
    job("b", "QUEUED", "2026-10-06T10:01:00Z"),
    job("d", "AWAITING_APPROVAL", "2026-10-06T09:00:00Z"),
    job("e", "COMPLETED", "2026-10-06T08:00:00Z"),
    job("f", "FAILED", "2026-10-06T08:30:00Z"),
    job("g", "RETRY_SCHEDULED", "2026-10-06T09:30:00Z"),
  ];
  const q = buildQueue(jobs);

  it("separates running, waiting and needs-approval jobs", () => {
    expect(q.running.map((j) => j.id)).toEqual(["a"]);
    expect(q.approval.map((j) => j.id)).toEqual(["d"]);
    expect(q.waiting.map((j) => j.id)).toEqual(["g", "b", "c"]);
  });

  it("drops finished jobs", () => {
    const ids = [...q.running, ...q.waiting, ...q.approval].map((j) => j.id);
    expect(ids).not.toContain("e");
    expect(ids).not.toContain("f");
  });

  it("puts a manual-mode job waiting for its render under needs-you, not up next", () => {
    const manual = { ...job("m", "AUDIO_COMPLETED", "2026-10-06T07:00:00Z"), meta: { fastGeneration: false } };
    const fast = { ...job("f2", "AUDIO_COMPLETED", "2026-10-06T07:30:00Z"), meta: { fastGeneration: true } };
    const split = buildQueue([manual, fast]);
    expect(split.approval.map((j) => j.id)).toEqual(["m"]);
    expect(split.waiting.map((j) => j.id)).toEqual(["f2"]);
    expect(personAction(manual)).toMatch(/start the render/);
    expect(personAction(job("d", "AWAITING_APPROVAL"))).toMatch(/approve the script/);
  });

  it("copes with an empty or missing list", () => {
    expect(buildQueue(undefined)).toEqual({ running: [], waiting: [], approval: [] });
  });
});

describe("waitReason", () => {
  const running = [job("a", "GENERATING_AUDIO", "2026-10-06T10:00:00Z", "Intro video")];

  it("names the job ahead and what it is doing", () => {
    expect(waitReason(job("b", "QUEUED"), running)).toBe(
      'Waiting for the worker - "Intro video" is generating narration'
    );
  });

  it("has distinct reasons for retries and between-stage jobs", () => {
    expect(waitReason(job("b", "RETRY_SCHEDULED"), running)).toBe("Retry scheduled");
    expect(waitReason(job("b", "AUDIO_COMPLETED"), running)).toBe("Between stages");
    expect(waitReason(job("b", "IMAGE_COMPLETED"), running)).toBe("Between stages");
  });

  it("does not invent a blocker when nothing is running", () => {
    expect(waitReason(job("b", "QUEUED"), [])).toBe("Waiting for the worker");
  });
});
