import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useDebouncedValue } from "./useDebouncedValue";

describe("useDebouncedValue", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("returns the first value immediately and settles after the delay", () => {
    const { result, rerender } = renderHook(({ v }) => useDebouncedValue(v, 300), { initialProps: { v: "a" } });
    expect(result.current).toBe("a");

    rerender({ v: "ab" });
    rerender({ v: "abc" });
    expect(result.current).toBe("a"); // still the old value mid-burst

    act(() => vi.advanceTimersByTime(299));
    expect(result.current).toBe("a");
    act(() => vi.advanceTimersByTime(1));
    expect(result.current).toBe("abc");
  });

  it("restarts the wait on each change (only the last value is emitted)", () => {
    const { result, rerender } = renderHook(({ v }) => useDebouncedValue(v, 300), { initialProps: { v: 1 } });
    rerender({ v: 2 });
    act(() => vi.advanceTimersByTime(200));
    rerender({ v: 3 });
    act(() => vi.advanceTimersByTime(200));
    expect(result.current).toBe(1);
    act(() => vi.advanceTimersByTime(100));
    expect(result.current).toBe(3);
  });
});
