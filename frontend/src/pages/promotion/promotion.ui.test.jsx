// Explicit React import: the test transform here does not apply the automatic JSX runtime.
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";

globalThis.React = React;

const api = vi.hoisted(() => ({
  resolveMediaUrl: (u) => u,
  resolveStoragePath: (p) => `http://media${p}`,
  resolveThumbnailUrl: (u) => u,
  getSocialCapabilities: vi.fn(),
  getSocialOverview: vi.fn(),
  getSocialAccounts: vi.fn(),
  startSocialConnect: vi.fn(),
  validateSocialAccount: vi.fn(),
  disconnectSocialAccount: vi.fn(),
  getSocialLibrary: vi.fn(),
  createCampaign: vi.fn(),
  getCampaign: vi.fn(),
  updateCampaign: vi.fn(),
  uploadCampaignMedia: vi.fn(),
  generateCampaignCopy: vi.fn(),
  validateCampaign: vi.fn(),
  publishCampaign: vi.fn(),
  getSocialPosts: vi.fn(),
  getSocialPost: vi.fn(),
  editSocialPost: vi.fn(),
  cancelSocialPost: vi.fn(),
  retrySocialPost: vi.fn(),
  deleteSocialPost: vi.fn(),
  getSocialCalendar: vi.fn(),
  getSocialAnalytics: vi.fn(),
  refreshSocialAnalytics: vi.fn(),
  // the publishing hooks that usePromotion re-exports pull these in
  getPublishingCapabilities: vi.fn(), getPublishingAccounts: vi.fn(), getPublishingJobs: vi.fn(), getPublishingJob: vi.fn(),
  getPublishingLessons: vi.fn(), getPublishingVideos: vi.fn(), getUdemyOverview: vi.fn(), getCourses: vi.fn(),
}));
const confirm = vi.hoisted(() => ({ confirmDialog: vi.fn() }));

vi.mock("../../services/api", () => api);
vi.mock("../../services/socket", () => ({ connect: vi.fn(), onSocialPostUpdated: () => () => {}, onPublishingJobUpdated: () => () => {} }));
vi.mock("../../components/ui/confirmBus", () => confirm);
// Chart.js needs a real canvas; the chart itself is not what these tests are about.
vi.mock("../../components/charts/TrendChart", () => ({ TrendChart: () => <div data-testid="trend-chart" /> }));

import { AccountsPanel } from "./AccountsPanel";
import { AnalyticsPanel } from "./AnalyticsPanel";
import { PostsPanel } from "./PostsPanel";
import { CreatePanel } from "./CreatePanel";
import { SchedulePicker } from "./SchedulePicker";
import { PlatformPreview } from "./PlatformPreview";
import { CopyEditor } from "./CopyEditor";

const wrap = (ui, route = "/promotion/create") => render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <MemoryRouter initialEntries={[route]}>{ui}</MemoryRouter>
  </QueryClientProvider>
);

const caps = (over = {}) => ({
  platforms: { facebook: { configured: true }, instagram: { configured: true }, threads: { configured: true } },
  publicMedia: { configured: true }, scheduling: { minLeadMinutes: 2, maxAheadDays: 180 },
  uploads: { maxImageBytes: 8388608, maxVideoBytes: 1073741824 }, restrictions: [], ...over,
});
const acct = (over = {}) => ({ _id: "pac-fbfbfbfb", platform: "facebook", displayName: "My Page", username: "", externalId: "P1", status: "connected", scopes: ["pages_manage_posts"], connectedAt: new Date().toISOString(), ...over });
const accounts = [
  acct(),
  acct({ _id: "pac-igigigig", platform: "instagram", displayName: "My IG", username: "my_ig", externalId: "IG1", scopes: ["instagram_content_publish"] }),
  acct({ _id: "pac-thththth", platform: "threads", displayName: "Me", username: "me", externalId: "777", scopes: ["threads_content_publish"], tokenExpiresInDays: 40 }),
];

