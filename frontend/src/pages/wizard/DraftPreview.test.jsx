// Explicit React import: the test transform here does not apply the automatic JSX runtime.
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const api = vi.hoisted(() => ({ getVideoJob: vi.fn() }));
vi.mock("../../services/api", () => api);
vi.mock("../../components/ui/toastBus", () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));
// The real player needs a layout engine; what matters here is that it is mounted with the job's real scenes.
vi.mock("../../components/video/ScenePreview", () => ({
  ScenePreview: ({ scenes, videoId }) => <div data-testid="scene-preview">{`${scenes.length} scenes for ${videoId}`}</div>,
}));

import { DraftPreview } from "./DraftPreview";

globalThis.React = React;

const mount = (props = {}) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <DraftPreview jobId="job-1" onOpenStudio={vi.fn()} onOpenRender={vi.fn()} {...props} />
    </QueryClientProvider>,
  );
};
const job = (over = {}) => ({ data: { job: { _id: "job-1", status: "AWAITING_APPROVAL", script: { scenes: [{ sceneNumber: 1 }, { sceneNumber: 2 }] }, ...over } } });

beforeEach(() => vi.clearAllMocks());

describe("DraftPreview", () => {
  it("says the script is still being written until scenes exist", async () => {
    api.getVideoJob.mockResolvedValue(job({ status: "SCRIPT_GENERATION", script: {} }));
    mount();
    expect(await screen.findByTestId("draft-waiting")).toBeTruthy();
    expect(screen.queryByTestId("scene-preview")).toBeNull();
  });

  it("mounts the real preview with the job's scenes, labelled as a draft - never as the final video", async () => {
    api.getVideoJob.mockResolvedValue(job());
    mount();
    expect((await screen.findByTestId("scene-preview")).textContent).toBe("2 scenes for job-1");
    const panel = screen.getByTestId("draft-preview");
    expect(panel.textContent).toContain("Draft");
    expect(panel.textContent).toContain("not the rendered video");
    expect(screen.queryByText("Watch the final render")).toBeNull();
  });

  it("links the final render only once the job completed with a video", async () => {
    const onOpenRender = vi.fn();
    api.getVideoJob.mockResolvedValue(job({ status: "COMPLETED", videoUrl: "http://x/video.mp4" }));
    mount({ onOpenRender });
    fireEvent.click(await screen.findByText("Watch the final render"));
    expect(onOpenRender).toHaveBeenCalled();
  });

  it("opens the Studio for scene review", async () => {
    const onOpenStudio = vi.fn();
    api.getVideoJob.mockResolvedValue(job());
    mount({ onOpenStudio });
    fireEvent.click(await screen.findByText("Review scenes in Studio"));
    expect(onOpenStudio).toHaveBeenCalled();
  });

  it("shows a retryable error when the job cannot be loaded, not an empty preview", async () => {
    api.getVideoJob.mockRejectedValueOnce(Object.assign(new Error("down"), { friendlyMessage: "Cannot reach the server" }));
    mount();
    expect(await screen.findByText("Cannot reach the server", { selector: "*" })).toBeTruthy();
    api.getVideoJob.mockResolvedValue(job());
    fireEvent.click(screen.getByText("Retry"));
    await waitFor(() => expect(screen.getByTestId("scene-preview")).toBeTruthy());
  });

  it("reports a job that failed before producing a script", async () => {
    api.getVideoJob.mockResolvedValue(job({ status: "FAILED", script: {}, error: { message: "LLM unreachable" } }));
    mount();
    expect(await screen.findByText("LLM unreachable")).toBeTruthy();
  });
});
