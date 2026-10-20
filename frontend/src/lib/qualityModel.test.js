import { describe, it, expect } from "vitest";
import { qualityOf, buildQualityRows, countVerdicts, filterRows, checkCoverage, isCheckable, CHECK_CATALOG } from "./qualityModel";

const report = (status, checks = [], summary = { errors: 0, warnings: 0 }) => ({ status, checks, summary, checkedAt: "2026-10-20T10:00:00Z", mode: "enforce" });
const job = (id, status, qualityReport = null, topic = `Video ${id}`) => ({ _id: id, topic, status, qualityReport, updatedAt: `2026-10-0${id}T00:00:00Z` });

describe("qualityOf", () => {
  it("never calls a finished video with no report passed", () => {
    expect(qualityOf(job("1", "COMPLETED")).verdict).toBe("unchecked");
  });

  it("reads the verdict from the report", () => {
    expect(qualityOf(job("1", "COMPLETED", report("passed"))).verdict).toBe("passed");
    expect(qualityOf(job("2", "FAILED", report("failed"))).verdict).toBe("failed");
  });

  it("treats a report it does not understand as not checked", () => {
    expect(qualityOf(job("1", "COMPLETED", { status: "mystery" })).verdict).toBe("unchecked");
  });
});

describe("isCheckable", () => {
  it("includes finished videos and any video that has a report, and nothing else", () => {
    expect(isCheckable(job("1", "COMPLETED"))).toBe(true);
    expect(isCheckable(job("2", "FAILED", report("failed")))).toBe(true);
    expect(isCheckable(job("3", "RENDERING"))).toBe(false);
    expect(isCheckable(job("4", "FAILED"))).toBe(false);
  });
});

describe("rows and counts", () => {
  const rows = buildQualityRows([
    job("1", "COMPLETED", report("passed")),
    job("2", "COMPLETED", report("passed-with-warnings", [], { errors: 0, warnings: 2 })),
    job("3", "FAILED", report("failed", [], { errors: 1, warnings: 0 })),
    job("4", "COMPLETED"),
    job("5", "QUEUED"),
  ]);

  it("lists only checkable videos, newest first, with their issue counts", () => {
    expect(rows.map((r) => r.id)).toEqual(["4", "3", "2", "1"]);
    expect(rows.find((r) => r.id === "2")).toMatchObject({ warnings: 2, errors: 0 });
  });

  it("counts each verdict", () => {
    expect(countVerdicts(rows)).toEqual({ all: 4, failed: 1, "passed-with-warnings": 1, passed: 1, skipped: 0, unchecked: 1 });
  });

  it("filters by verdict and title", () => {
    expect(filterRows(rows, { verdict: "failed" }).map((r) => r.id)).toEqual(["3"]);
    expect(filterRows(rows, { search: "video 2" }).map((r) => r.id)).toEqual(["2"]);
  });
});

describe("checkCoverage", () => {
  it("counts a check as run only when it was not skipped", () => {
    const rows = buildQualityRows([
      job("1", "COMPLETED", report("passed", [{ id: "duration", status: "pass" }, { id: "captions", status: "skipped" }])),
      job("2", "COMPLETED", report("failed", [{ id: "duration", status: "fail" }, { id: "captions", status: "warn" }])),
    ]);
    const coverage = checkCoverage(rows);
    expect(coverage.duration).toEqual({ ran: 2, pass: 1, warn: 0, fail: 1, skipped: 0 });
    expect(coverage.captions).toEqual({ ran: 1, pass: 0, warn: 1, fail: 0, skipped: 1 });
  });

  it("covers all ten checks the backend defines, even with no data", () => {
    expect(Object.keys(checkCoverage([]))).toEqual(CHECK_CATALOG.map((c) => c.id));
    expect(CHECK_CATALOG).toHaveLength(10);
  });
});