const post = (over = {}) => ({
  _id: "spo-00000001", campaignId: "cam-00000001", platform: "instagram", accountLabel: "My IG", accountHandle: "my_ig", format: "reel", status: "COMPLETED",
  content: { caption: "Hello world", hashtags: [], cta: "", linkUrl: "" }, progress: { percent: 100, phase: "Published" }, remote: { permalink: "https://ig/p/1" },
  attempts: 1, maxAttempts: 5, error: null, createdAt: "2026-10-10T10:00:00Z", completedAt: "2026-10-10T10:01:00Z", actions: {}, ...over,
});

beforeEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("AccountsPanel", () => {
  it("shows skeletons while loading and a retry when loading fails", () => {
    const retry = vi.fn();
    wrap(<AccountsPanel caps={caps()} accounts={[]} loading error={null} onRetry={retry} />);
    expect(document.querySelectorAll('[aria-busy="true"]').length).toBeGreaterThan(0);
    cleanup();
    wrap(<AccountsPanel caps={caps()} accounts={[]} loading={false} error={new Error("x")} onRetry={retry} />);
    fireEvent.click(screen.getAllByRole("button", { name: /retry/i })[0]);
    expect(retry).toHaveBeenCalled();
  });

  it("says what to configure when a platform is not set up, and disables connecting", () => {
    wrap(<AccountsPanel caps={caps({ platforms: { facebook: { configured: false }, instagram: { configured: false }, threads: { configured: false } } })} accounts={[]} loading={false} error={null} />);
    expect(screen.getByText("Meta is not configured")).toBeTruthy();
    expect(screen.getByText("Threads is not configured")).toBeTruthy();
    expect(screen.getByText("META_APP_ID")).toBeTruthy();
    expect(screen.getByRole("button", { name: /connect facebook \/ instagram/i }).disabled).toBe(true);
  });

  it("explains permissions and requirements first, and only then sends the browser to the platform", async () => {
    api.startSocialConnect.mockResolvedValue({ data: { authUrl: "https://www.facebook.com/v25.0/dialog/oauth?state=abc" } });
    const assign = vi.fn();
    Object.defineProperty(window, "location", { value: { ...window.location, assign }, writable: true });
    wrap(<AccountsPanel caps={caps()} accounts={[]} loading={false} error={null} />);

    fireEvent.click(screen.getByRole("button", { name: /connect facebook \/ instagram/i }));
    expect(await screen.findByText(/Vireon will ask for permission to/)).toBeTruthy();
    expect(screen.getByText(/Professional \(Business or Creator\) account linked to that Facebook Page/)).toBeTruthy();
    expect(screen.getByText(/never sees your password/)).toBeTruthy();
    expect(api.startSocialConnect).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: /continue to meta/i }));
    await waitFor(() => expect(api.startSocialConnect).toHaveBeenCalledWith("meta"));
    await waitFor(() => expect(assign).toHaveBeenCalledWith("https://www.facebook.com/v25.0/dialog/oauth?state=abc"));
  });

  it("lists accounts with status and permissions, and flags one that needs reconnecting", () => {
    wrap(<AccountsPanel caps={caps()} loading={false} error={null} accounts={[...accounts, acct({ _id: "pac-bad", displayName: "Old Page", status: "needs_reauth", statusReason: "The token expired." })]} />);
    expect(screen.getByText("My IG")).toBeTruthy();
    expect(screen.getByText("@my_ig")).toBeTruthy();
    expect(screen.getByText("Publish to Instagram")).toBeTruthy();
    expect(screen.getByText("Needs reconnecting")).toBeTruthy();
    expect(screen.getByText("The token expired.")).toBeTruthy();
    expect(screen.getByRole("button", { name: /reconnect/i })).toBeTruthy();
  });

  it("asks before disconnecting and does nothing if declined", async () => {
    confirm.confirmDialog.mockResolvedValue(false);
    wrap(<AccountsPanel caps={caps()} loading={false} error={null} accounts={[accounts[2]]} />);
    fireEvent.click(screen.getByRole("button", { name: /disconnect/i }));
    await waitFor(() => expect(confirm.confirmDialog).toHaveBeenCalled());
    expect(confirm.confirmDialog.mock.calls[0][0].content).toMatch(/revoke Vireon's access/);
    expect(api.disconnectSocialAccount).not.toHaveBeenCalled();
  });

  it("disconnects once confirmed", async () => {
    confirm.confirmDialog.mockResolvedValue(true);
    api.disconnectSocialAccount.mockResolvedValue({ data: { disconnected: true, cancelledPosts: 2 } });
    wrap(<AccountsPanel caps={caps()} loading={false} error={null} accounts={[accounts[2]]} />);
    fireEvent.click(screen.getByRole("button", { name: /disconnect/i }));
    await waitFor(() => expect(api.disconnectSocialAccount).toHaveBeenCalledWith("pac-thththth"));
  });

  it("checks a connection on request", async () => {
    api.validateSocialAccount.mockResolvedValue({ data: { ok: true } });
    wrap(<AccountsPanel caps={caps()} loading={false} error={null} accounts={[accounts[0]]} />);
    fireEvent.click(screen.getByRole("button", { name: /^check$/i }));
    await waitFor(() => expect(api.validateSocialAccount).toHaveBeenCalledWith("pac-fbfbfbfb"));
  });
});

