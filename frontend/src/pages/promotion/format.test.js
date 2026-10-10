import { describe, it, expect } from "vitest";
import {
  statusMeta, isActiveStatus, isFinishedStatus, connectResultMessage, parseHashtagInput, zonedToUtc, toZonedInput,
  defaultScheduleInput, monthGrid, groupByDay, dayKey, formatMetric, successRateText, mergeLive, describeDistance, formatSeconds,
  formatBytes, formatCount, timeZoneOptions,
} from "./format";

describe("status labels", () => {
  it("labels Published only for COMPLETED, and treats scheduled posts as waiting rather than active", () => {
    expect(statusMeta("COMPLETED").label).toBe("Published");
    expect(statusMeta("SCHEDULED")).toMatchObject({ label: "Scheduled", active: false });
    expect(isActiveStatus("UPLOADING")).toBe(true);
    expect(isActiveStatus("SCHEDULED")).toBe(false);
    expect(isFinishedStatus("FAILED")).toBe(true);
    expect(isFinishedStatus("RETRYING")).toBe(false);
    expect(statusMeta("WEIRD").label).toBe("WEIRD");
  });
});

describe("OAuth result messages", () => {
  it("explains every outcome, naming the provider and the number of accounts", () => {
    expect(connectResultMessage("connected", "meta", 2)).toMatchObject({ type: "success", title: "Facebook / Instagram connected" });
    expect(connectResultMessage("connected", "meta", 2).message).toMatch(/2 accounts/);
    expect(connectResultMessage("connected", "threads", 1).title).toBe("Threads connected");
    for (const code of ["denied", "state", "scopes", "no_pages", "not_configured", "failed"]) {
      expect(connectResultMessage(code, "meta").message.length).toBeGreaterThan(10);
    }
    expect(connectResultMessage("denied", "meta").type).toBe("warning");
    expect(connectResultMessage("something-new", "meta").type).toBe("error");
  });
});

describe("hashtags", () => {
  it("normalises free text into #tags", () => {
    expect(parseHashtagInput("#AI, video tips  #ai !!!")).toEqual(["#AI", "#video", "#tips"]);
    expect(parseHashtagInput("")).toEqual([]);
  });
});

describe("time zones", () => {
  it("converts a wall-clock time in a zone to the UTC instant, including daylight saving", () => {
    expect(zonedToUtc("2026-10-20T14:30", "Asia/Kolkata").toISOString()).toBe("2026-10-20T09:00:00.000Z");
    expect(zonedToUtc("2026-07-01T09:00", "America/New_York").toISOString()).toBe("2026-07-01T13:00:00.000Z");
    expect(zonedToUtc("2026-12-01T09:00", "America/New_York").toISOString()).toBe("2026-12-01T14:00:00.000Z");
    expect(zonedToUtc("2026-02-31T09:00", "UTC")).toBeNull();
    expect(zonedToUtc("soon", "UTC")).toBeNull();
  });

  it("round-trips through toZonedInput", () => {
    const utc = zonedToUtc("2026-03-08T12:00", "America/Los_Angeles");
    expect(toZonedInput(utc, "America/Los_Angeles")).toBe("2026-03-08T12:00");
    expect(toZonedInput("garbage", "UTC")).toBe("");
  });

  it("proposes the next whole hour at least 30 minutes away", () => {
    const now = Date.parse("2026-10-10T12:20:00Z");
    expect(defaultScheduleInput("UTC", now)).toBe("2026-10-10T13:00");
    expect(defaultScheduleInput("Asia/Kolkata", now)).toBe("2026-10-10T19:00"); // 12:50Z is 18:20 in Kolkata
    expect(defaultScheduleInput("America/New_York", now)).toBe("2026-10-10T09:00");
  });

  it("offers the browser zone and UTC", () => {
    const zones = timeZoneOptions().map((z) => z.value);
    expect(zones).toContain("UTC");
    expect(zones.length).toBeGreaterThan(5);
  });

  it("describes distance in friendly units", () => {
    const now = Date.parse("2026-10-10T12:00:00Z");
    expect(describeDistance("2026-10-10T12:30:00Z", now)).toBe("in 30 min");
    expect(describeDistance("2026-10-10T15:00:00Z", now)).toBe("in 3 h");
    expect(describeDistance("2026-10-13T12:00:00Z", now)).toBe("in 3 days");
    expect(describeDistance("2026-10-10T10:00:00Z", now)).toBe("2 h ago");
  });
});

