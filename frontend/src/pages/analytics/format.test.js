import { describe, it, expect } from "vitest";
import { formatDuration, formatBytes, formatPercent, trendDelta, successRateDelta } from "./format";

describe("formatters", () => {
  it("scales durations to s, m or h", () => {
    expect(formatDuration(undefined)).toBe("—");
    expect(formatDuration(0)).toBe("0.0s");
    expect(formatDuration(45_000)).toBe("45.0s");
    expect(formatDuration(90_000)).toBe("1.5m");
    expect(formatDuration(5_400_000)).toBe("1.5h");
  });

  it("scales bytes by 1024", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(1536)).toBe("1.5 KB");
    expect(formatBytes(3 * 1024 ** 3)).toBe("3.0 GB");
  });

  it("shows a dash for a missing percentage", () => {
    expect(formatPercent(null)).toBe("—");
    expect(formatPercent(42)).toBe("42%");
  });
});

describe("period-over-period deltas", () => {
  const day = (jobsCompleted, jobsFailed, jobsCreated = 0) => ({ jobsCompleted, jobsFailed, jobsCreated });

  it("compares the second half of the range with the first", () => {
    const trend = [day(0, 0, 1), day(0, 0, 1), day(0, 0, 2), day(0, 0, 2)];
    expect(trendDelta(trend, "jobsCreated")).toEqual({ pct: 100, curr: 4, prev: 2 });
  });

  it("needs at least four points and some activity", () => {
    expect(trendDelta([day(1, 0, 1)], "jobsCreated")).toBeNull();
    expect(trendDelta([day(0, 0), day(0, 0), day(0, 0), day(0, 0)], "jobsCreated")).toBeNull();
  });

  it("reports the success-rate change in percentage points", () => {
    // first half 50% success, second half 100%
    const trend = [day(1, 1), day(1, 1), day(2, 0), day(2, 0)];
    expect(successRateDelta(trend)).toEqual({ pct: 50 });
  });
});
