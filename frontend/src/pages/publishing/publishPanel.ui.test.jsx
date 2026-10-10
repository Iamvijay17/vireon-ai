// Explicit React import: the test transform here does not apply the automatic JSX runtime.
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

globalThis.React = React;

const api = vi.hoisted(() => ({
  resolveMediaUrl: (u) => u,
  getPublishingJob: vi.fn(),
  getPublishingLessons: vi.fn(),
  getPublishingVideos: vi.fn(),
  getCourses: vi.fn(),
  createPublishingJob: vi.fn(),
  updatePublishingJob: vi.fn(),
  submitPublishingJob: vi.fn(),
  retryPublishingJob: vi.fn(),
  deletePublishingJob: vi.fn(),
  getPublishingCapabilities: vi.fn(),
  getPublishingAccounts: vi.fn(),
  getPublishingJobs: vi.fn(),
  getUdemyOverview: vi.fn(),
}));

vi.mock("../../services/api", () => api);
vi.mock("../../services/socket", () => ({ connect: vi.fn(), onPublishingJobUpdated: () => () => {} }));
vi.mock("../../components/ui/confirmBus", () => ({ confirmDialog: vi.fn() }));

import { PublishPanel } from "./PublishPanel";

const wrap = (ui) => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{ui}</QueryClientProvider>);

const caps = { youtube: { configured: true, apiVerified: false, privacyOptions: ["private"], schedulingAvailable: false, categories: [{ id: "27", title: "Education" }] } };
const accounts = [{ _id: "pac-00000001", displayName: "My Channel", externalId: "UC1", status: "connected" }];

const video = (over = {}) => ({
  _id: "job-00000001", title: "Closures in 60 seconds", type: "youtube_shorts", resolution: "1080x1920", createdAt: "2026-10-09T10:00:00Z",
  renderUrl: "http://media/short.mp4", publishable: true, latestJob: null, published: [], ...over,
});

beforeEach(() => {
  cleanup();
  vi.clearAllMocks();
  api.getCourses.mockResolvedValue({ data: { courses: [{ _id: "cou-00000001", title: "JS" }] } });
  api.getPublishingLessons.mockResolvedValue({ data: { lessons: [{ _id: "vid-00000001", title: "Lesson one", order: 1, publishable: true, renderUrl: "http://media/l.mp4", published: [], latestJob: null }] } });
  api.getPublishingVideos.mockResolvedValue({ data: { videos: [video()] } });
  api.createPublishingJob.mockResolvedValue({ data: { job: { _id: "pub-00000001" }, existing: false } });
  api.getPublishingJob.mockResolvedValue({ data: { job: {
    _id: "pub-00000001", status: "DRAFT", platform: "youtube", accountId: "pac-00000001", videoJobId: "job-00000001", courseId: null, lessonTitle: "Closures in 60 seconds",
    metadata: { title: "Closures in 60 seconds", description: "", tags: [], categoryId: "27", language: "hi", privacyStatus: "private", publishAt: null, madeForKids: false, containsSyntheticMedia: true },
    actions: { canEdit: true, canSubmit: true, canRetry: false, canDiscard: true }, error: null, progress: { percent: 0 },
  } } });
});

describe("PublishPanel - standalone videos", () => {
  it("offers both sources and defaults to course lessons", () => {
    wrap(<PublishPanel caps={caps} accounts={accounts} onViewQueue={vi.fn()} />);
    expect(screen.getByRole("tab", { name: /course lessons/i }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("tab", { name: /standalone videos/i }).getAttribute("aria-selected")).toBe("false");
    expect(api.getPublishingVideos).not.toHaveBeenCalled(); // nothing fetched until it is asked for
  });

  it("lists finished standalone videos, labels Shorts, and creates a draft by videoJobId (not a lesson id)", async () => {
    wrap(<PublishPanel caps={caps} accounts={accounts} onViewQueue={vi.fn()} />);
    fireEvent.click(screen.getByRole("tab", { name: /standalone videos/i }));

    expect(await screen.findByText("Closures in 60 seconds")).toBeTruthy();
    expect(screen.getByText(/Short · 1080x1920/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /^publish…$/i }));

    await waitFor(() => expect(api.createPublishingJob).toHaveBeenCalledTimes(1));
    const body = api.createPublishingJob.mock.calls[0][0];
    expect(body).toMatchObject({ accountId: "pac-00000001", videoJobId: "job-00000001", allowReupload: false });
    expect(body).not.toHaveProperty("courseVideoId");
    // The review dialog opens with the stored video, and nothing was submitted.
    expect(await screen.findByDisplayValue("Closures in 60 seconds")).toBeTruthy();
    expect(document.querySelector("video").getAttribute("src")).toBe("http://media/short.mp4");
    expect(api.submitPublishingJob).not.toHaveBeenCalled();
  });

  it("says so when there are no finished standalone videos", async () => {
    api.getPublishingVideos.mockResolvedValue({ data: { videos: [] } });
    wrap(<PublishPanel caps={caps} accounts={accounts} onViewQueue={vi.fn()} />);
    fireEvent.click(screen.getByRole("tab", { name: /standalone videos/i }));
    expect(await screen.findByText(/No finished standalone videos yet/)).toBeTruthy();
  });

  it("already-published videos link to YouTube and offer an explicit 'Publish again'", async () => {
    api.getPublishingVideos.mockResolvedValue({ data: { videos: [video({ published: [{ jobId: "pub-9", videoId: "VID9", url: "https://www.youtube.com/watch?v=VID9" }], latestJob: { _id: "pub-9", status: "COMPLETED" } })] } });
    wrap(<PublishPanel caps={caps} accounts={accounts} onViewQueue={vi.fn()} />);
    fireEvent.click(screen.getByRole("tab", { name: /standalone videos/i }));
    expect(await screen.findByText("Watch")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /publish again/i }));
    await waitFor(() => expect(api.createPublishingJob).toHaveBeenCalled());
    expect(api.createPublishingJob.mock.calls[0][0].allowReupload).toBe(true);
  });

  it("still publishes course lessons by courseVideoId", async () => {
    wrap(<PublishPanel caps={caps} accounts={accounts} onViewQueue={vi.fn()} />);
    // pick the course from the dropdown
    fireEvent.click(await screen.findByText("Select a course"));
    fireEvent.click(await screen.findByText("JS"));
    expect(await screen.findByText("Lesson one")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /^publish…$/i }));
    await waitFor(() => expect(api.createPublishingJob).toHaveBeenCalled());
    expect(api.createPublishingJob.mock.calls[0][0]).toMatchObject({ courseVideoId: "vid-00000001" });
    expect(api.createPublishingJob.mock.calls[0][0]).not.toHaveProperty("videoJobId");
  });
});
