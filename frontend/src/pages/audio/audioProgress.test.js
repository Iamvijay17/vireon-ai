import { describe, it, expect } from "vitest";
import { computeProgress, resolveStartedAt, STALL_AFTER_SECONDS } from "./audioProgress";

const piece = (text, done) => ({ text, file: done ? "f.mp3" : undefined });

describe("computeProgress", () => {
  it("weights multi-piece progress by text length", () => {
    const pieces = [piece("a".repeat(30), true), piece("b".repeat(10), false)];
    expect(computeProgress({}, pieces, 0, 0)).toEqual({ percent: 75, estimated: false, stalled: false });
  });

  it("never reports 100% before the completed event", () => {
    const pieces = [piece("aaa", true), piece("bbb", true)];
    expect(computeProgress({}, pieces, 0, 0).percent).toBe(99);
  });

  it("estimates single-call progress from elapsed time, capped at 95%", () => {
    const item = { text: "hello" };
    expect(computeProgress(item, [], 0, 0)).toMatchObject({ percent: 0, estimated: true, stalled: false });
    const mid = computeProgress(item, [], 0, 8000).percent;
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(95);
    expect(computeProgress(item, [], 0, 600_000).percent).toBe(95);
  });

  it("flags a single-call generation as stalled after the limit", () => {
    expect(computeProgress({ text: "x" }, [], 0, (STALL_AFTER_SECONDS + 1) * 1000).stalled).toBe(true);
  });
});

describe("resolveStartedAt", () => {
  const now = Date.parse("2026-10-06T12:00:00Z");

  it("uses the mount time for a freshly created item (ignores clock skew)", () => {
    expect(resolveStartedAt("2026-10-06T11:59:50Z", now)).toBe(now);
    expect(resolveStartedAt("2026-10-06T12:05:00Z", now)).toBe(now); // server clock ahead
  });

  it("uses the server timestamp for an item that was already old", () => {
    expect(resolveStartedAt("2026-10-06T11:00:00Z", now)).toBe(Date.parse("2026-10-06T11:00:00Z"));
  });

  it("falls back to mount time on a bad timestamp", () => {
    expect(resolveStartedAt(undefined, now)).toBe(now);
  });
});
