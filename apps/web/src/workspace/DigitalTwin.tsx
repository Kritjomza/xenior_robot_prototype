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
            ) : <svg viewBox="0 0 390 300" className="twin-svg" aria-label="Illustrative delta robot simulation model">
              <g fill="none" stroke="#303a5b" strokeWidth="1">
                <path d="M195 24 378 129 195 235 12 129Z" /><path d="M195 52 332 129 195 207 58 129Z" />
                <path d="M12 129h366M58 103l274 52M58 155l274-52M195 24v211" />
                <path d="M195 24v-13M12 129l183 106 183-106" />
              </g>
              <g fill="none" stroke="#aab7d4" strokeWidth="2.1" strokeLinejoin="round" strokeLinecap="round">
                <path d="M110 66 195 24 280 66 195 88Z" fill="#273451" />
                <path d="M110 66 195 88 280 66" />
                <path d="M110 66 139 116 183 165M115 68 149 113 190 162" />
                <path d="M280 66 251 116 207 165M275 68 241 113 200 162" />
                <path d="M195 88 188 165M201 88 202 165" />
                <path d="M183 165 195 173 207 165" stroke="#ea792a" />
                <path d="M181 166 195 159 209 166 195 175Z" fill="#bd5e20" stroke="#ea792a" />
              </g>
              <g fill="#d9e0f2" stroke="#95a3c4" strokeWidth="1"><circle cx="110" cy="66" r="5"/><circle cx="280" cy="66" r="5"/><circle cx="139" cy="116" r="4"/><circle cx="251" cy="116" r="4"/></g>
              <g fill="none" stroke="#ea792a" strokeWidth="2"><path d="M190 176v19m10-19v19"/><path d="M179 199a27 8 0 0 0 32 0" strokeDasharray="3 3"/></g>
              <g fill="none" stroke="#b6c3e1" strokeWidth="1.4"><path d="M18 238v-42M18 238h42M18 238l26-20"/></g>
              <text x="58" y="238" fill="#aab7d4" fontSize="9" letterSpacing="2">X / Y / Z</text>
              <text x="212" y="190" fill="#e7792b" fontSize="9">RZ</text>
            </svg>}
            <p className="twin-subtext">
              {state?.mode === "robodk" && state.connected
                ? "Schematic 3D geometry · live RoboDK pose and joints"
                : state?.connected
                  ? "Illustrative simulation model · not hardware geometry"
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
