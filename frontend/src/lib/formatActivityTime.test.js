import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { formatActivityTime } from "./formatActivityTime";
import { timeAgo } from "./timeAgo";

/**
 * Both of these format timestamps for the UI, and both were previously
 * exercised only by looking at the screen. They are pinned to a fixed
 * "now" so the day-boundary branches are actually reachable - the bugs
 * these prevent (an entry a few hours old reading "last month") only show
 * up at specific times of day.
 */
const NOW = new Date("2026-09-23T15:00:00"); // a Wednesday, local time

describe("formatActivityTime", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });
  afterEach(() => vi.useRealTimers());

  const at = (iso) => formatActivityTime(iso);

  it("labels the same calendar day as today, with the wall-clock time", () => {
    expect(at("2026-09-23T09:05:00")).toBe("today 9:05 am");
    expect(at("2026-09-23T18:21:00")).toBe("today 6:21 pm");
  });

  it("uses calendar days, not elapsed hours, at a day boundary", () => {
    // 11pm yesterday is two hours before 1am today - an elapsed-hours
    // implementation would call both "today".
    expect(at("2026-09-22T23:00:00")).toBe("yesterday 11:00 pm");
  });

  it("names the weekday earlier in the same week", () => {
    expect(at("2026-09-21T10:00:00")).toBe("Monday 10:00 am");
  });

  it("coarsens as entries get older", () => {
    expect(at("2026-09-12T10:00:00")).toBe("last week 10:00 am");
    expect(at("2026-08-20T10:00:00")).toBe("last month 10:00 am");
  });

  it("falls back to a date for anything older", () => {
    expect(at("2026-01-04T10:00:00")).toBe("Jan 4 10:00 am");
  });

  it("treats a timestamp ahead of the clock as today rather than negative days", () => {
    // Clock skew between the browser and the server is normal; "in -1
    // days" is not an acceptable thing to render.
    expect(at("2026-09-24T09:00:00")).toBe("today 9:00 am");
  });

  it("returns an empty string for missing or unparseable input", () => {
    expect(at(null)).toBe("");
    expect(at(undefined)).toBe("");
    expect(at("")).toBe("");
    expect(at("not a date")).toBe("");
  });
});

describe("timeAgo", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });
  afterEach(() => vi.useRealTimers());

  it("collapses the last few seconds to 'just now'", () => {
    expect(timeAgo(new Date(NOW.getTime() - 2000))).toBe("just now");
  });

  it("steps through each unit", () => {
    expect(timeAgo(new Date(NOW.getTime() - 30_000))).toBe("30s ago");
    expect(timeAgo(new Date(NOW.getTime() - 5 * 60_000))).toBe("5m ago");
    expect(timeAgo(new Date(NOW.getTime() - 3 * 3_600_000))).toBe("3h ago");
    expect(timeAgo(new Date(NOW.getTime() - 2 * 86_400_000))).toBe("2d ago");
  });

  it("falls back to a date past a week", () => {
    // Asserted against the same locale API rather than a literal: unlike
    // formatActivityTime (which hardcodes en-US), timeAgo deliberately
    // renders in the viewer's locale, so "Aug 24" and "24 Aug" are both
    // correct depending on where this runs.
    const old = new Date(NOW.getTime() - 30 * 86_400_000);
    expect(timeAgo(old)).toBe(old.toLocaleDateString(undefined, { month: "short", day: "numeric" }));
    expect(timeAgo(old)).not.toMatch(/ago/);
  });

  it("never renders a negative duration for a future timestamp", () => {
    expect(timeAgo(new Date(NOW.getTime() + 60_000))).toBe("just now");
  });

  it("renders a dash for missing or invalid input", () => {
    expect(timeAgo(null)).toBe("—");
    expect(timeAgo("nonsense")).toBe("—");
  });
});
