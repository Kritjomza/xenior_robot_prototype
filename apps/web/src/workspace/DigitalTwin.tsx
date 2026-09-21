import { useState } from "react";
import type { RobotState } from "../generated/state";

const key = "deltax:twin-panel-width";
export function DigitalTwin({ state }: { state: RobotState | null }) {
  const [width, setWidth] = useState(
    () => Number(localStorage.getItem(key)) || 58,
  );
  const change = (value: number) => {
    const safe = Math.min(75, Math.max(35, value));
    setWidth(safe);
    localStorage.setItem(key, String(safe));
  };
  return (
    <section className="twin-shell">
      <div className="twin-view" style={{ width: `${width}%` }}>
        <div className="twin-placeholder">
          <strong>
            {state?.mode === "robodk"
              ? "RoboDK Local Web View"
              : "Mock Digital Twin"}
          </strong>
          <p>
            {state?.connected
              ? "Simulator connected"
              : "Viewer unavailable or disconnected"}
          </p>
          <div
            className="twin-toolbar"
            role="group"
            aria-label="Digital twin view controls"
          >
            <button>Reset View</button>
            <button>Fit View</button>
            <button onClick={() => window.open("robodk://", "_blank")}>
              Open RoboDK
            </button>
          </div>
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
      <aside>
        <h2>Simulator state</h2>
        <p>
          XYZ {state?.x_mm}, {state?.y_mm}, {state?.z_mm}
        </p>
        <p>J1–J3 {state?.joints_deg?.join(", ")}</p>
        <p>J4 {state?.rz_deg}°</p>
        <p>Gripper {state?.gripper}</p>
        <p>Speed {state?.speed_mm_s} mm/s</p>
        <p>{state?.error ?? "No simulator errors"}</p>
      </aside>
    </section>
  );
}
