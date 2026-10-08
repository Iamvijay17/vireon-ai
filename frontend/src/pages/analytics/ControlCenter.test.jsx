// Explicit React import: the test transform here does not apply the automatic JSX runtime
// the app build uses.
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const api = vi.hoisted(() => ({ getControlCenter: vi.fn() }));
vi.mock("../../services/api", () => api);
vi.mock("../../components/ui/toastBus", () => ({ toast: { error: vi.fn(), success: vi.fn(), info: vi.fn() } }));

import { ControlCenter } from "./ControlCenter";

globalThis.React = React;

const stage = (key, label, over = {}) => ({ key, label, jobs: 0, completed: 0, reused: 0, timedRuns: 0, avgMs: null, maxMs: null, ...over });
const fstage = (stageKey, label, over = {}) => ({ stage: stageKey, label, attempts: 0, failures: 0, retries: 0, failureRate: null, ...over });

const data = (over = {}) => ({
  range: { days: 30 },
  videos: { total: 19, allTime: 40, successful: 13, failed: 1, cancelled: 1, processing: 3, awaitingPerson: 1, successRate: 86.7 },
  pipeline: {
    avgGenerationMs: 950_047, generationSampleSize: 13, avgQueueWaitMs: 21_535,
    stages: [stage("script", "Script"), stage("audio", "Voice (TTS)", { timedRuns: 5, avgMs: 100_000, maxMs: 180_000, jobs: 5, reused: 1 }), stage("render", "Render", { timedRuns: 5, avgMs: 200_000, maxMs: 300_000, jobs: 5 })],
    jobsWithStageData: 5, jobsWithoutStageData: 14,
  },
  cache: {
    total: { hits: 30, misses: 10, shared: 2, stale: 1, hitRate: 75, timeSavedMs: 3_840_000 },
    byKind: [{ kind: "image", hits: 30, misses: 10, shared: 2, stale: 1, hitRate: 75, avgGenerationMs: 120_000, timeSavedMs: 3_840_000 }],
    legacyTtsHitRate: 14.2,
  },
  failures: {
    byStage: [fstage("script", "Script"), fstage("audio", "Voice (TTS)", { attempts: 8, failures: 2, retries: 2, failureRate: 25 })],
    topErrors: [{ code: "TTS_FAILED", stage: "audio", count: 2, message: "Voice generation failed", retryable: true }],
    failedJobsByCode: [],
    retries: { totalRetries: 3, retriedJobs: 2, avgRetriesPerRetriedJob: 1.5, retryRate: 10 },
  },
  workers: {
    video: { available: true, concurrency: 1, workersOnline: 1, waiting: 2, delayed: 1, depth: 3, active: 1, completed: 40, failed: 3 },
    course: { available: false },
  },
  ...over,
});

const mount = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ControlCenter days="30" />
    </QueryClientProvider>
  );
};

beforeEach(() => {
  vi.clearAllMocks();
  api.getControlCenter.mockResolvedValue({ data: data() });
});

describe("ControlCenter", () => {
  it("asks for the selected range", async () => {
    mount();
    await screen.findByTestId("control-center");
    expect(api.getControlCenter).toHaveBeenCalledWith(30);
  });

  it("shows the video outcomes", async () => {
    mount();
    const root = await screen.findByTestId("control-center");
    const text = root.textContent;
    expect(text).toContain("Successful");
    expect(text).toContain("13");
    expect(text).toContain("86.7% of finished");
    expect(text).toContain("40 all time");
  });

  it("shows stage timings, with stages that never ran as dashes rather than zeros", async () => {
    mount();
    const root = await screen.findByTestId("control-center");
    expect(root.textContent).toContain("Voice (TTS)");
    expect(root.textContent).toContain("1.7m"); // 100 000 ms average
    // The Script stage has no timed runs: no row in the table is claiming "0.0s"
    expect(root.textContent).not.toContain("0.0s");
  });

  it("says that older jobs are not part of the stage averages", async () => {
    mount();
    const root = await screen.findByTestId("control-center");
    expect(root.textContent).toContain("14 earlier jobs predate stage tracking and are not included");
  });

  it("shows cache hit rate, time saved and per-kind rows", async () => {
    mount();
    const root = await screen.findByTestId("control-center");
    expect(root.textContent).toContain("75%");
    expect(root.textContent).toContain("Images");
    expect(root.textContent).toContain("1.1h"); // 3 840 000 ms saved
  });

  it("shows failure rate by stage and the top error with its message", async () => {
    mount();
    const root = await screen.findByTestId("control-center");
    expect(root.textContent).toContain("25%");
    expect(root.textContent).toContain("TTS_FAILED");
    expect(root.textContent).toContain("Voice generation failed");
    expect(root.textContent).toContain("2×");
  });

  it("shows worker queues, and says plainly when one cannot be read", async () => {
    mount();
    const root = await screen.findByTestId("control-center");
    expect(root.textContent).toContain("Video worker");
    expect(root.textContent).toContain("Queue depth");
    expect(root.textContent).toContain("Unavailable");
    expect(root.textContent).toContain("could not be read");
  });

  it("an install with no data shows dashes and empty states, not zeros dressed up as results", async () => {
    api.getControlCenter.mockResolvedValue({
      data: data({
        videos: { total: 0, allTime: 0, successful: 0, failed: 0, cancelled: 0, processing: 0, awaitingPerson: 0, successRate: null },
        pipeline: { avgGenerationMs: null, generationSampleSize: 0, avgQueueWaitMs: null, stages: [stage("script", "Script")], jobsWithStageData: 0, jobsWithoutStageData: 0 },
        cache: { total: { hits: 0, misses: 0, shared: 0, stale: 0, hitRate: null, timeSavedMs: 0 }, byKind: [], legacyTtsHitRate: null },
        failures: { byStage: [fstage("script", "Script")], topErrors: [], failedJobsByCode: [], retries: { totalRetries: 0, retriedJobs: 0, avgRetriesPerRetriedJob: null, retryRate: null } },
      }),
    });
    mount();
    const root = await screen.findByTestId("control-center");
    expect(root.textContent).toContain("No stage timing yet");
    expect(root.textContent).toContain("No cache activity recorded");
    expect(root.textContent).toContain("No stage attempts recorded");
    expect(root.textContent).toContain("No failures recorded");
    expect(root.textContent).toContain("no finished videos");
  });

  it("falls back to failed jobs by code for failures that predate the event stream", async () => {
    api.getControlCenter.mockResolvedValue({
      data: data({ failures: { ...data().failures, topErrors: [], failedJobsByCode: [{ code: "RENDERING", count: 2 }] } }),
    });
    mount();
    const root = await screen.findByTestId("control-center");
    expect(root.textContent).toContain("RENDERING");
    expect(root.textContent).toContain("2×");
  });

  it("renders nothing when the data cannot be loaded", async () => {
    api.getControlCenter.mockRejectedValue(new Error("down"));
    const { container } = mount();
    await waitFor(() => expect(api.getControlCenter).toHaveBeenCalled());
    await waitFor(() => expect(container.querySelector("[data-testid='control-center']")).toBeNull());
  });
});
