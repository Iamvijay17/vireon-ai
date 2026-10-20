// Explicit React import: the test transform here does not apply the automatic JSX runtime
// the app build uses.
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const api = vi.hoisted(() => ({ getBenchmarks: vi.fn(), compareBenchmarks: vi.fn(), getPerfProfile: vi.fn() }));
vi.mock("../../services/api", () => api);
vi.mock("../../components/ui/toastBus", () => ({ toast: { error: vi.fn(), success: vi.fn(), info: vi.fn() } }));

import { PerformancePanel } from "./PerformancePanel";

globalThis.React = React;

const profile = (over = {}) => ({
  active: { name: "balanced", requested: null, recognised: true, description: "The default.", knobs: { remotionConcurrency: null }, source: { remotionConcurrency: "remotion-default" } },
  recommendation: { profile: "balanced", reasons: ["5.0 GB of RAM is free, enough for the default render."] },
  profiles: [
    { name: "balanced", active: true, description: "The default.", knobs: {}, evidence: {}, unmeasured: [] },
    { name: "low-memory", active: false, description: "Fewer tabs.", knobs: { remotionConcurrency: 2 }, evidence: { remotionConcurrency: "sweep 2026-10-20: 2=43.2s" }, unmeasured: ["alignment threads"] },
  ],
  ...over,
});

const run = (id, label, over = {}) => ({
  id, label, status: "COMPLETED", finishedAt: "2026-10-20T10:00:00Z", totalMs: 1_000_000,
  workload: { scenes: 4 }, ranking: [{ key: "audio", durationMs: 600_000, sharePct: 60 }],
  peak: { vram: { peakUsedMb: 5400, totalMb: 6144, stage: "audio" }, ram: null }, validation: { status: "passed" },
  ...over,
});

const mount = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><PerformancePanel /></QueryClientProvider>);
};

beforeEach(() => {
  vi.clearAllMocks();
  api.getPerfProfile.mockResolvedValue({ data: profile() });
  api.getBenchmarks.mockResolvedValue({ data: { runs: [run("a1", "baseline"), run("b2", "after")] } });
});

describe("PerformancePanel - profile", () => {
  it("shows the active profile, where its settings came from, and the evidence for the others", async () => {
    mount();
    const card = await screen.findByTestId("perf-profile");
    expect(card.textContent).toContain("Active profile: Balanced");
    expect(card.textContent).toContain("Remotion's own default");
    expect(card.textContent).toContain("Evidence: sweep 2026-10-20: 2=43.2s");
    expect(card.textContent).toContain("Not measured yet: alignment threads");
  });

  it("does not offer a change when the suggestion matches the active profile", async () => {
    mount();
    await screen.findByTestId("perf-profile");
    expect(screen.queryByTestId("perf-recommendation")).toBeNull();
  });

  it("explains a suggested change, and says it is not applied automatically", async () => {
    api.getPerfProfile.mockResolvedValue({ data: profile({ recommendation: { profile: "low-memory", reasons: ["Only 2.0 GB of RAM is free."] } }) });
    mount();
    const card = await screen.findByTestId("perf-profile");
    expect(card.textContent).toContain("Suggested now: Low memory");
    expect((await screen.findByTestId("perf-recommendation")).textContent).toContain("Only 2.0 GB of RAM is free.");
    expect(card.textContent).toContain("nothing changes automatically");
  });

  it("warns when PERF_PROFILE names something that is not a profile", async () => {
    api.getPerfProfile.mockResolvedValue({ data: profile({ active: { ...profile().active, requested: "turbo", recognised: false } }) });
    mount();
    expect((await screen.findByTestId("perf-profile")).textContent).toContain('"turbo" is not a profile');
  });
});

describe("PerformancePanel - benchmarks", () => {
  it("says how to record the first run when there is no history", async () => {
    api.getBenchmarks.mockResolvedValue({ data: { runs: [] } });
    mount();
    expect(await screen.findByText(/No benchmark runs stored yet/)).toBeTruthy();
  });

  it("lists stored runs with their slowest stage", async () => {
    mount();
    const root = await screen.findByTestId("performance-panel");
    await waitFor(() => expect(root.textContent).toContain("baseline"));
    expect(root.textContent).toContain("audio (60%)");
    expect(root.textContent).toContain("16.7m");
  });

  it("compares two picked runs, with the caveat when the workloads differ", async () => {
    api.compareBenchmarks.mockResolvedValue({
      data: {
        before: run("a1", "baseline"), after: run("b2", "after", { peak: { vram: null, ram: null }, validation: null }),
        comparison: {
          comparable: false, caveat: "The two runs processed different amounts of work.", totalDeltaPct: -23.4, perSceneDeltaPct: 4,
          rows: [
            { key: "audio", label: "Narration (Qwen3-TTS)", beforeMs: 600_000, afterMs: 450_000, deltaPct: -25, beforePerSceneMs: 150_000, afterPerSceneMs: 112_500 },
            { key: "images", label: "Images (ComfyUI)", beforeMs: null, afterMs: null, deltaPct: null },
          ],
        },
      },
    });
    mount();
    await screen.findByText("baseline");
    fireEvent.click(screen.getByLabelText("Use baseline as before"));
    fireEvent.click(screen.getByLabelText("Use after as after"));

    const cmp = await screen.findByTestId("benchmark-compare");
    expect(api.compareBenchmarks).toHaveBeenCalledWith("a1", "b2");
    expect(cmp.textContent).toContain("Total: 23.4% faster");
    expect(cmp.textContent).toContain("Per scene: 4% slower");
    expect(screen.getByTestId("compare-caveat").textContent).toContain("different amounts of work");
    expect(cmp.textContent).toContain("Narration (Qwen3-TTS)");
    expect(cmp.textContent).not.toContain("Images (ComfyUI)"); // neither run did that work
    // unmeasured memory is a dash, not 0
    expect(cmp.textContent).toContain("VRAM — of —");
  });

  it("does not compare a run with itself", async () => {
    mount();
    await screen.findByText("baseline");
    fireEvent.click(screen.getByLabelText("Use baseline as before"));
    fireEvent.click(screen.getByLabelText("Use baseline as after"));
    expect(await screen.findByText(/Pick two different runs/)).toBeTruthy();
    expect(api.compareBenchmarks).not.toHaveBeenCalled();
  });
});
