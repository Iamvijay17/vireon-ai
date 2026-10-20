import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";

vi.mock("../../services/api", () => ({ getVideoJob: vi.fn() }));
vi.mock("../../services/socket", () => ({
  connect: vi.fn(), joinJobRoom: vi.fn(), leaveJobRoom: vi.fn(), isConnected: () => false,
  onJobProgress: () => () => {}, onJobCompleted: () => () => {}, onJobFailed: () => () => {},
  onConnect: () => () => {}, onDisconnect: () => () => {}, onJobStatus: () => () => {},
}));
vi.mock("../../components/ui/toastBus", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import { getVideoJob } from "../../services/api";
import { useStudioJob } from "./useStudioJob";

beforeEach(() => vi.clearAllMocks());

describe("useStudioJob load failures", () => {
  it("keeps the failure so the page can tell an unreachable API from a deleted project", async () => {
    const err = Object.assign(new Error("Network Error"), { friendlyMessage: "Cannot reach the server" });
    getVideoJob.mockRejectedValue(err);
    const { result } = renderHook(() => useStudioJob("job-1", vi.fn()));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.job).toBeNull();
    expect(result.current.loadError).toBe(err);
  });

  it("retry loads the job and clears the error", async () => {
    const onLoaded = vi.fn();
    getVideoJob.mockRejectedValueOnce(new Error("boom"));
    const { result } = renderHook(() => useStudioJob("job-1", onLoaded));
    await waitFor(() => expect(result.current.loadError).not.toBeNull());

    getVideoJob.mockResolvedValue({ data: { job: { _id: "job-1", script: { scenes: [{ sceneNumber: 1 }] } } } });
    await act(async () => { await result.current.retry(); });
    await waitFor(() => expect(result.current.job?._id).toBe("job-1"));
    expect(result.current.loadError).toBeNull();
    expect(onLoaded).toHaveBeenCalledWith([{ sceneNumber: 1 }]);
  });
});
