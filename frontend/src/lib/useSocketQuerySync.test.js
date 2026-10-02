import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createInvalidationBatcher } from "./useSocketQuerySync";

describe("createInvalidationBatcher", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("a burst of progress events refetches once now and once more at the window end", () => {
    const invalidate = vi.fn();
    const b = createInvalidationBatcher(invalidate, 1500);
    for (let i = 0; i < 30; i++) b.queue([["jobs"], ["videos"]]);
    expect(invalidate).toHaveBeenCalledTimes(2); // leading edge only: jobs + videos
    vi.advanceTimersByTime(1500);
    expect(invalidate).toHaveBeenCalledTimes(4); // one trailing round, duplicates collapsed
    vi.advanceTimersByTime(10000);
    expect(invalidate).toHaveBeenCalledTimes(4);
  });

  it("collapses duplicate keys and keeps distinct per-job keys", () => {
    const invalidate = vi.fn();
    const b = createInvalidationBatcher(invalidate, 1500);
    b.queue([["videos", "detail", "a"]]);
    b.queue([["videos", "detail", "b"], ["videos", "detail", "b"]]);
    vi.advanceTimersByTime(1500);
    const keys = invalidate.mock.calls.map((c) => c[0].join("/"));
    expect(keys).toEqual(["videos/detail/a", "videos/detail/b"]);
  });

  it("now() flushes pending work immediately and drops the scheduled trailing flush", () => {
    const invalidate = vi.fn();
    const b = createInvalidationBatcher(invalidate, 1500);
    b.queue([["jobs"]]);
    b.queue([["videos"]]);
    b.now([["jobs", "done"]]);
    expect(invalidate.mock.calls.map((c) => c[0].join("/"))).toEqual(["jobs", "videos", "jobs/done"]);
    vi.advanceTimersByTime(5000);
    expect(invalidate).toHaveBeenCalledTimes(3);
  });

  it("cancel() discards anything pending", () => {
    const invalidate = vi.fn();
    const b = createInvalidationBatcher(invalidate, 1500);
    b.queue([["jobs"]]);
    b.queue([["videos"]]);
    b.cancel();
    vi.advanceTimersByTime(5000);
    expect(invalidate).toHaveBeenCalledTimes(1); // only the leading flush that already ran
  });
});