describe("calendar", () => {
  it("builds Monday-first weeks that contain the whole month", () => {
    const weeks = monthGrid(2026, 9); // October 2026 starts on a Thursday
    expect(weeks[0].map((c) => c.day).slice(0, 4)).toEqual([28, 29, 30, 1]);
    expect(weeks[0][3]).toMatchObject({ key: "2026-10-01", inMonth: true });
    expect(weeks[0][0].inMonth).toBe(false);
    const inMonth = weeks.flat().filter((c) => c.inMonth);
    expect(inMonth).toHaveLength(31);
    expect(weeks.every((w) => w.length === 7)).toBe(true);
  });

  it("groups items by day in the display zone, sorted by time", () => {
    const items = [
      { postId: "b", at: "2026-10-10T20:00:00Z" },
      { postId: "a", at: "2026-10-10T08:00:00Z" },
      { postId: "c", at: "2026-10-10T20:30:00Z" },
      { postId: "x", at: null },
    ];
    const utc = groupByDay(items, "UTC");
    expect(utc.get("2026-10-10").map((i) => i.postId)).toEqual(["a", "b", "c"]);
    // 20:30Z is already the next day in Kolkata (UTC+5:30)
    expect(dayKey("2026-10-10T20:30:00Z", "Asia/Kolkata")).toBe("2026-10-11");
    expect(groupByDay(items, "Asia/Kolkata").get("2026-10-11").map((i) => i.postId)).toEqual(["b", "c"]);
  });
});

describe("metrics: unavailable is not zero", () => {
  it("shows a real zero as 0 and a missing metric as Not available", () => {
    expect(formatMetric("likes", { available: true, value: 0 })).toEqual({ text: "0", available: true });
    expect(formatMetric("likes", { available: false, value: null })).toEqual({ text: "Not available", available: false });
    expect(formatMetric("likes", undefined)).toEqual({ text: "Not available", available: false });
    expect(formatMetric("views", { available: true, value: null }).available).toBe(false);
  });

  it("formats counts and watch time", () => {
    expect(formatMetric("views", { available: true, value: 1234 }).text).toBe("1,234");
    expect(formatMetric("views", { available: true, value: 25_000 }).text).toBe("25K");
    expect(formatCount(1_500_000)).toBe("1.5M");
    expect(formatMetric("avgWatchTimeMs", { available: true, value: 4500 }).text).toBe("4.5 s");
  });

  it("shows no success rate rather than 0% when nothing finished", () => {
    expect(successRateText(null)).toBe("—");
    expect(successRateText(0)).toBe("0%");
    expect(successRateText(66.7)).toBe("66.7%");
  });
});

describe("live updates", () => {
  const post = { _id: "spo-1", status: "QUEUED", updatedAt: "2026-10-10T12:00:00Z", progress: { percent: 0 }, error: null, attempts: 0 };

  it("applies a newer socket summary", () => {
    const merged = mergeLive(post, { status: "UPLOADING", progress: { percent: 40 }, updatedAt: "2026-10-10T12:00:05Z", attempts: 1 });
    expect(merged).toMatchObject({ status: "UPLOADING", progress: { percent: 40 }, attempts: 1 });
  });

  it("ignores a stale summary and a missing one", () => {
    expect(mergeLive(post, { status: "FAILED", updatedAt: "2026-10-10T11:59:00Z" })).toBe(post);
    expect(mergeLive(post, undefined)).toBe(post);
  });

  it("clears a stale error when the status moves on", () => {
    const failed = { ...post, status: "FAILED", error: { code: "X" } };
    expect(mergeLive(failed, { status: "QUEUED", updatedAt: "2026-10-10T12:00:09Z" }).error).toBeNull();
  });
});

describe("number formatting", () => {
  it("formats durations and sizes", () => {
    expect(formatSeconds(65)).toBe("1:05");
    expect(formatSeconds(0)).toBe("");
    expect(formatBytes(1536)).toBe("1.5 KB");
    expect(formatBytes(0)).toBe("0 B");
  });
});
