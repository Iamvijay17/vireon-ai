import { describe, it, expect } from "vitest";
import { showRate, showCount, showDuration, stageCoverageNote, kindLabel, queueState } from "./controlCenterFormat";

describe("showing figures with nothing behind them", () => {
  it("a missing rate is a dash, but a measured 0% is shown as 0%", () => {
    expect(showRate(null)).toBe("—");
    expect(showRate(undefined)).toBe("—");
    expect(showRate(0)).toBe("0%");
    expect(showRate(81.3)).toBe("81.3%");
  });

  it("a missing duration is a dash, but a measured 0 is a duration", () => {
    expect(showDuration(null)).toBe("—");
    expect(showDuration(undefined)).toBe("—");
    expect(showDuration(0)).toBe("0.0s");
    expect(showDuration(95_000)).toBe("1.6m");
  });

  it("a count that was not measured is a dash; zero is zero", () => {
    expect(showCount(null)).toBe("—");
    expect(showCount(0)).toBe("0");
    expect(showCount(1234)).toBe((1234).toLocaleString());
  });
});

describe("stageCoverageNote", () => {
  it("says nothing when every job has stage data", () => {
    expect(stageCoverageNote({ jobsWithStageData: 5, jobsWithoutStageData: 0 })).toBeNull();
    expect(stageCoverageNote(undefined)).toBeNull();
  });

  it("explains an empty table: all jobs predate stage tracking", () => {
    expect(stageCoverageNote({ jobsWithStageData: 0, jobsWithoutStageData: 19 })).toMatch(/19 earlier jobs predate it, so there are no stage averages yet/);
    expect(stageCoverageNote({ jobsWithStageData: 0, jobsWithoutStageData: 1 })).toMatch(/1 earlier job predate/);
  });

  it("says plainly that averages exclude older jobs when only some have data", () => {
    const note = stageCoverageNote({ jobsWithStageData: 4, jobsWithoutStageData: 15 });
    expect(note).toMatch(/cover 4 jobs/);
    expect(note).toMatch(/15 earlier jobs predate stage tracking and are not included/);
  });
});

describe("kindLabel", () => {
  it("names cache kinds for a person and passes unknown ones through", () => {
    expect(kindLabel("image")).toBe("Images");
    expect(kindLabel("tts-seg-raw")).toBe("Voice clips (raw)");
    expect(kindLabel("render")).toBe("Final render");
    expect(kindLabel("something-new")).toBe("something-new");
  });
});

describe("queueState", () => {
  it("distinguishes unavailable, no worker, working and idle", () => {
    expect(queueState({ available: false })).toEqual({ label: "Unavailable", tone: "danger" });
    expect(queueState(undefined)).toEqual({ label: "Unavailable", tone: "danger" });
    expect(queueState({ available: true, workersOnline: 0, active: 0 })).toEqual({ label: "No worker online", tone: "warning" });
    expect(queueState({ available: true, workersOnline: 1, active: 2 })).toEqual({ label: "Working", tone: "success" });
    expect(queueState({ available: true, workersOnline: 1, active: 0 })).toEqual({ label: "Idle", tone: "neutral" });
  });

  it("does not call a queue with no reading 'no worker online'", () => {
    expect(queueState({ available: true, workersOnline: null, active: 0 }).label).toBe("Idle");
  });
});
