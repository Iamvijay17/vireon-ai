import { describe, it, expect } from "vitest";
import { relativeTime, relativeTimeRefreshMs } from "./relativeTime";

const NOW = new Date("2026-10-04T10:30:00Z").getTime();
const ago = (seconds) => new Date(NOW - seconds * 1000);

describe("relativeTime", () => {
  it("counts seconds, singular at 1", () => {
    expect(relativeTime(ago(0.2), NOW)).toBe("just now");
    expect(relativeTime(ago(1), NOW)).toBe("1 sec ago");
    expect(relativeTime(ago(42), NOW)).toBe("42 sec ago");
  });

  it("counts minutes, singular at 1", () => {
    expect(relativeTime(ago(60), NOW)).toBe("1 min ago");
    expect(relativeTime(ago(59 * 60 + 59), NOW)).toBe("59 min ago");
  });

  it("counts hours and days with proper plurals", () => {
    expect(relativeTime(ago(3600), NOW)).toBe("1 hour ago");
    expect(relativeTime(ago(5 * 3600), NOW)).toBe("5 hours ago");
    expect(relativeTime(ago(86400), NOW)).toBe("1 day ago");
    expect(relativeTime(ago(6 * 86400), NOW)).toBe("6 days ago");
  });

  it("falls back to a date after a week", () => {
    expect(relativeTime(ago(7 * 86400), NOW)).toMatch(/2026/);
    expect(relativeTime(ago(7 * 86400), NOW)).not.toMatch(/ago/);
  });

  it("never reports the future as negative", () => {
    expect(relativeTime(new Date(NOW + 5000), NOW)).toBe("just now");
  });

  it("is safe on missing or bad input", () => {
    expect(relativeTime(null, NOW)).toBe("-");
    expect(relativeTime("not a date", NOW)).toBe("-");
  });
});

describe("relativeTimeRefreshMs", () => {
  it("refreshes every second while the label counts seconds, then slows down", () => {
    expect(relativeTimeRefreshMs(ago(10), NOW)).toBe(1000);
    expect(relativeTimeRefreshMs(ago(120), NOW)).toBe(15000);
    expect(relativeTimeRefreshMs(ago(7200), NOW)).toBe(60000);
  });
});
