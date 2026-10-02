// Explicit React import: the test transform here does not apply the
// automatic JSX runtime the app build uses.
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, act } from "@testing-library/react";

// A controllable stand-in for the socket module, so the lifecycle can be
// tested without a server: statusListeners lets a test drive a
// disconnect/reconnect, which is the behaviour most likely to regress.
const socketMock = vi.hoisted(() => {
  let status = "disconnected";
  const listeners = new Set();
  return {
    connect: vi.fn(),
    getConnectionStatus: () => status,
    subscribeToConnectionStatus: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    _setStatus(next) {
      status = next;
      listeners.forEach((l) => l());
    },
    _reset() {
      status = "disconnected";
      listeners.clear();
    },
  };
});

vi.mock("../services/socket", () => socketMock);

const { useSocketRoom } = await import("./useSocketRoom");

/** Renders the hook and exposes the status it returned. */
function renderRoom(roomId, handlers) {
  const seen = { status: null };
  const Probe = ({ id, ...rest }) => {
    seen.status = useSocketRoom(id, rest);
    return null;
  };
  const utils = render(<Probe id={roomId} {...handlers} />);
  return { seen, ...utils };
}

describe("useSocketRoom", () => {
  beforeEach(() => socketMock._reset());

  it("connects, joins the room and subscribes on mount", () => {
    const join = vi.fn();
    const subscribe = vi.fn(() => []);

    renderRoom("course-1", { join, leave: vi.fn(), subscribe });

    expect(socketMock.connect).toHaveBeenCalled();
    expect(join).toHaveBeenCalledWith("course-1");
    expect(subscribe).toHaveBeenCalledWith("course-1");
  });

  it("does nothing at all without a room id", () => {
    const join = vi.fn();
    const subscribe = vi.fn(() => []);

    renderRoom(null, { join, leave: vi.fn(), subscribe });

    expect(join).not.toHaveBeenCalled();
    expect(subscribe).not.toHaveBeenCalled();
  });

  it("leaves the room AND unsubscribes every listener on unmount", () => {
    // The regression this guards: two of the three hooks this replaced
    // only tore listeners down when the id changed, never on unmount, so
    // navigating away left handlers subscribed for the life of the tab.
    const leave = vi.fn();
    const off1 = vi.fn();
    const off2 = vi.fn();

    const { unmount } = renderRoom("job-1", {
      join: vi.fn(),
      leave,
      subscribe: () => [off1, off2],
    });

    unmount();

    expect(leave).toHaveBeenCalledWith("job-1");
    expect(off1).toHaveBeenCalled();
    expect(off2).toHaveBeenCalled();
  });

  it("re-joins and resyncs when the socket reconnects", () => {
    const join = vi.fn();
    const onReconnect = vi.fn();

    renderRoom("job-1", { join, leave: vi.fn(), subscribe: () => [], onReconnect });
    join.mockClear();

    act(() => socketMock._setStatus("connected"));

    // Rooms are not restored automatically after a drop.
    expect(join).toHaveBeenCalledWith("job-1");
    expect(onReconnect).toHaveBeenCalledWith("job-1");
  });

  it("does not resync on a non-connected status change", () => {
    const onReconnect = vi.fn();
    renderRoom("job-1", { join: vi.fn(), leave: vi.fn(), subscribe: () => [], onReconnect });

    act(() => socketMock._setStatus("reconnecting"));

    expect(onReconnect).not.toHaveBeenCalled();
  });

  it("reports the socket's status, including changes", () => {
    const { seen } = renderRoom("job-1", { join: vi.fn(), leave: vi.fn(), subscribe: () => [] });

    expect(seen.status).toBe("disconnected");

    act(() => socketMock._setStatus("connected"));
    expect(seen.status).toBe("connected");

    act(() => socketMock._setStatus("reconnecting"));
    expect(seen.status).toBe("reconnecting");
  });

  it("switches rooms cleanly when the id changes", () => {
    const join = vi.fn();
    const leave = vi.fn();
    const off = vi.fn();

    const Probe = ({ id }) => {
      useSocketRoom(id, { join, leave, subscribe: () => [off] });
      return null;
    };
    const { rerender } = render(<Probe id="job-1" />);
    rerender(<Probe id="job-2" />);

    expect(leave).toHaveBeenCalledWith("job-1");
    expect(off).toHaveBeenCalled();
    expect(join).toHaveBeenCalledWith("job-2");
  });

  it("does not resubscribe when only the handler identities change", () => {
    // The previous hooks listed their fetch callbacks as effect
    // dependencies, so every new inline closure tore down and rebuilt
    // every listener.
    const subscribe = vi.fn(() => []);
    const Probe = ({ id, tag }) => {
      useSocketRoom(id, { join: vi.fn(), leave: vi.fn(), subscribe, onReconnect: () => tag });
      return null;
    };

    const { rerender } = render(<Probe id="job-1" tag="a" />);
    rerender(<Probe id="job-1" tag="b" />);
    rerender(<Probe id="job-1" tag="c" />);

    expect(subscribe).toHaveBeenCalledTimes(1);
  });

  it("calls the latest handler, not the one captured at subscribe time", () => {
    // The flip side of not resubscribing: handlers must be read through a
    // ref, or this would be a stale-closure bug.
    const first = vi.fn();
    const second = vi.fn();

    const Probe = ({ onReconnect }) => {
      useSocketRoom("job-1", { join: vi.fn(), leave: vi.fn(), subscribe: () => [], onReconnect });
      return null;
    };

    const { rerender } = render(<Probe onReconnect={first} />);
    rerender(<Probe onReconnect={second} />);

    act(() => socketMock._setStatus("connected"));

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledWith("job-1");
  });
});
