// Explicit React import: the test transform here does not apply the automatic JSX runtime
// the app build uses.
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import StatusBadge from "./StatusBadge";
import ProjectCard from "./ProjectCard";
import ProjectGrid from "./ProjectCard/ProjectGrid";
import JobStatusPanel from "./JobStatusPanel";
import ResourceMeters from "./ResourceMeters";
import { videoToProject } from "../lib/projectModel";

globalThis.React = React;

const wrap = (ui) => render(<MemoryRouter>{ui}</MemoryRouter>);
const job = (status, extra = {}) => ({
  _id: "vid-abcd1234",
  topic: "How closures work",
  status,
  type: "educational",
  resolution: "1920x1080",
  progress: 40,
  createdAt: "2026-10-01T00:00:00Z",
  updatedAt: new Date().toISOString(),
  ...extra,
});

describe("StatusBadge", () => {
  it("words a job status in sentence case", () => {
    render(<StatusBadge status="GENERATING_AUDIO" />);
    expect(screen.getByText("Generating audio")).toBeTruthy();
  });

  it("keeps quality verdicts distinct from job states", () => {
    const { rerender } = render(<StatusBadge kind="quality" status="passed" />);
    expect(screen.getByText("Passed")).toBeTruthy();
    rerender(<StatusBadge kind="quality" status="not-a-verdict" />);
    expect(screen.getByText("Not checked")).toBeTruthy();
  });
});

describe("ProjectCard", () => {
  it("links the title to the project and offers only the actions it was given", () => {
    const onSelect = vi.fn();
    const project = videoToProject(job("COMPLETED"));
    wrap(<ProjectCard project={project} actions={[{ label: "Open editor", onSelect }, { divider: true }, { label: "Delete…", danger: true, onSelect }]} />);

    expect(screen.getByRole("link", { name: "How closures work" }).getAttribute("href")).toBe("/render?id=vid-abcd1234");
    fireEvent.click(screen.getByRole("button", { name: /actions for how closures work/i }));
    expect(screen.getAllByRole("menuitem").map((el) => el.textContent)).toEqual(["Open editor", "Delete…"]);
    fireEvent.click(screen.getByRole("menuitem", { name: "Delete…" }));
    expect(onSelect).toHaveBeenCalledWith(project);
  });

  it("has no menu when there are no actions", () => {
    wrap(<ProjectCard project={videoToProject(job("COMPLETED"))} />);
    expect(screen.queryByRole("button", { name: /actions for/i })).toBeNull();
  });

  it("shows a live progress bar only for work in flight", () => {
    const { container, rerender } = wrap(<ProjectCard project={videoToProject(job("RENDERING"))} />);
    expect(container.querySelector('[class*="bg-accent"]')).toBeTruthy();
    rerender(
      <MemoryRouter>
        <ProjectCard project={videoToProject(job("COMPLETED", { progress: 100 }))} />
      </MemoryRouter>
    );
    expect(screen.queryByText("100%")).toBeNull();
  });
});

describe("ProjectGrid", () => {
  it("renders skeletons, not an empty grid, while loading", () => {
    const { container } = wrap(<ProjectGrid loading />);
    expect(container.querySelectorAll('[aria-hidden="true"]').length).toBeGreaterThan(0);
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("asks for each project's own actions when given a function", () => {
    const actions = vi.fn(() => [{ label: "Open", onSelect: () => {} }]);
    wrap(<ProjectGrid projects={[videoToProject(job("COMPLETED"))]} actions={actions} />);
    expect(actions).toHaveBeenCalledWith(expect.objectContaining({ id: "vid-abcd1234" }));
  });
});

describe("JobStatusPanel", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("warns, instead of showing a confident bar, when a running job has gone quiet", () => {
    const quiet = videoToProject(job("RENDERING", { updatedAt: new Date(Date.now() - 25 * 60 * 1000).toISOString() }));
    wrap(<JobStatusPanel project={quiet} />);
    expect(screen.getByText(/No update for 25m/)).toBeTruthy();
  });

  it("does not warn about a freshly updated running job", () => {
    wrap(<JobStatusPanel project={videoToProject(job("RENDERING"))} />);
    expect(screen.queryByText(/No update for/)).toBeNull();
  });

  it("shows why a failed job failed", () => {
    wrap(<JobStatusPanel project={videoToProject(job("FAILED", { error: { message: "TTS did not start" } }))} />);
    expect(screen.getByText("TTS did not start")).toBeTruthy();
  });
});

describe("ResourceMeters", () => {
  it("shows every meter as Unavailable when the telemetry request failed", () => {
    render(<ResourceMeters resources={null} />);
    expect(screen.getAllByText("Unavailable")).toHaveLength(4);
  });

  it("shows only the figures that were measured", () => {
    render(
      <ResourceMeters
        resources={{ gpu: null, memory: { usedBytes: 8 * 1024 ** 3, totalBytes: 16 * 1024 ** 3 }, cpu: { percent: 12.5, cores: 8 } }}
      />
    );
    // GPU load and VRAM could not be read; memory and CPU could.
    expect(screen.getAllByText("Unavailable")).toHaveLength(2);
    expect(screen.getByText("8.0 GB / 16.0 GB")).toBeTruthy();
    expect(screen.getByText("13%")).toBeTruthy();
  });
});