describe("AnalyticsPanel - unavailable is never shown as zero", () => {
  const analytics = (over = {}) => ({
    totals: { posts: 3, published: 2, failed: 1, scheduled: 0, cancelled: 0, inFlight: 0, successRate: 66.7 },
    byPlatform: { facebook: { published: 0 }, instagram: { published: 2 }, threads: { published: 0 } },
    timeline: [{ date: "2026-10-05", published: 2, failed: 1 }],
    metrics: {
      views: { label: "Views", available: true, value: 1200, reporting: 2, of: 2, byPlatform: { instagram: { total: 1200, reporting: 2 } } },
      likes: { label: "Likes", available: true, value: 0, reporting: 2, of: 2, byPlatform: { instagram: { total: 0, reporting: 2 } } },
      reach: { label: "Reach", available: false, value: null, reporting: 0, of: 2, reason: "Not supported for this post", byPlatform: {} },
    },
    unreportable: { note: "Link clicks are not available per post from these APIs." },
    freshness: { published: 2, neverFetched: 1, stale: 0, newestFetchedAt: null },
    topPosts: [], ...over,
  });

  it("shows real numbers, a genuine 0, and 'Not available' for what no platform reported", async () => {
    api.getSocialAnalytics.mockResolvedValue({ data: analytics() });
    wrap(<AnalyticsPanel />);
    expect((await screen.findAllByText("1,200")).length).toBeGreaterThan(0);
    const rows = screen.getAllByRole("row");
    const likes = rows.find((r) => within(r).queryByText("Likes"));
    expect(within(likes).getAllByText("0").length).toBeGreaterThan(0); // a genuine zero is shown as 0
    const reach = rows.find((r) => within(r).queryByText("Reach"));
    expect(within(reach).getByText("Not available")).toBeTruthy();
    expect(within(reach).queryAllByText("0")).toHaveLength(0); // ...but a metric nobody reported is never 0
    expect(screen.getByText("66.7%")).toBeTruthy();
    expect(screen.getByText(/Link clicks are not available/)).toBeTruthy();
  });

  it("shows a dash instead of 0% when nothing has finished, and nudges to update stale numbers", async () => {
    api.getSocialAnalytics.mockResolvedValue({ data: analytics({ totals: { posts: 1, published: 0, failed: 0, scheduled: 1, cancelled: 0, inFlight: 0, successRate: null }, metrics: {}, timeline: [], freshness: { published: 2, neverFetched: 2, stale: 0 } }) });
    wrap(<AnalyticsPanel />);
    expect(await screen.findByText("—")).toBeTruthy();
    expect(screen.getByText(/never been read/)).toBeTruthy();
  });

  it("refreshes from the platforms on request and refetches", async () => {
    api.getSocialAnalytics.mockResolvedValue({ data: analytics() });
    api.refreshSocialAnalytics.mockResolvedValue({ data: { refreshed: 2, failed: 0, skipped: 0 } });
    wrap(<AnalyticsPanel />);
    await screen.findAllByText("1,200");
    fireEvent.click(screen.getByRole("button", { name: /update from platforms/i }));
    await waitFor(() => expect(api.refreshSocialAnalytics).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(api.getSocialAnalytics.mock.calls.length).toBeGreaterThan(1));
  });

  it("shows a retry when loading fails", async () => {
    api.getSocialAnalytics.mockRejectedValue(new Error("boom"));
    wrap(<AnalyticsPanel />);
    expect(await screen.findByText("Could not load analytics")).toBeTruthy();
  });
});

