// Explicit React import: the test transform here does not apply the automatic JSX runtime.
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

globalThis.React = React;

const api = vi.hoisted(() => ({
  resolveMediaUrl: (u) => u,
  getPublishingJob: vi.fn(),
  updatePublishingJob: vi.fn(),
  submitPublishingJob: vi.fn(),
  retryPublishingJob: vi.fn(),
  deletePublishingJob: vi.fn(),
  startYouTubeConnect: vi.fn(),
  disconnectPublishingAccount: vi.fn(),
  getPublishingCapabilities: vi.fn(),
  getPublishingAccounts: vi.fn(),
  getPublishingJobs: vi.fn(),
  getPublishingLessons: vi.fn(),
  getPublishingVideos: vi.fn(),
  getUdemyOverview: vi.fn(),
  getCourses: vi.fn(),
  saveUdemyProfile: vi.fn(),
  createUdemyExport: vi.fn(),
  getPublishingDownloadUrl: (id) => `/dl/${id}`,
  createPublishingJob: vi.fn(),
  cancelPublishingJob: vi.fn(),
}));
const confirm = vi.hoisted(() => ({ confirmDialog: vi.fn() }));

vi.mock("../../services/api", () => api);
vi.mock("../../services/socket", () => ({ connect: vi.fn(), onPublishingJobUpdated: () => () => {} }));
vi.mock("../../components/ui/confirmBus", () => confirm);

import { PublishDialog } from "./PublishDialog";
import { AccountsPanel } from "./AccountsPanel";
import { UdemyPanel } from "./UdemyPanel";

const wrap = (ui) => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{ui}</QueryClientProvider>);

const draft = (over = {}) => ({
  _id: "pub-00000001", status: "DRAFT", platform: "youtube", lessonTitle: "Closures", accountId: "pac-00000001",
  courseId: "cou-00000001", courseVideoId: "vid-00000001", error: null, progress: { percent: 0 },
  metadata: { title: "Hello world", description: "About it", tags: ["js"], categoryId: "27", language: "en", privacyStatus: "private", publishAt: null, madeForKids: false, containsSyntheticMedia: true },
  actions: { canEdit: true, canSubmit: true, canRetry: false, canDiscard: true },
  ...over,
});
const caps = (yt = {}) => ({ youtube: { configured: true, apiVerified: false, privacyOptions: ["private"], schedulingAvailable: false, categories: [{ id: "27", title: "Education" }], restrictions: [], ...yt } });
const accounts = [{ _id: "pac-00000001", displayName: "My Channel", externalId: "UC1", status: "connected", scopes: [] }];

const mountDialog = (job = draft(), c = caps()) => {
  api.getPublishingJob.mockResolvedValue({ data: { job } });
  const onSubmitted = vi.fn();
  wrap(<PublishDialog jobId={job._id} lesson={{ title: "Closures", renderUrl: "http://media/x.mp4" }} accounts={accounts} caps={c} onClose={vi.fn()} onSubmitted={onSubmitted} />);
  return { onSubmitted };
};

beforeEach(() => {
  cleanup();
  vi.clearAllMocks();
  api.updatePublishingJob.mockResolvedValue({ data: { job: draft() } });
  api.submitPublishingJob.mockResolvedValue({ data: { job: draft({ status: "QUEUED" }), enqueued: true } });
  api.retryPublishingJob.mockResolvedValue({ data: { job: draft({ status: "QUEUED" }), enqueued: true } });
});

describe("PublishDialog - nothing uploads without an explicit confirmation", () => {
  it("shows the stored video, the editable details, and the private-only notice for an unverified project", async () => {
    mountDialog();
    expect(await screen.findByDisplayValue("Hello world")).toBeTruthy();
    expect(document.querySelector("video").getAttribute("src")).toBe("http://media/x.mp4");
    expect(screen.getByText("Private uploads only")).toBeTruthy();
    expect(screen.getByText("Made for kids")).toBeTruthy();
    expect(api.submitPublishingJob).not.toHaveBeenCalled(); // opening a draft never publishes
  });

  it("asks first, naming the channel and visibility, and does nothing if declined", async () => {
    confirm.confirmDialog.mockResolvedValue(false);
    mountDialog();
    await screen.findByDisplayValue("Hello world");

    fireEvent.click(screen.getByRole("button", { name: /publish to youtube/i }));

    await waitFor(() => expect(confirm.confirmDialog).toHaveBeenCalledTimes(1));
    const { content } = confirm.confirmDialog.mock.calls[0][0];
    expect(content).toContain("My Channel");
    expect(content).toContain("private");
    expect(api.updatePublishingJob).not.toHaveBeenCalled();
    expect(api.submitPublishingJob).not.toHaveBeenCalled();
  });

  it("saves the edits and then submits once, only after the user confirms", async () => {
    confirm.confirmDialog.mockResolvedValue(true);
    const { onSubmitted } = mountDialog();
    const title = await screen.findByDisplayValue("Hello world");
    fireEvent.change(title, { target: { value: "A better title" } });

    fireEvent.click(screen.getByRole("button", { name: /publish to youtube/i }));

    await waitFor(() => expect(api.submitPublishingJob).toHaveBeenCalledTimes(1));
    expect(api.updatePublishingJob).toHaveBeenCalledWith("pub-00000001", expect.objectContaining({ title: "A better title", privacyStatus: "private", madeForKids: false }));
    expect(api.updatePublishingJob.mock.invocationCallOrder[0]).toBeLessThan(api.submitPublishingJob.mock.invocationCallOrder[0]);
    await waitFor(() => expect(onSubmitted).toHaveBeenCalled());
  });

  it("shows field errors and neither confirms nor calls the server when the form is invalid", async () => {
    mountDialog();
    const title = await screen.findByDisplayValue("Hello world");
    fireEvent.change(title, { target: { value: "" } });

    fireEvent.click(screen.getByRole("button", { name: /publish to youtube/i }));

    expect(await screen.findByText("A title is required")).toBeTruthy();
    expect(confirm.confirmDialog).not.toHaveBeenCalled();
    expect(api.submitPublishingJob).not.toHaveBeenCalled();
  });

  it("sends a failed job back through retry (not submit) once it has been fixed", async () => {
    confirm.confirmDialog.mockResolvedValue(true);
    mountDialog(draft({
      status: "FAILED", error: { code: "INVALID_METADATA", message: "YouTube rejected the video details", action: "Fix the highlighted metadata", retryable: false },
      actions: { canEdit: true, canSubmit: false, canRetry: true, canDiscard: false },
    }));
    expect(await screen.findByText("Fix the highlighted metadata")).toBeTruthy(); // the error comes with what to do

    fireEvent.click(screen.getByRole("button", { name: /retry upload/i }));

    await waitFor(() => expect(api.retryPublishingJob).toHaveBeenCalledTimes(1));
    expect(api.submitPublishingJob).not.toHaveBeenCalled();
  });

  it("offers scheduling only for a verified project", async () => {
    mountDialog(draft(), caps({ apiVerified: true, privacyOptions: ["private", "unlisted", "public"], schedulingAvailable: true }));
    await screen.findByDisplayValue("Hello world");
    expect(screen.queryByText("Private uploads only")).toBeNull();
    expect(screen.getByText(/YouTube makes it public at this time/)).toBeTruthy();
  });
});

