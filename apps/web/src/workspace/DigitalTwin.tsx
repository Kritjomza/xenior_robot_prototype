import { lazy, Suspense, useRef } from "react";
import type { RobotState } from "../generated/state";
import type { DeltaRobotSceneHandle } from "./DeltaRobotScene";
const DeltaRobotScene = lazy(() => import("./DeltaRobotScene"));

export function DigitalTwin({ state, live }: { state: RobotState | null; live: boolean }) {
  const sceneRef = useRef<DeltaRobotSceneHandle>(null);
  return <section className="twin-shell" aria-label="Digital Twin Viewer">
    <div className="twin-scene-stage">
      <Suspense fallback={<p>Loading 3D viewer…</p>}><DeltaRobotScene ref={sceneRef} state={state} /></Suspense>
      <span className="twin-mode-label">{!live ? (state ? "Telemetry disconnected · last pose" : "Disconnected · home preview") : state?.mode === "robodk" ? "RoboDK telemetry" : "Simulation · live"}</span>
    </div>
    <div className="twin-toolbar" role="group" aria-label="Digital twin view controls">
      {(["iso", "top", "front", "side"] as const).map(view => <button key={view} onClick={() => sceneRef.current?.setView(view)}>{view === "iso" ? "Isometric" : `${view[0].toUpperCase()}${view.slice(1)} view`}</button>)}
      <button onClick={() => sceneRef.current?.resetView()}>Reset View</button>
      <button onClick={() => sceneRef.current?.fitView()}>Fit View</button>
      <small>{state?.mode === "robodk" ? "Example geometry; RoboDK alignment not calibrated" : "Example geometry · 150 / 400 mm arms"}</small>
    </div>
  </section>;
}

