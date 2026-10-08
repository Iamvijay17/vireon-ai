import { describe, it, expect, vi, beforeEach } from "vitest";

// A minimal emitter standing in for the socket.io client, so the module's
// de-duplication / staleness rules can be driven with hand-built payloads.
const fake = vi.hoisted(() => {
  const handlers = new Map();
  const socket = {
    connected: false,
    emit: vi.fn(),
    connect: vi.fn(),
    disconnect: vi.fn(),
    removeAllListeners: vi.fn(),
    on(name, fn) {
      if (!handlers.has(name)) handlers.set(name, new Set());
      handlers.get(name).add(fn);
    },
    off(name, fn) {
      handlers.get(name)?.delete(fn);
    },
    io: { on: vi.fn(), removeAllListeners: vi.fn() },
    // Deliver one payload to every listener, in registration order - the same
    // object reference each time, like socket.io does.
    deliver(name, payload) {
      handlers.get(name)?.forEach((fn) => fn(payload));
    },
  };
  return { socket, ioFactory: vi.fn(() => socket) };
});

vi.mock("socket.io-client", () => ({ io: fake.ioFactory }));

const api = await import("./socket");

const progress = (seq, extra = {}) => ({
  jobId: "job-1", seq, eventId: `evt-${seq}`, progress: seq * 10, status: "GENERATING_AUDIO", ...extra,
});

describe("socket module", () => {
  beforeEach(() => {
    fake.socket.emit.mockClear();
    api.leaveJobRoom("job-1"); // forget dedupe + replay state between tests
    fake.socket.emit.mockClear();
  });

  it("creates exactly one socket, with unbounded backoff-ed reconnection and a client id", () => {
    expect(fake.ioFactory).toHaveBeenCalledTimes(1);
    const options = fake.ioFactory.mock.calls[0][1];
    expect(options.reconnectionAttempts).toBe(Infinity);
    expect(options.reconnectionDelayMax).toBeGreaterThanOrEqual(5000);
    expect(options.randomizationFactor).toBeGreaterThan(0);
    expect(options.auth.clientId).toBeTruthy();
  });

  it("delivers an event once even if the same eventId arrives twice (live + replay)", () => {
    const cb = vi.fn();
    const off = api.onJobProgress(cb);

    fake.socket.deliver("jobProgress", progress(3));
    fake.socket.deliver("jobProgress", progress(3)); // replayed copy

    expect(cb).toHaveBeenCalledTimes(1);
    off();
  });

  it("drops a state event older than one already applied", () => {
    const cb = vi.fn();
    const off = api.onJobProgress(cb);

    fake.socket.deliver("jobProgress", progress(5));
    fake.socket.deliver("jobProgress", progress(4)); // late straggler

    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb.mock.calls[0][0].seq).toBe(5);
    off();
  });

  it("ignores a stale jobStatus snapshot but applies a current one", () => {
    const cb = vi.fn();
    const off = api.onJobStatus(cb);

    fake.socket.deliver("jobProgress", progress(8));
    fake.socket.deliver("jobStatus", { jobId: "job-1", seq: 6, eventId: "status:6", progress: 60 });
    expect(cb).not.toHaveBeenCalled();

    fake.socket.deliver("jobStatus", { jobId: "job-1", seq: 8, eventId: "status:8", progress: 80 });
    expect(cb).toHaveBeenCalledTimes(1);
    off();
  });

  it("applies the join snapshot and a getStatus snapshot of the same state only once", () => {
    const cb = vi.fn();
    const off = api.onJobStatus(cb);
    const snapshot = { jobId: "job-1", seq: 8, eventId: "status:job-1:8:t", progress: 80 };

    fake.socket.deliver("jobStatus", { ...snapshot });
    fake.socket.deliver("jobStatus", { ...snapshot });

    expect(cb).toHaveBeenCalledTimes(1);
    off();
  });

  it("does not drop an out-of-order sceneAudioReady (discrete events are not 'state')", () => {
    const cb = vi.fn();
    const off = api.onSceneAudioReady(cb);

    fake.socket.deliver("jobProgress", progress(9));
    fake.socket.deliver("sceneAudioReady", { jobId: "job-1", seq: 7, eventId: "evt-7", sceneNumber: 2 });

    expect(cb).toHaveBeenCalledTimes(1);
    off();
  });

  it("passes through events that have no identity at all (persistence failed server-side)", () => {
    const cb = vi.fn();
    const off = api.onJobProgress(cb);

    fake.socket.deliver("jobProgress", { jobId: "job-1", progress: 10 });
    fake.socket.deliver("jobProgress", { jobId: "job-1", progress: 20 });

    expect(cb).toHaveBeenCalledTimes(2);
    off();
  });

  it("asks only for what it missed when re-joining, and starts fresh after leaving", () => {
    fake.socket.deliver("jobProgress", progress(4));

    api.joinJobRoom("job-1");
    expect(fake.socket.emit).toHaveBeenLastCalledWith("join", { jobId: "job-1", sinceSeq: 4 });

    api.leaveJobRoom("job-1");
    api.joinJobRoom("job-1");
    expect(fake.socket.emit).toHaveBeenLastCalledWith("join", "job-1");
  });

  it("does not advance the replay cursor from a snapshot's seq", () => {
    // The snapshot says the timeline was at seq 9; that does not mean events
    // 5-9 were delivered, so a later re-join must still ask from 4.
    fake.socket.deliver("jobProgress", progress(4));
    fake.socket.deliver("jobStatus", { jobId: "job-1", seq: 9, eventId: "status:9" });

    api.joinJobRoom("job-1");
    expect(fake.socket.emit).toHaveBeenLastCalledWith("join", { jobId: "job-1", sinceSeq: 4 });
  });

  it("unsubscribes its listener", () => {
    const cb = vi.fn();
    const off = api.onJobProgress(cb);
    off();

    fake.socket.deliver("jobProgress", progress(1));
    expect(cb).not.toHaveBeenCalled();
  });
});
