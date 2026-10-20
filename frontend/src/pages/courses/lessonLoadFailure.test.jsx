// Explicit React import: the test transform here does not apply the automatic JSX runtime.
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";

const api = vi.hoisted(() => ({
  getCourseVideo: vi.fn(),
  getCourseVideoActivityLogs: vi.fn(),
  updateCourseVideoScript: vi.fn(),
}));
vi.mock("../../services/api", async (importOriginal) => ({ ...(await importOriginal()), ...api }));
// Subscriptions (onX / subscribeTo...) return an unsubscribe; everything else is a no-op.
const socketNames = vi.hoisted(() => ( "connect disconnect classifyJobEvent joinJobRoom leaveJobRoom joinCourseRoom leaveCourseRoom onJobCreated onJobProgress onJobCompleted onJobFailed onSceneAudioReady onSpeechStage onStageUpdate onCourseVideoCreated onCourseVideoDeleted onCourseVideoUpdated onCourseVideoProgress onCourseVideoScriptReady onCourseVideoAudioReady onCourseVideoSceneAudioReady onCourseVideoRenderReady onCourseWorkerStatus onServerLog getConnectionStatus subscribeToConnectionStatus onConnect onDisconnect isConnected requestJobStatus onJobStatus".split(" ")));
vi.mock("../../services/socket", () => {
  const out = {};
  for (const n of socketNames) out[n] = /^(on|subscribeTo)/.test(n) ? () => () => {} : () => (n === "getConnectionStatus" ? "disconnected" : undefined);
  return out;
});
vi.mock("../../shared/useCourseWorkerStatus", () => ({ useCourseWorkerStatus: () => true }));
vi.mock("../../components/video/ScenePreview", () => ({ ScenePreview: () => <div data-testid="scene-preview" /> }));
vi.mock("../../components/ui/toastBus", () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));

import CourseVideoStudio from "./CourseVideoStudio";
import CourseVideoEditor from "./CourseVideoEditor";

globalThis.React = React;

// A data router: the pages use useBlocker (unsaved-changes guard).
const mount = (Page, path) => {
  const router = createMemoryRouter(
    [
      { path: "/courses/:courseId", element: <div data-testid="course-page" /> },
      { path: "/courses/:courseId/videos/:videoId", element: <Page /> },
      { path: "/courses/:courseId/videos/:videoId/studio", element: <Page /> },
    ],
    { initialEntries: [path] },
  );
  return render(<RouterProvider router={router} />);
};

const down = () => Object.assign(new Error("Network Error"), { friendlyMessage: "Cannot reach the server" });
const gone = () => Object.assign(new Error("Not Found"), { response: { status: 404 }, friendlyMessage: "Not found" });
const lesson = { _id: "vid-1", title: "Intro", status: "DRAFT", duration: 5, voice: "v", style: "s", script: { scenes: [{ sceneNumber: 1, duration: 8 }] } };

beforeEach(() => {
  vi.clearAllMocks();
  api.getCourseVideoActivityLogs.mockResolvedValue({ data: { logs: [] } });
});

describe.each([
  ["CourseVideoStudio", CourseVideoStudio, "/courses/c1/videos/vid-1/studio"],
  ["CourseVideoEditor", CourseVideoEditor, "/courses/c1/videos/vid-1"],
])("%s load failures", (_name, Page, path) => {
  it("an unreachable API is an error with Retry - not 'Lesson not found' and not a redirect", async () => {
    api.getCourseVideo.mockRejectedValue(down());
    mount(Page, path);
    expect(await screen.findByText("Could not load this lesson")).toBeTruthy();
    expect(screen.queryByText("Lesson not found")).toBeNull();
    expect(screen.queryByTestId("course-page")).toBeNull();
  });

  it("Retry loads the lesson", async () => {
    api.getCourseVideo.mockRejectedValueOnce(down());
    mount(Page, path);
    fireEvent.click(await screen.findByText("Retry"));
    api.getCourseVideo.mockResolvedValue({ data: { video: lesson } });
    await waitFor(() => expect(screen.queryByText("Could not load this lesson")).toBeNull());
    expect(api.getCourseVideo.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it("a 404 is still 'Lesson not found'", async () => {
    api.getCourseVideo.mockRejectedValue(gone());
    mount(Page, path);
    expect(await screen.findByText("Lesson not found")).toBeTruthy();
    expect(screen.queryByText("Could not load this lesson")).toBeNull();
  });
});
