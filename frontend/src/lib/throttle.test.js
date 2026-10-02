import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createThrottle } from "./throttle";

describe("createThrottle", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("runs the first call immediately and collapses a burst into one trailing call", () => {
    const fn = vi.fn();
    const t = createThrottle(fn, 1000);
    for (let i = 1; i <= 10; i++) t(i);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenLastCalledWith(1);
    vi.advanceTimersByTime(1000);
    expect(fn).toHaveBeenCalledTimes(2);
    expect(fn).toHaveBeenLastCalledWith(10); // latest args win
  });

  it("does nothing extra when there was no burst", () => {
    const fn = vi.fn();
    const t = createThrottle(fn, 1000);
    t("a");
    vi.advanceTimersByTime(5000);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("cancel drops the pending trailing call", () => {
    const fn = vi.fn();
    const t = createThrottle(fn, 1000);
    t(1);
    t(2);
    t.cancel();
    vi.advanceTimersByTime(5000);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("flush runs immediately, clears pending, and reopens the window", () => {
    const fn = vi.fn();
    const t = createThrottle(fn, 1000);
    t(1);
    t(2);
    t.flush(3);
    expect(fn).toHaveBeenLastCalledWith(3);
    vi.advanceTimersByTime(5000);
    expect(fn).toHaveBeenCalledTimes(2); // 1 and 3; the pending 2 was dropped
  });
});
