import { lazy, Suspense, useRef, useState } from "react";
import type { RobotState } from "../generated/state";
import { post } from "../api";
import type { DeltaRobotSceneHandle } from "./DeltaRobotScene";

const DeltaRobotScene = lazy(() => import("./DeltaRobotScene"));

const key = "deltax:twin-panel-width";
export function DigitalTwin({
  state,
  onResetView,
}: {
  state: RobotState | null;
  onResetView?: () => void;
}) {
  const [width, setWidth] = useState(
    () => Number(localStorage.getItem(key)) || 58,
  );
  const sceneRef = useRef<DeltaRobotSceneHandle>(null);
  const [viewError, setViewError] = useState("");
  const change = (value: number) => {
    const safe = Math.min(75, Math.max(35, value));
    setWidth(safe);
    localStorage.setItem(key, String(safe));
  };
  const changeView = async (action: "reset" | "fit" | "show") => {
    try {
      setViewError("");
      if (state?.mode === "robodk" && state.connected) {
        if (action === "reset") sceneRef.current?.resetView();
        if (action === "fit") sceneRef.current?.fitView();
        if (action === "show") await post("twin/view", { action });
      } else if (action === "reset") onResetView?.();
    } catch (error) {
      setViewError(error instanceof Error ? error.message : "RoboDK view unavailable");
    }
  };
  return (
    <section className="twin-shell" aria-label="Digital Twin Viewer">
      <div className="twin-view" style={{ width: `${width}%` }}>
        <div className="twin-placeholder">
          <div className="twin-badge">
            <span className="twin-dot" />
            {state?.mode === "robodk" ? "RoboDK Digital Twin" : "Mock Digital Twin"}
          </div>
          <div className="twin-canvas-preview">
            {state?.mode === "robodk" ? (
              state.connected ? (
                <Suspense fallback={<div className="delta-scene">Loading 3D viewer…</div>}>
                  <DeltaRobotScene ref={sceneRef} state={state} />
                </Suspense>
              ) : <div className="delta-scene delta-scene-offline">RoboDK station unavailable</div>
            ) : <svg viewBox="0 0 200 160" className="twin-svg" aria-hidden="true">
              <circle cx="100" cy="30" r="14" fill="#21366f" stroke="#4e64b2" strokeWidth="2" />
              <line x1="100" y1="44" x2="60" y2="100" stroke="#7eafe8" strokeWidth="3" strokeLinecap="round" />
              <line x1="100" y1="44" x2="100" y2="105" stroke="#7eafe8" strokeWidth="3" strokeLinecap="round" />
              <line x1="100" y1="44" x2="140" y2="100" stroke="#7eafe8" strokeWidth="3" strokeLinecap="round" />
              <polygon points="50,105 150,105 100,120" fill="#21366f" stroke="#f36a2c" strokeWidth="2" />
              <rect x="94" y="120" width="12" height="14" rx="2" fill={state?.gripper === "gripped" ? "#f36a2c" : "#7eafe8"} />
              <circle cx="100" cy="144" r="5" fill={state?.gripper === "gripped" ? "#f36a2c" : "#667085"} />
            </svg>}
            <p className="twin-subtext">
              {state?.mode === "robodk" && state.connected
                ? "Schematic 3D geometry · live RoboDK pose and joints"
                : state?.connected
                  ? "Active telemetry synchronized"
                : "Viewer offline or disconnected"}
            </p>
          </div>
          <div
            className="twin-toolbar"
            role="group"
            aria-label="Digital twin view controls"
          >
            <button type="button" onClick={() => void changeView("reset")}>Reset View</button>
            <button type="button" onClick={() => void changeView("fit")}>Fit View</button>
            <button type="button" onClick={() => void changeView("show")} disabled={state?.mode !== "robodk" || !state.connected}>
              Open RoboDK
            </button>
          </div>
          {viewError && <p role="alert">{viewError}</p>}
        </div>
      </div>
      <input
        aria-label="Resize digital twin panel"
        type="range"
        min="35"
        max="75"
        value={width}
        onChange={(event) => change(Number(event.target.value))}
        onDoubleClick={() => change(58)}
      />
      <aside className="twin-inspector-side">
        <h2>Simulator state</h2>
        <p>
          XYZ {state?.x_mm ?? 0}, {state?.y_mm ?? 0}, {state?.z_mm ?? -200}
        </p>
        <p>J1–J3 {state?.joints_deg?.length ? state.joints_deg.join(", ") : "0, 0, 0"}</p>
        <p>J4 {state?.mode === "robodk" ? "Not installed" : `${state?.rz_deg ?? 0}°`}</p>
        <p>Gripper {state?.mode === "robodk" ? "Not installed" : state?.gripper ?? "released"}</p>
        <p>Speed {state?.speed_mm_s ?? 100} mm/s</p>
        <p>{state?.error ?? "No simulator errors"}</p>
      </aside>
    </section>
  );
}
