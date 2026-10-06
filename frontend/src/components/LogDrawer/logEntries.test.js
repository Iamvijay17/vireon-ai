import { describe, it, expect } from "vitest";
import { mergeHistory, appendEntry, formatTime, MAX_ENTRIES } from "./logEntries";

const line = (n, extra = {}) => ({ timestamp: `2026-10-06T10:00:${String(n).padStart(2, "0")}Z`, level: "info", message: `line ${n}`, ...extra });

describe("mergeHistory", () => {
  it("puts history first and drops live lines it already contains", () => {
    const history = [line(1), line(2)];
    const live = [line(2), line(3)];
    expect(mergeHistory(history, live).map((e) => e.message)).toEqual(["line 1", "line 2", "line 3"]);
  });

  it("treats a same-text line at a different time as a new line", () => {
    const merged = mergeHistory([line(1)], [line(1, { timestamp: "2026-10-06T10:01:00Z" })]);
    expect(merged).toHaveLength(2);
  });

  it("keeps only the newest MAX_ENTRIES lines", () => {
    const history = Array.from({ length: MAX_ENTRIES }, (_, i) => line(i % 60, { message: `h${i}` }));
    const merged = mergeHistory(history, [line(0, { message: "newest" })]);
    expect(merged).toHaveLength(MAX_ENTRIES);
    expect(merged.at(-1).message).toBe("newest");
    expect(merged[0].message).toBe("h1");
  });
});

describe("appendEntry", () => {
  it("caps the feed at MAX_ENTRIES", () => {
    const full = Array.from({ length: MAX_ENTRIES }, (_, i) => line(0, { message: `m${i}` }));
    const next = appendEntry(full, line(1, { message: "new" }));
    expect(next).toHaveLength(MAX_ENTRIES);
    expect(next.at(-1).message).toBe("new");
  });
});

describe("formatTime", () => {
  it("falls back to a placeholder for missing timestamps", () => {
    expect(formatTime(undefined)).toBe("--:--:--");
  });

  it("slices the clock out of an unparseable timestamp string", () => {
    expect(formatTime("2026-10-06 10:11:12 nonsense")).toBe("10:11:12");
  });
});
