// Explicit React import: the test transform here does not apply the automatic JSX runtime.
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  INITIAL_BACKEND_STATE,
  nextBackendState,
  nextCheckDelay,
  probeBackend,
  useBackendStatus,
} from "./useBackendStatus";

vi.mock("../services/api", () => ({ getHealth: vi.fn() }));
import { getHealth } from "../services/api";

globalThis.React = React;

const FAIL = { ok: false, kind: "unreachable" };

describe("nextBackendState", () => {
  it("stays up through a single missed check", () => {
    const up = nextBackendState(INITIAL_BACKEND_STATE, { ok: true }, 1);
    const after = nextBackendState(up, FAIL, 2);
    expect(after.status).toBe("up");
    expect(after.failures).toBe(1);
  });

  it("goes down after consecutive failures and remembers since when", () => {
    let s = nextBackendState(INITIAL_BACKEND_STATE, { ok: true }, 1);
    s = nextBackendState(s, FAIL, 2);
    s = nextBackendState(s, FAIL, 3);
    expect(s).toMatchObject({ status: "down", kind: "unreachable", downSince: 3 });
    s = nextBackendState(s, { ok: false, kind: "restarting" }, 4);
    expect(s).toMatchObject({ status: "down", kind: "restarting", downSince: 3 });
  });

  it("clears everything on recovery", () => {
    let s = nextBackendState(INITIAL_BACKEND_STATE, FAIL, 1);
    s = nextBackendState(s, FAIL, 2);
    s = nextBackendState(s, { ok: true }, 3);
    expect(s).toMatchObject({ status: "up", failures: 0, kind: null, downSince: null });
  });

  it("does not call the server down on a single miss", () => {
    expect(nextBackendState(INITIAL_BACKEND_STATE, FAIL, 1).status).toBe("unknown");
  });
});

describe("nextCheckDelay", () => {
  it("polls slowly when healthy and quickly while failing, capped", () => {
    const healthy = nextCheckDelay({ failures: 0 });
    const first = nextCheckDelay({ failures: 1 });
    const many = nextCheckDelay({ failures: 99 });
    expect(first).toBeLessThan(healthy);
    expect(many).toBeGreaterThanOrEqual(first);
    expect(many).toBeLessThanOrEqual(10_000);
  });
});

describe("probeBackend", () => {
  beforeEach(() => { getHealth.mockReset(); });

  it("is ok when /health answers", async () => {
    getHealth.mockResolvedValue({ data: { status: "ok" } });
    expect(await probeBackend()).toEqual({ ok: true });
  });

  it("treats a network error as unreachable", async () => {
    getHealth.mockRejectedValue(new Error("Network Error"));
    expect(await probeBackend()).toMatchObject({ ok: false, kind: "unreachable" });
  });

  it("treats a gateway 502 as restarting", async () => {
    getHealth.mockRejectedValue({ response: { status: 502 } });
    expect(await probeBackend()).toMatchObject({ ok: false, kind: "restarting", status: 502 });
  });

  it("counts a non-5xx answer as alive", async () => {
    getHealth.mockRejectedValue({ response: { status: 404 } });
    expect(await probeBackend()).toEqual({ ok: true });
  });
});

describe("useBackendStatus", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const setup = (probe) => {
    const queryClient = new QueryClient();
    const spy = vi.spyOn(queryClient, "invalidateQueries");
    const wrapper = ({ children }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
    return { spy, ...renderHook(() => useBackendStatus(probe), { wrapper }) };
  };

  it("goes down after two failures, then recovers and refetches queries", async () => {
    let healthy = false;
    const probe = vi.fn(async () => (healthy ? { ok: true } : FAIL));
    const { result, spy } = setup(probe);

    await act(async () => {}); // first check fails
    expect(result.current.status).toBe("unknown");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_000); // second check fails
    });
    expect(result.current.status).toBe("down");
    expect(spy).not.toHaveBeenCalled();

    healthy = true;
    await act(async () => {
      result.current.retry();
    });
    expect(result.current.status).toBe("up");
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("stops polling after unmount", async () => {
    const probe = vi.fn(async () => ({ ok: true }));
    const { unmount } = setup(probe);
    await act(async () => {});
    const calls = probe.mock.calls.length;
    unmount();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(probe.mock.calls.length).toBe(calls);
  });
});
