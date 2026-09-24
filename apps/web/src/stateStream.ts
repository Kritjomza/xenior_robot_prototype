import type { RobotState } from "./generated/state";

export type Connection = "connecting" | "connected" | "disconnected";

function isState(value: unknown): value is RobotState {
  if (!value || typeof value !== "object") return false;
  const state = value as Record<string, unknown>;
  const number = (v: unknown): v is number =>
    typeof v === "number" && Number.isFinite(v);
  const count = (v: unknown) => number(v) && Number.isInteger(v) && v >= 0;
  const text = (v: unknown) => v === null || typeof v === "string";
  return (
    state.version === 1 &&
    (state.mode === "mock" || state.mode === "robodk") &&
    typeof state.connected === "boolean" &&
    typeof state.status === "string" &&
    ["idle", "running", "stopping", "completed", "stopped", "faulted"].includes(
      state.status,
    ) &&
    count(state.revision) &&
    count(state.completed_commands) &&
    count(state.total_commands) &&
    number(state.x_mm) &&
    number(state.y_mm) &&
    number(state.z_mm) &&
    number(state.speed_mm_s) &&
    state.speed_mm_s > 0 &&
    Array.isArray(state.joints_deg) &&
    state.joints_deg.length === 3 &&
    state.joints_deg.every(number) &&
    ["released", "gripped"].includes(state.gripper as string) &&
    [
      "run_id",
      "program_name",
      "active_command_id",
      "active_command_type",
      "error",
    ].every((key) => text(state[key]))
  );
}

export function connectStateStream({
  url,
  onState,
  onConnection,
}: {
  url: string;
  onState: (state: RobotState) => void;
  onConnection: (connection: Connection) => void;
}): () => void {
  let disposed = false;
  let socket: WebSocket | null = null;
  let retry: ReturnType<typeof setTimeout> | undefined;
  let watchdog: ReturnType<typeof setTimeout> | undefined;
  let delay = 1000;

  function open() {
    if (disposed) return;
    let live = true;
    let current: WebSocket;
    function lost() {
      if (!live || disposed) return;
      live = false;
      clearTimeout(watchdog);
      onConnection("disconnected");
      if (current) {
        current.onopen =
          current.onmessage =
          current.onerror =
          current.onclose =
            null;
        current.close();
      }
      retry = setTimeout(open, delay);
      delay = Math.min(delay * 2, 10000);
    }
    function armWatchdog() {
      clearTimeout(watchdog);
      watchdog = setTimeout(lost, 15000);
    }
    try {
      current = new WebSocket(url);
      socket = current;
      armWatchdog();
      current.onopen = armWatchdog;
      current.onclose = lost;
      current.onerror = lost;
      current.onmessage = (event) => {
        if (!live || disposed) return;
        try {
          const state: unknown = JSON.parse(String(event.data));
          if (!isState(state)) {
            lost();
            return;
          }
          delay = 1000;
          armWatchdog();
          onState(state);
          onConnection("connected");
        } catch {
          lost();
        }
      };
    } catch {
      lost();
    }
  }
  open();
  return () => {
    disposed = true;
    clearTimeout(retry);
    clearTimeout(watchdog);
    if (socket) {
      socket.onopen = socket.onmessage = socket.onerror = socket.onclose = null;
      socket.close();
    }
  };
}
