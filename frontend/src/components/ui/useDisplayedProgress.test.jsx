import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useDisplayedProgress } from "./useDisplayedProgress";

const run = (initial) => renderHook(({ p, t }) => useDisplayedProgress(p, { trickle: t }), { initialProps: { p: initial, t: false } });

describe("useDisplayedProgress", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("starts at the reported value and snaps forward on increases", () => {
    const { result, rerender } = run(20);
    expect(result.current).toBe(20);
    rerender({ p: 50, t: false });
    expect(result.current).toBe(50);
  });

  it("ignores a small backward step (a stale response), so the bar does not flicker", () => {
    const { result, rerender } = run(88);
    rerender({ p: 86, t: false });
    expect(result.current).toBe(88);
  });

  it("follows a real reset: a retry that drops 94 -> 50 shows 50", () => {
    const { result, rerender } = run(94);
    rerender({ p: 50, t: false });
    expect(result.current).toBe(50);
  });

  it("creeps past the last real value only while trickling, and never past the headroom", () => {
    const { result } = renderHook(() => useDisplayedProgress(20, { trickle: true }));
    act(() => vi.advanceTimersByTime(400 * 5));
    expect(result.current).toBeGreaterThan(20);
    act(() => vi.advanceTimersByTime(400 * 100));
    expect(result.current).toBe(24); // 20 + 4 headroom, no further
  });

  it("does not creep when trickle is off", () => {
    const { result } = run(20);
    act(() => vi.advanceTimersByTime(400 * 50));
    expect(result.current).toBe(20);
  });

  it("drops the creep and shows the real value when trickling stops (job failed / now waiting)", () => {
    const { result, rerender } = renderHook(({ t }) => useDisplayedProgress(94, { trickle: t }), { initialProps: { t: true } });
    act(() => vi.advanceTimersByTime(400 * 100));
    expect(result.current).toBe(98); // invented creep
    rerender({ t: false });
    expect(result.current).toBe(94); // back to what the server reported
  });
});
