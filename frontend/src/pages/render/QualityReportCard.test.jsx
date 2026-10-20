// Explicit React import: the test transform here does not apply the automatic JSX runtime
// the app build uses.
import React from "react";
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { QualityReportCard } from "./QualityReportCard";

globalThis.React = React;

const checks = [
  { id: "video-file", name: "Video file exists", status: "pass" },
  { id: "audio-silence", name: "Narration is audible", status: "fail" },
  { id: "captions", name: "Captions are timed", status: "warn" },
  { id: "images", name: "Scene images load", status: "skipped", note: "image URLs were not fetched" },
];

const failed = {
  status: "failed",
  passed: false,
  summary: { errors: 1, warnings: 1 },
  checks,
  issues: [
    { check: "audio-silence", severity: "error", message: "Scene 2 has narration but its audio is silent", atSec: 4 },
    { check: "captions", severity: "warn", message: "Scene 3 has no word timing" },
  ],
};

describe("QualityReportCard", () => {
  it("renders nothing for a job with no report", () => {
    const { container } = render(<QualityReportCard report={null} />);
    expect(container.firstChild).toBeNull();
  });

  it("shows the verdict, the problems with their time, and every check", () => {
    render(<QualityReportCard report={failed} />);

    expect(screen.getByText("Failed")).toBeTruthy();
    expect(screen.getByText("1 error, 1 warning")).toBeTruthy();
    expect(screen.getByText("Scene 2 has narration but its audio is silent")).toBeTruthy();
    expect(screen.getByText("0:04")).toBeTruthy();
    expect(screen.getByText("Scene 3 has no word timing")).toBeTruthy();
    for (const c of checks) expect(screen.getByText(c.name)).toBeTruthy();
  });

  it("a clean report lists the checks but no problems", () => {
    render(<QualityReportCard report={{ status: "passed", passed: true, summary: { errors: 0, warnings: 0 }, checks, issues: [] }} />);
    expect(screen.getByText("Passed")).toBeTruthy();
    expect(screen.getByText("Every check passed")).toBeTruthy();
    expect(screen.queryByText(/Show \d+ more/)).toBeNull();
  });

  it("folds a long problem list behind a Show more control", () => {
    const issues = Array.from({ length: 9 }, (_, i) => ({ check: "captions", severity: "warn", message: `Problem ${i + 1}` }));
    render(<QualityReportCard report={{ ...failed, issues }} />);
    expect(screen.getByText("Show 3 more")).toBeTruthy();
    expect(screen.getByText("Problem 1")).toBeTruthy();
  });
});