describe("PostsPanel", () => {
  it("shows each destination separately with its own status, error and actions", async () => {
    api.getSocialPosts.mockResolvedValue({ data: {
      posts: [
        post(),
        post({ _id: "spo-00000002", platform: "facebook", accountLabel: "My Page", status: "FAILED", remote: {}, error: { code: "MEDIA_INVALID", message: "Facebook rejected the video", action: "Pick another file", retryable: false }, actions: { canRetry: true } }),
        post({ _id: "spo-00000003", platform: "threads", accountLabel: "Me", status: "SCHEDULED", scheduledFor: "2026-10-20T09:00:00Z", timezone: "Asia/Kolkata", remote: {}, actions: { canCancel: true, canEdit: true } }),
      ],
      pagination: { page: 1, limit: 15, total: 3, pages: 1 },
    } });
    wrap(<PostsPanel accounts={accounts} />, "/promotion/posts");
    expect(await screen.findByText("Facebook rejected the video")).toBeTruthy();
    expect(screen.getAllByText("Published").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Scheduled").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: /^retry this one$/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /^cancel$/i })).toBeTruthy();
  });

  it("retries only the failed destination", async () => {
    api.retrySocialPost.mockResolvedValue({ data: { post: post({ status: "QUEUED" }), enqueued: true } });
    api.getSocialPosts.mockResolvedValue({ data: {
      posts: [post({ _id: "spo-00000002", platform: "facebook", status: "FAILED", remote: {}, error: { code: "SERVER", message: "Temporary problem", retryable: true }, actions: { canRetry: true } })],
      pagination: { page: 1, limit: 15, total: 1, pages: 1 },
    } });
    wrap(<PostsPanel accounts={accounts} />, "/promotion/posts");
    fireEvent.click(await screen.findByRole("button", { name: /^retry this one$/i }));
    await waitFor(() => expect(api.retrySocialPost).toHaveBeenCalledWith("spo-00000002"));
    expect(api.retrySocialPost).toHaveBeenCalledTimes(1);
  });

  it("makes the user confirm that an unconfirmed post is not on the platform before retrying it", async () => {
    confirm.confirmDialog.mockResolvedValue(false);
    api.getSocialPosts.mockResolvedValue({ data: {
      posts: [post({ status: "FAILED", remote: {}, error: { code: "OUTCOME_UNKNOWN", message: "Unclear", retryable: false }, actions: { canRetryUnknown: true } })],
      pagination: { page: 1, limit: 15, total: 1, pages: 1 },
    } });
    wrap(<PostsPanel accounts={accounts} />, "/promotion/posts");
    expect(screen.queryByRole("button", { name: /^retry this one$/i })).toBeNull();
    fireEvent.click(await screen.findByRole("button", { name: /^it isn't posted - retry$/i }));
    await waitFor(() => expect(confirm.confirmDialog).toHaveBeenCalled());
    expect(confirm.confirmDialog.mock.calls[0][0].content).toMatch(/twice/);
    expect(api.retrySocialPost).not.toHaveBeenCalled();
  });

  it("filters by platform and status on the server, and shows an empty state", async () => {
    api.getSocialPosts.mockResolvedValue({ data: { posts: [], pagination: { page: 1, limit: 15, total: 0, pages: 1 } } });
    wrap(<PostsPanel accounts={accounts} />, "/promotion/posts");
    expect(await screen.findByText(/Nothing posted yet/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Failed" }));
    await waitFor(() => expect(api.getSocialPosts).toHaveBeenLastCalledWith(expect.objectContaining({ status: "FAILED", page: 1 })));
    expect(await screen.findByText(/No posts match these filters/)).toBeTruthy();
  });

  it("shows a retry when loading fails", async () => {
    api.getSocialPosts.mockRejectedValue(new Error("boom"));
    wrap(<PostsPanel accounts={accounts} />, "/promotion/posts");
    expect(await screen.findByText("Could not load posts")).toBeTruthy();
  });
});

describe("SchedulePicker", () => {
  it("shows exactly which UTC instant the chosen wall-clock time is", () => {
    wrap(<SchedulePicker mode="schedule" onMode={vi.fn()} onChange={vi.fn()} value={{ localDateTime: "2026-10-20T14:30", timezone: "Asia/Kolkata" }} />);
    expect(screen.getByText(/2026-10-20T09:00:00Z UTC/)).toBeTruthy();
    expect(screen.getByText(/even if this tab is closed/)).toBeTruthy();
  });

  it("shows the server's reason when the time is rejected, and nothing extra for 'now'", () => {
    wrap(<SchedulePicker mode="schedule" onMode={vi.fn()} onChange={vi.fn()} error="Schedule at least 2 minute(s) from now." value={{ localDateTime: "2020-01-01T10:00", timezone: "UTC" }} />);
    expect(screen.getByText("Schedule at least 2 minute(s) from now.")).toBeTruthy();
    cleanup();
    wrap(<SchedulePicker mode="now" onMode={vi.fn()} onChange={vi.fn()} value={{ localDateTime: "", timezone: "UTC" }} />);
    expect(screen.queryByLabelText("Date and time")).toBeNull();
  });
});

describe("CopyEditor and preview", () => {
  it("lets every field be edited manually and keeps a hashtag list", () => {
    const onChange = vi.fn();
    wrap(<CopyEditor platform="instagram" value={{ caption: "Hi", hashtags: [], cta: "", linkUrl: "", origin: "ai" }} onChange={onChange} composed={{ length: 2, limit: 2200, hashtagCount: 0 }} />);
    expect(screen.getByText(/Written by local AI/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Caption"), { target: { value: "Hello there" } });
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ caption: "Hello there", origin: "manual" }));
    fireEvent.change(screen.getByLabelText("Hashtags"), { target: { value: "#learn javascript" } });
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ hashtags: ["#learn", "#javascript"] }));
    expect(screen.getByText(/not clickable/)).toBeTruthy();
  });

  it("turns the character counter red over the limit", () => {
    wrap(<CopyEditor platform="threads" value={{ caption: "x", hashtags: [], cta: "", linkUrl: "", origin: "manual" }} onChange={vi.fn()} composed={{ length: 512, limit: 500, hashtagCount: 0 }} />);
    expect(screen.getByText("512 / 500").className).toMatch(/danger/);
  });

  it("previews the exact composed text, the format and a disclaimer that it is an approximation", () => {
    wrap(<PlatformPreview platform="threads" account={accounts[2]} campaign={{ media: null }} result={{ ok: true, format: "text", composed: { text: "Hello #js https://e.test", length: 23, limit: 500, hashtagCount: 1, linkCount: 1 } }} />);
    expect(screen.getByTestId("platform-preview").textContent).toContain("Hello #js https://e.test");
    expect(screen.getByText("Text post")).toBeTruthy();
    expect(screen.getByText(/not the live Threads interface/)).toBeTruthy();
    expect(screen.getByText("23 / 500")).toBeTruthy();
  });
});

describe("CreatePanel - the full flow", () => {
  const campaign = {
    _id: "cam-00000001", title: "How closures work", source: { videoJobId: "job-aaaaaaaa", title: "How closures work", description: "A short explainer" },
    brief: { tone: "casual", cta: "Watch now", destinationUrl: "https://e.test/v" }, variants: {},
    media: { kind: "video", size: 5_000_000, contentType: "video/mp4", durationSec: 30, width: 1080, height: 1920, measured: "record", previewPath: "/vireon-video/job-aaaaaaaa/final.mp4" },
  };
  const okValidation = (ids) => ({ ok: true, schedule: [], results: ids.map((id) => {
    const a = accounts.find((x) => x._id === id);
    return { accountId: id, platform: a.platform, accountLabel: a.displayName, ok: true, format: a.platform === "threads" ? "video" : "reel", errors: [], warnings: [], composed: { text: "How closures work\n\nA short explainer\n\nWatch now", length: 44, limit: a.platform === "threads" ? 500 : 2200, hashtagCount: 0, linkCount: 0 } };
  }) });

  const mount = (route = "/promotion/create?campaign=cam-00000001") => {
    api.getSocialLibrary.mockResolvedValue({ data: { videos: [{ videoJobId: "job-aaaaaaaa", title: "How closures work", durationSec: 30, aspectRatio: "9:16", thumbnailUrl: "" }], lessons: [] } });
    api.getCampaign.mockResolvedValue({ data: { campaign, posts: [], summary: {} } });
    api.updateCampaign.mockResolvedValue({ data: { campaign } });
    api.validateCampaign.mockImplementation(async (id, body) => ({ data: okValidation(body.destinations.map((d) => d.accountId)) }));
    return wrap(<CreatePanel caps={caps()} accounts={accounts} />, route);
  };

  it("creates the promotion when a library video is picked", async () => {
    api.createCampaign.mockResolvedValue({ data: { campaign } });
    api.getCampaign.mockResolvedValue({ data: { campaign, posts: [], summary: {} } });
    api.getSocialLibrary.mockResolvedValue({ data: { videos: [{ videoJobId: "job-aaaaaaaa", title: "How closures work", durationSec: 30, aspectRatio: "9:16" }], lessons: [] } });
    wrap(<CreatePanel caps={caps()} accounts={accounts} />, "/promotion/create");
    fireEvent.click(await screen.findByRole("button", { name: /how closures work/i }));
    await waitFor(() => expect(api.createCampaign).toHaveBeenCalledWith(expect.objectContaining({ videoJobId: "job-aaaaaaaa" })));
  });

  it("will not post until the account is chosen and the server says the post is ready; then asks before posting", async () => {
    confirm.confirmDialog.mockResolvedValue(true);
    api.publishCampaign.mockResolvedValue({ data: { created: 2, failed: 0, results: [
      { accountId: "pac-igigigig", platform: "instagram", ok: true, post: post({ _id: "spo-1", status: "QUEUED" }) },
      { accountId: "pac-thththth", platform: "threads", ok: true, post: post({ _id: "spo-2", platform: "threads", status: "QUEUED" }) },
    ] } });
    mount();

    const publish = () => screen.getByRole("button", { name: /post to \d+ account|schedule \d+ post/i });
    await screen.findByText("Where to post");
    expect(screen.queryByRole("button", { name: /post to \d+ account/i })).toBeTruthy();
    expect(publish().disabled).toBe(true); // nothing chosen

    fireEvent.click(screen.getByLabelText("Post to My IG"));
    fireEvent.click(screen.getByLabelText("Post to Me"));
    await waitFor(() => expect(api.validateCampaign).toHaveBeenCalled());
    await waitFor(() => expect(publish().disabled).toBe(false));
    expect(api.publishCampaign).not.toHaveBeenCalled(); // choosing and checking never posts

    fireEvent.click(publish());
    await waitFor(() => expect(confirm.confirmDialog).toHaveBeenCalledTimes(1));
    const { content } = confirm.confirmDialog.mock.calls[0][0];
    expect(content).toContain("My IG");
    expect(content).toContain("Me");
    await waitFor(() => expect(api.publishCampaign).toHaveBeenCalledTimes(1));
    const [id, body] = api.publishCampaign.mock.calls[0];
    expect(id).toBe("cam-00000001");
    expect(body).toMatchObject({ mode: "now" });
    expect(body.destinations.map((d) => d.accountId)).toEqual(["pac-igigigig", "pac-thththth"]);
    // the posted copy is the copy that was previewed
    expect(body.destinations[0].content).toMatchObject({ caption: "How closures work\n\nA short explainer", cta: "Watch now" });
    expect(await screen.findByText("Results")).toBeTruthy();
  });

  it("posts nothing when the confirmation is declined", async () => {
    confirm.confirmDialog.mockResolvedValue(false);
    mount();
    await screen.findByText("Where to post");
    fireEvent.click(screen.getByLabelText("Post to Me"));
    const publish = () => screen.getByRole("button", { name: /post to 1 account/i });
    await waitFor(() => expect(publish().disabled).toBe(false));
    fireEvent.click(publish());
    await waitFor(() => expect(confirm.confirmDialog).toHaveBeenCalled());
    expect(api.publishCampaign).not.toHaveBeenCalled();
  });

  it("blocks publishing and shows the platform's own reasons when validation fails", async () => {
    mount();
    api.validateCampaign.mockResolvedValue({ data: { ok: false, schedule: [], results: [{
      accountId: "pac-thththth", platform: "threads", accountLabel: "Me", ok: false, format: "video", warnings: [],
      errors: [{ code: "PUBLIC_MEDIA_UNAVAILABLE", level: "error", message: "Threads downloads media from a public https URL, and this server has none configured." }],
      composed: { text: "x", length: 1, limit: 500, hashtagCount: 0, linkCount: 0 },
    }] } });
    await screen.findByText("Where to post");
    fireEvent.click(screen.getByLabelText("Post to Me"));
    expect(await screen.findByText(/has none configured/)).toBeTruthy();
    expect(screen.getByText("Needs changes")).toBeTruthy();
    expect(screen.getByRole("button", { name: /post to 1 account/i }).disabled).toBe(true);
  });

  it("reports a partially created result per destination, with the reason for the one not created", async () => {
    confirm.confirmDialog.mockResolvedValue(true);
    api.publishCampaign.mockResolvedValue({ data: { created: 1, failed: 1, results: [
      { accountId: "pac-igigigig", platform: "instagram", ok: true, post: post({ _id: "spo-1", status: "QUEUED" }) },
      { accountId: "pac-thththth", platform: "threads", ok: false, code: "DUPLICATE", message: "This promotion already has a post in progress for this account (QUEUED)." },
    ] } });
    mount();
    await screen.findByText("Where to post");
    fireEvent.click(screen.getByLabelText("Post to My IG"));
    fireEvent.click(screen.getByLabelText("Post to Me"));
    const publish = () => screen.getByRole("button", { name: /post to 2 accounts/i });
    await waitFor(() => expect(publish().disabled).toBe(false));
    fireEvent.click(publish());
    expect(await screen.findByText("Not created")).toBeTruthy();
    expect(screen.getByText(/already has a post in progress/)).toBeTruthy();
  });

  it("falls back to manual writing, with a clear notice, when the local AI is unavailable", async () => {
    mount();
    api.generateCampaignCopy.mockRejectedValue(Object.assign(new Error("x"), { friendlyMessage: "The local AI could not write captions right now.", response: { status: 503 } }));
    await screen.findByText("Where to post");
    fireEvent.click(screen.getByLabelText("Post to Me"));
    fireEvent.click(await screen.findByRole("button", { name: /write with local ai/i }));
    expect(await screen.findByText("The local AI could not write captions")).toBeTruthy();
    expect(screen.getByText(/write them by hand/i)).toBeTruthy();
    // the caption stays editable
    const caption = screen.getByLabelText("Post text");
    fireEvent.change(caption, { target: { value: "My own words" } });
    expect(screen.getByDisplayValue("My own words")).toBeTruthy();
  });

  it("fills in AI copy per platform and marks it as AI-written but editable", async () => {
    mount();
    api.generateCampaignCopy.mockResolvedValue({ data: {
      generated: ["threads"], missing: [],
      campaign: { ...campaign, variants: { threads: { caption: "A closure remembers where it was born.", hashtags: ["#js"], cta: "Watch", linkUrl: "", origin: "ai" } } },
    } });
    await screen.findByText("Where to post");
    fireEvent.click(screen.getByLabelText("Post to Me"));
    fireEvent.click(await screen.findByRole("button", { name: /write with local ai/i }));
    await waitFor(() => expect(api.generateCampaignCopy).toHaveBeenCalledWith("cam-00000001", { platforms: ["threads"], tone: "casual" }));
    expect(await screen.findByDisplayValue("A closure remembers where it was born.")).toBeTruthy();
    expect(screen.getAllByText(/Written by local AI/).length).toBeGreaterThan(0);
  });

  it("shows accounts that need reconnecting as unavailable choices", async () => {
    api.getSocialLibrary.mockResolvedValue({ data: { videos: [], lessons: [] } });
    api.getCampaign.mockResolvedValue({ data: { campaign, posts: [], summary: {} } });
    wrap(<CreatePanel caps={caps()} accounts={[acct({ status: "needs_reauth", statusReason: "Token expired" })]} />);
    const box = await screen.findByLabelText("Post to My Page");
    expect(box.disabled).toBe(true);
    expect(screen.getByText("Token expired")).toBeTruthy();
  });
});
