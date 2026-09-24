import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { connectStateStream } from "./stateStream";
import { FakeSocket } from "./test/FakeSocket";
import { initialState } from "./test/state";

describe("live state connection", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    FakeSocket.instances = [];
    vi.stubGlobal("WebSocket", FakeSocket);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("publishes validated state, marks disconnect, and reconnects with a fresh snapshot", () => {
    const onState = vi.fn();
    const onConnection = vi.fn();
    const dispose = connectStateStream({
      url: "ws://localhost/state",
      onState,
      onConnection,
    });
    const first = FakeSocket.instances[0];
    first.open();
    first.message(initialState);
    expect(onState).toHaveBeenLastCalledWith(initialState);
    expect(onConnection).toHaveBeenLastCalledWith("connected");
    first.close();
    expect(onConnection).toHaveBeenLastCalledWith("disconnected");
    vi.advanceTimersByTime(1000);
    expect(FakeSocket.instances).toHaveLength(2);
    const second = FakeSocket.instances[1];
    second.open();
    second.message({ ...initialState, revision: 0, x_mm: 50 });
    expect(onState).toHaveBeenLastCalledWith(
      expect.objectContaining({ x_mm: 50 }),
    );
    expect(onConnection).toHaveBeenLastCalledWith("connected");
    dispose();
    vi.advanceTimersByTime(30000);
    expect(FakeSocket.instances).toHaveLength(2);
    expect(second.closed).toBe(true);
  });

  it("rejects malformed telemetry and never presents it as connected", () => {
    const onState = vi.fn();
    const onConnection = vi.fn();
    const dispose = connectStateStream({
      url: "ws://localhost/state",
      onState,
      onConnection,
    });
    FakeSocket.instances[0].message({ mode: "robot", x_mm: "broken" });
    expect(onState).not.toHaveBeenCalled();
    expect(onConnection).toHaveBeenLastCalledWith("disconnected");
    dispose();
  });

  it("accepts RoboDK telemetry as live state", () => {
    const onState = vi.fn();
    const onConnection = vi.fn();
    const dispose = connectStateStream({ url: "ws://localhost/state", onState, onConnection });
    FakeSocket.instances[0].open();
    FakeSocket.instances[0].message({ ...initialState, mode: "robodk", z_mm: -426 });
    expect(onState).toHaveBeenCalledWith(expect.objectContaining({ mode: "robodk", z_mm: -426 }));
    expect(onConnection).toHaveBeenLastCalledWith("connected");
    dispose();
  });

  it("detects a silent connection and ignores obsolete socket events", () => {
    const onState = vi.fn();
    const onConnection = vi.fn();
    const dispose = connectStateStream({
      url: "ws://localhost/state",
      onState,
      onConnection,
    });
    const first = FakeSocket.instances[0];
    first.message(initialState);
    const staleHandler = first.onmessage;
    vi.advanceTimersByTime(15000);
    expect(onConnection).toHaveBeenLastCalledWith("disconnected");
    vi.advanceTimersByTime(1000);
    staleHandler?.({ data: JSON.stringify({ ...initialState, x_mm: 999 }) });
    expect(onState).toHaveBeenCalledTimes(1);
    dispose();
  });

  it("backs off failed reconnect attempts without creating duplicate sockets", () => {
    const dispose = connectStateStream({
      url: "ws://localhost/state",
      onState: vi.fn(),
      onConnection: vi.fn(),
    });
    FakeSocket.instances[0].onerror?.();
    FakeSocket.instances[0].close();
    vi.advanceTimersByTime(1000);
    expect(FakeSocket.instances).toHaveLength(2);
    FakeSocket.instances[1].close();
    vi.advanceTimersByTime(1999);
    expect(FakeSocket.instances).toHaveLength(2);
    vi.advanceTimersByTime(1);
    expect(FakeSocket.instances).toHaveLength(3);
    dispose();
  });
});