describe("AccountsPanel", () => {
  it("cannot start a connection until Google is configured, and says how to fix that", () => {
    wrap(<AccountsPanel accounts={[]} loading={false} caps={caps({ configured: false })} />);
    expect(screen.getByText("Google OAuth is not configured")).toBeTruthy();
    expect(screen.getByRole("button", { name: /connect youtube account/i }).disabled).toBe(true);
  });

  it("hands the browser to Google's consent screen when connecting", async () => {
    const assign = vi.fn();
    vi.stubGlobal("location", { ...window.location, assign });
    api.startYouTubeConnect.mockResolvedValue({ data: { authUrl: "https://accounts.google.com/o/oauth2/v2/auth?state=abc" } });
    wrap(<AccountsPanel accounts={[]} loading={false} caps={caps()} />);

    fireEvent.click(screen.getByRole("button", { name: /connect youtube account/i }));

    await waitFor(() => expect(assign).toHaveBeenCalledWith("https://accounts.google.com/o/oauth2/v2/auth?state=abc"));
    vi.unstubAllGlobals();
  });

  it("flags an account that needs reconnecting, with the reason", () => {
    const needs = [{ ...accounts[0], status: "needs_reauth", statusReason: "Revoked in your Google account" }];
    wrap(<AccountsPanel accounts={needs} loading={false} caps={caps()} />);
    expect(screen.getByText("Needs reconnecting")).toBeTruthy();
    expect(screen.getByText("Revoked in your Google account")).toBeTruthy();
    expect(screen.getByRole("button", { name: /reconnect/i })).toBeTruthy();
  });

  it("never renders token material, and explains the upload allowance and restrictions", () => {
    wrap(<AccountsPanel accounts={accounts} loading={false} caps={caps({ uploadsToday: 3, dailyUploadLimit: 100, quotaResetsAt: "2026-10-11T07:00:00.000Z", restrictions: ["YouTube locks uploads to Private."] })} />);
    expect(screen.getByText("3 of 100")).toBeTruthy();
    expect(screen.getByText(/locks uploads to Private/)).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/refresh|v1:|secret/i);
  });
});

describe("UdemyPanel - honest about what Udemy allows", () => {
  const overview = {
    capabilities: { directPublishing: false, reviewedOn: "2026-10-10", links: { instructor: "https://www.udemy.com/instructor/" } },
    profile: { subtitle: "", description: "", level: "All Levels", learningObjectives: [], prerequisites: [], intendedAudience: [], sections: [] },
    plan: { course: { description: "" }, sections: [{ index: 1, title: "Course content", lectures: [{ id: "vid-00000001", title: "Lesson 1" }] }] },
    validation: {
      ok: false, errors: [{ severity: "error", code: "COURSE_SUBTITLE_MISSING", message: "Add a course subtitle (headline) - Udemy requires one." }],
      warnings: [], info: [], totals: { sections: 1, lectures: 1, lecturesWithVideo: 1, totalMinutes: 6 },
    },
    latestExport: null,
  };

  it("states up front that exporting does not publish anything and no Udemy login is requested", async () => {
    api.getCourses.mockResolvedValue({ data: { courses: [{ _id: "cou-00000001", title: "JS" }] } });
    api.getUdemyOverview.mockResolvedValue({ data: overview });
    wrap(<UdemyPanel />);

    expect(screen.getByText(/can't be published to automatically/i)).toBeTruthy();
    expect(screen.getByText(/does not create or publish anything on Udemy/i)).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/udemy (password|api key)/i);
  });
});
