import { lazy, Suspense, useRef, useState } from "react";
import type { RobotState } from "../generated/state";
import { post } from "../api";
import type { DeltaRobotSceneHandle } from "./DeltaRobotScene";
const DeltaRobotScene = lazy(() => import("./DeltaRobotScene"));

export function DigitalTwin({ state }: { state: RobotState | null }) {
  const sceneRef = useRef<DeltaRobotSceneHandle>(null);
  const [error, setError] = useState("");
  return <section className="twin-shell" aria-label="Digital Twin Viewer">
    <div className="twin-scene-stage">
      {state ? <Suspense fallback={<p>Loading 3D viewer…</p>}><DeltaRobotScene ref={sceneRef} state={state} /></Suspense> : <p>Waiting for simulator telemetry…</p>}
      <span className="twin-mode-label">Simulation / {state?.mode === "robodk" ? "RoboDK" : "Mock"}</span>
    </div>
    <div className="twin-toolbar" role="group" aria-label="Digital twin view controls">
      <button onClick={() => sceneRef.current?.resetView()}>Reset View</button>
      <button onClick={() => sceneRef.current?.fitView()}>Fit View</button>
      <button disabled={state?.mode !== "robodk" || !state?.connected} onClick={() => void post("twin/view", { action: "show" }).catch(failure => setError(String(failure)))}>Open RoboDK</button>
      <small>Schematic geometry</small>
    </div>
    {error && <p role="alert">{error}</p>}
  </section>;
}
