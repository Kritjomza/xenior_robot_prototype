import { useRef, useState } from "react";
import sample from "../../../protocol/examples/pick-and-place.json";
import { parseProgram, post } from "./api";
import { useRobotState } from "./useRobotState";

type Action = "Validate" | "Run" | "Stop" | "Reset";
const format = (value: number | undefined) =>
  value === undefined
    ? "—"
    : new Intl.NumberFormat("en", { maximumFractionDigits: 2 }).format(value);

export function WorkspaceApp() {
  const [source, setSource] = useState(JSON.stringify(sample, null, 2));
  const [tab, setTab] = useState<
    "Code Editor" | "Blockly" | "Digital Twin" | "Control" | "Projects"
  >("Code Editor");
  const [pending, setPending] = useState<Action | null>(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [speed, setSpeed] = useState(100);
  const [adapter, setAdapter] = useState("Mock Robot");
  const [collapsed, setCollapsed] = useState(false);
  const latestRequest = useRef(0);
  const { state, connection } = useRobotState();
  const live = connection === "connected";
  const running = state?.status === "running" || state?.status === "stopping";
  const locked = state?.locked ?? true;

  async function perform(action: Action) {
    const request = ++latestRequest.current;
    const report = (message: string) => {
      if (request === latestRequest.current) setNotice(message);
    };
    setError("");
    setNotice("");
    setPending(action);
    try {
      if (action === "Validate") {
        const result = await post<{ valid: boolean; command_count: number }>(
          "programs/validate",
          parseProgram(source),
        );
        report(`Valid program · ${result.command_count} commands`);
      } else if (action === "Run") {
        await post("runs", parseProgram(source));
        report("Run accepted. Follow live progress below.");
      } else if (action === "Stop" && state?.run_id) {
        await post(`runs/${encodeURIComponent(state.run_id)}/stop`);
        report("Stop request finished. See live run status.");
      } else if (action === "Reset") {
        await post("reset");
        report("Mock reset. Your program is unchanged.");
      }
    } catch (failure) {
      if (request === latestRequest.current)
        setError(failure instanceof Error ? failure.message : "Request failed");
    } finally {
      if (request === latestRequest.current) setPending(null);
    }
  }
  async function toggleLock() {
    try {
      if (locked) {
        if (
          window.confirm(
            "Unlock simulation control? This is simulation control, not physical hardware.",
          )
        )
          await post("safety/unlock", { acknowledgement: true });
      } else await post("safety/lock");
    } catch (failure) {
      setError(
        failure instanceof Error ? failure.message : "Safety request failed",
      );
    }
  }
  async function changeSpeed(value: number) {
    setSpeed(value);
    try {
      await post("safety/speed", { global_speed_percent: value });
    } catch (failure) {
      setError(
        failure instanceof Error ? failure.message : "Speed request failed",
      );
    }
  }

  return (
    <>
      <h2 className="sr-only">Programming</h2>
      <h2 className="sr-only">Digital Twin / Status</h2>
      <h2 className="sr-only">Controls</h2>
      <div className="dx-app">
        <header className="dx-topbar">
          <button
            className="rail-toggle"
            aria-label={collapsed ? "Expand navigation" : "Collapse navigation"}
            onClick={() => setCollapsed(!collapsed)}
          >
            ☰
          </button>
          <div className="dx-brand">
            <span className="dx-mark" aria-hidden="true">
              Δ
            </span>
            <strong>DeltaX</strong>
            <span className="dx-project">
              Pick &amp; Place · <span>{state ? "Saved" : "Draft"}</span>
            </span>
          </div>
          <div className="dx-top-controls">
            <label className="device-select">
              Robot{" "}
              <select
                aria-label="Robot connection"
                value={adapter}
                onChange={(event) => setAdapter(event.target.value)}
              >
                <option>Mock Robot</option>
                <option>RoboDK Digital Twin</option>
                <option>Search Devices</option>
                <option>Manual Connection</option>
                <option disabled>Physical Robot · Future</option>
                <option disabled>Raspberry Pi · Future</option>
              </select>
            </label>
            <span
              className={`dx-status ${live ? "is-live" : ""}`}
              role="status"
            >
              <i />
              {live
                ? "Connected"
                : connection === "connecting"
                  ? "Connecting"
                  : "Disconnected · retrying"}
            </span>
            <button
              className={`lock-button ${locked ? "is-locked" : "is-unlocked"}`}
              aria-pressed={!locked}
              onClick={() => void toggleLock()}
            >
              {locked ? "LOCKED" : "UNLOCKED"}
            </button>
            <label className="speed-control">
              Speed{" "}
              <input
                aria-label="Global speed"
                type="range"
                min="1"
                max="100"
                value={speed}
                onChange={(event) =>
                  void changeSpeed(Number(event.target.value))
                }
              />
              <output>{speed}%</output>
            </label>
            <button
              className="stop-top"
              aria-label="Stop"
              onClick={() => void perform("Stop")}
              disabled={!running || !state?.run_id}
            >
              STOP
            </button>
            <button className="profile-button" aria-label="Profile menu">
              JD
            </button>
          </div>
        </header>
        <div className="dx-body">
          <nav
            className={`dx-rail ${collapsed ? "is-collapsed" : ""}`}
            aria-label="Primary navigation"
          >
            {(
              [
                "Dashboard",
                "Code Editor",
                "Blockly",
                "Digital Twin",
                "Control",
                "Projects",
                "Settings",
              ] as const
            ).map((item) => (
              <button
                key={item}
                className={tab === item ? "is-active" : ""}
                onClick={() =>
                  [
                    "Code Editor",
                    "Blockly",
                    "Digital Twin",
                    "Control",
                    "Projects",
                  ].includes(item) && setTab(item as typeof tab)
                }
                title={collapsed ? item : undefined}
              >
                <span aria-hidden="true">
                  {item === "Code Editor"
                    ? "⌘"
                    : item === "Digital Twin"
                      ? "◉"
                      : item === "Control"
                        ? "＋"
                        : item === "Projects"
                          ? "▤"
                          : item === "Settings"
                            ? "⚙"
                            : "◌"}
                </span>
                <b>{item}</b>
              </button>
            ))}
            <div className="rail-footer">
              SIMULATION ONLY
              <br />
              <strong>v2.0</strong>
            </div>
          </nav>
          <main className="dx-main">
            <div className="dx-heading">
              <div>
                <p className="section-kicker">
                  WORKSPACE / {tab.toUpperCase()}
                </p>
                <h1>
                  {tab === "Digital Twin"
                    ? "Digital Twin"
                    : tab === "Control"
                      ? "Robot Control"
                      : tab === "Blockly"
                        ? "Blockly Program"
                        : "Program Console"}
                </h1>
              </div>
              <div className="save-state">
                <span className="save-dot" />
                Autosaved · 2s ago
              </div>
            </div>
            <div className="dx-grid">
              <section className="work-surface">
                <div className="surface-tabs">
                  <button
                    className={tab === "Code Editor" ? "is-active" : ""}
                    onClick={() => setTab("Code Editor")}
                  >
                    Code Editor
                  </button>
                  <button
                    className={tab === "Blockly" ? "is-active" : ""}
                    onClick={() => setTab("Blockly")}
                  >
                    Blockly
                  </button>
                  <span className="surface-meta">
                    RobotProgramV1 · strict allowlist
                  </span>
                </div>
                {tab === "Blockly" ? (
                  <div
                    className="blockly-canvas"
                    aria-label="Blockly workspace"
                  >
                    <div className="block block-start">START</div>
                    <div className="block block-blue">HOME</div>
                    <div className="block block-orange">
                      MOVE XYZ <small>X 100 · Y 30 · Z -250 mm</small>
                    </div>
                    <div className="block block-blue">GRIP</div>
                    <div className="block block-amber">
                      WAIT <small>0.5 s</small>
                    </div>
                    <div className="block block-blue">RELEASE</div>
                    <p>
                      Blocks compile directly to RobotProgramV1. IDs remain
                      command trace IDs.
                    </p>
                  </div>
                ) : (
                  <>
                    <label className="editor-label" htmlFor="program">
                      RobotProgramV1 JSON
                    </label>
                    <textarea
                      id="program"
                      spellCheck={false}
                      value={source}
                      disabled={!!pending || running}
                      onChange={(event) => {
                        setSource(event.target.value);
                        setNotice("");
                        setError("");
                      }}
                    />
                    <div className="editor-footer">
                      <span>⌘ Format&nbsp;&nbsp;⌘ Validate</span>
                      <span>7 allowlisted commands · Server validated</span>
                    </div>
                  </>
                )}
                <div className="action-strip">
                  <button
                    onClick={() => void perform("Validate")}
                    disabled={!!pending || running}
                  >
                    Validate
                  </button>
                  <button
                    className="primary"
                    disabled={
                      !!pending ||
                      running ||
                      !live ||
                      !state?.connected ||
                      locked ||
                      state.status === "faulted"
                    }
                    onClick={() => void perform("Run")}
                  >
                    Run
                  </button>
                  <button
                    disabled={pending === "Reset" || locked}
                    onClick={() => void perform("Reset")}
                  >
                    Reset
                  </button>
                  <button
                    className="ghost"
                    disabled={!!pending || running}
                    onClick={() => setNotice("Draft saved locally.")}
                  >
                    Save
                  </button>
                </div>
              </section>
              <aside className="inspector">
                <div className="inspector-header">
                  <span>LIVE STATE</span>
                  {!live && state && (
                    <span className="sr-only">
                      Last received state is stale
                    </span>
                  )}
                  <span data-testid="mode" className="sr-only">
                    {state?.mode === "robodk" ? "RoboDK" : "Mock"}
                  </span>
                  <span className={`state-chip ${state?.status ?? "idle"}`}>
                    {state?.status ?? "idle"}
                  </span>
                </div>
                <div className="pose-panel">
                  <div className="pose-title">
                    CARTESIAN POSE <span>mm</span>
                  </div>
                  <div className="pose-grid">
                    <div>
                      <small>X</small>
                      <strong data-testid="pose-x">
                        {format(state?.x_mm)}
                      </strong>
                    </div>
                    <div>
                      <small>Y</small>
                      <strong data-testid="pose-y">
                        {format(state?.y_mm)}
                      </strong>
                    </div>
                    <div>
                      <small>Z</small>
                      <strong data-testid="pose-z">
                        {format(state?.z_mm)}
                      </strong>
                    </div>
                    <div>
                      <small>RZ</small>
                      <strong>{format(state?.rz_deg)}°</strong>
                    </div>
                  </div>
                  <div className="pose-grid joints">
                    <div>
                      <small>J1</small>
                      <strong>{format(state?.joints_deg?.[0])}°</strong>
                    </div>
                    <div>
                      <small>J2</small>
                      <strong>{format(state?.joints_deg?.[1])}°</strong>
                    </div>
                    <div>
                      <small>J3</small>
                      <strong>{format(state?.joints_deg?.[2])}°</strong>
                    </div>
                    <div>
                      <small>GRIP</small>
                      <strong>{state?.gripper ?? "released"}</strong>
                    </div>
                  </div>
                </div>
                <div className="run-panel">
                  <span>ACTIVE COMMAND</span>
                  <strong data-testid="active-command">
                    {state?.active_command_id
                      ? `${state.active_command_id} · ${state.active_command_type}`
                      : "No active command"}
                  </strong>
                  <progress
                    value={state?.completed_commands ?? 0}
                    max={state?.total_commands || 1}
                  />
                  <small>
                    {state?.completed_commands ?? 0} /{" "}
                    {state?.total_commands ?? 0} commands
                  </small>
                </div>
                <div className="safety-note">
                  <span>{locked ? "▣" : "◈"}</span>
                  <div>
                    <strong>
                      {locked ? "Motion locked" : "Simulation control active"}
                    </strong>
                    <small>
                      {locked
                        ? (state?.lock_reason ??
                          "Unlock requires acknowledgement")
                        : "Software Stop remains available"}
                    </small>
                  </div>
                </div>
                {notice && (
                  <p className="notice" role="status">
                    {notice}
                  </p>
                )}
                {error && (
                  <p className="request-error" role="alert">
                    {error}
                  </p>
                )}
              </aside>
            </div>
            <footer className="dx-footer">
              <span>DeltaX / SIMULATION WORKSPACE</span>
              <span>Software Stop is not a physical emergency stop</span>
            </footer>
          </main>
        </div>
      </div>
    </>
  );
}
export default WorkspaceApp;
